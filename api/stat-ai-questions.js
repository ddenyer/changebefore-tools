// stat-ai-questions.js — generate facilitation prompts tailored to a group's STAT data.
//
// Input:  { sessionCode, respondents, thing }
// Output: {
//   current: { heading, items: [{prompt, bullets[], question}] },
//   future:  { heading, items: [{prompt, bullets[], question}] },
//   dominantStrategy: { name, code },
//   agreementPattern: 'aligned' | 'split',
//   futurePattern:    'aligned' | 'split',
//   n: <count of respondents with as-is profile>
// }
//
// Anonymous-aware: a respondent counts as "complete" if they have prog (and
// optionally def/con/flex) values, regardless of whether they joined with a name.

export const config = { maxDuration: 30 };

function getStrategy(d, p, c, f) {
  const max = Math.max(d, p, c, f), min = Math.min(d, p, c, f);
  if (max - min < 15) return 'neutral';
  const mind = p > d ? 'prog' : 'def';
  const app = f > c ? 'flex' : 'con';
  if (mind === 'prog' && app === 'con') return 'performance_optimisation';
  if (mind === 'prog' && app === 'flex') return 'adaptive_innovation';
  if (mind === 'def' && app === 'con') return 'preventative_control';
  return 'mindful_action';
}

const SLABELS = {
  preventative_control: 'Preventative Control',
  mindful_action: 'Mindful Action',
  performance_optimisation: 'Performance Optimisation',
  adaptive_innovation: 'Adaptive Innovation',
  neutral: 'Neutral',
};

const STRATEGY_DESC = {
  preventative_control: 'Defensive + Consistent. Resilience achieved through risk management, standards, and consistent application of procedures. Strengths: known problems solved using proven techniques. Risks: people defer to procedures and stop noticing unusual problems; the organisation becomes static.',
  mindful_action: 'Defensive + Flexible. Resilience created by people who use experience and teamwork to anticipate and adapt. Strengths: opportunities and problems noticed and addressed quickly. Risks: lack of structure leads to silos; people are firefighting and have no time to be forward-thinking.',
  performance_optimisation: 'Progressive + Consistent. Resilience formed by continually improving existing processes and exploiting current technologies. Strengths: maximises efficiency, delivers quality. Risks: preoccupied with production over prevention; loses adaptive capacity.',
  adaptive_innovation: 'Progressive + Flexible. Resilience created through innovation, novel solutions, and disruption. Strengths: creative thinking from multiple perspectives. Risks: pressure to innovate produces incremental enhancements passed off as innovation; loses sight of customer demand.',
  neutral: 'Balanced across all four core strategies. Hard to do well — often the result of trying to be all things to all people; can end up "stuck in the middle" with average performance everywhere.',
};

function variance(arr) {
  if (arr.length < 2) return 0;
  const m = arr.reduce((s,v)=>s+v, 0) / arr.length;
  return arr.reduce((s,v)=>s+(v-m)**2, 0) / arr.length;
}

function buildPrompt(thing, current, future) {
  const th = thing || 'the organisation';
  return `You are an expert facilitator helping a leadership group at ${th} debrief the Strategic Tensions Assessment Tool (STAT) developed by Professor David Denyer at Cranfield School of Management.

The STAT is built on two dimensions: Mindset (Defensive ↔ Progressive) and Approach (Consistency ↔ Flexibility), forming four organisational resilience strategies.

THIS GROUP'S DATA:
Number of respondents: ${current.n}

CURRENT STATE — what the organisation looks like today:
- Group means: Progressive ${current.means.prog}, Defensive ${current.means.def}, Consistent ${current.means.con}, Flexible ${current.means.flex}
- Dominant strategy: ${SLABELS[current.strategy]}
- Description: ${STRATEGY_DESC[current.strategy]}
- Agreement pattern: ${current.agreementPattern === 'split' ? 'SPLIT — significant disagreement on at least one dimension (SDs: P=' + current.sds.prog.toFixed(1) + ', D=' + current.sds.def.toFixed(1) + ', C=' + current.sds.con.toFixed(1) + ', F=' + current.sds.flex.toFixed(1) + ')' : 'aligned — the group sees the present similarly'}

DESIRED FUTURE STATE — where the organisation wants to be:
${future.n === 0 ? '- No respondents have completed the to-be section yet.' : `- Group means: Progressive ${future.means.p}, Defensive ${future.means.d}, Consistent ${future.means.c}, Flexible ${future.means.f}
- Aspirational strategy: ${SLABELS[future.strategy]}
- Description: ${STRATEGY_DESC[future.strategy]}
- Agreement pattern: ${future.agreementPattern === 'split' ? 'SPLIT — significant disagreement on the future direction' : 'aligned — the group has a shared sense of where to go'}
- Largest gap dimension: ${future.largestGap.dim} (gap = ${future.largestGap.value > 0 ? '+' : ''}${future.largestGap.value})`}

YOUR TASK:
Produce facilitation prompts for a debrief with this group. The prompts should be specific to THIS group's data — not generic. They should help the facilitator surface what's beneath the numbers and steer a productive conversation.

OUTPUT FORMAT — respond with ONLY a JSON object, no preamble, no markdown, no code fences:

{
  "current": {
    "heading": "Short heading for the current-state section (e.g. 'Where you are now: Preventative Control')",
    "items": [
      {
        "prompt": "An observation about the data, with **bold** for emphasis where useful. 1-3 sentences.",
        "bullets": ["optional supporting bullets, 0-3 items"],
        "question": "A single open-ended question for the facilitator to ask the group."
      }
    ]
  },
  "future": {
    "heading": "Short heading for the future-state section (e.g. 'Where you want to go: Adaptive Innovation')",
    "items": [ ... same shape as above ... ]
  }
}

CONSTRAINTS:
- 3 to 4 items in each section.
- Each prompt should reference something specific about THIS group (e.g. "the split on Defensive scores", "the +20 gap on Flexibility").
- Questions should be open-ended ("How might…", "What would it take for…", "Where do you see…"), never yes/no.
- Voice: addressed to the facilitator. Use "the group", "the team", "they". Never "you" addressed to a single leader.
- No framework jargon ("axis", "quadrant", "polarity") in the visible text. Strategy names (Preventative Control etc.) are fine.
- If the group is SPLIT on a dimension, name it as a tension to explore — don't smooth over it.
- If the group is ALIGNED, name what that alignment makes possible AND what blind spots it creates.`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'Anthropic key not configured' });

  const { respondents, thing } = req.body || {};
  if (!Array.isArray(respondents)) {
    return res.status(400).json({ error: 'respondents array required' });
  }

  // Anonymous-aware filter: a respondent counts if they have prog values
  // (regardless of whether they have a name).
  const completed = respondents.filter(r =>
    r &&
    r.respondent_name !== '__facilitator__' &&
    r.respondent_name !== '__session_closed__' &&
    !r.pending_review &&
    typeof r.prog === 'number' && r.prog > 0
  );

  if (completed.length < 2) {
    return res.status(400).json({ error: 'Need at least 2 completed respondents' });
  }

  // Compute current-state means, SDs, dominant strategy, agreement pattern
  const progs = completed.map(r => r.prog || 0);
  const defs = completed.map(r => r.def || 0);
  const cons = completed.map(r => r.con || 0);
  const flexs = completed.map(r => r.flex || 0);
  const means = {
    prog: Math.round(progs.reduce((s,v)=>s+v,0) / completed.length),
    def: Math.round(defs.reduce((s,v)=>s+v,0) / completed.length),
    con: Math.round(cons.reduce((s,v)=>s+v,0) / completed.length),
    flex: Math.round(flexs.reduce((s,v)=>s+v,0) / completed.length),
  };
  const sds = {
    prog: Math.sqrt(variance(progs)),
    def: Math.sqrt(variance(defs)),
    con: Math.sqrt(variance(cons)),
    flex: Math.sqrt(variance(flexs)),
  };
  const isSplit = (sds.prog >= 10 || sds.def >= 10 || sds.con >= 10 || sds.flex >= 10);
  const dominantStrategy = getStrategy(means.def, means.prog, means.con, means.flex);

  // Future state — only if respondents have tobe values
  const withTobe = completed.filter(r => typeof r.tobe_prog === 'number' && r.tobe_prog > 0);
  let futurePayload = { n: 0 };
  let futureStrategy = null;
  if (withTobe.length > 0) {
    const tProgs = withTobe.map(r => r.tobe_prog || 60);
    const tDefs = withTobe.map(r => r.tobe_def || 60);
    const tCons = withTobe.map(r => r.tobe_con || 60);
    const tFlexs = withTobe.map(r => r.tobe_flex || 60);
    const tMeans = {
      p: Math.round(tProgs.reduce((s,v)=>s+v,0) / withTobe.length),
      d: Math.round(tDefs.reduce((s,v)=>s+v,0) / withTobe.length),
      c: Math.round(tCons.reduce((s,v)=>s+v,0) / withTobe.length),
      f: Math.round(tFlexs.reduce((s,v)=>s+v,0) / withTobe.length),
    };
    const tSDs = {
      p: Math.sqrt(variance(tProgs)),
      d: Math.sqrt(variance(tDefs)),
      c: Math.sqrt(variance(tCons)),
      f: Math.sqrt(variance(tFlexs)),
    };
    futureStrategy = getStrategy(tMeans.d, tMeans.p, tMeans.c, tMeans.f);
    const futureSplit = (tSDs.p >= 10 || tSDs.d >= 10 || tSDs.c >= 10 || tSDs.f >= 10);
    // Largest gap
    const gaps = [
      { dim: 'Progressive', value: tMeans.p - means.prog },
      { dim: 'Defensive', value: tMeans.d - means.def },
      { dim: 'Consistent', value: tMeans.c - means.con },
      { dim: 'Flexible', value: tMeans.f - means.flex },
    ];
    gaps.sort((a,b) => Math.abs(b.value) - Math.abs(a.value));
    futurePayload = {
      n: withTobe.length,
      means: tMeans,
      strategy: futureStrategy,
      agreementPattern: futureSplit ? 'split' : 'aligned',
      largestGap: gaps[0],
    };
  }

  const currentPayload = {
    n: completed.length,
    means, sds,
    strategy: dominantStrategy,
    agreementPattern: isSplit ? 'split' : 'aligned',
  };

  // Call Claude
  try {
    const prompt = buildPrompt(thing, currentPayload, futurePayload);
    const aiResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2500,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const data = await aiResp.json();
    const text = data.content?.[0]?.text || '{}';
    let cleaned = text.replace(/```json|```/g, '').trim();
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) cleaned = cleaned.slice(firstBrace, lastBrace + 1);
    const parsed = JSON.parse(cleaned);

    return res.status(200).json({
      current: parsed.current,
      future: parsed.future,
      dominantStrategy: { name: SLABELS[dominantStrategy], code: dominantStrategy },
      agreementPattern: isSplit ? 'split' : 'aligned',
      futurePattern: futurePayload.n > 0 ? futurePayload.agreementPattern : null,
      n: completed.length,
    });
  } catch (e) {
    console.error('stat-ai-questions error:', e);
    return res.status(500).json({ error: e.message });
  }
}
