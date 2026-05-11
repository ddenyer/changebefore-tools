// Endpoint 6 — orchestrates the end-of-tool "Join ChangeBefore" flow.
//
// What the front-end has already done:
//   - Generated the PDF client-side via jsPDF
//   - Validated the form (name, email, password, opt-in, privacy)
//   - PDF is base64-encoded for transit
//
// What this endpoint does:
//   1. Calls our custom WordPress endpoint to create or recognise the member
//   2. Sends welcome email with PDF attached via Resend
//   3. If opted in: adds user to Resend "General" audience
//   4. Updates Supabase: links participant_id → mp_user_id for cross-tool recognition
//
// Returns: { ok, existing_member, user_id, email_sent, audience_added, supabase_linked }

const RESEND_GENERAL_AUDIENCE_ID = '4b25af78-a088-4e47-b887-a7e73e0a5bf0';

const MEMBERSHIP_IDS = {
  'stat-group': 101903, // STAT-Group Access
  'stat-solo':  101951, // STAT-Solo Access
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    email,
    password,
    firstName,
    lastName,
    organisation,
    optedIn,
    tool,            // 'stat-group' or 'stat-solo'
    sessionCode,
    participantId,   // uuid from session_participants.id
    pdfBase64,       // base64-encoded PDF (without data: prefix)
  } = req.body || {};

  // === Validate inputs ===
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'email required' });
  }
  if (!firstName || !lastName) {
    return res.status(400).json({ error: 'firstName and lastName required' });
  }
  if (!tool || !MEMBERSHIP_IDS[tool]) {
    return res.status(400).json({ error: 'tool must be stat-group or stat-solo' });
  }
  if (!sessionCode || typeof sessionCode !== 'string') {
    return res.status(400).json({ error: 'sessionCode required' });
  }
  if (!participantId || typeof participantId !== 'string') {
    return res.status(400).json({ error: 'participantId required' });
  }
  if (!pdfBase64 || typeof pdfBase64 !== 'string') {
    return res.status(400).json({ error: 'pdfBase64 required' });
  }

  // === Env vars ===
  const wpUser     = process.env.WP_APP_USER;
  const wpPass     = process.env.WP_APP_PASSWORD;
  const resendKey  = process.env.RESEND_API_KEY;
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
    // === Step 1: Create or recognise member in WordPress ===
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
          password: password || '',
          first_name: firstName,
          last_name: lastName,
          organisation: organisation || '',
          opted_in: optedIn === true,
          membership_id: MEMBERSHIP_IDS[tool],
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

    // === Step 2: Send welcome email with PDF attached ===
    const isExisting = wpData.existing_member;
    const subject = isExisting
      ? `Welcome back to ChangeBefore — your ${tool === 'stat-group' ? 'STAT-Group' : 'STAT-Solo'} results`
      : `Welcome to ChangeBefore — your ${tool === 'stat-group' ? 'STAT-Group' : 'STAT-Solo'} results`;

    const html = isExisting
      ? `<p>Hi ${firstName},</p>
         <p>Welcome back to ChangeBefore. Your personalised report is attached.</p>
         <p>You can log in any time using your email and password at <a href="https://changebefore.com/login/">changebefore.com/login</a>.</p>
         <p>You can unsubscribe from emails at any time.</p>
         <p>— David</p>`
      : `<p>Hi ${firstName},</p>
         <p>Welcome to ChangeBefore. Your personalised report is attached.</p>
         <p>You can log in any time using your email and password at <a href="https://changebefore.com/login/">changebefore.com/login</a>.</p>
         <p>You can unsubscribe from emails at any time.</p>
         <p>— David</p>`;

    const pdfFilename = `ChangeBefore-${tool}-results.pdf`;

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
        attachments: [{
          filename: pdfFilename,
          content: pdfBase64,
        }],
      }),
    });

    if (resendResponse.ok) {
      result.email_sent = true;
    } else {
      const errText = await resendResponse.text();
      console.error('Resend email error:', resendResponse.status, errText);
      // Don't fail the whole request — PDF still opens client-side
    }

    // === Step 3: Add to Resend audience (only if opted in) ===
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
        // Resend returns 422 if contact already exists — treat as success
        if (audienceResponse.status === 422) {
          result.audience_added = true;
        } else {
          console.error('Resend audience add error:', audienceResponse.status, errText);
        }
      }
    }

    // === Step 4: Link participant to MP user in Supabase ===
    const supabasePatch = await fetch(
      `${supabaseUrl}/rest/v1/session_participants?id=eq.${encodeURIComponent(participantId)}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({
          name: `${firstName} ${lastName}`.trim(),
          email,
          mp_user_id: String(wpData.user_id),
          completed_at: new Date().toISOString(),
        }),
      }
    );

    if (supabasePatch.ok) {
      result.supabase_linked = true;
    } else {
      const errText = await supabasePatch.text();
      console.error('Supabase participant link error:', supabasePatch.status, errText);
    }

    result.ok = true;
    return res.status(200).json(result);
  } catch (err) {
    console.error('join-and-send handler error:', err);
    return res.status(500).json({ ok: false, error: err.message, partial: result });
  }
}
