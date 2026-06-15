// Facilitator creates a workshop session. Returns a 6-char join code.
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_PASSWORD = 'Admin1*';

function makeCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1 — matches security-fix standard
  let c = '';
  for (let i = 0; i < 8; i++) c += alphabet[Math.floor(Math.random() * alphabet.length)];
  return c; // ~31^8 ≈ 10^12 search space; displayed as XXXX-XXXX, stored raw
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { systemName, adminPassword } = req.body || {};
  if (adminPassword !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Not authorised' });
  if (!systemName || !systemName.trim()) return res.status(400).json({ error: 'systemName required' });

  try {
    // try a few times in case of a code collision on the PK
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = makeCode();
      const r = await fetch(`${SUPABASE_URL}/rest/v1/collab_sessions`, {
        method: 'POST',
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify({ session_code: code, system_name: systemName.trim() }),
      });
      if (r.ok) {
        const rows = await r.json();
        return res.status(200).json({ ok: true, code, session: rows[0] });
      }
      if (r.status !== 409) {
        const txt = await r.text();
        return res.status(500).json({ error: 'create failed', detail: txt });
      }
      // 409 = code collision, loop and retry with a new code
    }
    return res.status(500).json({ error: 'could not allocate a unique code' });
  } catch (err) {
    console.error('collab-session-create error:', err);
    return res.status(500).json({ error: err.message });
  }
}
