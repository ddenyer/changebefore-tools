// /api/stat-group-agenda
//
// Split-aware Group Behavioural Agenda generator.
//
// Takes the array of respondents in a session, classifies each participant's
// to-be quadrant, and decides whether the room is:
//   - aligned   (≥75% in one quadrant)
//   - leaning   (50–74% in one quadrant, ≥20% in another)
//   - split    (no quadrant ≥50%)
//   - too_few  (n < 3 — show data only, skip categorisation)
//
// For aligned/leaning, generates a top-down behavioural agenda from the
// dominant shift (group as-is mean → dominant to-be quadrant). For split,
// suppresses the agenda and surfaces the directional disagreement.
//
// The bottom-up cluster (existing /api/stat-principles-cluster) is unaffected
// and remains available as a sub-toggle in the front-end.

export const config = { maxDuration: 30 };

// ── Config ───────────────────────────────────────────────────────────────
// Thresholds for state classification. Tunable later once we have workshop
// data. Defaults chosen based on the small-group rule worked through with David:
// 4-person group with 3/1 split = 75% = Aligned.
// 4-person group with 2/2 split = 50% in two quadrants = Leaning (not Split,
// because there's only one alternative direction).
const ALIGNED_THRESHOLD = 0.75;
const LEANING_THRESHOLD = 0.50;
const MIN_PARTICIPANTS = 3;

// ── Strategy classification (mirrors front-end getStrategy) ──────────────
// Args order matches front-end: defensive, progressive, consistent, flexible.
function classifyStrategy(def, prog, con, flex) {
  const max = Math.max(def, prog, con, flex);
  const min = Math.min(def, prog, con, flex);
  if (max - min < 15) return 'neutral';
  const mindset = prog > def ? 'prog' : 'def';
  const approach = flex > con ? 'flex' : 'con';
  if (mindset === 'prog' && approach === 'con') return 'performance_optimisation';
  if (mindset === 'prog' && approach === 'flex') return 'adaptive_innovation';
  if (mindset === 'def' && approach === 'con') return 'preventative_control';
  return 'mindful_action';
}

const SLABELS = {
  preventative_control: 'Preventative Control',
  mindful_action: 'Mindful Action',
  performance_optimisation: 'Performance Optimisation',
  adaptive_innovation: 'Adaptive Innovation',
  neutral: 'Neutral',
};

const SAXIS = {
  preventative_control: { mindset: 'defensive', approach: 'consistency' },
  mindful_action: { mindset: 'defensive', approach: 'flexibility' },
  performance_optimisation: { mindset: 'progressive', approach: 'consistency' },
  adaptive_innovation: { mindset: 'progressive', approach: 'flexibility' },
};

// Returns the OPPOSING quadrant — used for split detection commentary.
function opposingQuadrant(strat) {
  return {
    preventative_control: 'adaptive_innovation',
    adaptive_innovation: 'preventative_control',
    performance_optimisation: 'mindful_action',
    mindful_action: 'performance_optimisation',
    neutral: null,
  }[strat] || null;
}

// ── Group state classification ───────────────────────────────────────────
function classifyGroupState(respondents) {
  const valid = respondents.filter(r =>
    Number.isFinite(r.tobe_prog) && Number.isFinite(r.tobe_def) &&
    Number.isFinite(r.tobe_con) && Number.isFinite(r.tobe_flex)
  );
  const n = valid.length;

  // Each respondent's to-be quadrant
  const tobeQuadrants = valid.map(r =>
    classifyStrategy(r.tobe_def, r.tobe_prog, r.tobe_con, r.tobe_flex)
  );
  const asIsQuadrants = valid.map(r =>
    classifyStrategy(r.def, r.prog, r.con, r.flex)
  );

  // Count to-be quadrants
  const counts = {};
  tobeQuadrants.forEach(q => { counts[q] = (counts[q] || 0) + 1; });

  // Sort quadrants by count desc
  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const dominant = ranked[0] || null;
  const second = ranked[1] || null;

  // Group means (as-is and to-be)
  const means = {
    prog: avg(valid.map(r => r.prog)),
    def:  avg(valid.map(r => r.def)),
    con:  avg(valid.map(r => r.con)),
    flex: avg(valid.map(r => r.flex)),
    tobe_prog: avg(valid.map(r => r.tobe_prog)),
    tobe_def:  avg(valid.map(r => r.tobe_def)),
    tobe_con:  avg(valid.map(r => r.tobe_con)),
    tobe_flex: avg(valid.map(r => r.tobe_flex)),
  };
  const groupAsIs = classifyStrategy(means.def, means.prog, means.con, means.flex);
  const groupToBe = classifyStrategy(means.tobe_def, means.tobe_prog, means.tobe_con, means.tobe_flex);

  // Derive state
  let state;
  if (n < MIN_PARTICIPANTS) {
    state = 'too_few';
  } else {
    const dominantPct = dominant ? dominant[1] / n : 0;
    const secondPct = second ? second[1] / n : 0;
    if (dominantPct >= ALIGNED_THRESHOLD) {
      state = 'aligned';
    } else if (dominantPct >= LEANING_THRESHOLD) {
      // Only call it Leaning if there's a real second pole (≥20%).
      // Otherwise (e.g., 2/2 split with one quadrant having only 1 person counted twice) treat as leaning.
      // In a 4-person 2/2 split, dominantPct=0.5, secondPct=0.5 — that's a Split between two
      // quadrants.  But it could also be Leaning if the 50% lands on one direction and 50%
      // is scattered.  Use a stricter test: Split when no quadrant >= 50% AND there are 3+ distinct quadrants
      // OR when two opposing quadrants each have >=40%.  The simpler rule below matches the spec.
      state = 'leaning';
      // Special case: 50/50 between two opposing quadrants is a Split, not a Leaning.
      // Detect by checking if dominant and second are opposites and have equal counts.
      if (dominant && second &&
          dominant[1] === second[1] &&
          opposingQuadrant(dominant[0]) === second[0]) {
        state = 'split';
      }
    } else {
      state = 'split';
    }
  }

  // Per-respondent breakdown for split panel
  const respondentsWithQuadrants = valid.map((r, i) => ({
    participant_id: r.participant_id || null,
    display_name: r.respondent_name || `Participant ${i + 1}`,
    asis_quadrant: asIsQuadrants[i],
    tobe_quadrant: tobeQuadrants[i],
    is_anonymous: !r.respondent_name || !r.respondent_name.trim(),
  }));

  return {
    state,
    n,
    counts,
    dominant: dominant ? { quadrant: dominant[0], n: dominant[1], pct: dominant[1] / n } : null,
    second: second ? { quadrant: second[0], n: second[1], pct: second[1] / n } : null,
    means,
    groupAsIs,
    groupToBe,
    respondents: respondentsWithQuadrants,
  };
}

function avg(arr) {
  if (!arr.length) return 0;
  return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
}

// ── Agenda generation prompt ─────────────────────────────────────────────
function buildAgendaPrompt({ groupAnalysis, thing, sector }) {
  const { state, dominant, second, means, groupAsIs, groupToBe, n } = groupAnalysis;
  const th = thing || 'this organisation';
  const sec = sector ? ` in ${sector}` : '';

  if (state !== 'aligned' && state !== 'leaning') {
    return null; // Split state doesn't generate an agenda.
  }

  const dominantLabel = SLABELS[dominant.quadrant];
  const dominantAxis = SAXIS[dominant.quadrant] || {};
  const dominantPctText = Math.round(dominant.pct * 100);

  const leaningCaveat = state === 'leaning'
    ? `\nNOTE: This is a LEANING group, not an aligned one. ${dominantPctText}% of ${n} participants want to move toward ${dominantLabel}, but ${100 - dominantPctText}% are pulling in other directions (notably ${second ? SLABELS[second.quadrant] + ' at ' + Math.round(second.pct * 100) + '%' : 'other quadrants'}). The agenda should be confident in direction but also acknowledge the dissent — it should not pretend the room is unanimous. Where appropriate, frame items as "for the room as a whole to align around" rather than as already-agreed commitments.`
    : '';

  return `You are generating a behavioural agenda for a leadership group${sec} working on ${th}.

GROUP DIAGNOSTIC:
- As-is profile (group means): Progressive ${means.prog}, Defensive ${means.def}, Consistent ${means.con}, Flexible ${means.flex} → ${SLABELS[groupAsIs]}
- To-be profile (group means): Progressive ${means.tobe_prog}, Defensive ${means.tobe_def}, Consistent ${means.tobe_con}, Flexible ${means.tobe_flex} → ${SLABELS[groupToBe]}
- ${dominantPctText}% of ${n} participants individually want to move toward ${dominantLabel} (${dominantAxis.mindset} mindset, ${dominantAxis.approach}-leaning approach).${leaningCaveat}

YOUR TASK:
Generate a behavioural agenda for the shift this group has chosen. Three buckets:

RETAIN (2 items): What this group should KEEP doing. Practices that ALREADY support the shift toward ${dominantLabel}. Not generic best practice — practices that this kind of leadership group, doing this kind of work, in this kind of sector, must protect even as they shift.

LESS OF (4 items): What HOLDS BACK the shift toward ${dominantLabel}. Default behaviours, mindsets, or habits that the leadership group will need to consciously dial down. These should be specific to the strategic direction — not "less inefficiency" generic items, but the SPECIFIC behaviours that pull a group AWAY from ${dominantLabel}.

MORE OF (3 items): What the shift toward ${dominantLabel} REQUIRES. New disciplines, capabilities, or postures the leadership group will need to deliberately build. Again specific — what does ${dominantLabel} ASK of leaders that they currently don't do enough of?

WRITING RULES:
- Each item is one sentence, 8–18 words.
- Each item is a behaviour or stance, not an action ("decision-making that..." not "make decisions about...").
- Behaviours, not platitudes. Avoid "be bold," "embrace change," "foster innovation."
- Sector-aware where it helps but not jargon-heavy.
- Each item must be DIFFERENT from the others — no near-duplicates.

OUTPUT FORMAT — strict JSON, no markdown fences, no preamble, no commentary:
{
  "retain": ["...", "..."],
  "less": ["...", "...", "...", "..."],
  "more": ["...", "...", "..."]
}

Return ONLY the JSON object. Do not wrap it in code fences. Do not add explanatory text before or after.`;
}

// ── Pick-convergence analysis ────────────────────────────────────────────
// For aligned/leaning states, count how many of the generated agenda items
// match what 2+ participants individually picked. This becomes the "convergence
// with picks" footer in the UI.
function computeConvergence(generatedItems, respondents) {
  // Flatten all participant picks: array of { text, bucket, picked_by }
  const allPicks = [];
  respondents.forEach((r, i) => {
    if (Array.isArray(r.selected_behaviours)) {
      r.selected_behaviours.forEach(b => {
        allPicks.push({
          text: (b.text || '').toLowerCase().trim(),
          bucket: normaliseBucket(b.bucket),
          picked_by: i,
        });
      });
    }
  });

  // For each generated item, do a fuzzy match against picks.
  // "Fuzzy" here = shared significant words. Cheap stand-in for embedding similarity.
  const STOP = new Set(['the','a','an','of','to','in','on','for','and','or','that','this','with','by','from','at','as','our','your','their']);
  function tokens(s) {
    return new Set(
      String(s || '').toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/)
        .filter(w => w.length >= 4 && !STOP.has(w))
    );
  }

  let convergent = 0;
  generatedItems.forEach(item => {
    const itemTokens = tokens(item.text);
    if (itemTokens.size < 2) return;
    // Find picks in same bucket with ≥2 token overlap
    const matchingParticipants = new Set();
    allPicks.forEach(pick => {
      if (pick.bucket !== item.bucket) return;
      const pickTokens = tokens(pick.text);
      let overlap = 0;
      itemTokens.forEach(t => { if (pickTokens.has(t)) overlap++; });
      if (overlap >= 2) matchingParticipants.add(pick.picked_by);
    });
    if (matchingParticipants.size >= 2) convergent++;
  });

  return { convergent, total: generatedItems.length };
}

function normaliseBucket(b) {
  if (b === 'keep') return 'retain';
  if (b === 'add') return 'more';
  if (b === 'replace') return 'less';
  return b;
}

// ── Handler ──────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { sessionCode, respondents, thing, sector } = req.body || {};

    if (!sessionCode) return res.status(400).json({ error: 'sessionCode required' });
    if (!Array.isArray(respondents)) return res.status(400).json({ error: 'respondents must be an array' });

    // Filter out closed-session marker rows and any row missing required scores
    const real = respondents.filter(r =>
      r.respondent_name !== '__session_closed__' &&
      Number.isFinite(r.prog) && Number.isFinite(r.def) &&
      Number.isFinite(r.con) && Number.isFinite(r.flex)
    );

    const groupAnalysis = classifyGroupState(real);

    // For too_few or split, return without an agenda
    if (groupAnalysis.state === 'too_few') {
      return res.status(200).json({
        state: 'too_few',
        analysis: groupAnalysis,
        message: `Need at least ${MIN_PARTICIPANTS} respondents to compute group agenda. Currently ${groupAnalysis.n}.`,
      });
    }

    if (groupAnalysis.state === 'split') {
      return res.status(200).json({
        state: 'split',
        analysis: groupAnalysis,
      });
    }

    // Aligned or Leaning: generate the agenda
    const prompt = buildAgendaPrompt({ groupAnalysis, thing, sector });
    if (!prompt) {
      return res.status(200).json({ state: groupAnalysis.state, analysis: groupAnalysis });
    }

    const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
    if (!ANTHROPIC_KEY) {
      return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
    }

    let parsed;
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
          max_tokens: 1500,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      const data = await aiResp.json();
      if (!aiResp.ok) {
        console.error('Anthropic API non-200:', aiResp.status, data);
        return res.status(500).json({ error: 'AI provider returned ' + aiResp.status, details: data?.error?.message });
      }
      const text = data.content?.[0]?.text || '{}';
      let cleaned = text.replace(/```json|```/g, '').trim();
      const firstBrace = cleaned.indexOf('{');
      const lastBrace = cleaned.lastIndexOf('}');
      if (firstBrace >= 0 && lastBrace > firstBrace) cleaned = cleaned.slice(firstBrace, lastBrace + 1);
      parsed = JSON.parse(cleaned);
    } catch (e) {
      console.error('group-agenda AI error:', e);
      return res.status(500).json({ error: 'AI call failed: ' + (e.message || 'unknown') });
    }

    // Validate shape
    if (!Array.isArray(parsed.retain) || !Array.isArray(parsed.less) || !Array.isArray(parsed.more)) {
      return res.status(500).json({ error: 'AI response missing required arrays', parsed });
    }

    // Normalise to {text, bucket} items
    const items = [
      ...parsed.retain.map(t => ({ text: t, bucket: 'retain' })),
      ...parsed.less.map(t => ({ text: t, bucket: 'less' })),
      ...parsed.more.map(t => ({ text: t, bucket: 'more' })),
    ];

    // Compute convergence with picks (only meaningful when picks exist)
    const convergence = computeConvergence(items, real);

    return res.status(200).json({
      state: groupAnalysis.state,
      analysis: groupAnalysis,
      agenda: {
        retain: parsed.retain,
        less: parsed.less,
        more: parsed.more,
      },
      convergence,
    });
  } catch (err) {
    console.error('stat-group-agenda error:', err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
}
