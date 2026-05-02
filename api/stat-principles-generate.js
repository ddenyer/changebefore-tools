// stat-principles-generate.js — generate 8 principle statements for an individual
//
// Takes the user's survey responses, current scores, and to-be scores. Identifies
// the questions where their answers diverge most sharply from where they say they
// want to be. Generates 8 principle statements (not actions) grounded in the
// language of those specific questions.
//
// Principles are commitments to a way of seeing — not a calendar slot.
// Verb stems: "Make space for", "Be willing to", "Stop treating", "Recognise",
// "Make peace with", "Pay attention to", "Accept that", "Reward", "Stop", "Reduce".

// ── SURVEY QUESTION DATA (mirrors stat-group.html) ───────────────────────────
const S1_QS = [
  {id:'s1p1',q:'What do we pay attention to when developing our strategy?',l:'Maintaining the status quo, making the most of existing capabilities and/or resources.',r:'Transforming and changing the organisation, creating new capabilities and/or resources.',axis:'mindset'},
  {id:'s1p2',q:'What do we think stops us from failing as an organisation?',l:'Preventing threats, being prepared, controlling costs and safeguarding current capacity.',r:'Prospecting for opportunities, challenging to improve performance and accomplish more.',axis:'mindset'},
  {id:'s1p3',q:'What are the key dimensions for success built into our strategy?',l:'Being predictable, having continuity, mitigating risk and reducing vulnerability.',r:'Growth, competition, targets and creating new business.',axis:'mindset'},
  {id:'s1pe1',q:'What do we value in our people?',l:'Being cautious and reliable.',r:'Being competitive and achievement oriented.',axis:'mindset'},
  {id:'s1pe2',q:'What do we expect of leadership to deliver our strategy?',l:'Cascading clear rules, orders and instructions; managing performance through rewards and punishments.',r:"Setting ambitious stretch goals and inspiring people; consulting with stakeholders to get 'buy in'.",axis:'mindset'},
  {id:'s1pe3',q:'What do we do to help people deliver what is expected?',l:'Fixing gaps in knowledge and skills to respond to incidents, unexpected events and crises.',r:'Creating new knowledge and skills to enhance capability and improve performance.',axis:'mindset'},
  {id:'s1pr1',q:'What brings people on message and acting in accordance with the strategy?',l:'Planning, design and supervision of work — managing at an individual level.',r:'Setting vision, goals and objectives — creating space for people to find their own ways.',axis:'mindset'},
  {id:'s1pr2',q:'What organisation design concepts inform how we structure ourselves?',l:'High hierarchy, functional control systems, work orders, rules, codes of conduct, governance and regulation.',r:'Activities organised around geographical, market, or product groups with clear targets aligned to the corporate plan.',axis:'mindset'},
  {id:'s1pr3',q:'What tendency underpins how we make decisions when facing uncertainty?',l:'Being conservative, mitigating loss and focused on avoiding the worst-case scenario.',r:'Being optimistic, maximising opportunities and focused on the most favourable outcome.',axis:'mindset'},
  {id:'s1pd1',q:'What is our assumption about how to be successful in our market?',l:'Defending market share or position by making it harder for competitors or alternatives to challenge.',r:'Growing position and being a proactive market leader by initiating change to which competitors must react.',axis:'mindset'},
  {id:'s1pd2',q:'What do our customers want from our existing products or services?',l:'Maintaining current service levels, delivering existing, trustworthy products and services.',r:'Continuously improving cost or features in existing products and/or services.',axis:'mindset'},
  {id:'s1pd3',q:'What do we — and our stakeholders — value?',l:'Dependability, reliability and sustainability.',r:'Market share or position, goal achievement and short-term growth.',axis:'mindset'},
];
const S2_QS = [
  {id:'s2p1',q:'How do we enable the successful accomplishment of our strategy?',l:'Building agreement and support for the declared direction to ensure consistency and repeatability.',r:'Articulating the need to work together to create novel solutions and respond to new situations.',axis:'approach'},
  {id:'s2p2',q:'How do we focus our attention to be successful?',l:'Executing, implementing, performing existing work practices, processes and procedures.',r:'Enhancing flexibility and adaptability by imagining, creating and designing new ways of working.',axis:'approach'},
  {id:'s2p3',q:'How do we construct the core capabilities on which we pride ourselves?',l:'Meeting set requirements, efficiency gain and improving quality standards.',r:'Innovation, forward thinking, being agile and cutting edge.',axis:'approach'},
  {id:'s2pe1',q:'How do we expect our people to respond to threats and opportunities?',l:'Being systematic and consistent.',r:'Being creative and responsive.',axis:'approach'},
  {id:'s2pe2',q:'How do we engage people in our strategic direction?',l:'Establishing common values and beliefs for people to work toward common expectations.',r:'Delegating to people closest to the problem/customer, empowering them with freedom and discretion to act.',axis:'approach'},
  {id:'s2pe3',q:'How do people become successful in this organisation?',l:'Complying with processes and work practices and living the organisational values and norms.',r:'Identifying new possibilities, demonstrating situational awareness and non-conventional thinking.',axis:'approach'},
  {id:'s2pr1',q:'How do we make, align and coordinate organisational activity?',l:'Standardising processes and ensuring clear roles and responsibilities.',r:'Cooperation and informal communication within and between different parts of the organisation.',axis:'approach'},
  {id:'s2pr2',q:'How do we make the most of our resources?',l:'Centralising services and managing efficient, streamlined operations.',r:'Decentralising (networked, loose, project-based, ad hoc structure), constantly adapting, low hierarchy.',axis:'approach'},
  {id:'s2pr3',q:'How do we respond to problems and unexpected events?',l:'Using established responses, planned procedures and formal rules that specify what to do and how.',r:'Allowing people to use their discretion and judgement; team working to pool collective expertise.',axis:'approach'},
  {id:'s2pd1',q:'How do we set about gaining competitive advantage?',l:'Exploiting existing markets, capabilities and technologies — optimising existing business models.',r:'Exploring new markets, capabilities, technologies and business models — being a first mover.',axis:'approach'},
  {id:'s2pd2',q:'How do we think we should develop our products or services in the future?',l:'Narrowing product/service lines, high-volume, transaction-oriented and standardised.',r:'Focusing on low-volume, highly responsive to customer needs, creating bespoke/customised solutions.',axis:'approach'},
  {id:'s2pd3',q:'How would we like our outputs to be measured?',l:'Being efficient, timely and consistent.',r:'Being innovative, responsive and customised.',axis:'approach'},
];

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'Anthropic key not configured' });

  const { s1_answers, s2_answers, prog, def, con, flex, tobe_prog, tobe_def, tobe_con, tobe_flex, thing } = req.body;
  if (!s1_answers || !s2_answers) return res.status(400).json({ error: 'Missing s1_answers or s2_answers' });

  const th = thing || 'the organisation';

  // Mindset axis: prog vs def. Approach axis: flex vs con.
  // Direction of desired shift on each axis: positive number = wants more of L pole, negative = more of R pole
  const mindsetGap = (tobe_prog - prog) - (tobe_def - def); // positive = wants more progressive
  const approachGap = (tobe_flex - flex) - (tobe_con - con); // positive = wants more flexible

  // For each survey question, compute "leverage" — how much it represents a gap between current behaviour and desired direction
  // For mindset axis questions: L pole = defensive, R pole = progressive
  // For approach axis questions: L pole = consistent, R pole = flexible
  function leverageForQ(q, ansArr, idx, axisGap) {
    const a = ansArr[idx] || { l: 0, r: 0 };
    const lv = parseInt(a.l) || 0;
    const rv = parseInt(a.r) || 0;
    if (lv + rv === 0) return null;
    const tilt = rv - lv; // positive = leaning toward R pole
    // axisGap positive = wants more R pole. If user is currently L and wants R, leverage is high.
    // Match the directions: leverage = -tilt * sign(axisGap) when there's a gap to close
    const desiredDir = Math.sign(axisGap); // +1 wants more R, -1 wants more L, 0 no gap
    if (desiredDir === 0) {
      // No gap on this axis — this question doesn't have a direction to push toward.
      // Strength of current lean is its own kind of leverage (strengthen what they already do).
      return { score: Math.abs(tilt), targetPole: tilt >= 0 ? 'R' : 'L', mode: 'strengthen' };
    }
    // Gap exists. Higher leverage when current lean opposes desired direction.
    // If user leans toward L (tilt < 0) but axisGap is positive (wants more R), leverage is high and target = R.
    const opposesDesired = (tilt < 0 && desiredDir > 0) || (tilt > 0 && desiredDir < 0);
    if (opposesDesired) {
      return { score: Math.abs(tilt) + Math.abs(axisGap) / 5, targetPole: desiredDir > 0 ? 'R' : 'L', mode: 'shift' };
    }
    // User already leans the desired way — modest leverage to strengthen
    return { score: Math.abs(tilt) / 2, targetPole: tilt >= 0 ? 'R' : 'L', mode: 'strengthen' };
  }

  const candidates = [];
  S1_QS.forEach((q, i) => {
    const lev = leverageForQ(q, s1_answers, i, mindsetGap);
    if (lev) candidates.push({ q, lev, sourceText: lev.targetPole === 'L' ? q.l : q.r });
  });
  S2_QS.forEach((q, i) => {
    const lev = leverageForQ(q, s2_answers, i, approachGap);
    if (lev) candidates.push({ q, lev, sourceText: lev.targetPole === 'L' ? q.l : q.r });
  });

  // Sort by leverage, take top 8
  candidates.sort((a, b) => b.lev.score - a.lev.score);
  const top = candidates.slice(0, 8);

  // Build the source list for the AI prompt
  const sourceList = top.map((c, i) => {
    return `${i + 1}. Question: "${c.q.q}"\n   Target pole language: "${c.sourceText}"\n   Mode: ${c.lev.mode === 'shift' ? 'shift toward this pole (current behaviour leans the other way)' : 'strengthen this pole (already leaning here)'}`;
  }).join('\n\n');

  const aiPrompt = `You are helping a leader from ${th} commit to principles that would make a difference to how their organisation operates.

They have completed a strategic tensions assessment. Below are 8 specific tensions in ${th} where their answers and their desired direction of travel suggest meaningful change is possible.

For each, write ONE principle statement they could commit to. The principle should be grounded in the language of the target pole shown below.

PRINCIPLE FORMAT — these are commitments to a way of seeing, NOT actions:

REQUIRED VERB STEM at the start of each principle (use a different stem per principle, vary across the list):
- "Make space for…"
- "Be willing to…"
- "Stop treating…"
- "Recognise that…"
- "Make peace with…"
- "Pay attention to…"
- "Accept that…"
- "Reward people who…"
- "Reduce the emphasis on…"
- "Stop using … as a measure of…"

CONSTRAINTS — the principle must:
- Be 8 to 18 words
- Sound like one human stating something they have decided is true about how the organisation should work
- Use plain conversational English
- Be grounded in the language of the target pole supplied below
- NOT include a specific timeframe, meeting type, person count, or measurable target
- NOT mention scores, dimensions, percentages, or model jargon
- NOT use the words "Progressive", "Defensive", "Consistent", "Flexible", "score", "P", "D", "C", "F", "dimension"
- NOT prescribe what to do on Tuesday — these are principles, not actions

Good examples:
- "Make space for novel responses, not just declared direction."
- "Be willing to let teams vary the standard approach when the situation doesn't fit."
- "Stop treating consensus as the measure of a good decision."
- "Recognise that everyone doing it their own way can be a cost, not a virtue."
- "Reward people who notice what doesn't fit the system, not just those who follow it."

Bad examples (do NOT do this):
- "Block 30 minutes a week to walk the floor and ask front-line questions." (too specific, calendar-bound)
- "Increase Mindful Action by empowering people closest to the problem." (model jargon, abstract)
- "Your scores suggest you should focus on flexibility." (analytical, not a commitment)

The 8 tensions, with the language to draw from:

${sourceList}

Respond with ONLY a JSON array of exactly 8 strings — one principle per tension, in the same order as the input. No preamble, no markdown, no code fences.`;

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
        max_tokens: 800,
        messages: [{ role: 'user', content: aiPrompt }],
      }),
    });
    const data = await aiResp.json();
    const text = data.content?.[0]?.text || '[]';
    const cleaned = text.replace(/```json|```/g, '').trim();
    const principles = JSON.parse(cleaned);

    return res.status(200).json({
      principles: Array.isArray(principles) ? principles.slice(0, 8) : [],
      meta: {
        mindsetGap: Math.round(mindsetGap),
        approachGap: Math.round(approachGap),
        n_candidates: candidates.length,
      },
    });
  } catch (e) {
    console.error('stat-principles-generate error:', e);
    return res.status(500).json({ error: e.message });
  }
}
