// Receives user feedback from any ChangeBefore tool, emails it to feedback@changebefore.com,
// and (if a session row exists) patches the participant's Supabase row with the comment.
// Designed to be reusable across STAT Group, STAT Solo, and future tools.

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const RESEND_KEY = process.env.RESEND_API_KEY;
  const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vxovyhzqzlvjvntjnzej.supabase.co';
  const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

  const body = req.body || {};
  const toolLabel = (typeof body.tool_label === 'string' && body.tool_label.trim()) ? body.tool_label.trim() : 'Tool';
  const sessionCode = (typeof body.session_code === 'string') ? body.session_code.trim() : '';
  const respondentName = (typeof body.respondent_name === 'string') ? body.respondent_name.trim() : '';
  const comment = (typeof body.comment === 'string') ? body.comment.trim() : '';

  if (!comment) return res.status(400).json({ error: 'Empty feedback' });
  if (comment.length > 4000) return res.status(400).json({ error: 'Feedback too long' });

  // Persist to Supabase if we can identify the row (session_code + respondent_name).
  // Best-effort — if it fails (no row, network issue) we still try to send the email.
  if (SUPABASE_KEY && sessionCode && respondentName) {
    try {
      await fetch(
        `${SUPABASE_URL}/rest/v1/stat_responses?session_code=eq.${encodeURIComponent(sessionCode)}&respondent_name=eq.${encodeURIComponent(respondentName)}`,
        {
          method: 'PATCH',
          headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify({ feedback_comment: comment }),
        }
      );
    } catch (e) {
      console.warn('feedback patch error:', e);
    }
  }

  // Email the feedback to the dedicated feedback mailbox.
  if (!RESEND_KEY) {
    // No email service configured — DB write may have succeeded; still return ok so the UI confirms.
    return res.status(200).json({ ok: true, emailed: false });
  }

  try {
    const esc = (s) => String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    const date = new Date().toLocaleDateString('en-GB');
    const subjParts = [toolLabel + ' feedback'];
    if (respondentName) subjParts.push(respondentName);
    subjParts.push(date);
    const subject = subjParts.join(' — ');

    const html = `<div style="font-family:Helvetica,Arial,sans-serif;color:#1a1a1a;max-width:640px;">
      <h2 style="margin:0 0 4px 0;font-size:18px;">${esc(toolLabel)} — feedback</h2>
      <p style="margin:0 0 16px 0;color:#888;font-size:12px;">
        ${respondentName ? esc(respondentName) : 'Anonymous'}${sessionCode ? ' · session ' + esc(sessionCode) : ''} · ${date}
      </p>
      <div style="background:#fff8f5;border-left:3px solid #e07030;padding:.85rem 1.1rem;border-radius:0 3px 3px 0;font-size:13px;line-height:1.6;white-space:pre-wrap;">${esc(comment)}</div>
    </div>`;

    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'noreply@changebefore.com',
        to: ['feedback@changebefore.com'],
        subject,
        html,
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.warn('feedback email send failed:', resp.status, errText);
      return res.status(200).json({ ok: true, emailed: false });
    }

    return res.status(200).json({ ok: true, emailed: true });
  } catch (e) {
    console.error('send-feedback error:', e);
    return res.status(200).json({ ok: true, emailed: false });
  }
}
