// Save-as-you-go. PATCH the group's submission row by (session_code, function).
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ALLOWED = ['priorities', 'needs', 'collaboration', 'trust', 'submitted'];

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { code, fn, patch } = req.body || {};
  if (!code || !fn || !patch) return res.status(400).json({ error: 'code, fn, patch required' });
  const C = String(code).replace(/[^A-Za-z0-9]/g,'').toUpperCase();

  const body = { updated_at: new Date().toISOString() };
  for (const k of ALLOWED) if (k in patch) body[k] = patch[k];

  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/collab_submissions?session_code=eq.${C}&function=eq.${fn}`,
      {
        method: 'PATCH',
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify(body),
      }
    );
    if (!r.ok) {
      const txt = await r.text();
      return res.status(500).json({ error: 'save failed', detail: txt });
    }
    const rows = await r.json();
    return res.status(200).json({ ok: true, submission: rows[0] });
  } catch (err) {
    console.error('collab-save error:', err);
    return res.status(500).json({ error: err.message });
  }
}
