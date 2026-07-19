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
// Model confirmed in production use by stat-ai-questions.js. Override via env.
const MODEL = process.env.REPGRID_MODEL || 'claude-haiku-4-5-20251001';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

  const { constructs, categories, pass } = req.body || {};
  if (!Array.isArray(constructs) || !constructs.length) return res.status(400).json({ error: 'constructs required' });
  if (!Array.isArray(categories) || !categories.length) return res.status(400).json({ error: 'categories required' });

  // Two independent coders, deliberately reasoning by different routes — the
  // point is genuine independence, so disagreement is informative (Jankowicz).
  const STANCE = {
    A: `YOUR CODING STANCE — definition-led. Work from the category definitions outwards. For each construct, read the definitions and ask: which definition is this construct substantially ABOUT? Anchor every decision in the wording of the definition.`,
    B: `YOUR CODING STANCE — participant-language-led. Work from the interviewee's words inwards. For each construct, first state to yourself what behaviour this person is describing in their own terms; then ask which category best captures that behaviour. Anchor every decision in the participant's meaning.`,
    C: `YOUR CODING STANCE — contrast-led. A construct's meaning lives in the CONTRAST it draws. For each construct, first identify what distinction the participant is actually making between its two poles; then find the category whose own two poles express that same distinction. Anchor every decision in the contrast, not either pole alone.`,
    D: `YOUR CODING STANCE — exemplar-led. Reason by resemblance. For each construct, ask which category's illustrative wording and pole examples it most closely resembles as a case. Prefer the category the construct would sit most naturally beside. Anchor every decision in family resemblance to the category's exemplars.`,
  }[pass] || '';

  const catList = categories.map(c =>
    `${c.id} = ${c.name}\n   PREFERRED POLE (${c.left}): ${(c.leftDef || '').slice(0, 700)}\n   OPPOSITE POLE (${c.right}): ${(c.rightDef || '').slice(0, 700)}`
  ).join('\n\n');

  const conList = constructs.map(c => `${c.id} :: "${c.left}" versus "${c.right}"`).join('\n');

  const prompt = `You are coding repertory-grid constructs into content-analysis categories, following Jankowicz's (2004) core-categorisation method. You are an experienced independent coder working ALONE — do not hedge toward what another coder might say; record your own honest judgement.

${STANCE}

CATEGORIES (id = name, with the definition of each pole):

${catList}

TASK — assign EVERY construct below to exactly one category id.

Rules:
- Judge on MEANING against the pole definitions, not surface wording.
- Set "flip": false when the construct's FIRST pole matches the category's PREFERRED pole; true when the construct's FIRST pole matches the category's OPPOSITE pole.
- Choose the category whose pole definition the construct matches MOST SPECIFICALLY. Where two could fit, pick the one whose definition names the construct's core idea. Do NOT stretch a construct into a category on a loose or metaphorical association — a construct only belongs to a category if that category's definition is substantially what the construct is about.
- Be disciplined about the catch-all: assign the category named "Other" whenever a construct is not clearly and primarily about one of the substantive categories (for example generic remarks about governance, culture, process, pace, structure or context). A real coder parks a meaningful minority here — expect very roughly 1 in 25 constructs to be "Other". Do not force every construct into a substantive category.
- COMPLEX CONSTRUCTS: a small minority of constructs genuinely carry TWO ideas at once and belong to two categories. For those only, add "cat2" (and its own "flip2"). Use this sparingly — most constructs have a single primary category and no cat2. Never set cat2 equal to cat, and never use "Other" as cat2.
- Every construct id must appear exactly once in your answer.
- Return STRICT JSON only, no prose, no markdown fences:
{"assignments":[{"id":"<construct id>","cat":"<category id>","flip":false,"cat2":"<optional second category id>","flip2":false}]}

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
