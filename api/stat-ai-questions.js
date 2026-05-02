// stat-ai-questions.js — structured facilitation prompts for STAT
//
// Returns a structured object that the frontend renders into Current/Future
// sections with sub-questions. AI fills only specific slots (profile summary,
// strengths, limitations) drawn from condensed Cranfield/BSI strategy text.
// Everything else is computed deterministically from the data.

// Condensed source material from Denyer (2019), BSI/Cranfield STAT report.
// Used to ground the AI strengths/limitations slots so they don't drift.
const STRATEGY_SOURCE = {
  preventative_control: {
    name: 'Preventative Control',
    summary: 'A defensive strategy based on consistency. Resilience is achieved through robust risk management, physical barriers, system back-ups, safeguards and standards that protect the organisation from threats and allow it to predict and prevent disruptions.',
    atBest: 'Known problems are solved using proven techniques. Standard ways to do things are perfected by fine-tuning. Disruptions are quickly counteracted by planned responses. Roles and accountabilities are clearly defined. Decision-making is centralised; work is highly standardised.',
    blindSpots: 'Can create the illusion that "failure can\'t happen here" while defensive barriers gradually erode. People "go by the book" and stop noticing unusual problems. Improvement stalls; the organisation becomes static, stale and uncompetitive. Change is difficult; competitors become more agile.',
  },
  mindful_action: {
    name: 'Mindful Action',
    summary: 'A defensive strategy based on flexibility. Resilience is created by people who use their experience, expertise and teamwork to anticipate and adapt to threats and respond effectively to unfamiliar or challenging situations through creative problem solving and improvisation.',
    atBest: 'Opportunities and problems are noticed, understood and addressed quickly. People are empowered to act. Diversity of opinion is encouraged. The shifting demands of customers, regulators and other stakeholders are rapidly addressed. Expertise is highly valued.',
    blindSpots: 'Weakened when investment in people\'s competence stops. Without clear authority, creative responses can become disruptive. Lack of structure can lead to disarray and silos. Decision-makers can become overwhelmed. People are constantly firefighting and have no time to be more forward-thinking.',
  },
  performance_optimisation: {
    name: 'Performance Optimisation',
    summary: 'A progressive strategy based on consistency. Resilience comes from continually improving, refining and extending existing competencies and exploiting current technologies to serve present customers and markets more efficiently. Improvement is incremental rather than breakthrough.',
    atBest: 'Maximises efficiency and delivers on quality. Maintains the level of capability to deliver products or services and continuously improves them. Builds agreement and support for the declared direction. Recognition and reward systems drive consistent behaviours.',
    blindSpots: 'Singular focus on short-term productivity gain can damage the medium-term mission. Excessive cost-cutting endangers the organisation. Standardisation reduces ability to respond to specific customer demands. Organisations become very good at exploiting current products and lose sight of innovation, much to their detriment when markets shift.',
  },
  adaptive_innovation: {
    name: 'Adaptive Innovation',
    summary: 'A progressive strategy based on flexibility. Resilience is created through innovation — new products, services or markets — and through fundamental rethinking of the business and culture. Forward-thinking organisations themselves embody the disruption in their environment.',
    atBest: 'Creative thinking and problem-solving by people drawing on multiple perspectives. Collective strategic action with rich interactions, coalition formation and compromise. Systems-wide changes across boundaries; multidimensional and fundamental changes. People are supported to tolerate uncertainty.',
    blindSpots: 'Threat-rigidity effect: organisations cut innovation when faced with uncertainty. Pressure to constantly produce novel offerings can lead to incremental enhancements being passed off as innovations. Without structure, communication suffers and silos form. The decentralised system can be inefficient and duplicative. Risk-taking can become excessive.',
  },
  neutral: {
    name: 'Neutral',
    summary: 'A balanced combination of all four core strategies, with no dominant orientation. Often unintended rather than designed. The organisation is trying to be all things at once, or different parts are pulling in different directions.',
    atBest: 'When designed deliberately, a neutral strategy can coordinate all four approaches through structural separation (e.g. risk department for prevention, R&D for innovation, ops excellence for optimisation) supported by trained professionals who understand each other across boundaries.',
    blindSpots: 'Often lacks a clearly defined resilience strategy — "trying to be all things to all people" or "hedging bets". Easy to end up "stuck in the middle" delivering average performance in all four areas. Different individuals or groups gravitate to their own preferred way, creating internal misalignment. Hard to do well; the purpose, people, process and product that lead to excellence in any one strategy are often contradictory.',
  },
};

function getStrategy(d, p, c, f) {
  const max = Math.max(d, p, c, f);
  const min = Math.min(d, p, c, f);
  if (max - min < 15) return 'neutral';
  const mind = p > d ? 'prog' : 'def';
  const app = f > c ? 'flex' : 'con';
  if (mind === 'prog' && app === 'con') return 'performance_optimisation';
  if (mind === 'prog' && app === 'flex') return 'adaptive_innovation';
  if (mind === 'def' && app === 'con') return 'preventative_control';
  return 'mindful_action';
}

const DIM_LABELS = { prog: 'Progressive', def: 'Defensive', con: 'Consistent', flex: 'Flexible' };
const DIM_NATURAL = {
  prog: 'taking the initiative and going after results',
  def: 'protecting what matters and preventing things going wrong',
  con: 'sticking to standard processes and clear rules',
  flex: 'adapting on the fly and improvising',
};

// Extend the Vercel serverless function timeout to 30s (default 10s often too short for AI calls)
export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'Anthropic key not configured' });

  const { sessionCode, respondents, thing } = req.body;
  if (!respondents || respondents.length < 2) return res.status(400).json({ error: 'Need at least 2 respondents' });

  const th = thing || 'the organisation';
  const real = respondents.filter(r => r.respondent_name && r.respondent_name !== '__facilitator__' && r.prog != null);
  const n = real.length;
  if (n < 2) return res.status(400).json({ error: 'Need at least 2 completed respondents' });

  // ── DETERMINISTIC SIGNALS ──────────────────────────────────────────────────
  const dims = ['prog', 'def', 'con', 'flex'];
  const mean = (k) => real.reduce((s, r) => s + (r[k] || 0), 0) / n;
  const sd = (k) => {
    const m = mean(k);
    const v = real.reduce((s, r) => s + ((r[k] || 0) - m) ** 2, 0) / n;
    return Math.sqrt(v);
  };

  const means = Object.fromEntries(dims.map(k => [k, Math.round(mean(k))]));
  const spreads = Object.fromEntries(dims.map(k => [k, sd(k)]));

  // Group dominant strategy from group means
  const dominantKey = getStrategy(means.def, means.prog, means.con, means.flex);
  const dominant = STRATEGY_SOURCE[dominantKey];

  // Disagreement profile across the four dimensions
  const sortedBySpread = [...dims].sort((a, b) => spreads[b] - spreads[a]);
  const maxSpread = spreads[sortedBySpread[0]];
  const minSpread = spreads[sortedBySpread[3]];
  const mostContestedDim = sortedBySpread[0];
  const mostAgreedDim = sortedBySpread[3];

  // n-size guardrail: tiny groups can't reliably show consensus or disagreement
  const tooSmallForSpreadJudgement = n < 5;

  // Pattern: consensus / mixed / disagreement
  let agreementPattern;
  if (tooSmallForSpreadJudgement) {
    agreementPattern = 'small_group';
  } else if (maxSpread < 12) {
    agreementPattern = 'consensus';
  } else if (minSpread < 12 && maxSpread >= 18) {
    agreementPattern = 'mixed';
  } else if (maxSpread >= 18) {
    agreementPattern = 'disagreement';
  } else {
    agreementPattern = 'mild';
  }

  // Qualitative direction for a dimension based on mean
  const qualMean = (k) => {
    const m = means[k];
    if (m >= 75) return `strongly emphasises ${DIM_LABELS[k]} — ${DIM_NATURAL[k]}`;
    if (m >= 60) return `leans toward ${DIM_LABELS[k]} — ${DIM_NATURAL[k]}`;
    if (m <= 35) return `is low on ${DIM_LABELS[k]} — limited ${DIM_NATURAL[k]}`;
    if (m <= 45) return `is below average on ${DIM_LABELS[k]}`;
    return `is mid-range on ${DIM_LABELS[k]}`;
  };

  // To-be analysis
  const tobeKey = (k) => 'tobe_' + k;
  const tobeMean = (k) => {
    const vals = real.filter(r => r[tobeKey(k)] != null).map(r => r[tobeKey(k)]);
    if (!vals.length) return null;
    return vals.reduce((s, v) => s + v, 0) / vals.length;
  };
  const tobeSd = (k) => {
    const m = tobeMean(k);
    if (m == null) return null;
    const vals = real.filter(r => r[tobeKey(k)] != null).map(r => r[tobeKey(k)]);
    if (vals.length < 2) return 0;
    const v = vals.reduce((s, x) => s + (x - m) ** 2, 0) / vals.length;
    return Math.sqrt(v);
  };

  const tobeMeans = Object.fromEntries(dims.map(k => [k, tobeMean(k)]));
  const tobeSpreads = Object.fromEntries(dims.map(k => [k, tobeSd(k)]));
  const hasTobeData = dims.every(k => tobeMeans[k] != null);

  let futurePattern = 'no_data';
  let biggestShiftDim = null;
  let biggestShiftDirection = null;
  let tobeMaxSpread = 0;
  if (hasTobeData) {
    const gaps = dims.map(k => ({ k, gap: tobeMeans[k] - means[k] }));
    gaps.sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));
    const topGap = gaps[0];
    tobeMaxSpread = Math.max(...dims.map(k => tobeSpreads[k]));

    if (Math.abs(topGap.gap) >= 8) {
      biggestShiftDim = topGap.k;
      biggestShiftDirection = topGap.gap > 0 ? 'more' : 'less';
      futurePattern = tobeMaxSpread >= 18 ? 'shift_but_divided' : 'clear_shift';
    } else if (tobeMaxSpread >= 18) {
      futurePattern = 'divided';
    } else {
      futurePattern = 'content';
    }
  }

  // ── AI SLOTS ───────────────────────────────────────────────────────────────
  // The model fills three specific gaps using the source material for the
  // dominant strategy. We ground it tightly so it can't drift into jargon.
  const aiPrompt = `You are helping a facilitator open a conversation with a group of ${n} people from ${th} about how their organisation actually operates.

The group's combined responses point to a dominant strategy of: ${dominant.name}.

Source description of this strategy (Denyer, 2019 — BSI/Cranfield):
SUMMARY: ${dominant.summary}
AT ITS BEST: ${dominant.atBest}
BLIND SPOTS AND RISK FACTORS: ${dominant.blindSpots}

Your task is to produce a structured JSON object with exactly three fields:

{
  "profileSummary": "One sentence (max 25 words) describing what this profile means in plain English, ending with a period.",
  "strengths": ["bullet 1", "bullet 2", "bullet 3"],
  "limitations": ["bullet 1", "bullet 2", "bullet 3"]
}

CRITICAL RULES:
- Each strengths/limitations bullet must be one short sentence under 18 words.
- Use plain conversational English. NO jargon.
- Do NOT use the words: "Progressive", "Defensive", "Consistent", "Flexible", "elevated", "indicates", "moderate", "score", "P", "D", "C", "F", "dimension".
- Strengths must come from the AT ITS BEST source above — paraphrased, not quoted.
- Limitations must come from the BLIND SPOTS source above — paraphrased, not quoted.
- Make each bullet sound like something a facilitator could read out to a group.
- Replace "the organisation" with "${th}" where natural.

Respond with ONLY the JSON object — no preamble, no markdown, no code fences.`;

  let aiData = null;
  try {
    const aiResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 700,
        messages: [{ role: 'user', content: aiPrompt }],
      }),
    });
    const data = await aiResp.json();
    const text = data.content?.[0]?.text || '{}';
    // Extract JSON robustly — find the first { and last } and slice
    let cleaned = text.replace(/```json|```/g, '').trim();
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      cleaned = cleaned.slice(firstBrace, lastBrace + 1);
    }
    aiData = JSON.parse(cleaned);
  } catch (e) {
    console.error('stat-ai-questions AI error:', e);
    // Fallback if AI fails
    aiData = {
      profileSummary: `${th} shows a dominant ${dominant.name} pattern.`,
      strengths: ['(AI unavailable — see source description)'],
      limitations: ['(AI unavailable — see source description)'],
    };
  }
  // Normalise aiData fields — guarantee shape regardless of what AI returned
  if (!aiData || typeof aiData !== 'object') aiData = {};
  if (typeof aiData.profileSummary !== 'string' || !aiData.profileSummary.trim()) {
    aiData.profileSummary = `${th} shows a dominant ${dominant.name} pattern.`;
  }
  if (!Array.isArray(aiData.strengths) || !aiData.strengths.length) {
    aiData.strengths = ['(strengths unavailable)'];
  }
  if (!Array.isArray(aiData.limitations) || !aiData.limitations.length) {
    aiData.limitations = ['(limitations unavailable)'];
  }

  // ── BUILD THE STRUCTURED RESPONSE ──────────────────────────────────────────
  const capTh = th.charAt(0).toUpperCase() + th.slice(1);

  const current = {
    heading: 'Current',
    items: [
      {
        type: 'profile',
        prompt: `Our overall current profile is **${dominant.name}** — ${aiData.profileSummary}`,
        question: 'Why does our profile look like this?',
      },
      {
        type: 'history',
        question: 'Has it always looked like this, or has it changed over time?',
      },
      {
        type: 'strengths',
        prompt: 'The strengths of this profile are:',
        bullets: aiData.strengths || [],
        question: 'Do we agree? Do we see these strengths in how we actually work?',
      },
      {
        type: 'limitations',
        prompt: 'The limitations or blind spots of this profile are:',
        bullets: aiData.limitations || [],
        question: `Do we experience these in ${th}?`,
      },
    ],
  };

  // Branch on agreement pattern
  if (agreementPattern === 'consensus') {
    current.items.push(
      { type: 'consensus_note', prompt: `We see this remarkably similarly. There's broad agreement across the group on all four areas of the profile.` },
      { type: 'consensus_q1', question: 'What are the advantages of us all seeing it this way?' },
      { type: 'consensus_q2', question: 'What are the risks or disadvantages of us all seeing it the same way? Could there be blind spots, missing voices, or groupthink?' },
      { type: 'consensus_q3', question: `Who isn't in the room — and would they see ${th} differently?` }
    );
  } else if (agreementPattern === 'disagreement') {
    current.items.push(
      { type: 'disagreement_note', prompt: `We see this differently. Views diverge most on **${DIM_LABELS[mostContestedDim]}** — ${DIM_NATURAL[mostContestedDim]}.` },
      { type: 'disagreement_q', question: 'How are you seeing it? What does the difference tell us?' },
      { type: 'agreement_summary', prompt: `Where we most agree: ${capTh} ${qualMean(mostAgreedDim)}.` }
    );
  } else if (agreementPattern === 'mixed') {
    current.items.push(
      { type: 'agreement_summary', prompt: `Where we agree: ${capTh} ${qualMean(mostAgreedDim)}.` },
      { type: 'disagreement_summary', prompt: `Where we disagree most: **${DIM_LABELS[mostContestedDim]}** — ${DIM_NATURAL[mostContestedDim]}.` },
      { type: 'mixed_q', question: 'What does it mean that we are aligned on some things and not others?' }
    );
  } else if (agreementPattern === 'small_group') {
    current.items.push(
      { type: 'small_group_note', prompt: `With only ${n} responses, it's hard to read agreement or disagreement reliably from the data.` },
      { type: 'small_group_q', question: 'Where do you think we agree, and where would you expect us to differ?' }
    );
  } else {
    // 'mild' — moderate spread, nothing dramatic
    current.items.push(
      { type: 'mild_q', question: `Where do you see ${th} most clearly the same — and where do you see it most differently?` }
    );
  }

  const future = {
    heading: 'Future',
    items: [
      { type: 'fit', question: `Is our current profile fit for purpose for what ${th} is trying to achieve?` },
      { type: 'balance', question: 'Have we got the right balance?' },
      { type: 'where', question: 'Where do you need to be — taking into account strategy, priorities, and the outcomes you need to achieve?' },
    ],
  };

  if (futurePattern === 'clear_shift') {
    future.items.push({
      type: 'shift_q',
      prompt: `The group as a whole wants to be **${biggestShiftDirection} ${DIM_LABELS[biggestShiftDim]}** — ${biggestShiftDirection === 'more' ? 'increasing' : 'reducing'} ${DIM_NATURAL[biggestShiftDim]}.`,
      question: 'What do we need to do to make that shift?',
    });
  } else if (futurePattern === 'shift_but_divided') {
    future.items.push({
      type: 'shift_divided_q',
      prompt: `Most of the group wants to be ${biggestShiftDirection} ${DIM_LABELS[biggestShiftDim]}, but views differ on how far.`,
      question: 'What does the disagreement on direction tell us?',
    });
  } else if (futurePattern === 'divided') {
    future.items.push({
      type: 'divided_q',
      prompt: `There's no single shared view of where ${th} needs to go — different people want different things.`,
      question: 'What does that disagreement tell us?',
    });
  } else if (futurePattern === 'content') {
    future.items.push({
      type: 'content_q',
      prompt: `The group is broadly content with the current balance — desired and current profiles look similar.`,
      question: 'Is that genuine fit, or is it complacency?',
    });
  } else {
    future.items.push({
      type: 'no_data_q',
      question: 'Where do you see the gap between where we are and where we need to be?',
    });
  }

  return res.status(200).json({
    structured: true,
    n,
    organisation: th,
    dominantStrategy: { key: dominantKey, name: dominant.name },
    agreementPattern,
    futurePattern,
    current,
    future,
    // Backward-compat: keep a flat 'questions' field for older clients (pulls every 'question' out)
    questions: [
      ...current.items.map(i => i.question).filter(Boolean),
      ...future.items.map(i => i.question).filter(Boolean),
    ].slice(0, 8),
  });
}
