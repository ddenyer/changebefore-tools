// Vercel serverless function: code repertory-grid constructs into the
// researcher's composite constructs (content-analysis categories), following
// Jankowicz's (2004) categorisation method. Anthropic key stays server-side.
//
// POST { constructs:[{id,left,right}], categories:[{id,name,left,leftDef,right,rightDef}] }
//  -> { assignments:[{id, cat, flip}] }
//
// flip = true when the construct's FIRST (left) pole corresponds to the
// category's OPPOSITE pole rather than its preferred pole.

const KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = 'claude-sonnet-4-20250514';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

  const { constructs, categories } = req.body || {};
  if (!Array.isArray(constructs) || !constructs.length) return res.status(400).json({ error: 'constructs required' });
  if (!Array.isArray(categories) || !categories.length) return res.status(400).json({ error: 'categories required' });

  const catList = categories.map(c =>
    `${c.id} = ${c.name}\n   PREFERRED POLE (${c.left}): ${(c.leftDef || '').slice(0, 700)}\n   OPPOSITE POLE (${c.right}): ${(c.rightDef || '').slice(0, 700)}`
  ).join('\n\n');

  const conList = constructs.map(c => `${c.id} :: "${c.left}" versus "${c.right}"`).join('\n');

  const prompt = `You are coding repertory-grid constructs into content-analysis categories, following Jankowicz's (2004) core-categorisation method as applied in a DBA thesis on NHS system leadership. You are acting as an experienced second coder.

CATEGORIES (id = name, with the definition of each pole):

${catList}

TASK — assign EVERY construct below to exactly one category id.

Rules:
- Judge on MEANING against the pole definitions, not surface wording.
- Set "flip": false when the construct's FIRST pole matches the category's PREFERRED pole; true when the construct's FIRST pole matches the category's OPPOSITE pole.
- Use the category named "Other" only if a construct genuinely fits none of the substantive categories.
- Every construct id must appear exactly once in your answer.
- Return STRICT JSON only, no prose, no markdown fences:
{"assignments":[{"id":"<construct id>","cat":"<category id>","flip":false}]}

CONSTRUCTS:
${conList}`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, max_tokens: 8000, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!r.ok) {
      const t = await r.text();
      console.error('anthropic non-OK:', r.status, t.slice(0, 300));
      return res.status(502).json({ error: `anthropic ${r.status}` });
    }
    const j = await r.json();
    let txt = (j.content && j.content[0] && j.content[0].text) || '';
    const m = txt.match(/\{[\s\S]*\}/);
    if (m) txt = m[0];
    let parsed;
    try { parsed = JSON.parse(txt); }
    catch (e) { return res.status(502).json({ error: 'could not parse model JSON' }); }
    return res.status(200).json({ assignments: parsed.assignments || [] });
  } catch (err) {
    console.error('rep-grid-classify error:', err);
    return res.status(500).json({ error: err.message });
  }
}
