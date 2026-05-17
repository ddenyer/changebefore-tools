// Handles a STAT-Group submission that arrives AFTER closed_at on the session_config.
// The front-end is expected to detect lateness client-side (by checking session_configs.closed_at)
// and explicitly route here rather than to the main save path.
//
// What this endpoint does:
//   1. Validates the session exists and is genuinely closed (server-side double-check)
//   2. Marks the participant row with submitted_after_close = true
//   3. Inserts the stat_responses row as normal
//
// Late submissions still count and still flow into benchmarking after anonymisation.
// The flag lets facilitators see who submitted late in the dashboard.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    sessionCode,
    participantId,        // uuid from session_participants.id
    role,
    thing,                // free-text "what they're assessing"
    asIs,                 // {prog, def, con, flex}
    tobe,                 // {prog, def, con, flex}
    s1Answers,            // jsonb
    s2Answers,            // jsonb
    selectedPrinciples,   // jsonb (optional)
  } = req.body || {};

  if (!sessionCode || typeof sessionCode !== 'string') {
    return res.status(400).json({ error: 'sessionCode required' });
  }
  if (!participantId || typeof participantId !== 'string') {
    return res.status(400).json({ error: 'participantId required' });
  }
  if (!asIs || typeof asIs !== 'object' ||
      typeof asIs.prog !== 'number' || typeof asIs.def !== 'number' ||
      typeof asIs.con !== 'number' || typeof asIs.flex !== 'number') {
    return res.status(400).json({ error: 'asIs must be {prog, def, con, flex} as numbers' });
  }
  if (!tobe || typeof tobe !== 'object' ||
      typeof tobe.prog !== 'number' || typeof tobe.def !== 'number' ||
      typeof tobe.con !== 'number' || typeof tobe.flex !== 'number') {
    return res.status(400).json({ error: 'tobe must be {prog, def, con, flex} as numbers' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }

  const headers = {
    'Content-Type': 'application/json',
    'apikey': supabaseKey,
    'Authorization': `Bearer ${supabaseKey}`,
  };

  try {
    // 1. Server-side double-check: confirm the session is actually closed.
    //    Front-end said it was late, but trust-but-verify.
    const sessionLookup = await fetch(
      `${supabaseUrl}/rest/v1/session_configs?session_code=eq.${encodeURIComponent(sessionCode)}&select=closed_at,anonymised_at`,
      { headers }
    );

    if (!sessionLookup.ok) {
      const errText = await sessionLookup.text();
      console.error('session_configs lookup error:', sessionLookup.status, errText);
      return res.status(sessionLookup.status).json({ error: errText });
    }

    const sessionRows = await sessionLookup.json();
    if (!Array.isArray(sessionRows) || sessionRows.length === 0) {
      return res.status(404).json({ error: 'session not found' });
    }

    const sessionRow = sessionRows[0];

    if (sessionRow.anonymised_at) {
      // Session already anonymised — too late even for late submission
      return res.status(410).json({
        error: 'session_anonymised',
        message: 'This session has been anonymised. Late submissions are no longer accepted.',
      });
    }

    if (!sessionRow.closed_at) {
      // Session isn't actually closed — front-end mistakenly routed here.
      // Don't accept the late-submission flag; tell client to use normal save path.
      return res.status(409).json({
        error: 'session_not_closed',
        message: 'Session is still open. Use the normal submission path.',
      });
    }

    // 2. Mark the participant as having submitted after close.
    //    Use PATCH to update the existing row created by assign-participant.
    const participantUpdate = await fetch(
      `${supabaseUrl}/rest/v1/session_participants?id=eq.${encodeURIComponent(participantId)}`,
      {
        method: 'PATCH',
        headers: { ...headers, 'Prefer': 'return=minimal' },
        body: JSON.stringify({
          submitted_after_close: true,
          completed_at: new Date().toISOString(),
        }),
      }
    );

    if (!participantUpdate.ok) {
      const errText = await participantUpdate.text();
      console.error('session_participants PATCH error:', participantUpdate.status, errText);
      return res.status(participantUpdate.status).json({ error: errText });
    }

    // 3. Insert the stat_responses row.
    const statResponseInsert = await fetch(`${supabaseUrl}/rest/v1/stat_responses`, {
      method: 'POST',
      headers: { ...headers, 'Prefer': 'return=minimal' },
      body: JSON.stringify({
        session_code: sessionCode,
        participant_id: participantId,
        role: role || null,
        thing: thing || null,
        prog: asIs.prog,
        def: asIs.def,
        con: asIs.con,
        flex: asIs.flex,
        tobe_prog: tobe.prog,
        tobe_def: tobe.def,
        tobe_con: tobe.con,
        tobe_flex: tobe.flex,
        s1_answers: s1Answers || null,
        s2_answers: s2Answers || null,
        selected_principles: selectedPrinciples || null,
      }),
    });

    if (!statResponseInsert.ok) {
      const errText = await statResponseInsert.text();
      console.error('stat_responses insert error:', statResponseInsert.status, errText);
      return res.status(statResponseInsert.status).json({ error: errText });
    }

    return res.status(200).json({
      ok: true,
      flagged_as_late: true,
      message: 'Submission received and flagged as late. Your facilitator will see this in the dashboard.',
    });
  } catch (err) {
    console.error('late-submission handler error:', err);
    return res.status(500).json({ error: err.message });
  }
}
