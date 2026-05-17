export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  // Prevent all caching so sync always gets fresh data
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) return res.status(500).json({ error: 'Supabase not configured' });

  const { sessionId } = req.query;
  if (!sessionId) return res.status(400).json({ error: 'sessionId required' });

  try {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/sl_participants?session_id=eq.${encodeURIComponent(sessionId)}&order=updated_at.asc`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        },
      }
    );

    if (!response.ok) {
      const err = await response.text();
      return res.status(response.status).json({ error: err });
    }

    const rows = await response.json();
    const participants = rows.map(r => ({ ...r.data, name: r.participant_name }));
    return res.status(200).json({ participants });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
