// Removes a single participant row from an HPLT session.
// Called by the facilitator dashboard when someone submits twice or messes up.
// Deletes by row id, scoped to session_code (defence in depth). Markers
// (__facilitator__ / __session_closed__) are never surfaced for deletion by
// the dashboard, and this endpoint refuses to delete them even if asked.

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vxovyhzqzlvjvntjnzej.supabase.co';
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_KEY) return res.status(500).json({ error: 'Supabase key not configured' });

  const body = (req.method === 'POST' ? req.body : req.query) || {};
  const { session_code, id } = body;
  if (!session_code) return res.status(400).json({ error: 'Missing session_code' });
  if (!id) return res.status(400).json({ error: 'Missing id' });

  try {
    // Confirm the target row exists, belongs to this session, and is not a marker.
    const check = await fetch(
      `${SUPABASE_URL}/rest/v1/hplt_responses?id=eq.${encodeURIComponent(id)}&session_code=eq.${encodeURIComponent(session_code)}&select=id,respondent_name`,
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
    );
    if (!check.ok) {
      const t = await check.text();
      return res.status(500).json({ error: `Lookup failed: ${t}` });
    }
    const rows = await check.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(404).json({ error: 'Row not found in this session' });
    }
    const name = rows[0].respondent_name;
    if (name === '__facilitator__' || name === '__session_closed__') {
      return res.status(403).json({ error: 'Cannot delete a session marker row' });
    }

    const del = await fetch(
      `${SUPABASE_URL}/rest/v1/hplt_responses?id=eq.${encodeURIComponent(id)}&session_code=eq.${encodeURIComponent(session_code)}`,
      {
        method: 'DELETE',
        headers: {
          'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Prefer': 'return=minimal'
        }
      }
    );
    if (!del.ok) {
      const t = await del.text();
      return res.status(500).json({ error: `Delete failed: ${t}` });
    }
    return res.status(200).json({ ok: true, id });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
