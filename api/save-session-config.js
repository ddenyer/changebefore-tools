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
    thingType,
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

  // Build the payload from ONLY the fields actually present in req.body.
  // CRITICAL: never include `closed_at: null` or `scheduled_anonymisation_at: null`
  // unless the caller explicitly meant to clear them — otherwise updating a
  // session config (e.g. fixing a typo) would un-close the session and
  // erase the anonymisation schedule.
  const payload = { session_code: sessionCode, tool };
  if (typeof thingMode !== 'undefined') payload.thing_mode = thingMode || null;
  if (typeof thingForEveryone !== 'undefined') payload.thing_for_everyone = thingForEveryone || null;
  if (typeof thingPlaceholder !== 'undefined') payload.thing_placeholder = thingPlaceholder || null;
  if (typeof thingType !== 'undefined') payload.thing_type = thingType || null;
  if (typeof orgSize !== 'undefined') payload.org_size = orgSize || null;
  if (typeof sector !== 'undefined') payload.sector = sector || null;
  if (typeof facilitatorNotes !== 'undefined') payload.facilitator_notes = facilitatorNotes || null;
  if (typeof closedAt !== 'undefined') payload.closed_at = closedAt || null;
  if (typeof scheduledAnonymisationAt !== 'undefined') payload.scheduled_anonymisation_at = scheduledAnonymisationAt || null;

  // session_code is unique. We can't rely on Supabase REST's
  // `Prefer: resolution=merge-duplicates` upsert — it's flaky and inserts
  // sometimes hit the unique constraint. Instead: fetch the row, decide PATCH
  // vs POST, do that.
  try {
    const checkResp = await fetch(
      `${supabaseUrl}/rest/v1/session_configs?session_code=eq.${encodeURIComponent(sessionCode)}&select=id&limit=1`,
      { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` } }
    );
    if (!checkResp.ok) {
      const errText = await checkResp.text();
      console.error('session_configs check error:', checkResp.status, errText);
      return res.status(checkResp.status).json({ error: errText });
    }
    const existing = await checkResp.json();
    const exists = Array.isArray(existing) && existing.length > 0;

    let r;
    if (exists) {
      // PATCH: update by session_code. Drop session_code from payload (unique key).
      const patchBody = { ...payload };
      delete patchBody.session_code;
      r = await fetch(
        `${supabaseUrl}/rest/v1/session_configs?session_code=eq.${encodeURIComponent(sessionCode)}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Prefer': 'return=representation',
          },
          body: JSON.stringify(patchBody),
        }
      );
    } else {
      // INSERT
      r = await fetch(`${supabaseUrl}/rest/v1/session_configs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Prefer': 'return=representation',
        },
        body: JSON.stringify(payload),
      });
    }

    if (!r.ok) {
      const errText = await r.text();
      console.error('session_configs write error:', r.status, errText);
      return res.status(r.status).json({ error: errText });
    }

    const data = await r.json();
    return res.status(200).json({ ok: true, sessionConfig: Array.isArray(data) ? data[0] : data });
  } catch (err) {
    console.error('save-session-config handler error:', err);
    return res.status(500).json({ error: err.message });
  }
}
