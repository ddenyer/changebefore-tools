export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({error:'Method not allowed'});
  const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vxovyhzqzlvjvntjnzej.supabase.co';
  const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
  const RESEND_KEY = process.env.RESEND_API_KEY;
  if (!SUPABASE_KEY) return res.status(500).json({error:'Supabase key not configured'});

  const body = req.body;
  const { session_code, respondent_name } = body;
  if (!session_code || !respondent_name) return res.status(400).json({error:'Missing session_code or respondent_name'});

  // Tool label travels in the body but is NOT a Supabase column. Used only for email subject.
  // Defaults to 'STAT Group' for backward compatibility with the original Group tool.
  const toolLabel = (typeof body.tool_label === 'string' && body.tool_label.trim()) ? body.tool_label.trim() : 'STAT Group';

  try {
    // GET existing row
    const getResp = await fetch(
      `${SUPABASE_URL}/rest/v1/stat_responses?session_code=eq.${encodeURIComponent(session_code)}&respondent_name=eq.${encodeURIComponent(respondent_name)}&select=id`,
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
      'notes','started','selected_principles'];
    const safeBody = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)));

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

    // Fire group email if 2+ respondents and not facilitator notes
    if (RESEND_KEY && respondent_name !== '__facilitator__') {
      try {
        const countResp = await fetch(
          `${SUPABASE_URL}/rest/v1/stat_responses?session_code=eq.${encodeURIComponent(session_code)}&respondent_name=neq.__facilitator__&select=respondent_name`,
          { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
        );
        const all = await countResp.json();
        const n = all.length;
        const subject = `${toolLabel} — ${session_code} — ${n} respondent${n!==1?'s':''} — ${new Date().toLocaleDateString('en-GB')}`;
        const html = `<h2>${toolLabel} Submission</h2><p><strong>Session:</strong> ${session_code}</p><p><strong>Respondents:</strong> ${n}</p><p><strong>Latest:</strong> ${respondent_name} (${body.role||''})</p><p><strong>Strategy:</strong> ${body.strategy_type||''}</p><p><em>${body.date||''}</em></p>`;
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: 'noreply@changebefore.com', to: ['results@changebefore.com'], subject, html }),
        });
      } catch(e) { console.warn('Email error:', e); }
    }

    return res.status(200).json({ok:true});
  } catch(e) {
    console.error('stat-save error:', e);
    return res.status(500).json({error:e.message});
  }
}
