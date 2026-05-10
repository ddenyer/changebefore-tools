// /api/resilience-join-and-send.js
//
// End-of-tool "Join ChangeBefore" flow for Resilience-Is.
// Mirrors api/join-and-send.js (STAT) but writes to ri_responses, not
// session_participants. Kept separate so STAT and Resilience-Is can evolve
// independently.
//
// What this endpoint does:
//   1. Calls WordPress to create or recognise the member
//   2. Sends welcome email with PDF attached via Resend
//   3. If opted in: adds to Resend "General" audience
//   4. Updates Supabase: records email + mp_user_id on the participant's row
//
// Returns: { ok, existing_member, user_id, email_sent, audience_added, supabase_linked }

const RESEND_GENERAL_AUDIENCE_ID = '4b25af78-a088-4e47-b887-a7e73e0a5bf0';

// NOTE: Replace this with the actual MemberPress membership ID for the
// Resilience-Is tool once it's configured in WordPress. For v1 you can
// reuse an existing free membership (e.g. stat-solo's 101951) until a
// dedicated one is set up.
const MEMBERSHIP_ID_RESILIENCE_IS = parseInt(process.env.MP_MEMBERSHIP_ID_RESILIENCE_IS || '101951', 10);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body || {};
  // Accept both snake_case (what the new tool sends) and camelCase (STAT pattern)
  const email      = body.email;
  const firstName  = body.firstName || body.first_name;
  const lastName   = body.lastName  || body.last_name || '';
  const role       = body.role || null;
  const optedIn    = body.optedIn !== undefined ? body.optedIn : body.marketing_opt_in;
  const password   = body.password;
  const sessionCode  = body.sessionCode  || body.session_code;
  const participantId = body.participantId || body.participant_id;
  const participantNumber = body.participantNumber || body.participant_number || null;
  const pdfBase64  = body.pdfBase64 || body.pdf_base64;

  if (!email || typeof email !== 'string') return res.status(400).json({ error: 'email required' });
  if (!firstName) return res.status(400).json({ error: 'firstName required' });
  if (!sessionCode) return res.status(400).json({ error: 'session_code required' });
  if (!participantId) return res.status(400).json({ error: 'participant_id required' });
  if (!pdfBase64) return res.status(400).json({ error: 'pdf_base64 required' });

  const wpUser      = process.env.WP_APP_USER;
  const wpPass      = process.env.WP_APP_PASSWORD;
  const resendKey   = process.env.RESEND_API_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;
  if (!wpUser || !wpPass || !resendKey || !supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'env vars not configured' });
  }

  const result = {
    ok: false,
    existing_member: null,
    user_id: null,
    email_sent: false,
    audience_added: false,
    supabase_linked: false,
  };

  try {
    // Generate a strong random password if the client didn't send one
    let effectivePassword = (typeof password === 'string' && password.length >= 12) ? password : '';
    if (!effectivePassword) {
      const bytes = new Uint8Array(24);
      (globalThis.crypto || require('crypto').webcrypto).getRandomValues(bytes);
      effectivePassword = Buffer.from(bytes).toString('base64').replace(/[^A-Za-z0-9]/g, '').slice(0, 32);
      while (effectivePassword.length < 16) {
        effectivePassword += Math.random().toString(36).slice(2, 10);
      }
      effectivePassword = effectivePassword.slice(0, 32);
    }

    // === Step 1: WP member creation ===
    const wpAuth = Buffer.from(`${wpUser}:${wpPass}`).toString('base64');
    const wpResponse = await fetch(
      'https://changebefore.com/wp-json/changebefore/v1/create-or-recognise-member',
      {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${wpAuth}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          password: effectivePassword,
          first_name: firstName,
          last_name: lastName,
          opted_in: optedIn === true,
          membership_id: MEMBERSHIP_ID_RESILIENCE_IS,
        }),
      }
    );

    const wpData = await wpResponse.json();
    if (!wpResponse.ok || !wpData.success) {
      console.error('WP member creation error:', wpResponse.status, wpData);
      return res.status(wpResponse.status).json({
        ok: false,
        error: wpData.error || 'wp_member_creation_failed',
      });
    }

    result.existing_member = wpData.existing_member;
    result.user_id = wpData.user_id;

    // === Step 2: Send welcome email ===
    const isExisting = wpData.existing_member;
    const subject = isExisting
      ? `Welcome back to ChangeBefore — your Resilience reveal`
      : `Welcome to ChangeBefore — your Resilience reveal`;

    const html = `<p>Hi ${firstName},</p>
      <p>${isExisting ? 'Welcome back to' : 'Welcome to'} ChangeBefore. Your Resilience reveal is attached.</p>
      <p>You can log in any time using your email at <a href="https://changebefore.com/login/">changebefore.com/login</a>.</p>
      <p>Nothing frequent, nothing pushy — you can unsubscribe from emails at any time.</p>
      <p>— David Denyer<br/><em>The diagnosis is the work of change</em></p>`;

    const pdfFilename = `ChangeBefore-resilience-is-results.pdf`;

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'ChangeBefore <noreply@changebefore.com>',
        to: [email],
        subject,
        html,
        attachments: [{ filename: pdfFilename, content: pdfBase64 }],
      }),
    });

    if (resendResponse.ok) {
      result.email_sent = true;
    } else {
      const errText = await resendResponse.text();
      console.error('Resend email error:', resendResponse.status, errText);
    }

    // === Step 3: Resend audience opt-in ===
    if (optedIn === true) {
      const audienceResponse = await fetch('https://api.resend.com/contacts', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          first_name: firstName,
          last_name: lastName,
          unsubscribed: false,
          audience_id: RESEND_GENERAL_AUDIENCE_ID,
        }),
      });
      if (audienceResponse.ok) {
        result.audience_added = true;
      } else {
        const errText = await audienceResponse.text();
        if (audienceResponse.status === 422) {
          result.audience_added = true;
        } else {
          console.error('Resend audience add error:', audienceResponse.status, errText);
        }
      }
    }

    // === Step 4: Patch the ri_responses row with email + mp_user_id ===
    const patchResp = await fetch(
      `${supabaseUrl}/rest/v1/ri_responses?session_code=eq.${encodeURIComponent(sessionCode)}&participant_id=eq.${encodeURIComponent(participantId)}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({
          respondent_name: `${firstName} ${lastName}`.trim(),
          email,
          role,
          marketing_opt_in: optedIn === true,
          join_path: true,
          completed: true,
          updated: new Date().toISOString(),
        }),
      }
    );

    if (patchResp.ok) {
      result.supabase_linked = true;
    } else {
      const errText = await patchResp.text();
      console.error('Supabase ri_responses patch error:', patchResp.status, errText);
    }

    result.ok = true;
    return res.status(200).json(result);
  } catch (err) {
    console.error('resilience-join-and-send error:', err);
    return res.status(500).json({ ok: false, error: err.message, partial: result });
  }
}
