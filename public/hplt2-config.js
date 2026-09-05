// v2-only endpoint for the Ahamo HPLT tool's client-logo feature.
// Reads and writes session_configs.client_logo for a given session code.
// Kept separate from the shared validate-code / save-session-config endpoints so
// that v1 (ahamo-hplt) is never touched. The client_logo column is additive:
//   ALTER TABLE session_configs ADD COLUMN IF NOT EXISTS client_logo text;
//
// POST { sessionCode, action:'get' }                 -> { ok, clientLogo }
// POST { sessionCode, action:'set', clientLogo }     -> { ok }   (empty string clears it)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vxovyhzqzlvjvntjnzej.supabase.co';
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_KEY) return res.status(500).json({ error: 'Supabase key not configured' });

  const body = req.body || {};
  const action = body.action;
  const sessionCode = (body.sessionCode || '').toString().trim();
  if (!sessionCode) return res.status(400).json({ error: 'Missing sessionCode' });

  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json'
  };
  const codeFilter = `session_code=eq.${encodeURIComponent(sessionCode)}`;

  try {
    if (action === 'get') {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/session_configs?${codeFilter}&select=client_logo&limit=1`,
        { headers }
      );
      if (!r.ok) {
        const t = await r.text();
        return res.status(500).json({ error: `Lookup failed: ${t}` });
      }
      const rows = await r.json();
      const clientLogo = (Array.isArray(rows) && rows[0] && rows[0].client_logo) ? rows[0].client_logo : '';
      return res.status(200).json({ ok: true, clientLogo });
    }

    if (action === 'set') {
      let clientLogo = body.clientLogo;
      if (typeof clientLogo !== 'string') clientLogo = '';
      // Guard against oversized payloads reaching the database.
      if (clientLogo.length > 400000) {
        return res.status(413).json({ error: 'Logo too large' });
      }
      // Only accept image data URLs (or empty to clear).
      if (clientLogo && !/^data:image\/(png|jpeg|jpg);base64,/i.test(clientLogo)) {
        return res.status(400).json({ error: 'Invalid image data' });
      }
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/session_configs?${codeFilter}`,
        {
          method: 'PATCH',
          headers: { ...headers, 'Prefer': 'return=minimal' },
          body: JSON.stringify({ client_logo: clientLogo || null })
        }
      );
      if (!r.ok) {
        const t = await r.text();
        return res.status(500).json({ error: `Save failed: ${t}` });
      }
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
