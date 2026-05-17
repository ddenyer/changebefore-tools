// /api/resilience-load.js
//
// Load all participants for a session. Used by the wall view.
//
// GET /api/resilience-load?session_code=IMI0426
//
// Returns: { participants: [ { number, words, selected, forced_pick,
//   primary_quadrant, first_word_quadrant, centre_of_gravity, completed,
//   updated } ] }
//
// Email and respondent_name are intentionally NOT returned — wall view is
// projected publicly and must never expose personal data.

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }

  const session_code = (req.query.session_code || '').toString();
  if (!session_code) return res.status(400).json({ error: 'session_code required' });

  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
  };

  // Note the explicit select — email and respondent_name are excluded.
  const cols = 'number,role,words,selected,forced_pick,primary_quadrant,first_word_quadrant,centre_of_gravity,subject,step,completed,started,updated';

  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/ri_responses?session_code=eq.${encodeURIComponent(session_code)}&select=${cols}&order=number.asc`,
      { headers }
    );
    if (!r.ok) {
      const t = await r.text();
      return res.status(r.status).json({ error: 'load failed: ' + t });
    }
    const participants = await r.json();
    return res.status(200).json({ participants });
  } catch (err) {
    console.error('resilience-load error:', err);
    return res.status(500).json({ error: err.message });
  }
}
