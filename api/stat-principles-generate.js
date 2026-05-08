// stat-principles-generate.js — generate a behavioural change agenda for one participant.
//
// Replaces the old 8-principle output with a three-column agenda:
//   Keep    — practices to protect
//   Add     — capacities to build alongside
//   Replace — defaults to substitute out
//
// Selection enforces:
//   - Each category (P/E/R/D) appears at least twice
//   - Each axis (mindset/approach) appears at least 4 times
//   - 9-12 items total, scaled to total gap magnitude
//
// Items are pre-classified into buckets by the algorithm; the AI just writes
// the language for each item given its bucket assignment.

export const config = { maxDuration: 30 };

// ── 24 SURVEY QUESTIONS ────────────────────────────────────────────────
const CATS = { P:'Purpose', E:'People', R:'Resources', D:'Direction' };
const QS = [
  {id:'s1p1', cat:'P', axis:'mindset', q:'What do we pay attention to when developing our strategy?', l:'Maintaining the status quo, making the most of existing capabilities and/or resources.', r:'Transforming and changing the organisation, creating new capabilities and/or resources.'},
  {id:'s1p2', cat:'P', axis:'mindset', q:'What do we think stops us from failing as an organisation?', l:'Preventing threats, being prepared, controlling costs and safeguarding current capacity.', r:'Prospecting for opportunities, challenging to improve performance and accomplish more.'},
  {id:'s1p3', cat:'P', axis:'mindset', q:'What are the key dimensions for success built into our strategy?', l:'Being predictable, having continuity, mitigating risk and reducing vulnerability.', r:'Growth, competition, targets and creating new business.'},
  {id:'s1pe1', cat:'E', axis:'mindset', q:'What do we value in our people?', l:'Being cautious and reliable.', r:'Being competitive and achievement oriented.'},
  {id:'s1pe2', cat:'E', axis:'mindset', q:'What do we expect of leadership to deliver our strategy?', l:'Cascading clear rules, orders and instructions; managing performance through rewards and punishments.', r:"Setting ambitious stretch goals and inspiring people; consulting with stakeholders to get 'buy in'."},
  {id:'s1pe3', cat:'E', axis:'mindset', q:'What do we do to help people deliver what is expected?', l:'Fixing gaps in knowledge and skills to respond to incidents, unexpected events and crises.', r:'Creating new knowledge and skills to enhance capability and improve performance.'},
  {id:'s1pr1', cat:'R', axis:'mindset', q:'What brings people on message and acting in accordance with the strategy?', l:'Planning, design and supervision of work — managing at an individual level.', r:'Setting vision, goals and objectives — creating space for people to find their own ways.'},
  {id:'s1pr2', cat:'R', axis:'mindset', q:'What organisation design concepts inform how we structure ourselves?', l:'High hierarchy, functional control systems, work orders, rules, codes of conduct, governance and regulation.', r:'Activities organised around geographical, market, or product groups with clear targets aligned to the corporate plan.'},
  {id:'s1pr3', cat:'R', axis:'mindset', q:'What tendency underpins how we make decisions when facing uncertainty?', l:'Being conservative, mitigating loss and focused on avoiding the worst-case scenario.', r:'Being optimistic, maximising opportunities and focused on the most favourable outcome.'},
  {id:'s1pd1', cat:'D', axis:'mindset', q:'What is our assumption about how to be successful in our market?', l:'Defending market share or position by making it harder for competitors or alternatives to challenge.', r:'Growing position and being a proactive market leader by initiating change to which competitors must react.'},
  {id:'s1pd2', cat:'D', axis:'mindset', q:'What do our customers want from our existing products or services?', l:'Maintaining current service levels, delivering existing, trustworthy products and services.', r:'Continuously improving cost or features in existing products and/or services.'},
  {id:'s1pd3', cat:'D', axis:'mindset', q:'What do we — and our stakeholders — value?', l:'Dependability, reliability and sustainability.', r:'Market share or position, goal achievement and short-term growth.'},
  {id:'s2p1', cat:'P', axis:'approach', q:'How do we enable the successful accomplishment of our strategy?', l:'Building agreement and support for the declared direction to ensure consistency and repeatability.', r:'Articulating the need to work together to create novel solutions and respond to new situations.'},
  {id:'s2p2', cat:'P', axis:'approach', q:'How do we focus our attention to be successful?', l:'Executing, implementing, performing existing work practices, processes and procedures.', r:'Enhancing flexibility and adaptability by imagining, creating and designing new ways of working.'},
  {id:'s2p3', cat:'P', axis:'approach', q:'How do we construct the core capabilities on which we pride ourselves?', l:'Meeting set requirements, efficiency gain and improving quality standards.', r:'Innovation, forward thinking, being agile and cutting edge.'},
  {id:'s2pe1', cat:'E', axis:'approach', q:'How do we expect our people to respond to threats and opportunities?', l:'Being systematic and consistent.', r:'Being creative and responsive.'},
  {id:'s2pe2', cat:'E', axis:'approach', q:'How do we engage people in our strategic direction?', l:'Establishing common values and beliefs for people to work toward common expectations.', r:'Delegating to people closest to the problem/customer, empowering them with freedom and discretion to act.'},
  {id:'s2pe3', cat:'E', axis:'approach', q:'How do people become successful in this organisation?', l:'Complying with processes and work practices and living the organisational values and norms.', r:'Identifying new possibilities, demonstrating situational awareness and non-conventional thinking.'},
  {id:'s2pr1', cat:'R', axis:'approach', q:'How do we make, align and coordinate organisational activity?', l:'Standardising processes and ensuring clear roles and responsibilities.', r:'Cooperation and informal communication within and between different parts of the organisation.'},
  {id:'s2pr2', cat:'R', axis:'approach', q:'How do we make the most of our resources?', l:'Centralising services and managing efficient, streamlined operations.', r:'Decentralising (networked, loose, project-based, ad hoc structure), constantly adapting, low hierarchy.'},
  {id:'s2pr3', cat:'R', axis:'approach', q:'How do we respond to problems and unexpected events?', l:'Using established responses, planned procedures and formal rules that specify what to do and how.', r:'Allowing people to use their discretion and judgement; team working to pool collective expertise.'},
  {id:'s2pd1', cat:'D', axis:'approach', q:'How do we set about gaining competitive advantage?', l:'Exploiting existing markets, capabilities and technologies — optimising existing business models.', r:'Exploring new markets, capabilities, technologies and business models — being a first mover.'},
  {id:'s2pd2', cat:'D', axis:'approach', q:'How do we think we should develop our products or services in the future?', l:'Narrowing product/service lines, high-volume, transaction-oriented and standardised.', r:'Focusing on low-volume, highly responsive to customer needs, creating bespoke/customised solutions.'},
  {id:'s2pd3', cat:'D', axis:'approach', q:'How would we like our outputs to be measured?', l:'Being efficient, timely and consistent.', r:'Being innovative, responsive and customised.'},
];
const S1_INDICES = QS.filter(q=>q.axis==='mindset');
const S2_INDICES = QS.filter(q=>q.axis==='approach');

// ── SCORING + SELECTION ────────────────────────────────────────────────
function leverageForQ(q, ansArr, idx, axisGap) {
  const a = ansArr[idx] || {l:0,r:0};
  const lv = parseInt(a.l)||0;
  const rv = parseInt(a.r)||0;
  if (lv+rv===0) return null;
  const tilt = rv-lv;
  const desiredDir = Math.sign(axisGap);
  const absGap = Math.abs(axisGap);
  if (absGap < 8) return { score: Math.abs(tilt), targetPole: tilt>=0?'R':'L', mode:'strengthen', tilt };
  const opposesDesired = (tilt<0 && desiredDir>0) || (tilt>0 && desiredDir<0);
  if (opposesDesired) return { score: Math.abs(tilt) + absGap/8, targetPole: desiredDir>0?'R':'L', mode:'shift', tilt };
  return { score: Math.abs(tilt)/2, targetPole: tilt>=0?'R':'L', mode:'strengthen', tilt };
}

function assignBucketsAcrossSet(scored, mindsetGap, approachGap) {
  const shiftScores = scored.filter(s=>s.lev.mode==='shift').map(s=>s.lev.score).sort((a,b)=>a-b);
  const medianShift = shiftScores.length>0 ? shiftScores[Math.floor(shiftScores.length/2)] : 0;
  return scored.map(s => {
    const axisGapAbs = s.q.axis==='mindset' ? Math.abs(mindsetGap) : Math.abs(approachGap);
    let bucket;
    if (s.lev.mode === 'shift') {
      bucket = (axisGapAbs >= 20 && s.lev.score >= medianShift) ? 'replace' : 'add';
    } else {
      bucket = (axisGapAbs >= 8 && Math.abs(s.lev.tilt) >= 4) ? 'add' : 'keep';
    }
    return { ...s, bucket };
  });
}

function selectConstrained(scored, totalNeeded) {
  const candidates = [...scored].sort((a,b)=>b.lev.score - a.lev.score);
  const selected = [];
  const catCount = { P:0, E:0, R:0, D:0 };
  const axisCount = { mindset:0, approach:0 };
  // Floor: each category ≥ 2
  for (const cat of ['P','E','R','D']) {
    const fromCat = candidates.filter(c => c.q.cat===cat && !selected.includes(c));
    for (let i=0; i<2 && i<fromCat.length; i++) {
      selected.push(fromCat[i]);
      catCount[cat]++;
      axisCount[fromCat[i].q.axis]++;
    }
  }
  // Floor: each axis ≥ 4
  for (const axis of ['mindset','approach']) {
    while (axisCount[axis] < 4 && selected.length < totalNeeded) {
      const next = candidates.find(c => c.q.axis===axis && !selected.includes(c));
      if (!next) break;
      selected.push(next); catCount[next.q.cat]++; axisCount[axis]++;
    }
  }
  // Fill remaining by leverage
  while (selected.length < totalNeeded) {
    const next = candidates.find(c => !selected.includes(c));
    if (!next) break;
    selected.push(next); catCount[next.q.cat]++; axisCount[next.q.axis]++;
  }
  return selected;
}

function targetCount(mindsetGap, approachGap) {
  const total = Math.abs(mindsetGap) + Math.abs(approachGap);
  if (total < 30) return 9;
  if (total < 70) return 10;
  if (total < 120) return 11;
  return 12;
}

function labelFor(p, d, c, f) {
  const isProg = p > d;
  const isFlex = f > c;
  if (!isProg && !isFlex) return 'Preventative Control';
  if (!isProg && isFlex) return 'Mindful Action';
  if (isProg && !isFlex) return 'Performance Optimisation';
  return 'Adaptive Innovation';
}

function headerCopy(mindsetGap, approachGap) {
  const total = Math.abs(mindsetGap) + Math.abs(approachGap);
  if (total < 20) return "You are largely operating where you want to be. The agenda below is mostly about protecting what works, with a few small additions.";
  if (total < 60) return "You have a moderate change ahead. Most of what you do is right; some of it needs to be augmented; a few defaults need to give.";
  if (total < 100) return "You have a substantial shift ahead. The agenda names what to protect, what to build alongside what you have, and what to substitute.";
  return "The shift you have asked for is foundational. Some of what your organisation has built well will need to be given up to make room for what you now want.";
}

// ── PROMPT ──────────────────────────────────────────────────────────────
function buildPrompt(thing, fromStrategy, toStrategy, sizeNote, selected) {
  const th = thing || 'the organisation';
  const items = selected.map((s, i) => {
    return `${i+1}. CATEGORY: ${CATS[s.q.cat]} (${s.q.axis})
   QUESTION: "${s.q.q}"
   WHAT WE LEAN ON: "${s.oppositeText}"
   THE ALTERNATIVE WE VALUE: "${s.sourceText}"
   BUCKET: ${s.bucket.toUpperCase()}`;
  }).join('\n\n');

  return `You are writing a ${sizeNote} change agenda for a leadership group working on ${th}.

CONTEXT:
- They are operating mostly in: ${fromStrategy}
- They want to move toward: ${toStrategy}
- The shift is ${sizeNote} in scale.

VOICE:
- Plural-collective. Use "we / us / our" throughout.
- This is the leadership group's agenda, not a personal coaching plan.
- NEVER use "you" addressed to one person. Never mention "the leader". Always "we" or "the organisation" or "the team".

EACH ITEM IS A BEHAVIOURAL STATEMENT IN ONE OF THREE BUCKETS:

KEEP — name a current practice that is working and should be protected. The shift toward our destination strategy still needs this. Single short line.
  Voice: assertive, declarative. ("Holding tight to procedure when the situation is settled.")

ADD — name a capacity to develop alongside (not instead of) what we already do. Show what it complements. The format: "Adding to <what we do>: <new discipline>."
  Voice: building. ("Adding to procedural rigour: the discipline of saying out loud when the procedure doesn't fit.")

REPLACE — name a default we are leaning on, and what takes its place. Both halves must be on the same axis (not changing topic). The format: "<current default> → <substitute>."
  Voice: confronting. ("Treating deviation as failure → Treating deviation as the first signal that something has changed.")

CONSTRAINTS — every item must:
- Be 8 to 18 words
- Sound like one sentence a leadership group could read aloud and immediately recognise
- Use plain English, no jargon ("Progressive", "Defensive", "Consistent", "Flexible", "axis", "score", "framework", "capability uplift")
- Not prescribe a Tuesday action — no specific meetings, percentages, timeframes, headcounts
- Be specific enough to be recognised in our own behaviour, generic enough to translate to different situations within ${th}

REPLACE items in particular must HAVE BITE — they should make the reader slightly uncomfortable because we already do the thing being given up. Don't soften.

THE ${selected.length} ITEMS — keep this exact order in the output:

${items}

OUTPUT FORMAT — respond with ONLY a JSON array of exactly ${selected.length} strings. Each string is the full text for that item (including the "Adding to…" or "X → Y" pattern where required). No preamble, no markdown, no code fences.`;
}

// ── HANDLER ─────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'Anthropic key not configured' });

  const { s1_answers, s2_answers, prog, def, con, flex, tobe_prog, tobe_def, tobe_con, tobe_flex, thing } = req.body;
  if (!s1_answers || !s2_answers) return res.status(400).json({ error: 'Missing s1_answers or s2_answers' });

  const th = thing || 'the organisation';
  const mindsetGap = (tobe_prog - prog) - (tobe_def - def);
  const approachGap = (tobe_flex - flex) - (tobe_con - con);
  const totalGap = Math.abs(mindsetGap) + Math.abs(approachGap);
  const sizeNote = totalGap < 20 ? 'small' : totalGap < 60 ? 'moderate' : totalGap < 100 ? 'substantial' : 'foundational';
  const fromStrategy = labelFor(prog, def, con, flex);
  const toStrategy = labelFor(tobe_prog, tobe_def, tobe_con, tobe_flex);

  // Score every question
  const scored = [];
  S1_INDICES.forEach((q, i) => {
    const lev = leverageForQ(q, s1_answers, i, mindsetGap);
    if (lev) scored.push({ q, lev, sourceText: lev.targetPole==='L'?q.l:q.r, oppositeText: lev.targetPole==='L'?q.r:q.l });
  });
  S2_INDICES.forEach((q, i) => {
    const lev = leverageForQ(q, s2_answers, i, approachGap);
    if (lev) scored.push({ q, lev, sourceText: lev.targetPole==='L'?q.l:q.r, oppositeText: lev.targetPole==='L'?q.r:q.l });
  });

  const bucketed = assignBucketsAcrossSet(scored, mindsetGap, approachGap);
  const totalNeeded = targetCount(mindsetGap, approachGap);
  const selected = selectConstrained(bucketed, totalNeeded);

  // Build the metadata for each selected item — front-end stores this with picks
  const itemMeta = selected.map(s => ({
    category: s.q.cat,
    category_name: CATS[s.q.cat],
    axis: s.q.axis,
    bucket: s.bucket,
    question_id: s.q.id,
  }));

  // Call Claude
  try {
    const prompt = buildPrompt(th, fromStrategy, toStrategy, sizeNote, selected);
    const aiResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const data = await aiResp.json();
    const text = data.content?.[0]?.text || '[]';
    let cleaned = text.replace(/```json|```/g, '').trim();
    const m = cleaned.match(/\[[\s\S]*\]/);
    if (m) cleaned = m[0];
    const itemTexts = JSON.parse(cleaned);

    if (!Array.isArray(itemTexts) || itemTexts.length !== selected.length) {
      throw new Error(`Expected ${selected.length} items from AI, got ${Array.isArray(itemTexts)?itemTexts.length:'non-array'}`);
    }

    // Combine text + metadata
    const items = itemTexts.map((text, i) => ({
      text: typeof text === 'string' ? text.trim() : String(text),
      ...itemMeta[i],
    }));

    return res.status(200).json({
      items,
      header: headerCopy(mindsetGap, approachGap),
      meta: {
        from_strategy: fromStrategy,
        to_strategy: toStrategy,
        mindset_gap: Math.round(mindsetGap),
        approach_gap: Math.round(approachGap),
        total_gap: Math.round(totalGap),
        size: sizeNote,
        bucket_counts: items.reduce((a,c)=>{ a[c.bucket]=(a[c.bucket]||0)+1; return a; }, {}),
      },
    });
  } catch (e) {
    console.error('stat-principles-generate error:', e);
    return res.status(500).json({ error: e.message });
  }
}
