export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vxovyhzqzlvjvntjnzej.supabase.co';
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_KEY) return res.status(500).json({ error: 'Supabase key not configured' });

  const body = req.body || {};
  const { session_code, respondent_name, participant_id } = body;
  if (!session_code) return res.status(400).json({ error: 'Missing session_code' });
  if (!respondent_name && !participant_id) {
    return res.status(400).json({ error: 'Missing participant_id or respondent_name' });
  }

  // Markers (__facilitator__, __session_closed__) use respondent_name as the key;
  // real participants key on the anonymous participant_id (assigned on Begin).
  const isMarker = respondent_name === '__session_closed__' || respondent_name === '__facilitator__';
  const useParticipantKey = !isMarker && !!participant_id;

  // Detect a closed session — late submissions land in a pending-review queue.
  let sessionIsClosed = false;
  if (!isMarker) {
    try {
      const closedCheck = await fetch(
        `${SUPABASE_URL}/rest/v1/hplt_responses?session_code=eq.${encodeURIComponent(session_code)}&respondent_name=eq.__session_closed__&select=id`,
        { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
      );
      if (closedCheck.ok) {
        const rows = await closedCheck.json();
        if (Array.isArray(rows) && rows.length > 0) sessionIsClosed = true;
      }
    } catch (e) { /* fall through and write normally */ }
  }

  // HPLT column allowlist — anything else in the body is ignored.
  const allowed = ['session_code', 'participant_id', 'respondent_name', 'track', 'role',
    'item_scores', 'overall_score', 'open_1', 'open_2', 'open_3',
    'pending_review', 'notes'];
  const safeBody = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)));
  if (sessionIsClosed && !isMarker) safeBody.pending_review = true;

  const lookupQuery = useParticipantKey
    ? `participant_id=eq.${encodeURIComponent(participant_id)}`
    : `respondent_name=eq.${encodeURIComponent(respondent_name)}`;

  try {
    const getResp = await fetch(
      `${SUPABASE_URL}/rest/v1/hplt_responses?session_code=eq.${encodeURIComponent(session_code)}&${lookupQuery}&select=id`,
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
    );
    if (!getResp.ok) {
      const t = await getResp.text();
      console.error('hplt-save GET failed:', getResp.status, t);
      return res.status(500).json({ error: `GET failed: ${t}` });
    }
    const existing = await getResp.json();

    let writeResp;
    if (existing && existing.length > 0) {
      writeResp = await fetch(
        `${SUPABASE_URL}/rest/v1/hplt_responses?session_code=eq.${encodeURIComponent(session_code)}&${lookupQuery}`,
        {
          method: 'PATCH',
          headers: {
            'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json', 'Prefer': 'return=minimal'
          },
          body: JSON.stringify(safeBody),
        }
      );
    } else {
      writeResp = await fetch(`${SUPABASE_URL}/rest/v1/hplt_responses`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json', 'Prefer': 'return=minimal'
        },
        body: JSON.stringify(safeBody),
      });
    }

    if (!writeResp.ok) {
      const t = await writeResp.text();
      console.error('hplt-save write failed:', writeResp.status, t);
      return res.status(500).json({ error: `Write failed: ${t}` });
    }

    return res.status(200).json({ ok: true, pending_review: !!(sessionIsClosed && !isMarker) });
  } catch (e) {
    console.error('hplt-save error:', e);
    return res.status(500).json({ error: e.message });
  }
}
