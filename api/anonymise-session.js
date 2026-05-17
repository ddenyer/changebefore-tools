// Triggered when a Solo user indicates they're done with the tool.
// Calls Supabase RPC `anonymise_solo_session` which:
//   - Deletes opt-out participants and their stat_responses entirely
//   - For everyone else: NULLs name/email/mp_user_id on session_participants,
//     NULLs the wipe-list fields on stat_responses (respondent_name, thing,
//     feedback_comment, plus deprecated columns), and sets anonymised_at.
//
// Used for STAT-Solo. Group sessions anonymise via the daily cron.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { sessionCode } = req.body || {};
  if (!sessionCode || typeof sessionCode !== 'string') {
    return res.status(400).json({ error: 'sessionCode required' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }

  try {
    const r = await fetch(`${supabaseUrl}/rest/v1/rpc/anonymise_solo_session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({ p_session_code: sessionCode }),
    });

    if (!r.ok) {
      const errText = await r.text();
      console.error('anonymise_solo_session RPC error:', r.status, errText);
      return res.status(r.status).json({ error: errText });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('anonymise-session handler error:', err);
    return res.status(500).json({ error: err.message });
  }
}
