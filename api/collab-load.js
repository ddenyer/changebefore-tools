// Resume: fetch a group's in-progress submission.
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { code, fn } = req.body || {};
  if (!code || !fn) return res.status(400).json({ error: 'code and fn required' });
  const C = String(code).replace(/[^A-Za-z0-9]/g,'').toUpperCase();

  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/collab_submissions?session_code=eq.${C}&function=eq.${fn}&select=*`,
      { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
    );
    const rows = await r.json();
    if (!Array.isArray(rows) || rows.length === 0) return res.status(200).json({ ok: false });
    return res.status(200).json({ ok: true, submission: rows[0] });
  } catch (err) {
    console.error('collab-load error:', err);
    return res.status(500).json({ error: err.message });
  }
}
