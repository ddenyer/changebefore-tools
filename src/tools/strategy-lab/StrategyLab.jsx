import { useState, useEffect } from "react";

/* ── GLOBAL STORE ─────────────────────────────────────────────────────────── */
const STORE = { participants: {}, step: 1, revealed: {}, sessionId: "" };
const pSave = (name, d) => {
  STORE.participants[name] = { ...(STORE.participants[name] || { name }), ...d };
  if (STORE.sessionId) {
    fetch("/api/sl-save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: STORE.sessionId, participantName: name, data: STORE.participants[name] }),
    }).catch(() => {});
  }
};
const pGet  = n => STORE.participants[n] || { name: n };
const pAll  = () => Object.values(STORE.participants);
const syncFromSupabase = async () => {
  if (!STORE.sessionId) return;
  try {
    const resp = await fetch("/api/sl-load?sessionId=" + encodeURIComponent(STORE.sessionId));
    if (!resp.ok) return;
    const { participants } = await resp.json();
    participants.forEach(p => { if (p.name) STORE.participants[p.name] = p; });
  } catch (e) {}
};

/* ── DATA — Q2 FCA 2025/26 ACTUALS ───────────────────────────────────────── */
const REV_LINES = [
  { id: "ft_msc",      name: "FT MSc & MBA programmes",              baseK: 11586, prefillK: 11586,
    note: "Award Bearing Fee Income — gross fees before bursaries. MBA, MSc Management, Finance, LSCM, Procurement, BDA, Banking. Q2 actuals: MSc Management 4 students (forecast 10); Finance 9 (met forecast)." },
  { id: "pt_levy",     name: "PT Levy / Apprenticeship programmes",   baseK: 4729,  prefillK: 4729,
    note: "Award Bearing Fee Income – Masterships. Q2 25/26 actuals: £4,729k. Level 7 SLA ends — this income will go to zero. Default rate set to −100%." },
  { id: "exec_ed",     name: "Customised & Executive Education",      baseK: 9949,  prefillK: 9949,
    note: "CED Customised £5,000k + SLEP/Non-Award Bearing £2,798k + Cabinet Office £1,885k + other £266k. Pipeline 86% confirmed. SLEP/Non-Award Bearing (£2,798k) ends." },
  { id: "open",        name: "Open Programmes",                       baseK: 3216,  prefillK: 3216,
    note: "CMDL £2,709k (LTP, Specialist, Praxis, BGP) + CU Open £505k (Entrepreneurship, Digital Stackable, Specialist Online)." },
  { id: "research_dd", name: "Research, Design & Development",        baseK: 1755,  prefillK: 1755,
    note: "Changing World of Work £712k, LSCM £972k, Entrepreneurship £60k, Strategic Marketing £11k. Year-end delivery tied to academic capacity." },
  { id: "hefce",       name: "HEFCE & Allocated Research Funding",    baseK: 1404,  prefillK: 1404,
    note: "Research Funding £270k, QR Allocated £493k, Business Funding £368k, Research Supervision £58k, HEIF £200k, PRF £14k." },
  { id: "residences",  name: "Residences & Conference Facilities",    baseK: 690,   prefillK: 690,
    note: "Conference centre and accommodation income. Linked to customised programme volume — moves with CED." },
  { id: "other_rev",   name: "Other income",                          baseK: 1049,  prefillK: 1049,
    note: "Endowment £159k, Interest £10k, Miscellaneous £698k (inc MoD AP), Gift Aid £181k." },
];

const COST_LINES = [
  { id: "academic_staff", name: "Academic staff (64.5 FTE)",               baseK: 7529,
    note: "64.5 FTE at Q2 — down from 74 at Q1 (budget 82 FTE). 1.5% pay award from 1 Feb 2026 included. Redundancy costs excluded. Major leaver cohort expected June 2026." },
  { id: "support_staff",  name: "PS & research staff (50 FTE)",             baseK: 2529,
    note: "Professional services 38.8 FTE (£2,238k) + Research 11.25 FTE (£291k). Increasing PS cover needed as academic leavers rise." },
  { id: "associates",     name: "Associates & visiting lecturers",           baseK: 499,
    note: "Visiting Lecturers/Consultants £422k, agency/temp £7k, training £35k, other £35k. Variable — scales with delivery volume." },
  { id: "prog_costs",     name: "Programme delivery & student costs",        baseK: 4998,
    note: "Bursaries funded £295k + unfunded £2,528k; student costs £833k; course accommodation £1,164k; learning materials £178k. Variable — moves with intake volume." },
  { id: "ops_overhead",   name: "Operational overheads & support",           baseK: 7947,
    note: "Professional/consultancy £3,090k, commissions & profit share £2,349k, premises/utilities £309k, travel £564k, marketing £357k, depreciation & other £1,278k." },
  { id: "uni_charge",     name: "University service charge",                 baseK: 10325,
    note: "Internal overhead recharge — university taxation on the School. Current figure: £10,325k (24/25 budget basis). New TRAC-based figure pending. This charge converts the contribution surplus into the fully-loaded operating result." },
];

const VARIABLE_COST_IDS = ["associates", "prog_costs"];
const REV_DEF_RATES = { ft_msc: 0, pt_levy: -100, exec_ed: -13.214, open: 0, research_dd: 0, hefce: 0, residences: -6.7374, other_rev: 0 };
const COST_DRIVERS  = { academic_staff: "Pay award", support_staff: "Pay award", associates: "Day rate / volume", prog_costs: "Intake volume", ops_overhead: "Inflation / recharge", uni_charge: "TRAC / university allocation" };
const STEP_NAMES    = ["1. Set goal","2. Revenue","3. Costs","4. Current position","5. Market context","6. Predicted revenues","7. Predicted costs","8. Prognosis","9. Who FBaM serves","10. Positioning","11. Purpose","12. Mission","13. Distinctiveness","14. VRIN test","15. Disappearance","16. WHY/HOW/WHAT","17. Close the gap","18. Theme P&L","19. Comparison","20. Finalise"];

/* ── PURPOSE TOOL DATA ──────────────────────────────────────────────────── */
const PURPOSE_GROUPS = [
  "FT students (MSc, MBA)",
  "PT / exec students (levy, non-levy, EMBA)",
  "Organisations commissioning exec ed",
  "Research partners and funders",
  "Doctoral students",
  "The university itself",
  "The management and leadership profession",
  "Alumni",
  "Policymakers / government",
  "Staff",
];

// Left (0) → Right (100). 9 = extremely important on scale.
const PURPOSE_TENSIONS = [
  { key:"research",   l:"Teaching intensive",  r:"Research intensive",  desc:"Where does FBaM invest most?" },
  { key:"theory",     l:"Applied / impact",    r:"Theory led",          desc:"How is knowledge generated and shared?" },
  { key:"experience", l:"Post-experience",     r:"Pre-experience",      desc:"Who are the primary customers?" },
  { key:"market",     l:"High-end executive",  r:"Mass market",         desc:"Which end of the market?" },
  { key:"geography",  l:"International",       r:"Domestic",            desc:"Where is the focus?" },
  { key:"profit",     l:"Grow revenue",        r:"Cut cost base",       desc:"Primary route to improved financial position?" },
  { key:"breadth",    l:"Focused depth",       r:"Wide portfolio",      desc:"Many programmes or fewer done exceptionally?" },
  { key:"staffing",   l:"Flexible staffing",   r:"Fixed staffing",      desc:"Associates vs faculty and professional staff?" },
];

async function callAI(prompt, timeoutMs = 15000) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch("/api/stat-chat", {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    clearTimeout(timer);
    const data = await res.json();
    return data.content?.[0]?.text || "";
  } catch (e) { return ""; }
}

/* ── FALLBACK OPTIONS (shown immediately; API replaces if it responds in time) ── */
const FALLBACKS = {
  purpose: [
    "Develop leaders and managers who make complex organisations work better",
    "Translate research and expertise into tangible improvement in management practice",
    "Equip experienced professionals with the capability to lead change in their organisations",
    "Bridge the gap between academic knowledge and the decisions that matter in practice",
  ],
  mission: [
    "Become the first choice for organisations that need management education grounded in real-world complexity",
    "Build a sustainable portfolio that combines world-class executive education with rigorous applied research",
    "Establish FBaM as the definitive school for technology, defence, and infrastructure management",
    "Create an environment where experienced practitioners and researchers learn from each other",
  ],
  unique: [
    "A campus-based residential model that creates learning intensity that e.g., Warwick Business School, Imperial College Business School, Saïd Business School Oxford cannot replicate online",
    "Deep adjacency to Cranfield's engineering and technology faculty — unique in UK management education",
    "Established relationships with defence, aerospace, and infrastructure clients spanning decades",
    "A cohort model that attracts senior practitioners: the peer network is as valuable as the teaching",
  ],
  disappear: [
    "Students would migrate to e.g., Warwick Business School, Imperial College Business School, Saïd Business School Oxford, Ashridge, etc. — the gap would be covered within a year",
    "Exec ed clients would find alternatives — the work would continue with other providers",
    "Cranfield would lose a significant income stream but the university would survive the transition",
    "A genuinely distinctive combination of technology-adjacent management education would be lost — and no comparable UK alternative exists",
  ],
};
const THEMES        = ["Business Transformation and Growth","People, Skills and Leadership","Supply Chain, Projects and Sustainable Systems"];

/* ── MARKET BENCHMARKS — UK business schools 2024→2028 ─────────────────── */
const MARKET_BENCHMARKS = [
  { id: "ft_msc",      label: "Postgraduate MSc & MBA (FT)",         range: "−2% to 0% CAGR",          mid: -1,     direction: "Declining",          dirColor: "#b83232",
    context: "Graduate Route reducing to 18 months from Jan 2027 suppresses demand. £925 international student levy lands August 2028. Mid-tier schools structurally most exposed." },
  { id: "pt_levy",     label: "Apprenticeships / Levy",               range: "Eliminated",               mid: -100,   direction: "Eliminated",         dirColor: "#b83232",
    context: "Level 7 defunded Jan 2026. Level 3/5/6 management defunded Sept 2026. Revenue at or near zero by mid-2027. Any residual is marginal employer self-funded activity." },
  { id: "exec_ed",     label: "Customised & Executive Education",     range: "+6% to +9% sector CAGR",   mid: -13.2,  direction: "FBaM: Declining",    dirColor: "#b83232",
    context: "Sector growing strongly (UNICON 2025) but FBaM loses SLEP/Non-Award Bearing (£2,798k). Default reflects FBaM-specific position. Adjust if you disagree with SLEP assumption." },
  { id: "open",        label: "Open Programmes",                      range: "+6% to +9% CAGR",          mid: 7.5,    direction: "Growing",            dirColor: "#2d7d46",
    context: "UNICON 2024: 13% growth. In-person recovery embedded above 60%. Middle East and SE Asia demand growing. Partially absorbed demand displaced from apprenticeship pipeline." },
  { id: "research_dd", label: "Research, Design & Development",       range: "+1% to +2% nominal CAGR",  mid: 1.5,    direction: "Flat (real terms)",  dirColor: "#b87a20",
    context: "UKRI four-year settlement provides ~2% nominal annual growth, matching inflation. Business schools hold 1.3% of UKRI funding with no structural improvement in sight." },
  { id: "hefce",       label: "HEFCE & Allocated Research Funding",   range: "+1% to +2% nominal CAGR",  mid: 1.5,    direction: "Flat (real terms)",  dirColor: "#b87a20",
    context: "QR and allocated research funding broadly flat in real terms through 2028. ESRC applicant-led calls modestly expanding from April 2026." },
  { id: "residences",  label: "Residences & Conference Facilities",   range: "Linked to exec ed volume",  mid: -6.7,   direction: "Declining",          dirColor: "#b83232",
    context: "Moves directly with customised programme volume. Default reflects loss of SLEP residential programmes. Adjust in line with your exec ed assumption." },
  { id: "other_rev",   label: "Other income",                         range: "0% to +2%",                mid: 0,      direction: "Stable",             dirColor: "#888",
    context: "Endowment, interest, miscellaneous income. Broadly stable through the period." },
];
const FAC_PWD       = "fbam2026";
const PART_PWD      = "FBAM-Mar26!";
const PERIODS       = 2.33;

/* ── UTILITIES ────────────────────────────────────────────────────────────── */
const nv       = (v, fb = 0) => { const n = parseFloat(v); return isNaN(n) ? fb : n; };
const fmtK     = v => { const n = Math.round(v); return (n < 0 ? "−" : "") + "£" + Math.abs(n).toLocaleString() + "k"; };
const fmtPct   = v => (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(1) + "%";
const cmpnd    = (base, rate) => base * Math.pow(1 + (nv(rate)) / 100, PERIODS);
const annlRate = (total) => (Math.pow(1 + total / 100, 1 / PERIODS) - 1) * 100;

const calcPredRevs = (p) => {
  const rates = p.revRates || {};
  const revs  = p.revenues || {};
  let total = 0;
  const predRevs = {};
  REV_LINES.forEach(l => {
    const cur  = nv(revs[l.id], l.prefillK);
    const rate = nv(rates[l.id], REV_DEF_RATES[l.id]);
    predRevs[l.id] = cmpnd(cur, rate);
    total += predRevs[l.id];
  });
  total += nv(p.revOtherK, 0);
  return { predRevs, total };
};

const calcPredCosts = (p, scaleFactor = 1) => {
  const rates = p.costRates || {};
  const costs = p.costs || {};
  let total = 0;
  const predCosts = {};
  COST_LINES.forEach(l => {
    const cur  = nv(costs[l.id], l.baseK);
    const rate = nv(rates[l.id], 0);
    let pred = cmpnd(cur, rate);
    if (VARIABLE_COST_IDS.includes(l.id)) pred *= scaleFactor;
    predCosts[l.id] = pred;
    total += pred;
  });
  total += nv(p.costOtherK, 0);
  return { predCosts, total };
};

/* ── CSS ──────────────────────────────────────────────────────────────────── */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400&family=DM+Sans:wght@300;400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');
*{box-sizing:border-box;margin:0;padding:0;}
body{background:#f0ede8;font-family:'DM Sans',sans-serif;color:#1a1a1a;}
.sl{min-height:100vh;display:flex;flex-direction:column;background:#f0ede8;}
.sl-entry{max-width:600px;margin:0 auto;padding:48px 24px;}
.sl-brand{font-family:'Cormorant Garamond',serif;font-weight:300;font-size:13px;letter-spacing:3px;text-transform:uppercase;color:#888;margin-bottom:8px;}
.sl-brand-sub{font-family:'Cormorant Garamond',serif;font-weight:400;font-size:32px;color:#1a1a1a;line-height:1.2;margin-bottom:6px;}
.sl-brand-org{font-family:'DM Sans',sans-serif;font-weight:300;font-size:13px;color:#888;margin-bottom:32px;}
.sl-overview{margin-bottom:32px;}
.sl-overview p{font-family:'Cormorant Garamond',serif;font-weight:300;font-size:17px;line-height:1.7;color:#444;margin-bottom:16px;}
.sl-overview strong{font-family:'DM Sans',sans-serif;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:#1a1a1a;}
.sl-overview .sl-disc{border-top:1px solid #d8d3cb;padding-top:16px;margin-top:4px;font-family:'DM Sans',sans-serif;font-size:12px;font-weight:400;color:#888;line-height:1.7;}
.sl-overview .sl-disc strong{font-size:11px;font-weight:600;color:#1a1a1a;}
.sl-rule{border:none;border-top:1px solid #d8d3cb;margin:24px 0;}
.sl-label{display:block;font-family:'DM Sans',sans-serif;font-size:0.875rem;font-weight:400;color:#1a1a1a;margin-bottom:8px;}
.sl-field{margin-bottom:20px;}
.sl-input{width:100%;padding:12px 14px;border:1px solid #d8d3cb;border-radius:4px;font-family:'DM Sans',sans-serif;font-size:14px;font-weight:400;color:#1a1a1a;background:#f0ede8;outline:none;transition:border-color 0.15s;}
.sl-input:focus{border-color:#1a1a1a;}
textarea.sl-input{resize:vertical;}
.sl-pw-wrap{position:relative;}
.sl-pw-wrap .sl-input{padding-right:40px;}
.sl-pw-eye{position:absolute;right:12px;top:50%;transform:translateY(-50%);cursor:pointer;color:#aaa;background:none;border:none;padding:0;line-height:1;font-size:14px;}
.sl-btn{display:inline-flex;align-items:center;justify-content:center;padding:14px 24px;background:#e07030;color:#fff;border:none;border-radius:4px;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:600;letter-spacing:0.5px;cursor:pointer;transition:background 0.15s;box-shadow:none;}
.sl-btn:hover{background:#c85e22;}
.sl-btn:disabled{opacity:0.35;cursor:default;}
.sl-btn-outline{background:transparent;color:#e07030;border:1px solid #e07030;box-shadow:none;}
.sl-btn-outline:hover{background:#fdf5f0;}
.sl-fac-link{display:block;margin-top:16px;font-family:'DM Sans',sans-serif;font-size:12px;color:#e07030;text-decoration:underline;cursor:pointer;background:none;border:none;padding:0;}
.sl-fac-link:hover{color:#c85e22;}
.sl-err{font-family:'DM Sans',sans-serif;font-size:13px;color:#e07030;margin-bottom:16px;}
/* Main layout */
.sl-shell{display:flex;flex-direction:column;min-height:100vh;background:#f0ede8;}
.sl-header{background:#f0ede8;border-bottom:1px solid #d8d3cb;padding:12px 24px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:100;}
.sl-header-title{font-family:'DM Sans',sans-serif;font-size:12px;font-weight:600;letter-spacing:0.5px;color:#1a1a1a;}
.sl-header-right{font-family:'DM Sans',sans-serif;font-size:11px;color:#888;}
.sl-tabs{background:#f0ede8;border-bottom:1px solid #d8d3cb;padding:0 24px;display:flex;gap:0;overflow-x:auto;}
.sl-tab{padding:14px 18px;font-family:'DM Sans',sans-serif;font-size:11px;font-weight:500;color:#aaa;border-bottom:2px solid transparent;white-space:nowrap;cursor:default;}
.sl-tab.active{color:#e07030;border-bottom-color:#e07030;}
.sl-tab.done{color:#2d7d46;}
.sl-content{max-width:760px;margin:0 auto;padding:40px 24px;width:100%;}
/* Step elements */
.sl-back{background:none;border:none;font-family:'DM Sans',sans-serif;font-size:12px;color:#888;cursor:pointer;padding:0;margin-bottom:24px;display:inline-flex;align-items:center;gap:6px;}
.sl-back:hover{color:#e07030;}
.sl-confirmed-banner{background:#f0faf4;border:1px solid #2d7d46;border-radius:4px;padding:12px 16px;margin-bottom:24px;font-family:'DM Sans',sans-serif;font-size:13px;color:#2d7d46;}
.sl-step-h{font-family:'Cormorant Garamond',serif;font-weight:400;font-size:28px;color:#1a1a1a;margin-bottom:16px;}
.sl-step-lead{font-family:'DM Sans',sans-serif;font-size:13px;color:#666;line-height:1.6;margin-bottom:24px;}
.sl-prompt{border-left:3px solid #e07030;padding:12px 16px;margin-bottom:24px;font-family:'Cormorant Garamond',serif;font-style:italic;font-size:18px;color:#444;line-height:1.6;background:#ebe7e1;}
.sl-note-box{background:#ebe7e1;border:1px solid #d8d3cb;border-radius:4px;padding:12px 14px;font-family:'DM Sans',sans-serif;font-size:12px;color:#666;line-height:1.6;margin-bottom:24px;}
/* Table */
.sl-tbl{width:100%;border-collapse:collapse;margin-bottom:24px;}
.sl-tbl th{font-family:'DM Sans',sans-serif;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:#888;padding:8px 12px;border-bottom:2px solid #d8d3cb;text-align:left;background:#f0ede8;}
.sl-tbl th.right{text-align:right;}
.sl-tbl td{padding:10px 12px;border-bottom:1px solid #e8e4de;vertical-align:top;background:#f0ede8;}
.sl-tbl tr:last-child td{border-bottom:none;}
.sl-tbl .tbl-name{font-family:'DM Sans',sans-serif;font-size:13px;font-weight:500;color:#1a1a1a;margin-bottom:3px;}
.sl-tbl .tbl-note{font-family:'DM Sans',sans-serif;font-size:11px;color:#999;line-height:1.5;}
.sl-num-input{font-family:'IBM Plex Mono',monospace;font-size:14px;font-weight:400;color:#1a1a1a;border:1px solid #d8d3cb;border-radius:4px;padding:6px 8px;width:90px;text-align:right;background:#f0ede8;}
.sl-num-input:focus{outline:none;border-color:#1a1a1a;}
.sl-tbl-total{background:#1a1a1a;color:#fff;font-family:'DM Sans',sans-serif;font-size:12px;font-weight:600;padding:10px 12px;}
.sl-tbl-total .mono{font-family:'IBM Plex Mono',monospace;font-size:14px;}
/* Slider (Step 1) */
.sl-slider-wrap{margin:24px 0;}
.sl-slider-val{font-family:'IBM Plex Mono',monospace;font-size:56px;font-weight:500;color:#e07030;text-align:center;line-height:1;}
.sl-slider-desc{font-family:'DM Sans',sans-serif;font-size:13px;color:#666;text-align:center;margin:8px 0 20px;}
.sl-slider{-webkit-appearance:none;appearance:none;width:100%;height:4px;border-radius:2px;background:#d8d3cb;outline:none;}
.sl-slider::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:20px;height:20px;border-radius:50%;background:#e07030;cursor:pointer;box-shadow:none;}
.sl-slider::-moz-range-thumb{width:20px;height:20px;border-radius:50%;background:#e07030;cursor:pointer;border:none;box-shadow:none;}
.sl-slider-range{display:flex;justify-content:space-between;font-family:'DM Sans',sans-serif;font-size:11px;color:#aaa;margin-top:8px;}
/* Year banner (Steps 5, 6) */
.sl-yr-banner{background:#1a1a1a;border-radius:4px;padding:20px 24px;margin-bottom:24px;}
.sl-yr-h{font-family:'DM Sans',sans-serif;font-size:16px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#e07030;margin-bottom:6px;}
.sl-yr-sub{font-family:'Cormorant Garamond',serif;font-weight:400;font-size:20px;color:#f0ede8;}
/* Predicted table (Steps 5, 6) — three linked columns */
.sl-pred-tbl{width:100%;border-collapse:collapse;margin-bottom:8px;}
.sl-pred-tbl th{font-family:'DM Sans',sans-serif;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;color:#888;padding:8px 8px;border-bottom:2px solid #d8d3cb;text-align:right;background:#f0ede8;}
.sl-pred-tbl th:first-child{text-align:left;}
.sl-pred-tbl td{padding:8px 8px;border-bottom:1px solid #e8e4de;vertical-align:middle;background:#f0ede8;}
.sl-pred-tbl td:first-child{font-family:'DM Sans',sans-serif;font-size:12px;font-weight:500;color:#1a1a1a;}
.sl-pred-input{font-family:'IBM Plex Mono',monospace;font-size:13px;font-weight:400;color:#1a1a1a;border:1px solid #d8d3cb;border-radius:4px;padding:5px 6px;width:80px;text-align:right;background:#f0ede8;}
.sl-pred-input:focus{outline:none;border-color:#1a1a1a;}
.sl-pred-ro{font-family:'IBM Plex Mono',monospace;font-size:13px;font-weight:400;color:#666;text-align:right;}
/* Prognosis (Step 7) */
.sl-prog-cols{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:24px;}
.sl-prog-col h3{font-family:'DM Sans',sans-serif;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:#888;margin-bottom:12px;}
.sl-prog-row{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #e8e4de;font-family:'DM Sans',sans-serif;font-size:12px;color:#666;}
.sl-prog-row .mono{font-family:'IBM Plex Mono',monospace;font-size:12px;color:#1a1a1a;}
.sl-prog-total{display:flex;justify-content:space-between;padding:10px 0;margin-top:4px;border-top:2px solid #1a1a1a;}
.sl-prog-total .mono{font-family:'IBM Plex Mono',monospace;font-size:14px;font-weight:500;color:#1a1a1a;}
.sl-gap-box{border:2px solid #e07030;border-radius:4px;padding:20px 24px;margin-bottom:24px;background:#f0ede8;}
.sl-gap-box h3{font-family:'DM Sans',sans-serif;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:#888;margin-bottom:12px;}
.sl-gap-rows{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:16px;}
.sl-gap-kpi{text-align:center;}
.sl-gap-kpi .val{font-family:'IBM Plex Mono',monospace;font-size:24px;font-weight:500;}
.sl-gap-kpi .lbl{font-family:'DM Sans',sans-serif;font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#888;margin-top:4px;}
.sl-gap-statement{font-family:'DM Sans',sans-serif;font-size:13px;color:#1a1a1a;line-height:1.6;}
/* Step 8 gap strip */
.sl-gap-strip{background:#1a1a1a;color:#fff;padding:12px 20px;border-radius:4px;margin-bottom:24px;display:flex;gap:24px;flex-wrap:wrap;}
.sl-gs-item{text-align:center;}
.sl-gs-item .v{font-family:'IBM Plex Mono',monospace;font-size:18px;font-weight:500;}
.sl-gs-item .l{font-family:'DM Sans',sans-serif;font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#aaa;margin-top:2px;}
.sl-section{margin-bottom:32px;}
.sl-section h3{font-family:'DM Sans',sans-serif;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:#1a1a1a;margin-bottom:16px;padding-bottom:8px;border-bottom:1px solid #d8d3cb;}
/* Step 9 ranking */
.sl-scenario-card{border:1px solid #d8d3cb;border-radius:4px;padding:16px;margin-bottom:16px;background:#f0ede8;}
.sl-rank-row{display:flex;gap:8px;margin-top:8px;}
.sl-rank-btn{padding:6px 12px;border:1px solid #d8d3cb;border-radius:4px;font-family:'DM Sans',sans-serif;font-size:12px;cursor:pointer;background:#f0ede8;color:#1a1a1a;box-shadow:none;}
.sl-rank-btn:hover{border-color:#e07030;color:#e07030;}
.sl-rank-btn.selected{background:#e07030;color:#fff;border-color:#e07030;}
/* Step 10 */
.sl-theme-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:24px;}
.sl-theme-card{border:2px solid #d8d3cb;border-radius:4px;padding:16px;cursor:pointer;transition:border-color 0.15s;background:#f0ede8;}
.sl-theme-card:hover{border-color:#e07030;}
.sl-theme-card.selected{border-color:#e07030;}
.sl-dir-btn{padding:5px 10px;border:1px solid #d8d3cb;border-radius:4px;font-family:'DM Sans',sans-serif;font-size:11px;cursor:pointer;background:#f0ede8;color:#1a1a1a;box-shadow:none;}
.sl-dir-btn.grow{background:#2d7d46;color:#fff;border-color:#2d7d46;}
.sl-dir-btn.hold{background:#b87a20;color:#fff;border-color:#b87a20;}
.sl-dir-btn.exit{background:#b83232;color:#fff;border-color:#b83232;}
/* Submitted view */
.sl-submitted{max-width:760px;margin:0 auto;padding:40px 24px;}
.sl-kpi-row{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:32px;}
.sl-kpi{background:#ebe7e1;border:1px solid #d8d3cb;border-radius:4px;padding:16px;text-align:center;}
.sl-kpi .v{font-family:'IBM Plex Mono',monospace;font-size:28px;font-weight:500;color:#e07030;}
.sl-kpi .l{font-family:'DM Sans',sans-serif;font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#888;margin-top:6px;}
/* Facilitator */
.sl-fac{padding:24px;max-width:900px;margin:0 auto;}
.sl-fac-h{font-family:'Cormorant Garamond',serif;font-size:28px;font-weight:400;margin-bottom:24px;color:#1a1a1a;}
.sl-pax-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;margin-bottom:32px;}
.sl-pax-card{background:#ebe7e1;border:1px solid #d8d3cb;border-radius:4px;padding:14px;}
.sl-pax-name{font-family:'DM Sans',sans-serif;font-size:13px;font-weight:600;color:#1a1a1a;margin-bottom:4px;}
.sl-pax-status{font-family:'DM Sans',sans-serif;font-size:11px;color:#888;}
.sl-pax-ok{color:#2d7d46;font-weight:600;}
.sl-reveal{border:1px solid #d8d3cb;border-radius:4px;margin-bottom:12px;overflow:hidden;}
.sl-reveal-hd{background:#ebe7e1;padding:12px 16px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:600;color:#1a1a1a;}
.sl-reveal-body{padding:16px;background:#f0ede8;display:none;}
.sl-reveal.open .sl-reveal-body{display:block;}
.sl-adv-bar{background:#ebe7e1;border:1px solid #d8d3cb;border-radius:4px;padding:16px;margin-bottom:24px;display:flex;align-items:center;gap:16px;flex-wrap:wrap;}
/* Print */
@media print{
  .sl-header,.sl-tabs,.sl-back,.no-print{display:none!important;}
  body{background:#fff!important;}
  .sl-content{max-width:100%!important;padding:16px!important;}
  .sl-gap-box{border:1px solid #ccc!important;}
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
}
@keyframes spin{to{transform:rotate(360deg);}}
`;

/* ── COMMON COMPONENTS ────────────────────────────────────────────────────── */
function BackBtn({ onClick }) {
  return <button className="sl-back" onClick={onClick}>← Back</button>;
}

function ConfirmedBanner({ stepN }) {
  return <div className="sl-confirmed-banner">✓ Step {stepN} confirmed</div>;
}

function NumInput({ value, onChange, min, max, step = 1, width = 90 }) {
  return (
    <input
      type="number" className="sl-num-input"
      style={{ width }} value={value} step={step}
      min={min} max={max}
      onChange={e => onChange(e.target.value)}
    />
  );
}

/* ── ENTRY SCREEN ─────────────────────────────────────────────────────────── */
function Entry({ onEnter, onFacilitator }) {
  const [pwd, setPwd]   = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [name, setName] = useState("");
  const [session, setSession] = useState("Exec250326");
  const [word, setWord] = useState("");
  const [err, setErr]   = useState("");
  const canEnter = pwd === PART_PWD && name.trim().length > 0 && session.trim().length > 0;

  const go = () => {
    if (pwd !== PART_PWD) { setErr("Incorrect password."); return; }
    if (!name.trim()) { setErr("Please enter your name."); return; }
    if (!session.trim()) { setErr("Please enter the session code."); return; }
    STORE.sessionId = session.trim();
    pSave(name.trim(), { feelingWord: word.trim() });
    onEnter(name.trim());
  };

  return (
    <div className="sl">
      <div className="sl-entry">
        <div className="sl-brand">Strategy Lab</div>
        <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: "#e07030", background: "#fdf5f0", border: "1px solid #e07030", borderRadius: 4, padding: "8px 12px", marginBottom: 16 }}>This is a prototype diagnostic tool, designed for FBaM, Cranfield University. It has not been fully tested. There are likely to be errors and glitches.</div>
        <div className="sl-brand-sub">Financial Viability Scenario Tool</div>
        <div className="sl-brand-org">Cranfield University — Faculty of Business and Management</div>
        <div className="sl-overview">
          <p>This tool uses the PACE² methodology. Before we can agree what to do, we need to agree what we are actually dealing with — the scale of the challenge, the structural forces driving it, and what a viable position actually requires.</p>
          <p><strong>Problem</strong> — What plausible combinations of revenue and cost would result in FBaM achieving financial viability by July 2028? This tool frames that question before anyone proposes answers.</p>
          <p><strong>Analyse</strong> — Taking 31 July 2028 as a fixed reference point, what does FBaM's financial position look like if nothing changes? Given what we know about revenues, costs, and structural shifts already in motion — the levy ending, SLEP withdrawing, headcount reducing — what is the honest trajectory?</p>
          <p><strong>Change</strong> — What is FBaM's purpose and what should it become? Which options are congruent with that purpose, and which are in conflict with it? Each participant builds a scenario that reaches a target they have chosen. The tool does not release them until the numbers balance.</p>
          <p><strong>Evaluate</strong> — The scenarios are ranked on two dimensions: financial credibility and alignment to purpose. Where those rankings diverge, that gap is the conversation.</p>
          <p className="sl-disc"><strong>IMPORTANT — THIS IS NOT A FINANCIAL MODEL.</strong> It is a management tool to support thinking — treat it like a map. A financial model is 1:25,000 scale (OS Explorer — individual buildings visible). This tool is 1:250,000 scale (OS Road Map — cities and main roads only). Figures are estimates. Any scenario that emerges must be tested against accurate financial modelling before decisions are made.</p>
        </div>
        <hr className="sl-rule"/>
        <div className="sl-field">
          <label className="sl-label">Password</label>
          <div className="sl-pw-wrap">
            <input type={showPwd ? "text" : "password"} className="sl-input" value={pwd}
              onChange={e => { setPwd(e.target.value); setErr(""); }}
              onKeyDown={e => e.key === "Enter" && go()}
              placeholder="Session password" />
            {pwd && (
              <button className="sl-pw-eye" onClick={() => setShowPwd(!showPwd)}>
                {showPwd ? "○" : "●"}
              </button>
            )}
          </div>
        </div>
        <div className="sl-field">
          <label className="sl-label">Session code <span style={{ fontWeight: 300, fontSize: 11 }}>(provided by facilitator)</span></label>
          <input type="text" className="sl-input" value={session} onChange={e => setSession(e.target.value)}
            onKeyDown={e => e.key === "Enter" && go()}
            placeholder="e.g. FBaM-Mar26" />
        </div>
        <div className="sl-field">
          <label className="sl-label">Your name or group initials (e.g. AB+CD)</label>
          <input type="text" className="sl-input" value={name} onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && go()}
            placeholder="e.g. David or AB+CD" />
        </div>
        <div className="sl-field">
          <label className="sl-label">One word: how do you feel about FBaM's situation? <span style={{ fontWeight: 300, textTransform: "none", letterSpacing: 0, fontSize: 11 }}>(optional)</span></label>
          <input type="text" className="sl-input" value={word} onChange={e => setWord(e.target.value)} placeholder="One word" />
        </div>
        {err && <div className="sl-err">{err}</div>}
        <button className="sl-btn" disabled={!canEnter} onClick={go}>Enter the workshop</button>
        <div style={{ marginTop: 24, textAlign: "center" }}>
          <button style={{ background: "none", border: "none", fontSize: 11, color: "#ccc", cursor: "pointer", textDecoration: "none" }} onClick={onFacilitator}>facilitator</button>
        </div>
      </div>
    </div>
  );
}

/* ── FACILITATOR LOGIN ────────────────────────────────────────────────────── */
function FacilitatorLogin({ onLogin, onBack }) {
  const [pwd, setPwd] = useState("");
  const [err, setErr] = useState(false);
  const go = () => { if (pwd === FAC_PWD) onLogin(); else setErr(true); };
  return (
    <div className="sl"><div className="sl-entry">
      <div className="sl-brand-sub">Facilitator access</div>
      <hr className="sl-rule" />
      <div className="sl-field">
        <label className="sl-label">Password</label>
        <input type="password" className="sl-input" value={pwd}
          onChange={e => { setPwd(e.target.value); setErr(false); }}
          onKeyDown={e => e.key === "Enter" && go()}
          placeholder="Facilitator password" autoFocus />
        {err && <div className="sl-err">Incorrect password.</div>}
      </div>
      <div style={{ display: "flex", gap: 12 }}>
        <button className="sl-btn" onClick={go}>Enter facilitator view</button>
        <button className="sl-btn sl-btn-outline" onClick={onBack}>Back</button>
      </div>
    </div></div>
  );
}

/* ── STEP 1: SET GOAL ─────────────────────────────────────────────────────── */
function Step1({ pData, confirmed, onConfirm, onBack }) {
  const [val, setVal] = useState(nv(pData.targetPct, 7.5));

  const desc = () => {
    if (val <= -5) return "Significant managed deficit";
    if (val < 0)  return "Managed deficit";
    if (val === 0) return "Break-even";
    if (val <= 2.5) return "Minimal surplus";
    if (val <= 5) return "Modest surplus";
    if (val <= 7.5) return "Sustainable surplus";
    return "Strong surplus";
  };

  const doConfirm = () => {
    pSave(pData.name, { targetPct: val, step1Confirmed: true });
    onConfirm();
  };

  return (
    <div className="sl-content">
      <BackBtn onClick={onBack} />
      {confirmed && <ConfirmedBanner stepN={1} />}
      <div className="sl-step-h">What operating surplus should FBaM achieve by 31 July 2028?</div>
      <div className="sl-prompt">"Before we look at the numbers, agree your target. This is what you think is genuinely achievable by 31 July 2028."</div>
      <div className="sl-slider-wrap">
        <div className="sl-slider-val">{val >= 0 ? "+" : ""}{val.toFixed(1)}%</div>
        <div className="sl-slider-desc">{desc()}</div>
        <input type="range" className="sl-slider" min="-10" max="10" step="0.5" value={val}
          onChange={e => setVal(parseFloat(e.target.value))} />
        <div className="sl-slider-range"><span>−10%</span><span>0%</span><span>+10%</span></div>
      </div>
      <button className="sl-btn" onClick={doConfirm}>Confirm target → Step 2</button>
    </div>
  );
}

/* ── STEP 2: REVENUE ──────────────────────────────────────────────────────── */
function Step2({ pData, confirmed, onConfirm, onBack }) {
  const init = () => { const r = {}; REV_LINES.forEach(l => { r[l.id] = String(nv(pData.revenues?.[l.id], l.prefillK)); }); return r; };
  const [revs, setRevs] = useState(init);
  const total = REV_LINES.reduce((s, l) => s + nv(revs[l.id], l.prefillK), 0);

  const doConfirm = () => {
    const revenues = {}; REV_LINES.forEach(l => revenues[l.id] = nv(revs[l.id], l.prefillK));
    pSave(pData.name, { revenues, step2Confirmed: true });
    onConfirm();
  };

  return (
    <div className="sl-content">
      <BackBtn onClick={onBack} />
      {confirmed && <ConfirmedBanner stepN={2} />}
      <div className="sl-step-h">Current situation: Revenue</div>
      <div className="sl-prompt">"These are the Q2 2025/26 actuals. Change any figure you think is inaccurate — differences in how people read the current position are themselves diagnostic."</div>
      <div className="sl-note-box">All figures are Q2 2025/26 actuals (£k). Edit any line you disagree with.</div>
      <table className="sl-tbl">
        <thead><tr>
          <th>Revenue line</th>
          <th className="right">£k</th>
        </tr></thead>
        <tbody>
          {REV_LINES.map(l => (
            <tr key={l.id}>
              <td><div className="tbl-name">{l.name}</div><div className="tbl-note">{l.note}</div></td>
              <td className="tbl-num"><NumInput value={revs[l.id]} onChange={v => setRevs(p => ({ ...p, [l.id]: v }))} min={0} /></td>
            </tr>
          ))}
        </tbody>
        <tfoot><tr><td colSpan={2} className="sl-tbl-total">
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "#f0ede8" }}>Total revenue</span><span className="mono" style={{ color: "#f0ede8" }}>{fmtK(total)}</span>
          </div>
        </td></tr></tfoot>
      </table>
      <button className="sl-btn" onClick={doConfirm}>Lock Revenue → Step 3</button>
    </div>
  );
}

/* ── STEP 3: COSTS ────────────────────────────────────────────────────────── */
function Step3({ pData, confirmed, onConfirm, onBack }) {
  const init = () => { const c = {}; COST_LINES.forEach(l => { c[l.id] = String(nv(pData.costs?.[l.id], l.baseK)); }); return c; };
  const [costs, setCosts] = useState(init);

  const contribTotal = COST_LINES.filter(l => l.id !== "uni_charge").reduce((s, l) => s + nv(costs[l.id], l.baseK), 0);
  const uniCharge    = nv(costs["uni_charge"], 10325);
  const totalCosts   = contribTotal + uniCharge;
  const revTotal     = REV_LINES.reduce((s, l) => s + nv(pData.revenues?.[l.id], l.prefillK), 0);
  const contribSurplus = revTotal - contribTotal;
  const fullyLoaded    = revTotal - totalCosts;

  const doConfirm = () => {
    const c = {}; COST_LINES.forEach(l => c[l.id] = nv(costs[l.id], l.baseK));
    pSave(pData.name, { costs: c, step3Confirmed: true });
    onConfirm();
  };

  return (
    <div className="sl-content">
      <BackBtn onClick={onBack} />
      {confirmed && <ConfirmedBanner stepN={3} />}
      <div className="sl-step-h">Current situation: Costs</div>
      <div className="sl-prompt">"These are Q2 2025/26 actuals. The university service charge is the final line — the TRAC adjusted service charge is not yet available."</div>
      <div className="sl-note-box">All figures are Q2 2025/26 actuals (£k). Edit any line you disagree with.</div>
      <table className="sl-tbl">
        <thead><tr>
          <th>Cost line</th><th className="right">£k</th>
        </tr></thead>
        <tbody>
          {COST_LINES.map(l => (
            <tr key={l.id} style={l.id === "uni_charge" ? { background: "#faf8f6" } : {}}>
              <td>
                <div className="tbl-name">{l.name}</div>
                <div className="tbl-note">{l.note}</div>
              </td>
              <td className="tbl-num"><NumInput value={costs[l.id]} onChange={v => setCosts(p => ({ ...p, [l.id]: v }))} min={0} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="sl-gap-box">
        <h3>Summary</h3>
        <div className="sl-gap-rows">
          <div className="sl-gap-kpi">
            <div className="val" style={{ fontSize: 20, color: "#e07030" }}>{fmtK(contribTotal)}</div>
            <div className="lbl">Contribution costs</div>
          </div>
          <div className="sl-gap-kpi">
            <div className="val" style={{ fontSize: 20, color: contribSurplus >= 0 ? "#2d7d46" : "#b83232" }}>{fmtK(contribSurplus)}</div>
            <div className="lbl">Contribution surplus ({revTotal > 0 ? ((contribSurplus / revTotal) * 100).toFixed(1) : "0.0"}%)</div>
          </div>
          <div className="sl-gap-kpi">
            <div className="val" style={{ fontSize: 20, color: fullyLoaded >= 0 ? "#2d7d46" : "#b83232" }}>{fmtK(fullyLoaded)}</div>
            <div className="lbl">Net surplus ({revTotal > 0 ? ((fullyLoaded / revTotal) * 100).toFixed(1) : "0.0"}%)</div>
          </div>
        </div>
        <div className="sl-gap-statement">University service charge of {fmtK(uniCharge)} converts the contribution surplus to a net surplus of {fmtK(fullyLoaded)}.</div>
      </div>
      <button className="sl-btn" onClick={doConfirm}>Lock Costs → Step 4</button>
    </div>
  );
}

/* ── STEP 4: CURRENT POSITION ─────────────────────────────────────────────── */
function Step4({ pData, confirmed, onConfirm, onBack }) {
  const revTotal   = REV_LINES.reduce((s, l) => s + nv(pData.revenues?.[l.id], l.prefillK), 0);
  const contribCosts = COST_LINES.filter(l => l.id !== "uni_charge").reduce((s, l) => s + nv(pData.costs?.[l.id], l.baseK), 0);
  const uniCharge  = nv(pData.costs?.["uni_charge"], 10325);
  const contribS   = revTotal - contribCosts;
  const fullyLoaded = revTotal - contribCosts - uniCharge;
  const tgt        = nv(pData.targetPct, 7.5);

  const doConfirm = () => { pSave(pData.name, { step4Confirmed: true }); onConfirm(); };

  return (
    <div className="sl-content">
      <BackBtn onClick={onBack} />
      {confirmed && <ConfirmedBanner stepN={4} />}
      <div className="sl-step-h">Current position</div>
      <div className="sl-prompt">"This is where we start. Agreed numbers, agreed surplus. Before we project forward, make sure you recognise this picture. If anything is inaccurate, use the back button and correct it."</div>
      <div className="sl-prog-cols">
        <div>
          <div className="sl-prog-col"><h3>Revenue</h3>
            {REV_LINES.map(l => (
              <div className="sl-prog-row" key={l.id}>
                <span>{l.name}</span><span className="mono">{fmtK(nv(pData.revenues?.[l.id], l.prefillK))}</span>
              </div>
            ))}
            <div className="sl-prog-total"><span style={{ fontWeight: 600, fontSize: 13 }}>Total revenue</span><span className="mono">{fmtK(revTotal)}</span></div>
          </div>
        </div>
        <div>
          <div className="sl-prog-col"><h3>Costs</h3>
            {COST_LINES.map(l => (
              <div className="sl-prog-row" key={l.id} style={l.id === "uni_charge" ? { borderTop: "1px solid #e0ddd8", marginTop: 4 } : {}}>
                <span>{l.name}</span><span className="mono">{fmtK(nv(pData.costs?.[l.id], l.baseK))}</span>
              </div>
            ))}
            <div className="sl-prog-total"><span style={{ fontWeight: 600, fontSize: 13 }}>Total costs</span><span className="mono">{fmtK(contribCosts + uniCharge)}</span></div>
          </div>
        </div>
      </div>
      <div className="sl-gap-box">
        <h3>Summary</h3>
        <div className="sl-gap-rows">
          <div className="sl-gap-kpi"><div className="val" style={{ color: "#e07030" }}>{fmtK(revTotal)}</div><div className="lbl">Total revenue</div></div>
          <div className="sl-gap-kpi"><div className="val" style={{ color: contribS >= 0 ? "#2d7d46" : "#b83232" }}>{fmtK(contribS)}</div><div className="lbl">Contribution surplus</div></div>
          <div className="sl-gap-kpi"><div className="val" style={{ color: fullyLoaded >= 0 ? "#2d7d46" : "#b83232" }}>{fmtK(fullyLoaded)}</div><div className="lbl">Net surplus</div></div>
        </div>
        <div className="sl-gap-statement">
          Contribution surplus: {fmtK(contribS)} ({revTotal > 0 ? ((contribS / revTotal) * 100).toFixed(1) : "0.0"}%). Service charge of {fmtK(uniCharge)} converts this to a net surplus of {fmtK(fullyLoaded)} ({revTotal > 0 ? ((fullyLoaded / revTotal) * 100).toFixed(1) : "0.0"}%). Your target is {tgt >= 0 ? "+" : ""}{tgt.toFixed(1)}%.
        </div>
      </div>
      <button className="sl-btn" onClick={doConfirm}>Lock Current → Step 5: Market context</button>
    </div>
  );
}

/* ── STEP 5: MARKET CONTEXT ───────────────────────────────────────────────── */
function Step5MarketContext({ pData, confirmed, onConfirm, onBack }) {
  const init = () => {
    const r = {};
    MARKET_BENCHMARKS.forEach(b => { r[b.id] = String(pData.marketRates?.[b.id] ?? b.mid); });
    return r;
  };
  const [rates, setRates] = useState(init);
  const [expanded, setExpanded] = useState({});

  const doConfirm = () => {
    const marketRates = {};
    MARKET_BENCHMARKS.forEach(b => { marketRates[b.id] = nv(rates[b.id], b.mid); });
    pSave(pData.name, { marketRates, step5Confirmed: true });
    onConfirm(marketRates);
  };

  return (
    <div className="sl-content">
      <BackBtn onClick={onBack} />
      {confirmed && <ConfirmedBanner stepN={5} />}
      <div className="sl-step-h">Market context: UK business schools 2024–2028</div>
      <div className="sl-prompt">"Before you predict FBaM's revenues, review what is happening to each income stream across the sector. The mid-point rate is pre-filled — adjust any figure you disagree with. These rates carry forward into Step 6. Click the arrows on the left to reveal the assumptions behind each benchmark."</div>
      <div className="sl-note-box">Sector benchmarks based on HESA, UKRI, UNICON and OfS data. Rates are cumulative % change over the full period (Jul 2025 → Jul 2028), not annual. Edit any rate — your figures carry into the predicted revenues step.</div>

      <table className="sl-tbl">
        <thead><tr>
          <th>Revenue stream</th>
          <th className="right" style={{ width: 120 }}>Sector range</th>
          <th className="right" style={{ width: 80 }}>Direction</th>
          <th className="right" style={{ width: 100 }}>Your rate %</th>
        </tr></thead>
        <tbody>
          {MARKET_BENCHMARKS.map(b => (
            <>
              <tr key={b.id} style={{ cursor: "pointer" }} onClick={() => setExpanded(e => ({ ...e, [b.id]: !e[b.id] }))}>
                <td>
                  <div className="tbl-name" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 10, color: "#aaa" }}>{expanded[b.id] ? "▲" : "▼"}</span>
                    {b.label}
                  </div>
                </td>
                <td style={{ textAlign: "right", fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: "#888" }}>{b.range}</td>
                <td style={{ textAlign: "right" }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: b.dirColor, textTransform: "uppercase", letterSpacing: 0.5 }}>{b.direction}</span>
                </td>
                <td style={{ textAlign: "right" }} onClick={e => e.stopPropagation()}>
                  <input type="number" className="sl-pred-input" step="0.5"
                    value={rates[b.id]}
                    onChange={e => setRates(r => ({ ...r, [b.id]: e.target.value }))}
                    style={{ width: 80 }}
                  />
                </td>
              </tr>
              {expanded[b.id] && (
                <tr key={`${b.id}-ctx`}>
                  <td colSpan={4} style={{ background: "#ebe7e1", padding: "8px 12px" }}>
                    <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: "#666", lineHeight: 1.6 }}>{b.context}</div>
                  </td>
                </tr>
              )}
            </>
          ))}
        </tbody>
      </table>

      <div className="sl-note-box" style={{ marginTop: 8 }}>
        31 July 2028 is chosen as it is FBaM's year end and levy funding should have ended post EPA submissions.
      </div>
      <button className="sl-btn" onClick={doConfirm}>Confirm market context → Step 6: Predicted revenues</button>
    </div>
  );
}

/* ── STEP 5 & 6: PREDICTED (three-linked-column) ──────────────────────────── */
function PredStep({ stepN, lines, defRates, lineRates, setLineRates, baseRevTotal, heading, note, confirmLabel, onConfirm, onBack, confirmed, isCost = false }) {
  const revTotal = REV_LINES.reduce((s, l) => s + nv(lines.find(x => x.id === l.id)?.prefillK ?? l.prefillK, 0), 0);

  const computePred = (base, pctTotal) => base * (1 + nv(pctTotal) / 100);
  const computePctTotal = (base, pred) => base > 0 ? ((pred / base) - 1) * 100 : 0;

  const [state, setState] = useState(() => {
    const s = {};
    lines.forEach(l => {
      const base = nv(l.prefillK ?? l.baseK, 0);
      const defRate = nv(defRates[l.id], 0);
      const annualRate = lineRates[l.id] !== undefined ? nv(lineRates[l.id]) : defRate;
      const pctTotal = (Math.pow(1 + annualRate / 100, PERIODS) - 1) * 100;
      const pred = computePred(base, pctTotal);
      s[l.id] = {
        pctTotal: pctTotal.toFixed(1),
        changeK: (pred - base).toFixed(0),
        predK: pred.toFixed(0),
      };
    });
    return s;
  });

  const updateFromPct = (id, pctTotal) => {
    const base = nv(lines.find(l => l.id === id)?.prefillK ?? lines.find(l => l.id === id)?.baseK, 0);
    const pred = computePred(base, nv(pctTotal));
    setState(s => ({ ...s, [id]: { pctTotal, changeK: (pred - base).toFixed(0), predK: pred.toFixed(0) } }));
  };
  const updateFromChange = (id, changeK) => {
    const base = nv(lines.find(l => l.id === id)?.prefillK ?? lines.find(l => l.id === id)?.baseK, 0);
    const pred = base + nv(changeK);
    const pctTotal = computePctTotal(base, pred);
    setState(s => ({ ...s, [id]: { pctTotal: pctTotal.toFixed(1), changeK, predK: pred.toFixed(0) } }));
  };
  const updateFromPred = (id, predK) => {
    const base = nv(lines.find(l => l.id === id)?.prefillK ?? lines.find(l => l.id === id)?.baseK, 0);
    const pred = nv(predK);
    const pctTotal = computePctTotal(base, pred);
    setState(s => ({ ...s, [id]: { pctTotal: pctTotal.toFixed(1), changeK: (pred - base).toFixed(0), predK } }));
  };

  const totalPred = lines.reduce((s, l) => s + nv(state[l.id]?.predK, 0), 0);
  const totalBase = lines.reduce((s, l) => s + nv(l.prefillK ?? l.baseK, 0), 0);

  const doConfirm = () => {
    const rates = {};
    lines.forEach(l => {
      const pctTotal = nv(state[l.id]?.pctTotal, 0);
      rates[l.id] = annlRate(pctTotal);
    });
    if (!isCost) setLineRates({ ...lineRates, ...rates });
    onConfirm(rates);
  };

  const changeColor = (changeK) => {
    const v = nv(changeK);
    if (isCost) return v > 0 ? "change-neg" : v < 0 ? "change-pos" : "";
    return v > 0 ? "change-pos" : v < 0 ? "change-neg" : "";
  };

  return (
    <div className="sl-content">
      <BackBtn onClick={onBack} />
      {confirmed && <ConfirmedBanner stepN={stepN} />}
      <div className="sl-yr-banner">
        <div className="sl-yr-h">NOW ASSUME IT IS 31 JULY 2028.</div>
        <div className="sl-yr-sub">Assume we do nothing different. Same purpose. Same people. Same processes. Same products.</div>
      </div>
      <div className="sl-step-h">{heading}</div>
      <div className="sl-step-lead">{note}</div>
      <div className="sl-note-box">
        Edit total % change · change in £k · or predicted £k — all three columns are linked. Starting rates are carried from Step 5 (market context). Formula: current × (1 + total%).</div>
      <table className="sl-pred-tbl">
        <thead><tr>
          <th>Line</th>
          <th style={{ textAlign: "right" }}>Current £k</th>
          <th style={{ textAlign: "right" }}>Total %</th>
          <th style={{ textAlign: "right" }}>Change £k</th>
          <th style={{ textAlign: "right" }}>Predicted £k</th>
        </tr></thead>
        <tbody>
          {lines.map(l => {
            const base = nv(l.prefillK ?? l.baseK, 0);
            const s = state[l.id] || {};
            return (
              <tr key={l.id}>
                <td>
                  <div style={{ fontWeight: 500, fontSize: 12, color: "#1a1a1a", marginBottom: 2 }}>{l.name}</div>
                  {l.note && <div style={{ fontSize: 10, color: "#aaa", lineHeight: 1.4 }}>{l.note}</div>}
                  {!isCost && <div style={{ fontSize: 10, color: "#888", marginTop: 2 }}>Driver: {COST_DRIVERS[l.id] || "—"}</div>}
                  {isCost && <div style={{ fontSize: 10, color: "#888", marginTop: 2 }}>Driver: {COST_DRIVERS[l.id]}</div>}
                </td>
                <td className="sl-pred-ro">{fmtK(base)}</td>
                <td><input type="number" className="sl-pred-input" step="0.1" value={s.pctTotal ?? ""} onChange={e => updateFromPct(l.id, e.target.value)} /></td>
                <td><input type="number" className="sl-pred-input" step="10" value={s.changeK ?? ""} onChange={e => updateFromChange(l.id, e.target.value)} style={{ color: nv(s.changeK) === 0 ? "#888" : nv(s.changeK) > 0 ? (isCost ? "#b83232" : "#2d7d46") : (isCost ? "#2d7d46" : "#b83232") }} /></td>
                <td><input type="number" className="sl-pred-input" step="10" value={s.predK ?? ""} onChange={e => updateFromPred(l.id, e.target.value)} /></td>
              </tr>
            );
          })}
        </tbody>
        <tfoot><tr>
          <td colSpan={2} className="sl-tbl-total">
            <span style={{ fontSize: 11, fontWeight: 400, color: "#f0ede8" }}>Total baseline</span>
            <span className="mono" style={{ float: "right", color: "#f0ede8" }}>{fmtK(totalBase)}</span>
          </td>
          <td colSpan={3} className="sl-tbl-total">
            <span style={{ color: "#f0ede8" }}>Total predicted</span>
            <span className="mono" style={{ float: "right", color: isCost ? (totalPred > totalBase ? "#ffaaaa" : "#aaffcc") : (totalPred > totalBase ? "#aaffcc" : "#ffaaaa") }}>{fmtK(totalPred)}</span>
          </td>
        </tr></tfoot>
      </table>
      <div className="sl-gap-box">
        <h3>Summary</h3>
        <div className="sl-gap-rows" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
          <div className="sl-gap-kpi">
            <div className="val" style={{ fontSize: 20, color: "#e07030" }}>{fmtK(totalBase)}</div>
            <div className="lbl">Baseline {isCost ? "costs" : "revenue"}</div>
          </div>
          <div className="sl-gap-kpi">
            <div className="val" style={{ fontSize: 20, color: isCost ? (totalPred > totalBase ? "#b83232" : "#2d7d46") : (totalPred > totalBase ? "#2d7d46" : "#b83232") }}>{fmtK(totalPred)}</div>
            <div className="lbl">Predicted {isCost ? "costs" : "revenue"}</div>
          </div>
          <div className="sl-gap-kpi">
            <div className="val" style={{ fontSize: 20, color: isCost ? (totalPred > totalBase ? "#b83232" : "#2d7d46") : (totalPred > totalBase ? "#2d7d46" : "#b83232") }}>{totalBase > 0 ? ((totalPred - totalBase) / totalBase * 100).toFixed(1) : "0.0"}%</div>
            <div className="lbl">Change vs baseline</div>
          </div>
        </div>
        <div className="sl-gap-statement">
          {isCost
            ? `Predicted costs ${fmtK(totalPred)} — ${totalBase > 0 ? ((totalPred - totalBase) / totalBase * 100).toFixed(1) : "0"}% vs baseline of ${fmtK(totalBase)}.`
            : `Predicted revenue ${fmtK(totalPred)} — ${totalBase > 0 ? ((totalPred - totalBase) / totalBase * 100).toFixed(1) : "0"}% vs baseline of ${fmtK(totalBase)}.`}
        </div>
      </div>
      <button className="sl-btn" onClick={doConfirm}>{confirmLabel}</button>
    </div>
  );
}

/* ── STEP 7: PROGNOSIS ────────────────────────────────────────────────────── */
function Step7({ pData, confirmed, onConfirm, onBack }) {
  const { predRevs, total: totalRev } = calcPredRevs(pData);
  const { predCosts, total: totalCosts } = calcPredCosts(pData);
  const tgt      = nv(pData.targetPct, 7.5);
  const surplus  = totalRev - totalCosts;
  const surplusPct = totalRev > 0 ? (surplus / totalRev) * 100 : 0;
  const reqSurplus = totalRev * tgt / 100;
  const gap      = reqSurplus - surplus;

  const stmtText = () => {
    const surpTxt = surplus < 0 ? `a deficit of ${fmtK(Math.abs(surplus))}` : `a surplus of ${fmtK(surplus)}`;
    if (gap <= 0) return `On current trajectory, by 31 July 2028, this scenario predicts ${surpTxt} — ${surplusPct.toFixed(1)}% of income. No gap — your do-nothing scenario already meets your target of ${tgt >= 0 ? "+" : ""}${tgt.toFixed(1)}%.`;
    return `On current trajectory, by 31 July 2028, this scenario predicts ${surpTxt} — ${surplusPct.toFixed(1)}% of income. Your target is ${tgt >= 0 ? "+" : ""}${tgt.toFixed(1)}%. The gap to close is ${fmtK(gap)}.`;
  };

  const doConfirm = () => { pSave(pData.name, { step7Confirmed: true }); onConfirm(); };

  return (
    <div className="sl-content">
      <BackBtn onClick={onBack} />
      {confirmed && <ConfirmedBanner stepN={7} />}
      <div className="sl-step-h">Prognosis: do-nothing trajectory</div>
      <div className="sl-prompt">"This is where we end up if nothing changes. Predicted revenues minus predicted costs. Compare it to your goal."</div>
      <div className="sl-prog-cols">
        <div><div className="sl-prog-col"><h3>Predicted revenues by July 2028</h3>
          {REV_LINES.map(l => (
            <div className="sl-prog-row" key={l.id}>
              <span>{l.name}</span><span className="mono">{fmtK(nv(predRevs[l.id], 0))}</span>
            </div>
          ))}
          <div className="sl-prog-total"><span style={{ fontWeight: 600, fontSize: 13 }}>Total</span><span className="mono">{fmtK(totalRev)}</span></div>
        </div></div>
        <div><div className="sl-prog-col"><h3>Predicted costs by July 2028</h3>
          {COST_LINES.map(l => (
            <div className="sl-prog-row" key={l.id} style={l.id === "uni_charge" ? { borderTop: "1px solid #e0ddd8", marginTop: 4 } : {}}>
              <span>{l.name}</span><span className="mono">{fmtK(nv(predCosts[l.id], 0))}</span>
            </div>
          ))}
          <div className="sl-prog-total"><span style={{ fontWeight: 600, fontSize: 13 }}>Total</span><span className="mono">{fmtK(totalCosts)}</span></div>
        </div></div>
      </div>
      <div className="sl-gap-box">
        <h3>Position vs goal</h3>
        <div className="sl-gap-rows" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
          <div className="sl-gap-kpi"><div className="val" style={{ fontSize: 20, color: surplus >= 0 ? "#2d7d46" : "#b83232" }}>{fmtK(surplus)}</div><div className="lbl">Predicted surplus</div></div>
          <div className="sl-gap-kpi"><div className="val" style={{ fontSize: 20, color: surplus >= 0 ? "#2d7d46" : "#b83232" }}>{surplusPct.toFixed(1)}%</div><div className="lbl">As % of income</div></div>
          <div className="sl-gap-kpi"><div className="val" style={{ fontSize: 20, color: "#e07030" }}>{tgt >= 0 ? "+" : ""}{tgt.toFixed(1)}%</div><div className="lbl">Your target</div></div>
          <div className="sl-gap-kpi"><div className="val" style={{ fontSize: 20, color: gap > 0 ? "#b83232" : "#2d7d46" }}>{gap > 0 ? fmtK(gap) : "None"}</div><div className="lbl">Gap to close</div></div>
        </div>
        <div className="sl-gap-statement">{stmtText()}</div>
      </div>
      <button className="sl-btn" onClick={doConfirm}>Confirm prognosis → Step 8</button>
    </div>
  );
}

/* ── STEP 8: CLOSE THE GAP ────────────────────────────────────────────────── */
function Step8({ pData, confirmed, onSubmit, onBack }) {
  const { total: baseRev } = calcPredRevs(pData);
  const { total: baseCost } = calcPredCosts(pData);
  const tgt   = nv(pData.targetPct, 7.5);
  const reqS  = baseRev * tgt / 100;
  const baseGap = reqS - (baseRev - baseCost);

  const [revAdj, setRevAdj]   = useState(() => { const r = {}; REV_LINES.forEach(l => r[l.id] = "0"); return r; });
  const [newInc, setNewInc]   = useState([{ label: "", amtK: "0" }]);
  const [costAdj, setCostAdj] = useState(() => { const c = {}; COST_LINES.forEach(l => c[l.id] = "0"); return c; });
  const [stmt, setStmt]       = useState(pData.s8Stmt || "");

  const { predRevs } = calcPredRevs(pData);
  const { predCosts } = calcPredCosts(pData);

  const adjRev  = REV_LINES.reduce((s, l) => s + nv(revAdj[l.id]) / 100 * nv(predRevs[l.id]), 0);
  const adjNewI = newInc.reduce((s, n) => s + nv(n.amtK), 0);
  const adjCost = COST_LINES.reduce((s, l) => s + nv(costAdj[l.id]) / 100 * nv(predCosts[l.id]), 0);

  const totalRevFinal  = baseRev + adjRev + adjNewI;
  const totalCostFinal = baseCost - adjCost;
  const surplusFinal   = totalRevFinal - totalCostFinal;
  const reqSFinal      = totalRevFinal * tgt / 100;
  const gapFinal       = reqSFinal - surplusFinal;
  const gapClosed      = Math.max(0, reqS - Math.max(0, gapFinal));
  const pctClosed      = baseGap > 0 ? Math.min(100, (gapClosed / baseGap) * 100) : 100;
  const canSubmit      = gapFinal <= 500 && stmt.trim().length >= 20;

  const doSubmit = () => {
    pSave(pData.name, {
      s8: { revAdj, newInc, costAdj, stmt, totalRevFinal, totalCostFinal, surplusFinal },
      submitted: true, step17Confirmed: true
    });
    onSubmit();
  };

  return (
    <div className="sl-content">
      <BackBtn onClick={onBack} />
      {confirmed && <ConfirmedBanner stepN={8} />}
      <div className="sl-step-h">Close the gap</div>
      <div className="sl-prompt">"You cannot submit until the numbers balance. Work through sections A, B and C. The gap strip updates in real time."</div>

      <div className="sl-gap-strip">
        <div className="sl-gs-item"><div className="v" style={{ color: gapFinal > 0 ? "#ff8888" : "#66ff99" }}>{fmtK(Math.abs(gapFinal))}</div><div className="l">{gapFinal > 0 ? "Remaining gap" : "Surplus over target"}</div></div>
        <div className="sl-gs-item"><div className="v">{pctClosed.toFixed(0)}%</div><div className="l">Gap closed</div></div>
        <div className="sl-gs-item"><div className="v">{fmtK(totalRevFinal)}</div><div className="l">Revenue</div></div>
        <div className="sl-gs-item"><div className="v">{fmtK(totalCostFinal)}</div><div className="l">Costs</div></div>
        <div className="sl-gs-item"><div className="v" style={{ color: surplusFinal >= 0 ? "#66ff99" : "#ff8888" }}>{fmtK(surplusFinal)}</div><div className="l">Surplus</div></div>
        <div className="sl-gs-item"><div className="v" style={{ color: "#e07030" }}>{tgt >= 0 ? "+" : ""}{tgt.toFixed(1)}%</div><div className="l">Target</div></div>
      </div>

      <div className="sl-section">
        <h3>A — Revenue adjustments</h3>
        <div className="sl-step-lead">Enter % change vs your do-nothing prediction for each revenue line.</div>
        {REV_LINES.map(l => (
          <div key={l.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid #f0ede8" }}>
            <div>
              <div style={{ fontWeight: 500, fontSize: 13 }}>{l.name}</div>
              <div style={{ fontSize: 11, color: "#999" }}>Baseline: {fmtK(nv(predRevs[l.id]))}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <NumInput value={revAdj[l.id]} onChange={v => setRevAdj(p => ({ ...p, [l.id]: v }))} min={-100} max={200} step={1} width={80} />
              <span style={{ fontSize: 12, color: "#888" }}>%</span>
              <span style={{ fontFamily: "IBM Plex Mono", fontSize: 12, width: 80, textAlign: "right", color: nv(revAdj[l.id]) >= 0 ? "#2d7d46" : "#b83232" }}>
                {nv(revAdj[l.id]) >= 0 ? "+" : ""}{fmtK(nv(revAdj[l.id]) / 100 * nv(predRevs[l.id]))}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="sl-section">
        <h3>B — New income sources</h3>
        <div className="sl-step-lead">Add any entirely new income streams not present in the current P&L.</div>
        {newInc.map((ni, i) => (
          <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <input type="text" className="sl-input" style={{ flex: 1 }} placeholder="Source name" value={ni.label}
              onChange={e => setNewInc(arr => arr.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} />
            <NumInput value={ni.amtK} onChange={v => setNewInc(arr => arr.map((x, j) => j === i ? { ...x, amtK: v } : x))} min={0} width={90} />
            <span style={{ fontSize: 11, alignSelf: "center", color: "#888" }}>£k</span>
          </div>
        ))}
        <button className="sl-btn sl-btn-outline" style={{ fontSize: 12, padding: "8px 14px", marginTop: 4 }}
          onClick={() => setNewInc(arr => [...arr, { label: "", amtK: "0" }])}>+ Add source</button>
      </div>

      <div className="sl-section">
        <h3>C — Cost adjustments</h3>
        <div className="sl-step-lead">Enter % reduction vs your do-nothing prediction. Variable costs (Associates, Programme delivery) already auto-scale with revenue.</div>
        {COST_LINES.map(l => (
          <div key={l.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid #f0ede8" }}>
            <div>
              <div style={{ fontWeight: 500, fontSize: 13 }}>{l.name}</div>
              <div style={{ fontSize: 11, color: "#999" }}>Baseline: {fmtK(nv(predCosts[l.id]))}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <NumInput value={costAdj[l.id]} onChange={v => setCostAdj(p => ({ ...p, [l.id]: v }))} min={-50} max={50} step={1} width={80} />
              <span style={{ fontSize: 12, color: "#888" }}>%</span>
              <span style={{ fontFamily: "IBM Plex Mono", fontSize: 12, width: 80, textAlign: "right", color: nv(costAdj[l.id]) > 0 ? "#2d7d46" : nv(costAdj[l.id]) < 0 ? "#b83232" : "#888" }}>
                {nv(costAdj[l.id]) !== 0 ? fmtK(nv(costAdj[l.id]) / 100 * nv(predCosts[l.id])) : "—"}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="sl-section">
        <h3>Your scenario statement</h3>
        <div className="sl-step-lead">Describe your scenario in one sentence (minimum 20 characters).</div>
        <textarea className="sl-input" rows={3} value={stmt} onChange={e => setStmt(e.target.value)}
          placeholder="e.g. Grow exec ed by 40%, reduce FT intake, exit open programmes by 2027..." />
        <div style={{ fontSize: 11, color: "#aaa", marginTop: 4 }}>{stmt.length} characters {stmt.length >= 20 ? "✓" : `(need ${20 - stmt.length} more)`}</div>
      </div>

      {!canSubmit && (
        <div className="sl-note-box" style={{ borderColor: "#e07030", background: "#fff9f5" }}>
          {gapFinal > 500 ? `Gap still open: ${fmtK(gapFinal)} to close before you can submit.` : "Enter a scenario statement (min 20 characters) to submit."}
        </div>
      )}
      <button className="sl-btn" disabled={!canSubmit} onClick={doSubmit}>Submit scenario</button>
    </div>
  );
}

/* ── SUBMITTED VIEW ───────────────────────────────────────────────────────── */
function SubmittedView({ pData, onContinue }) {
  const s8 = pData.s8 || {};
  const surplus = nv(s8.surplusFinal, 0);
  const rev     = nv(s8.totalRevFinal, 0);
  const cost    = nv(s8.totalCostFinal, 0);
  const pct     = rev > 0 ? (surplus / rev * 100).toFixed(1) : "0.0";
  const tgt     = nv(pData.targetPct, 7.5);

  return (
    <div className="sl-submitted">
      <div className="sl-step-h" style={{ marginBottom: 8 }}>Scenario submitted</div>
      <div style={{ fontFamily: "DM Sans,sans-serif", fontSize: 13, color: "#666", marginBottom: 24, fontStyle: "italic" }}>"{s8.stmt}"</div>
      <div className="sl-kpi-row">
        <div className="sl-kpi"><div className="v">{fmtK(rev)}</div><div className="l">Total revenue</div></div>
        <div className="sl-kpi"><div className="v">{fmtK(cost)}</div><div className="l">Total costs</div></div>
        <div className="sl-kpi"><div className="v" style={{ color: surplus >= 0 ? "#2d7d46" : "#b83232" }}>{fmtK(surplus)}</div><div className="l">Surplus</div></div>
        <div className="sl-kpi"><div className="v" style={{ color: parseFloat(pct) >= tgt ? "#2d7d46" : "#b83232" }}>{parseFloat(pct) >= 0 ? "+" : ""}{pct}%</div><div className="l">vs target {tgt >= 0 ? "+" : ""}{tgt.toFixed(1)}%</div></div>
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <button className="sl-btn no-print" onClick={() => window.print()}>Print / save as PDF</button>
        <button className="sl-btn sl-btn-outline no-print" onClick={onContinue}>Continue to Step 9 →</button>
      </div>
    </div>
  );
}

/* ── STEP 9: RANKING ──────────────────────────────────────────────────────── */
function Step9({ pData, onConfirm, onBack, confirmed }) {
  const submitted = pAll().filter(p => p.submitted && p.s8);
  const isReady   = submitted.length >= 2;

  const labels = ["A", "B", "C"].slice(0, submitted.length);
  const [credRank, setCredRank] = useState({});
  const [purposeRank, setPurposeRank] = useState({});

  const setRank = (setter, label, pos) => {
    setter(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(k => { if (next[k] === pos) delete next[k]; });
      if (next[label] === pos) delete next[label]; else next[label] = pos;
      return next;
    });
  };

  const allRanked = labels.every(l => credRank[l] && purposeRank[l]);
  const isYours   = (idx) => submitted[idx]?.name === pData.name;

  const doConfirm = () => { pSave(pData.name, { s9: { credRank, purposeRank }, step18Confirmed: true }); onConfirm(); };

  return (
    <div className="sl-content">
      <BackBtn onClick={onBack} />
      {confirmed && <ConfirmedBanner stepN={9} />}
      <div className="sl-step-h">Rank the scenarios</div>
      <div className="sl-prompt">"Rank each scenario on financial credibility — how likely is it to work — and on purpose alignment — how well does it describe the FBaM you want to lead."</div>
      {!isReady && <div className="sl-note-box">Ranking unlocks when at least 2 scenarios have been submitted. Waiting…</div>}
      {isReady && labels.map((label, i) => {
        const p = submitted[i];
        const s8 = p.s8 || {};
        return (
          <div className="sl-scenario-card" key={label}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div style={{ fontFamily: "IBM Plex Mono", fontSize: 22, fontWeight: 500, color: "#e07030" }}>Scenario {label}</div>
              {isYours(i) && <div style={{ fontSize: 11, color: "#888", alignSelf: "center" }}>(yours)</div>}
            </div>
            <div style={{ fontFamily: "DM Sans", fontSize: 12, color: "#666", margin: "8px 0", fontStyle: "italic" }}>"{s8.stmt}"</div>
            <div style={{ display: "flex", gap: 16, fontSize: 12, fontFamily: "IBM Plex Mono", marginBottom: 12 }}>
              <span>Rev: {fmtK(nv(s8.totalRevFinal))}</span>
              <span>Surplus: {fmtK(nv(s8.surplusFinal))}</span>
              <span>{nv(s8.totalRevFinal) > 0 ? ((nv(s8.surplusFinal) / nv(s8.totalRevFinal)) * 100).toFixed(1) : 0}%</span>
            </div>
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, color: "#888", marginBottom: 4 }}>Financial credibility</div>
              <div className="sl-rank-row">
                {[1, 2, 3].slice(0, submitted.length).map(pos => (
                  <button key={pos} className={`sl-rank-btn${credRank[label] === pos ? " selected" : ""}`} onClick={() => setRank(setCredRank, label, pos)}>
                    {pos === 1 ? "1st" : pos === 2 ? "2nd" : "3rd"}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, color: "#888", marginBottom: 4 }}>Purpose alignment</div>
              <div className="sl-rank-row">
                {[1, 2, 3].slice(0, submitted.length).map(pos => (
                  <button key={pos} className={`sl-rank-btn${purposeRank[label] === pos ? " selected" : ""}`} onClick={() => setRank(setPurposeRank, label, pos)}>
                    {pos === 1 ? "1st" : pos === 2 ? "2nd" : "3rd"}
                  </button>
                ))}
              </div>
            </div>
          </div>
        );
      })}
      {isReady && <button className="sl-btn" disabled={!allRanked} onClick={doConfirm}>Confirm rankings → Step 10</button>}
    </div>
  );
}

/* ── STEP 10: YOUR THEME ──────────────────────────────────────────────────── */
function Step10({ pData, onConfirm, onBack, confirmed }) {
  const [theme, setTheme] = useState(nv(pData.s10?.theme, -1));
  const [dirs, setDirs]   = useState(pData.s10?.dirs || {});
  const [mix, setMix]     = useState(() => { const m = {}; REV_LINES.forEach(l => m[l.id] = ""); return m; });
  const [q1, setQ1]       = useState(pData.s10?.q1 || "");
  const [q2, setQ2]       = useState(pData.s10?.q2 || "");

  const totalMix = REV_LINES.reduce((s, l) => s + nv(mix[l.id]), 0);

  const doConfirm = () => {
    pSave(pData.name, { s10: { theme, dirs, mix, q1, q2 }, step10Confirmed: true });
    onConfirm();
  };

  const DIR_COLORS = { Grow: "#2d7d46", Hold: "#b87a20", Exit: "#b83232" };

  return (
    <div className="sl-content">
      <BackBtn onClick={onBack} />
      {confirmed && <ConfirmedBanner stepN={10} />}
      <div className="sl-step-h">Your theme</div>
      <div className="sl-prompt">"Before you allocate revenue, declare your direction for each line. Then build your mix. This is your strategic intent — not a financial model."</div>

      <div className="sl-section">
        <h3>Select your theme</h3>
        <div className="sl-theme-grid">
          {THEMES.map((t, i) => (
            <div key={i} className={`sl-theme-card${theme === i ? " selected" : ""}`} onClick={() => setTheme(i)}>
              <div style={{ fontFamily: "DM Sans", fontSize: 13, fontWeight: 600, color: "#1a1a1a" }}>{t}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="sl-section">
        <h3>Direction by revenue line</h3>
        <div className="sl-step-lead">Grow — expand this line. Hold — maintain current trajectory. Exit — phase out.</div>
        {REV_LINES.map(l => (
          <div key={l.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid #f0ede8" }}>
            <div style={{ fontWeight: 500, fontSize: 13 }}>{l.name}</div>
            <div style={{ display: "flex", gap: 6 }}>
              {["Grow", "Hold", "Exit"].map(d => (
                <button key={d} className={`sl-dir-btn${dirs[l.id] === d ? " " + d.toLowerCase() : ""}`}
                  onClick={() => setDirs(p => ({ ...p, [l.id]: p[l.id] === d ? undefined : d }))}>
                  {d}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="sl-section">
        <h3>Revenue mix by July 2028 (%)</h3>
        <div className="sl-step-lead">Allocate 100% across lines. Total: <strong style={{ color: Math.abs(totalMix - 100) < 1 ? "#2d7d46" : "#b83232" }}>{totalMix.toFixed(0)}%</strong></div>
        {REV_LINES.map(l => (
          <div key={l.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ fontSize: 13 }}>{l.name}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {dirs[l.id] && <span style={{ fontSize: 10, fontWeight: 600, color: DIR_COLORS[dirs[l.id]], textTransform: "uppercase", letterSpacing: 1 }}>{dirs[l.id]}</span>}
              <NumInput value={mix[l.id]} onChange={v => setMix(p => ({ ...p, [l.id]: v }))} min={0} max={100} step={0.5} width={70} />
              <span style={{ fontSize: 12, color: "#888" }}>%</span>
            </div>
          </div>
        ))}
      </div>

      <div className="sl-section">
        <h3>Qualitative questions</h3>
        <div className="sl-field">
          <label className="sl-label">What is FBaM for? (complete in one sentence)</label>
          <textarea className="sl-input" rows={2} value={q1} onChange={e => setQ1(e.target.value)} placeholder="FBaM exists to…" />
        </div>
        <div className="sl-field">
          <label className="sl-label">What would need to be true about the School for this theme to work?</label>
          <textarea className="sl-input" rows={2} value={q2} onChange={e => setQ2(e.target.value)} placeholder="For this to work, we would need to…" />
        </div>
      </div>

      <button className="sl-btn" disabled={theme === -1} onClick={doConfirm}>Confirm theme</button>
    </div>
  );
}

/* ── STEP 17: CLOSE THE GAP — AI CONSULTANT DASHBOARD ───────────────────── */

const STAFF_DATA = {
  current: { btg: 32, cf: 3, psl: 13, scpss: 36, total: 84 },
  postLeavers: { btg: 27, cf: 3, psl: 10, scpss: 25, total: 65 },
};

function Step17CloseGap({ pData, confirmed, onConfirm, onBack }) {
  const { total: predRev, predRevs } = calcPredRevs(pData);
  const { total: predCost, predCosts } = calcPredCosts(pData);
  const tgt = nv(pData.targetPct, 7.5);
  const baseGap = (predRev * tgt / 100) - (predRev - predCost);

  const [aiAdvice, setAiAdvice] = useState(pData.s17Advice || null);
  const [loading, setLoading]   = useState(false);

  const initRevs  = () => { const r = {}; REV_LINES.forEach(l => r[l.id] = String(Math.round(nv(predRevs[l.id])))); return r; };
  const initCosts = () => { const c = {}; COST_LINES.forEach(l => c[l.id] = String(Math.round(nv(predCosts[l.id])))); return c; };

  const [revs,  setRevs]  = useState(pData.s17Revs  || initRevs());
  const [costs, setCosts] = useState(pData.s17Costs || initCosts());
  const [stmt,  setStmt]  = useState(pData.s17Stmt  || "");

  const totalRev   = REV_LINES.reduce((s, l) => s + nv(revs[l.id]), 0);
  const totalCost  = COST_LINES.reduce((s, l) => s + nv(costs[l.id]), 0);
  const surplus    = totalRev - totalCost;
  const surplusPct = totalRev > 0 ? (surplus / totalRev * 100) : 0;
  const gap        = (totalRev * tgt / 100) - surplus;

  const getContext = () => {
    const pos     = pData.purposeTensions ? getPositionSummary(pData.purposeTensions) : "not specified";
    const purpose = (pData.purposeRanked || [])[0] || pData.purposeOwn || "not specified";
    const unique  = (pData.purposeUniqueRanked || [])[0] || pData.purposeUniqueOwn || "not specified";
    const why     = pData.purposeWhy || "";
    const revCtx  = REV_LINES.map(l => `${l.name}: baseline £${nv(predRevs[l.id]).toFixed(0)}k`).join(", ");
    const costCtx = COST_LINES.map(l => `${l.name}: baseline £${nv(predCosts[l.id]).toFixed(0)}k`).join(", ");
    return { pos, purpose, unique, why, revCtx, costCtx };
  };

  const generate = async () => {
    setLoading(true);
    const ctx = getContext();
    const txt = await callAI(`You are a top-tier strategy consultant and finance expert advising Cranfield University's Faculty of Business and Management (FBaM).

The participant has made the following strategic choices:
- Strategic positioning: ${ctx.pos}
- Purpose: "${ctx.purpose}"
- Key differentiator: "${ctx.unique}"
- WHY statement: "${ctx.why}"

Do-nothing financial trajectory by July 2028:
- Revenue lines: ${ctx.revCtx}
- Total predicted revenue: £${Math.round(predRev)}k
- Cost lines: ${ctx.costCtx}
- Total predicted costs: £${Math.round(predCost)}k
- Do-nothing surplus: £${Math.round(predRev - predCost)}k (${predRev > 0 ? ((predRev - predCost)/predRev*100).toFixed(1) : 0}%)
- Target surplus: ${tgt}%
- Required surplus in £k: £${Math.round(predRev * tgt / 100)}k
- Gap to close: £${Math.round(baseGap)}k

CRITICAL CONSTRAINTS:
- pt_levy MUST be 0. The Level 7 apprenticeship levy is defunded. This income does not exist by 2028. Do not put any value here.
- The sum of all revenue lines MINUS the sum of all cost lines MUST equal at least ${Math.round(predRev * tgt / 100)}k (the required surplus). Check your arithmetic before responding.
- All figures must be positive integers in £k.

Staff context: 65 FTE post-leavers (BTG 27, PSL 10, SCPSS 25). Use this to sanity-check staffing costs.

Respond in this EXACT JSON format only — no text outside the JSON:
{
  "keyMoves": [
    "bullet 1 — specific move with rationale (e.g. Grow exec ed to £Xm — coherent with your exec-ed positioning)",
    "bullet 2",
    "bullet 3",
    "bullet 4",
    "bullet 5"
  ],
  "revs": {
    "ft_msc": <integer £k>,
    "pt_levy": 0,
    "exec_ed": <integer £k>,
    "open": <integer £k>,
    "research_dd": <integer £k>,
    "hefce": <integer £k>,
    "residences": <integer £k>,
    "other_rev": <integer £k>
  },
  "costs": {
    "academic_staff": <integer £k>,
    "support_staff": <integer £k>,
    "associates": <integer £k>,
    "prog_costs": <integer £k>,
    "ops_overhead": <integer £k>,
    "uni_charge": <integer £k>
  }
}`);

    try {
      const clean = txt.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      const newRevs = {}; REV_LINES.forEach(l => newRevs[l.id] = String(Math.round(nv(parsed.revs?.[l.id], nv(predRevs[l.id])))));
      const newCosts = {}; COST_LINES.forEach(l => newCosts[l.id] = String(Math.round(nv(parsed.costs?.[l.id], nv(predCosts[l.id])))));
      // Force pt_levy to 0
      newRevs["pt_levy"] = "0";
      // Verify gap closes — if not, adjust exec_ed upward until it does
      const aiTotalRev  = REV_LINES.reduce((s, l) => s + nv(newRevs[l.id]), 0);
      const aiTotalCost = COST_LINES.reduce((s, l) => s + nv(newCosts[l.id]), 0);
      const aiSurplus   = aiTotalRev - aiTotalCost;
      const reqSurplus  = aiTotalRev * tgt / 100;
      if (aiSurplus < reqSurplus) {
        const shortfall = Math.ceil(reqSurplus - aiSurplus) + 100;
        newRevs["exec_ed"] = String(nv(newRevs["exec_ed"]) + shortfall);
      }
      setRevs(newRevs);
      setCosts(newCosts);
      setAiAdvice(parsed);
    } catch (e) {
      setAiAdvice({ keyMoves: ["Could not parse recommendation — adjust the figures below manually."], revs: {}, costs: {} });
    }
    setLoading(false);
  };

  const applyToStore = () => {
    pSave(pData.name, { s17Revs: revs, s17Costs: costs, s17Stmt: stmt, s17Advice: aiAdvice, step17Confirmed: true });
    onConfirm();
  };

  const KpiTile = ({ label, value, sub, color }) => (
    <div style={{ background: "#ebe7e1", border: "1px solid #d8d3cb", borderRadius: 4, padding: "14px 16px", textAlign: "center" }}>
      <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 22, fontWeight: 500, color: color || "#1a1a1a" }}>{value}</div>
      {sub && <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 13, color: "#888", marginTop: 2 }}>{sub}</div>}
      <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: "#888", marginTop: 4 }}>{label}</div>
    </div>
  );

  return (
    <div className="sl-content">
      <BackBtn onClick={onBack} />
      {confirmed && <ConfirmedBanner stepN={17} />}
      <div className="sl-step-h">Close the gap</div>
      <div className="sl-prompt">"Based on your strategic choices, what does the revenue and cost structure need to look like to be both coherent and financially viable by July 2028?"</div>

      {/* Live dashboard */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 24 }}>
        <KpiTile label="Total revenue" value={fmtK(totalRev)} color="#1a1a1a" />
        <KpiTile label="Total costs" value={fmtK(totalCost)} color="#1a1a1a" />
        <KpiTile label="Surplus" value={fmtK(surplus)} sub={surplusPct.toFixed(1) + "%"} color={surplus >= 0 ? "#2d7d46" : "#b83232"} />
        <KpiTile label={gap > 0 ? "Gap to close" : "Over target"} value={fmtK(Math.abs(gap))} color={gap > 0 ? "#b83232" : "#2d7d46"} />
      </div>

      {/* AI recommendation */}
      {!aiAdvice && !loading && (
        <button className="sl-btn" style={{ marginBottom: 24 }} onClick={generate}>
          Generate strategic recommendation
        </button>
      )}
      {loading && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0 20px", fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: "#888" }}>
          <div style={{ width: 16, height: 16, border: "2px solid #d8d3cb", borderTopColor: "#e07030", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
          Analysing your strategic choices…
        </div>
      )}
      {aiAdvice && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: "#888", marginBottom: 8 }}>Here is a suggestion based on your inputs. Adjust the figures to build your scenario.</div>
          {aiAdvice.keyMoves?.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              {aiAdvice.keyMoves.map((m, i) => (
                <div key={i} style={{ display: "flex", gap: 10, marginBottom: 6, alignItems: "flex-start" }}>
                  <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: "#e07030", flexShrink: 0, minWidth: 16 }}>{i + 1}.</span>
                  <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: "#1a1a1a", lineHeight: 1.5 }}>{m}</span>
                </div>
              ))}
            </div>
          )}
          <button className="sl-btn sl-btn-outline" style={{ fontSize: 12, padding: "6px 12px" }} onClick={generate}>Regenerate</button>
        </div>
      )}

      {/* Own bullets */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, color: "#888", marginBottom: 8 }}>Your own moves (optional)</div>
        <textarea className="sl-input" rows={4} value={stmt}
          onChange={e => setStmt(e.target.value)}
          placeholder={"- Grow exec ed to £12m by bringing in two new defence clients\n- Reduce associate spend by 15%\n- Exit open programmes by 2027"} />
        <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: "#aaa", marginTop: 4 }}>Add your own bullet points. These will appear in your final output.</div>
      </div>

      {/* Editable revenue/cost dashboard */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 24 }}>
        <div>
          <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, color: "#888", marginBottom: 10 }}>Revenue by July 2028 (£k)</div>
          {REV_LINES.map(l => {
            const base = nv(predRevs[l.id]);
            const cur  = nv(revs[l.id]);
            const diff = cur - base;
            const pct  = totalRev > 0 ? (cur / totalRev * 100) : 0;
            return (
              <div key={l.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, paddingBottom: 8, borderBottom: "1px solid #e8e4de" }}>
                <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: "#1a1a1a", flex: 1 }}>{l.name}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: "#888", minWidth: 32, textAlign: "right" }}>{pct.toFixed(0)}%</span>
                  {diff !== 0 && <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: diff > 0 ? "#2d7d46" : "#b83232" }}>{diff > 0 ? "+" : ""}{Math.round(diff)}</span>}
                  <input type="number" className="sl-pred-input" value={revs[l.id]} onChange={e => setRevs(r => ({ ...r, [l.id]: e.target.value }))} style={{ width: 75 }} />
                </div>
              </div>
            );
          })}
          <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderTop: "2px solid #1a1a1a", fontFamily: "'IBM Plex Mono',monospace", fontWeight: 500 }}>
            <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600 }}>Total</span>
            <span style={{ color: "#e07030" }}>{fmtK(totalRev)}</span>
          </div>
        </div>
        <div>
          <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, color: "#888", marginBottom: 10 }}>Costs by July 2028 (£k)</div>
          {COST_LINES.map(l => {
            const base = nv(predCosts[l.id]);
            const cur  = nv(costs[l.id]);
            const diff = cur - base;
            const pct  = totalRev > 0 ? (cur / totalRev * 100) : 0;
            return (
              <div key={l.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, paddingBottom: 8, borderBottom: "1px solid #e8e4de" }}>
                <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: "#1a1a1a", flex: 1 }}>{l.name}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: "#888", minWidth: 32, textAlign: "right" }}>{pct.toFixed(0)}%</span>
                  {diff !== 0 && <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: diff > 0 ? "#b83232" : "#2d7d46" }}>{diff > 0 ? "+" : ""}{Math.round(diff)}</span>}
                  <input type="number" className="sl-pred-input" value={costs[l.id]} onChange={e => setCosts(c => ({ ...c, [l.id]: e.target.value }))} style={{ width: 75 }} />
                </div>
              </div>
            );
          })}
          <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderTop: "2px solid #1a1a1a", fontFamily: "'IBM Plex Mono',monospace", fontWeight: 500 }}>
            <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600 }}>Total</span>
            <span style={{ color: totalCost > predCost ? "#b83232" : "#2d7d46" }}>{fmtK(totalCost)}</span>
          </div>
        </div>
      </div>

      {gap > 500 && <div className="sl-note-box" style={{ borderColor: "#e07030" }}>Gap still open: {fmtK(gap)}. Adjust figures above until the surplus meets your target.</div>}

      <button className="sl-btn" onClick={applyToStore} style={{ marginTop: 8 }}>
        Confirm scenario → Step 18: Theme P&L
      </button>
    </div>
  );
}

/* ── STEP 18: THEME P&L DASHBOARD ────────────────────────────────────────── */

const THEME_DATA = [
  { id: "btg",   name: "Business Transformation & Growth",          fteCurrent: 32, fteFinal: 27 },
  { id: "psl",   name: "People, Skills & Leadership",               fteCurrent: 13, fteFinal: 10 },
  { id: "scpss", name: "Supply Chain, Projects & Sustainable Sys.", fteCurrent: 36, fteFinal: 25 },
];

function Step18ThemePL({ pData, confirmed, onConfirm, onBack }) {
  // Use Step17 final figures if available, otherwise predicted
  const s17Revs   = pData.s17Revs;
  const s17Costs  = pData.s17Costs;
  const { predRevs, total: totalRevBase } = calcPredRevs(pData);
  const { predCosts, total: totalCostBase } = calcPredCosts(pData);

  const totalRevF  = s17Revs  ? REV_LINES.reduce((s, l) => s + nv(s17Revs[l.id]), 0)  : totalRevBase;
  const totalCostF = s17Costs ? COST_LINES.reduce((s, l) => s + nv(s17Costs[l.id]), 0) : totalCostBase;
  const totalFTE   = 65; // post-leavers

  // Allocate revenue and costs by FTE share initially, then let user edit
  const initAlloc = (total) => {
    const alloc = {};
    THEME_DATA.forEach(t => { alloc[t.id] = Math.round(total * t.fteFinal / totalFTE); });
    // Adjust last to match total exactly
    const sum = Object.values(alloc).reduce((a, b) => a + b, 0);
    alloc[THEME_DATA[THEME_DATA.length - 1].id] += (Math.round(total) - sum);
    return alloc;
  };

  // Per-line revenue allocation
  const initRevAlloc = () => {
    const alloc = {};
    REV_LINES.forEach(l => {
      const lineTotal = s17Revs ? nv(s17Revs[l.id]) : nv(predRevs[l.id]);
      alloc[l.id] = initAlloc(lineTotal);
    });
    return alloc;
  };

  const [revAlloc,  setRevAlloc]  = useState(pData.s18RevAlloc  || initRevAlloc());
  const [costAlloc, setCostAlloc] = useState(pData.s18CostAlloc || (() => {
    const alloc = {};
    COST_LINES.forEach(l => {
      const lineTotal = s17Costs ? nv(s17Costs[l.id]) : nv(predCosts[l.id]);
      alloc[l.id] = initAlloc(lineTotal);
    });
    return alloc;
  })());

  const themeRev  = (tid) => REV_LINES.reduce((s, l)  => s + nv(revAlloc[l.id]?.[tid]),  0);
  const themeCost = (tid) => COST_LINES.reduce((s, l) => s + nv(costAlloc[l.id]?.[tid]), 0);

  const revLineTotal  = (lid) => THEME_DATA.reduce((s, t) => s + nv(revAlloc[lid]?.[t.id]),  0);
  const costLineTotal = (lid) => THEME_DATA.reduce((s, t) => s + nv(costAlloc[lid]?.[t.id]), 0);

  const updateRevAlloc  = (lid, tid, val) => setRevAlloc(a  => ({ ...a, [lid]:  { ...a[lid],  [tid]: nv(val) } }));
  const updateCostAlloc = (lid, tid, val) => setCostAlloc(a => ({ ...a, [lid]: { ...a[lid], [tid]: nv(val) } }));

  const doConfirm = () => {
    pSave(pData.name, { s18RevAlloc: revAlloc, s18CostAlloc: costAlloc, step18Confirmed: true });
    onConfirm();
  };

  const col = { fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, textAlign: "right", padding: "6px 8px" };
  const hdr = { fontFamily: "'DM Sans',sans-serif", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, color: "#888", padding: "8px 8px", textAlign: "right", borderBottom: "2px solid #d8d3cb", background: "#f0ede8" };

  return (
    <div className="sl-content">
      <BackBtn onClick={onBack} />
      {confirmed && <ConfirmedBanner stepN={18} />}
      <div className="sl-step-h">Theme P&L dashboard</div>
      <div className="sl-prompt">"Adjust the figures for your scenario. How does the revenue and cost picture break down across the three themes?"</div>
      <div className="sl-note-box">
        Figures in £k. Seeded by FTE share (post-leavers: BTG 27, PSL 10, SCPSS 25). Edit any cell — row totals must match your Step 17 scenario. Totals update live.
        <div style={{ marginTop: 8, display: "flex", gap: 20 }}>
          {THEME_DATA.map(t => (
            <span key={t.id} style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11 }}>
              <strong>{t.name.split(" ")[0]}:</strong> {t.fteFinal} FTE post-leavers ({((t.fteFinal / totalFTE) * 100).toFixed(0)}%)
            </span>
          ))}
        </div>
      </div>

      {/* Revenue allocation table */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, color: "#1a1a1a", marginBottom: 8 }}>Revenue</div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>
            <th style={{ ...hdr, textAlign: "left" }}>Line</th>
            {THEME_DATA.map(t => <th key={t.id} style={hdr}>{t.name.split(" ").slice(0, 2).join(" ")}</th>)}
            <th style={{ ...hdr, color: "#e07030" }}>Total</th>
            <th style={{ ...hdr, color: s17Revs ? "#e07030" : "#888" }}>Target</th>
            <th style={{ ...hdr, color: "#888" }}>%</th>
          </tr></thead>
          <tbody>
            {REV_LINES.map(l => {
              const lineTarget = s17Revs ? nv(s17Revs[l.id]) : nv(predRevs[l.id]);
              const lineTotal  = revLineTotal(l.id);
              const diff = lineTotal - Math.round(lineTarget);
              return (
                <tr key={l.id}>
                  <td style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, padding: "6px 8px", borderBottom: "1px solid #e8e4de" }}>{l.name}</td>
                  {THEME_DATA.map(t => (
                    <td key={t.id} style={{ padding: "4px 4px", borderBottom: "1px solid #e8e4de" }}>
                      <input type="number" className="sl-pred-input" style={{ width: 72 }}
                        value={revAlloc[l.id]?.[t.id] ?? ""}
                        onChange={e => updateRevAlloc(l.id, t.id, e.target.value)} />
                    </td>
                  ))}
                  <td style={{ ...col, fontWeight: 600, color: Math.abs(diff) > 50 ? "#b83232" : "#1a1a1a", borderBottom: "1px solid #e8e4de" }}>{fmtK(lineTotal)}</td>
                  <td style={{ ...col, color: "#888", borderBottom: "1px solid #e8e4de" }}>{fmtK(lineTarget)}</td>
                  <td style={{ ...col, color: "#888", borderBottom: "1px solid #e8e4de" }}>{totalRevF > 0 ? (lineTotal / totalRevF * 100).toFixed(0) + "%" : "—"}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot><tr>
            <td style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600, padding: "8px 8px", borderTop: "2px solid #1a1a1a" }}>Total</td>
            {THEME_DATA.map(t => <td key={t.id} style={{ ...col, fontWeight: 600, color: "#e07030", borderTop: "2px solid #1a1a1a" }}>{fmtK(themeRev(t.id))}</td>)}
            <td style={{ ...col, fontWeight: 600, color: "#e07030", borderTop: "2px solid #1a1a1a" }}>{fmtK(THEME_DATA.reduce((s, t) => s + themeRev(t.id), 0))}</td>
            <td style={{ ...col, color: "#888", borderTop: "2px solid #1a1a1a" }}>{fmtK(totalRevF)}</td>
            <td style={{ ...col, color: "#888", borderTop: "2px solid #1a1a1a" }}>100%</td>
          </tr></tfoot>
        </table>
      </div>

      {/* Cost allocation table */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, color: "#1a1a1a", marginBottom: 8 }}>Costs</div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>
            <th style={{ ...hdr, textAlign: "left" }}>Line</th>
            {THEME_DATA.map(t => <th key={t.id} style={hdr}>{t.name.split(" ").slice(0, 2).join(" ")}</th>)}
            <th style={{ ...hdr, color: "#e07030" }}>Total</th>
            <th style={{ ...hdr, color: s17Costs ? "#e07030" : "#888" }}>Target</th>
            <th style={{ ...hdr, color: "#888" }}>%</th>
          </tr></thead>
          <tbody>
            {COST_LINES.map(l => {
              const lineTarget = s17Costs ? nv(s17Costs[l.id]) : nv(predCosts[l.id]);
              const lineTotal  = costLineTotal(l.id);
              const diff = lineTotal - Math.round(lineTarget);
              return (
                <tr key={l.id}>
                  <td style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, padding: "6px 8px", borderBottom: "1px solid #e8e4de" }}>{l.name}</td>
                  {THEME_DATA.map(t => (
                    <td key={t.id} style={{ padding: "4px 4px", borderBottom: "1px solid #e8e4de" }}>
                      <input type="number" className="sl-pred-input" style={{ width: 72 }}
                        value={costAlloc[l.id]?.[t.id] ?? ""}
                        onChange={e => updateCostAlloc(l.id, t.id, e.target.value)} />
                    </td>
                  ))}
                  <td style={{ ...col, fontWeight: 600, color: Math.abs(diff) > 50 ? "#b83232" : "#1a1a1a", borderBottom: "1px solid #e8e4de" }}>{fmtK(lineTotal)}</td>
                  <td style={{ ...col, color: "#888", borderBottom: "1px solid #e8e4de" }}>{fmtK(lineTarget)}</td>
                  <td style={{ ...col, color: "#888", borderBottom: "1px solid #e8e4de" }}>{totalCostF > 0 ? (lineTotal / totalCostF * 100).toFixed(0) + "%" : "—"}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot><tr>
            <td style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600, padding: "8px 8px", borderTop: "2px solid #1a1a1a" }}>Total</td>
            {THEME_DATA.map(t => <td key={t.id} style={{ ...col, fontWeight: 600, color: "#e07030", borderTop: "2px solid #1a1a1a" }}>{fmtK(themeCost(t.id))}</td>)}
            <td style={{ ...col, fontWeight: 600, color: "#e07030", borderTop: "2px solid #1a1a1a" }}>{fmtK(THEME_DATA.reduce((s, t) => s + themeCost(t.id), 0))}</td>
            <td style={{ ...col, color: "#888", borderTop: "2px solid #1a1a1a" }}>{fmtK(totalCostF)}</td>
            <td style={{ ...col, color: "#888", borderTop: "2px solid #1a1a1a" }}>100%</td>
          </tr></tfoot>
        </table>
      </div>

      {/* Theme surplus summary */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 24 }}>
        {THEME_DATA.map(t => {
          const rev  = themeRev(t.id);
          const cost = themeCost(t.id);
          const sur  = rev - cost;
          const surPct = rev > 0 ? ((sur / rev) * 100) : 0;
          const revPct = THEME_DATA.reduce((s, x) => s + themeRev(x.id), 0) > 0
            ? (rev / THEME_DATA.reduce((s, x) => s + themeRev(x.id), 0) * 100) : 0;
          return (
            <div key={t.id} style={{ background: "#ebe7e1", border: "1px solid #d8d3cb", borderRadius: 4, padding: 14 }}>
              <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, fontWeight: 600, color: "#1a1a1a", marginBottom: 8 }}>{t.name}</div>
              <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 20, color: sur >= 0 ? "#2d7d46" : "#b83232", marginBottom: 2 }}>{fmtK(sur)}</div>
              <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 13, color: sur >= 0 ? "#2d7d46" : "#b83232", marginBottom: 4 }}>{surPct.toFixed(1)}% surplus margin</div>
              <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 10, color: "#888" }}>
                Rev {fmtK(rev)} ({revPct.toFixed(0)}% of school) · {t.fteFinal} FTE
              </div>
            </div>
          );
        })}
      </div>

      <button className="sl-btn" onClick={doConfirm}>Confirm theme P&L</button>
    </div>
  );
}

/* ── STEP 19: FINALISE & PRINT ────────────────────────────────────────────── */


/* ── PARTICIPANT VIEW ─────────────────────────────────────────────────────── */
function ParticipantView({ name, tick, onLogout }) {
  const [displayStep, setDisplayStep] = useState(1);
  const [revRates, setRevRates] = useState({});
  const [submitted, setSubmitted] = useState(false);

  const pData = () => pGet(name);
  const pd    = pData();

  const advance = () => { if (displayStep < 20) setDisplayStep(s => s + 1); };
  const go      = (n) => setDisplayStep(n);

  const tabs = STEP_NAMES.map((sn, i) => {
    const n = i + 1;
    const done = pd[`step${n}Confirmed`];
    return <div key={n} className={`sl-tab${displayStep === n ? " active" : done ? " done" : ""}`}>{done ? "✓ " : ""}{sn}</div>;
  });

  if (pd.submitted && displayStep === 17 && !submitted) setSubmitted(true);

  return (
    <div className="sl-shell">
      <div className="sl-header">
        <div className="sl-header-title">Financial Viability Scenario Tool</div>
        <div className="sl-header-right">{name} &nbsp;·&nbsp; <button style={{ background: "none", border: "none", fontSize: 11, color: "#888", cursor: "pointer", textDecoration: "underline" }} onClick={onLogout}>Exit</button></div>
      </div>
      <div className="sl-tabs">{tabs}</div>
      {displayStep === 1 && <Step1 pData={pd} confirmed={pd.step1Confirmed} onConfirm={advance} onBack={onLogout} />}
      {displayStep === 2 && <Step2 pData={pd} confirmed={pd.step2Confirmed} onConfirm={advance} onBack={() => go(1)} />}
      {displayStep === 3 && <Step3 pData={pd} confirmed={pd.step3Confirmed} onConfirm={advance} onBack={() => go(2)} />}
      {displayStep === 4 && <Step4 pData={pd} confirmed={pd.step4Confirmed} onConfirm={advance} onBack={() => go(3)} />}
      {displayStep === 5 && <Step5MarketContext pData={pd} confirmed={pd.step5Confirmed} onConfirm={(rates) => { pSave(name, { marketRates: rates, step5Confirmed: true }); advance(); }} onBack={() => go(4)} />}
      {displayStep === 6 && (
        <PredStep
          stepN={6} lines={REV_LINES} defRates={pd.marketRates || REV_DEF_RATES} lineRates={revRates} setLineRates={setRevRates}
          heading="Current trajectory: Predicted revenues by July 2028"
          note="31 July 2028 is chosen as it is FBaM's year end and levy funding should have ended post EPA submissions."
          confirmLabel="Confirm and continue → Step 7"
          isCost={false} confirmed={pd.step6Confirmed}
          onConfirm={(rates) => { pSave(name, { revRates: rates, step6Confirmed: true }); advance(); }}
          onBack={() => go(5)}
        />
      )}
      {displayStep === 7 && (
        <PredStep
          stepN={7} lines={COST_LINES} defRates={{}} lineRates={{}} setLineRates={() => {}}
          heading="Current trajectory: Predicted costs by July 2028"
          note="Enter your predicted % change for each cost line. Pay awards, TRAC changes, and headcount reductions all apply here."
          confirmLabel="Confirm and continue → Step 8"
          isCost={true} confirmed={pd.step7Confirmed}
          onConfirm={(rates) => { pSave(name, { costRates: rates, step7Confirmed: true }); advance(); }}
          onBack={() => go(6)}
        />
      )}
      {displayStep === 8 && <Step7 pData={pd} confirmed={pd.step8Confirmed} onConfirm={() => { pSave(name, { step8Confirmed: true }); advance(); }} onBack={() => go(7)} />}

      {/* ── PURPOSE TOOL: Steps 9–16 ── */}
      {displayStep === 9 && <PurposeStep8 pData={pd} confirmed={pd.step9Confirmed} onConfirm={advance} onBack={() => go(8)} />}
      {displayStep === 10 && <PurposeStep9 pData={pd} confirmed={pd.step10Confirmed} onConfirm={(t) => { pSave(name, { purposeTensions: t, step10Confirmed: true }); advance(); }} onBack={() => go(9)} />}
      {displayStep === 11 && (
        <PurposeOptionsStep
          stepN={11} heading="What is FBaM for?" confirmed={pd.step11Confirmed}
          prompt="In July 2028 FBaM exists to…"
          pData={pd} stateKey="purposeOptions" rankKey="purposeRanked" ownKey="purposeOwn"
          fallbackKey="purpose" singleChoice={false}
          genFn={async (p) => callAI(`You are a world-class strategy consultant and marketing expert. Generate exactly 4 short purpose statements for Cranfield University's Faculty of Business and Management (FBaM), completing the sentence "In July 2028, FBaM exists to…"

Primary stakeholders (rated 1-9): ${getGroupSummary(p.purposeGroups || {})}
Strategic positioning: ${getPositionSummary(p.purposeTensions || {})}

Requirements:
- Each statement completes the sentence — do NOT include those words, do NOT add preamble like "here are" or "based on"
- Each is 1 sentence, specific to FBaM's actual context (technology management, Cranfield campus, defence/aerospace clients)
- Range from mission-level to impact-level
- Number each 1-4, one per line, no other commentary`)}
          confirmLabel="Confirm → Step 12: Mission"
          onConfirm={advance} onBack={() => go(10)}
        />
      )}
      {displayStep === 12 && (
        <PurposeOptionsStep
          stepN={12} heading="What is FBaM trying to achieve?" confirmed={pd.step12Confirmed}
          prompt="In July 2028, FBaM is trying to…"
          pData={pd} stateKey="purposeMissionOptions" rankKey="purposeMissionRanked" ownKey="purposeMissionOwn"
          fallbackKey="mission" singleChoice={false}
          genFn={async (p) => callAI(`You are a world-class strategy consultant. Generate exactly 4 mission statements for Cranfield University's Faculty of Business and Management (FBaM), completing "In July 2028, FBaM is trying to…"

Purpose selected: "${(p.purposeRanked || [])[0] || p.purposeOwn || ""}"
Primary stakeholders: ${getGroupSummary(p.purposeGroups || {})}
Strategic positioning: ${getPositionSummary(p.purposeTensions || {})}

Requirements:
- Complete the sentence directly — no preamble, no "here are", no "based on"
- Medium-term direction, not a vision statement. Specific to FBaM's competitive context.
- Number each 1-4, one per line, no other commentary`)}
          confirmLabel="Confirm → Step 13: Distinctiveness"
          onConfirm={advance} onBack={() => go(11)}
        />
      )}
      {displayStep === 13 && (
        <PurposeOptionsStep
          stepN={13} heading="What can FBaM offer that competitors cannot?" confirmed={pd.step13Confirmed}
          prompt="What FBaM has that e.g., Warwick Business School, Imperial College Business School, Saïd Business School Oxford, Ashridge, etc. — cannot easily offer"
          pData={pd} stateKey="purposeUniqueOptions" rankKey="purposeUniqueRanked" ownKey="purposeUniqueOwn"
          fallbackKey="unique" singleChoice={false}
          genFn={async (p) => callAI(`You are a world-class strategy consultant. Generate exactly 4 statements of FBaM's distinctiveness — what it has that competitors (e.g., Warwick Business School, Imperial College Business School, Saïd Business School Oxford, Ashridge, etc.) cannot easily offer.

Strategic positioning: ${getPositionSummary(p.purposeTensions || {})}
Purpose: "${(p.purposeRanked || [])[0] || p.purposeOwn || ""}"

Requirements:
- Start each statement directly with the differentiator — no preamble, no "here are", no "based on"
- Specific to Cranfield/FBaM's actual assets: campus, technology/engineering adjacency, defence/aerospace clients, work-based learning
- Each is 1 sentence naming a concrete differentiator
- Number each 1-4, one per line, no other commentary`)}
          confirmLabel="Confirm → Step 14: VRIN test"
          onConfirm={advance} onBack={() => go(12)}
        />
      )}
      {displayStep === 14 && <PurposeStep13 pData={pd} confirmed={pd.step14Confirmed} onConfirm={advance} onBack={() => go(13)} />}
      {displayStep === 15 && (
        <PurposeOptionsStep
          stepN={15} heading="If FBaM closed before July 2028…" confirmed={pd.step15Confirmed}
          prompt="If FBaM closed before July 2028, what would most likely happen?"
          pData={pd} stateKey="purposeDisappearOptions" rankKey="purposeDisappearRanked" ownKey="purposeDisappearOwn"
          fallbackKey="disappear" singleChoice={true}
          genFn={async (p) => callAI(`You are a world-class strategy consultant. Generate exactly 4 options describing what would most likely happen if FBaM closed before July 2028.

Claimed distinctiveness: "${(p.purposeUniqueRanked || [])[0] || p.purposeUniqueOwn || "not specified"}"
Strategic positioning: ${getPositionSummary(p.purposeTensions || {})}

Requirements:
- Start each option directly — no preamble, no "here are", no "based on"
- Range from "easily replaced" to "irreplaceable loss"
- Specific: reference Cranfield, technology/engineering context, defence/aerospace clients
- Include one option that says something irreplaceable would be lost
- Each option is 1 sentence, number each 1-4, one per line, no other commentary`)}
          confirmLabel="Confirm → Step 16: WHY/HOW/WHAT"
          onConfirm={advance} onBack={() => go(14)}
        />
      )}
      {displayStep === 16 && <PurposeStep15 pData={pd} confirmed={pd.step16Confirmed} onConfirm={advance} onBack={() => go(15)} />}

      {/* ── FINANCIAL CLOSE: Steps 17–18 ── */}
      {displayStep === 17 && <Step17CloseGap pData={pd} confirmed={pd.step17Confirmed} onConfirm={() => { pSave(name, { step17Confirmed: true }); advance(); }} onBack={() => go(16)} />}
      {displayStep === 18 && <Step18ThemePL pData={pd} confirmed={pd.step18Confirmed} onConfirm={() => { pSave(name, { step18Confirmed: true }); advance(); }} onBack={() => go(17)} />}
      {displayStep === 19 && <Step19Comparison pData={pd} onConfirm={() => { pSave(name, { step19Confirmed: true }); advance(); }} onBack={() => go(18)} />}
      {displayStep === 20 && <Step20Finalise pData={pd} onBack={() => go(19)} />}
    </div>
  );
}

/* ── PURPOSE TOOL HELPERS ─────────────────────────────────────────────────── */
function getPositionSummary(tensions) {
  return PURPOSE_TENSIONS.map(t => {
    const v = nv(tensions[t.key], 50);
    const label = v < 33 ? t.l : v > 66 ? t.r : `balanced (${t.l} / ${t.r})`;
    return `${t.desc} → ${label}`;
  }).join("; ");
}
function getGroupSummary(groups) {
  const sorted = Object.entries(groups || {}).sort((a, b) => nv(b[1]) - nv(a[1]));
  return sorted.filter(([, v]) => nv(v) >= 7).map(([k]) => k).join(", ") || "not specified";
}

/* ── PURPOSE STEP 8: WHO FBAM SERVES ─────────────────────────────────────── */
function PurposeStep8({ pData, confirmed, onConfirm, onBack }) {
  const init = () => { const g = {}; PURPOSE_GROUPS.forEach(k => g[k] = nv(pData.purposeGroups?.[k], 5)); return g; };
  const [groups, setGroups] = useState(init);
  const [others, setOthers] = useState(pData.purposeGroupOthers || [{ label: "", score: 5 }]);

  const doConfirm = () => {
    pSave(pData.name, { purposeGroups: groups, purposeGroupOthers: others, step9Confirmed: true });
    onConfirm();
  };

  return (
    <div className="sl-content">
      <BackBtn onClick={onBack} />
      {confirmed && <ConfirmedBanner stepN={9} />}
      <div className="sl-step-h">Who should FBaM serve in July 2028?</div>
      <div className="sl-prompt">"These are prompts — write your own if none of these fit. Rate each stakeholder by importance to FBaM's purpose in the future. 9 = extremely important."</div>
      <div className="sl-note-box">Rate 1–9. 9 = extremely important. These ratings inform the purpose and mission options in later steps.</div>
      <table className="sl-tbl">
        <thead><tr><th>Stakeholder</th><th className="right" style={{ width: 200 }}>Importance (1 = low, 9 = high)</th></tr></thead>
        <tbody>
          {PURPOSE_GROUPS.map(g => (
            <tr key={g}>
              <td className="tbl-name">{g}</td>
              <td>
                <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", flexWrap: "nowrap" }}>
                  {[1,2,3,4,5,6,7,8,9].map(n => (
                    <button key={n}
                      style={{ padding: "4px 0", border: `1px solid ${nv(groups[g]) === n ? "#e07030" : "#d8d3cb"}`, borderRadius: 4, background: nv(groups[g]) === n ? "#e07030" : "#f0ede8", color: nv(groups[g]) === n ? "#fff" : "#1a1a1a", fontFamily: "'DM Sans',sans-serif", fontSize: 12, cursor: "pointer", width: 30, textAlign: "center" }}
                      onClick={() => setGroups(prev => ({ ...prev, [g]: n }))}
                    >{n}</button>
                  ))}
                </div>
              </td>
            </tr>
          ))}
          {others.map((o, i) => (
            <tr key={`other-${i}`}>
              <td><input type="text" className="sl-input" style={{ fontSize: 13 }} placeholder="Add another group…" value={o.label} onChange={e => setOthers(arr => arr.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} /></td>
              <td>
                <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", flexWrap: "nowrap" }}>
                  {[1,2,3,4,5,6,7,8,9].map(n => (
                    <button key={n}
                      style={{ padding: "4px 0", border: `1px solid ${o.score === n ? "#e07030" : "#d8d3cb"}`, borderRadius: 4, background: o.score === n ? "#e07030" : "#f0ede8", color: o.score === n ? "#fff" : "#1a1a1a", fontFamily: "'DM Sans',sans-serif", fontSize: 12, cursor: "pointer", width: 30, textAlign: "center" }}
                      onClick={() => setOthers(arr => arr.map((x, j) => j === i ? { ...x, score: n } : x))}
                    >{n}</button>
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="sl-btn sl-btn-outline" style={{ fontSize: 12, padding: "8px 14px", marginBottom: 20 }}
        onClick={() => setOthers(arr => [...arr, { label: "", score: 5 }])}>+ Add stakeholder</button>
      <div style={{ marginTop: 8 }}>
        <button className="sl-btn" onClick={doConfirm}>Confirm → Step 9: Strategic positioning</button>
      </div>
    </div>
  );
}

/* ── PURPOSE STEP 9: STRATEGIC POSITIONING ────────────────────────────────── */
function PurposeStep9({ pData, confirmed, onConfirm, onBack }) {
  const init = () => { const t = {}; PURPOSE_TENSIONS.forEach(x => t[x.key] = nv(pData.purposeTensions?.[x.key], 50)); return t; };
  const [tensions, setTensions] = useState(init);

  const doConfirm = () => {
    pSave(pData.name, { purposeTensions: tensions, step10Confirmed: true });
    onConfirm(tensions);
  };

  return (
    <div className="sl-content">
      <BackBtn onClick={onBack} />
      {confirmed && <ConfirmedBanner stepN={10} />}
      <div className="sl-step-h">Strategic positioning</div>
      <div className="sl-prompt">"These sliders define where you believe FBaM should sit in July 2028. They will shape the purpose and mission options generated next. Set each to your honest view."</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 28, marginBottom: 32 }}>
        {PURPOSE_TENSIONS.map(t => {
          const v = nv(tensions[t.key], 50);
          return (
            <div key={t.key}>
              <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, color: "#888", marginBottom: 6 }}>{t.desc}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: v < 40 ? "#e07030" : "#aaa", fontWeight: v < 40 ? 600 : 400, minWidth: 120, textAlign: "right" }}>{t.l}</span>
                <input type="range" className="sl-slider" style={{ flex: 1 }} min={0} max={100} step={5}
                  value={v} onChange={e => setTensions(prev => ({ ...prev, [t.key]: parseInt(e.target.value) }))} />
                <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: v > 60 ? "#e07030" : "#aaa", fontWeight: v > 60 ? 600 : 400, minWidth: 120 }}>{t.r}</span>
              </div>
            </div>
          );
        })}
      </div>
      <button className="sl-btn" onClick={doConfirm}>Confirm → Step 11: Purpose</button>
    </div>
  );
}

/* ── PURPOSE OPTIONS STEP (shared component for steps 10, 11, 12, 14) ──────── */
function PurposeOptionsStep({ stepN, heading, prompt, pData, stateKey, rankKey, ownKey, fallbackKey, genFn, confirmLabel, onConfirm, onBack, confirmed, singleChoice = false }) {
  // Options start empty — user explicitly generates them. Once set, they never change.
  const [options, setOptions] = useState(pData[stateKey] || []);
  const [ranked, setRanked]   = useState(pData[rankKey] || []);
  const [own, setOwn]         = useState(pData[ownKey] || "");
  const [loading, setLoading] = useState(false);
  const [usedFallback, setUsedFallback] = useState(false);

  const generate = async () => {
    setLoading(true);
    try {
      const txt = await genFn(pData);
      const lines = txt.split("\n").map(l => l.replace(/^\d+\.\s*/, "").trim()).filter(l => l.length > 10 && !l.toLowerCase().includes("here are") && !l.toLowerCase().includes("based on")).slice(0, 4);
      if (lines.length >= 2) {
        setOptions(lines);
        setUsedFallback(false);
      } else {
        setOptions(FALLBACKS[fallbackKey] || []);
        setUsedFallback(true);
      }
    } catch (e) {
      setOptions(FALLBACKS[fallbackKey] || []);
      setUsedFallback(true);
    }
    setLoading(false);
  };

  const toggle = (opt) => {
    if (singleChoice) { setRanked([opt]); return; }
    const i = ranked.indexOf(opt);
    if (i >= 0) { setRanked(r => r.filter(x => x !== opt)); }
    else if (ranked.length < 3) { setRanked(r => [...r, opt]); }
    else { setRanked(r => [...r.slice(1), opt]); }
  };

  const doConfirm = () => {
    const save = { [stateKey]: options, [rankKey]: ranked, [ownKey]: own };
    save[`step${stepN}Confirmed`] = true;
    pSave(pData.name, save);
    onConfirm();
  };

  return (
    <div className="sl-content">
      <BackBtn onClick={onBack} />
      {confirmed && <ConfirmedBanner stepN={stepN} />}
      <div className="sl-step-h">{heading}</div>
      <div className="sl-prompt">"{prompt}"</div>
      <div className="sl-note-box">
        These are prompts — they do not need to be perfect. We are seeking to surface your priorities and assumptions. Write your own below if none fit. {singleChoice ? "Select one." : "Select up to three in order of preference."}
      </div>

      {options.length === 0 && !loading && (
        <button className="sl-btn" style={{ marginBottom: 20 }} onClick={generate}>
          Generate options based on my responses
        </button>
      )}

      {loading && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 0 24px", fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: "#888" }}>
          <div style={{ width: 16, height: 16, border: "2px solid #d8d3cb", borderTopColor: "#e07030", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
          Generating options based on your responses…
        </div>
      )}

      {options.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          {usedFallback && (
            <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: "#aaa", marginBottom: 10, fontStyle: "italic" }}>
              Example options shown — AI unavailable. Write your own below.
            </div>
          )}
          {options.map((opt, i) => {
            const rank = ranked.indexOf(opt) + 1;
            return (
              <div key={i} onClick={() => toggle(opt)}
                style={{ padding: "12px 16px", border: `1px solid ${rank > 0 ? "#e07030" : "#d8d3cb"}`, borderRadius: 4, marginBottom: 8, cursor: "pointer", background: rank > 0 ? "#fdf5f0" : "#f0ede8", display: "flex", alignItems: "flex-start", gap: 12 }}>
                <div style={{ minWidth: 22, height: 22, borderRadius: "50%", background: rank > 0 ? "#e07030" : "#d8d3cb", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, fontWeight: 500, flexShrink: 0 }}>
                  {rank > 0 ? rank : ""}
                </div>
                <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: "#1a1a1a", lineHeight: 1.5 }}>{opt}</div>
              </div>
            );
          })}
        </div>
      )}

      <div className="sl-field">
        <label className="sl-label">Write your own (optional)</label>
        <textarea className="sl-input" rows={2} value={own} onChange={e => setOwn(e.target.value)} placeholder="Write your own statement here…" />
      </div>

      <button className="sl-btn" onClick={doConfirm} style={{ marginTop: 8 }}>{confirmLabel}</button>
    </div>
  );
}

/* ── PURPOSE STEP 13: VRIN TEST ───────────────────────────────────────────── */
function PurposeStep13({ pData, confirmed, onConfirm, onBack }) {
  const unique = (pData.purposeUniqueRanked || [])[0] || pData.purposeUniqueOwn || "your claimed distinctiveness";
  const [vrin, setVrin] = useState(pData.purposeVrin || { v: null, r: null, i: null, n: null });
  const [verdict, setVerdict] = useState(pData.purposeVerdict || "");
  const [loading, setLoading]   = useState(false);

  const VRIN_Q = [
    { key: "v", label: "Valuable", q: "Does this distinctiveness create real value for students and clients — value they are willing to pay for?" },
    { key: "r", label: "Rare", q: "Do competitors (e.g., Warwick Business School, Imperial College Business School, Saïd Business School Oxford, Ashridge, etc.) possess this capability to the same degree?" },
    { key: "i", label: "Hard to imitate", q: "How difficult would it be for a competitor to replicate this within five years?" },
    { key: "n", label: "Non-substitutable", q: "Can clients get equivalent value from a different approach or provider?" },
  ];
  const VRIN_OPTS = {
    v: ["Yes — this is clearly valued and clients choose FBaM because of it", "Partially — some clients value it, others don't", "Unclear — hard to evidence"],
    r: ["Yes — competitors have similar strengths", "Partially — some have aspects of it", "No — this is genuinely rare"],
    i: ["Easy — a competitor with resources could replicate this quickly", "Moderate — would take significant time and investment", "Hard — this is deeply embedded and difficult to replicate"],
    n: ["Yes — the combination FBaM offers is distinctive and hard to substitute", "Partially — some clients are already substituting with alternatives", "Increasingly yes — the market is reducing FBaM's distinctiveness"],
  };

  const allAnswered = ["v","r","i","n"].every(k => vrin[k] !== null);

  const genVerdict = async () => {
    setLoading(true);
    const txt = await callAI(`You are a world-class strategy consultant. Write a 2-sentence verdict on FBaM's competitive position based on this VRIN assessment.

Claimed distinctiveness: "${unique}"
Valuable: ${vrin.v}
Rare: ${vrin.r}
Hard to imitate: ${vrin.i}
Non-substitutable: ${vrin.n}

Requirements:
- First sentence: state whether the position is strong, moderate, or vulnerable, and why
- Second sentence: name the single most important strategic risk or opportunity
- Be honest and direct — this is for a room of senior leaders
- 2 sentences only, no preamble`);
    setVerdict(txt.trim());
    setLoading(false);
  };

  const doConfirm = () => {
    pSave(pData.name, { purposeVrin: vrin, purposeVerdict: verdict, step14Confirmed: true });
    onConfirm();
  };

  return (
    <div className="sl-content">
      <BackBtn onClick={onBack} />
      {confirmed && <ConfirmedBanner stepN={14} />}
      <div className="sl-step-h">VRIN test</div>
      <div className="sl-prompt">"Testing the distinctiveness you selected against the four conditions for sustainable competitive advantage."</div>
      <div className="sl-note-box" style={{ borderColor: "#e07030" }}>
        Testing: <em>"{unique}"</em>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 20, marginBottom: 24 }}>
        {VRIN_Q.map(q => (
          <div key={q.key} style={{ border: "1px solid #d8d3cb", borderRadius: 4, padding: 16, background: "#f0ede8" }}>
            <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600, color: "#e07030", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>{q.label}</div>
            <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: "#1a1a1a", marginBottom: 12 }}>{q.q}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {VRIN_OPTS[q.key].map((opt, i) => (
                <div key={i} onClick={() => setVrin(prev => ({ ...prev, [q.key]: opt }))}
                  style={{ padding: "8px 12px", border: `1px solid ${vrin[q.key] === opt ? "#e07030" : "#d8d3cb"}`, borderRadius: 4, cursor: "pointer", background: vrin[q.key] === opt ? "#fdf5f0" : "#f0ede8", fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: "#1a1a1a" }}>
                  {opt}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {allAnswered && !verdict && (
        <button className="sl-btn" onClick={genVerdict} style={{ marginBottom: 20 }}>
          {loading ? "Generating verdict…" : "Generate competitive verdict"}
        </button>
      )}

      {verdict && (
        <div style={{ marginBottom: 24 }}>
          <label className="sl-label">Competitive verdict</label>
          <textarea className="sl-input" rows={3} value={verdict} onChange={e => setVerdict(e.target.value)} />
        </div>
      )}

      <button className="sl-btn" onClick={doConfirm}>Confirm → Step 14: Disappearance test</button>
    </div>
  );
}

/* ── PURPOSE STEP 15: WHY/HOW/WHAT OUTPUT ─────────────────────────────────── */
function PurposeStep15({ pData, confirmed, onConfirm, onBack }) {
  const [why, setWhy]     = useState(pData.purposeWhy || "");
  const [how, setHow]     = useState(pData.purposeHow || "");
  const [what, setWhat]   = useState(pData.purposeWhat || "");
  const [loading, setLoading] = useState(false);

  const generate = async () => {
    setLoading(true);
    const purpose   = (pData.purposeRanked || [])[0] || pData.purposeOwn || "";
    const mission   = (pData.purposeMissionRanked || [])[0] || pData.purposeMissionOwn || "";
    const unique    = (pData.purposeUniqueRanked || [])[0] || pData.purposeUniqueOwn || "";
    const disappear = (pData.purposeDisappearRanked || [])[0] || "";
    const pos       = getPositionSummary(pData.purposeTensions || {});
    const groups    = getGroupSummary(pData.purposeGroups || {});

    const txt = await callAI(`You are a world-class strategy consultant. Based on the inputs below, write a WHY / HOW / WHAT statement for Cranfield University's Faculty of Business and Management (FBaM).

Primary stakeholders: ${groups}
Strategic positioning: ${pos}
Purpose: "${purpose}"
Mission: "${mission}"
Key differentiator: "${unique}"
Disappearance impact: "${disappear}"

Respond in this EXACT JSON format — no text outside the JSON, no markdown:
{"why":"2-3 sentences — the belief and conviction, not what FBaM earns","how":"3-4 sentences — specific differentiating practices and assets, concrete not generic","what":"2-3 sentences — the programmes and services that logically follow"}`);

    try {
      const clean = txt.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      if (parsed.why)  setWhy(parsed.why);
      if (parsed.how)  setHow(parsed.how);
      if (parsed.what) setWhat(parsed.what);
    } catch (e) {
      // Fallback text extraction
      const w = txt.match(/"why"\s*:\s*"([^"]+)"/i)?.[1];
      const h = txt.match(/"how"\s*:\s*"([^"]+)"/i)?.[1];
      const wh = txt.match(/"what"\s*:\s*"([^"]+)"/i)?.[1];
      if (w) setWhy(w);
      if (h) setHow(h);
      if (wh) setWhat(wh);
      if (!w && !h && !wh) setWhy(txt.length > 10 ? txt.trim() : "Could not generate — write your own below.");
    }
    setLoading(false);
  };

  const doConfirm = () => {
    pSave(pData.name, { purposeWhy: why, purposeHow: how, purposeWhat: what, step16Confirmed: true });
    onConfirm();
  };

  return (
    <div className="sl-content">
      <BackBtn onClick={onBack} />
      {confirmed && <ConfirmedBanner stepN={16} />}
      <div className="sl-step-h">WHY / HOW / WHAT</div>
      <div className="sl-prompt">"Your purpose, expressed as a WHY / HOW / WHAT statement. Generated from everything you've said — edit freely until it's yours."</div>

      {!why && !loading && (
        <button className="sl-btn" onClick={generate} style={{ marginBottom: 20 }}>Generate WHY / HOW / WHAT</button>
      )}
      {loading && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0 20px", fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: "#888" }}>
          <div style={{ width: 16, height: 16, border: "2px solid #d8d3cb", borderTopColor: "#e07030", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
          Generating your statement…
        </div>
      )}

      {(why || how || what) && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20, marginBottom: 24 }}>
          {[["WHY", why, setWhy, "The belief and conviction — why FBaM exists in the world"], ["HOW", how, setHow, "The specific differentiating practices and assets"], ["WHAT", what, setWhat, "The programmes and services that follow from the WHY and HOW"]].map(([label, val, setter, hint]) => (
            <div key={label} style={{ border: "1px solid #d8d3cb", borderRadius: 4, padding: 16, background: "#f0ede8" }}>
              <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 600, color: "#e07030", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>{label}</div>
              <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: "#aaa", marginBottom: 8 }}>{hint}</div>
              <textarea className="sl-input" rows={3} value={val} onChange={e => setter(e.target.value)} />
            </div>
          ))}
          <button className="sl-btn sl-btn-outline" style={{ fontSize: 12, padding: "6px 12px", alignSelf: "flex-start" }} onClick={generate}>Regenerate</button>
        </div>
      )}

      {!why && !loading && (
        <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: "#aaa", marginBottom: 16 }}>
          Or write your own directly in the fields — they will appear after you generate, or type below to skip generation.
        </div>
      )}
      {!why && !loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
          {[["WHY", why, setWhy], ["HOW", how, setHow], ["WHAT", what, setWhat]].map(([label, val, setter]) => (
            <div key={label}>
              <label className="sl-label">{label}</label>
              <textarea className="sl-input" rows={2} value={val} onChange={e => setter(e.target.value)} placeholder={`Write your ${label.toLowerCase()} statement…`} />
            </div>
          ))}
        </div>
      )}

      <button className="sl-btn" onClick={doConfirm}>Confirm purpose → Step 17: Close the gap</button>
    </div>
  );
}

/* ── FACILITATOR REVEAL HELPERS ───────────────────────────────────────────── */
function RevBlock({ stepN, label, children }) {
  const [open, setOpen] = useState(false);
  const isRevealed = STORE.revealed[stepN];
  return (
    <div className={`sl-reveal${open ? " open" : ""}`}>
      <div className="sl-reveal-hd" onClick={() => setOpen(o => !o)}>
        <span>Step {stepN}: {label}</span>
        <span style={{ fontSize: 12, color: "#aaa" }}>{open ? "▲" : "▼"} {isRevealed ? "Revealed" : "Hidden"}</span>
      </div>
      <div className="sl-reveal-body">{children}</div>
    </div>
  );
}

function FacRev1({ ps }) {
  return (
    <table className="sl-tbl" style={{ fontSize: 12 }}>
      <thead><tr><th>Participant</th><th className="right">Target %</th></tr></thead>
      <tbody>{ps.map(p => <tr key={p.name}><td>{p.name}</td><td style={{ textAlign: "right", fontFamily: "IBM Plex Mono", fontSize: 13 }}>{nv(p.targetPct) >= 0 ? "+" : ""}{nv(p.targetPct).toFixed(1)}%</td></tr>)}</tbody>
    </table>
  );
}

function FacRev2({ ps }) {
  const revTotal = (p) => REV_LINES.reduce((s, l) => s + nv(p.revenues?.[l.id], l.prefillK), 0);
  return (
    <table className="sl-tbl" style={{ fontSize: 11 }}>
      <thead><tr><th>Participant</th>{REV_LINES.map(l => <th key={l.id} className="right" style={{ fontSize: 10 }}>{l.name.split(" ").slice(0, 2).join(" ")}</th>)}<th className="right">Total</th></tr></thead>
      <tbody>{ps.map(p => <tr key={p.name}>
        <td>{p.name}</td>
        {REV_LINES.map(l => <td key={l.id} style={{ textAlign: "right", fontFamily: "IBM Plex Mono" }}>{nv(p.revenues?.[l.id], l.prefillK).toLocaleString()}</td>)}
        <td style={{ textAlign: "right", fontFamily: "IBM Plex Mono", fontWeight: 600 }}>{revTotal(p).toLocaleString()}</td>
      </tr>)}</tbody>
    </table>
  );
}

function FacRev7({ ps }) {
  return (
    <table className="sl-tbl" style={{ fontSize: 11 }}>
      <thead><tr><th>Participant</th><th className="right">Pred Rev</th><th className="right">Pred Cost</th><th className="right">Surplus</th><th className="right">Surplus %</th><th className="right">Target</th><th className="right">Gap</th></tr></thead>
      <tbody>{ps.map(p => {
        const { total: pr } = calcPredRevs(p);
        const { total: pc } = calcPredCosts(p);
        const s = pr - pc; const sp = pr > 0 ? (s / pr * 100).toFixed(1) : 0;
        const tgt = nv(p.targetPct, 7.5); const gap = pr * tgt / 100 - s;
        return <tr key={p.name}>
          <td>{p.name}</td>
          <td style={{ textAlign: "right", fontFamily: "IBM Plex Mono" }}>{fmtK(pr)}</td>
          <td style={{ textAlign: "right", fontFamily: "IBM Plex Mono" }}>{fmtK(pc)}</td>
          <td style={{ textAlign: "right", fontFamily: "IBM Plex Mono", color: s >= 0 ? "#2d7d46" : "#b83232" }}>{fmtK(s)}</td>
          <td style={{ textAlign: "right", fontFamily: "IBM Plex Mono" }}>{sp}%</td>
          <td style={{ textAlign: "right", fontFamily: "IBM Plex Mono" }}>{tgt.toFixed(1)}%</td>
          <td style={{ textAlign: "right", fontFamily: "IBM Plex Mono", color: gap > 0 ? "#b83232" : "#2d7d46" }}>{gap > 0 ? fmtK(gap) : "None"}</td>
        </tr>;
      })}</tbody>
    </table>
  );
}

function FacRev8({ ps }) {
  const submitted = ps.filter(p => p.submitted && p.s8);
  return (
    <div>
      {submitted.map((p, i) => {
        const s8 = p.s8 || {};
        return (
          <div key={p.name} style={{ marginBottom: 16, padding: 12, border: "1px solid #e0ddd8", borderRadius: 4 }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{p.name}</div>
            <div style={{ fontStyle: "italic", fontSize: 12, color: "#666", marginBottom: 8 }}>"{s8.stmt}"</div>
            <div style={{ display: "flex", gap: 16, fontSize: 12, fontFamily: "IBM Plex Mono" }}>
              <span>Rev: {fmtK(nv(s8.totalRevFinal))}</span>
              <span>Cost: {fmtK(nv(s8.totalCostFinal))}</span>
              <span>Surplus: {fmtK(nv(s8.surplusFinal))}</span>
              <span>{nv(s8.totalRevFinal) > 0 ? ((nv(s8.surplusFinal) / nv(s8.totalRevFinal)) * 100).toFixed(1) : 0}%</span>
            </div>
          </div>
        );
      })}
      {submitted.length === 0 && <div style={{ color: "#aaa", fontSize: 12 }}>No scenarios submitted yet.</div>}
    </div>
  );
}

/* ── FACILITATOR VIEW ─────────────────────────────────────────────────────── */
function FacilitatorView({ tick, onLogout }) {
  const [reset, setReset] = useState("");
  const [sessionInput, setSessionInput] = useState(STORE.sessionId || "");
  const [syncing, setSyncing] = useState(false);

  // Poll Supabase every 4 seconds when session is active
  useEffect(() => {
    if (!STORE.sessionId) return;
    const id = setInterval(() => { syncFromSupabase(); }, 4000);
    return () => clearInterval(id);
  }, [STORE.sessionId]);

  const connectSession = () => {
    STORE.sessionId = sessionInput.trim();
    setSyncing(true);
    syncFromSupabase().then(() => setSyncing(false));
  };

  const participants = pAll();

  const advanceAll = () => {
    if (STORE.step < 20) STORE.step++;
  };

  const doReset = () => {
    if (reset === "RESET") {
      Object.keys(STORE.participants).forEach(k => delete STORE.participants[k]);
      STORE.step = 1;
      Object.keys(STORE.revealed).forEach(k => delete STORE.revealed[k]);
      setReset("");
    }
  };

  return (
    <div className="sl-shell">
      <div className="sl-header">
        <div className="sl-header-title">Facilitator — Financial Viability Scenario Tool</div>
        <button style={{ background: "none", border: "none", fontSize: 11, color: "#888", cursor: "pointer", textDecoration: "underline" }} onClick={onLogout}>Exit</button>
      </div>
      <div className="sl-fac">
        <div className="sl-fac-h">Facilitator console</div>

        {!STORE.sessionId && (
          <div className="sl-adv-bar" style={{ flexDirection: "column", alignItems: "flex-start", gap: 12 }}>
            <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 600 }}>Connect to session</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input className="sl-input" style={{ width: 200, fontSize: 13 }} placeholder="Session code e.g. FBaM-Mar26"
                value={sessionInput} onChange={e => setSessionInput(e.target.value)} />
              <button className="sl-btn" style={{ fontSize: 12, padding: "8px 16px" }} onClick={connectSession}>
                {syncing ? "Connecting…" : "Connect"}
              </button>
            </div>
          </div>
        )}
        <div className="sl-adv-bar">
          <div style={{ fontSize: 13, fontWeight: 600 }}>Current step: {STORE.step}</div>
          <button className="sl-btn" style={{ fontSize: 12, padding: "8px 16px" }} onClick={advanceAll} disabled={STORE.step >= 20}>
            Advance all → Step {Math.min(STORE.step + 1, 20)}
          </button>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
            <input className="sl-input" style={{ width: 120, fontSize: 12 }} placeholder="Type RESET" value={reset} onChange={e => setReset(e.target.value)} />
            <button className="sl-btn" style={{ fontSize: 12, padding: "8px 12px", background: "#b83232" }} onClick={doReset} disabled={reset !== "RESET"}>Reset session</button>
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div className="sl-label" style={{ marginBottom: 8 }}>Participants ({participants.length})</div>
          <div className="sl-pax-grid">
            {participants.length === 0 && <div style={{ color: "#aaa", fontSize: 13 }}>No participants yet. Share the session password: <strong>{PART_PWD}</strong></div>}
            {participants.map(p => {
              const confirmed = STEP_NAMES.filter((_, i) => p[`step${i + 1}Confirmed`]).length;
              return (
                <div className="sl-pax-card" key={p.name}>
                  <div className="sl-pax-name">{p.name}</div>
                  <div className="sl-pax-status">{confirmed} step(s) confirmed {p.submitted ? <span className="sl-pax-ok">· Submitted</span> : ""}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="sl-label" style={{ marginBottom: 8 }}>Reveal responses by step</div>
        <RevBlock stepN={1} label="Set goal"><FacRev1 ps={participants} /></RevBlock>
        <RevBlock stepN={2} label="Revenue"><FacRev2 ps={participants} /></RevBlock>
        <RevBlock stepN={3} label="Costs">
          <table className="sl-tbl" style={{ fontSize: 11 }}>
            <thead><tr><th>Participant</th>{COST_LINES.map(l => <th key={l.id} className="right" style={{ fontSize: 10 }}>{l.name.split(" ").slice(0, 2).join(" ")}</th>)}</tr></thead>
            <tbody>{participants.map(p => <tr key={p.name}>
              <td>{p.name}</td>
              {COST_LINES.map(l => <td key={l.id} style={{ textAlign: "right", fontFamily: "IBM Plex Mono" }}>{nv(p.costs?.[l.id], l.baseK).toLocaleString()}</td>)}
            </tr>)}</tbody>
          </table>
        </RevBlock>
        <RevBlock stepN={4} label="Current position">
          <table className="sl-tbl" style={{ fontSize: 11 }}>
            <thead><tr><th>Participant</th><th className="right">Rev</th><th className="right">Contrib surplus</th><th className="right">Net</th></tr></thead>
            <tbody>{participants.map(p => {
              const r = REV_LINES.reduce((s, l) => s + nv(p.revenues?.[l.id], l.prefillK), 0);
              const cc = COST_LINES.filter(l => l.id !== "uni_charge").reduce((s, l) => s + nv(p.costs?.[l.id], l.baseK), 0);
              const uc = nv(p.costs?.uni_charge, 10325);
              return <tr key={p.name}><td>{p.name}</td><td style={{ textAlign: "right", fontFamily: "IBM Plex Mono" }}>{fmtK(r)}</td><td style={{ textAlign: "right", fontFamily: "IBM Plex Mono" }}>{fmtK(r - cc)}</td><td style={{ textAlign: "right", fontFamily: "IBM Plex Mono", color: r - cc - uc >= 0 ? "#2d7d46" : "#b83232" }}>{fmtK(r - cc - uc)}</td></tr>;
            })}</tbody>
          </table>
        </RevBlock>
        <RevBlock stepN={5} label="Predicted revenues">
          <table className="sl-tbl" style={{ fontSize: 11 }}>
            <thead><tr><th>Participant</th>{REV_LINES.map(l => <th key={l.id} className="right" style={{ fontSize: 10 }}>{l.name.split(" ").slice(0, 2).join(" ")}</th>)}<th className="right">Total</th></tr></thead>
            <tbody>{participants.map(p => { const { predRevs, total } = calcPredRevs(p); return <tr key={p.name}><td>{p.name}</td>{REV_LINES.map(l => <td key={l.id} style={{ textAlign: "right", fontFamily: "IBM Plex Mono" }}>{fmtK(nv(predRevs[l.id]))}</td>)}<td style={{ textAlign: "right", fontFamily: "IBM Plex Mono", fontWeight: 600 }}>{fmtK(total)}</td></tr>; })}</tbody>
          </table>
        </RevBlock>
        <RevBlock stepN={6} label="Predicted costs">
          <table className="sl-tbl" style={{ fontSize: 11 }}>
            <thead><tr><th>Participant</th>{COST_LINES.map(l => <th key={l.id} className="right" style={{ fontSize: 10 }}>{l.name.split(" ").slice(0, 2).join(" ")}</th>)}<th className="right">Total</th></tr></thead>
            <tbody>{participants.map(p => { const { predCosts, total } = calcPredCosts(p); return <tr key={p.name}><td>{p.name}</td>{COST_LINES.map(l => <td key={l.id} style={{ textAlign: "right", fontFamily: "IBM Plex Mono" }}>{fmtK(nv(predCosts[l.id]))}</td>)}<td style={{ textAlign: "right", fontFamily: "IBM Plex Mono", fontWeight: 600 }}>{fmtK(total)}</td></tr>; })}</tbody>
          </table>
        </RevBlock>
        <RevBlock stepN={7} label="Prognosis"><FacRev7 ps={participants} /></RevBlock>
        <RevBlock stepN={8} label="Who FBaM serves">
          <table className="sl-tbl" style={{ fontSize: 11 }}>
            <thead><tr><th>Participant</th>{PURPOSE_GROUPS.map(g => <th key={g} className="right" style={{ fontSize: 9 }}>{g.split(" ").slice(0, 2).join(" ")}</th>)}</tr></thead>
            <tbody>{participants.map(p => <tr key={p.name}><td>{p.name}</td>{PURPOSE_GROUPS.map(g => <td key={g} style={{ textAlign: "right", fontFamily: "IBM Plex Mono", color: nv(p.purposeGroups?.[g]) >= 8 ? "#e07030" : "#1a1a1a" }}>{nv(p.purposeGroups?.[g], "—")}</td>)}</tr>)}</tbody>
          </table>
        </RevBlock>
        <RevBlock stepN={9} label="Strategic positioning">
          {participants.map(p => (
            <div key={p.name} style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 6 }}>{p.name}</div>
              {PURPOSE_TENSIONS.map(t => {
                const v = nv(p.purposeTensions?.[t.key], 50);
                return <div key={t.key} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 10, color: "#888", width: 100, textAlign: "right" }}>{t.l}</span>
                  <div style={{ flex: 1, height: 4, background: "#d8d3cb", borderRadius: 2, position: "relative" }}>
                    <div style={{ position: "absolute", left: `${v}%`, top: "50%", transform: "translate(-50%,-50%)", width: 10, height: 10, borderRadius: "50%", background: "#e07030" }} />
                  </div>
                  <span style={{ fontSize: 10, color: "#888", width: 100 }}>{t.r}</span>
                </div>;
              })}
            </div>
          ))}
        </RevBlock>
        <RevBlock stepN={10} label="Purpose">
          <table className="sl-tbl" style={{ fontSize: 12 }}>
            <thead><tr><th>Participant</th><th>Top choice</th><th>Own statement</th></tr></thead>
            <tbody>{participants.map(p => <tr key={p.name}><td>{p.name}</td><td style={{ fontSize: 11 }}>{(p.purposeRanked || [])[0] || "—"}</td><td style={{ fontSize: 11, color: "#888" }}>{p.purposeOwn || "—"}</td></tr>)}</tbody>
          </table>
        </RevBlock>
        <RevBlock stepN={11} label="Mission">
          <table className="sl-tbl" style={{ fontSize: 12 }}>
            <thead><tr><th>Participant</th><th>Top choice</th></tr></thead>
            <tbody>{participants.map(p => <tr key={p.name}><td>{p.name}</td><td style={{ fontSize: 11 }}>{(p.purposeMissionRanked || [])[0] || p.purposeMissionOwn || "—"}</td></tr>)}</tbody>
          </table>
        </RevBlock>
        <RevBlock stepN={12} label="Distinctiveness">
          <table className="sl-tbl" style={{ fontSize: 12 }}>
            <thead><tr><th>Participant</th><th>Top choice</th></tr></thead>
            <tbody>{participants.map(p => <tr key={p.name}><td>{p.name}</td><td style={{ fontSize: 11 }}>{(p.purposeUniqueRanked || [])[0] || p.purposeUniqueOwn || "—"}</td></tr>)}</tbody>
          </table>
        </RevBlock>
        <RevBlock stepN={13} label="VRIN verdict">
          <table className="sl-tbl" style={{ fontSize: 12 }}>
            <thead><tr><th>Participant</th><th>Verdict</th></tr></thead>
            <tbody>{participants.map(p => <tr key={p.name}><td>{p.name}</td><td style={{ fontSize: 11 }}>{p.purposeVerdict || "—"}</td></tr>)}</tbody>
          </table>
        </RevBlock>
        <RevBlock stepN={14} label="Disappearance">
          <table className="sl-tbl" style={{ fontSize: 12 }}>
            <thead><tr><th>Participant</th><th>Choice</th></tr></thead>
            <tbody>{participants.map(p => <tr key={p.name}><td>{p.name}</td><td style={{ fontSize: 11 }}>{(p.purposeDisappearRanked || [])[0] || "—"}</td></tr>)}</tbody>
          </table>
        </RevBlock>
        <RevBlock stepN={15} label="WHY / HOW / WHAT">
          {participants.map(p => p.purposeWhy ? (
            <div key={p.name} style={{ marginBottom: 20, padding: 12, border: "1px solid #d8d3cb", borderRadius: 4 }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>{p.name}</div>
              {[["WHY", p.purposeWhy], ["HOW", p.purposeHow], ["WHAT", p.purposeWhat]].map(([l, v]) => v ? (
                <div key={l} style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: "#e07030", textTransform: "uppercase", letterSpacing: 1, marginBottom: 3 }}>{l}</div>
                  <div style={{ fontSize: 12, color: "#1a1a1a", lineHeight: 1.5 }}>{v}</div>
                </div>
              ) : null)}
            </div>
          ) : null)}
        </RevBlock>
        <RevBlock stepN={16} label="Submitted scenarios"><FacRev8 ps={participants} /></RevBlock>
        <RevBlock stepN={17} label="Rankings">
          <div style={{ fontSize: 12, color: "#888" }}>Rankings visible after participants complete Step 17.</div>
        </RevBlock>
        <RevBlock stepN={18} label="Themes">
          <div style={{ fontSize: 12, color: "#888" }}>Theme declarations visible after participants complete Step 18.</div>
        </RevBlock>
      </div>
    </div>
  );
}

/* ── STEP 19: COMPARISON DASHBOARD ───────────────────────────────────────── */
const PAX_COLORS = ["#1a4fa0","#e07030","#2d7d46","#b87a20","#b83232","#6a3d9a","#555"];

function Step19Comparison({ pData, onConfirm, onBack }) {
  const [tab, setTab] = useState("gap");
  const participants = pAll().filter(p => p.step17Confirmed || p.submitted);

  const TabBtn = ({ id, label }) => (
    <button onClick={() => setTab(id)} style={{
      padding: "10px 18px", fontSize: 12, fontWeight: 600, border: "none", background: "transparent",
      cursor: "pointer", fontFamily: "'DM Sans',sans-serif", letterSpacing: 0.3,
      color: tab === id ? "#e07030" : "#888",
      borderBottom: tab === id ? "2px solid #e07030" : "2px solid transparent",
    }}>{label}</button>
  );

  const REV_SEGS = [
    { id: "ft_msc",      label: "FT MSc & MBA",  color: "#1a4fa0" },
    { id: "exec_ed",     label: "Exec ed",        color: "#e07030" },
    { id: "open",        label: "Open",           color: "#2d7d46" },
    { id: "research_dd", label: "Research",       color: "#b87a20" },
    { id: "hefce",       label: "HEFCE",          color: "#6a3d9a" },
    { id: "residences",  label: "Residences",     color: "#888" },
    { id: "other_rev",   label: "Other",          color: "#bbb" },
  ];

  return (
    <div className="sl-content">
      <BackBtn onClick={onBack} />
      <div className="sl-step-h">Comparison</div>
      <div className="sl-prompt">"How do the scenarios compare? Where did you agree — and where did you diverge?"</div>

      {participants.length < 2 && (
        <div className="sl-note-box" style={{ borderColor: "#e07030" }}>
          Comparison shows when at least 2 participants have completed Step 17. Currently {participants.length} participant(s) visible in this session.
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid #d8d3cb", marginBottom: 24 }}>
        <TabBtn id="gap"      label="The gap" />
        <TabBtn id="revmix"   label="Revenue mix" />
        <TabBtn id="tensions" label="Strategic tensions" />
      </div>

      {/* ── TAB 1: THE GAP ── */}
      {tab === "gap" && (
        <div>
          <table className="sl-tbl" style={{ fontSize: 12 }}>
            <thead><tr>
              <th>Participant</th>
              <th className="right">Target %</th>
              <th className="right">Do-nothing surplus</th>
              <th className="right">Gap to close</th>
              <th className="right">Scenario surplus</th>
              <th className="right">Scenario %</th>
              <th className="right">Met target?</th>
            </tr></thead>
            <tbody>
              {participants.map((p, i) => {
                const { total: predRev } = calcPredRevs(p);
                const { total: predCost } = calcPredCosts(p);
                const tgt = nv(p.targetPct, 7.5);
                const doNothingSurplus = predRev - predCost;
                const gap = (predRev * tgt / 100) - doNothingSurplus;
                const sRevs  = p.s17Revs  ? REV_LINES.reduce((s, l) => s + nv(p.s17Revs[l.id]), 0)  : (p.s8 ? nv(p.s8.totalRevFinal) : 0);
                const sCosts = p.s17Costs ? COST_LINES.reduce((s, l) => s + nv(p.s17Costs[l.id]), 0) : (p.s8 ? nv(p.s8.totalCostFinal) : 0);
                const sSurplus = sRevs - sCosts;
                const sPct = sRevs > 0 ? (sSurplus / sRevs * 100) : 0;
                const met = sPct >= tgt;
                return (
                  <tr key={p.name}>
                    <td style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 10, height: 10, borderRadius: "50%", background: PAX_COLORS[i % PAX_COLORS.length], display: "inline-block", flexShrink: 0 }} />
                      {p.name}
                    </td>
                    <td style={{ textAlign: "right", fontFamily: "IBM Plex Mono" }}>{tgt >= 0 ? "+" : ""}{tgt.toFixed(1)}%</td>
                    <td style={{ textAlign: "right", fontFamily: "IBM Plex Mono", color: doNothingSurplus < 0 ? "#b83232" : "#2d7d46" }}>{fmtK(doNothingSurplus)}</td>
                    <td style={{ textAlign: "right", fontFamily: "IBM Plex Mono", color: "#b87a20" }}>{gap > 0 ? fmtK(gap) : "None"}</td>
                    <td style={{ textAlign: "right", fontFamily: "IBM Plex Mono", color: sSurplus >= 0 ? "#2d7d46" : "#b83232" }}>{fmtK(sSurplus)}</td>
                    <td style={{ textAlign: "right", fontFamily: "IBM Plex Mono", color: sPct >= tgt ? "#2d7d46" : "#b83232" }}>{sPct >= 0 ? "+" : ""}{sPct.toFixed(1)}%</td>
                    <td style={{ textAlign: "right", fontWeight: 600, color: met ? "#2d7d46" : "#b83232" }}>{met ? "✓" : "✗"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── TAB 2: REVENUE MIX ── */}
      {tab === "revmix" && (
        <div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
            {REV_SEGS.map(s => (
              <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#888" }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: s.color, flexShrink: 0 }} />
                {s.label}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {participants.map((p, i) => {
              const revs = p.s17Revs || {};
              const total = REV_SEGS.reduce((s, seg) => s + nv(revs[seg.id]), 0) || 1;
              return (
                <div key={p.name} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, width: 120, flexShrink: 0 }}>
                    <span style={{ width: 10, height: 10, borderRadius: "50%", background: PAX_COLORS[i % PAX_COLORS.length], flexShrink: 0 }} />
                    <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: "#666" }}>{p.name}</span>
                  </div>
                  <div style={{ flex: 1, display: "flex", height: 22, borderRadius: 3, overflow: "hidden" }}>
                    {REV_SEGS.map(seg => {
                      const pct = (nv(revs[seg.id]) / total) * 100;
                      return pct > 0.5 ? <div key={seg.id} style={{ width: pct + "%", background: seg.color, height: "100%" }} title={`${seg.label}: ${pct.toFixed(0)}%`} /> : null;
                    })}
                  </div>
                  <div style={{ fontFamily: "IBM Plex Mono", fontSize: 11, color: "#888", width: 60, textAlign: "right", flexShrink: 0 }}>{fmtK(total)}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── TAB 3: STRATEGIC TENSIONS ── */}
      {tab === "tensions" && (
        <div>
          <div style={{ fontSize: 11, color: "#888", marginBottom: 16 }}>Each dot = one participant. Spread = contested. Clustered = consensus.</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {PURPOSE_TENSIONS.map(t => {
              const vals = participants.map(p => nv(p.purposeTensions?.[t.key], 50));
              const spread = vals.length > 1 ? Math.max(...vals) - Math.min(...vals) : 0;
              const isContested = spread > 30;
              return (
                <div key={t.key}>
                  <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, color: "#888", marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
                    {t.desc}
                    <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 3, fontWeight: 500, background: isContested ? "#fff3cd" : "#d1e7dd", color: isContested ? "#856404" : "#0a5c36" }}>
                      {isContested ? "Contested" : "Consensus"}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, width: 110, textAlign: "right", color: "#888", flexShrink: 0 }}>{t.l}</span>
                    <div style={{ flex: 1, position: "relative", height: 24 }}>
                      <div style={{ position: "absolute", top: "50%", left: 0, right: 0, height: 1, background: "#d8d3cb" }} />
                      {participants.map((p, i) => {
                        const v = nv(p.purposeTensions?.[t.key], 50);
                        return (
                          <div key={p.name} title={p.name} style={{ position: "absolute", left: v + "%", top: "50%", width: 12, height: 12, borderRadius: "50%", background: PAX_COLORS[i % PAX_COLORS.length], transform: "translate(-50%,-50%)", opacity: 0.9 }} />
                        );
                      })}
                    </div>
                    <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, width: 110, color: "#888", flexShrink: 0 }}>{t.r}</span>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 20 }}>
            {participants.map((p, i) => (
              <div key={p.name} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#888" }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: PAX_COLORS[i % PAX_COLORS.length] }} />
                {p.name}
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginTop: 32 }}>
        <button className="sl-btn" onClick={onConfirm}>Continue → Step 20: Finalise</button>
      </div>
    </div>
  );
}

/* ── STEP 20: FINALISE ────────────────────────────────────────────────────── */
function Step20Finalise({ pData, onBack }) {
  const [email, setEmail]   = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent]     = useState(false);
  const [err, setErr]       = useState("");

  const buildBody = () => {
    const tgt    = nv(pData.targetPct, 7.5);
    const why    = pData.purposeWhy || "—";
    const how    = pData.purposeHow || "—";
    const what   = pData.purposeWhat || "—";
    const s17R   = pData.s17Revs  ? REV_LINES.reduce((s, l) => s + nv(pData.s17Revs[l.id]), 0)  : 0;
    const s17C   = pData.s17Costs ? COST_LINES.reduce((s, l) => s + nv(pData.s17Costs[l.id]), 0) : 0;
    const s17Sur = s17R - s17C;
    const s17Pct = s17R > 0 ? (s17Sur / s17R * 100).toFixed(1) : "—";
    return `FBaM Strategy Lab — ${pData.name}\n\nTARGET: ${tgt}%\nSCENARIO: Revenue ${fmtK(s17R)} | Costs ${fmtK(s17C)} | Surplus ${fmtK(s17Sur)} (${s17Pct}%)\n\nWHY: ${why}\nHOW: ${how}\nWHAT: ${what}\n\nRevenue:\n${REV_LINES.map(l => `  ${l.name}: ${fmtK(nv(pData.s17Revs?.[l.id]))}`).join("\n")}\n\nCosts:\n${COST_LINES.map(l => `  ${l.name}: ${fmtK(nv(pData.s17Costs?.[l.id]))}`).join("\n")}`;
  };

  const sendEmail = async () => {
    if (!email.includes("@")) { setErr("Please enter a valid email address."); return; }
    setSending(true);
    try {
      await callAI(`Data submission — acknowledge only.\n\nTO: results@changebefore.com, ${email}\nSUBJECT: FBaM Strategy Lab — ${pData.name}\n\n${buildBody()}`);
      setSent(true);
    } catch (e) { setErr("Could not send — please print instead."); }
    setSending(false);
  };

  return (
    <div className="sl-content">
      <BackBtn onClick={onBack} />
      <div className="sl-step-h">Finalise</div>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap", marginTop: 8 }}>
        <button className="sl-btn no-print" onClick={() => window.print()}>Print / Save as PDF</button>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type="email" className="sl-input" style={{ width: 220 }} placeholder="Your email address"
            value={email} onChange={e => { setEmail(e.target.value); setErr(""); }} />
          <button className="sl-btn sl-btn-outline no-print" disabled={sending} onClick={sendEmail}>
            {sending ? "Sending…" : "Email results"}
          </button>
        </div>
      </div>
      {err && <div className="sl-err" style={{ marginTop: 12 }}>{err}</div>}
      {sent && <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: "#2d7d46", marginTop: 12 }}>✓ Sent to {email} and results@changebefore.com</div>}
    </div>
  );
}


export default function StrategyLab() {
  const [view, setView]   = useState("entry");
  const [pName, setPName] = useState("");
  const [tick, setTick]   = useState(0);

  useEffect(() => { const id = setInterval(() => setTick(t => t + 1), 1000); return () => clearInterval(id); }, []);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      {view === "entry" && <Entry onEnter={n => { setPName(n); setView("participant"); }} onFacilitator={() => setView("facLogin")} />}
      {view === "facLogin" && <FacilitatorLogin onLogin={() => setView("facilitator")} onBack={() => setView("entry")} />}
      {view === "participant" && <ParticipantView name={pName} tick={tick} onLogout={() => setView("entry")} />}
      {view === "facilitator" && <FacilitatorView tick={tick} onLogout={() => setView("entry")} />}
    </>
  );
}
