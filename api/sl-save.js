
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return res.status(500).json({ error: 'Supabase not configured' });

  const { sessionId, participantName, data } = req.body;
  if (!sessionId || !participantName) return res.status(400).json({ error: 'sessionId and participantName required' });

  const headers = {
    'Content-Type': 'application/json',
    'apikey': supabaseKey,
    'Authorization': `Bearer ${supabaseKey}`,
  };

  try {
    // Step 1: Fetch existing record for this participant
    const fetchRes = await fetch(
      `${supabaseUrl}/rest/v1/sl_participants?session_id=eq.${encodeURIComponent(sessionId)}&participant_name=eq.${encodeURIComponent(participantName)}&select=data`,
      { headers }
    );

    let mergedData = { ...data };
    if (fetchRes.ok) {
      const rows = await fetchRes.json();
      if (rows.length > 0 && rows[0].data) {
        // Deep merge: existing record + incoming update
        mergedData = { ...rows[0].data, ...data };
      }
    }

    // Step 2: Upsert the merged record
    const upsertRes = await fetch(`${supabaseUrl}/rest/v1/sl_participants`, {
      method: 'POST',
      headers: {
        ...headers,
        'Prefer': 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({
        session_id: sessionId,
        participant_name: participantName,
        data: mergedData,
        updated_at: new Date().toISOString(),
      }),
    });

    if (!upsertRes.ok) {
      const err = await upsertRes.text();
      return res.status(upsertRes.status).json({ error: err });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
