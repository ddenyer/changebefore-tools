// Facilitator: load session + all submissions (progress now, reveal later).
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_PASSWORD = 'Admin1*';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { code, adminPassword } = req.body || {};
  if (adminPassword !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Not authorised' });
  if (!code) return res.status(400).json({ error: 'code required' });
  const C = String(code).replace(/[^A-Za-z0-9]/g,'').toUpperCase();

  try {
    const sr = await fetch(`${SUPABASE_URL}/rest/v1/collab_sessions?session_code=eq.${C}&select=*`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    });
    const sessions = await sr.json();
    if (!Array.isArray(sessions) || sessions.length === 0) return res.status(200).json({ ok: false, reason: 'not_found' });

    const subr = await fetch(`${SUPABASE_URL}/rest/v1/collab_submissions?session_code=eq.${C}&select=*`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    });
    const subs = await subr.json();
    return res.status(200).json({ ok: true, session: sessions[0], submissions: Array.isArray(subs) ? subs : [] });
  } catch (err) {
    console.error('collab-progress error:', err);
    return res.status(500).json({ error: err.message });
  }
}
