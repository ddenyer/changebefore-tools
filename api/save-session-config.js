// Creates or updates a session_configs row for a facilitator-led session.
// Used when a facilitator sets up STAT-Group with their config choices.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    sessionCode,
    tool,
    thingMode,
    thingForEveryone,
    thingPlaceholder,
    orgSize,
    sector,
    facilitatorNotes,
    closedAt,
    scheduledAnonymisationAt,
  } = req.body || {};

  if (!sessionCode || typeof sessionCode !== 'string') {
    return res.status(400).json({ error: 'sessionCode required' });
  }
  if (!tool || (tool !== 'stat-group' && tool !== 'stat-solo')) {
    return res.status(400).json({ error: 'tool must be stat-group or stat-solo' });
  }
  if (thingMode && !['same_for_everyone', 'each_names_own'].includes(thingMode)) {
    return res.status(400).json({ error: 'invalid thingMode' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }

  // Upsert based on session_code (which is UNIQUE)
  const payload = {
    session_code: sessionCode,
    tool,
    thing_mode: thingMode || null,
    thing_for_everyone: thingForEveryone || null,
    thing_placeholder: thingPlaceholder || null,
    org_size: orgSize || null,
    sector: sector || null,
    facilitator_notes: facilitatorNotes || null,
    closed_at: closedAt || null,
    scheduled_anonymisation_at: scheduledAnonymisationAt || null,
  };

  try {
    const r = await fetch(`${supabaseUrl}/rest/v1/session_configs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Prefer': 'resolution=merge-duplicates,return=representation',
      },
      body: JSON.stringify(payload),
    });

    if (!r.ok) {
      const errText = await r.text();
      console.error('session_configs upsert error:', r.status, errText);
      return res.status(r.status).json({ error: errText });
    }

    const data = await r.json();
    return res.status(200).json({ ok: true, sessionConfig: Array.isArray(data) ? data[0] : data });
  } catch (err) {
    console.error('save-session-config handler error:', err);
    return res.status(500).json({ error: err.message });
  }
}
