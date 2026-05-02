export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'Anthropic key not configured' });

  const { sessionCode, respondents, thing } = req.body;
  if (!respondents || respondents.length < 2) return res.status(400).json({ error: 'Need at least 2 respondents' });

  const th = thing || 'the organisation';
  const real = respondents.filter(r => r.respondent_name && r.respondent_name !== '__facilitator__' && r.prog != null);
  const n = real.length;
  if (n < 2) return res.status(400).json({ error: 'Need at least 2 completed respondents' });

  // Mean and spread per dimension — qualitative only, no raw numbers in prompt.
  const dims = ['prog', 'def', 'con', 'flex'];
  const labels = { prog: 'Progressive', def: 'Defensive', con: 'Consistent', flex: 'Flexible' };
  const mean = (k) => real.reduce((s, r) => s + (r[k] || 0), 0) / n;
  const spread = (k) => {
    const m = mean(k);
    const v = real.reduce((s, r) => s + ((r[k] || 0) - m) ** 2, 0) / n;
    return Math.sqrt(v);
  };

  const dimQual = dims.map(k => {
    const m = mean(k);
    const sd = spread(k);
    const level = m >= 75 ? 'high' : m <= 45 ? 'low' : 'middling';
    const agreement = sd < 12 ? 'broad agreement' : sd < 22 ? 'some disagreement' : 'sharp disagreement';
    return `${labels[k]}: ${level}, with ${agreement}`;
  }).join('\n');

  // Find the dimension with the biggest spread — most fertile ground for discussion.
  const spreads = dims.map(k => ({ k, sd: spread(k) }));
  spreads.sort((a, b) => b.sd - a.sd);
  const mostContested = labels[spreads[0].k];

  // Find dimension(s) where mean current and mean to-be diverge most — what people want to change.
  const tobeMean = (k) => {
    const tk = 'tobe_' + k;
    const vals = real.filter(r => r[tk] != null).map(r => r[tk]);
    if (!vals.length) return null;
    return vals.reduce((s, v) => s + v, 0) / vals.length;
  };
  const gaps = dims.map(k => {
    const tm = tobeMean(k);
    if (tm == null) return null;
    return { k, gap: tm - mean(k) };
  }).filter(Boolean);
  let biggestShift = '';
  if (gaps.length) {
    gaps.sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));
    const top = gaps[0];
    if (Math.abs(top.gap) >= 8) {
      biggestShift = `The group as a whole wants to be ${top.gap > 0 ? 'more' : 'less'} ${labels[top.k]}.`;
    }
  }

  const prompt = `You are helping a facilitator open a conversation with a group of ${n} people from ${th} about how the organisation actually operates. The group has just completed an assessment of strategic tensions across four dimensions: Progressive, Defensive, Consistent, Flexible.

Here is what the group's responses show:
${dimQual}

The dimension with the most disagreement is: ${mostContested}.
${biggestShift}

Write 5 questions the facilitator can ask the group out loud to start the discussion.

CRITICAL RULES — the questions must:
- Sound like one human asking another a real question
- Be short, plain, conversational — under 20 words each
- Use everyday language a non-specialist would use
- NOT mention scores, numbers, percentages, dimensions, or any model jargon
- NOT use words like "Progressive", "Defensive", "Consistent", "Flexible", "elevated", "indicates", "moderate", "score", "P", "D", "C", "F"
- Be open questions that invite people to share what they actually experience

Good examples:
- "Where do you think the biggest disagreement was, and why?"
- "What would have to change here for things to feel different in six months?"
- "When did you last see this organisation move quickly on something?"
- "Where does what we say we do not match what we actually do?"
- "Who in this room sees this organisation most differently from you?"

Bad examples (do NOT do this):
- "Your elevated P score of 76 suggests..."
- "How does the moderate Consistent dimension align with..."
- "Given the Defensive tendency, how might you..."

Respond ONLY with a JSON array of exactly 5 strings. No preamble, no markdown, no code fences.`;

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 800,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    const data = await resp.json();
    const text = data.content?.[0]?.text || '[]';
    const cleaned = text.replace(/```json|```/g, '').trim();
    const questions = JSON.parse(cleaned);
    return res.status(200).json({ questions });
  } catch (e) {
    console.error('stat-ai-questions error:', e);
    return res.status(500).json({ error: e.message });
  }
}
