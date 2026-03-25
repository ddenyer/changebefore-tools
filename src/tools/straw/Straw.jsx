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
    const resp = await fetch("/api/sl-load?sessionId=" + encodeURIComponent(STORE.sessionId) + "&t=" + Date.now());
    if (!resp.ok) return;
    const { participants } = await resp.json();
    participants.forEach(p => {
      if (!p.name || p._wiped) return;
      // Never overwrite your own data (STORE.myName set on login)
      if (p.name === STORE.myName) return;
      // Never overwrite a local tombstone — wipe may not have landed on Supabase yet
      if (STORE.participants[p.name]?._wiped) return;
      // For everyone else — always update from Supabase so comparison stays live
      STORE.participants[p.name] = p;
    });
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
const STEP_NAMES    = ["1. Set goal","2. Revenue","3. Costs","4. Current position","5. Market context","6. Predicted revenues","7. Predicted costs","8. Prognosis","→ Section one","10. Who FBaM serves","11. Positioning","12. Changes","→ Section two","14. Close the gap","15. Theme P&L","16. Comparison","17. Finalise"];

/* ── PURPOSE TOOL DATA ──────────────────────────────────────────────────── */
const PURPOSE_GROUPS = [
  "FT students (MSc, MBA)",
  "PT students (MSc MBA)",
  "Exec education delegates",
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
  { key:"research",   l:"Teaching intensive",  r:"Research intensive",  desc:"Where should FBaM invest most?" },
  { key:"theory",     l:"Applied / impact",    r:"Theory led",          desc:"How should knowledge be generated and shared?" },
  { key:"experience", l:"Post-experience",     r:"Pre-experience",      desc:"Who should be the primary customers?" },
  { key:"market",     l:"High-end executive",  r:"Mass market",         desc:"Which end of the market should FBaM target?" },
  { key:"geography",  l:"International",       r:"Domestic",            desc:"Where should the focus be?" },
  { key:"profit",     l:"Grow revenue",        r:"Cut cost base",       desc:"What should be the primary route to improved financial position?" },
  { key:"breadth",    l:"Focused depth",       r:"Wide portfolio",      desc:"Should FBaM offer many programmes or fewer done exceptionally?" },
  { key:"staffing",   l:"Flexible staffing",   r:"Fixed staffing",      desc:"Should FBaM rely more on associates or invest in faculty and professional staff?" },
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
        model: "claude-sonnet-4-5-20250929",
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
  { id: "ft_msc",      label: "Postgraduate MSc & MBA (FT)",
    range: "−2% to 0% CAGR",
    fbamTrend: "Peaked £21.9m (22/23), now £16.3m — declining",
    fbamCurrent: "−26% vs last year. Poor Jan 2026 intake (4 students vs 10 forecast). Withdrawals continuing.",
    mid: -8,
    context: "Sector declining due to Graduate Route compression and £925 international student levy (Aug 2028). FBaM performing significantly below sector — Jan intake shortfall and withdrawal rate suggest structural demand problem, not cyclical. FBaM 5-year trend peaked 22/23 and is now reversing sharply. CAGR of −8% reflects continuation of current trajectory with modest stabilisation." },
  { id: "pt_levy",     label: "Apprenticeships / Levy",
    range: "Eliminated",
    fbamTrend: "Structural decline — last intakes completed",
    fbamCurrent: "Going to zero. Final Level 7 SLA intakes done. No further cohorts planned.",
    mid: -100,
    context: "Level 7 defunded Jan 2026. This income does not exist by 2028. Revenue at zero by mid-2027 at latest. Any residual is marginal employer self-funded activity." },
  { id: "exec_ed",     label: "Customised & Executive Education",
    range: "+6% to +9% sector CAGR",
    fbamTrend: "Consistent growth 18/19→24/25, +4.8% CAGR — but SLEP at risk",
    fbamCurrent: "−11% vs last year. 86% confirmed. SLEP/Non-Award Bearing (£2,798k) ending. PLP contract at risk at rebid 2026.",
    mid: -13,
    context: "Sector growing strongly (UNICON 2025) but FBaM loses SLEP/Non-Award Bearing (£2,798k) and faces PLP rebid risk. 5-year growth trend reverses sharply once these structural losses land. CAGR of −13% reflects confirmed SLEP loss and current confirmed income at only 86%. Adjust if you believe new contracts will replace SLEP volume." },
  { id: "open",        label: "Open Programmes",
    range: "+6% to +9% CAGR",
    fbamTrend: "Recovering from Covid low — below sector pace",
    fbamCurrent: "−11% vs last year. Below sector recovery trajectory.",
    mid: 4,
    context: "Sector growing strongly (UNICON 2024: 13% growth). FBaM recovering from Covid low but underperforming sector. Current trajectory −11% suggests execution constraints. CAGR of +4% reflects modest recovery below sector pace — adjust upward if you believe FBaM can close the gap to sector performance." },
  { id: "research_dd", label: "Research, Design & Development",
    range: "+1% to +2% nominal CAGR",
    fbamTrend: "+4.4% CAGR 18/19→24/25 — flat in real terms",
    fbamCurrent: "+40% vs last year (delivery risk — tight year-end delivery). UKRI settlement positive.",
    mid: 1,
    context: "UKRI four-year settlement provides ~2% nominal growth. Q2 shows +40% but year-end delivery flagged as tight by finance team — this may not land. FBaM holds 1.3% of UKRI funding with no structural improvement in sight. CAGR of +1% reflects long-run flat trajectory in real terms once Q2 delivery risk is discounted." },
  { id: "hefce",       label: "HEFCE & Allocated Research Funding",
    range: "+1% to +2% nominal CAGR",
    fbamTrend: "Flat 18/19→24/25",
    fbamCurrent: "−11% vs last year. QR allocated funding unlikely to be fully spent before year end.",
    mid: 1,
    context: "QR and allocated research funding broadly flat in real terms through 2028. Current year underspend does not signal structural decline — but equally there is no catalyst for material growth. CAGR of +1% reflects nominal funding settlement." },
  { id: "residences",  label: "Residences & Conference Facilities",
    range: "Linked to exec ed volume",
    fbamTrend: "−2.1% CAGR 18/19→24/25",
    fbamCurrent: "Follows exec ed — declining with customised programme volume.",
    mid: -8,
    context: "Residences moves directly with customised programme volume. Default of −8% reflects loss of SLEP residential programmes and overall exec ed decline. If you believe exec ed recovers, revise this upward in line with your exec ed assumption." },
  { id: "other_rev",   label: "Other income",
    range: "0% to +2%",
    fbamTrend: "Broadly stable",
    fbamCurrent: "Stable. Endowment, interest, miscellaneous income.",
    mid: 0,
    context: "Endowment, interest, Gift Aid, miscellaneous income. Broadly stable through the period. No structural change anticipated." },
];
const PART_PWD      = "FBAM-straw-03!";
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
.sl-brand{font-family:'DM Sans',sans-serif;font-weight:400;font-size:13px;letter-spacing:3px;text-transform:uppercase;color:#888;margin-bottom:8px;}
.sl-brand-sub{font-family:'Cormorant Garamond',serif;font-weight:400;font-size:32px;color:#1a1a1a;line-height:1.2;margin-bottom:6px;}
.sl-brand-org{font-family:'DM Sans',sans-serif;font-weight:400;font-size:13px;color:#888;margin-bottom:32px;}
.sl-overview{margin-bottom:32px;}
.sl-overview p{font-family:'DM Sans',sans-serif;font-weight:400;font-size:17px;line-height:1.7;color:#444;margin-bottom:16px;}
.sl-bullets{font-family:'DM Sans',sans-serif;font-weight:400;font-size:17px;line-height:1.7;color:#444;margin-bottom:20px;padding-left:0;list-style:none;}
.sl-bullets li{padding:4px 0 4px 20px;position:relative;}
.sl-bullets li:before{content:"—";position:absolute;left:0;color:#e07030;}
.sl-overview strong{font-family:'DM Sans',sans-serif;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:#1a1a1a;}
.sl-overview .sl-disc{border-top:1px solid #d8d3cb;padding-top:16px;margin-top:4px;font-family:'DM Sans',sans-serif;font-size:12px;font-weight:400;color:#888;line-height:1.7;}
.sl-overview .sl-disc strong{font-size:11px;font-weight:600;color:#1a1a1a;}
.sl-rule{border:none;border-top:1px solid #d8d3cb;margin:24px 0;}
.sl-label{display:block;font-family:'DM Sans',sans-serif;font-size:15px;font-weight:400;color:#1a1a1a;margin-bottom:8px;}
.sl-field{margin-bottom:20px;}
.sl-input{width:100%;padding:12px 14px;border:1px solid #d8d3cb;border-radius:4px;font-family:'DM Sans',sans-serif;font-size:15px;font-weight:400;color:#1a1a1a;background:#f0ede8;outline:none;transition:border-color 0.15s;}
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
.sl-step-lead{font-family:'DM Sans',sans-serif;font-size:17px;color:#666;line-height:1.7;margin-bottom:24px;}
.sl-prompt{border-left:3px solid #e07030;padding:12px 16px;margin-bottom:24px;font-family:'DM Sans',sans-serif;font-size:18px;color:#444;line-height:1.7;background:#ebe7e1;}
.sl-note-box{background:#ebe7e1;border:1px solid #d8d3cb;border-radius:4px;padding:12px 14px;font-family:'DM Sans',sans-serif;font-size:14px;color:#666;line-height:1.7;margin-bottom:24px;}
/* Table */
.sl-tbl{width:100%;border-collapse:collapse;margin-bottom:24px;}
.sl-tbl th{font-family:'DM Sans',sans-serif;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:#888;padding:8px 12px;border-bottom:2px solid #d8d3cb;text-align:left;background:#f0ede8;}
.sl-tbl th.right{text-align:right;}
.sl-tbl td{padding:10px 12px;border-bottom:1px solid #e8e4de;vertical-align:top;background:#f0ede8;}
.sl-tbl tr:last-child td{border-bottom:none;}
.sl-tbl .tbl-name{font-family:'DM Sans',sans-serif;font-size:14px;font-weight:500;color:#1a1a1a;margin-bottom:3px;}
.sl-tbl .tbl-note{font-family:'DM Sans',sans-serif;font-size:12px;color:#999;line-height:1.5;}
.sl-num-input{font-family:'IBM Plex Mono',monospace;font-size:15px;font-weight:400;color:#1a1a1a;border:1px solid #d8d3cb;border-radius:4px;padding:6px 8px;width:90px;text-align:right;background:#f0ede8;}
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
.sl-pred-input{font-family:'IBM Plex Mono',monospace;font-size:14px;font-weight:400;color:#1a1a1a;border:1px solid #d8d3cb;border-radius:4px;padding:5px 6px;width:80px;text-align:right;background:#f0ede8;}
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
.sl-gap-statement{font-family:'DM Sans',sans-serif;font-size:17px;color:#1a1a1a;line-height:1.7;}
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
function Entry({ onEnter }) {
  const [pwd, setPwd]   = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [name, setName] = useState("");
  const [session, setSession] = useState("Exec250326a");
  const [err, setErr]   = useState("");
  const canEnter = pwd === PART_PWD && name.trim().length > 0 && session.trim().length > 0;

  const go = () => {
    if (pwd !== PART_PWD) { setErr("Incorrect password."); return; }
    if (!name.trim()) { setErr("Please enter your name."); return; }
    if (!session.trim()) { setErr("Please enter the session code."); return; }
    STORE.sessionId = session.trim();
    onEnter(name.trim());
  };

  return (
    <div className="sl">
      <div className="sl-entry">
        <div className="sl-brand">Strategy Lab</div>
        <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: "#e07030", background: "#fdf5f0", border: "1px solid #e07030", borderRadius: 4, padding: "8px 12px", marginBottom: 16 }}>This is a prototype diagnostic tool, designed for FBaM, Cranfield University. It has not been fully tested. There are likely to be errors and glitches.</div>
        <div className="sl-brand-sub">STRAWPERSON Scenario Tool</div>
        <div className="sl-brand-org">Cranfield University — Faculty of Business and Management</div>
        <div className="sl-overview">
          <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 20, color: "#1a1a1a", lineHeight: 1.6, marginBottom: 20, paddingBottom: 16, borderBottom: "1px solid #d8d3cb" }}>
            <span style={{ fontStyle: "italic" }}>"All models are wrong, but some are useful."</span>
            <span style={{ display: "block", fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: "#888", marginTop: 6 }}>— George Box (1976)</span>
            <span style={{ display: "block", fontFamily: "'DM Sans',sans-serif", fontSize: 14, color: "#666", lineHeight: 1.7, marginTop: 10 }}>Instead of seeking perfectly accurate models — which is often impossible — we should focus on using simplified models that are good enough to be helpful.</span>
          </div>
          <p>Strategic conversations often feel more aligned than they are. Each person at the table carries a different sense of what the financial future looks like — different assumptions about what revenues are achievable, what costs are controllable, and what the structural shifts already in motion actually mean. When those assumptions stay implicit, it is easy to mistake surface agreement for genuine alignment. This tool surfaces the assumptions before they become decisions.</p>
          <ul className="sl-bullets">
            <li>Build a high level financial strawperson</li>
            <li>Work through revenues, costs, and the structural shifts already in motion</li>
            <li>Close the gap between the do-nothing trajectory and a position you can defend</li>
            <li>Compare your scenario with the rest of the group — the disagreements are the conversation</li>
            <li>takes around 60–90 minutes</li>
          </ul>
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

        {err && <div className="sl-err">{err}</div>}
        <button className="sl-btn" disabled={!canEnter} onClick={go}>Enter the workshop</button>

      </div>
    </div>
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
      <div className="sl-prompt">Before we look at the numbers, agree your target. This is what you think is genuinely achievable by 31 July 2028.</div>
      <div className="sl-note-box">31 July 2028 is chosen as it is FBaM's year end and levy funding should have ended post EPA submissions.</div>
      <div className="sl-slider-wrap">
        <div className="sl-slider-val">{val >= 0 ? "+" : ""}{val.toFixed(1)}%</div>
        <div className="sl-slider-desc">{desc()}</div>
        <input type="range" className="sl-slider" min="-10" max="10" step="0.5" value={val}
          onChange={e => setVal(parseFloat(e.target.value))} />
        <div className="sl-slider-range"><span>−10%</span><span>0%</span><span>+10%</span></div>
      </div>
      <button className="sl-btn" onClick={doConfirm}>Confirm target → Step 2: Revenue</button>
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
      <div className="sl-prompt">These are the Q2 2025/26 forecasts. Please check the figures and change any figures you think are inaccurate or are likely to change.</div>
      <div className="sl-note-box">All figures are Q2 2025/26 forecasts (£k). Edit any line you disagree with.</div>
      <ForecastImageRef />
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
      <button className="sl-btn" onClick={doConfirm}>Lock Revenue → Step 3: Costs</button>
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
      <div className="sl-prompt">These are the Q2 2025/26 forecasts. Please check the figures and change any figures you think are inaccurate or are likely to change. The university service charge is the final line — the TRAC adjusted service charge is not yet available.</div>
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
      <button className="sl-btn" onClick={doConfirm}>Lock Costs → Step 4: Current position</button>
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
      <div className="sl-prompt">This is where we start. Agreed numbers, agreed surplus. Before we project forward, make sure you recognise this picture. If anything is inaccurate, use the back button and correct it.</div>
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
      <button className="sl-btn" onClick={doConfirm}>Lock current position → Step 5: Market trends</button>
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
      <div className="sl-step-h">Market trends and FBaM trajectory</div>
      <div className="sl-prompt">This section shows sector trends on CAGR (compound annual growth rate). It also shows longer term and recent FBaM trends.</div>
      <div className="sl-note-box">Sector benchmarks based on HESA, UKRI, UNICON and OfS data.</div>

      <div style={{ overflowX: "auto" }}>
        <table className="sl-tbl" style={{ minWidth: 700 }}>
          <thead><tr>
            <th style={{ minWidth: 160 }}>Revenue stream</th>
            <th className="right" style={{ width: 120 }}>Sector CAGR</th>
            <th className="right" style={{ width: 150 }}>FBaM 5-year trend</th>
            <th className="right" style={{ width: 160 }}>FBaM current trajectory</th>
            <th className="right" style={{ width: 90 }}>FBaM CAGR %</th>
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
                  <td style={{ textAlign: "right", fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: "#888", verticalAlign: "top" }}>{b.range}</td>
                  <td style={{ textAlign: "right", fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: "#666", verticalAlign: "top" }}>{b.fbamTrend}</td>
                  <td style={{ textAlign: "right", fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: "#666", verticalAlign: "top" }}>{b.fbamCurrent}</td>
                  <td style={{ textAlign: "right", verticalAlign: "top" }} onClick={e => e.stopPropagation()}>
                    <input type="number" className="sl-pred-input" step="0.5"
                      value={rates[b.id]}
                      onChange={e => setRates(r => ({ ...r, [b.id]: e.target.value }))}
                      style={{ width: 80 }}
                    />
                  </td>
                </tr>
                {expanded[b.id] && (
                  <tr key={`${b.id}-ctx`}>
                    <td colSpan={5} style={{ background: "#ebe7e1", padding: "8px 12px" }}>
                      <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: "#666", lineHeight: 1.6 }}><strong>Benchmark context:</strong> {b.context}</div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>

      <div className="sl-note-box" style={{ marginTop: 8 }}>
        Edit any FBaM CAGR figure. Your rates carry forward into predicted revenues (Step 6). CAGR = compound annual growth rate — the rate applied over the period Jul 2025 → Jul 2028.
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
      <div className="sl-prompt">This is where we end up if nothing changes. Predicted revenues minus predicted costs. Compare it to your goal.</div>
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
      <button className="sl-btn" onClick={doConfirm}>Confirm prognosis → Section one complete</button>
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
      <div className="sl-prompt">You cannot submit until the numbers balance. Work through sections A, B and C. The gap strip updates in real time.</div>

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
      <div className="sl-prompt">Rank each scenario on financial credibility — how likely is it to work — and on purpose alignment — how well does it describe the FBaM you want to lead.</div>
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
      <div className="sl-prompt">Before you allocate revenue, declare your direction for each line. Then build your mix. This is your strategic intent — not a financial model.</div>

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


/* ── FORECAST IMAGE REF (Step 2) ──────────────────────────────────────────── */
function ForecastImageRef() {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginBottom: 20 }}>
      <button className="sl-btn sl-btn-outline" style={{ fontSize: 12, padding: "8px 14px" }} onClick={() => setOpen(o => !o)}>
        {open ? "▲ Hide forecast" : "▼ REVEAL SOM QTR 2 FORECAST 2025/2026"}
      </button>
      {open && (
        <div style={{ marginTop: 12, border: "1px solid #d8d3cb", borderRadius: 4, overflow: "hidden" }}>
          <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, color: "#888", padding: "8px 12px", background: "#ebe7e1" }}>SOM QTR 2 FORECAST 2025/2026</div>
          <img src="/fbam-q2-forecast.png" alt="SOM Q2 Forecast 2025/26" style={{ width: "100%", display: "block" }} />
        </div>
      )}
    </div>
  );
}

/* ── TRANSITION SCREEN ────────────────────────────────────────────────────── */
function TransitionScreen({ heading, body, onContinue, continueLabel, onBack }) {
  return (
    <div className="sl-content" style={{ maxWidth: 600, paddingTop: 80 }}>
      {onBack && <BackBtn onClick={onBack} />}
      <div style={{ fontFamily: "'Cormorant Garamond',serif", fontWeight: 400, fontSize: 36, color: "#1a1a1a", marginBottom: 24 }}>{heading}</div>
      <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 17, color: "#444", lineHeight: 1.7, marginBottom: 40 }}>{body}</div>
      <button className="sl-btn" onClick={onContinue}>{continueLabel || "Continue →"}</button>
    </div>
  );
}

/* ── STEP 11: CHANGES ─────────────────────────────────────────────────────── */
function Step11Changes({ pData, confirmed, onConfirm, onBack }) {
  const [statements, setStatements] = useState(pData.s11Statements || []);
  const [ownText, setOwnText] = useState("");
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(pData.s11Statements?.length > 0);

  const tgt = nv(pData.targetPct, 7.5);
  const { total: predRev } = calcPredRevs(pData);
  const { total: predCost } = calcPredCosts(pData);
  const gap = (predRev * tgt / 100) - (predRev - predCost);
  const profitSlider = nv(pData.purposeTensions?.profit, 50);
  const isCostFocused = profitSlider > 55;

  const buildPrompt = (keepStatements) => {
    const pos = pData.purposeTensions ? getPositionSummary(pData.purposeTensions) : "not specified";
    const groups = getGroupSummary(pData.purposeGroups || {});
    const keepContext = keepStatements.length > 0
      ? `

Already selected (keep these in mind, do NOT repeat them):
${keepStatements.map((s,i) => `${i+1}. ${s.text}`).join("\n")}`
      : "";
    const serviceChargeNote = isCostFocused
      ? "\n- The user has positioned FBaM toward cost reduction. INCLUDE a service charge renegotiation option (e.g. 'Renegotiate the university service charge from £10.3m to £Xm — without this the contribution target cannot be reached without eliminating entire programme areas.')."
      : `
- The user has positioned FBaM toward revenue growth. Only include service charge renegotiation if the gap of £${Math.round(gap)}k cannot plausibly be closed by revenue alone.`;

    return `You are simultaneously a world-leading strategy consultant, a world-leading management accountant, a world-leading finance expert, and a world-leading accountant advising Cranfield University's Faculty of Business and Management (FBaM).

FINANCIAL CONTEXT:
- Do-nothing revenue by July 2028: £${Math.round(predRev)}k
- Do-nothing costs: £${Math.round(predCost)}k
- Do-nothing surplus: £${Math.round(predRev - predCost)}k (${predRev > 0 ? ((predRev - predCost)/predRev*100).toFixed(1) : 0}%)
- Target surplus: ${tgt}%
- Gap to close: £${Math.round(gap)}k

STRATEGIC CHOICES:
- Positioning: ${pos}
- Priority stakeholders (8-9 rated): ${groups}
- Strategic orientation: ${isCostFocused ? "COST REDUCTION focused" : "REVENUE GROWTH focused"}
${serviceChargeNote}${keepContext}

Generate exactly 10 strategic direction statements that would help close this gap. STRICT RULES:
- Stay at the WHAT and WHY level — no specific course names, no programme titles, no operational detail
- Name the revenue stream or activity TYPE (e.g. "executive education", "open programmes", "research income") but NEVER name specific programmes
- Include scale — say by how much (e.g. "grow executive education by approximately 40%", "reduce headcount cost by £Xm")
- Include market reality: if a revenue stream has low CAGR (e.g. award-bearing FT MSc, open programmes) explicitly note that growth requires taking market share, not a growing market
- IMPORTANT: Customised and Executive Education is a HIGH GROWTH sector (+6% to +9% sector CAGR). The overall exec_ed line looks poor because it includes SLEP/Non-Award Bearing income that is ending (£2,798k) and levy income going to zero. The underlying CED customised and cabinet office income is healthy. When suggesting exec ed growth, be clear that the sector is growing strongly and this is a realistic opportunity — but growth must compensate for the structural SLEP/levy loss on top of hitting the gap target
- If the growth required is very large, flag the scale of ambition required explicitly
- If exec ed growth is needed to compensate for levy income loss, say so explicitly
- If a change is substantial (e.g. doubling exec ed), flag the scale of ambition required
- Be directionally honest — not optimistic generic statements
- Max 45 words per statement

Format: number each 1-10, one per line, no other text.`;
  };

  const generate = async (keep) => {
    setLoading(true);
    try {
      const txt = await callAI(buildPrompt(keep), 20000);
      const lines = txt.split("\n")
        .map(l => l.replace(/^\d+\.\s*/, "").trim())
        .filter(l => l.length > 10)
        .slice(0, 10);
      const needed = Math.max(0, 10 - keep.length);
      const newStmts = lines.slice(0, needed).map(text => ({ text, checked: false, own: false }));
      setStatements([...keep, ...newStmts]);
      setGenerated(true);
    } catch (e) {
      setStatements([...keep, { text: "Could not generate — check your connection and try again.", checked: false, own: false }]);
    }
    setLoading(false);
  };

  const toggleCheck = (i) => {
    setStatements(prev => prev.map((s, j) => j === i ? { ...s, checked: !s.checked } : s));
  };

  const handleGenerate = () => {
    const keep = statements.filter(s => s.checked || s.own);
    generate(keep);
  };

  const addOwn = () => {
    if (!ownText.trim()) return;
    setStatements(prev => [...prev, { text: ownText.trim(), checked: true, own: true }]);
    setOwnText("");
  };

  const doConfirm = () => {
    const selected = statements.filter(s => s.checked || s.own);
    pSave(pData.name, { s11Statements: statements, s11Selected: selected, step11Confirmed: true });
    onConfirm();
  };

  return (
    <div className="sl-content">
      <BackBtn onClick={onBack} />
      {confirmed && <ConfirmedBanner stepN={11} />}
      <div className="sl-step-h">Changes</div>
      <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Suggested changes</div>
      <div className="sl-prompt">Based on your inputs so far — here are a set of changes that could help to close the gap from the current position to the July 2028 desirable position.</div>
      <div className="sl-note-box">Tick the changes you agree with. Click Generate to replace unchecked items with new suggestions — your ticked items are kept. You can also add your own — they will be automatically selected.</div>

      {!generated && !loading && (
        <button className="sl-btn" style={{ marginBottom: 24 }} onClick={() => generate([])}>
          Generate suggested changes
        </button>
      )}

      {loading && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "20px 0", fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: "#888" }}>
          <div style={{ width: 16, height: 16, border: "2px solid #d8d3cb", borderTopColor: "#e07030", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
          Analysing your strategic choices and financial position…
        </div>
      )}

      {generated && !loading && (
        <div style={{ marginBottom: 24 }}>
          {statements.map((s, i) => (
            <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 10, padding: "12px 14px", background: s.checked || s.own ? "#f0faf4" : "#f0ede8", border: `1px solid ${s.checked || s.own ? "#2d7d46" : "#d8d3cb"}`, borderRadius: 4 }}>
              <input type="checkbox" checked={s.checked || s.own} onChange={() => !s.own && toggleCheck(i)}
                style={{ marginTop: 3, flexShrink: 0, accentColor: "#e07030", width: 16, height: 16 }} />
              <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, color: "#1a1a1a", lineHeight: 1.6 }}>
                {s.own && <span style={{ fontSize: 10, fontWeight: 600, color: "#e07030", textTransform: "uppercase", letterSpacing: 1, marginRight: 8 }}>Yours</span>}
                {s.text}
              </span>
            </div>
          ))}

          <div style={{ display: "flex", gap: 8, marginTop: 16, marginBottom: 8 }}>
            <button className="sl-btn sl-btn-outline" style={{ fontSize: 12, padding: "8px 14px" }} onClick={handleGenerate}>
              Generate new suggestions
            </button>
          </div>
          <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: "#aaa" }}>Ticked items are kept. Unticked items are replaced with new suggestions.</div>
        </div>
      )}

      {generated && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600, color: "#1a1a1a", marginBottom: 8 }}>Add your own</div>
          <div style={{ display: "flex", gap: 8 }}>
            <input type="text" className="sl-input" style={{ flex: 1 }}
              placeholder="Type a change you want to add — it will be automatically selected…"
              value={ownText} onChange={e => setOwnText(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addOwn()} />
            <button className="sl-btn" style={{ fontSize: 12, padding: "8px 16px", flexShrink: 0 }} onClick={addOwn}>Add</button>
          </div>
        </div>
      )}

      {generated && (
        <button className="sl-btn" onClick={doConfirm}
          disabled={statements.filter(s => s.checked || s.own).length === 0}>
          Confirm changes → Section two complete
        </button>
      )}
    </div>
  );
}

/* ── STEP 12: CLOSE THE GAP (AI-built P&L) ────────────────────────────────── */
function Step12CloseGap({ pData, confirmed, onConfirm, onBack }) {
  const { total: predRev, predRevs } = calcPredRevs(pData);
  const { total: predCost, predCosts } = calcPredCosts(pData);
  const tgt = nv(pData.targetPct, 7.5);
  const baseGap = (predRev * tgt / 100) - (predRev - predCost);

  const [aiNarrative, setAiNarrative] = useState(pData.s12Narrative || null);
  const [revs, setRevs] = useState(pData.s12Revs || null);
  const [costs, setCosts] = useState(pData.s12Costs || null);
  const [loading, setLoading] = useState(false);
  const [loadStarted, setLoadStarted] = useState(false);

  const selectedChanges = pData.s11Selected || pData.s11Statements?.filter(s => s.checked || s.own) || [];

  const totalRev  = revs ? REV_LINES.reduce((s, l) => s + nv(revs[l.id]), 0) : predRev;
  const totalCost = costs ? COST_LINES.reduce((s, l) => s + nv(costs[l.id]), 0) : predCost;
  const surplus    = totalRev - totalCost;
  const surplusPct = totalRev > 0 ? (surplus / totalRev * 100) : 0;
  const gap        = (totalRev * tgt / 100) - surplus;

  const buildPrompt = () => {
    const pos = pData.purposeTensions ? getPositionSummary(pData.purposeTensions) : "not specified";
    const groups = getGroupSummary(pData.purposeGroups || {});
    const changesCtx = selectedChanges.length > 0
      ? `Selected strategic changes:
${selectedChanges.map((s,i) => `${i+1}. ${s.text}`).join("\n")}`
      : "No strategic changes selected.";
    const profitSlider = nv(pData.purposeTensions?.profit, 50);
    return `You are simultaneously a world-leading strategy consultant, a world-leading management accountant, a world-leading finance expert, and a world-leading accountant advising Cranfield University's Faculty of Business and Management (FBaM).

Build a complete financially viable P&L for FBaM by July 2028.

CRITICAL FINANCIAL TARGET:
- Net surplus as % of total revenue (after ALL costs including university service charge) must be at least ${tgt}%
- Required surplus: £${Math.round(predRev * tgt / 100)}k
- Gap to close from do-nothing trajectory: £${Math.round(baseGap)}k

DO-NOTHING TRAJECTORY:
- Revenue: ${REV_LINES.map(l => `${l.name} £${Math.round(nv(predRevs[l.id]))}k`).join(", ")}
- Total revenue: £${Math.round(predRev)}k
- Costs: ${COST_LINES.map(l => `${l.name} £${Math.round(nv(predCosts[l.id]))}k`).join(", ")}
- Total costs: £${Math.round(predCost)}k
- Do-nothing surplus: £${Math.round(predRev - predCost)}k (${predRev > 0 ? ((predRev - predCost)/predRev*100).toFixed(1) : 0}%)

STRATEGIC CONTEXT:
- Positioning: ${pos}
- Priority stakeholders: ${groups}
- Strategic orientation: ${profitSlider > 55 ? "COST REDUCTION focused" : "REVENUE GROWTH focused"}

${changesCtx}

HARD CONSTRAINTS:
- pt_levy MUST be 0 (Level 7 eliminated)
- The model must be internally coherent with the strategic positioning
- All figures must be positive integers in £k
- The sum of all revenue lines minus sum of all cost lines must be at least £${Math.round(predRev * tgt / 100)}k

Respond ONLY in this exact JSON format:
{
  "narrative": "2-3 sentence explanation of the strategic logic — which revenue lines were grown and why, which costs were cut and why, how this is coherent with the positioning choices",
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
}`;
  };

  const generateModel = async () => {
    setLoading(true);
    try {
      const txt = await callAI(buildPrompt(), 25000);
      const clean = txt.replace(/\`\`\`json|\`\`\`/g, "").trim();
      const parsed = JSON.parse(clean);
      const newRevs = {}; REV_LINES.forEach(l => newRevs[l.id] = String(Math.round(nv(parsed.revs?.[l.id], nv(predRevs[l.id])))));
      const newCosts = {}; COST_LINES.forEach(l => newCosts[l.id] = String(Math.round(nv(parsed.costs?.[l.id], nv(predCosts[l.id])))));
      newRevs["pt_levy"] = "0";
      // Verify surplus meets target
      const aiRev = REV_LINES.reduce((s, l) => s + nv(newRevs[l.id]), 0);
      const aiCost = COST_LINES.reduce((s, l) => s + nv(newCosts[l.id]), 0);
      const aiSurplus = aiRev - aiCost;
      const reqSurplus = aiRev * tgt / 100;
      if (aiSurplus < reqSurplus) {
        const shortfall = Math.ceil(reqSurplus - aiSurplus) + 50;
        newRevs["exec_ed"] = String(nv(newRevs["exec_ed"]) + shortfall);
      }
      setRevs(newRevs);
      setCosts(newCosts);
      setAiNarrative(parsed.narrative || "Strategic scenario built based on your inputs.");
      pSave(pData.name, { s12Revs: newRevs, s12Costs: newCosts, s12Narrative: parsed.narrative });
    } catch (e) {
      setAiNarrative("Could not build model automatically — please adjust the figures below manually.");
      const initRevs = {}; REV_LINES.forEach(l => initRevs[l.id] = String(Math.round(nv(predRevs[l.id]))));
      const initCosts = {}; COST_LINES.forEach(l => initCosts[l.id] = String(Math.round(nv(predCosts[l.id]))));
      setRevs(initRevs);
      setCosts(initCosts);
    }
    setLoading(false);
  };

  // Auto-generate on mount if no existing data
  if (!loadStarted && !revs && !loading) {
    setLoadStarted(true);
    generateModel();
  }

  const applyToStore = () => {
    pSave(pData.name, { s17Revs: revs, s17Costs: costs, s12Revs: revs, s12Costs: costs, s12Narrative: aiNarrative, step17Confirmed: true });
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
      {confirmed && <ConfirmedBanner stepN={12} />}
      <div className="sl-step-h">Close the gap</div>
      <div className="sl-prompt">Based on your strategic choices, here is your strawperson revenue and cost structure to ensure both coherence and financial viability by July 2028. You can edit the figures.</div>

      {loading && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "32px 0", fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: "#888" }}>
          <div style={{ width: 16, height: 16, border: "2px solid #d8d3cb", borderTopColor: "#e07030", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
          Building your strawperson financial model…
        </div>
      )}

      {!loading && revs && (
        <>
          {/* Narrative */}
          {aiNarrative && (
            <div style={{ background: "#ebe7e1", borderLeft: "3px solid #e07030", padding: "14px 16px", marginBottom: 20, fontFamily: "'DM Sans',sans-serif", fontSize: 14, color: "#444", lineHeight: 1.7 }}>
              {aiNarrative}
            </div>
          )}

          {/* Selected changes reference */}
          {selectedChanges.length > 0 && (
            <div style={{ marginBottom: 20, padding: "12px 14px", background: "#f0faf4", border: "1px solid #d8d3cb", borderRadius: 4 }}>
              <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, color: "#888", marginBottom: 8 }}>Selected changes (from Step 11)</div>
              {selectedChanges.map((s, i) => (
                <div key={i} style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: "#444", lineHeight: 1.5, marginBottom: 4 }}>
                  <span style={{ color: "#e07030", marginRight: 6 }}>→</span>{s.text}
                </div>
              ))}
            </div>
          )}

          {/* KPI strip */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 24 }}>
            <KpiTile label="Total revenue" value={revs ? `£${Math.round(totalRev/1000).toLocaleString()}m` : "—"} color="#1a1a1a" />
            <KpiTile label="Total costs" value={costs ? `£${Math.round(totalCost/1000).toLocaleString()}m` : "—"} color="#1a1a1a" />
            <KpiTile label="Surplus" value={revs ? `£${Math.round(surplus).toLocaleString()}k` : "—"} sub={surplusPct.toFixed(1) + "%"} color={surplus >= 0 ? "#2d7d46" : "#b83232"} />
            <KpiTile label={gap > 0 ? "Gap remaining" : "Over target"} value={revs ? `£${Math.round(Math.abs(gap)).toLocaleString()}k` : "—"} color={gap > 0 ? "#b83232" : "#2d7d46"} />
          </div>

          {/* Editable tables */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 24 }}>
            <div>
              <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, color: "#888", marginBottom: 10 }}>Revenue by July 2028 (£k)</div>
              {REV_LINES.map(l => {
                const base = nv(predRevs[l.id]);
                const cur  = revs ? nv(revs[l.id]) : base;
                const diff = cur - base;
                return (
                  <div key={l.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, paddingBottom: 8, borderBottom: "1px solid #e8e4de" }}>
                    <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: "#1a1a1a", flex: 1 }}>{l.name}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {diff !== 0 && <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: diff > 0 ? "#2d7d46" : "#b83232" }}>{diff > 0 ? "+" : ""}{Math.round(diff)}</span>}
                      <input type="number" className="sl-pred-input" value={revs ? revs[l.id] : ""} onChange={e => setRevs(r => ({ ...r, [l.id]: e.target.value }))} style={{ width: 75 }} />
                    </div>
                  </div>
                );
              })}
              <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderTop: "2px solid #1a1a1a" }}>
                <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600 }}>Total</span>
                <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontWeight: 700, color: "#1a1a1a" }}>{revs ? `£${Math.round(totalRev).toLocaleString()}k` : "—"}</span>
              </div>
            </div>
            <div>
              <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, color: "#888", marginBottom: 10 }}>Costs by July 2028 (£k)</div>
              {COST_LINES.map(l => {
                const base = nv(predCosts[l.id]);
                const cur  = costs ? nv(costs[l.id]) : base;
                const diff = cur - base;
                return (
                  <div key={l.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, paddingBottom: 8, borderBottom: "1px solid #e8e4de" }}>
                    <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: "#1a1a1a", flex: 1 }}>{l.name}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {diff !== 0 && <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: diff > 0 ? "#b83232" : "#2d7d46" }}>{diff > 0 ? "+" : ""}{Math.round(diff)}</span>}
                      <input type="number" className="sl-pred-input" value={costs ? costs[l.id] : ""} onChange={e => setCosts(d => ({ ...d, [l.id]: e.target.value }))} style={{ width: 75 }} />
                    </div>
                  </div>
                );
              })}
              <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderTop: "2px solid #1a1a1a" }}>
                <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600 }}>Total</span>
                <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontWeight: 700, color: "#1a1a1a" }}>{costs ? `£${Math.round(totalCost).toLocaleString()}k` : "—"}</span>
              </div>
            </div>
          </div>

          {gap > 500 && <div className="sl-note-box" style={{ borderColor: "#e07030" }}>Gap still open: £{Math.round(gap).toLocaleString()}k. Adjust figures above or regenerate the model.</div>}

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <button className="sl-btn sl-btn-outline" style={{ fontSize: 12, padding: "8px 14px" }} onClick={generateModel}>Regenerate model</button>
            <button className="sl-btn" onClick={applyToStore}>Confirm scenario → Step 13: Theme P&L</button>
          </div>
        </>
      )}
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
      <div className="sl-prompt">Based on your strategic choices, what does the revenue and cost structure need to look like to be both coherent and financially viable by July 2028?</div>

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

const PRODUCT_CATS = [
  { id: "exec_ed",    label: "Customised / Exec Ed",   color: "#e07030" },
  { id: "open",       label: "Open Programmes",        color: "#2d7d46" },
  { id: "award",      label: "Award-Bearing",          color: "#1a4fa0" },
  { id: "research",   label: "Research & Development", color: "#b87a20" },
  { id: "other",      label: "Residences & Other",     color: "#888" },
];

const DEFAULT_MIXES = {
  btg:   { exec_ed: 55, open: 20, award: 10, research: 10, other: 5 },
  psl:   { exec_ed: 30, open: 35, award: 20, research: 10, other: 5 },
  scpss: { exec_ed: 25, open: 15, award: 30, research: 20, other: 10 },
};

function ThemeMixSliders({ themeId, themeName, totalRev, mix, setMix, locked, setLocked }) {
  const adjustSlider = (catId, newVal) => {
    const clamped = Math.max(0, Math.min(100, newVal));
    const old = mix[catId];
    const delta = clamped - old;
    if (delta === 0) return;
    // Redistribute delta across unlocked, non-current cats
    const unlocked = PRODUCT_CATS.filter(c => c.id !== catId && !locked[c.id]);
    if (unlocked.length === 0) return;
    const totalUnlocked = unlocked.reduce((s, c) => s + mix[c.id], 0);
    const newMix = { ...mix, [catId]: clamped };
    if (totalUnlocked > 0) {
      unlocked.forEach(c => { newMix[c.id] = Math.max(0, mix[c.id] - delta * (mix[c.id] / totalUnlocked)); });
    } else {
      unlocked.forEach(c => { newMix[c.id] = Math.max(0, (mix[c.id] - delta / unlocked.length)); });
    }
    // Normalise to 100
    const sum = Object.values(newMix).reduce((a, b) => a + b, 0);
    if (sum > 0) { PRODUCT_CATS.forEach(c => { newMix[c.id] = (newMix[c.id] / sum) * 100; }); }
    setMix(newMix);
  };

  const total = Object.values(mix).reduce((a, b) => a + b, 0);

  return (
    <div style={{ border: "1px solid #d8d3cb", borderRadius: 6, padding: 18, background: "#f0ede8" }}>
      <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 700, color: "#1a1a1a", marginBottom: 4 }}>{themeName}</div>
      <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 20, fontWeight: 600, color: "#e07030", marginBottom: 12 }}>£{Math.round(totalRev).toLocaleString()}k</div>

      {/* Stacked bar */}
      <div style={{ height: 20, display: "flex", borderRadius: 3, overflow: "hidden", marginBottom: 14 }}>
        {PRODUCT_CATS.map(c => (
          <div key={c.id} style={{ width: mix[c.id] + "%", background: c.color, transition: "width 0.2s" }}
            title={`${c.label}: ${mix[c.id].toFixed(0)}%`} />
        ))}
      </div>

      {/* Sliders */}
      {PRODUCT_CATS.map(c => {
        const amtK = totalRev * mix[c.id] / 100;
        return (
          <div key={c.id} style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: c.color, flexShrink: 0 }} />
                <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: "#1a1a1a" }}>{c.label}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: "#888" }}>£{Math.round(amtK).toLocaleString()}k</span>
                <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, fontWeight: 600, color: "#1a1a1a", minWidth: 34, textAlign: "right" }}>{mix[c.id].toFixed(0)}%</span>
                <button onClick={() => setLocked(l => ({ ...l, [c.id]: !l[c.id] }))}
                  title={locked[c.id] ? "Unlock" : "Lock this category"}
                  style={{ background: "none", border: `1px solid ${locked[c.id] ? "#e07030" : "#d8d3cb"}`, borderRadius: 3, cursor: "pointer", padding: "2px 5px", fontSize: 11, color: locked[c.id] ? "#e07030" : "#aaa" }}>
                  {locked[c.id] ? "🔒" : "🔓"}
                </button>
              </div>
            </div>
            <input type="range" min={0} max={100} step={1} value={Math.round(mix[c.id])}
              disabled={locked[c.id]}
              onChange={e => adjustSlider(c.id, parseFloat(e.target.value))}
              style={{ width: "100%", accentColor: c.color, opacity: locked[c.id] ? 0.4 : 1 }} />
          </div>
        );
      })}
      <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 10, color: total > 100.5 || total < 99.5 ? "#b83232" : "#aaa", textAlign: "right", marginTop: 4 }}>
        Total: {total.toFixed(0)}%
      </div>
    </div>
  );
}

function Step18ThemePL({ pData, confirmed, onConfirm, onBack }) {
  const s12Revs  = pData.s12Revs || pData.s17Revs;
  const s12Costs = pData.s12Costs || pData.s17Costs;
  const { predRevs } = calcPredRevs(pData);
  const { predCosts } = calcPredCosts(pData);

  const totalFTE = 65;
  const initRevAlloc = () => {
    const a = {};
    THEME_DATA.forEach(t => { a[t.id] = Math.round((s12Revs ? REV_LINES.reduce((s, l) => s + nv(s12Revs[l.id]), 0) : REV_LINES.reduce((s, l) => s + nv(predRevs[l.id]), 0)) * t.fteFinal / totalFTE); });
    return a;
  };
  const initCostAlloc = () => {
    const a = {};
    THEME_DATA.forEach(t => { a[t.id] = Math.round((s12Costs ? COST_LINES.reduce((s, l) => s + nv(s12Costs[l.id]), 0) : COST_LINES.reduce((s, l) => s + nv(predCosts[l.id]), 0)) * t.fteFinal / totalFTE); });
    return a;
  };

  const [revAlloc,  setRevAlloc]  = useState(pData.s18RevAlloc  || initRevAlloc());
  const [costAlloc, setCostAlloc] = useState(pData.s18CostAlloc || initCostAlloc());
  const [mixes,     setMixes]     = useState(pData.s18Mixes     || { btg: { ...DEFAULT_MIXES.btg }, psl: { ...DEFAULT_MIXES.psl }, scpss: { ...DEFAULT_MIXES.scpss } });
  const [locked,    setLockedAll] = useState(pData.s18Locked    || { btg: {}, psl: {}, scpss: {} });

  const setMixForTheme = (tid, mix) => setMixes(m => ({ ...m, [tid]: mix }));
  const setLockedForTheme = (tid, setter) => setLockedAll(l => ({ ...l, [tid]: typeof setter === "function" ? setter(l[tid]) : setter }));

  const totalRev  = Object.values(revAlloc).reduce((a, b) => a + b, 0);
  const totalCost = Object.values(costAlloc).reduce((a, b) => a + b, 0);
  const totalMargin = totalRev - totalCost;

  const doConfirm = () => {
    pSave(pData.name, { s18RevAlloc: revAlloc, s18CostAlloc: costAlloc, s18Mixes: mixes, s18Locked: locked, step18Confirmed: true });
    onConfirm();
  };

  return (
    <div className="sl-content">
      <BackBtn onClick={onBack} />
      {confirmed && <ConfirmedBanner stepN={13} />}
      <div className="sl-step-h">Theme P&L</div>
      <div className="sl-prompt">Each theme has a different product mix. Use the sliders to show what each theme does more or less of. Lock a category to pin it while adjusting others. The total always stays at 100%.</div>
      <div className="sl-note-box">
        Sliders are compositionally constrained — moving one redistributes the others. Lock 🔒 a category to protect it from redistribution. The initial revenue split between themes is based on headcount (FTE): BTG 27, PSL 10, SCPSS 25 = 65 total. You can adjust the allocation below — changing one theme's revenue will automatically rebalance the other two so the school total stays on target.
      </div>

      {/* Product mix sliders — 3 theme cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16, marginBottom: 28 }}>
        {THEME_DATA.map(t => (
          <ThemeMixSliders
            key={t.id}
            themeId={t.id}
            themeName={t.name}
            totalRev={revAlloc[t.id] || 0}
            mix={mixes[t.id] || DEFAULT_MIXES[t.id]}
            setMix={(mix) => setMixForTheme(t.id, mix)}
            locked={locked[t.id] || {}}
            setLocked={(setter) => setLockedForTheme(t.id, setter)}
          />
        ))}
      </div>

      {/* Legend */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 24 }}>
        {PRODUCT_CATS.map(c => (
          <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: c.color }} />
            <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: "#666" }}>{c.label}</span>
          </div>
        ))}
      </div>

      {/* Revenue allocation per theme — constrained to total */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, color: "#1a1a1a", marginBottom: 6 }}>Theme revenue allocation (£k)</div>
        <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: "#888", marginBottom: 10 }}>Initial split is by headcount. Adjust each theme — the other two rebalance automatically to keep the school total on target.</div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {THEME_DATA.map((t, idx) => (
            <div key={t.id} style={{ flex: 1, minWidth: 140 }}>
              <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: "#888", marginBottom: 4 }}>{t.name.split(" ").slice(0,3).join(" ")}</div>
              <input type="number" className="sl-num-input" style={{ width: "100%" }}
                value={revAlloc[t.id]}
                onChange={e => {
                  const newVal = nv(e.target.value);
                  const total = Object.values(revAlloc).reduce((a, b) => a + b, 0);
                  const others = THEME_DATA.filter((_, i) => i !== idx);
                  const otherTotal = others.reduce((s, o) => s + revAlloc[o.id], 0);
                  const delta = newVal - revAlloc[t.id];
                  const newAlloc = { ...revAlloc, [t.id]: newVal };
                  if (otherTotal > 0) {
                    others.forEach(o => {
                      newAlloc[o.id] = Math.max(0, Math.round(revAlloc[o.id] - delta * (revAlloc[o.id] / otherTotal)));
                    });
                    // Fix rounding: adjust last other to preserve exact total
                    const newSum = Object.values(newAlloc).reduce((a, b) => a + b, 0);
                    newAlloc[others[others.length-1].id] += (total - newSum);
                  }
                  setRevAlloc(newAlloc);
                }}
              />
            </div>
          ))}
        </div>
        <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: "#888", marginTop: 8 }}>
          School total: <strong style={{ fontFamily: "'IBM Plex Mono',monospace" }}>£{Math.round(totalRev).toLocaleString()}k</strong>
        </div>
      </div>

      {/* Cost allocation per theme */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, color: "#1a1a1a", marginBottom: 10 }}>Theme cost allocation (£k)</div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {THEME_DATA.map(t => (
            <div key={t.id} style={{ flex: 1, minWidth: 140 }}>
              <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: "#888", marginBottom: 4 }}>{t.name.split(" ").slice(0,3).join(" ")}</div>
              <input type="number" className="sl-num-input" style={{ width: "100%" }}
                value={costAlloc[t.id]} onChange={e => setCostAlloc(a => ({ ...a, [t.id]: nv(e.target.value) }))} />
            </div>
          ))}
        </div>
      </div>

      {/* Summary by theme */}
      <div style={{ marginBottom: 24, border: "1px solid #d8d3cb", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, color: "#888", padding: "10px 14px", background: "#ebe7e1" }}>Summary by theme</div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>
            <th style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 10, fontWeight: 600, color: "#888", padding: "8px 12px", textAlign: "left", borderBottom: "1px solid #d8d3cb" }}></th>
            {THEME_DATA.map(t => <th key={t.id} style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 10, fontWeight: 600, color: "#1a1a1a", padding: "8px 12px", textAlign: "right", borderBottom: "1px solid #d8d3cb" }}>{t.name.split(" ").slice(0,2).join(" ")}</th>)}
            <th style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 10, fontWeight: 600, color: "#1a1a1a", padding: "8px 12px", textAlign: "right", borderBottom: "1px solid #d8d3cb" }}>School total</th>
          </tr></thead>
          <tbody>
            {[
              { label: "Revenue", fn: (tid) => revAlloc[tid] || 0, total: totalRev },
              { label: "Costs",   fn: (tid) => costAlloc[tid] || 0, total: totalCost },
              { label: "Contribution (margin)",  fn: (tid) => (revAlloc[tid] || 0) - (costAlloc[tid] || 0), total: totalMargin },
            ].map(row => (
              <tr key={row.label}>
                <td style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600, padding: "10px 12px", borderBottom: "1px solid #e8e4de" }}>{row.label}</td>
                {THEME_DATA.map(t => {
                  const val = row.fn(t.id);
                  const isMargin = row.label === "Contribution (margin)";
                  return (
                    <td key={t.id} style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 13, padding: "10px 12px", textAlign: "right", borderBottom: "1px solid #e8e4de", color: isMargin ? (val >= 0 ? "#2d7d46" : "#b83232") : "#1a1a1a" }}>
                      £{Math.round(val).toLocaleString()}k
                    </td>
                  );
                })}
                <td style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 13, fontWeight: 700, padding: "10px 12px", textAlign: "right", borderBottom: "1px solid #e8e4de", color: row.label === "Contribution (margin)" ? (row.total >= 0 ? "#2d7d46" : "#b83232") : "#1a1a1a" }}>
                  £{Math.round(row.total).toLocaleString()}k
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button className="sl-btn" onClick={doConfirm}>Confirm themes → Step 14: Comparison</button>
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

  const advance = () => { if (displayStep < 17) setDisplayStep(s => s + 1); };
  const go      = (n) => setDisplayStep(n);

  const tabs = STEP_NAMES.map((sn, i) => {
    const n = i + 1;
    const done = pd[`step${n}Confirmed`];
    const isActive = displayStep === n;
    return (
      <div key={n}
        className={`sl-tab${isActive ? " active" : done ? " done" : ""}`}
        style={{ cursor: "pointer" }}
        onClick={() => setDisplayStep(n)}
      >
        {done ? "✓ " : ""}{sn}
      </div>
    );
  });

  if (pd.submitted && displayStep === 17 && !submitted) setSubmitted(true);

  return (
    <div className="sl-shell">
      <div className="sl-header">
        <div className="sl-header-title">Straw Man — Financial Viability Tool</div>
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
          note="31 July 2028 is chosen as it is FBaM's year end and levy funding should have ended post EPA submissions. Initial figures are based on CAGR from Step 5."
          confirmLabel="Confirm predicted revenues → Step 7: Predicted costs"
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
          confirmLabel="Confirm predicted costs → Step 8: Prognosis"
          isCost={true} confirmed={pd.step7Confirmed}
          onConfirm={(rates) => { pSave(name, { costRates: rates, step7Confirmed: true }); advance(); }}
          onBack={() => go(6)}
        />
      )}
      {displayStep === 8 && <Step7 pData={pd} confirmed={pd.step8Confirmed} onConfirm={() => { pSave(name, { step8Confirmed: true }); advance(); }} onBack={() => go(7)} />}

      {/* ── TRANSITION: Section one complete ── */}
      {displayStep === 9 && (
        <TransitionScreen
          heading="Section one complete."
          body="You have worked through the current financial position and built a do-nothing trajectory to July 2028. You can see the gap between where FBaM is heading and where it needs to be. In section two we will shift from diagnosis to direction. You will consider who FBaM should serve, where it should position itself, and what its purpose is. These choices will shape the scenario you build in section three."
          onContinue={advance}
          continueLabel="Continue → Step 10: Who FBaM serves"
          onBack={() => go(8)}
        />
      )}

      {/* ── SECTION TWO: Steps 10–12 ── */}
      {displayStep === 10 && <PurposeStep8 pData={pd} confirmed={pd.step9Confirmed} onConfirm={() => { pSave(name, { step9Confirmed: true }); advance(); }} onBack={() => go(9)} />}
      {displayStep === 11 && <PurposeStep9 pData={pd} confirmed={pd.step10Confirmed} onConfirm={(t) => { pSave(name, { purposeTensions: t, step10Confirmed: true }); advance(); }} onBack={() => go(10)} />}
      {displayStep === 12 && (
        <Step11Changes pData={pd} confirmed={pd.step11Confirmed}
          onConfirm={() => { pSave(name, { step11Confirmed: true }); advance(); }}
          onBack={() => go(11)}
        />
      )}

      {/* ── TRANSITION: Section two complete ── */}
      {displayStep === 13 && (
        <TransitionScreen
          heading="Section two complete."
          body="You have considered who FBaM should serve, where it should position itself, and which changes would make the most difference. In section three we move to the numbers. You will build a strawperson financial scenario — a complete revenue and cost structure that is both coherent with your strategic choices and financially viable by July 2028. The scenarios will then be compared across the group."
          onContinue={advance}
          continueLabel="Continue → Step 14: Close the gap"
          onBack={() => go(12)}
        />
      )}

      {/* ── SECTION THREE: Steps 14–17 ── */}
      {displayStep === 14 && <Step12CloseGap pData={pd} confirmed={pd.step17Confirmed} onConfirm={() => { pSave(name, { step17Confirmed: true }); advance(); }} onBack={() => go(13)} />}
      {displayStep === 15 && <Step18ThemePL pData={pd} confirmed={pd.step18Confirmed} onConfirm={() => { pSave(name, { step18Confirmed: true }); advance(); }} onBack={() => go(14)} />}
      {displayStep === 16 && <Step19Comparison pData={pd} onConfirm={() => { pSave(name, { step19Confirmed: true }); advance(); }} onBack={() => go(15)} />}
      {displayStep === 17 && <Step20Finalise pData={pd} onBack={() => go(16)} />}
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

  const MAX_HIGH = 3;
  const highCount = Object.values(groups).filter(v => nv(v) >= 8).length
    + others.filter(o => nv(o.score) >= 8).length;

  const setGroupScore = (g, n) => {
    const current = nv(groups[g]);
    if (n >= 8 && current < 8 && highCount >= MAX_HIGH) return; // block if slots full
    setGroups(prev => ({ ...prev, [g]: n }));
  };

  const setOtherScore = (i, n) => {
    const current = nv(others[i]?.score);
    if (n >= 8 && current < 8 && highCount >= MAX_HIGH) return;
    setOthers(arr => arr.map((x, j) => j === i ? { ...x, score: n } : x));
  };

  const doConfirm = () => {
    pSave(pData.name, { purposeGroups: groups, purposeGroupOthers: others, step9Confirmed: true });
    onConfirm();
  };

  return (
    <div className="sl-content">
      <BackBtn onClick={onBack} />
      {confirmed && <ConfirmedBanner stepN={9} />}
      <div className="sl-step-h">Who should FBaM serve in July 2028?</div>
      <div className="sl-prompt">Rate each stakeholder group by importance to FBaM's future. Rate 1–9. If everything scores 9, nothing is a priority. Where does FBaM need to make hard choices? A maximum of 3 groups can score 8 or 9 — use your high priority slots deliberately!</div>
      <div className="sl-note-box" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span>Scores 8–9 are high priority. You have a maximum of 3 high priority slots.</span>
        <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 13, fontWeight: 600, color: highCount >= MAX_HIGH ? "#e07030" : "#2d7d46", whiteSpace: "nowrap", marginLeft: 16 }}>
          High priority slots used: {highCount} of {MAX_HIGH}
        </span>
      </div>
      <table className="sl-tbl">
        <thead><tr><th>Stakeholder</th><th className="right" style={{ width: 200 }}>Importance (1 = low, 9 = high)</th></tr></thead>
        <tbody>
          {PURPOSE_GROUPS.map(g => (
            <tr key={g}>
              <td className="tbl-name">{g}</td>
              <td>
                <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", flexWrap: "nowrap" }}>
                  {[1,2,3,4,5,6,7,8,9].map(n => {
                    const isSelected = nv(groups[g]) === n;
                    const isBlocked = n >= 8 && !isSelected && nv(groups[g]) < 8 && highCount >= MAX_HIGH;
                    return (
                      <button key={n}
                        style={{ padding: "4px 0", border: `1px solid ${isSelected ? "#e07030" : "#d8d3cb"}`, borderRadius: 4, background: isSelected ? "#e07030" : isBlocked ? "#f5f3f0" : "#f0ede8", color: isSelected ? "#fff" : isBlocked ? "#ccc" : "#1a1a1a", fontFamily: "'DM Sans',sans-serif", fontSize: 12, cursor: isBlocked ? "not-allowed" : "pointer", width: 30, textAlign: "center" }}
                        onClick={() => setGroupScore(g, n)}
                        disabled={isBlocked}
                      >{n}</button>
                    );
                  })}
                </div>
              </td>
            </tr>
          ))}
          {others.map((o, i) => (
            <tr key={`other-${i}`}>
              <td><input type="text" className="sl-input" style={{ fontSize: 13 }} placeholder="Add another group…" value={o.label} onChange={e => setOthers(arr => arr.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} /></td>
              <td>
                <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", flexWrap: "nowrap" }}>
                  {[1,2,3,4,5,6,7,8,9].map(n => {
                    const isSelected = nv(o.score) === n;
                    const isBlocked = n >= 8 && !isSelected && nv(o.score) < 8 && highCount >= MAX_HIGH;
                    return (
                      <button key={n}
                        style={{ padding: "4px 0", border: `1px solid ${isSelected ? "#e07030" : "#d8d3cb"}`, borderRadius: 4, background: isSelected ? "#e07030" : isBlocked ? "#f5f3f0" : "#f0ede8", color: isSelected ? "#fff" : isBlocked ? "#ccc" : "#1a1a1a", fontFamily: "'DM Sans',sans-serif", fontSize: 12, cursor: isBlocked ? "not-allowed" : "pointer", width: 30, textAlign: "center" }}
                        onClick={() => setOtherScore(i, n)}
                        disabled={isBlocked}
                      >{n}</button>
                    );
                  })}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="sl-btn sl-btn-outline" style={{ fontSize: 12, padding: "8px 14px", marginBottom: 20 }}
        onClick={() => setOthers(arr => [...arr, { label: "", score: 5 }])}>+ Add stakeholder</button>
      <div style={{ marginTop: 8 }}>
        <button className="sl-btn" onClick={doConfirm}>Confirm → Step 10: Positioning</button>
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
      <div className="sl-prompt">These sliders define where you believe FBaM should position itself by July 2028. They shape the strategic changes generated in the next step. Set each to your honest view — the disagreements across the group are the conversation.</div>
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
      <button className="sl-btn" onClick={doConfirm}>Confirm positioning → Step 11: Changes</button>
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
      <div className="sl-prompt">{prompt}</div>
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
      <div className="sl-prompt">Testing the distinctiveness you selected against the four conditions for sustainable competitive advantage.</div>
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
      <div className="sl-prompt">Your purpose, expressed as a WHY / HOW / WHAT statement. Generated from everything you've said — edit freely until it's yours.</div>

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

/* ── STEP 19: COMPARISON DASHBOARD ───────────────────────────────────────── */
const PAX_COLORS = ["#1a4fa0","#e07030","#2d7d46","#b87a20","#b83232","#6a3d9a","#555"];

function Step19Comparison({ pData, onConfirm, onBack }) {
  const [tab, setTab] = useState("financial");
  const participants = pAll().filter(p => !p._wiped && p.name);
  const [tick2, setTick2] = useState(0);
  const [showRemove, setShowRemove] = useState(false);
  const [removePwd,  setRemovePwd]  = useState("");
  const [removeErr,  setRemoveErr]  = useState("");
  const [removeTarget, setRemoveTarget] = useState("");
  const [removed, setRemoved]       = useState([]);

  const doRemove = () => {
    if (removePwd !== "ADMIN") { setRemoveErr("Incorrect password."); return; }
    if (!removeTarget) { setRemoveErr("Select a participant first."); return; }
    // Mark as wiped in local STORE (tombstone) — this prevents syncFromSupabase re-adding them
    STORE.participants[removeTarget] = { name: removeTarget, _wiped: true };
    // Push wiped record to Supabase
    if (STORE.sessionId) {
      fetch("/api/sl-save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: STORE.sessionId, participantName: removeTarget, data: { name: removeTarget, _wiped: true } }),
      }).catch(() => {});
    }
    setRemoved(r => [...r, removeTarget]);
    setRemoveTarget("");
    setRemoveErr("");
    setRemovePwd("");
  };

  // Sync immediately on mount, then poll every 4s
  useEffect(() => {
    syncFromSupabase().then(() => setTick2(t => t + 1));
    const id = setInterval(() => { syncFromSupabase().then(() => setTick2(t => t + 1)); }, 4000);
    return () => clearInterval(id);
  }, []);

  const TabBtn = ({ id, label }) => (
    <button onClick={() => setTab(id)} style={{
      padding: "10px 18px", fontSize: 12, fontWeight: 600, border: "none", background: "transparent",
      cursor: "pointer", fontFamily: "'DM Sans',sans-serif", letterSpacing: 0.3,
      color: tab === id ? "#e07030" : "#888",
      borderBottom: tab === id ? "2px solid #e07030" : "2px solid transparent",
    }}>{label}</button>
  );

  const REV_SEGS = [
    { id: "ft_msc",      label: "FT MSc",   color: "#1a4fa0" },
    { id: "exec_ed",     label: "Exec ed",  color: "#e07030" },
    { id: "open",        label: "Open",     color: "#2d7d46" },
    { id: "research_dd", label: "Research", color: "#b87a20" },
    { id: "hefce",       label: "HEFCE",    color: "#6a3d9a" },
    { id: "residences",  label: "Residences", color: "#888" },
    { id: "other_rev",   label: "Other",    color: "#bbb" },
  ];

  // Compute similarities and differences in selected changes
  const changesSimilarities = () => {
    if (participants.length < 2) return { all: [], some: [], none: [] };
    const allSelected = participants.map(p => (p.s11Selected || p.s11Statements?.filter(s => s.checked || s.own) || []).map(s => s.text));
    // Group by theme tag (simple keyword matching)
    const allTexts = allSelected.flat();
    // Find texts selected by all
    const allCount = (text) => allSelected.filter(arr => arr.some(t => t === text || t.toLowerCase().includes(text.toLowerCase().substring(0,20)))).length;
    const unique = [...new Set(allTexts)];
    const byCount = unique.map(text => ({ text, count: allCount(text), participants: participants.filter((p, i) => allSelected[i]?.some(t => t === text || t.toLowerCase().includes(text.toLowerCase().substring(0,20)))).map(p => p.name) }));
    byCount.sort((a, b) => b.count - a.count);
    return {
      all: byCount.filter(x => x.count === participants.length),
      some: byCount.filter(x => x.count > 0 && x.count < participants.length),
      none: [] // changes nobody selected — harder to compute without full list
    };
  };

  const changeGroups = changesSimilarities();

  return (
    <div className="sl-content">
      <BackBtn onClick={onBack} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
        <div className="sl-step-h" style={{ marginBottom: 0 }}>Comparison</div>
        <button onClick={() => { setShowRemove(s => !s); setRemoveErr(""); setRemovePwd(""); setRemoveTarget(""); }}
          style={{ background: "none", border: "1px solid #d8d3cb", borderRadius: 4, padding: "6px 12px", fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: "#aaa", cursor: "pointer" }}>
          👤 Remove participant
        </button>
      </div>
      {removed.length > 0 && (
        <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: "#2d7d46", marginBottom: 12 }}>
          ✓ Removed: {removed.join(", ")}
        </div>
      )}
      {showRemove && (
        <div style={{ background: "#fff9f0", border: "1px solid #e07030", borderRadius: 4, padding: "14px 16px", marginBottom: 20 }}>
          <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 600, color: "#b85020", marginBottom: 12 }}>Remove participant data (admin only)</div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <select value={removeTarget} onChange={e => { setRemoveTarget(e.target.value); setRemoveErr(""); }}
              style={{ padding: "8px 12px", border: "1px solid #d8d3cb", borderRadius: 4, fontFamily: "'DM Sans',sans-serif", fontSize: 13, background: "#f0ede8", color: "#1a1a1a", minWidth: 180 }}>
              <option value="">Select participant…</option>
              {pAll().filter(p => !p._wiped).map(p => (
                <option key={p.name} value={p.name}>{p.name}</option>
              ))}
            </select>
            <input type="password" className="sl-input" style={{ width: 160 }} placeholder="Admin password"
              value={removePwd} onChange={e => { setRemovePwd(e.target.value); setRemoveErr(""); }}
              onKeyDown={e => e.key === "Enter" && doRemove()} />
            <button className="sl-btn" style={{ background: "#b83232", fontSize: 12, padding: "8px 14px" }} onClick={doRemove}>Remove</button>
          </div>
          {removeErr && <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: "#b83232", marginTop: 8 }}>{removeErr}</div>}
        </div>
      )}
      <div className="sl-prompt">How do the scenarios compare? This view shows where the group aligned and where they diverged — across strategic choices, financials, and selected changes.</div>

      {participants.length < 2 && (
        <div className="sl-note-box">
          Your scenario is shown. Others will appear here in real time as they join the session.
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid #d8d3cb", marginBottom: 24, flexWrap: "wrap" }}>
        <TabBtn id="financial"  label="Financial" />
        <TabBtn id="strategic"  label="Strategic choices" />
        <TabBtn id="changes"    label="Selected changes" />
      </div>

      {/* ── TAB 1: FINANCIAL ── */}
      {tab === "financial" && (
        <div>
          <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Gap and target</div>
          <table className="sl-tbl" style={{ fontSize: 12, marginBottom: 28 }}>
            <thead><tr>
              <th>Participant</th>
              <th className="right">Target %</th>
              <th className="right">Do-nothing surplus</th>
              <th className="right">Gap to close</th>
              <th className="right">Scenario surplus</th>
              <th className="right">Scenario %</th>
              <th className="right">Met?</th>
            </tr></thead>
            <tbody>
              {participants.map((p, i) => {
                const { total: predRev } = calcPredRevs(p);
                const { total: predCost } = calcPredCosts(p);
                const tgt = nv(p.targetPct, 7.5);
                const doNothingSurplus = predRev - predCost;
                const gap = (predRev * tgt / 100) - doNothingSurplus;
                const sRevs  = p.s12Revs || p.s17Revs;
                const sCosts = p.s12Costs || p.s17Costs;
                const sRev   = sRevs  ? REV_LINES.reduce((s, l) => s + nv(sRevs[l.id]), 0)  : 0;
                const sCost  = sCosts ? COST_LINES.reduce((s, l) => s + nv(sCosts[l.id]), 0) : 0;
                const sSurplus = sRev - sCost;
                const sPct = sRev > 0 ? (sSurplus / sRev * 100) : 0;
                const met = sPct >= tgt;
                return (
                  <tr key={p.name}>
                    <td style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 10, height: 10, borderRadius: "50%", background: PAX_COLORS[i % PAX_COLORS.length], display: "inline-block", flexShrink: 0 }} />
                      {p.name}
                    </td>
                    <td style={{ textAlign: "right", fontFamily: "IBM Plex Mono" }}>{tgt.toFixed(1)}%</td>
                    <td style={{ textAlign: "right", fontFamily: "IBM Plex Mono", color: doNothingSurplus < 0 ? "#b83232" : "#2d7d46" }}>{fmtK(doNothingSurplus)}</td>
                    <td style={{ textAlign: "right", fontFamily: "IBM Plex Mono", color: "#b87a20" }}>{gap > 0 ? fmtK(gap) : "None"}</td>
                    <td style={{ textAlign: "right", fontFamily: "IBM Plex Mono", color: sSurplus >= 0 ? "#2d7d46" : "#b83232" }}>{sRev > 0 ? fmtK(sSurplus) : "—"}</td>
                    <td style={{ textAlign: "right", fontFamily: "IBM Plex Mono", color: sPct >= tgt ? "#2d7d46" : "#b83232" }}>{sRev > 0 ? sPct.toFixed(1) + "%" : "—"}</td>
                    <td style={{ textAlign: "right", fontWeight: 600, color: met ? "#2d7d46" : "#b83232" }}>{sRev > 0 ? (met ? "✓" : "✗") : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Revenue mix</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
            {REV_SEGS.map(s => (
              <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#888" }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: s.color, flexShrink: 0 }} />{s.label}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {participants.map((p, i) => {
              const revs = p.s12Revs || p.s17Revs || {};
              const total = REV_SEGS.reduce((s, seg) => s + nv(revs[seg.id]), 0) || 1;
              return (
                <div key={p.name} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, width: 120, flexShrink: 0 }}>
                    <span style={{ width: 10, height: 10, borderRadius: "50%", background: PAX_COLORS[i % PAX_COLORS.length], flexShrink: 0 }} />
                    <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: "#666" }}>{p.name}</span>
                  </div>
                  <div style={{ flex: 1, display: "flex", height: 20, borderRadius: 3, overflow: "hidden" }}>
                    {REV_SEGS.map(seg => {
                      const pct = (nv(revs[seg.id]) / total) * 100;
                      return pct > 0.5 ? <div key={seg.id} style={{ width: pct + "%", background: seg.color }} title={`${seg.label}: ${pct.toFixed(0)}%`} /> : null;
                    })}
                  </div>
                  <div style={{ fontFamily: "IBM Plex Mono", fontSize: 11, color: "#888", width: 60, textAlign: "right", flexShrink: 0 }}>{fmtK(total)}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── TAB 2: STRATEGIC CHOICES ── */}
      {tab === "strategic" && (
        <div>
          <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Who FBaM serves (Step 9 ratings)</div>
          <div style={{ overflowX: "auto", marginBottom: 28 }}>
            <table className="sl-tbl" style={{ fontSize: 11, minWidth: 600 }}>
              <thead><tr>
                <th>Participant</th>
                {PURPOSE_GROUPS.map(g => <th key={g} className="right" style={{ fontSize: 9 }}>{g.split(" ").slice(0,3).join(" ")}</th>)}
              </tr></thead>
              <tbody>
                {participants.map(p => (
                  <tr key={p.name}>
                    <td>{p.name}</td>
                    {PURPOSE_GROUPS.map(g => (
                      <td key={g} style={{ textAlign: "right", fontFamily: "IBM Plex Mono", color: nv(p.purposeGroups?.[g]) >= 8 ? "#e07030" : nv(p.purposeGroups?.[g]) >= 6 ? "#b87a20" : "#1a1a1a", fontWeight: nv(p.purposeGroups?.[g]) >= 8 ? 700 : 400 }}>
                        {p.purposeGroups ? nv(p.purposeGroups[g], "—") : "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Strategic positioning (Step 10)</div>
          <div style={{ fontSize: 11, color: "#888", marginBottom: 12 }}>Each dot = one participant. Spread = contested. Clustered = consensus.</div>
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
                        return <div key={p.name} title={p.name} style={{ position: "absolute", left: v + "%", top: "50%", width: 12, height: 12, borderRadius: "50%", background: PAX_COLORS[i % PAX_COLORS.length], transform: "translate(-50%,-50%)", opacity: 0.9 }} />;
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
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: PAX_COLORS[i % PAX_COLORS.length] }} />{p.name}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── TAB 3: SELECTED CHANGES ── */}
      {tab === "changes" && (
        <div>
          {participants.length < 2 && (
            <div className="sl-note-box">Your selected changes are shown. Comparison updates as others complete Step 11.</div>
          )}

          {changeGroups.all.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, color: "#2d7d46", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#2d7d46", display: "inline-block" }} />
                Consensus — selected by all
              </div>
              {changeGroups.all.map((item, i) => (
                <div key={i} style={{ padding: "10px 14px", background: "#f0faf4", border: "1px solid #2d7d46", borderRadius: 4, marginBottom: 8, fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: "#1a1a1a", lineHeight: 1.5 }}>
                  {item.text}
                </div>
              ))}
            </div>
          )}

          {changeGroups.some.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, color: "#b87a20", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#b87a20", display: "inline-block" }} />
                Differences — selected by some
              </div>
              {changeGroups.some.map((item, i) => (
                <div key={i} style={{ padding: "10px 14px", background: "#fffbf0", border: "1px solid #b87a20", borderRadius: 4, marginBottom: 8 }}>
                  <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: "#1a1a1a", lineHeight: 1.5, marginBottom: 4 }}>{item.text}</div>
                  <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: "#888" }}>Selected by: {item.participants.join(", ")}</div>
                </div>
              ))}
            </div>
          )}

          {changeGroups.all.length === 0 && changeGroups.some.length === 0 && participants.length >= 2 && (
            <div className="sl-note-box">No matching change statements found yet. Complete Step 11 to see comparisons.</div>
          )}
        </div>
      )}

      <div style={{ marginTop: 32 }}>
        <button className="sl-btn" onClick={onConfirm}>Continue → Step 15: Finalise</button>
      </div>
    </div>
  );
}

/* ── STEP 20: FINALISE ────────────────────────────────────────────────────── */
function Step20Finalise({ pData, onBack }) {
  const [selfEmail, setSelfEmail] = useState("");
  const [emailErr, setEmailErr]   = useState("");
  const [sent, setSent] = useState(false);

  const buildSummary = () => {
    const tgt   = nv(pData.targetPct, 7.5);
    const why   = pData.purposeWhy || "";
    const how   = pData.purposeHow || "";
    const what  = pData.purposeWhat || "";
    // Use s12Revs as fallback if s17Revs not yet set
    const scenRevs  = pData.s17Revs  || pData.s12Revs;
    const scenCosts = pData.s17Costs || pData.s12Costs;
    const s17R  = scenRevs  ? REV_LINES.reduce((s, l) => s + nv(scenRevs[l.id]),  0) : 0;
    const s17C  = scenCosts ? COST_LINES.reduce((s, l) => s + nv(scenCosts[l.id]), 0) : 0;
    const s17S  = s17R - s17C;
    const s17P  = s17R > 0 ? (s17S / s17R * 100).toFixed(1) : "—";
    return { tgt, why, how, what, s17R, s17C, s17S, s17P, scenRevs, scenCosts };
  };

  const buildPrintData = () => {
    const { tgt, why, how, what, s17R, s17C, s17S, s17P, scenRevs, scenCosts } = buildSummary();
    const curRevTotal  = REV_LINES.reduce((s, l) => s + nv(pData.revenues?.[l.id], l.prefillK), 0);
    const curCostTotal = COST_LINES.reduce((s, l) => s + nv(pData.costs?.[l.id], l.baseK), 0);
    const curSurplus   = curRevTotal - curCostTotal;
    const { predRevs, total: predRev } = calcPredRevs(pData);
    const { predCosts, total: predCost } = calcPredCosts(pData);
    const predSurplus  = predRev - predCost;
    const predGap      = (predRev * tgt / 100) - predSurplus;
    const changes      = pData.s11Selected || pData.s11Statements?.filter(s => s.checked || s.own) || [];
    const tensions     = pData.purposeTensions || {};
    const groups       = pData.purposeGroups   || {};
    const mixes        = pData.s18Mixes        || {};
    const date         = new Date().toLocaleDateString("en-GB", { day:"numeric", month:"long", year:"numeric" });
    // Use REV_DEF_RATES as final fallback for CAGR display
    const getRevRate   = (id) => pData.revRates?.[id] ?? pData.marketRates?.[id] ?? REV_DEF_RATES[id] ?? 0;
    return { tgt, why, how, what, s17R, s17C, s17S, s17P, scenRevs, scenCosts,
             curRevTotal, curCostTotal, curSurplus, predRevs, predCosts, predRev, predCost,
             predSurplus, predGap, changes, tensions, groups, mixes, date, getRevRate };
  };

  const buildEmailHtml = () => {
    const d = buildPrintData();
    const { tgt, why, how, what, s17R, s17C, s17S, s17P, scenRevs, scenCosts,
            curRevTotal, curCostTotal, curSurplus, predRevs, predCosts, predRev, predCost,
            predSurplus, predGap, changes, tensions, groups, date, getRevRate } = d;

    const H2 = (t) => `<h2 style="font-size:15px;color:#e07030;margin-top:24px;margin-bottom:8px;border-bottom:1px solid #f0ede8;padding-bottom:4px">${t}</h2>`;
    const tbl = (headers, rows) => `<table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:12px">
      <thead><tr>${headers.map(([h,a])=>`<th style="text-align:${a||"left"};padding:4px 8px;border-bottom:2px solid #ccc">${h}</th>`).join("")}</tr></thead>
      <tbody>${rows}</tbody></table>`;
    const tr = (cells) => `<tr>${cells.map(([v,a,bold,color])=>`<td style="padding:3px 8px;border-bottom:1px solid #eee;text-align:${a||"left"};${bold?"font-weight:700;":""}${color?`color:${color};`:""}">${v}</td>`).join("")}</tr>`;

    return `<div style="font-family:Arial,sans-serif;max-width:680px;color:#1a1a1a;line-height:1.5">
<h1 style="font-size:20px;border-bottom:3px solid #e07030;padding-bottom:8px;margin-bottom:4px">FBaM Strategy Lab — ${pData.name}</h1>
<p style="color:#888;font-size:11px;margin-bottom:20px">Session: ${STORE.sessionId} &nbsp;·&nbsp; ${date}</p>

<div style="display:flex;gap:12px;margin-bottom:20px">
${[
  [`${tgt>=0?"+":""}${tgt.toFixed(1)}%`,"Target surplus",""],
  [s17R>0?fmtK(s17R):"Not completed","Scenario revenue",""],
  [s17C>0?fmtK(s17C):"Not completed","Scenario costs",""],
  [s17R>0?`${s17P}%`:"Not completed","Surplus %", s17R>0?(parseFloat(s17P)>=tgt?"#2d7d46":"#b83232"):"#888"],
].map(([v,l,c])=>`<div style="flex:1;border:1px solid #e07030;border-radius:3px;padding:8px;text-align:center"><div style="font-size:16px;font-weight:700;color:${c||"#e07030"}">${v}</div><div style="font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#888;margin-top:3px">${l}</div></div>`).join("")}
</div>

${H2("1. Target")}
<p style="font-size:13px">Operating surplus target: <strong>${tgt>=0?"+":""}${tgt.toFixed(1)}%</strong> by 31 July 2028</p>

${H2("2. Current revenue (Q2 2025/26)")}
${tbl([["Revenue line"],["£k","right"]],
  REV_LINES.map(l=>tr([[l.name],[ fmtK(nv(pData.revenues?.[l.id],l.prefillK)),"right"]])).join("")+
  tr([["Total revenue","left",true],[fmtK(curRevTotal),"right",true]])+
  tr([["—"]]) +
  tr([["Cost line","left",true],["£k","right",true]])+
  COST_LINES.map(l=>tr([[l.name],[fmtK(nv(pData.costs?.[l.id],l.baseK)),"right"]])).join("")+
  tr([["Total costs","left",true],[fmtK(curCostTotal),"right",true]])+
  tr([["Net surplus","left",true],[fmtK(curSurplus),"right",true,curSurplus>=0?"#2d7d46":"#b83232"]])
)}

${H2("3. Do-nothing trajectory by July 2028")}
${tbl([["Revenue line"],["CAGR applied","right"],["Predicted £k","right"]],
  REV_LINES.map(l=>tr([[l.name],[`${nv(getRevRate(l.id)).toFixed(1)}%`,"right"],[fmtK(nv(predRevs[l.id])),"right"]])).join("")+
  tr([["Total revenue","left",true],["","right"],[fmtK(predRev),"right",true]])+
  tr([["—"]]) +
  tr([["Cost line","left",true],["","right"],["Predicted £k","right",true]])+
  COST_LINES.map(l=>tr([[l.name],["","right"],[fmtK(nv(predCosts[l.id])),"right"]])).join("")+
  tr([["Total costs","left",true],["","right"],[fmtK(predCost),"right",true]])+
  tr([["Do-nothing surplus","left",true],["","right"],[fmtK(predSurplus),"right",true,predSurplus>=0?"#2d7d46":"#b83232"]])+
  tr([["Gap to target","left",true],["","right"],[predGap>0?fmtK(predGap):"None","right",true,predGap>0?"#b83232":"#2d7d46"]])
)}

${H2("4. Who FBaM should serve")}
${tbl([["Stakeholder"],["Score","right"]],
  PURPOSE_GROUPS.map(g=>tr([[g],[nv(groups[g])||"—","right",false,nv(groups[g])>=8?"#e07030":""]])).join("")
)}

${H2("5. Strategic positioning")}
${tbl([["Dimension"],["Position"]],
  PURPOSE_TENSIONS.map(t=>{const v=nv(tensions[t.key],50);const label=v<33?t.l:v>66?t.r:"Balanced";return tr([[t.desc],[`<strong>${label}</strong> (${v})`]]);}).join("")
)}

${H2("6. Selected changes")}
${changes.length>0?`<ol style="font-size:12px;padding-left:18px">${changes.map(s=>`<li style="margin-bottom:5px">${s.text}</li>`).join("")}</ol>`:"<p style='font-size:12px;color:#888'>None selected.</p>"}

${H2("7. Strawperson scenario by July 2028")}
${scenRevs ? tbl([["Revenue line"],["£k","right"]],
  REV_LINES.map(l=>tr([[l.name],[fmtK(nv(scenRevs[l.id])),"right"]])).join("")+
  tr([["Total revenue","left",true],[fmtK(s17R),"right",true]])+
  tr([["—"]]) +
  tr([["Cost line","left",true],["£k","right",true]])+
  COST_LINES.map(l=>tr([[l.name],[fmtK(nv(scenCosts[l.id])),"right"]])).join("")+
  tr([["Total costs","left",true],[fmtK(s17C),"right",true]])+
  tr([["Surplus","left",true],[fmtK(s17S),"right",true,s17S>=0?"#2d7d46":"#b83232"]])
) : "<p style='font-size:12px;color:#888'>Scenario not yet completed.</p>"}

${H2("8. Theme P&L")}
${tbl([["Theme"],["Revenue","right"],["Costs","right"],["Contribution (margin)","right"]],
  THEME_DATA.map(t=>{const r=nv(pData.s18RevAlloc?.[t.id],0);const c=nv(pData.s18CostAlloc?.[t.id],0);const m=r-c;return tr([[t.name],[fmtK(r),"right"],[fmtK(c),"right"],[fmtK(m),"right",false,m>=0?"#2d7d46":"#b83232"]]);}).join("")
)}

${H2("9. WHY / HOW / WHAT")}
${why ? `<p style="font-size:12px"><strong>WHY:</strong> ${why}</p>` : ""}
${how ? `<p style="font-size:12px"><strong>HOW:</strong> ${how}</p>` : ""}
${what ? `<p style="font-size:12px"><strong>WHAT:</strong> ${what}</p>` : ""}
${!why && !how && !what ? `<p style="font-size:12px;color:#888">Purpose section not yet completed.</p>` : ""}
</div>`;
  };

  const fireEmail = async (extraTo) => {
    const recipients = ["results@changebefore.com"];
    if (extraTo && extraTo.includes("@")) recipients.push(extraTo);
    try {
      await fetch("/api/send-results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: recipients,
          subject: `FBaM Strategy Lab — ${pData.name} — ${new Date().toLocaleDateString("en-GB")}`,
          html: buildEmailHtml(),
        }),
      });
    } catch (e) { /* silent — print still works */ }
  };

  const handleSendToSelf = async () => {
    if (!selfEmail.includes("@")) { setEmailErr("Please enter a valid email address."); return; }
    setEmailErr("");
    await fireEmail(selfEmail);
    setSent(true);
  };

  const printAllSections = () => {
    const d = buildPrintData();
    const { tgt, why, how, what, s17R, s17C, s17S, s17P, scenRevs, scenCosts,
            curRevTotal, curCostTotal, curSurplus, predRevs, predCosts, predRev, predCost,
            predSurplus, predGap, changes, tensions, groups, mixes, date, getRevRate } = d;

    const PAGE = (title, stepNum, content) =>
      `<div class="page"><div class="step-label">Step ${stepNum}</div><h2>${title}</h2>${content}</div>`;
    const tbl = (headers, rows) =>
      `<table><thead><tr>${headers.map(([h,a])=>`<th style="text-align:${a||"left"}">${h}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table>`;
    const tr = (cells) =>
      `<tr>${cells.map(([v,a,bold,color])=>`<td style="text-align:${a||"left"};${bold?"font-weight:700;":""}${color?`color:${color};`:""}">${v}</td>`).join("")}</tr>`;
    const kpi = (v, l, c) =>
      `<div class="kpi"><div class="kv" style="color:${c||"#e07030"}">${v}</div><div class="kl">${l}</div></div>`;

    const pages = [
      PAGE("1. Set Goal", 1, `
        <p>Operating surplus target by 31 July 2028:</p>
        <div class="big-number">${tgt>=0?"+":""}${tgt.toFixed(1)}%</div>
        <p class="note">31 July 2028 is FBaM's year end. Levy funding should have ended post EPA submissions.</p>
      `),
      PAGE("2. Revenue — Current position", 2, tbl(
        [["Revenue line"],["Q2 2025/26 £k","right"]],
        REV_LINES.map(l=>tr([[l.name],[fmtK(nv(pData.revenues?.[l.id],l.prefillK)),"right"]])).join("")+
        tr([["Total revenue","left",true],[fmtK(curRevTotal),"right",true]])
      )),
      PAGE("3. Costs — Current position", 3, tbl(
        [["Cost line"],["Q2 2025/26 £k","right"]],
        COST_LINES.map(l=>tr([[l.name],[fmtK(nv(pData.costs?.[l.id],l.baseK)),"right"]])).join("")+
        tr([["Total costs","left",true],[fmtK(curCostTotal),"right",true]])+
        tr([["Net surplus","left",true],[fmtK(curSurplus),"right",true,curSurplus>=0?"#2d7d46":"#b83232"]])
      )),
      PAGE("4. Current position — Summary", 4, `
        <div class="kpi-row">
          ${kpi(fmtK(curRevTotal),"Total revenue")}
          ${kpi(fmtK(curCostTotal),"Total costs")}
          ${kpi(fmtK(curSurplus),"Net surplus",curSurplus>=0?"#2d7d46":"#b83232")}
          ${kpi(`${curRevTotal>0?((curSurplus/curRevTotal)*100).toFixed(1):0}%`,"Surplus %")}
        </div>
        <p class="note">Target: ${tgt>=0?"+":""}${tgt.toFixed(1)}%</p>
      `),
      PAGE("5. Market context", 5, tbl(
        [["Revenue stream"],["Sector CAGR"],["FBaM CAGR applied","right"]],
        MARKET_BENCHMARKS.map(b=>tr([[b.label],[b.range],[`${nv(getRevRate(b.id)).toFixed(1)}%`,"right"]])).join("")
      )),
      PAGE("6. Predicted revenues by July 2028", 6, tbl(
        [["Revenue line"],["CAGR %","right"],["Current £k","right"],["Predicted £k","right"]],
        REV_LINES.map(l=>{const base=nv(l.prefillK);const pred=nv(predRevs[l.id]);return tr([[l.name],[`${nv(getRevRate(l.id)).toFixed(1)}%`,"right"],[fmtK(base),"right"],[fmtK(pred),"right",false,pred<base?"#b83232":"#2d7d46"]]);}).join("")+
        tr([["Total","left",true],["","right"],[fmtK(REV_LINES.reduce((s,l)=>s+nv(l.prefillK),0)),"right",true],[fmtK(predRev),"right",true]])
      )),
      PAGE("7. Predicted costs by July 2028", 7, tbl(
        [["Cost line"],["CAGR %","right"],["Current £k","right"],["Predicted £k","right"]],
        COST_LINES.map(l=>{const base=nv(l.baseK);const pred=nv(predCosts[l.id]);return tr([[l.name],[`${nv(pData.costRates?.[l.id]||0).toFixed(1)}%`,"right"],[fmtK(base),"right"],[fmtK(pred),"right"]]);}).join("")+
        tr([["Total","left",true],["","right"],[fmtK(COST_LINES.reduce((s,l)=>s+nv(l.baseK),0)),"right",true],[fmtK(predCost),"right",true]])
      )),
      PAGE("8. Prognosis — Do-nothing trajectory", 8, `
        <div class="kpi-row">
          ${kpi(fmtK(predRev),"Predicted revenue")}
          ${kpi(fmtK(predCost),"Predicted costs")}
          ${kpi(fmtK(predSurplus),"Predicted surplus",predSurplus>=0?"#2d7d46":"#b83232")}
          ${kpi(predGap>0?fmtK(predGap):"None","Gap to target",predGap>0?"#b83232":"#2d7d46")}
        </div>
        <p class="note">${predGap>0?`Gap of ${fmtK(predGap)} to close to reach the ${tgt}% target.`:`Do-nothing scenario already meets the ${tgt}% target.`}</p>
      `),
      PAGE("Section one complete", "→", `
        <p class="transition-body">You have worked through the current financial position and built a do-nothing trajectory to July 2028. You can see the gap between where FBaM is heading and where it needs to be.</p>
        <p class="transition-body">In section two we shift from diagnosis to direction — who FBaM should serve, where it should position itself, and what its purpose is.</p>
      `),
      PAGE("10. Who FBaM should serve", 10, tbl(
        [["Stakeholder group"],["Importance (1–9)","right"]],
        PURPOSE_GROUPS.map(g=>{const s=nv(groups[g]);return tr([[g],[s||"—","right",false,s>=8?"#e07030":s>=6?"#b87a20":""]]);}).join("")
      )),
      PAGE("11. Strategic positioning", 11, tbl(
        [["Dimension"],["Position"]],
        PURPOSE_TENSIONS.map(t=>{const v=nv(tensions[t.key],50);const label=v<33?`← ${t.l}`:v>66?`${t.r} →`:"Balanced";return tr([[t.desc],[`<strong>${label}</strong>`]]);}).join("")
      )),
      PAGE("12. Selected changes", 12, changes.length>0
        ? `<ol>${changes.map(s=>`<li>${s.text}</li>`).join("")}</ol>`
        : `<p class="note">No changes selected yet.</p>`
      ),
      PAGE("Section two complete", "→", `
        <p class="transition-body">You have considered who FBaM should serve, where it should position itself, and which changes would make the most difference.</p>
        <p class="transition-body">In section three you build the strawperson financial scenario — a complete revenue and cost structure that is both coherent with your strategic choices and financially viable by July 2028.</p>
      `),
      PAGE("14. Close the gap — Strawperson scenario", 14, scenRevs ? tbl(
        [["Revenue line"],["£k","right"]],
        REV_LINES.map(l=>tr([[l.name],[fmtK(nv(scenRevs[l.id])),"right"]])).join("")+
        tr([["Total revenue","left",true],[fmtK(s17R),"right",true]])+
        tr([["—"]]) +
        tr([["Cost line","left",true],["£k","right",true]])+
        COST_LINES.map(l=>tr([[l.name],[fmtK(nv(scenCosts[l.id])),"right"]])).join("")+
        tr([["Total costs","left",true],[fmtK(s17C),"right",true]])+
        tr([["Surplus","left",true],[fmtK(s17S),"right",true,s17S>=0?"#2d7d46":"#b83232"]])
      ) : `<p class="note">Scenario not yet completed.</p>`),
      PAGE("15. Theme P&L", 15, (() => {
        const themeTotal = THEME_DATA.reduce((s,t)=>s+nv(pData.s18RevAlloc?.[t.id],0),0);
        const hasData = themeTotal > 0;
        if (!hasData) return `<p class="note">Theme P&L not yet completed. Complete Step 15 to see the product mix and contribution by theme.</p>`;
        return tbl(
          [["Theme"],["Revenue","right"],["Costs","right"],["Contribution (margin)","right"]],
          THEME_DATA.map(t=>{const r=nv(pData.s18RevAlloc?.[t.id],0);const c=nv(pData.s18CostAlloc?.[t.id],0);const m=r-c;return tr([[t.name],[fmtK(r),"right"],[fmtK(c),"right"],[fmtK(m),"right",false,m>=0?"#2d7d46":"#b83232"]]);}).join("")+
          tr([["School total","left",true],[fmtK(s17R),"right",true],[fmtK(s17C),"right",true],[fmtK(s17S),"right",true,s17S>=0?"#2d7d46":"#b83232"]])
        ) + (() => {
          // Product mix bars per theme
          const mixes = pData.s18Mixes || {};
          return THEME_DATA.map(t => {
            const mix = mixes[t.id];
            if (!mix) return "";
            return `<div style="margin-top:10px"><div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#888;margin-bottom:4px">${t.name} — product mix</div>
            <div style="display:flex;height:12px;border-radius:2px;overflow:hidden;margin-bottom:3px">
              ${PRODUCT_CATS.map(c=>`<div style="width:${(mix[c.id]||0).toFixed(0)}%;background:${c.color}" title="${c.label}: ${(mix[c.id]||0).toFixed(0)}%"></div>`).join("")}
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:8px">
              ${PRODUCT_CATS.map(c=>`<span style="font-size:9px;color:#666"><span style="display:inline-block;width:8px;height:8px;background:${c.color};border-radius:1px;margin-right:3px"></span>${c.label} ${(mix[c.id]||0).toFixed(0)}%</span>`).join("")}
            </div></div>`;
          }).join("");
        })();
      })()),
      PAGE("16. Comparison", 16, (() => {
        const all = pAll().filter(p => !p._wiped && p.name);
        if (all.length < 2) return `<p class="note">Comparison requires at least 2 participants to have completed Step 14. ${all.length === 1 ? "Only 1 participant found in this session." : "No participants found."}</p>`;
        const PAX_COLORS = ["#1a4fa0","#e07030","#2d7d46","#b87a20","#b83232","#6a3d9a","#555"];
        return `
        <p style="font-size:11px;color:#666;margin-bottom:16px">All participants who completed Step 14 in session ${STORE.sessionId}.</p>
        <table style="width:100%;border-collapse:collapse;font-size:11px;margin-bottom:20px">
          <thead><tr>
            <th style="text-align:left;padding:5px 8px;border-bottom:2px solid #ccc">Participant</th>
            <th style="text-align:right;padding:5px 8px;border-bottom:2px solid #ccc">Target %</th>
            <th style="text-align:right;padding:5px 8px;border-bottom:2px solid #ccc">Scenario revenue</th>
            <th style="text-align:right;padding:5px 8px;border-bottom:2px solid #ccc">Scenario costs</th>
            <th style="text-align:right;padding:5px 8px;border-bottom:2px solid #ccc">Surplus</th>
            <th style="text-align:right;padding:5px 8px;border-bottom:2px solid #ccc">Surplus %</th>
            <th style="text-align:right;padding:5px 8px;border-bottom:2px solid #ccc">Met?</th>
          </tr></thead>
          <tbody>${all.map((p,i)=>{
            const tgt2=nv(p.targetPct,7.5);
            const sr=p.s12Revs||p.s17Revs;
            const sc=p.s12Costs||p.s17Costs;
            const sR=sr?REV_LINES.reduce((s,l)=>s+nv(sr[l.id]),0):0;
            const sC=sc?COST_LINES.reduce((s,l)=>s+nv(sc[l.id]),0):0;
            const sS=sR-sC;
            const sPct=sR>0?(sS/sR*100).toFixed(1):"—";
            const met=sR>0&&parseFloat(sPct)>=tgt2;
            return `<tr>
              <td style="padding:4px 8px;border-bottom:1px solid #eee"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${PAX_COLORS[i%7]};margin-right:6px"></span>${p.name}</td>
              <td style="text-align:right;padding:4px 8px;border-bottom:1px solid #eee">${tgt2>=0?"+":""}${tgt2.toFixed(1)}%</td>
              <td style="text-align:right;padding:4px 8px;border-bottom:1px solid #eee">${sR>0?fmtK(sR):"—"}</td>
              <td style="text-align:right;padding:4px 8px;border-bottom:1px solid #eee">${sC>0?fmtK(sC):"—"}</td>
              <td style="text-align:right;padding:4px 8px;border-bottom:1px solid #eee;color:${sS>=0?"#2d7d46":"#b83232"}">${sR>0?fmtK(sS):"—"}</td>
              <td style="text-align:right;padding:4px 8px;border-bottom:1px solid #eee;color:${met?"#2d7d46":"#b83232"}">${sR>0?sPct+"%":"—"}</td>
              <td style="text-align:right;padding:4px 8px;border-bottom:1px solid #eee;font-weight:700;color:${met?"#2d7d46":"#b83232"}">${sR>0?(met?"✓":"✗"):"—"}</td>
            </tr>`;
          }).join("")}</tbody>
        </table>
        <div style="margin-bottom:16px"><div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#888;margin-bottom:8px">Revenue mix comparison</div>
        ${all.map((p,i)=>{
          const sr=p.s12Revs||p.s17Revs||{};
          const total=REV_LINES.reduce((s,l)=>s+nv(sr[l.id]),0)||1;
          const REV_COLORS_M={"ft_msc":"#1a4fa0","exec_ed":"#e07030","open":"#2d7d46","research_dd":"#b87a20","hefce":"#6a3d9a","residences":"#888","other_rev":"#bbb","pt_levy":"#999"};
          return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px">
            <span style="font-size:10px;width:80px;flex-shrink:0"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${PAX_COLORS[i%7]};margin-right:4px"></span>${p.name}</span>
            <div style="flex:1;display:flex;height:14px;border-radius:2px;overflow:hidden">
              ${REV_LINES.filter(l=>nv(sr[l.id])>0).map(l=>`<div style="width:${(nv(sr[l.id])/total*100).toFixed(0)}%;background:${REV_COLORS_M[l.id]||"#ccc"}" title="${l.name}"></div>`).join("")}
            </div>
            <span style="font-size:10px;color:#888;width:60px;text-align:right">${fmtK(total)}</span>
          </div>`;
        }).join("")}
        </div>`;
      })()),
      PAGE("17. Finalise — Summary", 17, `
        <div class="kpi-row">
          ${kpi(`${tgt>=0?"+":""}${tgt.toFixed(1)}%`,"Target surplus")}
          ${kpi(s17R>0?fmtK(s17R):"Not completed","Scenario revenue")}
          ${kpi(s17C>0?fmtK(s17C):"Not completed","Scenario costs")}
          ${kpi(s17R>0?`${s17P}%`:"Not completed","Surplus %",s17R>0?(parseFloat(s17P)>=tgt?"#2d7d46":"#b83232"):"#888")}
        </div>
        ${why?`<div class="why-box"><div class="why-label">WHY</div><p>${why}</p></div>`:""}
        ${how?`<div class="why-box"><div class="why-label">HOW</div><p>${how}</p></div>`:""}
        ${what?`<div class="why-box"><div class="why-label">WHAT</div><p>${what}</p></div>`:""}
      `),
    ];

    const printHTML = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>FBaM Strategy Lab — ${pData.name}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Helvetica Neue',Arial,sans-serif;color:#1a1a1a;font-size:12px;background:#fff}
  /* Cover page only gets a forced page break */
  .cover{padding:48px;background:#1a1a1a;color:#f0ede8;page-break-after:always;min-height:100vh;display:flex;flex-direction:column}
  /* Sections flow naturally — no forced breaks */
  .page{padding:20px 28px 16px;position:relative}
  /* Section divider — visible gap between steps */
  .page + .page{border-top:2px solid #f0ede8;margin-top:4px;padding-top:20px}
  /* Section headers get a subtle break hint but don't force a new page */
  .section-break{page-break-before:auto;border-top:3px solid #e07030;margin-top:28px;padding-top:20px}
  .page-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;padding-bottom:8px;border-bottom:1px solid #eee}
  .page-header-left{font-size:8px;text-transform:uppercase;letter-spacing:2px;color:#bbb}
  .page-header-right{font-size:8px;color:#ddd}
  .step-label{font-size:8px;text-transform:uppercase;letter-spacing:2px;color:#e07030;margin-bottom:4px;font-weight:600}
  h2{font-size:15px;font-weight:700;color:#1a1a1a;margin-bottom:12px;line-height:1.2}
  .accent-line{width:24px;height:2px;background:#e07030;margin-bottom:12px}
  table{width:100%;border-collapse:collapse;margin-bottom:10px;font-size:11px}
  th{text-align:left;padding:5px 8px;border-bottom:2px solid #1a1a1a;font-size:8px;text-transform:uppercase;letter-spacing:1px;color:#888;font-weight:600}
  td{padding:4px 8px;border-bottom:1px solid #f0ede8}
  tr:last-child td{border-bottom:none}
  .kpi-row{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px}
  .kpi{border:1px solid #e8e4de;border-radius:3px;padding:10px 8px;text-align:center;background:#fafaf8}
  .kv{font-size:18px;font-weight:700;line-height:1}
  .kl{font-size:7px;text-transform:uppercase;letter-spacing:1px;color:#888;margin-top:4px}
  .note{font-size:10px;color:#888;margin-top:8px;line-height:1.6;font-style:italic;padding:8px 12px;background:#f8f7f5;border-radius:3px;border-left:2px solid #e07030}
  .transition-body{font-size:12px;color:#555;line-height:1.8;margin-bottom:10px;padding-left:12px;border-left:2px solid #e8e4de}
  ol{padding-left:18px;margin-bottom:8px}
  ol li{margin-bottom:5px;line-height:1.5;font-size:11px}
  .why-box{border:1px solid #e8e4de;border-radius:3px;padding:10px 12px;margin-bottom:8px;background:#fafaf8}
  .why-label{font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#e07030;margin-bottom:4px}
  .why-box p{font-size:11px;line-height:1.6;color:#333}
  .big-number{font-size:48px;font-weight:700;color:#e07030;text-align:center;margin:20px 0;letter-spacing:-2px}
  @media print{
    body{margin:0}
    .page{padding:14px 20px 10px}
    .cover{padding:36px}
  }
</style></head><body>
<div class="cover">
  <div style="margin-bottom:auto;padding-top:40px">
    <div style="font-size:9px;text-transform:uppercase;letter-spacing:4px;color:#e07030;margin-bottom:14px">FBaM · Strategy Lab</div>
    <div style="font-size:44px;font-weight:700;line-height:1.1;margin-bottom:10px;letter-spacing:-1px">${pData.name}</div>
    <div style="width:40px;height:3px;background:#e07030;margin-bottom:18px"></div>
    <div style="font-size:13px;color:#888;line-height:1.8">${date} &nbsp;·&nbsp; Session: ${STORE.sessionId}</div>
  </div>
  <div style="padding-top:40px;border-top:1px solid #333;margin-top:40px">
    <div style="font-size:9px;color:#555;text-transform:uppercase;letter-spacing:2px;margin-bottom:10px">Contents</div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">
      ${[["Section one","Financial position & trajectory","Steps 1–8"],["Section two","Strategic direction","Steps 10–12"],["Section three","Strawperson scenario","Steps 14–17"]].map(([t,d,s])=>`
      <div style="padding:10px;border:1px solid #333;border-radius:3px">
        <div style="font-size:8px;color:#e07030;text-transform:uppercase;letter-spacing:1px;margin-bottom:3px">${s}</div>
        <div style="font-size:11px;font-weight:600;color:#f0ede8;margin-bottom:2px">${t}</div>
        <div style="font-size:9px;color:#666">${d}</div>
      </div>`).join("")}
    </div>
  </div>
</div>
${pages.map(p => p.replace('<div class="page">', `<div class="page"><div class="page-header"><span class="page-header-left">FBaM Strategy Lab · ${pData.name}</span><span class="page-header-right">${date}</span></div>`)).join("")}
</body></html>`;

    const win = window.open("", "_blank");
    win.document.write(printHTML);
    win.document.close();
    win.focus();
    setTimeout(() => {
      win.print();
      fireEmail(selfEmail).then(() => setSent(true));
    }, 500);
  };

  return (
    <div className="sl-content">
      <BackBtn onClick={onBack} />
      <div className="sl-step-h">Finalise</div>

      {/* Unsaved warning */}
      <div style={{ background: "#fff9f0", border: "1px solid #e07030", borderRadius: 4, padding: "12px 16px", marginBottom: 24, fontFamily: "'DM Sans',sans-serif", fontSize: 14, color: "#b85020", lineHeight: 1.6 }}>
        ⚠️ <strong>Results are not saved automatically.</strong> Click the button below to download a PDF of all sections — this will also send a copy to ChangeBefore.
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 8 }}>
        <button className="sl-btn no-print" onClick={printAllSections}>Download all sections as PDF</button>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
        <input type="email" className="sl-input" style={{ maxWidth: 260 }} placeholder="Email results to yourself…"
          value={selfEmail} onChange={e => { setSelfEmail(e.target.value); setEmailErr(""); }} />
        <button className="sl-btn sl-btn-outline no-print" onClick={handleSendToSelf}>Send</button>
      </div>
      {emailErr && <div className="sl-err" style={{ marginBottom: 8 }}>{emailErr}</div>}

      {sent && <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: "#2d7d46", marginBottom: 16 }}>✓ Copy sent to results@changebefore.com</div>}

      {/* Summary for on-screen review */}
      <div style={{ marginTop: 24 }}>
        {(() => { const { tgt, why, how, what, s17R, s17C, s17S, s17P } = buildSummary(); return (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 20 }}>
              {[
                { v: `${tgt >= 0 ? "+" : ""}${tgt.toFixed(1)}%`, l: "Target surplus" },
                { v: fmtK(s17R), l: "Scenario revenue" },
                { v: fmtK(s17C), l: "Scenario costs" },
                { v: `${s17S >= 0 ? "+" : ""}${s17P}%`, l: "Surplus %", color: parseFloat(s17P) >= tgt ? "#2d7d46" : "#b83232" },
              ].map(k => (
                <div key={k.l} className="sl-kpi"><div className="v" style={{ color: k.color || "#e07030" }}>{k.v}</div><div className="l">{k.l}</div></div>
              ))}
            </div>
            {[["WHY", why], ["HOW", how], ["WHAT", what]].map(([label, val]) => val && val !== "—" ? (
              <div key={label} style={{ marginBottom: 12, padding: "12px 16px", background: "#ebe7e1", borderRadius: 4 }}>
                <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "#e07030", marginBottom: 4 }}>{label}</div>
                <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, color: "#1a1a1a", lineHeight: 1.7 }}>{val}</div>
              </div>
            ) : null)}
          </>
        ); })()}
      </div>
    </div>
  );
}


/* ── OBSERVER VIEW ────────────────────────────────────────────────────────── */
function ObserverView({ tick, onLogout }) {
  const [tab, setTab] = useState("overview");
  const [selectedName, setSelectedName] = useState(null);

  // Sync immediately on mount, then poll every 4s
  useEffect(() => {
    syncFromSupabase();
    const id = setInterval(() => syncFromSupabase(), 4000);
    return () => clearInterval(id);
  }, []);

  const participants = pAll().filter(p => !p._wiped && p.name);
  const PAX_COLORS   = ["#1a4fa0","#e07030","#2d7d46","#b87a20","#b83232","#6a3d9a","#555"];

  const TabBtn = ({ id, label }) => (
    <button onClick={() => setTab(id)} style={{
      padding: "10px 18px", fontSize: 12, fontWeight: 600, border: "none",
      background: "transparent", cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
      color: tab === id ? "#e07030" : "#888",
      borderBottom: tab === id ? "2px solid #e07030" : "2px solid transparent",
    }}>{label}</button>
  );

  const Row = ({ label, value, color }) => (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid #e8e4de" }}>
      <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: "#666" }}>{label}</span>
      <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: color || "#1a1a1a" }}>{value}</span>
    </div>
  );

  const selected = selectedName ? participants.find(p => p.name === selectedName) : null;

  return (
    <div className="sl-shell">
      <div className="sl-header">
        <div className="sl-header-title">Observer Mode — read only</div>
        <div className="sl-header-right">
          <span style={{ color: "#e07030", marginRight: 12 }}>👁 admin</span>
          <button style={{ background: "none", border: "none", fontSize: 11, color: "#888", cursor: "pointer", textDecoration: "underline" }} onClick={onLogout}>Exit</button>
        </div>
      </div>

      <div className="sl-tabs">
        <TabBtn id="overview"  label="Overview" />
        <TabBtn id="financial" label="Financial" />
        <TabBtn id="strategic" label="Strategic" />
        <TabBtn id="detail"    label="Participant detail" />
      </div>

      <div className="sl-content">
        {participants.length === 0 && (
          <div className="sl-note-box">No participants yet. Polling every 4 seconds…</div>
        )}

        {/* ── OVERVIEW TAB ── */}
        {tab === "overview" && (
          <div>
            <div className="sl-step-h">Session overview</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 12, marginBottom: 28 }}>
              {participants.map((p, i) => {
                const steps = Object.keys(p).filter(k => k.includes("Confirmed")).length;
                const { total: predRev } = calcPredRevs(p);
                const { total: predCost } = calcPredCosts(p);
                const scenRevs  = p.s12Revs || p.s17Revs;
                const sR = scenRevs ? REV_LINES.reduce((s,l)=>s+nv(scenRevs[l.id]),0) : 0;
                return (
                  <div key={p.name} style={{ border: `2px solid ${PAX_COLORS[i%7]}`, borderRadius: 4, padding: 14, background: "#f0ede8", cursor: "pointer" }}
                    onClick={() => { setSelectedName(p.name); setTab("detail"); }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <div style={{ width: 10, height: 10, borderRadius: "50%", background: PAX_COLORS[i%7] }} />
                      <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, fontWeight: 600 }}>{p.name}</div>
                    </div>
                    <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: "#888", marginBottom: 4 }}>{steps} steps confirmed</div>
                    <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: "#888" }}>
                      Target: <strong style={{ color: "#1a1a1a" }}>{p.targetPct >= 0 ? "+" : ""}{nv(p.targetPct, 7.5).toFixed(1)}%</strong>
                    </div>
                    {sR > 0 && <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: "#888", marginTop: 2 }}>
                      Scenario rev: <strong style={{ color: "#1a1a1a" }}>{fmtK(sR)}</strong>
                    </div>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── FINANCIAL TAB ── */}
        {tab === "financial" && (
          <div>
            <div className="sl-step-h">Financial comparison</div>
            <div style={{ overflowX: "auto" }}>
              <table className="sl-tbl" style={{ minWidth: 700 }}>
                <thead><tr>
                  <th>Participant</th>
                  <th className="right">Target %</th>
                  <th className="right">Do-nothing surplus</th>
                  <th className="right">Gap</th>
                  <th className="right">Scenario revenue</th>
                  <th className="right">Scenario surplus</th>
                  <th className="right">Surplus %</th>
                  <th className="right">Met?</th>
                </tr></thead>
                <tbody>
                  {participants.map((p, i) => {
                    const { total: predRev } = calcPredRevs(p);
                    const { total: predCost } = calcPredCosts(p);
                    const tgt = nv(p.targetPct, 7.5);
                    const doN = predRev - predCost;
                    const gap = (predRev * tgt / 100) - doN;
                    const sr = p.s12Revs || p.s17Revs;
                    const sc = p.s12Costs || p.s17Costs;
                    const sR = sr ? REV_LINES.reduce((s,l)=>s+nv(sr[l.id]),0) : 0;
                    const sC = sc ? COST_LINES.reduce((s,l)=>s+nv(sc[l.id]),0) : 0;
                    const sS = sR - sC;
                    const sPct = sR > 0 ? (sS/sR*100) : 0;
                    const met = sR > 0 && sPct >= tgt;
                    return (
                      <tr key={p.name} style={{ cursor: "pointer" }} onClick={() => { setSelectedName(p.name); setTab("detail"); }}>
                        <td style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ width: 8, height: 8, borderRadius: "50%", background: PAX_COLORS[i%7], flexShrink: 0 }} />{p.name}
                        </td>
                        <td style={{ textAlign: "right", fontFamily: "'IBM Plex Mono',monospace" }}>{tgt >= 0 ? "+" : ""}{tgt.toFixed(1)}%</td>
                        <td style={{ textAlign: "right", fontFamily: "'IBM Plex Mono',monospace", color: doN < 0 ? "#b83232" : "#2d7d46" }}>{fmtK(doN)}</td>
                        <td style={{ textAlign: "right", fontFamily: "'IBM Plex Mono',monospace", color: "#b87a20" }}>{gap > 0 ? fmtK(gap) : "None"}</td>
                        <td style={{ textAlign: "right", fontFamily: "'IBM Plex Mono',monospace" }}>{sR > 0 ? fmtK(sR) : "—"}</td>
                        <td style={{ textAlign: "right", fontFamily: "'IBM Plex Mono',monospace", color: sS >= 0 ? "#2d7d46" : "#b83232" }}>{sR > 0 ? fmtK(sS) : "—"}</td>
                        <td style={{ textAlign: "right", fontFamily: "'IBM Plex Mono',monospace", color: met ? "#2d7d46" : "#b83232" }}>{sR > 0 ? sPct.toFixed(1) + "%" : "—"}</td>
                        <td style={{ textAlign: "right", fontWeight: 600, color: met ? "#2d7d46" : "#b83232" }}>{sR > 0 ? (met ? "✓" : "✗") : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── STRATEGIC TAB ── */}
        {tab === "strategic" && (
          <div>
            <div className="sl-step-h">Strategic positioning</div>
            <div style={{ overflowX: "auto", marginBottom: 28 }}>
              <table className="sl-tbl" style={{ minWidth: 600 }}>
                <thead><tr>
                  <th>Participant</th>
                  {PURPOSE_GROUPS.map(g => <th key={g} className="right" style={{ fontSize: 9 }}>{g.split(" ").slice(0,3).join(" ")}</th>)}
                </tr></thead>
                <tbody>
                  {participants.map(p => (
                    <tr key={p.name}>
                      <td>{p.name}</td>
                      {PURPOSE_GROUPS.map(g => (
                        <td key={g} style={{ textAlign: "right", fontFamily: "'IBM Plex Mono',monospace", color: nv(p.purposeGroups?.[g]) >= 8 ? "#e07030" : "#1a1a1a", fontWeight: nv(p.purposeGroups?.[g]) >= 8 ? 700 : 400 }}>
                          {p.purposeGroups ? (nv(p.purposeGroups[g]) || "—") : "—"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {PURPOSE_TENSIONS.map(t => {
                const vals = participants.map(p => nv(p.purposeTensions?.[t.key], 50));
                const spread = vals.length > 1 ? Math.max(...vals) - Math.min(...vals) : 0;
                return (
                  <div key={t.key}>
                    <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, color: "#888", marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
                      {t.desc}
                      <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 3, background: spread > 30 ? "#fff3cd" : "#d1e7dd", color: spread > 30 ? "#856404" : "#0a5c36" }}>
                        {spread > 30 ? "Contested" : "Consensus"}
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, width: 110, textAlign: "right", color: "#888", flexShrink: 0 }}>{t.l}</span>
                      <div style={{ flex: 1, position: "relative", height: 24 }}>
                        <div style={{ position: "absolute", top: "50%", left: 0, right: 0, height: 1, background: "#d8d3cb" }} />
                        {participants.map((p, i) => {
                          const v = nv(p.purposeTensions?.[t.key], 50);
                          return <div key={p.name} title={p.name} style={{ position: "absolute", left: v + "%", top: "50%", width: 12, height: 12, borderRadius: "50%", background: PAX_COLORS[i%7], transform: "translate(-50%,-50%)" }} />;
                        })}
                      </div>
                      <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, width: 110, color: "#888", flexShrink: 0 }}>{t.r}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── DETAIL TAB ── */}
        {tab === "detail" && (
          <div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
              {participants.map((p, i) => (
                <button key={p.name} onClick={() => setSelectedName(p.name)}
                  style={{ padding: "6px 14px", border: `2px solid ${PAX_COLORS[i%7]}`, borderRadius: 4, fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer", background: selectedName === p.name ? PAX_COLORS[i%7] : "#f0ede8", color: selectedName === p.name ? "#fff" : "#1a1a1a" }}>
                  {p.name}
                </button>
              ))}
            </div>

            {selected && (() => {
              const { total: predRev } = calcPredRevs(selected);
              const { total: predCost } = calcPredCosts(selected);
              const sr = selected.s12Revs || selected.s17Revs;
              const sc = selected.s12Costs || selected.s17Costs;
              const sR = sr ? REV_LINES.reduce((s,l)=>s+nv(sr[l.id]),0) : 0;
              const sC = sc ? COST_LINES.reduce((s,l)=>s+nv(sc[l.id]),0) : 0;
              return (
                <div>
                  <div className="sl-step-h">{selected.name}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
                    <div>
                      <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, color: "#888", marginBottom: 10 }}>Financial summary</div>
                      <Row label="Target surplus" value={`${nv(selected.targetPct,7.5)>=0?"+":""}${nv(selected.targetPct,7.5).toFixed(1)}%`} color="#e07030" />
                      <Row label="Do-nothing revenue" value={fmtK(predRev)} />
                      <Row label="Do-nothing surplus" value={fmtK(predRev-predCost)} color={(predRev-predCost)>=0?"#2d7d46":"#b83232"} />
                      {sR > 0 && <>
                        <Row label="Scenario revenue" value={fmtK(sR)} />
                        <Row label="Scenario surplus" value={fmtK(sR-sC)} color={(sR-sC)>=0?"#2d7d46":"#b83232"} />
                        <Row label="Surplus %" value={`${((sR-sC)/sR*100).toFixed(1)}%`} color={((sR-sC)/sR*100)>=nv(selected.targetPct,7.5)?"#2d7d46":"#b83232"} />
                      </>}
                    </div>
                    <div>
                      <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, color: "#888", marginBottom: 10 }}>Steps confirmed</div>
                      {STEP_NAMES.map((sn, i) => {
                        const n = i + 1;
                        const done = selected[`step${n}Confirmed`];
                        return (
                          <div key={n} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0", borderBottom: "1px solid #e8e4de" }}>
                            <span style={{ fontSize: 12, color: done ? "#2d7d46" : "#ddd" }}>{done ? "✓" : "○"}</span>
                            <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: done ? "#1a1a1a" : "#aaa" }}>{sn}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {(selected.s11Selected || []).length > 0 && (
                    <div style={{ marginTop: 20 }}>
                      <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, color: "#888", marginBottom: 10 }}>Selected changes</div>
                      {(selected.s11Selected || []).map((s, i) => (
                        <div key={i} style={{ padding: "8px 12px", background: "#f0faf4", border: "1px solid #2d7d46", borderRadius: 3, marginBottom: 6, fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: "#1a1a1a" }}>{s.text}</div>
                      ))}
                    </div>
                  )}

                  {sr && (
                    <div style={{ marginTop: 20 }}>
                      <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, color: "#888", marginBottom: 10 }}>Scenario revenue by July 2028</div>
                      {REV_LINES.map(l => <Row key={l.id} label={l.name} value={fmtK(nv(sr[l.id]))} />)}
                      <Row label="Total" value={fmtK(sR)} color="#e07030" />
                    </div>
                  )}
                </div>
              );
            })()}

            {!selected && participants.length > 0 && (
              <div className="sl-note-box">Select a participant above to see their detail.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}


export default function StrawTool() {
  const [view, setView]   = useState("entry");
  const [pName, setPName] = useState("");
  const [tick, setTick]   = useState(0);

  useEffect(() => { const id = setInterval(() => setTick(t => t + 1), 1000); return () => clearInterval(id); }, []);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      {view === "entry" && <Entry onEnter={n => {
        setPName(n);
        if (n.toLowerCase() === "admin") {
          setView("observer");
        } else {
          STORE.myName = n;
          setView("participant");
        }
      }} />}
      {view === "participant" && <ParticipantView name={pName} tick={tick} onLogout={() => setView("entry")} />}
      {view === "observer" && <ObserverView tick={tick} onLogout={() => setView("entry")} />}
    </>
  );
}
