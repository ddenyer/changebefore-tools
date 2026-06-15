// Participant claims a function for their group. Unique constraint enforces first-come lock-out.
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { code, fn } = req.body || {};
  if (!code || !fn) return res.status(400).json({ error: 'code and fn required' });
  const C = String(code).replace(/[^A-Za-z0-9]/g,'').toUpperCase();

  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/collab_submissions`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({ session_code: C, function: fn }),
    });
    if (r.ok) {
      const rows = await r.json();
      return res.status(200).json({ ok: true, submission: rows[0] });
    }
    if (r.status === 409) {
      return res.status(200).json({ ok: false, taken: true });
    }
    const txt = await r.text();
    return res.status(500).json({ error: 'claim failed', detail: txt });
  } catch (err) {
    console.error('collab-claim error:', err);
    return res.status(500).json({ error: err.message });
  }
}
