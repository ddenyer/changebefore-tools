// Vercel serverless function: load a rep-grid session (config + all responses).
// POST { session_code } -> { config, responses }
// Uses SUPABASE_URL / SUPABASE_ANON_KEY from Vercel env (same as other tools).

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vxovyhzqzlvjvntjnzej.supabase.co';
const ANON = process.env.SUPABASE_ANON_KEY;

function sbHeaders() {
  return {
    apikey: ANON,
    Authorization: `Bearer ${ANON}`,
    'Content-Type': 'application/json',
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const { session_code } = req.body || {};
  if (!session_code) return res.status(400).json({ error: 'session_code required' });
  if (!ANON) return res.status(500).json({ error: 'SUPABASE_ANON_KEY not configured' });

  const code = encodeURIComponent(session_code);

  try {
    const [cfgRes, respRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/rep_grid_configs?session_code=eq.${code}&select=*`, {
        headers: sbHeaders(),
      }),
      fetch(
        `${SUPABASE_URL}/rest/v1/rep_grid_responses?session_code=eq.${code}&select=*&order=updated_at.asc`,
        { headers: sbHeaders() }
      ),
    ]);

    if (!cfgRes.ok) throw new Error(`config load failed: ${cfgRes.status}`);
    if (!respRes.ok) throw new Error(`responses load failed: ${respRes.status}`);

    const cfgRows = await cfgRes.json();
    const responses = await respRes.json();

    return res.status(200).json({
      config: cfgRows[0] || null,
      responses: responses || [],
    });
  } catch (err) {
    console.error('rep-grid-load error:', err);
    return res.status(500).json({ error: err.message });
  }
}
