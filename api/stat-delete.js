// stat-delete.js — delete a single stat_responses row by either respondent_name
// or participant_id (or both). Used by the dashboard's "Remove from session" flow
// and by the close/reopen-session flow (which deletes the marker rows).
//
// Anonymous-aware (May 2026): if the row has no respondent_name, the front-end
// sends participant_id. If both are present, both are used in the WHERE clause
// (an AND match). Sending neither is rejected.

export default async function handler(req, res) {
  if (req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' });

  const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vxovyhzqzlvjvntjnzej.supabase.co';
  const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
  if (!SUPABASE_KEY) return res.status(500).json({ error: 'Supabase key not configured' });

  const body = req.body || {};
  const { session_code, respondent_name, participant_id } = body;

  if (!session_code || typeof session_code !== 'string') {
    return res.status(400).json({ error: 'Missing session_code' });
  }

  // At least one identifier must be supplied. Empty string for respondent_name
  // is INSUFFICIENT (would match all anonymous rows).
  const hasName = typeof respondent_name === 'string' && respondent_name.trim().length > 0;
  const hasId = typeof participant_id === 'string' && participant_id.trim().length > 0;
  // Special case: marker rows (__session_closed__, __facilitator__) — match by name only.
  const isMarker = hasName && (respondent_name === '__session_closed__' || respondent_name === '__facilitator__');

  if (!hasName && !hasId) {
    return res.status(400).json({ error: 'Must supply respondent_name or participant_id' });
  }

  // Build the WHERE clause. Use AND of all supplied identifiers so we never
  // delete more than the intended row.
  const filters = [`session_code=eq.${encodeURIComponent(session_code)}`];
  if (isMarker) {
    // Marker rows are keyed by name alone
    filters.push(`respondent_name=eq.${encodeURIComponent(respondent_name)}`);
  } else {
    if (hasId) filters.push(`participant_id=eq.${encodeURIComponent(participant_id)}`);
    if (hasName) filters.push(`respondent_name=eq.${encodeURIComponent(respondent_name)}`);
  }
  const url = `${SUPABASE_URL}/rest/v1/stat_responses?${filters.join('&')}`;

  try {
    const r = await fetch(url, {
      method: 'DELETE',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Prefer': 'return=representation',
      },
    });
    if (!r.ok) {
      const errText = await r.text();
      console.error('stat-delete failed:', r.status, errText);
      return res.status(r.status).json({ error: errText });
    }
    let deleted = [];
    try { deleted = await r.json(); } catch { deleted = []; }
    return res.status(200).json({ ok: true, deleted_count: Array.isArray(deleted) ? deleted.length : 0 });
  } catch (e) {
    console.error('stat-delete handler error:', e);
    return res.status(500).json({ error: e.message });
  }
}
