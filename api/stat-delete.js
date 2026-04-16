export default async function handler(req, res) {
  if (req.method !== 'DELETE') return res.status(405).json({error:'Method not allowed'});
  const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vxovyhzqzlvjvntjnzej.supabase.co';
  const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
  if (!SUPABASE_KEY) return res.status(500).json({error:'Supabase key not configured'});
  const { session_code, respondent_name } = req.body;
  if (!session_code || !respondent_name) return res.status(400).json({error:'Missing session_code or respondent_name'});
  try {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/stat_responses?session_code=eq.${encodeURIComponent(session_code)}&respondent_name=eq.${encodeURIComponent(respondent_name)}`,
      {
        method: 'DELETE',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Prefer': 'return=minimal'
        }
      }
    );
    if (!resp.ok) {
      const err = await resp.text();
      return res.status(500).json({error: err});
    }
    return res.status(200).json({ok:true});
  } catch(e) {
    return res.status(500).json({error:e.message});
  }
}
