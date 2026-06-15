// Participant enters a session code. Returns system name + already-claimed functions (for lock-out).
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { code } = req.body || {};
  if (!code) return res.status(400).json({ error: 'code required' });
  const C = String(code).replace(/[^A-Za-z0-9]/g,'').toUpperCase();

  try {
    const sr = await fetch(`${SUPABASE_URL}/rest/v1/collab_sessions?session_code=eq.${C}&select=*`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    });
    const sessions = await sr.json();
    if (!Array.isArray(sessions) || sessions.length === 0) {
      return res.status(200).json({ ok: false, reason: 'not_found' });
    }
    const s = sessions[0];
    if (s.status === 'closed' || (s.expires_at && new Date(s.expires_at) < new Date())) {
      return res.status(200).json({ ok: false, reason: 'closed' });
    }
    const subr = await fetch(`${SUPABASE_URL}/rest/v1/collab_submissions?session_code=eq.${C}&select=function`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    });
    const subs = await subr.json();
    const claimed = (Array.isArray(subs) ? subs : []).map((x) => x.function);
    return res.status(200).json({ ok: true, code: C, systemName: s.system_name, status: s.status, claimed });
  } catch (err) {
    console.error('collab-session-validate error:', err);
    return res.status(500).json({ error: err.message });
  }
}
