// Vercel serverless function: DERIVE composite constructs (content-analysis
// categories) from a raw set of elicited constructs — encoding the method used
// in the reference DBA thesis (Jankowicz 2004 core categorisation / Honey 1979).
//
// This is the generalisable engine: point it at ANY study's constructs and it
// proposes the categories the way a trained second coder would, bootstrapped
// from the constructs themselves rather than from a prior framework.
//
// POST { constructs:[{left,right}], target?:number, domain?:string }
//  -> { categories:[{name,left,leftDef,right,rightDef}] }

const KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = 'claude-sonnet-4-20250514';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

  const { constructs, target, domain } = req.body || {};
  if (!Array.isArray(constructs) || !constructs.length) return res.status(400).json({ error: 'constructs required' });

  const n = Math.min(Math.max(Number(target) || 14, 6), 20);
  // Cap the sample so the prompt stays well inside context.
  const sample = constructs.slice(0, 900).map(c => `"${c.left}" versus "${c.right}"`).join('\n');

  const prompt = `You are an experienced qualitative researcher performing CORE CATEGORISATION on repertory-grid constructs, following Jankowicz's (2004) seven-step method as used with Honey's (1979) content analysis.

METHOD YOU MUST FOLLOW (this is the logic to reproduce):
1. Work BOTTOM-UP ("bootstrapped"): categories must emerge from the constructs themselves. Do NOT impose an existing competency framework or published model.
2. Read all constructs. Group them by shared MEANING, not shared wording.
3. Each category is BIPOLAR: it has a preferred pole and an opposing pole. Both poles get a definition written in the language of the participants, describing an observable pattern of behaviour (2–4 sentences each).
4. Name each category with a short noun/adjective label (e.g. "Enabling", "System-focused", "Bottom-up").
5. Merge categories that are conceptually similar or overlapping; split any category that is doing two jobs.
6. Then review: DISCARD categories that are underpopulated (supported by only a couple of constructs) by folding them into a better fit.
7. Aim for about ${n} substantive categories, ordered by how many constructs they capture (most frequent first), PLUS a final catch-all category named exactly "Other" for constructs that genuinely fit nowhere.
8. Orient every category so the PREFERRED pole is the one associated with EFFECTIVE leadership, and the OPPOSITE pole is the ineffective/contrasting one.

${domain ? 'DOMAIN CONTEXT: ' + domain + '\n' : ''}
CONSTRUCTS (${constructs.length} total${constructs.length > 900 ? ', first 900 shown' : ''}):
${sample}

Return STRICT JSON only — no prose, no markdown fences:
{"categories":[{"name":"...","left":"<preferred pole label>","leftDef":"<definition>","right":"<opposite pole label>","rightDef":"<definition>"}]}`;

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
    return res.status(200).json({ categories: parsed.categories || [] });
  } catch (err) {
    console.error('rep-grid-derive error:', err);
    return res.status(500).json({ error: err.message });
  }
}
