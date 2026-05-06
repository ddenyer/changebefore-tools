// Assigns the next sequential participant number for a session.
// Calls Supabase RPC `assign_next_participant` which is race-safe.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { sessionCode } = req.body || {};
  if (!sessionCode || typeof sessionCode !== 'string') {
    return res.status(400).json({ error: 'sessionCode required' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }

  try {
    const r = await fetch(`${supabaseUrl}/rest/v1/rpc/assign_next_participant`, {
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
      console.error('assign_next_participant RPC error:', r.status, errText);
      return res.status(r.status).json({ error: errText });
    }

    const data = await r.json();
    // Supabase returns RPC results as an array; we expect exactly one row
    const row = Array.isArray(data) ? data[0] : data;
    return res.status(200).json({
      id: row.id,
      participantNumber: row.participant_number,
      participantId: row.participant_id_padded,
    });
  } catch (err) {
    console.error('assign-participant handler error:', err);
    return res.status(500).json({ error: err.message });
  }
}
