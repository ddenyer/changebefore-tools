// /api/resilience-assign-participant.js
//
// Assigns the next sequential participant number for a Resilience-Is session.
//
// Strategy: SELECT MAX(number) for the session, then INSERT a shell row with
// number = max+1 and a fresh UUID. The shell row is harmless if the
// participant abandons; the autosave from /api/resilience-save will fill in
// the rest.
//
// There's a small race window between SELECT and INSERT — fine for workshop
// scale (rarely more than 20 simultaneous joiners). If we ever need true
// race-safety we'd add a Postgres RPC with SELECT FOR UPDATE; for now this is
// good enough.
//
// Body: { session_code: "IMI0426" }
// Response: { participant_uuid: "...", number: 3 }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }

  const { session_code } = req.body || {};
  if (!session_code) return res.status(400).json({ error: 'session_code required' });

  const headers = {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
  };

  try {
    // Find the current max number for this session
    const lookupResp = await fetch(
      `${SUPABASE_URL}/rest/v1/ri_responses?session_code=eq.${encodeURIComponent(session_code)}&select=number&order=number.desc&limit=1`,
      { headers }
    );
    if (!lookupResp.ok) {
      const t = await lookupResp.text();
      return res.status(lookupResp.status).json({ error: 'lookup failed: ' + t });
    }
    const rows = await lookupResp.json();
    const maxNumber = (rows.length > 0 && typeof rows[0].number === 'number') ? rows[0].number : 0;
    const nextNumber = maxNumber + 1;

    const participant_uuid = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
          const r = Math.random() * 16 | 0;
          const v = c === 'x' ? r : (r & 0x3 | 0x8);
          return v.toString(16);
        });

    // Insert the shell row
    const insertResp = await fetch(`${SUPABASE_URL}/rest/v1/ri_responses`, {
      method: 'POST',
      headers: { ...headers, 'Prefer': 'return=representation' },
      body: JSON.stringify({
        session_code,
        participant_id: participant_uuid,
        number: nextNumber,
        step: 1,
      }),
    });
    if (!insertResp.ok) {
      const t = await insertResp.text();
      return res.status(insertResp.status).json({ error: 'insert failed: ' + t });
    }

    return res.status(200).json({ participant_uuid, number: nextNumber });
  } catch (err) {
    console.error('resilience-assign-participant error:', err);
    return res.status(500).json({ error: err.message });
  }
}
