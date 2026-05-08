// stat-principles-generate.js — generate a Retain / Less of / More of behavioural agenda
//
// Architecture (May 2026):
//   - Total: 9 items, every time
//   - Three buckets: retain, less, more
//   - Distribution scales by gap size:
//     * Tiny shift (<25): 7 retain / 1 less / 1 more
//     * Moderate (25-69): 4 retain / 3 less / 2 more
//     * Big (70-119): 2 retain / 4 less / 3 more
//     * Huge (120+): 1 retain / 4 less / 4 more
//   - Constraints:
//     * Each category P/E/R/D appears at least once (≥1 floor)
//     * No category contributes more than 4 items (cap)
//     * Mindset/approach axis split tracks gap proportion (4-5 / 5-4 when both active)
//   - AI generates noun-phrase items (5-12 words), grounded in the STAT framework
//
// Item format returned to client:
//   { text, original_text, bucket, category, category_name, axis, question_id }

export const config = { maxDuration: 30 };

// ── 24 SURVEY QUESTIONS ────────────────────────────────────────────────
// P=Purpose, E=People, R=Process, D=Product
const CATS = { P:'Purpose', E:'People', R:'Process', D:'Product' };

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
const S1_INDICES = QS.filter(q => q.axis === 'mindset');
const S2_INDICES = QS.filter(q => q.axis === 'approach');

// ── BUCKET TARGETS BY GAP SIZE ─────────────────────────────────────────
function bucketTargets(mindsetGap, approachGap) {
  const total = Math.abs(mindsetGap) + Math.abs(approachGap);
  if (total < 25) return { retain: 7, less: 1, more: 1 };
  if (total < 70) return { retain: 4, less: 3, more: 2 };
  if (total < 120) return { retain: 2, less: 4, more: 3 };
  return { retain: 1, less: 4, more: 4 };
}

// ── PER-QUESTION CLASSIFICATION ────────────────────────────────────────
// Every answered question produces a Retain candidate (so the Retain pool
// is never empty). Plus optionally Less and More candidates depending on
// tilt vs destination.
function classifyQuestion(q, ans, axisGap) {
  const lv = parseInt(ans.l) || 0;
  const rv = parseInt(ans.r) || 0;
  if (lv + rv === 0) return null;
  const tilt = rv - lv;
  const desiredDir = Math.sign(axisGap);
  const absGap = Math.abs(axisGap);
  const tiltMag = Math.abs(tilt);
  const tiltedToR = tilt > 0;
  const wantsR = desiredDir > 0;
  const wantsL = desiredDir < 0;
  const noGap = absGap < 8;
  const lText = q.l, rText = q.r;
  const out = { q };

  if (noGap) {
    out.retainCandidate = { text: tiltedToR || tilt === 0 ? rText : lText, polarity: tilt >= 0 ? 'R' : 'L' };
    out.score = Math.max(1, tiltMag);
    return out;
  }

  const aligns = (tiltedToR && wantsR) || (!tiltedToR && wantsL);
  const opposes = (tiltedToR && wantsL) || (!tiltedToR && wantsR);

  if (aligns) {
    out.moreCandidate = { text: tiltedToR ? rText : lText, polarity: tiltedToR ? 'R' : 'L' };
    out.retainCandidate = { text: tiltedToR ? rText : lText, polarity: tiltedToR ? 'R' : 'L' };
    out.score = tiltMag/2 + absGap/8;
    return out;
  }

  if (opposes) {
    out.lessCandidate = { text: tiltedToR ? rText : lText, polarity: tiltedToR ? 'R' : 'L' };
    out.moreCandidate = { text: tiltedToR ? lText : rText, polarity: tiltedToR ? 'L' : 'R' };
    out.retainCandidate = { text: wantsR ? rText : lText, polarity: wantsR ? 'R' : 'L' };
    out.score = tiltMag + absGap/8;
    return out;
  }

  // Neutral tilt + gap → modest pull toward destination
  out.moreCandidate = { text: wantsR ? rText : lText, polarity: wantsR ? 'R' : 'L' };
  out.retainCandidate = { text: wantsR ? rText : lText, polarity: wantsR ? 'R' : 'L' };
  out.score = absGap/12;
  return out;
}

// ── SELECTION ──────────────────────────────────────────────────────────
function selectItems(s1ans, s2ans, prog, def, con, flex, tobe_prog, tobe_def, tobe_con, tobe_flex) {
  const mindsetGap = (tobe_prog - prog) - (tobe_def - def);
  const approachGap = (tobe_flex - flex) - (tobe_con - con);
  const targets = bucketTargets(mindsetGap, approachGap);

  // Axis quota — proportional to gaps, with floors
  const TOTAL = 9;
  const mAbs = Math.abs(mindsetGap);
  const aAbs = Math.abs(approachGap);
  let axisQuota;
  if (mAbs < 8 && aAbs < 8) {
    axisQuota = { mindset: 5, approach: 4 };
  } else if (mAbs < 8) {
    axisQuota = { mindset: 1, approach: 8 };
  } else if (aAbs < 8) {
    axisQuota = { mindset: 8, approach: 1 };
  } else {
    const mShare = mAbs / (mAbs + aAbs);
    let mTarget = Math.round(mShare * TOTAL);
    mTarget = Math.max(4, Math.min(5, mTarget));
    axisQuota = { mindset: mTarget, approach: TOTAL - mTarget };
  }

  // Classify every question
  const classified = [];
  S1_INDICES.forEach((q, i) => {
    const c = classifyQuestion(q, s1ans[i] || {l:0,r:0}, mindsetGap);
    if (c) classified.push(c);
  });
  S2_INDICES.forEach((q, i) => {
    const c = classifyQuestion(q, s2ans[i] || {l:0,r:0}, approachGap);
    if (c) classified.push(c);
  });

  // Build candidate pool. Retain candidates from gap questions are down-
  // weighted so they only get picked when the Retain target needs them.
  const candidates = { retain: [], less: [], more: [] };
  classified.forEach(c => {
    const isNoGap = !c.lessCandidate && !c.moreCandidate;
    if (c.retainCandidate) {
      const retainScore = isNoGap ? c.score : c.score * 0.4;
      candidates.retain.push({ q: c.q, score: retainScore, source: c.retainCandidate, axis: c.q.axis });
    }
    if (c.lessCandidate) candidates.less.push({ q: c.q, score: c.score, source: c.lessCandidate, axis: c.q.axis });
    if (c.moreCandidate) candidates.more.push({ q: c.q, score: c.score, source: c.moreCandidate, axis: c.q.axis });
  });
  ['retain','less','more'].forEach(b => candidates[b].sort((a,b)=>b.score - a.score));

  // Selection
  const selected = [];
  const axisFilled = { mindset: 0, approach: 0 };
  const catCount = { P: 0, E: 0, R: 0, D: 0 };
  const CAT_CAP = 4;
  const isDup = (bucket, qid) => selected.find(s => s.bucket === bucket && s.q.id === qid);

  function pickFromBucket(bucket, axisHint, catHint, ignoreCap) {
    return candidates[bucket].find(c =>
      !isDup(bucket, c.q.id) &&
      (ignoreCap || catCount[c.q.cat] < CAT_CAP) &&
      (axisHint === null || c.axis === axisHint) &&
      (catHint === null || c.q.cat === catHint)
    ) || null;
  }
  function bucketsBySlack() {
    const slack = {
      retain: targets.retain - selected.filter(s => s.bucket === 'retain').length,
      less: targets.less - selected.filter(s => s.bucket === 'less').length,
      more: targets.more - selected.filter(s => s.bucket === 'more').length,
    };
    return Object.entries(slack).sort((a,b) => b[1] - a[1]).map(([b]) => b);
  }
  function bucketFull(bucket) {
    return selected.filter(s => s.bucket === bucket).length >= targets[bucket];
  }
  function pickAndCommit(bucket, axisHint, catHint) {
    let cand = pickFromBucket(bucket, axisHint, catHint, false);
    if (!cand && catHint !== null) cand = pickFromBucket(bucket, axisHint, null, false);
    if (!cand && axisHint !== null) cand = pickFromBucket(bucket, null, catHint, false);
    if (!cand) cand = pickFromBucket(bucket, null, null, false);
    if (!cand) cand = pickFromBucket(bucket, axisHint, catHint, true);
    if (!cand && catHint !== null) cand = pickFromBucket(bucket, axisHint, null, true);
    if (!cand && axisHint !== null) cand = pickFromBucket(bucket, null, catHint, true);
    if (!cand) cand = pickFromBucket(bucket, null, null, true);
    if (!cand) return false;
    selected.push({ ...cand, bucket });
    axisFilled[cand.axis]++;
    catCount[cand.q.cat]++;
    return true;
  }

  // Phase A: ensure each category appears at least once
  for (const cat of ['P','E','R','D']) {
    if (catCount[cat] > 0) continue;
    let placed = false;
    for (const bucket of bucketsBySlack()) {
      if (bucketFull(bucket)) continue;
      const cand = pickFromBucket(bucket, null, cat, false);
      if (cand) {
        selected.push({ ...cand, bucket });
        axisFilled[cand.axis]++;
        catCount[cand.q.cat]++;
        placed = true;
        break;
      }
    }
    if (!placed) {
      for (const bucket of bucketsBySlack()) {
        const cand = pickFromBucket(bucket, null, cat, true);
        if (cand) {
          selected.push({ ...cand, bucket });
          axisFilled[cand.axis]++;
          catCount[cand.q.cat]++;
          break;
        }
      }
    }
  }

  // Phase B: fill each bucket to target, axis-balanced
  ['retain','less','more'].forEach(bucket => {
    while (selected.filter(s => s.bucket === bucket).length < targets[bucket]) {
      const mDeficit = axisQuota.mindset - axisFilled.mindset;
      const aDeficit = axisQuota.approach - axisFilled.approach;
      let preferredAxis;
      if (mDeficit > 0 && aDeficit <= 0) preferredAxis = 'mindset';
      else if (aDeficit > 0 && mDeficit <= 0) preferredAxis = 'approach';
      else if (mDeficit > aDeficit) preferredAxis = 'mindset';
      else if (aDeficit > mDeficit) preferredAxis = 'approach';
      else preferredAxis = null;
      if (!pickAndCommit(bucket, preferredAxis, null)) break;
    }
  });

  // Phase C: backfill if under 9 items
  while (selected.length < 9) {
    const mDeficit = axisQuota.mindset - axisFilled.mindset;
    const aDeficit = axisQuota.approach - axisFilled.approach;
    let preferredAxis = null;
    if (mDeficit > aDeficit) preferredAxis = 'mindset';
    else if (aDeficit > mDeficit) preferredAxis = 'approach';
    let added = false;
    for (const bucket of ['more','less','retain']) {
      if (pickAndCommit(bucket, preferredAxis, null)) { added = true; break; }
    }
    if (!added) break;
  }

  // Trim to 9 if cat-floor caused overflow
  while (selected.length > 9) {
    selected.sort((a,b) => b.score - a.score);
    let removed = false;
    for (let i = selected.length - 1; i >= 0; i--) {
      const cat = selected[i].q.cat;
      const others = selected.filter((_,j) => j !== i && selected[j].q.cat === cat).length;
      if (others >= 1) {
        selected.splice(i, 1);
        removed = true;
        break;
      }
    }
    if (!removed) selected.pop();
  }

  return { items: selected, mindsetGap, approachGap, targets, axisQuota };
}

// ── STRATEGY DESCRIPTIONS (verbatim from STAT framework, 2019) ─────────
const STRATEGY_DESC = {
  'Preventative Control': {
    summary: 'Defensive + Consistent. Resilience is achieved by means of robust risk management, physical barriers, systems back-ups, safeguards and standards, which protect the organisation from threats. Returns to current state after disruption.',
    purpose: 'Maintaining the status quo and preserving existing capabilities. Ensuring basic requirements are met and consistent, repeatable functioning of day-to-day operations.',
    people: 'Analytical, plan-following. Roles and accountabilities clearly defined. Training focused on compliance.',
    process: 'Standardised, formalised, with many routines and procedures. Decision-making centralised, tasks grouped by functional departments. Rules specify what to achieve to make as few errors as possible. Ongoing monitoring.',
    product: 'Maintain capacity, defend market share or position. Customers value familiarity, dependability, reliability, sustainability.',
    at_best: 'Known problems solved using proven techniques. Standard ways of doing things perfected by fine tuning. Disruptions counteracted by planned responses.',
    blind_spots: "Creates the illusion that 'failure can't happen here'. Gradual erosion of defensive barriers. People 'go by the book' and defer to the system. Stop noticing and responding to unusual problems. Improvement stops; organisation becomes static, stale, uncompetitive.",
  },
  'Mindful Action': {
    summary: 'Defensive + Flexible. Resilience is created by people who use experience, expertise and teamwork to anticipate and adapt to threats. Creative problem-solving and improvisation. Bouncing back rather than fundamental reinvention.',
    purpose: 'Sensing environmental change and responding rapidly, creatively, heedfully. Building dynamic capabilities that adapt while retaining the essence of what we do here.',
    people: "'Healthy uneasiness' about what might go wrong. Diversity of opinion encouraged. People mobilise quickly, are nimble, empowered to act. Resilience must be accomplished every day.",
    process: 'Relatively unstructured, informal, decentralised. Adaptive, flexible, organic nature. Information rich, deliberate effort to see the full picture of the work environment.',
    product: 'Defend market share. Bespoke solutions and long-term relationships. Tailoring offerings precisely to dynamic customer demand.',
    at_best: 'Opportunities and problems noticed, understood, and addressed quickly. Shifting demands of customers, regulators, stakeholders rapidly addressed.',
    blind_spots: 'Without structure, lack of structure leads to disarray and silos. Decision-makers overwhelmed and start making bad decisions. Constantly firefighting; no time to be forward-thinking.',
  },
  'Performance Optimisation': {
    summary: 'Progressive + Consistent. Resilience formed by process optimisation, continually improving, refining and extending existing competencies. Exploiting current technologies. Improvement within the current paradigm — not blue-skies thinking.',
    purpose: 'Customer expectations met by continuously improving operating processes. Strive toward an aspirational vision and achieve defined results. Grow position and market share. Exploit existing markets, capabilities, technologies. Incremental, not breakthrough.',
    people: 'Build agreement and support for the declared direction. Recognition and reward systems drive behaviours. Organisational values promoted to align toward common expectations.',
    process: 'Efficient, streamlined operations. Centralised services to reduce cost and eradicate errors. Consistent application of operations management methodologies. Performance measured and benchmarked.',
    product: 'Mature, commoditised markets where customers value cost over choice. Narrow product/service lines, high-volume, transaction-oriented, standardised.',
    at_best: 'Maximises efficiency, delivers on quality. Maintains capability to deliver products or services and continuously improves them.',
    blind_spots: 'Singular focus on short-term productivity damages medium-term mission. Preoccupied with production over prevention; cutting costs endangers the organisation. Loses adaptive capacity. Quickly loses sight of innovation; loses to new entrants.',
  },
  'Adaptive Innovation': {
    summary: 'Progressive + Flexible. Resilience created through innovation and creating new products, services or markets. Required to resolve complex, intractable issues. Forward-thinking businesses embody the disruption in their environment.',
    purpose: 'Creative problem-solving, innovation, learning. Compete in dynamic environments and resolve complex problems. Continuous experimentation; identify new options faster than others.',
    people: 'People work together to create novel solutions. Solutions come from experiments, discoveries, invention from many places. People disrupt conventional thinking, listen to dissident voices, encourage divergent perspectives.',
    process: 'Flexible structure stimulating performance and creativity. Decentralised, low hierarchy — networked, loose, project-based, ad hoc. Constantly adapting. People supported to tolerate uncertainty.',
    product: 'Explore new markets, capabilities, technologies, business models. First mover or disruptor. Products that redefine the state of the art and render competitors obsolete.',
    at_best: 'Creative thinking and problem-solving drawing on multiple perspectives, taking risks safely. Collective strategic action with rich interactions. System-wide changes across borders and boundaries.',
    blind_spots: 'Threat-rigidity effect — cuts innovation when uncertain. Pressure to constantly innovate produces relatively incremental enhancements passed off as innovations. Excessive risks; lack of structure causes unnecessary work and silos. Loses sight of customer demand.',
  },
};

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
  if (total < 25) return "You are largely operating where you want to be. Most of the agenda below is about protecting what works.";
  if (total < 70) return "You have a moderate change ahead. A mix of things to keep, things to dial down, and things to do more of.";
  if (total < 120) return "You have a substantial shift ahead. The work is about giving up some defaults and building new disciplines.";
  return "The shift you have asked for is foundational. Most of what you do today needs to change to make room for what you want.";
}

// ── PROMPT ─────────────────────────────────────────────────────────────
function buildPrompt(state, items) {
  const th = state.thing || 'the organisation';
  const sector = state.sector || '';
  const fromStrategy = labelFor(state.prog, state.def, state.con, state.flex);
  const toStrategy = labelFor(state.tobe_prog, state.tobe_def, state.tobe_con, state.tobe_flex);
  const mindsetGap = (state.tobe_prog - state.prog) - (state.tobe_def - state.def);
  const approachGap = (state.tobe_flex - state.flex) - (state.tobe_con - state.con);
  const totalGap = Math.abs(mindsetGap) + Math.abs(approachGap);
  const sizeNote = totalGap < 25 ? 'small' : totalGap < 70 ? 'moderate' : totalGap < 120 ? 'substantial' : 'foundational';
  const fromDesc = STRATEGY_DESC[fromStrategy];
  const toDesc = STRATEGY_DESC[toStrategy];

  const itemList = items.map((it, i) => {
    return `${i+1}. CATEGORY: ${CATS[it.q.cat]} (${it.q.axis})
   QUESTION: "${it.q.q}"
   POLE LANGUAGE: "${it.source.text}"
   BUCKET: ${it.bucket.toUpperCase()}`;
  }).join('\n\n');

  return `You are writing a behavioural change agenda for a leadership group working on ${th}${sector?` in ${sector}`:''}, using the Strategic Tensions Assessment Tool (STAT) framework developed by Professor David Denyer at Cranfield School of Management.

THE STAT FRAMEWORK:
The STAT identifies four organisational resilience strategies, formed by two dimensions:
- MINDSET (vertical): Defensive (stopping bad things from happening, mitigating threats, preserving) vs Progressive (making good things happen, leveraging opportunities, achieving)
- APPROACH (horizontal): Consistency (goals, processes, routines, behaviors) vs Flexibility (perspectives, ideas, responses, actions)

The four resulting strategies are:
- Preventative Control (Defensive + Consistent) — monitoring and complying
- Mindful Action (Defensive + Flexible) — noticing and responding
- Performance Optimisation (Progressive + Consistent) — improving and exploiting
- Adaptive Innovation (Progressive + Flexible) — imagining and creating

Each strategy is described across four lenses: PURPOSE (what we're trying to achieve), PEOPLE (what we value, expect, develop), PROCESS (how we structure work and decisions), and PRODUCT (what we offer and to whom).

THIS GROUP'S DIAGNOSTIC:
- Currently operating mostly in: ${fromStrategy}
- Wants to move toward: ${toStrategy}
- Shift size: ${sizeNote}

CURRENT STRATEGY (${fromStrategy}):
- Summary: ${fromDesc.summary}
- At its best: ${fromDesc.at_best}
- Blind spots: ${fromDesc.blind_spots}

DESTINATION STRATEGY (${toStrategy}):
- Summary: ${toDesc.summary}
- Purpose: ${toDesc.purpose}
- People: ${toDesc.people}
- Process: ${toDesc.process}
- Product: ${toDesc.product}

VOICE — for every item:
- Plural-collective. Use "we / us / our" throughout.
- This is the leadership group's agenda, not a personal coaching plan.
- Never address one person ("you"). Never mention "the leader". Always "we" or "the team".

THE FOUR CATEGORIES — each item is in one of:
- PURPOSE — what we're trying to achieve, what success looks like, what we pay attention to
- PEOPLE — what we value in our people, what we expect of leadership, how people become successful here
- PROCESS — how we structure work, make decisions, coordinate activity, respond to events
- PRODUCT — what we offer, how we develop products/services, how we measure outputs, what customers value

The category determines what the item is ABOUT. A Process item should sound like work structure or decision-making. A People item should sound like beliefs, expectations, or behaviours of staff. A Product item should sound like markets, customers, or outputs. A Purpose item should sound like strategy, attention, or success.

THE THREE BUCKETS:

RETAIN — a current practice working well that should be protected. The shift toward ${toStrategy} still needs this.
  Format: noun phrase describing the practice (5-12 words).
  Voice: assertive, declarative.
  Lean on the "At its best" language of ${fromStrategy}: ${fromDesc.at_best}

LESS OF — a current default we lean on too hard. Name the cost of doing more of it.
  Format: noun phrase describing the default (5-12 words).
  Voice: confronting. Should make readers slightly uncomfortable because they recognise themselves.
  Lean on the "Blind spots" language of ${fromStrategy}: ${fromDesc.blind_spots}

MORE OF — a discipline or behaviour to dial up, pulling toward ${toStrategy}.
  Format: noun phrase describing the behaviour (5-12 words).
  Voice: building. Specific and behavioural — not abstract values.
  Lean on the language of ${toStrategy}: ${toDesc.purpose} | ${toDesc.people} | ${toDesc.process}

CONSTRAINTS — every item must:
- Be 5 to 12 words
- Be a noun phrase or descriptive clause (not a full sentence with verb stem like "Stop treating")
- Use plain English. NEVER use the framework jargon ("Progressive", "Defensive", "Consistency", "Flexibility", "Mindful Action", "Preventative Control", "Performance Optimisation", "Adaptive Innovation", "axis", "score", "framework", "quadrant")
- Not prescribe a Tuesday action — no specific meetings, percentages, timeframes, headcounts
- Be specific enough to be recognised in our own behaviour
- Be generic enough to translate to different situations within ${th}
- Match the CATEGORY assigned (Purpose / People / Process / Product) — the item must be ABOUT that lens

LESS OF items in particular must HAVE BITE — they should make the reader slightly uncomfortable because we already do the thing being named. Don't soften.

THE 9 ITEMS — keep this exact order in the output:

${itemList}

OUTPUT FORMAT — respond with ONLY a JSON array of exactly 9 strings. Each string is a short noun phrase (5-12 words) for that item. No preamble, no markdown, no code fences.`;
}

// ── HANDLER ────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'Anthropic key not configured' });

  const { s1_answers, s2_answers, prog, def, con, flex, tobe_prog, tobe_def, tobe_con, tobe_flex, thing, sector } = req.body;
  if (!Array.isArray(s1_answers) || !Array.isArray(s2_answers)) {
    return res.status(400).json({ error: 'Missing or invalid s1_answers / s2_answers' });
  }

  const sel = selectItems(s1_answers, s2_answers, prog || 0, def || 0, con || 0, flex || 0, tobe_prog || 0, tobe_def || 0, tobe_con || 0, tobe_flex || 0);
  const fromStrategy = labelFor(prog, def, con, flex);
  const toStrategy = labelFor(tobe_prog, tobe_def, tobe_con, tobe_flex);
  const totalGap = Math.abs(sel.mindsetGap) + Math.abs(sel.approachGap);
  const sizeNote = totalGap < 25 ? 'small' : totalGap < 70 ? 'moderate' : totalGap < 120 ? 'substantial' : 'foundational';

  // Build the metadata that will travel with each item
  const itemMeta = sel.items.map(it => ({
    bucket: it.bucket,
    category: it.q.cat,
    category_name: CATS[it.q.cat],
    axis: it.q.axis,
    question_id: it.q.id,
  }));

  // Call Claude
  try {
    const prompt = buildPrompt({ thing, sector, prog, def, con, flex, tobe_prog, tobe_def, tobe_con, tobe_flex }, sel.items);
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

    if (!Array.isArray(itemTexts) || itemTexts.length !== sel.items.length) {
      throw new Error(`Expected ${sel.items.length} items from AI, got ${Array.isArray(itemTexts) ? itemTexts.length : 'non-array'}`);
    }

    // Combine text + metadata. original_text is the same as text initially;
    // it gets diverged when the participant edits an item.
    const items = itemTexts.map((t, i) => {
      const itemText = typeof t === 'string' ? t.trim() : String(t);
      return {
        text: itemText,
        original_text: itemText,
        ...itemMeta[i],
      };
    });

    return res.status(200).json({
      items,
      header: headerCopy(sel.mindsetGap, sel.approachGap),
      meta: {
        from_strategy: fromStrategy,
        to_strategy: toStrategy,
        mindset_gap: Math.round(sel.mindsetGap),
        approach_gap: Math.round(sel.approachGap),
        total_gap: Math.round(totalGap),
        size: sizeNote,
        targets: sel.targets,
        bucket_counts: items.reduce((a,c) => { a[c.bucket] = (a[c.bucket]||0) + 1; return a; }, {}),
      },
    });
  } catch (e) {
    console.error('stat-principles-generate error:', e);
    return res.status(500).json({ error: e.message });
  }
}
