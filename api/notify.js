export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({error:'Method not allowed'});
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) return res.status(500).json({error:'RESEND_API_KEY not set'});
  try {
    const b = req.body;
    const date = new Date(b.date||Date.now()).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
    const subject = `STAT Solo — ${b.orgName||'(unnamed)'} — ${b.strategyType||'—'} — ${date}`;
    const html = `
      <h2 style="font-family:sans-serif;color:#1a1a1a">STAT Solo Submission</h2>
      <table style="font-family:sans-serif;font-size:14px;border-collapse:collapse">
        <tr><td style="padding:4px 12px 4px 0;color:#888">Organisation</td><td><strong>${b.orgName||'—'}</strong></td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#888">Name</td><td>${b.respondentName||'—'}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#888">Role</td><td>${b.role||'—'}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#888">Context</td><td>${b.contextText||'—'}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#888" colspan="2"><hr/></td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#888">Current strategy</td><td><strong>${b.strategyType||'—'}</strong></td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#888">Progressive / Defensive</td><td>${b.asIs&&b.asIs.prog} / ${b.asIs&&b.asIs.def}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#888">Consistent / Flexible</td><td>${b.asIs&&b.asIs.con} / ${b.asIs&&b.asIs.flex}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#888" colspan="2"><hr/></td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#888">Desired strategy</td><td><strong>${b.tobeType||'—'}</strong></td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#888">Progressive / Defensive</td><td>${b.tobe&&b.tobe.p} / ${b.tobe&&b.tobe.d}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#888">Consistent / Flexible</td><td>${b.tobe&&b.tobe.c} / ${b.tobe&&b.tobe.f}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#888">Date</td><td>${date}</td></tr>
      </table>`;
    const r = await fetch('https://api.resend.com/emails',{
      method:'POST',
      headers:{'Authorization':`Bearer ${RESEND_API_KEY}`,'Content-Type':'application/json'},
      body:JSON.stringify({from:'noreply@changebefore.com',to:['results@changebefore.com'],subject,html}),
    });
    const data = await r.json();
    if(!r.ok) console.error('Resend error:',JSON.stringify(data));
    return res.status(200).json({ok:r.ok,id:data.id});
  } catch(e) {
    console.error('notify handler error:',e);
    return res.status(200).json({ok:false,error:e.message});
  }
}
