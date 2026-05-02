export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({error:'Method not allowed'});
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) return res.status(500).json({error:'Anthropic key not configured'});
  const { sessionCode, respondents, thing } = req.body;
  if (!respondents || respondents.length < 2) return res.status(400).json({error:'Need at least 2 respondents'});
  const th = thing || 'the organisation';
  const n = respondents.length;
  const mean = (k) => Math.round(respondents.reduce((s,r)=>s+(r[k]||0),0)/n);
  const gM = {prog:mean('prog'),def:mean('def'),con:mean('con'),flex:mean('flex')};
  const st = [...new Set(respondents.map(r=>{const p=r.prog||60,d=r.def||60,c=r.con||60,f=r.flex||60;let m=Math.max(p,d,c,f)-Math.min(p,d,c,f);return m<15?'Neutral':(p>d?'Progressive':'Defensive')+' + '+(f>c?'Flexible':'Consistent');}))].join(', ');
  const prompt = `You are an expert STAT facilitator. Group of ${n} from ${th}. Mean: P${gM.prog} D${gM.def} C${gM.con} F${gM.flex}. Strategies: ${st}.\nGenerate 5 open facilitation questions for the group debrief. Respond ONLY with JSON array of 5 strings.`;
  try{const resp = await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'x-api-key':ANTHROPIC_KEY,'anthropic-version':'2023-06-01','Content-Type':'application/json'},body:JSON.stringify({model:'claude-haiku-4-5-20251001',max_tokens:600,messages:[{role:'user',content:prompt}]})});const data=await resp.json();const text=data.content?.[0]?.text||'[]';return res.status(200).json({questions:JSON.parse(text.replace(/```json|```/g,'').trim())});}catch(e){return res.status(500).json({error:e.message});}}
