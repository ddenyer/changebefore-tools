export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({error:'Method not allowed'});
  const { code } = req.query;
  if (!code) return res.status(400).json({error:'Missing code'});
  const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vxovyhzqzlvjvntjnzej.supabase.co';
  const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
  if (!SUPABASE_KEY) return res.status(500).json({error:'Supabase key not configured'});
  try {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/stat_responses?session_code=eq.${encodeURIComponent(code)}&select=*&order=created_at.asc`,
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
    );
    const data = await resp.json();
    res.setHeader('Cache-Control','no-store, no-cache, must-revalidate, max-age=0');
    res.setHeader('Pragma','no-cache');
    return res.status(200).json(data);
  } catch(e) {
    return res.status(500).json({error:e.message});
  }
}
