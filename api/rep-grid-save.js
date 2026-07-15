// Vercel serverless function: save rep-grid config or a response.
// POST { kind: 'config',   session_code, data }
// POST { kind: 'response', session_code, participant_id, participant_name, data }
// GET-then-PATCH-or-POST (never Prefer: merge-duplicates — see building reference).

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vxovyhzqzlvjvntjnzej.supabase.co';
const ANON = process.env.SUPABASE_ANON_KEY;

function sbHeaders(extra) {
  return Object.assign(
    {
      apikey: ANON,
      Authorization: `Bearer ${ANON}`,
      'Content-Type': 'application/json',
    },
    extra || {}
  );
}

async function rowExists(table, filter) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}&select=id`, {
    headers: sbHeaders(),
  });
  if (!r.ok) throw new Error(`${table} lookup failed: ${r.status}`);
  const rows = await r.json();
  return rows.length > 0;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!ANON) return res.status(500).json({ error: 'SUPABASE_ANON_KEY not configured' });

  const { kind, session_code } = req.body || {};
  if (!kind || !session_code) {
    return res.status(400).json({ error: 'kind and session_code required' });
  }

  try {
    if (kind === 'config') {
      const { data } = req.body;
      const filter = `session_code=eq.${encodeURIComponent(session_code)}`;
      // rep_grid_configs has session_code as PK (no id column) — check existence differently.
      const check = await fetch(
        `${SUPABASE_URL}/rest/v1/rep_grid_configs?${filter}&select=session_code`,
        { headers: sbHeaders() }
      );
      const exists = (await check.json()).length > 0;
      const body = JSON.stringify({ data, updated_at: new Date().toISOString() });

      const r = exists
        ? await fetch(`${SUPABASE_URL}/rest/v1/rep_grid_configs?${filter}`, {
            method: 'PATCH',
            headers: sbHeaders({ Prefer: 'return=minimal' }),
            body,
          })
        : await fetch(`${SUPABASE_URL}/rest/v1/rep_grid_configs`, {
            method: 'POST',
            headers: sbHeaders({ Prefer: 'return=minimal' }),
            body: JSON.stringify({
              session_code,
              data,
              updated_at: new Date().toISOString(),
            }),
          });
      if (!r.ok) throw new Error(`config save failed: ${r.status} ${await r.text()}`);
      return res.status(200).json({ ok: true });
    }

    if (kind === 'response') {
      const { participant_id, participant_name, data } = req.body;
      if (!participant_id) return res.status(400).json({ error: 'participant_id required' });
      const filter =
        `session_code=eq.${encodeURIComponent(session_code)}` +
        `&participant_id=eq.${encodeURIComponent(participant_id)}`;
      const exists = await rowExists('rep_grid_responses', filter);
      const payload = {
        session_code,
        participant_id,
        participant_name: participant_name || '',
        data,
        updated_at: new Date().toISOString(),
      };

      const r = exists
        ? await fetch(`${SUPABASE_URL}/rest/v1/rep_grid_responses?${filter}`, {
            method: 'PATCH',
            headers: sbHeaders({ Prefer: 'return=minimal' }),
            body: JSON.stringify({
              participant_name: payload.participant_name,
              data,
              updated_at: payload.updated_at,
            }),
          })
        : await fetch(`${SUPABASE_URL}/rest/v1/rep_grid_responses`, {
            method: 'POST',
            headers: sbHeaders({ Prefer: 'return=minimal' }),
            body: JSON.stringify(payload),
          });
      if (!r.ok) throw new Error(`response save failed: ${r.status} ${await r.text()}`);
      return res.status(200).json({ ok: true });
    }

    if (kind === 'delete-response') {
      const { participant_id } = req.body;
      if (!participant_id) return res.status(400).json({ error: 'participant_id required' });
      const filter =
        `session_code=eq.${encodeURIComponent(session_code)}` +
        `&participant_id=eq.${encodeURIComponent(participant_id)}`;
      const r = await fetch(`${SUPABASE_URL}/rest/v1/rep_grid_responses?${filter}`, {
        method: 'DELETE',
        headers: sbHeaders({ Prefer: 'return=minimal' }),
      });
      if (!r.ok) throw new Error(`delete failed: ${r.status} ${await r.text()}`);
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: `unknown kind: ${kind}` });
  } catch (err) {
    console.error('rep-grid-save error:', err);
    return res.status(500).json({ error: err.message });
  }
}
