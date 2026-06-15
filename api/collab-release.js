// Release a function claim, freeing the unique(session_code, function) slot.
// Two callers:
//   • Participant "release-on-change": no adminPassword. Deletes the row ONLY if not yet submitted,
//     so a participant can never wipe a group that has already submitted.
//   • Facilitator "reset a function": adminPassword required. Deletes the row regardless.
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_PASSWORD = 'Admin1*';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { code, fn, adminPassword } = req.body || {};
  if (!code || !fn) return res.status(400).json({ error: 'code and fn required' });
  const C = String(code).replace(/[^A-Za-z0-9]/g, '').toUpperCase();

  const isFacilitator = adminPassword !== undefined && adminPassword !== null && adminPassword !== '';
  if (isFacilitator && adminPassword !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Not authorised' });
  }

  // Facilitator may delete any row; participant only their own un-submitted claim.
  let url = `${SUPABASE_URL}/rest/v1/collab_submissions?session_code=eq.${C}&function=eq.${fn}`;
  if (!isFacilitator) url += `&submitted=eq.false`;

  try {
    const r = await fetch(url, {
      method: 'DELETE',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        Prefer: 'return=representation',
      },
    });
    if (!r.ok) {
      const txt = await r.text();
      return res.status(500).json({ error: 'release failed', detail: txt });
    }
    const rows = await r.json();
    return res.status(200).json({ ok: true, released: fn, removed: Array.isArray(rows) ? rows.length : 0 });
  } catch (err) {
    console.error('collab-release error:', err);
    return res.status(500).json({ error: err.message });
  }
}
