import { useState, useEffect } from "react";

/* ════════════════════════════════════════════════════════════════════════
   STRAWPERSON — FBaM Financial Scenario Tool  (Straw6)
   Cranfield University — Faculty of Business and Management
   v6: ONE SHARED MODEL. Built on Q3 2025/26 forecast + 2026/27 budget.
       28–30 are estimates (observed trend blended with sector CAGR).
       Comparison / observer / staff-number views removed.
   ════════════════════════════════════════════════════════════════════════ */

/* ── SHARED MODEL STORE ───────────────────────────────────────────────────
   The session IS the model. Everyone entering the same session code edits a
   single shared record. Name is attribution only (lastEditedBy).            */
const SHARED_KEY = "__shared__";
const STORE = { model: {}, sessionId: "", myName: "" };

const ENGINE_VERSION = 4;   /* v4: rate overrides namespaced by version (rateOverride_v4) so stale overrides are structurally unreadable. */

/* Rate overrides live under a version-stamped key. A newer engine literally
   cannot read an older engine's overrides — no migration timing, no timestamp
   guard, no possibility of a stale rate leaking into the forward column.       */
const RATE_KEY = "rateOverride_v" + ENGINE_VERSION;
const getRateOverrides = (m) => m?.[RATE_KEY] || {};

const mSave = (d) => {
  STORE.model = { ...STORE.model, ...d, engineVersion: ENGINE_VERSION, lastEditedBy: STORE.myName, _updated: Date.now() };
  if (STORE.sessionId) {
    fetch("/api/sl-save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: STORE.sessionId, participantName: SHARED_KEY, data: STORE.model }),
    }).catch(() => {});
  }
};
const mGet = () => STORE.model || {};

/* SAVE MODEL (performance + safe concurrent editing):
   Each step holds a LOCAL draft of the fields it edits — typing is instant,
   no network, no shared-model churn. Nothing reaches Supabase until the user
   clicks "Save & continue" (or "Save"), which commits the draft via mSave.
   useDraft(initialObj) → [draft, patch, replace]. patch(partial) merges;
   replace(obj) swaps the whole draft (used by Reset).                          */
function useDraft(init) {
  const [draft, setDraft] = useState(init);
  const patch = (partial) => setDraft(d => ({ ...d, ...partial }));
  const replace = (obj) => setDraft(obj);
  return [draft, patch, replace];
}

/* Standard footer: optional "Save" (commit, stay) + primary "Save & continue".
   commit() persists the draft; advance() calls onConfirm after committing.      */
function SaveBar({ onSave, onSaveContinue, continueLabel, saved }) {
  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: 8 }}>
      <button className="sl-btn sl-btn-outline" style={{ fontSize: 12, padding: "10px 16px" }} onClick={onSave}>
        {saved ? "Saved ✓" : "Save"}
      </button>
      <button className="sl-btn" onClick={onSaveContinue}>{continueLabel}</button>
    </div>
  );
}

/* Drop fields whose meaning changed between engine versions. Rate overrides are
   version-namespaced (RATE_KEY) so they need no migration — an old key is simply
   never read. Posture set changed across versions, so clear it on version bump. */
const migrateModel = (m) => {
  if (!m) return m;
  if (m.engineVersion !== ENGINE_VERSION) {
    delete m.blend;
    delete m.rateOverride;     /* legacy un-namespaced rates — dead, remove for tidiness */
    delete m.posture;          /* posture set changed (incr_decline added; cabinet fixed) */
    m.engineVersion = ENGINE_VERSION;
  }
  return m;
};

const syncFromSupabase = async () => {
  if (!STORE.sessionId) return;
  try {
    const resp = await fetch("/api/sl-load?sessionId=" + encodeURIComponent(STORE.sessionId) + "&t=" + Date.now());
    if (!resp.ok) return;
    const { participants } = await resp.json();
    const shared = (participants || []).find(p => p.name === SHARED_KEY);
    if (shared && !shared._wiped) {
      // last-write-wins: only adopt remote if it is newer than local
      if (!(STORE.model._updated) || nv(shared._updated) >= nv(STORE.model._updated)) {
        STORE.model = migrateModel(shared);
      }
    }
  } catch (e) {}
};

/* ════════════════════════════════════════════════════════════════════════
   DATA — anchored EXACTLY to the Cranfield SOM P&L
   q3   = Q3 FC 2025/26 (the current position / Jul 2026 baseline column)
   bud  = Budget 2026/27 (the agreed first year ahead / Jul 2027, hard figure)
   Lines < £500k in BOTH columns are folded into an "Other …" line.
   Customised is split so the SLEP teach-out is visible.
   MBA is NOT separated from award-bearing fee income.
   ════════════════════════════════════════════════════════════════════════ */
const REV_LINES = [
  { id:"hefce",        name:"HEFCE Funding – Research & Other",                 q3:1402,  bud:1373,  cagr:2,   kind:"normal",
    conf:"High",   basis:"QR / Research England recurrent grant — broadly inflation-linked, ~+2% nominal but ~0% real. Cost weight makes a business school's base ~⅓ of comparable STEM per head: that is a level effect, not a rate. Small and REF-cycle-sensitive — can swing more sharply than the sector around each submission." },
  { id:"award_bearing",name:"Award Bearing Fee Income",                         q3:11700, bud:10810, cagr:-2,  kind:"normal",
    conf:"High",   basis:"Taught master's fee income — flat to slightly negative forward. International volumes fell ~10%/yr but uncapped per-head fees have held revenue roughly flat, so this rate reflects revenue, not enrolments. (HESA / CABS.)" },
  { id:"masterships",  name:"Award Bearing Fee Income – Masterships",           q3:4597,  bud:1582,  cagr:0,   kind:"ending", endNote:"Levy / apprenticeship — no new intakes; income ends May 2027." },
  { id:"open",         name:"Professional Development Fees – Open Programmes",  q3:3159,  bud:3326,  cagr:7,   kind:"normal",
    conf:"Medium", basis:"Open-enrolment exec ed — UK proxy ~6–9%, below the ~13% global rate (UNICON). Cautious UK figure used. (Global proxy.)" },
  { id:"ced_custom",   name:"CED Customised",                                   q3:5300,  bud:5700,  cagr:10,  kind:"normal",
    conf:"Medium", basis:"Customised exec ed — fastest-growing degree-adjacent line, UK ~8–12% vs ~13.5% global. (Global proxy.)" },
  { id:"slep",         name:"CED – Non Award Bearing (SLEP)",                   q3:2746,  bud:713,   cagr:0,   kind:"ending", endNote:"Levy income ends Feb 2027; teach-out only." },
  { id:"cabinet",      name:"Cabinet Office (PLP)",                             q3:1925,  bud:1812,  cagr:0,   kind:"fixed",
    conf:"High",   basis:"Fixed-price government contract (PLP). Not subject to growth — held at the 2026/27 budget value for every subsequent year." },
  { id:"ced_other",    name:"Other customised (BGP, Entrepreneurship, CWoW)",   q3:181,   bud:270,   cagr:5,   kind:"normal",
    conf:"Low",    basis:"Small customised tail — modest growth assumed within the customised range. (Local estimate.)" },
  { id:"micro_cred",   name:"Micro-credentials (new award-bearing exec ed)",    q3:0,     bud:0,     cagr:0,   kind:"new",    target2030:0,
    conf:"Low–Med", basis:"Nascent UK market; global/European proxy ~12–18% off a very small base. Driven by your 2030 target, not this rate." },
  { id:"research_dd",  name:"Research, Design & Development",                    q3:1508,  bud:1229,  cagr:2,   kind:"normal",
    conf:"Med–High", basis:"Research grants & contracts (B&M basis) — ~2–4% nominal forward but ~0–1% real; the headline nominal growth is mostly inflation. Same underlying flat-real story as QR, by a different route. (HESA / CABS.)" },
  { id:"residences",   name:"Residences",                                       q3:617,   bud:607,   cagr:0,   kind:"normal",
    conf:null,     basis:"Not covered by the sector research — local assumption, held flat. Edit if you have a basis." },
  { id:"other_rev",    name:"Other income",                                     q3:1000,  bud:790,   cagr:0,   kind:"normal", balancing:true,
    conf:null,     basis:"Balancing line — held flat. Local assumption." },
];

const COST_LINES = [
  /* group: staff | operating | belowline */
  { id:"academic_staff", name:"Staff – Academic",                       q3:7295, bud:5741, group:"staff" },
  { id:"support_staff",  name:"Support",                                q3:1757, bud:509,  group:"staff" },
  { id:"visiting",       name:"Visiting Lecturers & consultants",       q3:422,  bud:367,  group:"staff" },
  { id:"other_staff",    name:"Other staff costs",                      q3:493,  bud:583,  group:"staff", balancing:true },
  { id:"prof_consult",   name:"Professional & consultancy services",    q3:3119, bud:2956, group:"operating" },
  { id:"commissions",    name:"Commissions and profit shares",          q3:2389, bud:1709, group:"operating" },
  { id:"bursaries_unf",  name:"Bursaries – Unfunded",                   q3:2568, bud:1987, group:"operating" },
  { id:"student_costs",  name:"Student related costs",                  q3:804,  bud:380,  group:"operating" },
  { id:"travel",         name:"Travel, accommodation and subsistence",  q3:529,  bud:685,  group:"operating" },
  { id:"course_accom",   name:"Course Accommodation",                   q3:1094, bud:1119, group:"operating" },
  { id:"other_op",       name:"Other operating costs",                  q3:2321, bud:2356, group:"operating", balancing:true },
];

/* Below-the-line items that convert the operating (contribution) surplus into
   the fully-loaded net result. Service charge held flat; loan editable. */
const UNI_CHARGE = { id:"uni_charge", name:"University service charge (TRAC)", q3:8991, bud:8991 };
const LOAN        = { id:"loan",       name:"University loan repayment",        q3:0,    bud:0    };

const STAFF_IDS     = COST_LINES.filter(l => l.group === "staff").map(l => l.id);
const OPERATING_IDS = COST_LINES.filter(l => l.group === "operating").map(l => l.id);

const YEARS      = [2026, 2027, 2028, 2029, 2030]; /* 2026=Q3, 2027=Budget, rest estimate */
const EST_YEARS  = [2028, 2029, 2030];
const COL_LABEL  = { 2026:"Q3 25/26", 2027:"Budget 26/27", 2028:"Est. 27/28", 2029:"Est. 28/29", 2030:"Est. 29/30" };
const IS_ACTUAL  = { 2026:true, 2027:true, 2028:false, 2029:false, 2030:false };

const PART_PWD   = "FBAM-straw-03!";

/* ── POSTURES (macro choices for the Changes step) ───────────────────────── */
const POSTURES = [
  { id:"end",         label:"End / Teach-out",       rate:null, note:"Wind down to £0" },
  { id:"decline",     label:"Managed decline",       rate:-15,  note:"−15% / yr" },
  { id:"incr_decline",label:"Incremental decline",   rate:-5,   note:"−5% / yr" },
  { id:"maintain",    label:"Maintain",              rate:0,    note:"Hold at budget" },
  { id:"incremental", label:"Incremental growth",    rate:5,    note:"+5% / yr" },
  { id:"radical",     label:"Radical growth",        rate:15,   note:"+15% / yr" },
];
const POSTURE_BY_ID = Object.fromEntries(POSTURES.map(p => [p.id, p]));

/* ── UTILITIES ────────────────────────────────────────────────────────────── */
const nv     = (v, fb = 0) => { const n = parseFloat(v); return isNaN(n) ? fb : n; };
const fmtK   = v => { const n = Math.round(v); return (n < 0 ? "−" : "") + "£" + Math.abs(n).toLocaleString() + "k"; };
const fmtPct = v => (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(1) + "%";
const round1 = v => Math.round(v * 10) / 10;

/* Resolve a line's base anchors (q3, bud) from the model — every figure is
   editable in §2; if not overridden it falls back to the hardcoded default.   */
function resolveBase(store, l) {
  const o = store?.[l.id] || {};
  const q3  = o.q3  !== undefined && o.q3  !== "" ? nv(o.q3)  : l.q3;
  const bud = o.bud !== undefined && o.bud !== "" ? nv(o.bud) : l.bud;
  return { q3, bud };
}
/* Live revenue lines = the fixed lines + any custom streams the room adds. */
function revLinesFor(m) {
  const custom = (m.customRev || []).map(c => ({
    id: c.id, name: c.name, q3: 0, bud: 0, cagr: 0, kind: "new", custom: true,
  }));
  return REV_LINES.concat(custom);
}

/* Observed one-year step Q3 25/26 → Budget 26/27 = the FBaM trajectory rate.
   Capped to ±15% so a tiny-base line (e.g. a £181k→£270k jump = +49%) cannot
   dominate the midpoint and produce an implausible forward rate.              */
const trendPctRaw = (l, m) => { const { q3, bud } = resolveBase(m?.baseRev, l); return q3 > 0 ? (bud - q3) / q3 * 100 : 0; };
const trendPct = (l, m) => Math.max(-15, Math.min(15, trendPctRaw(l, m)));
/* Default forward rate = midpoint of the FBaM trajectory and the sector rate.
   The trajectory captures what FBaM is actually doing; the sector rate captures
   the market. The midpoint blends the two into the forward trajectory rate.    */
const defaultRate = (l, m) => l.kind === "normal" ? round1((trendPct(l, m) + l.cagr) / 2) : l.cagr;

/* ── CALC ENGINE — single source of truth ────────────────────────────────── */
/* Project one revenue line for a year, honouring overrides, postures, blend. */
function projRev(l, yr, m) {
  const { q3, bud } = resolveBase(m.baseRev, l);
  if (yr === 2026) return q3;
  if (yr === 2027) return bud;                   /* budget anchor (editable in §2) */
  const ovr = m._ignoreRevOverride ? undefined : m.revOverride?.[yr]?.[l.id];
  if (ovr !== undefined && ovr !== "") return nv(ovr);
  const steps = yr - 2027;                        /* 1,2,3 for 2028,29,30 */
  if (l.kind === "ending") return 0;              /* masterships / SLEP teach out */
  if (l.kind === "fixed") return bud;             /* fixed-price contract — held at budget */
  if (l.kind === "new") {
    const target = nv(m.newTarget?.[l.id], l.target2030 || 0);
    return target * (steps / 3);                  /* linear ramp 2027→2030 */
  }
  const postureId = m.posture?.[l.id];
  if (postureId) {
    const p = POSTURE_BY_ID[postureId];
    if (p.rate === null) { const glide = [0.5, 0.25, 0][steps - 1]; return bud * glide; }
    return bud * Math.pow(1 + p.rate / 100, steps);
  }
  /* Forward rate: sector default unless the user has set an explicit override
     in THIS version's field (rateOverride). The legacy 'blend' field is never
     read — old auto-computed rates cannot leak in.                            */
  const stored = getRateOverrides(m)[l.id];
  const rate = stored !== undefined && stored !== "" ? nv(stored) : defaultRate(l, m);
  return bud * Math.pow(1 + rate / 100, steps);
}

/* ── Forward assumptions (editable in §7) ─────────────────────────────────── */
const DEFAULT_INFLATION = 2.5;   /* % p.a. applied to COSTS only — revenue rates are already nominal */
const DEFAULT_MARGINAL  = 30;    /* % of revenue growth ABOVE the budget level taken as cost */
const inflationPct = (m) => nv(m.inflationPct, DEFAULT_INFLATION);
const marginalRate = (m) => nv(m.marginalCostPct, DEFAULT_MARGINAL);

/* Project one cost line for a year. Trajectory holds the REAL cost flat at the
   budget, then applies inflation forward. Revenue CAGRs are already nominal,
   so inflation is applied to costs only — adding it to revenue would double-
   count. The marginal cost of revenue GROWTH is handled at aggregate level.    */
function projCost(l, yr, m) {
  const { q3, bud } = resolveBase(m.baseCost, l);
  if (yr === 2026) return q3;
  if (yr === 2027) return bud;
  const ovr = m._ignoreRevOverride ? undefined : m.costOverride?.[yr]?.[l.id];
  if (ovr !== undefined && ovr !== "") return nv(ovr);
  const steps = yr - 2027;
  return bud * Math.pow(1 + inflationPct(m) / 100, steps);   /* budget, inflated */
}

/* Service charge — editable anchors (§2) plus per-estimate-year override (§7) */
function uniFor(yr, m) {
  const ov = m.uniByYear?.[yr];
  if (ov !== undefined && ov !== "") return nv(ov);
  const o = m.baseUni || {};
  if (yr === 2026) return o.q3 !== undefined && o.q3 !== "" ? nv(o.q3) : UNI_CHARGE.q3;
  return o.bud !== undefined && o.bud !== "" ? nv(o.bud) : UNI_CHARGE.bud;
}
const loanFor = (yr, m) => nv(m.loanByYear?.[yr], 0);

/* Budget-year total revenue (the baseline above which growth carries marginal cost) */
const budgetRevTotal = (m) => revLinesFor(m).reduce((s, l) => s + projRev(l, 2027, m), 0);

/* Whole-year aggregates */
function yearKpis(yr, m) {
  const revTotal   = revLinesFor(m).reduce((s, l) => s + projRev(l, yr, m), 0);
  const staffTotal = COST_LINES.filter(l => l.group === "staff").reduce((s, l) => s + projCost(l, yr, m), 0);
  const opTotal    = COST_LINES.filter(l => l.group === "operating").reduce((s, l) => s + projCost(l, yr, m), 0);
  const baseCost   = staffTotal + opTotal;       /* budget costs, inflated */
  /* Marginal cost of revenue growth: for every £1 of revenue above the budget
     level, add (marginal rate %) of cost. Applies only to estimate years and
     only to net growth (a shrinking line carries no marginal cost credit).     */
  const growth     = yr >= 2028 ? Math.max(0, revTotal - budgetRevTotal(m)) : 0;
  const marginalCost = growth * marginalRate(m) / 100;
  const operatingCost = baseCost + marginalCost;
  const contribution  = revTotal - operatingCost;
  const uni   = uniFor(yr, m);
  const loan  = loanFor(yr, m);
  const net   = contribution - uni - loan;
  const netPct = revTotal > 0 ? net / revTotal * 100 : 0;
  const contribPct = revTotal > 0 ? contribution / revTotal * 100 : 0;
  return { revTotal, staffTotal, opTotal, baseCost, marginalCost, operatingCost, contribution, contribPct, uni, loan, net, netPct };
}

/* Target path: linear from 2027 net% to the 2030 target */
function targetPath(m) {
  const tgt = nv(m.targetPct, 7.5);
  const k27 = yearKpis(2027, m).netPct;
  return {
    2027: round1(k27),
    2028: round1(k27 + (tgt - k27) * (1 / 3)),
    2029: round1(k27 + (tgt - k27) * (2 / 3)),
    2030: round1(tgt),
  };
}

const surplusColor = v => v >= 0 ? "#2d7d46" : "#b83232";

/* ── SOLVE TO TARGET ──────────────────────────────────────────────────────────
   Given the per-year net% targets, find the configuration that hits them by
   growing the three expandable lines — CED Customised, Open Programmes and
   Micro-credentials — holding every other line on its trajectory.
   Solve revTotal for a net% target g, with marginal cost rate c and budget rev B:
     R = (baseCost − c·B + uni + loan) / (1 − c − g)
   then distribute the shortfall across the three growth lines.                  */
const SOLVE_LINES = ["ced_custom", "open", "micro_cred"];

/* Trajectory value of a line ignoring solver/postures/overrides (rate or kind only) */
function projRevTrajectory(l, yr, m) {
  const { bud } = resolveBase(m.baseRev, l);
  const steps = yr - 2027;
  if (yr === 2027) return bud;
  if (l.kind === "ending") return 0;
  if (l.kind === "fixed") return bud;
  if (l.kind === "new") return 0;
  const stored = getRateOverrides(m)[l.id];
  const rate = stored !== undefined && stored !== "" ? nv(stored) : defaultRate(l, m);
  return bud * Math.pow(1 + rate / 100, steps);
}

/* §4/§5 strategic strength for each solve line (≥1). Mirrors the suggestion
   engine's signals for Customised and Open; Micro is a fixed modest bet.        */
function solveStrength(m) {
  const t = k => nv(m.purposeTensions?.[k], DEFAULT_TENSIONS[k]);
  const g = name => nv(m.purposeGroups?.[name], DEFAULT_GROUP_SCORES[name] || 5);
  const grow = t("profit") <= 40, cut = t("profit") >= 60;
  const focused = t("breadth") <= 40;
  const highEnd = t("market") <= 40, mass = t("market") >= 60, postExp = t("experience") <= 40;
  let custom = 0;
  custom += g("Organisations commissioning exec ed") >= 8 ? 2 : 0;
  custom += highEnd ? 1 : 0; custom += grow ? 1 : 0; custom -= cut ? 1 : 0; custom += focused ? 1 : 0;
  let open = 0;
  open += g("Exec education delegates") >= 8 ? 2 : 0;
  open += postExp ? 1 : 0; open += mass ? 1 : 0; open += grow ? 1 : 0; open -= cut ? 1 : 0;
  return {
    ced_custom: 1 + Math.max(0, custom) * 0.5,
    open:       1 + Math.max(0, open) * 0.5,
    micro_cred: 1.2,
  };
}

/* Micro-credentials ramp toward the £1,000k ceiling: 300 / 600 / 1000. Fixed
   input (not solved) — it is a deliberate new-business build, not a residual.   */
const MICRO_RAMP = { 2028: 300, 2029: 600, 2030: 1000 };

function solveYear(yr, m, targetPct) {
  const c = marginalRate(m) / 100;
  const B = budgetRevTotal(m);
  const baseCost = COST_LINES.reduce((s, l) => s + projCost(l, yr, m), 0);
  const uni = uniFor(yr, m), loan = loanFor(yr, m);
  const g = targetPct / 100;
  const denom = 1 - c - g;
  if (denom <= 0) return null;
  const Rneeded = (baseCost - c * B + uni + loan) / denom;
  const lines = revLinesFor(m);
  const baselineOthers = lines.filter(l => !SOLVE_LINES.includes(l.id))
    .reduce((s, l) => s + projRevTrajectory(l, yr, m), 0);

  /* Micro is a fixed ramp; it supplies a known amount, so the remaining need is
     split between the two uncapped lines (Customised, Open) by strategic strength.
     This makes the total meet the target exactly — no overshoot from capping.    */
  const micro = MICRO_RAMP[yr] || 0;
  const remain = Rneeded - baselineOthers - micro;        /* Customised + Open must supply this */
  const strength = solveStrength(m);
  const wsum = strength.ced_custom + strength.open || 1;
  let custom = Math.max(0, remain * strength.ced_custom / wsum);
  let open   = Math.max(0, remain * strength.open / wsum);
  /* Open has less headroom than Customised — cap it at 60% of Customised, pushing
     the excess onto Customised. Keep custom + open = remain so the total still
     meets the target exactly: if open > 0.6·custom, set open = 0.6·(remain/1.6).  */
  const OPEN_MAX_RATIO = 0.6;
  if (open > OPEN_MAX_RATIO * custom && remain > 0) {
    custom = remain / (1 + OPEN_MAX_RATIO);
    open   = remain - custom;                             /* = 0.6·custom */
  }
  const alloc = { micro_cred: micro, ced_custom: custom, open: open };
  return { Rneeded, alloc, baselineOthers, remain };
}

/* Build solved revOverride map + required CAGR per solve line. */
function solvedModel(m) {
  const tp = targetPath(m);
  const rev = { ...(m.revOverride || {}) };
  const cagr = {};
  [2028, 2029, 2030].forEach(yr => {
    const sol = solveYear(yr, m, tp[yr]);
    if (!sol) return;
    rev[yr] = { ...(rev[yr] || {}) };
    SOLVE_LINES.forEach(id => { rev[yr][id] = Math.round(sol.alloc[id]); });
  });
  SOLVE_LINES.forEach(id => {
    const l = revLinesFor(m).find(x => x.id === id);
    const bud = id === "micro_cred" ? 0 : resolveBase(m.baseRev, l).bud;
    const v2030 = rev[2030]?.[id] || 0;
    cagr[id] = (bud > 0 && v2030 > 0) ? round1((Math.pow(v2030 / bud, 1 / 3) - 1) * 100) : null;
  });
  return { rev, cagr };
}

/* ── SUGGESTION ENGINE — §4 (who) + §5 (positioning) inform §6 (changes) ──── */
/* Returns { posture, why } for a revenue line, or null for locked/new lines. */
function suggestPosture(l, m) {
  if (l.kind === "ending" || l.kind === "new" || l.kind === "fixed" || l.custom) return null;
  const t = k => nv(m.purposeTensions?.[k], DEFAULT_TENSIONS[k]);   /* 0..100 */
  const g = name => nv(m.purposeGroups?.[name], DEFAULT_GROUP_SCORES[name] || 5); /* 1..9 */
  const grow = t("profit") <= 40, cut = t("profit") >= 60;          /* grow revenue vs cut cost */
  const focused = t("breadth") <= 40, wide = t("breadth") >= 60;
  const research = t("research") >= 60, teaching = t("research") <= 40;
  const preExp = t("experience") >= 60, postExp = t("experience") <= 40;
  const highEnd = t("market") <= 40, mass = t("market") >= 60;
  const intl = t("geography") <= 40;
  const reasons = [];
  let score = 0;  /* + grow, − shrink */

  const consider = (cond, w, why) => { if (cond) { score += w; if (w !== 0 && why) reasons.push(why); } };

  switch (l.id) {
    case "ced_custom":
      consider(g("Organisations commissioning exec ed") >= 8, 2, "you made commissioning organisations a top priority");
      consider(highEnd, 1, "you positioned at the high-end executive market");
      consider(grow, 1, "you chose to grow revenue"); consider(cut, -1, "you chose to cut the cost base");
      consider(focused, 1, "customised is core to a focused portfolio");
      break;
    case "cabinet":
      consider(g("Policymakers / government") >= 8, 2, "you prioritised policymakers / government");
      consider(g("Policymakers / government") <= 3, -1, "government ranks low in your priorities");
      consider(grow, 1, "you chose to grow revenue");
      break;
    case "open":
      consider(g("Exec education delegates") >= 8, 2, "you prioritised exec-education delegates");
      consider(postExp, 1, "open programmes serve a post-experience focus");
      consider(mass, 1, "open programmes reach a broader market"); consider(grow, 1, "you chose to grow revenue");
      consider(cut, -1, "you chose to cut the cost base");
      break;
    case "award_bearing":
      consider(g("FT students (MSc, MBA)") >= 8 || g("PT students (MSc, MBA)") >= 8, 2, "you prioritised degree students");
      consider(preExp, 1, "you leaned pre-experience");
      consider(postExp, -1, "you leaned post-experience, away from degrees");
      consider(cut, -1, "you chose to cut the cost base"); consider(grow, 1, "you chose to grow revenue");
      break;
    case "research_dd":
      consider(research, 2, "you positioned as research-intensive");
      consider(teaching, -2, "you positioned as teaching-intensive");
      consider(g("Research partners and funders") >= 8, 1, "you prioritised research partners and funders");
      break;
    case "hefce":
      consider(research, 1, "research funding follows a research-intensive stance");
      consider(teaching, -1, "a teaching-intensive stance reduces reliance on research funding");
      break;
    case "ced_other":
      consider(wide, 1, "these fit a wide portfolio"); consider(focused, -1, "a focused portfolio trims the long tail");
      break;
    case "residences":
      consider(cut, -1, "you chose to cut the cost base"); consider(intl, 1, "international cohorts use residential delivery");
      break;
    default: break;
  }

  /* Strategic intent (score) is combined with the line's own trajectory: the
     midpoint forward rate from §3. A line the market/trajectory says is
     declining cannot be pushed to growth unless strategic intent is strong,
     and vice versa — so award-bearing (declining) lands at decline, not growth,
     unless you deliberately prioritise it.                                     */
  const traj = defaultRate(l, m);           /* the midpoint forward rate, % */
  const trajScore = traj <= -10 ? -2 : traj < -1 ? -1 : traj <= 1 ? 0 : traj < 8 ? 1 : 2;
  let combined = score + trajScore;

  /* Trajectory acts as a brake: a line whose own trajectory is clearly
     declining is not suggested for growth unless strategic intent is strong
     and deliberate (score >= 4). This stops e.g. award-bearing being proposed
     for growth when the market and FBaM's own numbers say it is shrinking.     */
  if (traj < -1 && score < 4) combined = Math.min(combined, -1);
  if (traj > 8 && score > -3) combined = Math.max(combined, 1);

  let posture;
  if (combined >= 3) posture = "radical";
  else if (combined >= 1) posture = "incremental";
  else if (combined === 0) posture = "maintain";
  else if (combined === -1) posture = "incr_decline";
  else if (combined === -2) posture = "decline";
  else posture = "end";

  /* Reasons: keep only those that actually fired with non-default weight, plus
     the trajectory, so we don't leak default-tension noise like "grow revenue". */
  const why = reasons.length
    ? [...reasons.slice(0, 2), `the trajectory is ${fmtPct(traj)}/yr`].slice(0, 2).join("; ")
    : `the trajectory is ${fmtPct(traj)}/yr`;
  return { posture, why };
}

function allSuggestions(m) {
  const out = {};
  REV_LINES.forEach(l => { const s = suggestPosture(l, m); if (s) out[l.id] = s.posture; });
  return out;
}

/* ── PURPOSE / POSITIONING DATA (retained; default numbers unchanged) ─────── */
const PURPOSE_GROUPS = [
  "FT students (MSc, MBA)","PT students (MSc, MBA)","Exec education delegates",
  "Organisations commissioning exec ed","Research partners and funders","Doctoral students",
  "The university itself","The management and leadership profession","Alumni",
  "Policymakers / government","Staff","Feeder partners","Industrial partners",
];
const DEFAULT_GROUP_SCORES = {
  "FT students (MSc, MBA)":6,"PT students (MSc, MBA)":4,"Exec education delegates":8,
  "Organisations commissioning exec ed":9,"Research partners and funders":5,"Doctoral students":4,
  "The university itself":7,"The management and leadership profession":7,"Alumni":9,
  "Policymakers / government":4,"Staff":7,"Feeder partners":4,"Industrial partners":6,
};
const PURPOSE_TENSIONS = [
  { key:"research",   l:"Teaching intensive",  r:"Research intensive",  desc:"Where should FBaM invest most?" },
  { key:"theory",     l:"Applied / impact",    r:"Theory led",          desc:"How should knowledge be generated and shared?" },
  { key:"experience", l:"Post-experience",     r:"Pre-experience",      desc:"Who should be the primary customers?" },
  { key:"market",     l:"High-end executive",  r:"Mass market",         desc:"Which end of the market should FBaM target?" },
  { key:"geography",  l:"International",        r:"Domestic",            desc:"Where should the focus be?" },
  { key:"profit",     l:"Grow revenue",        r:"Cut cost base",       desc:"Primary route to an improved financial position?" },
  { key:"breadth",    l:"Focused depth",       r:"Wide portfolio",      desc:"Many programmes, or fewer done exceptionally?" },
  { key:"staffing",   l:"Flexible staffing",   r:"Fixed staffing",      desc:"Lean on associates, or invest in faculty?" },
];
const DEFAULT_TENSIONS = { research:20, theory:11, experience:37, market:42, geography:49, profit:24, breadth:34, staffing:42 };

/* ── THEME DATA (allocation by editable % — no staff numbers) ─────────────── */
const THEME_DATA = [
  { id:"btg",   name:"Business Transformation & Growth",          defPct:42 },
  { id:"psl",   name:"People, Skills & Leadership",               defPct:15 },
  { id:"scpss", name:"Supply Chain, Projects & Sustainable Sys.", defPct:43 },
];
const PRODUCT_CATS = [
  { id:"exec_ed",  label:"Customised / Exec Ed",   color:"#e07030" },
  { id:"open",     label:"Open Programmes",        color:"#2d7d46" },
  { id:"award",    label:"Award-Bearing",          color:"#1a4fa0" },
  { id:"research", label:"Research & Development",  color:"#b87a20" },
  { id:"other",    label:"Residences & Other",     color:"#888" },
];
const DEFAULT_MIXES = {
  btg:   { exec_ed:55, open:20, award:10, research:10, other:5 },
  psl:   { exec_ed:30, open:35, award:20, research:10, other:5 },
  scpss: { exec_ed:25, open:15, award:30, research:20, other:10 },
};

/* ── CSS ──────────────────────────────────────────────────────────────────── */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400&family=DM+Sans:wght@300;400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');
*{box-sizing:border-box;margin:0;padding:0;}
body{background:#f0ede8;font-family:'DM Sans',sans-serif;color:#1a1a1a;}
.sl{min-height:100vh;display:flex;flex-direction:column;background:#f0ede8;}
.sl-entry{max-width:600px;margin:0 auto;padding:48px 24px;}
.sl-brand{font-family:'DM Sans',sans-serif;font-weight:400;font-size:13px;letter-spacing:3px;text-transform:uppercase;color:#888;margin-bottom:8px;}
.sl-brand-sub{font-family:'Cormorant Garamond',serif;font-weight:400;font-size:32px;color:#1a1a1a;line-height:1.2;margin-bottom:6px;}
.sl-brand-org{font-family:'DM Sans',sans-serif;font-weight:400;font-size:13px;color:#888;margin-bottom:32px;}
.sl-overview{margin-bottom:32px;}
.sl-overview p{font-family:'DM Sans',sans-serif;font-weight:400;font-size:17px;line-height:1.7;color:#444;margin-bottom:16px;}
.sl-overview .sl-disc{border-top:1px solid #d8d3cb;padding-top:16px;margin-top:4px;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:400;color:#777;line-height:1.7;}
.sl-overview .sl-disc strong{font-size:11px;font-weight:600;color:#1a1a1a;letter-spacing:0.5px;}
.sl-rule{border:none;border-top:1px solid #d8d3cb;margin:24px 0;}
.sl-label{display:block;font-family:'DM Sans',sans-serif;font-size:15px;font-weight:400;color:#1a1a1a;margin-bottom:8px;}
.sl-field{margin-bottom:20px;}
.sl-input{width:100%;padding:12px 14px;border:1px solid #d8d3cb;border-radius:4px;font-family:'DM Sans',sans-serif;font-size:15px;font-weight:400;color:#1a1a1a;background:#f0ede8;outline:none;transition:border-color 0.15s;}
.sl-input:focus{border-color:#1a1a1a;}
.sl-pw-wrap{position:relative;}
.sl-pw-wrap .sl-input{padding-right:40px;}
.sl-pw-eye{position:absolute;right:12px;top:50%;transform:translateY(-50%);cursor:pointer;color:#aaa;background:none;border:none;padding:0;line-height:1;font-size:14px;}
.sl-btn{display:inline-flex;align-items:center;justify-content:center;padding:14px 24px;background:#e07030;color:#fff;border:none;border-radius:4px;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:600;letter-spacing:0.5px;cursor:pointer;transition:background 0.15s;}
.sl-btn:hover{background:#c85e22;}
.sl-btn:disabled{opacity:0.35;cursor:default;}
.sl-btn-outline{background:transparent;color:#e07030;border:1px solid #e07030;}
.sl-btn-outline:hover{background:#fdf5f0;}
.sl-err{font-family:'DM Sans',sans-serif;font-size:13px;color:#e07030;margin-bottom:16px;}
.sl-shell{display:flex;flex-direction:column;min-height:100vh;background:#f0ede8;}
.sl-header{background:#f0ede8;border-bottom:1px solid #d8d3cb;padding:12px 24px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:100;}
.sl-header-title{font-family:'DM Sans',sans-serif;font-size:12px;font-weight:600;letter-spacing:0.5px;color:#1a1a1a;}
.sl-header-right{font-family:'DM Sans',sans-serif;font-size:11px;color:#888;}
.sl-tabs{background:#f0ede8;border-bottom:1px solid #d8d3cb;padding:0 24px;display:flex;gap:0;overflow-x:auto;}
.sl-tab{padding:14px 16px;font-family:'DM Sans',sans-serif;font-size:11px;font-weight:500;color:#aaa;border-bottom:2px solid transparent;white-space:nowrap;cursor:pointer;}
.sl-tab.active{color:#e07030;border-bottom-color:#e07030;}
.sl-tab.done{color:#2d7d46;}
.sl-content{max-width:820px;margin:0 auto;padding:40px 24px;width:100%;}
.sl-back{background:none;border:none;font-family:'DM Sans',sans-serif;font-size:12px;color:#888;cursor:pointer;padding:0;margin-bottom:24px;display:inline-flex;align-items:center;gap:6px;}
.sl-back:hover{color:#e07030;}
.sl-confirmed-banner{background:#f0faf4;border:1px solid #2d7d46;border-radius:4px;padding:12px 16px;margin-bottom:24px;font-family:'DM Sans',sans-serif;font-size:13px;color:#2d7d46;}
.sl-step-h{font-family:'Cormorant Garamond',serif;font-weight:400;font-size:28px;color:#1a1a1a;margin-bottom:16px;}
.sl-step-lead{font-family:'DM Sans',sans-serif;font-size:17px;color:#666;line-height:1.7;margin-bottom:24px;}
.sl-prompt{border-left:3px solid #e07030;padding:12px 16px;margin-bottom:24px;font-family:'DM Sans',sans-serif;font-size:17px;color:#444;line-height:1.7;background:#ebe7e1;}
.sl-note-box{background:#ebe7e1;border:1px solid #d8d3cb;border-radius:4px;padding:12px 14px;font-family:'DM Sans',sans-serif;font-size:13px;color:#666;line-height:1.7;margin-bottom:24px;}
.sl-slider-wrap{margin:24px 0;}
.sl-slider-val{font-family:'IBM Plex Mono',monospace;font-size:56px;font-weight:500;color:#e07030;text-align:center;line-height:1;}
.sl-slider-desc{font-family:'DM Sans',sans-serif;font-size:13px;color:#666;text-align:center;margin:8px 0 20px;}
.sl-slider{-webkit-appearance:none;appearance:none;width:100%;height:4px;border-radius:2px;background:#d8d3cb;outline:none;}
.sl-slider::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:20px;height:20px;border-radius:50%;background:#e07030;cursor:pointer;}
.sl-slider::-moz-range-thumb{width:20px;height:20px;border-radius:50%;background:#e07030;cursor:pointer;border:none;}
.sl-slider-range{display:flex;justify-content:space-between;font-family:'DM Sans',sans-serif;font-size:11px;color:#aaa;margin-top:8px;}
.sl-pl{width:100%;border-collapse:collapse;margin-bottom:8px;}
.sl-pl th{font-family:'DM Sans',sans-serif;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.6px;color:#888;padding:8px 8px;border-bottom:2px solid #d8d3cb;text-align:right;}
.sl-pl th:first-child{text-align:left;}
.sl-pl td{padding:6px 8px;border-bottom:1px solid #e8e4de;font-family:'DM Sans',sans-serif;font-size:13px;color:#1a1a1a;}
.sl-pl td.mono{font-family:'IBM Plex Mono',monospace;text-align:right;}
.sl-pl .grp{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#888;background:#e8e4de;padding-top:8px;}
.sl-pl .sub td{font-weight:700;border-top:1px solid #1a1a1a;background:#faf8f5;}
.sl-pl .net td{font-weight:700;border-top:2px solid #1a1a1a;background:#1a1a1a;color:#f0ede8;}
.sl-pl .net td.mono{color:#fff;}
.sl-pl .below td{color:#666;font-style:italic;}
.sl-num{font-family:'IBM Plex Mono',monospace;font-size:13px;font-weight:400;color:#1a1a1a;border:1px solid #d8d3cb;border-radius:4px;padding:5px 6px;width:78px;text-align:right;background:#fff;}
.sl-num:focus{outline:none;border-color:#1a1a1a;}
.sl-kpis{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:24px;}
.sl-kpi{background:#ebe7e1;padding:12px 16px;border-radius:4px;border-left:3px solid #e07030;min-width:120px;}
.sl-kpi .l{font-family:'DM Sans',sans-serif;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:#888;margin-bottom:3px;}
.sl-kpi .v{font-family:'IBM Plex Mono',monospace;font-size:16px;font-weight:700;color:#e07030;}
@media print{.sl-header,.sl-tabs,.sl-back,.no-print{display:none!important;}body{background:#fff!important;}.sl-content{max-width:100%!important;padding:12px!important;}*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;}}
@keyframes spin{to{transform:rotate(360deg);}}
`;

/* ── COMMON COMPONENTS ────────────────────────────────────────────────────── */
function BackBtn({ onClick }) { return <button className="sl-back" onClick={onClick}>← Back</button>; }
function ConfirmedBanner({ n }) { return <div className="sl-confirmed-banner">✓ Step {n} confirmed</div>; }
function NumInput({ value, onChange, min, step = 1, width = 90 }) {
  return <input type="number" className="sl-num" style={{ width }} value={value} step={step} min={min}
    onChange={e => onChange(e.target.value)} />;
}

/* ── REUSABLE P&L TABLE — the recognisable Cranfield format ───────────────── */
/* years: year keys to show. editBase: make the Q3+Budget anchor cells editable
   (§2). editYears: estimate years whose cells are editable (§7).
   onCell(kind,yr,id,val): kind = "rev" | "cost" | "uni" | "loan".              */
function PLTable({ m, years, editBase = false, editYears = [], onCell, compact = false, showCagr = false }) {
  const isBaseYr = (yr) => yr === 2026 || yr === 2027;
  const baseCol  = (yr) => yr === 2026 ? "q3" : "bud";

  /* CAGR 2027 budget → 2030, shown in a right-hand column when showCagr is set.
     Returns a formatted string; handles zero/negative bases gracefully.          */
  const cagrCell = (v2027, v2030) => {
    if (!showCagr) return null;
    let label;
    if (v2027 <= 0 && v2030 <= 0) label = "—";
    else if (v2027 <= 0) label = "new";                       /* grew from nothing */
    else if (v2030 <= 0) label = "→ 0";                       /* wound down */
    else label = (v2030 >= v2027 ? "+" : "") + round1((Math.pow(v2030 / v2027, 1 / 3) - 1) * 100) + "%";
    const col = label === "—" || label === "new" ? "#aaa" : label.startsWith("-") || label === "→ 0" ? "#b83232" : "#2d7d46";
    return <td className="mono" style={{ color: col, fontSize: 12 }}>{label}</td>;
  };

  const cell = (kind, l, yr) => {
    const val = kind === "rev" ? projRev(l, yr, m) : projCost(l, yr, m);
    const baseEditable = editBase && isBaseYr(yr);
    const estEditable  = editYears.includes(yr) && IS_ACTUAL[yr] === false && !(kind === "rev" && l.kind === "ending");
    if (baseEditable || estEditable) {
      const store = baseEditable
        ? (kind === "rev" ? m.baseRev : m.baseCost)?.[l.id]?.[baseCol(yr)]
        : (kind === "rev" ? m.revOverride : m.costOverride)?.[yr]?.[l.id];
      return <td key={yr} className="mono"><NumInput width={72} step={10}
        value={store !== undefined && store !== "" ? store : Math.round(val)}
        onChange={v => onCell(kind, yr, l.id, v)} /></td>;
    }
    return <td key={yr} className="mono">{fmtK(val)}</td>;
  };

  const uniLoanCell = (kind, yr) => {
    const cur = kind === "uni" ? uniFor(yr, m) : loanFor(yr, m);
    const editable = (editBase && isBaseYr(yr)) || editYears.includes(yr);
    if (editable) {
      const store = kind === "uni"
        ? (isBaseYr(yr) ? m.baseUni?.[baseCol(yr)] : m.uniByYear?.[yr])
        : m.loanByYear?.[yr];
      return <td key={yr} className="mono"><NumInput width={64} step={10}
        value={store !== undefined && store !== "" ? store : Math.round(cur)}
        onChange={v => onCell(kind, yr, null, v)} /></td>;
    }
    return <td key={yr} className="mono">{"(" + fmtK(cur) + ")"}</td>;
  };

  const yr = (fn) => years.map(y => <td key={y} className="mono">{fn(y)}</td>);
  const revLines = revLinesFor(m);

  return (
    <div style={{ overflowX: "auto", marginBottom: 16 }}>
      <table className="sl-pl" style={{ minWidth: compact ? 420 : 560 }}>
        <thead><tr>
          <th>Line (£k)</th>
          {years.map(y => <th key={y}>{COL_LABEL[y]}{IS_ACTUAL[y] ? "" : " *"}</th>)}
          {showCagr && <th title="Compound annual growth rate, 2026/27 budget → 2029/30">CAGR 27→30</th>}
        </tr></thead>
        <tbody>
          <tr><td className="grp" colSpan={years.length + 1 + (showCagr ? 1 : 0)}>Income</td></tr>
          {revLines.map(l => (
            <tr key={l.id}>
              <td>{l.name}{l.kind === "ending" ? " ⟶ 0" : ""}{l.custom ? " (new)" : ""}</td>
              {years.map(y => cell("rev", l, y))}
              {cagrCell(projRev(l, 2027, m), projRev(l, 2030, m))}
            </tr>
          ))}
          <tr className="sub"><td>TOTAL INCOME</td>{yr(y => fmtK(yearKpis(y, m).revTotal))}{cagrCell(yearKpis(2027, m).revTotal, yearKpis(2030, m).revTotal)}</tr>

          <tr><td className="grp" colSpan={years.length + 1 + (showCagr ? 1 : 0)}>Staff costs</td></tr>
          {COST_LINES.filter(l => l.group === "staff").map(l => (
            <tr key={l.id}><td>{l.name}</td>{years.map(y => cell("cost", l, y))}{cagrCell(projCost(l, 2027, m), projCost(l, 2030, m))}</tr>
          ))}
          <tr className="sub"><td>Total Staff Costs</td>{yr(y => fmtK(yearKpis(y, m).staffTotal))}{cagrCell(yearKpis(2027, m).staffTotal, yearKpis(2030, m).staffTotal)}</tr>

          <tr><td className="grp" colSpan={years.length + 1 + (showCagr ? 1 : 0)}>Other operating costs</td></tr>
          {COST_LINES.filter(l => l.group === "operating").map(l => (
            <tr key={l.id}><td>{l.name}</td>{years.map(y => cell("cost", l, y))}{cagrCell(projCost(l, 2027, m), projCost(l, 2030, m))}</tr>
          ))}
          <tr className="sub"><td>Total Other Operating Costs</td>{yr(y => fmtK(yearKpis(y, m).opTotal))}{cagrCell(yearKpis(2027, m).opTotal, yearKpis(2030, m).opTotal)}</tr>

          {inflationPct(m) !== 0 && (
            <tr><td colSpan={years.length + 1 + (showCagr ? 1 : 0)} style={{ color: "#999", fontSize: 11, fontStyle: "italic", paddingTop: 2, paddingBottom: 2 }}>
              Costs above include inflation at {fmtPct(inflationPct(m))}/yr from 2028.
            </td></tr>
          )}
          <tr><td style={{ color: "#888", fontSize: 12 }}>Cost of revenue growth ({Math.round(marginalRate(m))}% of growth above budget)</td>
            {yr(y => { const k = yearKpis(y, m); return k.marginalCost > 0 ? <span style={{ color: "#b87a20" }}>{fmtK(k.marginalCost)}</span> : "£0"; })}
            {showCagr && <td />}
          </tr>
          {years.some(y => yearKpis(y, m).revTotal < budgetRevTotal(m) && y >= 2028) && yearKpis(2030, m).marginalCost === 0 && (
            <tr><td colSpan={years.length + 1 + (showCagr ? 1 : 0)} style={{ color: "#999", fontSize: 11, fontStyle: "italic", paddingTop: 2, paddingBottom: 2 }}>
              No growth cost yet — total revenue is below the 2026/27 budget, so there is no growth above budget to charge. It applies once total revenue exceeds budget.
            </td></tr>
          )}
          <tr className="sub"><td>TOTAL OPERATING COSTS</td>{yr(y => fmtK(yearKpis(y, m).operatingCost))}{cagrCell(yearKpis(2027, m).operatingCost, yearKpis(2030, m).operatingCost)}</tr>
          <tr className="sub"><td>OPERATING SURPLUS (contribution)</td>
            {yr(y => { const k = yearKpis(y, m); return <span style={{ color: surplusColor(k.contribution) }}>{fmtK(k.contribution)}</span>; })}
            {cagrCell(yearKpis(2027, m).contribution, yearKpis(2030, m).contribution)}
          </tr>

          <tr className="below"><td>less University service charge (TRAC)</td>{years.map(y => uniLoanCell("uni", y))}{showCagr && <td />}</tr>
          <tr className="below"><td>less University loan repayment</td>{years.map(y => uniLoanCell("loan", y))}{showCagr && <td />}</tr>
          <tr className="net"><td>NET SURPLUS</td>
            {yr(y => { const k = yearKpis(y, m); return `${fmtK(k.net)}  (${k.netPct.toFixed(1)}%)`; })}
            {cagrCell(yearKpis(2027, m).net, yearKpis(2030, m).net)}
          </tr>
        </tbody>
      </table>
      <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: "#999" }}>
        {editBase ? "Every figure here is editable — correct any line or the service charge if the numbers have moved." : "Columns marked * are estimates."}
      </div>
    </div>
  );
}

/* ── ENTRY SCREEN ─────────────────────────────────────────────────────────── */
function Entry({ onEnter }) {
  const [pwd, setPwd] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [name, setName] = useState("");
  const [session, setSession] = useState("FBaM-shared");
  const [err, setErr] = useState("");
  const canEnter = pwd === PART_PWD && name.trim() && session.trim();
  const go = () => {
    if (pwd !== PART_PWD) { setErr("Incorrect password."); return; }
    if (!name.trim()) { setErr("Please enter your name."); return; }
    if (!session.trim()) { setErr("Please enter the session code."); return; }
    STORE.sessionId = session.trim();
    STORE.myName = name.trim();
    onEnter(name.trim());
  };
  return (
    <div className="sl"><div className="sl-entry">
      <div className="sl-brand">Strategy Lab</div>
      <div className="sl-brand-sub">STRAWPERSON — Financial Scenario Tool</div>
      <div className="sl-brand-org">Cranfield University — Faculty of Business and Management</div>
      <div className="sl-overview">
        <p>This model starts from real numbers. The current position is the Q3 2025/26 forecast. The first year ahead is the agreed 2026/27 budget.</p>
        <p>From 2027/28 onward the figures are estimates only. Each income line carries a forward growth rate drawn from market research on the sector, which you can adjust. The one-off step from the 2025/26 forecast to the 2026/27 budget is already banked in the budget as a level change, so it is shown for context but does not drive the forward rate.</p>
      </div>
      <hr className="sl-rule" />
      <div className="sl-field">
        <label className="sl-label">Password</label>
        <div className="sl-pw-wrap">
          <input type={showPwd ? "text" : "password"} className="sl-input" value={pwd}
            onChange={e => { setPwd(e.target.value); setErr(""); }} onKeyDown={e => e.key === "Enter" && go()} placeholder="Session password" />
          {pwd && <button className="sl-pw-eye" onClick={() => setShowPwd(!showPwd)}>{showPwd ? "○" : "●"}</button>}
        </div>
      </div>
      <div className="sl-field">
        <label className="sl-label">Session code <span style={{ fontWeight: 300, fontSize: 11 }}>(everyone in the session uses the same code — one shared model)</span></label>
        <input type="text" className="sl-input" value={session} onChange={e => setSession(e.target.value)} onKeyDown={e => e.key === "Enter" && go()} />
      </div>
      <div className="sl-field">
        <label className="sl-label">Your name <span style={{ fontWeight: 300, fontSize: 11 }}>(for attribution only)</span></label>
        <input type="text" className="sl-input" value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === "Enter" && go()} placeholder="e.g. David" />
      </div>
      {err && <div className="sl-err">{err}</div>}
      <button className="sl-btn" disabled={!canEnter} onClick={go}>Enter the model</button>
    </div></div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   STEPS
   ════════════════════════════════════════════════════════════════════════ */

/* ── 1. GOAL ──────────────────────────────────────────────────────────────── */
function StepGoal({ m, confirmed, onConfirm, onBack }) {
  const [d, patch] = useDraft({ targetPct: nv(m.targetPct, 7.5) });
  const [saved, setSaved] = useState(false);
  const tgt = d.targetPct;
  const desc = (v) => v <= -5 ? "Significant managed deficit" : v < 0 ? "Managed deficit" : v === 0 ? "Break-even"
    : v <= 2.5 ? "Minimal surplus" : v <= 5 ? "Modest surplus" : v <= 7.5 ? "Sustainable surplus" : "Strong surplus";
  const commit = () => mSave({ targetPct: tgt, step1Confirmed: true });
  const onSave = () => { commit(); setSaved(true); };
  const onSaveContinue = () => { commit(); onConfirm(); };
  return (
    <div className="sl-content">
      <BackBtn onClick={onBack} />
      {confirmed && <ConfirmedBanner n={1} />}
      <div className="sl-step-h">What net operating surplus should FBaM achieve by July 2030?</div>
      <div className="sl-prompt">Set the 2030 target. You will set the year-by-year path in the Yearly P&L step.</div>
      <div className="sl-slider-wrap">
        <div className="sl-slider-val">{tgt >= 0 ? "+" : ""}{tgt.toFixed(1)}%</div>
        <div className="sl-slider-desc">{desc(tgt)} by July 2030</div>
        <input type="range" className="sl-slider" min="-10" max="10" step="0.5" value={tgt} onChange={e => { patch({ targetPct: parseFloat(e.target.value) }); setSaved(false); }} />
        <div className="sl-slider-range"><span>−10%</span><span>0%</span><span>+10%</span></div>
      </div>
      <SaveBar onSave={onSave} onSaveContinue={onSaveContinue} continueLabel="Save & continue → Current position" saved={saved} />
    </div>
  );
}

/* ── 2. CURRENT POSITION (full Cranfield P&L, Q3 + Budget — all editable) ──── */
function StepCurrent({ m, confirmed, onConfirm, onBack }) {
  const [d, patch, replace] = useDraft({
    baseRev: m.baseRev || {}, baseCost: m.baseCost || {}, baseUni: m.baseUni || {}, loanByYear: m.loanByYear || {},
  });
  const [saved, setSaved] = useState(false);
  const liveM = { ...m, ...d };
  const k26 = yearKpis(2026, liveM), k27 = yearKpis(2027, liveM);

  const onCell = (kind, yr, id, val) => {
    setSaved(false);
    const col = yr === 2026 ? "q3" : "bud";
    if (kind === "rev")  patch({ baseRev:  { ...d.baseRev,  [id]: { ...(d.baseRev[id]  || {}), [col]: val } } });
    else if (kind === "cost") patch({ baseCost: { ...d.baseCost, [id]: { ...(d.baseCost[id] || {}), [col]: val } } });
    else if (kind === "uni")  patch({ baseUni:  { ...d.baseUni,  [col]: val } });
    else if (kind === "loan") patch({ loanByYear: { ...d.loanByYear, [yr]: val } });
  };
  const reset = () => { setSaved(false); replace({ baseRev: {}, baseCost: {}, baseUni: {}, loanByYear: { ...d.loanByYear, 2026: "", 2027: "" } }); };

  const commit = () => mSave({ ...d, step2Confirmed: true });
  const onSave = () => { commit(); setSaved(true); };
  const onSaveContinue = () => { commit(); onConfirm(); };
  return (
    <div className="sl-content">
      <BackBtn onClick={onBack} />
      {confirmed && <ConfirmedBanner n={2} />}
      <div className="sl-step-h">Current position</div>
      <div className="sl-prompt">This is the School's own P&L — the same lines, the same order, the same wording you already know. The left column is the Q3 2025/26 forecast; the right is the agreed 2026/27 budget. Every figure is editable: correct any line, the service charge or the loan if the numbers have moved. Your edits flow through every later step.</div>
      <PLTable m={liveM} years={[2026, 2027]} editBase onCell={onCell} />
      <div className="sl-kpis">
        <div className="sl-kpi"><div className="l">Contribution 26/27</div><div className="v">{fmtK(k27.contribution)} ({k27.contribPct.toFixed(1)}%)</div></div>
        <div className="sl-kpi"><div className="l">Net surplus 26/27</div><div className="v" style={{ color: surplusColor(k27.net) }}>{fmtK(k27.net)} ({k27.netPct.toFixed(1)}%)</div></div>
        <div className="sl-kpi"><div className="l">Net surplus Q3 25/26</div><div className="v" style={{ color: surplusColor(k26.net) }}>{fmtK(k26.net)} ({k26.netPct.toFixed(1)}%)</div></div>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <button className="sl-btn sl-btn-outline" style={{ fontSize: 12, padding: "8px 14px" }} onClick={reset}>↺ Reset to original figures</button>
        <button className="sl-btn sl-btn-outline" style={{ fontSize: 12, padding: "10px 16px" }} onClick={onSave}>{saved ? "Saved ✓" : "Save"}</button>
        <button className="sl-btn" onClick={onSaveContinue}>Save & continue → Trajectory</button>
      </div>
    </div>
  );
}

/* ── 3. TRAJECTORY (forward rate = midpoint of FBaM trajectory & sector) ───── */
const CONF_COLOR = { "High":"#2d7d46", "Med–High":"#2d7d46", "Medium":"#b87a20", "Low–Med":"#b87a20", "Low":"#b83232" };
function StepDoNothing({ m, confirmed, onConfirm, onBack }) {
  const [d, patch, replace] = useDraft({
    rates: { ...getRateOverrides(m) },
    inflationPct: m.inflationPct !== undefined ? m.inflationPct : DEFAULT_INFLATION,
    marginalCostPct: m.marginalCostPct !== undefined ? m.marginalCostPct : DEFAULT_MARGINAL,
  });
  const [saved, setSaved] = useState(false);
  /* liveM reflects the local draft so the P&L below updates instantly while typing.
     _ignoreRevOverride: §3 is the pure-trajectory view — it must NOT apply §7
     estimate-cell overrides, which belong only to the Yearly P&L step.          */
  const liveM = { ...m, [RATE_KEY]: d.rates, inflationPct: d.inflationPct, marginalCostPct: d.marginalCostPct, posture: {}, _ignoreRevOverride: true };

  const setRate = (id, val) => {
    setSaved(false);
    const ro = { ...d.rates };
    if (val === "" || val === undefined) delete ro[id]; else ro[id] = val;
    patch({ rates: ro });
  };
  const rateValue = (l) => {
    const stored = d.rates[l.id];
    return stored !== undefined && stored !== "" ? stored : defaultRate(l, liveM);
  };
  const resetRates = () => { setSaved(false); patch({ rates: {} }); };
  const setAssumption = (key, val) => { setSaved(false); patch({ [key]: val }); };
  const inflVal = d.inflationPct;
  const margVal = d.marginalCostPct;
  const commit = () => mSave({ [RATE_KEY]: d.rates, inflationPct: nv(d.inflationPct, DEFAULT_INFLATION), marginalCostPct: nv(d.marginalCostPct, DEFAULT_MARGINAL), step3Confirmed: true });
  const onSave = () => { commit(); setSaved(true); };
  const onSaveContinue = () => { commit(); onConfirm(); };
  const td = { fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, textAlign: "right", padding: "5px 8px" };

  return (
    <div className="sl-content">
      <BackBtn onClick={onBack} />
      {confirmed && <ConfirmedBanner n={3} />}
      <div className="sl-step-h">Trajectory</div>
      <div className="sl-prompt">If nothing changes. Each income line carries a forward growth rate that is the midpoint of two things: FBaM's own recent trajectory (the move from the Q3 forecast into the 2026/27 budget) and the sector growth rate from market research. The midpoint is the default — edit any rate you don't accept. Apprenticeship and SLEP income ends in 2027 regardless.</div>

      <div className="sl-note-box">
        <div style={{ fontWeight: 600, color: "#1a1a1a", marginBottom: 6 }}>About these growth rates</div>
        The forward rate for each line is the midpoint of FBaM's own trajectory and a sector growth rate drawn from market research on UK postgraduate business-school revenue, 2024–2030. The rates are nominal and deliberately cautious where only global figures exist. Three things to hold in mind: government-linked income (research funding and grants) is flat in cash and slightly negative in real terms; executive education — open and customised — is the only genuinely growing category, though the UK outlook sits below global rates; and for taught master's, fee income has stayed roughly flat even as international student numbers fell, so the rate reflects revenue, not enrolments. Hover any rate for its basis and confidence.
      </div>

      <div style={{ overflowX: "auto", marginBottom: 12 }}>
        <table className="sl-pl" style={{ minWidth: 660 }}>
          <thead><tr>
            <th>Income line</th>
            <th>Q3 25/26</th><th>Budget 26/27</th><th>FBaM trajectory</th><th>Sector rate</th><th>Forward rate (midpoint)</th>
          </tr></thead>
          <tbody>
            {REV_LINES.map(l => { const rb = resolveBase(m.baseRev, l); return (
              <tr key={l.id}>
                <td title={l.basis || ""}>{l.name}
                  {l.conf && <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: CONF_COLOR[l.conf] || "#888" }}>{l.conf}</span>}
                </td>
                <td style={td}>{fmtK(rb.q3)}</td>
                <td style={td}>{fmtK(rb.bud)}</td>
                <td style={{ ...td, color: "#aaa" }} title="FBaM's own recent move from the Q3 forecast into the agreed budget.">
                  {l.kind === "normal" ? fmtPct(trendPct(l, m)) : "—"}
                </td>
                <td style={{ ...td, color: "#888" }} title={l.basis || ""}>{(l.kind === "normal") ? fmtPct(l.cagr) : "—"}</td>
                <td style={td}>
                  {l.kind === "ending" ? <span style={{ color: "#b83232", fontSize: 11 }}>ends 2027 → £0</span>
                    : l.kind === "fixed" ? <span style={{ color: "#888", fontSize: 11 }}>fixed → held</span>
                    : l.kind === "new" ? <span style={{ color: "#aaa", fontSize: 11 }}>set in Changes</span>
                    : <input type="number" className="sl-num" style={{ width: 64 }} step="0.5"
                        value={rateValue(l)} onChange={e => setRate(l.id, e.target.value)} />}
                </td>
              </tr>
            ); })}
          </tbody>
        </table>
      </div>
      <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: "#999", marginBottom: 4 }}>
        Forward rate = midpoint of FBaM trajectory and sector rate, compounding from the 2026/27 budget. Edits update the P&L below immediately.
      </div>
      <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: "#999", marginBottom: 16 }}>
        Cost weight vs growth rate: a business school's research income sits at roughly a third of the per-head level of STEM disciplines, but that is a level effect, not a rate. Basis: UK postgraduate business-school revenue CAGR benchmark 2024–2030 — HESA, Chartered ABS, UNICON, Research England / UKRI, market-research forecasts; confidence varies by line.
      </div>

      <div className="sl-note-box" style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 600, color: "#1a1a1a", marginBottom: 8 }}>Inflation and the cost of growth</div>
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 13 }}>Cost inflation</span>
            <NumInput width={56} step={0.1} value={inflVal} onChange={v => setAssumption("inflationPct", v)} /> <span style={{ fontSize: 13, color: "#888" }}>% p.a.</span>
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 13 }}>Cost of revenue growth</span>
            <NumInput width={56} step={0.1} value={margVal} onChange={v => setAssumption("marginalCostPct", v)} /> <span style={{ fontSize: 13, color: "#888" }}>% of growth</span>
          </span>
        </div>
        <div style={{ fontSize: 11, color: "#777", lineHeight: 1.6 }}>
          The estimate years carry two forward assumptions. Costs rise with <strong>inflation</strong> each year (revenue rates are already nominal, so inflation is applied to costs only — adding it to revenue would double-count). And growth is not free: where <em>total</em> revenue rises above the 2026/27 budget, that excess carries additional cost at <strong>{Math.round(nv(margVal, DEFAULT_MARGINAL))}% of the growth</strong> (mainly staff). On a shrinking trajectory there is no growth above budget, so this shows £0 until your changes push total revenue back above the budget. These settings carry through to the Yearly P&L step.
        </div>
      </div>

      <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, color: "#888", marginBottom: 8 }}>Resulting P&L on this trajectory</div>
      <PLTable m={liveM} years={YEARS} compact />
      <div className="sl-kpis">
        {YEARS.map(y => { const k = yearKpis(y, liveM); return (
          <div className="sl-kpi" key={y}><div className="l">{COL_LABEL[y]}</div>
            <div className="v" style={{ color: surplusColor(k.net) }}>{k.netPct.toFixed(1)}%</div></div>
        ); })}
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <button className="sl-btn sl-btn-outline" style={{ fontSize: 12, padding: "8px 14px" }} onClick={resetRates}>↺ Reset rates to midpoint</button>
        <button className="sl-btn sl-btn-outline" style={{ fontSize: 12, padding: "10px 16px" }} onClick={onSave}>{saved ? "Saved ✓" : "Save"}</button>
        <button className="sl-btn" onClick={onSaveContinue}>Save & continue → Who we serve</button>
      </div>
    </div>
  );
}

/* ── 4. WHO FBAM SERVES ───────────────────────────────────────────────────── */
function StepWhoServes({ m, confirmed, onConfirm, onBack }) {
  const [d, patch] = useDraft({ purposeGroups: { ...(m.purposeGroups || {}) }, customGroups: m.customGroups || [] });
  const [saved, setSaved] = useState(false);
  const [newName, setNewName] = useState("");
  const custom = d.customGroups;
  const allGroups = [...PURPOSE_GROUPS, ...custom];
  const groups = {}; allGroups.forEach(k => groups[k] = nv(d.purposeGroups?.[k], DEFAULT_GROUP_SCORES[k] || 5));
  const MAX_HIGH = 3;
  const highCount = Object.values(groups).filter(v => nv(v) >= 8).length;
  const setScore = (g, n) => {
    const cur = nv(groups[g]); if (n >= 8 && cur < 8 && highCount >= MAX_HIGH) return;
    setSaved(false); patch({ purposeGroups: { ...d.purposeGroups, [g]: n } });
  };
  const addGroup = () => {
    const name = newName.trim();
    if (!name || allGroups.includes(name)) { setNewName(""); return; }
    setSaved(false); patch({ customGroups: [...custom, name], purposeGroups: { ...d.purposeGroups, [name]: 5 } });
    setNewName("");
  };
  const removeGroup = (name) => {
    const pg = { ...d.purposeGroups }; delete pg[name];
    setSaved(false); patch({ customGroups: custom.filter(x => x !== name), purposeGroups: pg });
  };
  const commit = () => mSave({ purposeGroups: d.purposeGroups, customGroups: d.customGroups, step4Confirmed: true });
  const onSave = () => { commit(); setSaved(true); };
  const onSaveContinue = () => { commit(); onConfirm(); };

  const row = (g, removable) => (
    <div key={g} style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, alignItems: "center" }}>
        <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: "#1a1a1a" }}>{g}</span>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 13, fontWeight: 600, color: nv(groups[g]) >= 8 ? "#e07030" : "#1a1a1a" }}>{nv(groups[g])}</span>
          {removable && <button onClick={() => removeGroup(g)} title="Remove" style={{ background: "none", border: "1px solid #d8d3cb", borderRadius: 4, cursor: "pointer", padding: "1px 6px", fontSize: 11, color: "#b83232" }}>✕</button>}
        </span>
      </div>
      <input type="range" min={1} max={9} step={1} value={nv(groups[g], 5)} onChange={e => setScore(g, parseInt(e.target.value))}
        style={{ width: "100%", accentColor: nv(groups[g]) >= 8 ? "#e07030" : "#888" }} />
    </div>
  );

  return (
    <div className="sl-content">
      <BackBtn onClick={onBack} />
      {confirmed && <ConfirmedBanner n={4} />}
      <div className="sl-step-h">Who should FBaM serve?</div>
      <div className="sl-prompt">Rate each stakeholder group 1–9 by importance to FBaM's future. If everything scores 9, nothing is a priority. A maximum of three groups can score 8 or 9 — use those slots deliberately. ({MAX_HIGH - highCount} high-priority slots left.)</div>
      {PURPOSE_GROUPS.map(g => row(g, false))}
      {custom.map(g => row(g, true))}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, marginBottom: 4 }}>
        <input type="text" className="sl-input" style={{ flex: 1 }} placeholder="Add another stakeholder group…"
          value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === "Enter" && addGroup()} />
        <button className="sl-btn sl-btn-outline" style={{ fontSize: 12, padding: "10px 14px", flexShrink: 0 }} onClick={addGroup}>+ Add</button>
      </div>
      <SaveBar onSave={onSave} onSaveContinue={onSaveContinue} continueLabel="Save & continue → Positioning" saved={saved} />
    </div>
  );
}

/* ── 5. POSITIONING (tension sliders — default numbers retained) ──────────── */
function StepPositioning({ m, confirmed, onConfirm, onBack }) {
  const [d, patch] = useDraft({ purposeTensions: { ...(m.purposeTensions || {}) } });
  const [saved, setSaved] = useState(false);
  const t = {}; PURPOSE_TENSIONS.forEach(x => t[x.key] = nv(d.purposeTensions?.[x.key], DEFAULT_TENSIONS[x.key]));
  const setVal = (key, v) => { setSaved(false); patch({ purposeTensions: { ...d.purposeTensions, [key]: v } }); };
  const commit = () => mSave({ purposeTensions: d.purposeTensions, step5Confirmed: true });
  const onSave = () => { commit(); setSaved(true); };
  const onSaveContinue = () => { commit(); onConfirm(); };
  return (
    <div className="sl-content">
      <BackBtn onClick={onBack} />
      {confirmed && <ConfirmedBanner n={5} />}
      <div className="sl-step-h">Where should FBaM position itself?</div>
      <div className="sl-prompt">Place FBaM on each dimension. There are no right answers — the point is to make the choices explicit and consistent with the changes you make next.</div>
      {PURPOSE_TENSIONS.map(x => (
        <div key={x.key} style={{ marginBottom: 22 }}>
          <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: "#888", marginBottom: 6 }}>{x.desc}</div>
          <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: "#1a1a1a", marginBottom: 4 }}>
            <span>{x.l}</span><span>{x.r}</span>
          </div>
          <input type="range" min={0} max={100} step={1} value={nv(t[x.key], 50)} onChange={e => setVal(x.key, parseInt(e.target.value))}
            style={{ width: "100%", accentColor: "#e07030" }} />
        </div>
      ))}
      <SaveBar onSave={onSave} onSaveContinue={onSaveContinue} continueLabel="Save & continue → Changes" saved={saved} />
    </div>
  );
}

/* ── 6. CHANGES (macro postures, suggested from §4/§5, + new streams) ─────── */
function StepChanges({ m, confirmed, onConfirm, onBack }) {
  const [d, patch] = useDraft({
    posture: { ...(m.posture || {}) },
    customRev: m.customRev || [],
    newTarget: { ...(m.newTarget || {}) },
  });
  const [saved, setSaved] = useState(false);
  const [newName, setNewName] = useState("");
  const [newTgt, setNewTgt] = useState("");

  const posture = d.posture;
  const customRev = d.customRev;
  const microTarget = String(nv(d.newTarget?.micro_cred, 0));
  const customTargets = {}; customRev.forEach(c => customTargets[c.id] = String(nv(d.newTarget?.[c.id], 0)));
  /* §6 shows the trajectory + postures + new streams only. It must NOT apply §7
     estimate-cell overrides (revOverride/costOverride) — those belong to the
     Yearly P&L step. _ignoreRevOverride keeps a stray §7 cell from corrupting
     the net% shown here (the −40% bug).                                         */
  const liveM = { ...m, posture: d.posture, customRev: d.customRev, newTarget: d.newTarget, _ignoreRevOverride: true };

  const normals = REV_LINES.filter(l => l.kind === "normal");
  const suggestions = {}; normals.forEach(l => suggestions[l.id] = suggestPosture(l, liveM));

  const setP = (id, pid) => {
    setSaved(false);
    const n = { ...posture }; if (n[id] === pid) delete n[id]; else n[id] = pid;
    patch({ posture: n });
  };
  const applyAllSuggestions = () => {
    setSaved(false);
    const n = { ...posture }; normals.forEach(l => { if (suggestions[l.id]) n[l.id] = suggestions[l.id].posture; });
    patch({ posture: n });
  };
  const setMicroTarget = (v) => { setSaved(false); patch({ newTarget: { ...d.newTarget, micro_cred: nv(v) } }); };
  const setCustomTarget = (id, v) => { setSaved(false); patch({ newTarget: { ...d.newTarget, [id]: nv(v) } }); };

  const addStream = () => {
    if (!newName.trim()) return;
    const id = "custom_" + Date.now().toString(36);
    setSaved(false);
    patch({ customRev: [...customRev, { id, name: newName.trim() }], newTarget: { ...d.newTarget, [id]: nv(newTgt) } });
    setNewName(""); setNewTgt("");
  };
  const removeStream = (id) => {
    const nt = { ...d.newTarget }; delete nt[id];
    setSaved(false); patch({ customRev: customRev.filter(c => c.id !== id), newTarget: nt });
  };

  const commit = () => mSave({ posture: d.posture, customRev: d.customRev, newTarget: d.newTarget, step6Confirmed: true });
  const onSave = () => { commit(); setSaved(true); };
  const onSaveContinue = () => { commit(); onConfirm(); };

  const btn = (l, p, suggested) => {
    const active = posture[l.id] === p.id;
    return (
      <button key={p.id} onClick={() => setP(l.id, p.id)} title={p.note}
        style={{ padding: "5px 9px", borderRadius: 4, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", fontSize: 11,
          border: "1px solid " + (active ? "#e07030" : suggested ? "#2d7d46" : "#d8d3cb"),
          background: active ? "#e07030" : "#f0ede8",
          color: active ? "#fff" : suggested ? "#2d7d46" : "#1a1a1a", whiteSpace: "nowrap",
          fontWeight: suggested && !active ? 600 : 400 }}>{p.label}{suggested ? " ◦" : ""}</button>
    );
  };

  return (
    <div className="sl-content">
      <BackBtn onClick={onBack} />
      {confirmed && <ConfirmedBanner n={6} />}
      <div className="sl-step-h">Changes</div>
      <div className="sl-prompt">This is the strategic choice: what do you do with each existing revenue stream — and do you bring in new ones? Each stream carries a suggested posture (marked ◦, in green) drawn from who you chose to serve and how you positioned FBaM. Accept the suggestions or override them. If you choose nothing, the stream follows its trajectory.</div>
      <div className="sl-note-box">End / Teach-out — wind down to £0 &nbsp;·&nbsp; Managed decline −15%/yr &nbsp;·&nbsp; Maintain — hold at budget &nbsp;·&nbsp; Incremental +5%/yr &nbsp;·&nbsp; Radical +15%/yr. Rates compound from the 2026/27 budget.</div>
      <button className="sl-btn sl-btn-outline" style={{ fontSize: 12, padding: "8px 14px", marginBottom: 16 }} onClick={applyAllSuggestions}>✓ Apply all suggested postures</button>

      {normals.map(l => { const sg = suggestions[l.id]; return (
        <div key={l.id} style={{ borderBottom: "1px solid #e8e4de", padding: "12px 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
            <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 500 }}>{l.name}</span>
            <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: "#888" }}>
              budget {fmtK(resolveBase(m.baseRev, l).bud)} → 2030 {fmtK(projRev(l, 2030, liveM))}
            </span>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>{POSTURES.map(p => btn(l, p, sg && sg.posture === p.id))}</div>
          {sg && <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: "#2d7d46" }}>
            Suggested: <strong>{POSTURE_BY_ID[sg.posture].label}</strong> — {sg.why}.
          </div>}
        </div>
      ); })}

      {/* Locked ending lines */}
      {REV_LINES.filter(l => l.kind === "ending").map(l => (
        <div key={l.id} style={{ borderBottom: "1px solid #e8e4de", padding: "12px 0", opacity: 0.7 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 500 }}>{l.name}</span>
            <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: "#b83232" }}>Ends 2027 → £0 (locked)</span>
          </div>
          <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: "#999", marginTop: 4 }}>{l.endNote}</div>
        </div>
      ))}

      {/* Fixed-price lines — locked, held at budget */}
      {REV_LINES.filter(l => l.kind === "fixed").map(l => (
        <div key={l.id} style={{ borderBottom: "1px solid #e8e4de", padding: "12px 0", opacity: 0.7 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 500 }}>{l.name}</span>
            <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: "#888" }}>Fixed price → held at budget (locked)</span>
          </div>
          <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: "#999", marginTop: 4 }}>{l.basis}</div>
        </div>
      ))}

      {/* Micro-credentials (built-in new stream) */}
      <div style={{ borderBottom: "1px solid #e8e4de", padding: "12px 0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 500 }}>Micro-credentials (new stream)</div>
            <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: "#999", marginTop: 2 }}>New award-bearing exec ed. Set a 2030 target — ramps linearly from £0.</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: "#888" }}>2030 £k</span>
            <NumInput width={80} step={50} value={microTarget} onChange={setMicroTarget} min={0} />
          </div>
        </div>
      </div>

      {/* Custom new streams */}
      {customRev.map(c => (
        <div key={c.id} style={{ borderBottom: "1px solid #e8e4de", padding: "12px 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 500 }}>{c.name} <span style={{ color: "#888", fontWeight: 400 }}>(new stream)</span></div>
              <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: "#999", marginTop: 2 }}>Ramps linearly from £0 to the 2030 target.</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: "#888" }}>2030 £k</span>
              <NumInput width={80} step={50} value={customTargets[c.id] ?? "0"} onChange={v => setCustomTarget(c.id, v)} min={0} />
              <button onClick={() => removeStream(c.id)} title="Remove stream"
                style={{ background: "none", border: "1px solid #d8d3cb", borderRadius: 4, cursor: "pointer", padding: "4px 8px", fontSize: 12, color: "#b83232" }}>✕</button>
            </div>
          </div>
        </div>
      ))}

      {/* Add a new stream */}
      <div style={{ padding: "16px 0", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input type="text" className="sl-input" style={{ flex: 1, minWidth: 180 }} placeholder="New revenue stream (e.g. Online MBA, Degree apprenticeships v2)"
          value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === "Enter" && addStream()} />
        <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: "#888" }}>2030 £k</span>
        <NumInput width={80} step={50} value={newTgt} onChange={setNewTgt} min={0} />
        <button className="sl-btn sl-btn-outline" style={{ fontSize: 12, padding: "10px 14px" }} onClick={addStream}>+ Add stream</button>
      </div>

      <div style={{ marginTop: 8 }} className="sl-kpis">
        {YEARS.map(y => { const k = yearKpis(y, liveM); return (
          <div className="sl-kpi" key={y}><div className="l">{COL_LABEL[y]}</div>
            <div className="v" style={{ color: surplusColor(k.net) }}>{k.netPct.toFixed(1)}%</div></div>
        ); })}
      </div>
      <SaveBar onSave={onSave} onSaveContinue={onSaveContinue} continueLabel="Save & continue → Yearly P&L" saved={saved} />
    </div>
  );
}

/* ── 7. YEARLY P&L (full transition table, estimates editable, vs target) ─── */
function StepYearly({ m, confirmed, onConfirm, onBack }) {
  const [d, patch, replace] = useDraft({
    revOverride: m.revOverride || {}, costOverride: m.costOverride || {},
    loanByYear: m.loanByYear || {}, uniByYear: m.uniByYear || {},
    inflationPct: m.inflationPct !== undefined ? m.inflationPct : DEFAULT_INFLATION,
    marginalCostPct: m.marginalCostPct !== undefined ? m.marginalCostPct : DEFAULT_MARGINAL,
  });
  const [saved, setSaved] = useState(false);
  const [solveOn, setSolveOn] = useState(false);

  const inflVal = d.inflationPct;
  const margVal = d.marginalCostPct;
  const setAssumption = (key, val) => { setSaved(false); patch({ [key]: val }); };

  /* Solver ON: overlay the solved growth-line overrides. Service charge & loan
     stay editable (they feed the solve); the three growth lines are recomputed
     each render so they're effectively locked. Meets target exactly.            */
  const baseM = { ...m, ...d };
  const solve = solveOn ? solvedModel(baseM) : null;
  const liveM = solve ? { ...baseM, revOverride: solve.rev } : baseM;
  const tp = targetPath(baseM);

  const onCell = (kind, yr, id, val) => {
    if (solveOn && kind === "rev" && SOLVE_LINES.includes(id)) return;   /* locked while solving */
    setSaved(false);
    if (kind === "loan") { patch({ loanByYear: { ...d.loanByYear, [yr]: val } }); return; }
    if (kind === "uni")  { patch({ uniByYear: { ...d.uniByYear, [yr]: val } }); return; }
    const key = kind === "rev" ? "revOverride" : "costOverride";
    patch({ [key]: { ...d[key], [yr]: { ...(d[key][yr] || {}), [id]: val } } });
  };
  const resetEstimates = () => { setSaved(false); patch({ revOverride: {}, costOverride: {}, uniByYear: {} }); };

  const commit = () => {
    const revToSave = solveOn && solve ? solve.rev : d.revOverride;
    mSave({ revOverride: revToSave, costOverride: d.costOverride, loanByYear: d.loanByYear, uniByYear: d.uniByYear, inflationPct: nv(d.inflationPct, DEFAULT_INFLATION), marginalCostPct: nv(d.marginalCostPct, DEFAULT_MARGINAL), step7Confirmed: true });
  };
  const onSave = () => { commit(); setSaved(true); };
  const onSaveContinue = () => { commit(); onConfirm(); };

  return (
    <div className="sl-content">
      <BackBtn onClick={onBack} />
      {confirmed && <ConfirmedBanner n={7} />}
      <div className="sl-step-h">Yearly P&L — transition to target</div>
      <div className="sl-prompt">The full P&L, year by year, with your changes applied. Q3 25/26 and the 2026/27 budget are locked. The estimate columns reflect your postures — edit any estimate cell directly to override. The target row shows the path to your {nv(m.targetPct, 7.5).toFixed(1)}% goal.</div>

      <div className="sl-note-box">
        <div style={{ fontWeight: 600, color: "#1a1a1a", marginBottom: 8 }}>Forward assumptions (estimate years only)</div>
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 13 }}>Cost inflation</span>
            <NumInput width={56} step={0.1} value={inflVal} onChange={v => setAssumption("inflationPct", v)} /> <span style={{ fontSize: 13, color: "#888" }}>% p.a.</span>
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 13 }}>Cost of revenue growth</span>
            <NumInput width={56} step={0.1} value={margVal} onChange={v => setAssumption("marginalCostPct", v)} /> <span style={{ fontSize: 13, color: "#888" }}>% of growth</span>
          </span>
        </div>
        <div style={{ fontSize: 11, color: "#777", marginTop: 8, lineHeight: 1.6 }}>
          Revenue growth rates are nominal (they already include inflation), so inflation is applied to <strong>costs</strong> only — adding it to revenue would double-count. Where <em>total</em> revenue rises above the 2026/27 budget, that excess carries additional cost at {Math.round(nv(margVal, DEFAULT_MARGINAL))}% of the growth (mainly staff). On a shrinking trajectory it shows £0 until total revenue exceeds budget.
        </div>
      </div>

      {/* ── SOLVE TO TARGET toggle ────────────────────────────────────────── */}
      <div style={{ border: "2px solid " + (solveOn ? "#e07030" : "#d8d3cb"), borderRadius: 8, padding: 16, marginBottom: 18, background: solveOn ? "#fbf3ec" : "#faf8f5" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 20, fontWeight: 600, color: "#1a1a1a" }}>Solve to target</div>
            <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: "#777", marginTop: 2 }}>
              Grows CED Customised and Open Programmes (Open held to 60% of Customised), plus Micro-credentials ramping to £1,000k, to meet {tp[2028]}% / {tp[2029]}% / {tp[2030]}% exactly.
            </div>
          </div>
          <button onClick={() => {
              setSolveOn(s => {
                if (s) {
                  /* turning OFF: strip the solver's growth-line overrides so the
                     table returns to the true trajectory, not stale solved values */
                  const cleaned = {};
                  Object.keys(d.revOverride || {}).forEach(yr => {
                    const row = { ...d.revOverride[yr] };
                    SOLVE_LINES.forEach(id => delete row[id]);
                    if (Object.keys(row).length) cleaned[yr] = row;
                  });
                  patch({ revOverride: cleaned });
                }
                return !s;
              });
              setSaved(false);
            }}
            style={{ flexShrink: 0, padding: "12px 22px", borderRadius: 8, border: "none", cursor: "pointer",
              fontFamily: "'DM Sans',sans-serif", fontSize: 15, fontWeight: 700, letterSpacing: 0.3,
              background: solveOn ? "#e07030" : "#1a1a1a", color: "#fff" }}>
            {solveOn ? "● SOLVING — click to turn off" : "Solve to target ▶"}
          </button>
        </div>
        {solveOn && solve && (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid #e8d9cc" }}>
            <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "#b87a20", marginBottom: 8 }}>Required annual growth to meet target</div>
            <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
              {[["ced_custom", "CED Customised"], ["open", "Open Programmes"], ["micro_cred", "Micro-credentials"]].map(([id, name]) => (
                <div key={id}>
                  <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: "#555" }}>{name}</div>
                  <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 18, fontWeight: 600, color: "#e07030" }}>
                    {id === "micro_cred" ? "£0 → £" + (solve.rev[2030]?.micro_cred || 0) + "k"
                      : (solve.cagr[id] !== null ? "+" + solve.cagr[id] + "%/yr" : "—")}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: "#999", marginTop: 10, fontStyle: "italic", lineHeight: 1.6 }}>
              The three growth lines are set by the solver. You can still edit the service charge and loan rows below — change either and the solver recalculates to keep meeting the target. Turn off to return to your own P&L.
            </div>
          </div>
        )}
      </div>

      <PLTable m={liveM} years={YEARS} editYears={EST_YEARS} onCell={onCell} showCagr />

      {/* Net % vs target per year */}
      <div style={{ overflowX: "auto", marginBottom: 16 }}>
        <table className="sl-pl" style={{ minWidth: 560 }}>
          <tbody>
            <tr><td style={{ fontWeight: 600 }}>Net surplus %</td>
              {YEARS.map(y => { const k = yearKpis(y, liveM); return <td key={y} className="mono" style={{ color: surplusColor(k.net) }}>{k.netPct.toFixed(1)}%</td>; })}
            </tr>
            <tr><td style={{ fontWeight: 600 }}>Target path</td>
              <td className="mono" style={{ color: "#aaa" }}>—</td>
              {[2027, 2028, 2029, 2030].map(y => <td key={y} className="mono" style={{ color: "#e07030" }}>{tp[y].toFixed(1)}%</td>)}
            </tr>
            <tr><td style={{ fontWeight: 600 }}>Gap to target</td>
              <td className="mono" style={{ color: "#aaa" }}>—</td>
              {[2027, 2028, 2029, 2030].map(y => {
                const k = yearKpis(y, liveM); const gapK = k.revTotal * tp[y] / 100 - k.net;
                return <td key={y} className="mono" style={{ color: gapK <= 0 ? "#2d7d46" : "#b83232" }}>{gapK <= 0 ? "met ✓" : fmtK(gapK)}</td>;
              })}
            </tr>
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <button className="sl-btn sl-btn-outline" style={{ fontSize: 12, padding: "8px 14px" }} onClick={resetEstimates}>↺ Reset estimate overrides</button>
        <button className="sl-btn sl-btn-outline" style={{ fontSize: 12, padding: "10px 16px" }} onClick={onSave}>{saved ? "Saved ✓" : "Save"}</button>
        <button className="sl-btn" onClick={onSaveContinue}>Save & continue → Theme P&L</button>
      </div>
    </div>
  );
}

/* ── THEME MIX SLIDERS (product mix within a theme — no staff numbers) ─────── */
function ThemeMixSliders({ themeName, totalRev, mix, setMix, locked, setLocked }) {
  const adjust = (catId, newVal) => {
    const clamped = Math.max(0, Math.min(100, newVal));
    const delta = clamped - mix[catId];
    if (delta === 0) return;
    const unlocked = PRODUCT_CATS.filter(c => c.id !== catId && !locked[c.id]);
    if (unlocked.length === 0) return;
    const totUnlocked = unlocked.reduce((s, c) => s + mix[c.id], 0);
    const nm = { ...mix, [catId]: clamped };
    if (totUnlocked > 0) unlocked.forEach(c => { nm[c.id] = Math.max(0, mix[c.id] - delta * (mix[c.id] / totUnlocked)); });
    else unlocked.forEach(c => { nm[c.id] = Math.max(0, mix[c.id] - delta / unlocked.length); });
    const sum = Object.values(nm).reduce((a, b) => a + b, 0);
    if (sum > 0) PRODUCT_CATS.forEach(c => { nm[c.id] = nm[c.id] / sum * 100; });
    setMix(nm);
  };
  return (
    <div style={{ border: "1px solid #d8d3cb", borderRadius: 6, padding: 16, background: "#f0ede8" }}>
      <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{themeName}</div>
      <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 18, fontWeight: 600, color: "#e07030", marginBottom: 12 }}>£{Math.round(totalRev).toLocaleString()}k</div>
      <div style={{ height: 18, display: "flex", borderRadius: 3, overflow: "hidden", marginBottom: 12 }}>
        {PRODUCT_CATS.map(c => <div key={c.id} style={{ width: mix[c.id] + "%", background: c.color }} title={`${c.label}: ${mix[c.id].toFixed(0)}%`} />)}
      </div>
      {PRODUCT_CATS.map(c => (
        <div key={c.id} style={{ marginBottom: 9 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 5, fontFamily: "'DM Sans',sans-serif", fontSize: 11 }}>
              <span style={{ width: 9, height: 9, borderRadius: 2, background: c.color }} />{c.label}
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, fontWeight: 600, minWidth: 30, textAlign: "right" }}>{mix[c.id].toFixed(0)}%</span>
              <button onClick={() => setLocked(l => ({ ...l, [c.id]: !l[c.id] }))} style={{ background: "none", border: "1px solid " + (locked[c.id] ? "#e07030" : "#d8d3cb"), borderRadius: 3, cursor: "pointer", padding: "1px 4px", fontSize: 10 }}>{locked[c.id] ? "🔒" : "🔓"}</button>
            </span>
          </div>
          <input type="range" min={0} max={100} step={1} value={Math.round(mix[c.id])} disabled={locked[c.id]}
            onChange={e => adjust(c.id, parseFloat(e.target.value))} style={{ width: "100%", accentColor: c.color, opacity: locked[c.id] ? 0.4 : 1 }} />
        </div>
      ))}
    </div>
  );
}

/* ── 8. THEME P&L (allocation by editable %; no staff numbers) ────────────── */
function StepTheme({ m, confirmed, onConfirm, onBack }) {
  const [locked, setLockedAll] = useState({ btg: {}, psl: {}, scpss: {} });
  const [d, patch] = useDraft({
    themePct: { ...(m.themePct || {}) },
    themeMixes: m.themeMixes || { btg: { ...DEFAULT_MIXES.btg }, psl: { ...DEFAULT_MIXES.psl }, scpss: { ...DEFAULT_MIXES.scpss } },
  });
  const [saved, setSaved] = useState(false);
  const k30 = yearKpis(2030, m);
  const pct = {}; THEME_DATA.forEach(t => pct[t.id] = nv(d.themePct?.[t.id], t.defPct));
  const mixes = d.themeMixes;

  const setPctRebalance = (id, val, idx) => {
    setSaved(false);
    const v = Math.max(0, Math.min(100, nv(val)));
    const others = THEME_DATA.filter((_, i) => i !== idx);
    const otherTot = others.reduce((s, o) => s + pct[o.id], 0);
    const delta = v - pct[id];
    const np = { ...pct, [id]: v };
    if (otherTot > 0) others.forEach(o => { np[o.id] = Math.max(0, Math.round(pct[o.id] - delta * (pct[o.id] / otherTot))); });
    const sum = Object.values(np).reduce((a, b) => a + b, 0);
    np[others[others.length - 1].id] += 100 - sum;
    patch({ themePct: np });
  };
  const setMix = (id, mix) => { setSaved(false); patch({ themeMixes: { ...mixes, [id]: mix } }); };

  const rev = (id) => k30.revTotal * pct[id] / 100;
  const cost = (id) => k30.operatingCost * pct[id] / 100;
  const totalRev = THEME_DATA.reduce((s, t) => s + rev(t.id), 0);
  const totalCost = THEME_DATA.reduce((s, t) => s + cost(t.id), 0);

  const commit = () => mSave({ themePct: d.themePct, themeMixes: d.themeMixes, step8Confirmed: true });
  const onSave = () => { commit(); setSaved(true); };
  const onSaveContinue = () => { commit(); onConfirm(); };

  return (
    <div className="sl-content">
      <BackBtn onClick={onBack} />
      {confirmed && <ConfirmedBanner n={8} />}
      <div className="sl-step-h">Theme P&L</div>
      <div className="sl-prompt">The July 2030 school total split across the three themes. Set the share each theme carries (the three always total 100%). The mix sliders below describe what each theme does more or less of — they redistribute within a theme and total 100%.</div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        {THEME_DATA.map((t, idx) => (
          <div key={t.id} style={{ flex: 1, minWidth: 150 }}>
            <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: "#888", marginBottom: 4 }}>{t.name.split(" ").slice(0, 3).join(" ")}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <NumInput width={64} value={pct[t.id]} onChange={v => setPctRebalance(t.id, v, idx)} min={0} />
              <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: "#888" }}>%</span>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 24 }}>
        {THEME_DATA.map(t => (
          <ThemeMixSliders key={t.id} themeName={t.name} totalRev={rev(t.id)}
            mix={mixes[t.id]} setMix={mix => setMix(t.id, mix)}
            locked={locked[t.id]} setLocked={fn => setLockedAll(l => ({ ...l, [t.id]: typeof fn === "function" ? fn(l[t.id]) : fn }))} />
        ))}
      </div>

      <div style={{ overflowX: "auto", marginBottom: 20 }}>
        <table className="sl-pl" style={{ minWidth: 480 }}>
          <thead><tr><th>July 2030 (£k)</th>{THEME_DATA.map(t => <th key={t.id}>{t.name.split(" ").slice(0, 2).join(" ")}</th>)}<th>School</th></tr></thead>
          <tbody>
            <tr><td>Revenue</td>{THEME_DATA.map(t => <td key={t.id} className="mono">{fmtK(rev(t.id))}</td>)}<td className="mono">{fmtK(totalRev)}</td></tr>
            <tr><td>Operating cost</td>{THEME_DATA.map(t => <td key={t.id} className="mono">{fmtK(cost(t.id))}</td>)}<td className="mono">{fmtK(totalCost)}</td></tr>
            <tr className="sub"><td>Contribution</td>{THEME_DATA.map(t => { const m2 = rev(t.id) - cost(t.id); return <td key={t.id} className="mono" style={{ color: surplusColor(m2) }}>{fmtK(m2)}</td>; })}<td className="mono" style={{ color: surplusColor(totalRev - totalCost) }}>{fmtK(totalRev - totalCost)}</td></tr>
          </tbody>
        </table>
      </div>
      <div className="sl-note-box">Contribution is before the University service charge ({fmtK(k30.uni)}) and loan repayment, which are carried at school level.</div>
      <SaveBar onSave={onSave} onSaveContinue={onSaveContinue} continueLabel="Save & continue → Finalise" saved={saved} />
    </div>
  );
}

/* ── 9. FINALISE (print + email the shared model) ─────────────────────────── */
function buildSummaryHtml(m) {
  const date = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const tgt = nv(m.targetPct, 7.5);
  const H2 = t => `<h2 style="font-size:15px;color:#e07030;margin:22px 0 8px;border-bottom:1px solid #eee;padding-bottom:4px">${t}</h2>`;
  const tr = cells => `<tr>${cells.map(([v, a, b, c]) => `<td style="padding:3px 8px;border-bottom:1px solid #eee;text-align:${a || "left"};${b ? "font-weight:700;" : ""}${c ? `color:${c};` : ""}">${v}</td>`).join("")}</tr>`;
  const tbl = (head, rows) => `<table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:10px"><thead><tr>${head.map(([h, a]) => `<th style="text-align:${a || "left"};padding:4px 8px;border-bottom:2px solid #ccc">${h}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table>`;

  const plRows = () => {
    let r = "";
    r += tr([["INCOME", "left", true]].concat(YEARS.map(() => ["", "right"])));
    revLinesFor(m).forEach(l => r += tr([[l.name + (l.custom ? " (new)" : "")]].concat(YEARS.map(y => [fmtK(projRev(l, y, m)), "right"]))));
    r += tr([["Total income", "left", true]].concat(YEARS.map(y => [fmtK(yearKpis(y, m).revTotal), "right", true])));
    r += tr([["STAFF COSTS", "left", true]].concat(YEARS.map(() => ["", "right"])));
    COST_LINES.filter(l => l.group === "staff").forEach(l => r += tr([[l.name]].concat(YEARS.map(y => [fmtK(projCost(l, y, m)), "right"]))));
    r += tr([["OTHER OPERATING COSTS", "left", true]].concat(YEARS.map(() => ["", "right"])));
    COST_LINES.filter(l => l.group === "operating").forEach(l => r += tr([[l.name]].concat(YEARS.map(y => [fmtK(projCost(l, y, m)), "right"]))));
    r += tr([["Total operating costs", "left", true]].concat(YEARS.map(y => [fmtK(yearKpis(y, m).operatingCost), "right", true])));
    r += tr([["Operating surplus (contribution)", "left", true]].concat(YEARS.map(y => { const k = yearKpis(y, m); return [fmtK(k.contribution), "right", true, surplusColor(k.contribution)]; })));
    r += tr([["less service charge"]].concat(YEARS.map(y => ["(" + fmtK(yearKpis(y, m).uni) + ")", "right"])));
    r += tr([["less loan repayment"]].concat(YEARS.map(y => ["(" + fmtK(loanFor(y, m)) + ")", "right"])));
    r += tr([["NET SURPLUS", "left", true]].concat(YEARS.map(y => { const k = yearKpis(y, m); return [`${fmtK(k.net)} (${k.netPct.toFixed(1)}%)`, "right", true, surplusColor(k.net)]; })));
    return r;
  };
  const postureRows = REV_LINES.filter(l => l.kind === "normal").map(l => {
    const pid = m.posture?.[l.id]; const lab = pid ? POSTURE_BY_ID[pid].label : "Trajectory";
    return tr([[l.name], [lab, "right"]]);
  }).join("") + tr([["Micro-credentials (new)"], [fmtK(nv(m.newTarget?.micro_cred, 0)) + " by 2030", "right"]]);
  const themeRows = THEME_DATA.map(t => {
    const k30 = yearKpis(2030, m); const r = k30.revTotal * nv(m.themePct?.[t.id], t.defPct) / 100; const c = k30.operatingCost * nv(m.themePct?.[t.id], t.defPct) / 100;
    return tr([[t.name], [fmtK(r), "right"], [fmtK(c), "right"], [fmtK(r - c), "right", false, surplusColor(r - c)]]);
  }).join("");
  const groupRows = PURPOSE_GROUPS.map(g => tr([[g], [nv(m.purposeGroups?.[g]) || "—", "right", false, nv(m.purposeGroups?.[g]) >= 8 ? "#e07030" : ""]])).join("");
  const tensionRows = PURPOSE_TENSIONS.map(x => { const v = nv(m.purposeTensions?.[x.key], DEFAULT_TENSIONS[x.key]); const lab = v < 33 ? x.l : v > 66 ? x.r : "Balanced"; return tr([[x.desc], [`<strong>${lab}</strong> (${v})`]]); }).join("");

  return `<div style="font-family:Arial,sans-serif;max-width:760px;color:#1a1a1a;line-height:1.5">
<h1 style="font-size:20px;border-bottom:3px solid #e07030;padding-bottom:8px;margin-bottom:4px">STRAWPERSON — FBaM Financial Scenario</h1>
<p style="color:#888;font-size:11px;margin-bottom:18px">Session: ${STORE.sessionId} &nbsp;·&nbsp; ${date} &nbsp;·&nbsp; last edited by ${m.lastEditedBy || "—"}</p>
${H2("1. Target")}<p style="font-size:13px">Net operating surplus target: <strong>${tgt >= 0 ? "+" : ""}${tgt.toFixed(1)}%</strong> by 31 July 2030.</p>
${H2("2. Full P&L — Q3 25/26 actual, 26/27 budget, 27/28–29/30 estimates")}
${tbl([["Line (£k)"]].concat(YEARS.map(y => [COL_LABEL[y] + (IS_ACTUAL[y] ? "" : " *"), "right"])), plRows())}
<p style="font-size:10px;color:#999">* Estimate years — direction of travel only. Not a forecast.</p>
${H2("3. Changes — posture per stream")}${tbl([["Revenue stream"], ["Posture", "right"]], postureRows)}
${H2("4. Theme P&L (July 2030)")}${tbl([["Theme"], ["Revenue", "right"], ["Op. cost", "right"], ["Contribution", "right"]], themeRows)}
${H2("5. Who FBaM should serve")}${tbl([["Stakeholder"], ["Score", "right"]], groupRows)}
${H2("6. Positioning")}${tbl([["Dimension"], ["Position"]], tensionRows)}
</div>`;
}

function StepFinalise({ m, onBack }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");

  const fireEmail = async (extraTo) => {
    const to = ["results@changebefore.com"];
    if (extraTo && extraTo.includes("@")) to.push(extraTo);
    try {
      await fetch("/api/send-results", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, subject: `STRAWPERSON — FBaM scenario — ${STORE.sessionId} — ${new Date().toLocaleDateString("en-GB")}`, html: buildSummaryHtml(m) }) });
    } catch (e) {}
  };
  const sendToSelf = async () => { if (!email.includes("@")) { setErr("Enter a valid email."); return; } setErr(""); await fireEmail(email); setSent(true); };
  const printAll = () => {
    const w = window.open("", "_blank");
    if (!w) { window.print(); return; }
    w.document.write(`<html><head><title>FBaM Scenario</title></head><body>${buildSummaryHtml(m)}</body></html>`);
    w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
  };

  const k30 = yearKpis(2030, m), tgt = nv(m.targetPct, 7.5);
  return (
    <div className="sl-content">
      <BackBtn onClick={onBack} />
      <div className="sl-step-h">Finalise</div>
      <div className="sl-prompt">One shared model for the session. Print it, or email a copy. Everything below reflects the latest saved state.</div>
      <div className="sl-kpis">
        <div className="sl-kpi"><div className="l">Target 2030</div><div className="v">{tgt >= 0 ? "+" : ""}{tgt.toFixed(1)}%</div></div>
        <div className="sl-kpi"><div className="l">Net surplus 2030</div><div className="v" style={{ color: surplusColor(k30.net) }}>{fmtK(k30.net)} ({k30.netPct.toFixed(1)}%)</div></div>
        <div className="sl-kpi"><div className="l">Revenue 2030</div><div className="v">{fmtK(k30.revTotal)}</div></div>
      </div>
      <PLTable m={m} years={YEARS} />
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16, marginBottom: 24 }}>
        <button className="sl-btn" onClick={printAll}>Print / save as PDF</button>
      </div>
      <div className="sl-note-box">
        <div style={{ marginBottom: 8, fontWeight: 600, color: "#1a1a1a" }}>Email a copy to yourself</div>
        <div style={{ display: "flex", gap: 8 }}>
          <input type="email" className="sl-input" style={{ flex: 1 }} placeholder="you@cranfield.ac.uk" value={email} onChange={e => { setEmail(e.target.value); setErr(""); }} />
          <button className="sl-btn" style={{ flexShrink: 0 }} onClick={sendToSelf} disabled={sent}>{sent ? "Sent ✓" : "Send"}</button>
        </div>
        {err && <div className="sl-err" style={{ marginTop: 8 }}>{err}</div>}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   ORCHESTRATOR
   ════════════════════════════════════════════════════════════════════════ */
const STEP_NAMES = ["1. Goal", "2. Current position", "3. Trajectory", "4. Who we serve", "5. Positioning", "6. Changes", "7. Yearly P&L", "8. Theme P&L", "9. Finalise"];

function Workspace({ name, onExit }) {
  const [step, setStep] = useState(1);
  const [, setTick] = useState(0);
  const bump = () => setTick(t => t + 1);
  const m = mGet();

  /* Live shared-model polling — pull other editors' changes (last-write-wins) */
  useEffect(() => {
    let alive = true;
    const poll = async () => { await syncFromSupabase(); if (alive) bump(); };
    poll();
    const id = setInterval(poll, 4000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const advance = () => { setStep(s => Math.min(9, s + 1)); bump(); };
  const go = (n) => { setStep(n); bump(); };

  const tabs = STEP_NAMES.map((sn, i) => {
    const n = i + 1;
    const done = m[`step${n}Confirmed`];
    return (
      <div key={n} className={`sl-tab${step === n ? " active" : done ? " done" : ""}`} onClick={() => go(n)}>
        {done ? "✓ " : ""}{sn}
      </div>
    );
  });

  return (
    <div className="sl-shell">
      <div className="sl-header">
        <div className="sl-header-title">STRAWPERSON — FBaM Financial Scenario · shared model <span style={{ color: "#bbb", fontWeight: 400 }}>· build 6.17</span></div>
        <div className="sl-header-right">{name}{m.lastEditedBy && m.lastEditedBy !== name ? ` · last edit: ${m.lastEditedBy}` : ""} &nbsp;·&nbsp;
          <button style={{ background: "none", border: "none", fontSize: 11, color: "#888", cursor: "pointer", textDecoration: "underline" }} onClick={onExit}>Exit</button>
        </div>
      </div>
      <div className="sl-tabs">{tabs}</div>
      {step === 1 && <StepGoal        m={m} confirmed={m.step1Confirmed} onConfirm={advance} onBack={onExit} />}
      {step === 2 && <StepCurrent     m={m} confirmed={m.step2Confirmed} onConfirm={advance} onBack={() => go(1)} />}
      {step === 3 && <StepDoNothing   m={m} confirmed={m.step3Confirmed} onConfirm={advance} onBack={() => go(2)} />}
      {step === 4 && <StepWhoServes   m={m} confirmed={m.step4Confirmed} onConfirm={advance} onBack={() => go(3)} />}
      {step === 5 && <StepPositioning m={m} confirmed={m.step5Confirmed} onConfirm={advance} onBack={() => go(4)} />}
      {step === 6 && <StepChanges     m={m} confirmed={m.step6Confirmed} onConfirm={advance} onBack={() => go(5)} />}
      {step === 7 && <StepYearly      m={m} confirmed={m.step7Confirmed} onConfirm={advance} onBack={() => go(6)} />}
      {step === 8 && <StepTheme       m={m} confirmed={m.step8Confirmed} onConfirm={advance} onBack={() => go(7)} />}
      {step === 9 && <StepFinalise    m={m} onBack={() => go(8)} />}
    </div>
  );
}

/* ── ROOT ─────────────────────────────────────────────────────────────────── */
export default function StrawTool() {
  const [name, setName] = useState("");
  const [ready, setReady] = useState(false);

  const enter = async (n) => {
    setName(n);
    await syncFromSupabase();   /* adopt any existing shared model for this session */
    setReady(true);
  };
  const exit = () => { setName(""); setReady(false); };

  return (
    <>
      <style>{CSS}</style>
      {!ready ? <Entry onEnter={enter} /> : <Workspace name={name} onExit={exit} />}
    </>
  );
}
