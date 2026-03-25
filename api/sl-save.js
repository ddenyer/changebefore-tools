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
    // Fetch existing record
    const fetchRes = await fetch(
      `${supabaseUrl}/rest/v1/sl_participants?session_id=eq.${encodeURIComponent(sessionId)}&participant_name=eq.${encodeURIComponent(participantName)}&select=data`,
      { headers }
    );

    if (!fetchRes.ok) {
      const err = await fetchRes.text();
      return res.status(fetchRes.status).json({ error: err });
    }

    const rows = await fetchRes.json();
    const exists = rows.length > 0;
    let mergedData = { ...data };

    if (exists && rows[0].data) {
      const existing = rows[0].data;
      // If already wiped and incoming is NOT a wipe — refuse silently
      if (existing._wiped && !data._wiped) {
        return res.status(200).json({ ok: true, skipped: 'record is wiped' });
      }
      // Deep merge: existing + incoming
      mergedData = { ...existing, ...data };
    }

    const payload = {
      data: mergedData,
      updated_at: new Date().toISOString(),
    };

    let writeRes;

    if (exists) {
      // UPDATE existing record via PATCH
      writeRes = await fetch(
        `${supabaseUrl}/rest/v1/sl_participants?session_id=eq.${encodeURIComponent(sessionId)}&participant_name=eq.${encodeURIComponent(participantName)}`,
        {
          method: 'PATCH',
          headers: { ...headers, 'Prefer': 'return=minimal' },
          body: JSON.stringify(payload),
        }
      );
    } else {
      // INSERT new record
      writeRes = await fetch(`${supabaseUrl}/rest/v1/sl_participants`, {
        method: 'POST',
        headers: { ...headers, 'Prefer': 'return=minimal' },
        body: JSON.stringify({
          session_id: sessionId,
          participant_name: participantName,
          ...payload,
        }),
      });
    }

    if (!writeRes.ok) {
      const err = await writeRes.text();
      return res.status(writeRes.status).json({ error: err });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
