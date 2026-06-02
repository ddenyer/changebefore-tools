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

const ENGINE_VERSION = 2;   /* v2: forward rate = sector CAGR (not blended). */

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

/* Drop fields whose meaning changed between engine versions, so a stale saved
   model can't resurrect superseded auto-defaults (e.g. old blended rates).    */
const migrateModel = (m) => {
  if (!m) return m;
  if (m.engineVersion !== ENGINE_VERSION) {
    delete m.blend;            /* legacy: stored blended rates; now sector-default-or-edit */
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
  { id:"cabinet",      name:"Cabinet Office (PLP)",                             q3:1925,  bud:1812,  cagr:8,   kind:"normal",
    conf:"Medium", basis:"Government customised programmes — placed within the customised exec-ed range (~8–12%). (Proxy / local read.)" },
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
  { id:"end",         label:"End / Teach-out",     rate:null, note:"Wind down to £0" },
  { id:"decline",     label:"Managed decline",     rate:-15,  note:"−15% / yr" },
  { id:"maintain",    label:"Maintain",            rate:0,    note:"Hold at budget" },
  { id:"incremental", label:"Incremental growth",  rate:5,    note:"+5% / yr" },
  { id:"radical",     label:"Radical growth",      rate:15,   note:"+15% / yr" },
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

/* Observed one-year step Q3 25/26 → Budget 26/27. This is a LEVEL change
   (already banked in the budget), shown for context — NOT a forward rate.     */
const trendPct = (l, m) => { const { q3, bud } = resolveBase(m?.baseRev, l); return q3 > 0 ? (bud - q3) / q3 * 100 : 0; };
/* Default forward rate = the sector growth rate (a rate signal). The budget
   already banks the one-off level reset, so it does not drive this.           */
const defaultRate = (l) => l.cagr;

/* ── CALC ENGINE — single source of truth ────────────────────────────────── */
/* Project one revenue line for a year, honouring overrides, postures, blend. */
function projRev(l, yr, m) {
  const { q3, bud } = resolveBase(m.baseRev, l);
  if (yr === 2026) return q3;
  if (yr === 2027) return bud;                   /* budget anchor (editable in §2) */
  const ovr = m.revOverride?.[yr]?.[l.id];
  if (ovr !== undefined && ovr !== "") return nv(ovr);
  const steps = yr - 2027;                        /* 1,2,3 for 2028,29,30 */
  if (l.kind === "ending") return 0;              /* masterships / SLEP teach out */
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
  const rate = nv(m.blend?.[l.id], defaultRate(l));
  return bud * Math.pow(1 + rate / 100, steps);
}

/* Project one cost line for a year — do-nothing holds flat at budget. */
function projCost(l, yr, m) {
  const { q3, bud } = resolveBase(m.baseCost, l);
  if (yr === 2026) return q3;
  if (yr === 2027) return bud;
  const ovr = m.costOverride?.[yr]?.[l.id];
  if (ovr !== undefined && ovr !== "") return nv(ovr);
  return bud;                                     /* held flat at budget */
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

/* Whole-year aggregates */
function yearKpis(yr, m) {
  const revTotal   = revLinesFor(m).reduce((s, l) => s + projRev(l, yr, m), 0);
  const staffTotal = COST_LINES.filter(l => l.group === "staff").reduce((s, l) => s + projCost(l, yr, m), 0);
  const opTotal    = COST_LINES.filter(l => l.group === "operating").reduce((s, l) => s + projCost(l, yr, m), 0);
  const operatingCost = staffTotal + opTotal;
  const contribution  = revTotal - operatingCost;
  const uni   = uniFor(yr, m);
  const loan  = loanFor(yr, m);
  const net   = contribution - uni - loan;
  const netPct = revTotal > 0 ? net / revTotal * 100 : 0;
  const contribPct = revTotal > 0 ? contribution / revTotal * 100 : 0;
  return { revTotal, staffTotal, opTotal, operatingCost, contribution, contribPct, uni, loan, net, netPct };
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

/* ── SUGGESTION ENGINE — §4 (who) + §5 (positioning) inform §6 (changes) ──── */
/* Returns { posture, why } for a revenue line, or null for locked/new lines. */
function suggestPosture(l, m) {
  if (l.kind === "ending" || l.kind === "new" || l.custom) return null;
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

  let posture;
  if (score >= 3) posture = "radical";
  else if (score >= 1) posture = "incremental";
  else if (score === 0) posture = "maintain";
  else if (score <= -2) posture = "end";
  else posture = "decline";
  const why = reasons.length ? reasons.slice(0, 2).join("; ") : "no strong signal from your earlier choices — hold at budget";
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
  "Policymakers / government","Staff",
];
const DEFAULT_GROUP_SCORES = {
  "FT students (MSc, MBA)":6,"PT students (MSc, MBA)":4,"Exec education delegates":8,
  "Organisations commissioning exec ed":9,"Research partners and funders":5,"Doctoral students":4,
  "The university itself":7,"The management and leadership profession":7,"Alumni":9,
  "Policymakers / government":4,"Staff":7,
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
const DEFAULT_TENSIONS = { research:35, theory:30, experience:43, market:43, geography:50, profit:23, breadth:35, staffing:43 };

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
function PLTable({ m, years, editBase = false, editYears = [], onCell, compact = false }) {
  const isBaseYr = (yr) => yr === 2026 || yr === 2027;
  const baseCol  = (yr) => yr === 2026 ? "q3" : "bud";

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
        </tr></thead>
        <tbody>
          <tr><td className="grp" colSpan={years.length + 1}>Income</td></tr>
          {revLines.map(l => (
            <tr key={l.id}>
              <td>{l.name}{l.kind === "ending" ? " ⟶ 0" : ""}{l.custom ? " (new)" : ""}</td>
              {years.map(y => cell("rev", l, y))}
            </tr>
          ))}
          <tr className="sub"><td>TOTAL INCOME</td>{yr(y => fmtK(yearKpis(y, m).revTotal))}</tr>

          <tr><td className="grp" colSpan={years.length + 1}>Staff costs</td></tr>
          {COST_LINES.filter(l => l.group === "staff").map(l => (
            <tr key={l.id}><td>{l.name}</td>{years.map(y => cell("cost", l, y))}</tr>
          ))}
          <tr className="sub"><td>Total Staff Costs</td>{yr(y => fmtK(yearKpis(y, m).staffTotal))}</tr>

          <tr><td className="grp" colSpan={years.length + 1}>Other operating costs</td></tr>
          {COST_LINES.filter(l => l.group === "operating").map(l => (
            <tr key={l.id}><td>{l.name}</td>{years.map(y => cell("cost", l, y))}</tr>
          ))}
          <tr className="sub"><td>Total Other Operating Costs</td>{yr(y => fmtK(yearKpis(y, m).opTotal))}</tr>

          <tr className="sub"><td>TOTAL OPERATING COSTS</td>{yr(y => fmtK(yearKpis(y, m).operatingCost))}</tr>
          <tr className="sub"><td>OPERATING SURPLUS (contribution)</td>
            {yr(y => { const k = yearKpis(y, m); return <span style={{ color: surplusColor(k.contribution) }}>{fmtK(k.contribution)}</span>; })}
          </tr>

          <tr className="below"><td>less University service charge (TRAC)</td>{years.map(y => uniLoanCell("uni", y))}</tr>
          <tr className="below"><td>less University loan repayment</td>{years.map(y => uniLoanCell("loan", y))}</tr>
          <tr className="net"><td>NET SURPLUS</td>
            {yr(y => { const k = yearKpis(y, m); return `${fmtK(k.net)}  (${k.netPct.toFixed(1)}%)`; })}
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
  const [tgt, setTgt] = useState(nv(m.targetPct, 7.5));
  const desc = (v) => v <= -5 ? "Significant managed deficit" : v < 0 ? "Managed deficit" : v === 0 ? "Break-even"
    : v <= 2.5 ? "Minimal surplus" : v <= 5 ? "Modest surplus" : v <= 7.5 ? "Sustainable surplus" : "Strong surplus";
  const doConfirm = () => { mSave({ targetPct: tgt, step1Confirmed: true }); onConfirm(); };
  return (
    <div className="sl-content">
      <BackBtn onClick={onBack} />
      {confirmed && <ConfirmedBanner n={1} />}
      <div className="sl-step-h">What net operating surplus should FBaM achieve by July 2030?</div>
      <div className="sl-prompt">Set the 2030 target. You will set the year-by-year path in the Yearly P&L step.</div>
      <div className="sl-slider-wrap">
        <div className="sl-slider-val">{tgt >= 0 ? "+" : ""}{tgt.toFixed(1)}%</div>
        <div className="sl-slider-desc">{desc(tgt)} by July 2030</div>
        <input type="range" className="sl-slider" min="-10" max="10" step="0.5" value={tgt} onChange={e => setTgt(parseFloat(e.target.value))} />
        <div className="sl-slider-range"><span>−10%</span><span>0%</span><span>+10%</span></div>
      </div>
      <button className="sl-btn" onClick={doConfirm}>Confirm target → Current position</button>
    </div>
  );
}

/* ── 2. CURRENT POSITION (full Cranfield P&L, Q3 + Budget — all editable) ──── */
function StepCurrent({ m, confirmed, onConfirm, onBack }) {
  const [baseRev, setBaseRev]   = useState(m.baseRev || {});
  const [baseCost, setBaseCost] = useState(m.baseCost || {});
  const [baseUni, setBaseUni]   = useState(m.baseUni || {});
  const [loanByYear, setLoanByYear] = useState(m.loanByYear || {});
  const liveM = { ...m, baseRev, baseCost, baseUni, loanByYear };
  const k26 = yearKpis(2026, liveM), k27 = yearKpis(2027, liveM);

  const onCell = (kind, yr, id, val) => {
    const col = yr === 2026 ? "q3" : "bud";
    if (kind === "rev")  setBaseRev(o => ({ ...o, [id]: { ...(o[id] || {}), [col]: val } }));
    else if (kind === "cost") setBaseCost(o => ({ ...o, [id]: { ...(o[id] || {}), [col]: val } }));
    else if (kind === "uni")  setBaseUni(o => ({ ...o, [col]: val }));
    else if (kind === "loan") setLoanByYear(o => ({ ...o, [yr]: val }));
  };
  const reset = () => { setBaseRev({}); setBaseCost({}); setBaseUni({}); setLoanByYear(o => ({ ...o, 2026: "", 2027: "" })); };

  const doConfirm = () => { mSave({ baseRev, baseCost, baseUni, loanByYear, step2Confirmed: true }); onConfirm(); };
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
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button className="sl-btn sl-btn-outline" style={{ fontSize: 12, padding: "8px 14px" }} onClick={reset}>↺ Reset to original figures</button>
        <button className="sl-btn" onClick={doConfirm}>Confirm current position → Do-nothing</button>
      </div>
    </div>
  );
}

/* ── 3. DO-NOTHING (sector CAGR is the forward rate; level step is context) ── */
const CONF_COLOR = { "High":"#2d7d46", "Med–High":"#2d7d46", "Medium":"#b87a20", "Low–Med":"#b87a20", "Low":"#b83232" };
function StepDoNothing({ m, confirmed, onConfirm, onBack }) {
  const init = () => { const b = {}; REV_LINES.forEach(l => { if (l.kind === "normal") b[l.id] = String(nv(m.blend?.[l.id], defaultRate(l))); }); return b; };
  const [blend, setBlend] = useState(init);
  const liveM = { ...m, blend: Object.fromEntries(Object.entries(blend).map(([k, v]) => [k, nv(v)])), posture: {} };

  const doConfirm = () => {
    const b = {};
    REV_LINES.forEach(l => {
      if (l.kind !== "normal") return;
      const v = nv(blend[l.id], defaultRate(l));
      if (v !== defaultRate(l)) b[l.id] = v;   /* store only genuine overrides */
    });
    mSave({ blend: b, step3Confirmed: true });
    onConfirm();
  };
  const resetRates = () => { const b = {}; REV_LINES.forEach(l => { if (l.kind === "normal") b[l.id] = String(defaultRate(l)); }); setBlend(b); };
  const td = { fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, textAlign: "right", padding: "5px 8px" };

  return (
    <div className="sl-content">
      <BackBtn onClick={onBack} />
      {confirmed && <ConfirmedBanner n={3} />}
      <div className="sl-step-h">Do-nothing trajectory</div>
      <div className="sl-prompt">If nothing changes. Each income line carries a forward growth rate drawn from market research on the sector — that is the rate it grows at from the 2026/27 budget onward. The one-off step from the Q3 forecast to the budget is shown for context only: it is a level change, already banked in the budget, not a growth rate. Apprenticeship and SLEP income ends in 2027 regardless.</div>

      <div className="sl-note-box">
        <div style={{ fontWeight: 600, color: "#1a1a1a", marginBottom: 6 }}>About these growth rates</div>
        The sector growth rate for each line is a planning mid-point from market research on UK postgraduate business-school revenue, 2024–2030. The rates are nominal and deliberately cautious where only global figures exist. Three things to hold in mind: government-linked income (research funding and grants) is flat in cash and slightly negative in real terms; executive education — open and customised — is the only genuinely growing category, though the UK outlook sits below global rates; and for taught master's, fee income has stayed roughly flat even as international student numbers fell, so the rate reflects revenue, not enrolments. Hover any rate for its basis and confidence. Edit any rate you don't accept.
      </div>

      <div style={{ overflowX: "auto", marginBottom: 12 }}>
        <table className="sl-pl" style={{ minWidth: 620 }}>
          <thead><tr>
            <th>Income line</th>
            <th>Q3 25/26</th><th>Budget 26/27</th><th>Q3→Budget *</th><th>Sector rate</th><th>Forward rate</th>
          </tr></thead>
          <tbody>
            {REV_LINES.map(l => { const rb = resolveBase(m.baseRev, l); return (
              <tr key={l.id}>
                <td title={l.basis || ""}>{l.name}
                  {l.conf && <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: CONF_COLOR[l.conf] || "#888" }}>{l.conf}</span>}
                </td>
                <td style={td}>{fmtK(rb.q3)}</td>
                <td style={td}>{fmtK(rb.bud)}</td>
                <td style={{ ...td, color: "#aaa" }} title="One-off level change, already banked in the budget — context only, not a growth rate.">
                  {l.kind === "normal" ? fmtPct(trendPct(l, m)) : "—"}
                </td>
                <td style={{ ...td, color: "#888" }} title={l.basis || ""}>{(l.kind === "normal") ? fmtPct(l.cagr) : "—"}</td>
                <td style={td}>
                  {l.kind === "ending" ? <span style={{ color: "#b83232", fontSize: 11 }}>ends 2027 → £0</span>
                    : l.kind === "new" ? <span style={{ color: "#aaa", fontSize: 11 }}>set in Changes</span>
                    : <input type="number" className="sl-num" style={{ width: 64 }} step="0.5"
                        value={blend[l.id] ?? "0"} onChange={e => setBlend(s => ({ ...s, [l.id]: e.target.value }))} />}
                </td>
              </tr>
            ); })}
          </tbody>
        </table>
      </div>
      <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: "#999", marginBottom: 4 }}>
        * Q3→Budget is the one-off movement into the agreed budget — a level change, not a rate. The forward rate defaults to the sector rate and compounds from the 2026/27 budget.
      </div>
      <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: "#999", marginBottom: 16 }}>
        Cost weight vs growth rate: a business school's research income sits at roughly a third of the per-head level of STEM disciplines, but that is a level effect, not a rate — both grow at about the sector rate, so the smaller base is carried as a level, not a rate haircut. QR can still move more sharply than the sector around each REF, on a small base. Basis: UK postgraduate business-school revenue CAGR benchmark 2024–2030 — HESA, Chartered ABS, UNICON, Research England / UKRI, market-research forecasts; confidence varies by line.
      </div>

      <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, color: "#888", marginBottom: 8 }}>Resulting do-nothing P&L</div>
      <PLTable m={liveM} years={YEARS} compact />
      <div className="sl-kpis">
        {YEARS.map(y => { const k = yearKpis(y, liveM); return (
          <div className="sl-kpi" key={y}><div className="l">{COL_LABEL[y]}</div>
            <div className="v" style={{ color: surplusColor(k.net) }}>{k.netPct.toFixed(1)}%</div></div>
        ); })}
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button className="sl-btn sl-btn-outline" style={{ fontSize: 12, padding: "8px 14px" }} onClick={resetRates}>↺ Reset rates to sector basis</button>
        <button className="sl-btn" onClick={doConfirm}>Confirm do-nothing → Who we serve</button>
      </div>
    </div>
  );
}

/* ── 4. WHO FBAM SERVES ───────────────────────────────────────────────────── */
function StepWhoServes({ m, confirmed, onConfirm, onBack }) {
  const init = () => { const g = {}; PURPOSE_GROUPS.forEach(k => g[k] = nv(m.purposeGroups?.[k], DEFAULT_GROUP_SCORES[k] || 5)); return g; };
  const [groups, setGroups] = useState(init);
  const MAX_HIGH = 3;
  const highCount = Object.values(groups).filter(v => nv(v) >= 8).length;
  const setScore = (g, n) => { const cur = nv(groups[g]); if (n >= 8 && cur < 8 && highCount >= MAX_HIGH) return; setGroups(p => ({ ...p, [g]: n })); };
  const doConfirm = () => { mSave({ purposeGroups: groups, step4Confirmed: true }); onConfirm(); };
  return (
    <div className="sl-content">
      <BackBtn onClick={onBack} />
      {confirmed && <ConfirmedBanner n={4} />}
      <div className="sl-step-h">Who should FBaM serve?</div>
      <div className="sl-prompt">Rate each stakeholder group 1–9 by importance to FBaM's future. If everything scores 9, nothing is a priority. A maximum of three groups can score 8 or 9 — use those slots deliberately. ({MAX_HIGH - highCount} high-priority slots left.)</div>
      {PURPOSE_GROUPS.map(g => (
        <div key={g} style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: "#1a1a1a" }}>{g}</span>
            <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 13, fontWeight: 600, color: nv(groups[g]) >= 8 ? "#e07030" : "#1a1a1a" }}>{nv(groups[g])}</span>
          </div>
          <input type="range" min={1} max={9} step={1} value={nv(groups[g], 5)} onChange={e => setScore(g, parseInt(e.target.value))}
            style={{ width: "100%", accentColor: nv(groups[g]) >= 8 ? "#e07030" : "#888" }} />
        </div>
      ))}
      <button className="sl-btn" style={{ marginTop: 12 }} onClick={doConfirm}>Confirm priorities → Positioning</button>
    </div>
  );
}

/* ── 5. POSITIONING (tension sliders — default numbers retained) ──────────── */
function StepPositioning({ m, confirmed, onConfirm, onBack }) {
  const init = () => { const t = {}; PURPOSE_TENSIONS.forEach(x => t[x.key] = nv(m.purposeTensions?.[x.key], DEFAULT_TENSIONS[x.key])); return t; };
  const [t, setT] = useState(init);
  const doConfirm = () => { mSave({ purposeTensions: t, step5Confirmed: true }); onConfirm(); };
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
          <input type="range" min={0} max={100} step={1} value={nv(t[x.key], 50)} onChange={e => setT(p => ({ ...p, [x.key]: parseInt(e.target.value) }))}
            style={{ width: "100%", accentColor: "#e07030" }} />
        </div>
      ))}
      <button className="sl-btn" onClick={doConfirm}>Confirm positioning → Changes</button>
    </div>
  );
}

/* ── 6. CHANGES (macro postures, suggested from §4/§5, + new streams) ─────── */
function StepChanges({ m, confirmed, onConfirm, onBack }) {
  const [posture, setPosture] = useState(m.posture || {});
  const [microTarget, setMicroTarget] = useState(String(nv(m.newTarget?.micro_cred, 0)));
  const [customRev, setCustomRev] = useState(m.customRev || []);
  const [customTargets, setCustomTargets] = useState(() => {
    const t = {}; (m.customRev || []).forEach(c => t[c.id] = String(nv(m.newTarget?.[c.id], 0))); return t;
  });
  const [newName, setNewName] = useState("");
  const [newTgt, setNewTgt] = useState("");

  const newTargetObj = { ...(m.newTarget || {}), micro_cred: nv(microTarget) };
  customRev.forEach(c => { newTargetObj[c.id] = nv(customTargets[c.id]); });
  const liveM = { ...m, posture, customRev, newTarget: newTargetObj };

  const normals = REV_LINES.filter(l => l.kind === "normal");
  const suggestions = {}; normals.forEach(l => suggestions[l.id] = suggestPosture(l, m));

  const setP = (id, pid) => setPosture(p => { const n = { ...p }; if (n[id] === pid) delete n[id]; else n[id] = pid; return n; });
  const applyAllSuggestions = () => setPosture(p => { const n = { ...p }; normals.forEach(l => { if (suggestions[l.id]) n[l.id] = suggestions[l.id].posture; }); return n; });

  const addStream = () => {
    if (!newName.trim()) return;
    const id = "custom_" + Date.now().toString(36);
    setCustomRev(cs => [...cs, { id, name: newName.trim() }]);
    setCustomTargets(t => ({ ...t, [id]: newTgt || "0" }));
    setNewName(""); setNewTgt("");
  };
  const removeStream = (id) => { setCustomRev(cs => cs.filter(c => c.id !== id)); setCustomTargets(t => { const n = { ...t }; delete n[id]; return n; }); };

  const doConfirm = () => {
    mSave({ posture, customRev, newTarget: newTargetObj, step6Confirmed: true });
    onConfirm();
  };

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
      <div className="sl-prompt">This is the strategic choice: what do you do with each existing revenue stream — and do you bring in new ones? Each stream carries a suggested posture (marked ◦, in green) drawn from who you chose to serve and how you positioned FBaM. Accept the suggestions or override them. If you choose nothing, the stream follows its do-nothing trajectory.</div>
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
              <NumInput width={80} step={50} value={customTargets[c.id] ?? "0"} onChange={v => setCustomTargets(t => ({ ...t, [c.id]: v }))} min={0} />
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
      <button className="sl-btn" onClick={doConfirm}>Confirm changes → Yearly P&L</button>
    </div>
  );
}

/* ── 7. YEARLY P&L (full transition table, estimates editable, vs target) ─── */
function StepYearly({ m, confirmed, onConfirm, onBack }) {
  const [revOverride, setRevOverride]   = useState(m.revOverride || {});
  const [costOverride, setCostOverride] = useState(m.costOverride || {});
  const [loanByYear, setLoanByYear]     = useState(m.loanByYear || {});
  const [uniByYear, setUniByYear]       = useState(m.uniByYear || {});

  const liveM = { ...m, revOverride, costOverride, loanByYear, uniByYear };
  const tp = targetPath(liveM);

  const onCell = (kind, yr, id, val) => {
    if (kind === "loan") { setLoanByYear(o => ({ ...o, [yr]: val })); return; }
    if (kind === "uni")  { setUniByYear(o => ({ ...o, [yr]: val })); return; }
    const setter = kind === "rev" ? setRevOverride : setCostOverride;
    setter(o => ({ ...o, [yr]: { ...(o[yr] || {}), [id]: val } }));
  };
  const resetEstimates = () => { setRevOverride({}); setCostOverride({}); setUniByYear({}); };

  const doConfirm = () => { mSave({ revOverride, costOverride, loanByYear, uniByYear, step7Confirmed: true }); onConfirm(); };

  return (
    <div className="sl-content">
      <BackBtn onClick={onBack} />
      {confirmed && <ConfirmedBanner n={7} />}
      <div className="sl-step-h">Yearly P&L — transition to target</div>
      <div className="sl-prompt">The full P&L, year by year, with your changes applied. Q3 25/26 and the 2026/27 budget are locked. The estimate columns reflect your postures — edit any estimate cell directly to override. The target row shows the path to your {nv(m.targetPct, 7.5).toFixed(1)}% goal.</div>

      <PLTable m={liveM} years={YEARS} editYears={EST_YEARS} onCell={onCell} />

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

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button className="sl-btn sl-btn-outline" style={{ fontSize: 12, padding: "8px 14px" }} onClick={resetEstimates}>↺ Reset estimate overrides</button>
        <button className="sl-btn" onClick={doConfirm}>Confirm P&L → Theme P&L</button>
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
  const k30 = yearKpis(2030, m);
  const initPct = () => { const p = {}; THEME_DATA.forEach(t => p[t.id] = nv(m.themePct?.[t.id], t.defPct)); return p; };
  const [pct, setPct] = useState(initPct);
  const [mixes, setMixes] = useState(m.themeMixes || { btg: { ...DEFAULT_MIXES.btg }, psl: { ...DEFAULT_MIXES.psl }, scpss: { ...DEFAULT_MIXES.scpss } });
  const [locked, setLockedAll] = useState({ btg: {}, psl: {}, scpss: {} });

  const setPctRebalance = (id, val, idx) => {
    const v = Math.max(0, Math.min(100, nv(val)));
    const others = THEME_DATA.filter((_, i) => i !== idx);
    const otherTot = others.reduce((s, o) => s + pct[o.id], 0);
    const delta = v - pct[id];
    const np = { ...pct, [id]: v };
    if (otherTot > 0) others.forEach(o => { np[o.id] = Math.max(0, Math.round(pct[o.id] - delta * (pct[o.id] / otherTot))); });
    const sum = Object.values(np).reduce((a, b) => a + b, 0);
    np[others[others.length - 1].id] += 100 - sum;
    setPct(np);
  };

  const rev = (id) => k30.revTotal * pct[id] / 100;
  const cost = (id) => k30.operatingCost * pct[id] / 100;
  const totalRev = THEME_DATA.reduce((s, t) => s + rev(t.id), 0);
  const totalCost = THEME_DATA.reduce((s, t) => s + cost(t.id), 0);

  const doConfirm = () => { mSave({ themePct: pct, themeMixes: mixes, step8Confirmed: true }); onConfirm(); };

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
            mix={mixes[t.id]} setMix={mix => setMixes(mm => ({ ...mm, [t.id]: mix }))}
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
      <button className="sl-btn" onClick={doConfirm}>Confirm themes → Finalise</button>
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
    const pid = m.posture?.[l.id]; const lab = pid ? POSTURE_BY_ID[pid].label : "Do-nothing";
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
const STEP_NAMES = ["1. Goal", "2. Current position", "3. Do-nothing", "4. Who we serve", "5. Positioning", "6. Changes", "7. Yearly P&L", "8. Theme P&L", "9. Finalise"];

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
        <div className="sl-header-title">STRAWPERSON — FBaM Financial Scenario · shared model</div>
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
