// /api/resilience-save.js
//
// Save (upsert) a participant's progress for the Resilience-Is tool.
// Browser autosaves on every change. Idempotent: matches existing row by
// (session_code, participant_id) and updates, or inserts a new row.
//
// Body:
//   session_code        (required)
//   participant_id      (required — UUID assigned by /api/resilience-assign-participant)
//   respondent_name     optional
//   role                optional
//   number              optional (sequential participant number)
//   subject             optional
//   words               array of { word, ts } — order matters (first word = first reflex)
//   selected            array of normalised words ticked from the stall list
//   forced_pick         optional string
//   primary_quadrant    optional — classification of forced_pick
//   first_word_quadrant optional — classification of words[0]
//   centre_of_gravity   optional — quadrant with most words (or null if tie)
//   step                int — current step (for resume)
//   completed           boolean
//
// Replaces the broken merge-duplicates pattern with explicit GET-then-PATCH-or-INSERT
// per the team's standing rule.

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }

  const body = req.body || {};
  const {
    session_code, participant_id,
    respondent_name = null, role = null, number = null, subject = null,
    words = [], selected = [], forced_pick = null,
    primary_quadrant = null, first_word_quadrant = null, centre_of_gravity = null,
    step = 1, completed = false,
  } = body;

  if (!session_code) return res.status(400).json({ error: 'session_code required' });
  if (!participant_id) return res.status(400).json({ error: 'participant_id required' });

  const headers = {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
  };

  const lookup = `session_code=eq.${encodeURIComponent(session_code)}&participant_id=eq.${encodeURIComponent(participant_id)}`;

  try {
    // 1. Check for existing row
    const getResp = await fetch(
      `${SUPABASE_URL}/rest/v1/ri_responses?${lookup}&select=id`,
      { headers }
    );
    if (!getResp.ok) {
      const t = await getResp.text();
      return res.status(getResp.status).json({ error: 'lookup failed: ' + t });
    }
    const existing = await getResp.json();

    const payload = {
      session_code,
      participant_id,
      respondent_name,
      role,
      number,
      subject,
      words,
      selected,
      forced_pick,
      primary_quadrant,
      first_word_quadrant,
      centre_of_gravity,
      step,
      completed,
      updated: new Date().toISOString(),
    };

    if (Array.isArray(existing) && existing.length > 0) {
      // 2a. PATCH the existing row
      const patchResp = await fetch(
        `${SUPABASE_URL}/rest/v1/ri_responses?${lookup}`,
        {
          method: 'PATCH',
          headers: { ...headers, 'Prefer': 'return=representation' },
          body: JSON.stringify(payload),
        }
      );
      if (!patchResp.ok) {
        const t = await patchResp.text();
        return res.status(patchResp.status).json({ error: 'patch failed: ' + t });
      }
      const updated = await patchResp.json();
      return res.status(200).json({ ok: true, action: 'updated', row: updated[0] || null });
    } else {
      // 2b. INSERT a new row
      const insertResp = await fetch(
        `${SUPABASE_URL}/rest/v1/ri_responses`,
        {
          method: 'POST',
          headers: { ...headers, 'Prefer': 'return=representation' },
          body: JSON.stringify(payload),
        }
      );
      if (!insertResp.ok) {
        const t = await insertResp.text();
        return res.status(insertResp.status).json({ error: 'insert failed: ' + t });
      }
      const inserted = await insertResp.json();
      return res.status(200).json({ ok: true, action: 'inserted', row: inserted[0] || null });
    }
  } catch (err) {
    console.error('resilience-save error:', err);
    return res.status(500).json({ error: err.message });
  }
}
