export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({error:'Method not allowed'});
  const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vxovyhzqzlvjvntjnzej.supabase.co';
  const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
  const RESEND_KEY = process.env.RESEND_API_KEY;
  if (!SUPABASE_KEY) return res.status(500).json({error:'Supabase key not configured'});

  const body = req.body;
  const { session_code, respondent_name } = body;
  if (!session_code || !respondent_name) return res.status(400).json({error:'Missing session_code or respondent_name'});

  // Detect closed session — late submissions go into a pending-review queue
  const isMarker = respondent_name === '__session_closed__' || respondent_name === '__facilitator__';
  let sessionIsClosed = false;
  if (!isMarker) {
    try {
      const closedCheck = await fetch(
        `${SUPABASE_URL}/rest/v1/stat_responses?session_code=eq.${encodeURIComponent(session_code)}&respondent_name=eq.__session_closed__&select=id`,
        { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
      );
      if (closedCheck.ok) {
        const closedRows = await closedCheck.json();
        if (Array.isArray(closedRows) && closedRows.length > 0) {
          sessionIsClosed = true;
        }
      }
    } catch (e) { /* if check fails, fall through and write normally */ }
  }

  // Tool label travels in the body but is NOT a Supabase column. Used only for email subject.
  // Defaults to 'STAT Group' for backward compatibility with the original Group tool.
  const toolLabel = (typeof body.tool_label === 'string' && body.tool_label.trim()) ? body.tool_label.trim() : 'STAT Group';

  try {
    // GET existing row — also pull scores so we can detect completion transitions for email
    const getResp = await fetch(
      `${SUPABASE_URL}/rest/v1/stat_responses?session_code=eq.${encodeURIComponent(session_code)}&respondent_name=eq.${encodeURIComponent(respondent_name)}&select=id,prog,def,con,flex,started`,
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
    );

    if (!getResp.ok) {
      const errText = await getResp.text();
      console.error('stat-save GET failed:', getResp.status, errText);
      return res.status(500).json({error:`GET failed: ${errText}`});
    }

    const existing = await getResp.json();

    // Only pass known Supabase columns — strip anything else
    const allowed = ['session_code','respondent_name','role','thing',
      'prog','def','con','flex','tobe_prog','tobe_def','tobe_con','tobe_flex',
      's1_answers','s2_answers','seniority','org_size','sector','strategy_type',
      'notes','started','selected_principles','pending_review',
      'thing_desc','context_text','thirty_day','feedback_rating','feedback_comment'];
    const safeBody = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)));
    // If session is closed and this is a regular respondent, mark as pending review.
    if (sessionIsClosed && !isMarker) {
      safeBody.pending_review = true;
    }

    let writeResp;
    if (existing && existing.length > 0) {
      // PATCH
      writeResp = await fetch(
        `${SUPABASE_URL}/rest/v1/stat_responses?session_code=eq.${encodeURIComponent(session_code)}&respondent_name=eq.${encodeURIComponent(respondent_name)}`,
        {
          method: 'PATCH',
          headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify(safeBody),
        }
      );
    } else {
      // POST
      writeResp = await fetch(`${SUPABASE_URL}/rest/v1/stat_responses`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify(safeBody),
      });
    }

    if (!writeResp.ok) {
      const errText = await writeResp.text();
      console.error('stat-save write failed:', writeResp.status, errText);
      return res.status(500).json({error:`Write failed: ${errText}`});
    }

    // Fire rich submission email ONCE per respondent.
    // Uses the `started` column as an atomic "email already sent" flag — once set to
    // 'emailed:<timestamp>', no further emails fire regardless of how many saves happen.
    // This makes the email idempotent across concurrent saves and re-saves.
    // Email fires ONLY when the client explicitly flags this save as the "Generate My Report"
    // moment. Auto-saves of partial answers, principles toggles, and qualitative input edits
    // hit the DB silently. The flag is set by saveToGroup(true) which is only called from
    // generate() — i.e. when the user clicks the "Generate My Report →" button.
    const isGenerateReport = body.generate_report === true;

    // Even when the flag is set, scores must be complete (defence in depth — generate()
    // shouldn't fire without scores, but if it ever does we'd skip the email).
    const newProg = body.prog || 0, newDef = body.def || 0, newCon = body.con || 0, newFlex = body.flex || 0;
    const writeIsComplete = newProg > 0 && newDef > 0 && newCon > 0 && newFlex > 0;

    // Has email already been sent for this row? (idempotency: protects against double-clicks
    // on Generate My Report, retries, and concurrent saves.)
    let alreadyEmailed = false;
    if (existing && existing.length > 0) {
      const startedVal = existing[0].started;
      alreadyEmailed = typeof startedVal === 'string' && startedVal.startsWith('emailed:');
    }

    const shouldEmail = RESEND_KEY && !isMarker && !sessionIsClosed && isGenerateReport && writeIsComplete && !alreadyEmailed;

    if (shouldEmail) {
      // Mark as emailed FIRST — atomic claim. If this succeeds, we own the email.
      // If another concurrent save also tried, only one of the two PATCHes wins
      // because Supabase serialises writes per-row. The losing one will see the
      // 'emailed:' marker on its next read and skip.
      try {
        const claimResp = await fetch(
          `${SUPABASE_URL}/rest/v1/stat_responses?session_code=eq.${encodeURIComponent(session_code)}&respondent_name=eq.${encodeURIComponent(respondent_name)}&started=is.null`,
          {
            method: 'PATCH',
            headers: {
              'apikey': SUPABASE_KEY,
              'Authorization': `Bearer ${SUPABASE_KEY}`,
              'Content-Type': 'application/json',
              'Prefer': 'return=representation'
            },
            body: JSON.stringify({ started: 'emailed:' + new Date().toISOString() }),
          }
        );
        // If 0 rows were updated, another save beat us to it — bail.
        if (claimResp.ok) {
          const claimed = await claimResp.json();
          if (!Array.isArray(claimed) || claimed.length === 0) {
            // Lost the race — no email this time
            return res.status(200).json({ ok:true, pending_review: !!(sessionIsClosed && !isMarker) });
          }
        }
      } catch (e) {
        console.warn('email claim error (continuing without claim):', e);
      }
    }

    if (shouldEmail) {
      try {
        // Count current respondents in the session for the subject line
        const countResp = await fetch(
          `${SUPABASE_URL}/rest/v1/stat_responses?session_code=eq.${encodeURIComponent(session_code)}&respondent_name=neq.__facilitator__&respondent_name=neq.__session_closed__&pending_review=is.null&select=respondent_name`,
          { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
        );
        const all = countResp.ok ? await countResp.json() : [];
        const n = Array.isArray(all) ? all.length : 0;

        // Helper to escape HTML
        const esc = (s) => String(s == null ? '' : s)
          .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

        // Score row helper
        const scores = body;
        const prog = scores.prog || 0, def = scores.def || 0, con = scores.con || 0, flex = scores.flex || 0;
        const tobeProg = scores.tobe_prog || 0, tobeDef = scores.tobe_def || 0;
        const tobeCon = scores.tobe_con || 0, tobeFlex = scores.tobe_flex || 0;
        const hasTobe = tobeProg || tobeDef || tobeCon || tobeFlex;

        // Qualitative user input — only context fields included here.
        // Personal reflection (30-day commitment) and feedback are handled separately:
        // — 30-day stays in DB only (private to participant)
        // — feedback goes via /api/send-feedback to feedback@changebefore.com
        let qualHTML = '';
        const thingDesc = scores.thing_desc || '';
        const contextText = scores.context_text || '';
        const hasQual = thingDesc || contextText;
        if (hasQual) {
          const qrows = [];
          if (thingDesc) qrows.push(`<tr><td style="padding:6px 12px 6px 0;color:#888;width:160px;vertical-align:top;">Org description</td><td style="padding:6px 0;line-height:1.5;">${esc(thingDesc)}</td></tr>`);
          if (contextText) qrows.push(`<tr><td style="padding:6px 12px 6px 0;color:#888;vertical-align:top;">Context</td><td style="padding:6px 0;line-height:1.5;">${esc(contextText)}</td></tr>`);
          qualHTML = `<h3 style="margin:18px 0 6px 0;font-size:13px;color:#1a1a1a;">Context</h3>
            <table style="border-collapse:collapse;font-size:13px;width:100%;max-width:520px;">${qrows.join('')}</table>`;
        }

        // Question answers — render as a compact table if present
        let questionsHTML = '';
        const s1 = Array.isArray(scores.s1_answers) ? scores.s1_answers : [];
        const s2 = Array.isArray(scores.s2_answers) ? scores.s2_answers : [];
        if (s1.length > 0 || s2.length > 0) {
          const rows = [];
          for (let i = 0; i < 12; i++) {
            const a = s1[i] || {l:'',r:''};
            rows.push(`<tr><td style="padding:3px 8px;color:#888;font-size:11px;">§1 Q${i+1}</td><td style="padding:3px 8px;font-family:monospace;">${esc(a.l)} / ${esc(a.r)}</td></tr>`);
          }
          for (let i = 0; i < 12; i++) {
            const a = s2[i] || {l:'',r:''};
            rows.push(`<tr><td style="padding:3px 8px;color:#888;font-size:11px;">§2 Q${i+1}</td><td style="padding:3px 8px;font-family:monospace;">${esc(a.l)} / ${esc(a.r)}</td></tr>`);
          }
          questionsHTML = `<h3 style="margin:18px 0 6px 0;font-size:13px;color:#1a1a1a;">Question answers (Left / Right)</h3>
            <table style="border-collapse:collapse;font-size:12px;border:1px solid #d8d3cb;">${rows.join('')}</table>`;
        }

        // Selected principles
        let principlesHTML = '';
        const sp = Array.isArray(scores.selected_principles) ? scores.selected_principles : [];
        if (sp.length > 0) {
          principlesHTML = `<h3 style="margin:18px 0 6px 0;font-size:13px;color:#1a1a1a;">Selected principles (${sp.length})</h3>
            <ul style="margin:0;padding-left:20px;font-size:12px;line-height:1.6;">${sp.map(p => `<li>${esc(p)}</li>`).join('')}</ul>`;
        }

        // Build subject + body
        const subject = `${toolLabel} — ${session_code} — ${esc(respondent_name)} — ${new Date().toLocaleDateString('en-GB')}`;

        const html = `<div style="font-family:Helvetica,Arial,sans-serif;color:#1a1a1a;max-width:640px;">
          <h2 style="margin:0 0 4px 0;font-size:18px;">${toolLabel} Submission</h2>
          <p style="margin:0 0 16px 0;color:#888;font-size:12px;">Session ${esc(session_code)} · ${esc(respondent_name)} · ${n} respondent${n!==1?'s':''} total</p>

          <table style="border-collapse:collapse;font-size:13px;width:100%;max-width:520px;">
            <tr><td style="padding:4px 12px 4px 0;color:#888;width:140px;">Organisation</td><td style="padding:4px 0;">${esc(scores.thing||'—')}</td></tr>
            <tr><td style="padding:4px 12px 4px 0;color:#888;">Name</td><td style="padding:4px 0;">${esc(respondent_name)}</td></tr>
            <tr><td style="padding:4px 12px 4px 0;color:#888;">Role</td><td style="padding:4px 0;">${esc(scores.role||'—')}</td></tr>
            <tr><td style="padding:4px 12px 4px 0;color:#888;">Sector</td><td style="padding:4px 0;">${esc(scores.sector||'—')}</td></tr>
            <tr><td style="padding:4px 12px 4px 0;color:#888;">Org size</td><td style="padding:4px 0;">${esc(scores.org_size||'—')}</td></tr>
            <tr><td colspan="2" style="border-top:1px solid #d8d3cb;padding:8px 0 0 0;"></td></tr>
            <tr><td style="padding:4px 12px 4px 0;color:#888;">Current strategy</td><td style="padding:4px 0;font-weight:600;">${esc(scores.strategy_type||'—')}</td></tr>
            <tr><td style="padding:4px 12px 4px 0;color:#888;">Progressive / Defensive</td><td style="padding:4px 0;font-family:monospace;">${prog} / ${def}</td></tr>
            <tr><td style="padding:4px 12px 4px 0;color:#888;">Consistent / Flexible</td><td style="padding:4px 0;font-family:monospace;">${con} / ${flex}</td></tr>
            ${hasTobe ? `
            <tr><td colspan="2" style="border-top:1px solid #d8d3cb;padding:8px 0 0 0;"></td></tr>
            <tr><td style="padding:4px 12px 4px 0;color:#888;">Desired</td><td style="padding:4px 0;"></td></tr>
            <tr><td style="padding:4px 12px 4px 0;color:#888;">Progressive / Defensive</td><td style="padding:4px 0;font-family:monospace;">${tobeProg} / ${tobeDef}</td></tr>
            <tr><td style="padding:4px 12px 4px 0;color:#888;">Consistent / Flexible</td><td style="padding:4px 0;font-family:monospace;">${tobeCon} / ${tobeFlex}</td></tr>
            ` : ''}
            <tr><td colspan="2" style="border-top:1px solid #d8d3cb;padding:8px 0 0 0;"></td></tr>
            <tr><td style="padding:4px 12px 4px 0;color:#888;">Date</td><td style="padding:4px 0;">${esc(scores.date||new Date().toISOString())}</td></tr>
          </table>

          ${qualHTML}
          ${questionsHTML}
          ${principlesHTML}
        </div>`;

        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: 'noreply@changebefore.com', to: ['results@changebefore.com'], subject, html }),
        });
      } catch(e) { console.warn('Email error:', e); }
    }

    return res.status(200).json({ok:true, pending_review: !!(sessionIsClosed && !isMarker)});
  } catch(e) {
    console.error('stat-save error:', e);
    return res.status(500).json({error:e.message});
  }
}
