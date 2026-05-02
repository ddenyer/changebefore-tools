// stat-principles-cluster.js — group all selected principles across a session into themed clusters.
//
// Takes the array of completed respondents (each with selected_principles).
// Returns themed clusters with attribution showing who chose what.

// Extend the Vercel serverless function timeout to 30s (default 10s often too short for AI calls)
export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'Anthropic key not configured' });

  const { sessionCode, respondents, thing } = req.body;
  if (!Array.isArray(respondents) || respondents.length === 0) {
    return res.status(400).json({ error: 'No respondents supplied' });
  }

  const th = thing || 'the organisation';

  // Flatten all principles into a list with author attribution
  // Filter out facilitator entries and respondents with no principles
  const all = [];
  respondents.forEach(r => {
    if (!r || !r.respondent_name || r.respondent_name === '__facilitator__') return;
    const ps = r.selected_principles;
    if (!Array.isArray(ps) || ps.length === 0) return;
    ps.forEach(p => {
      if (typeof p === 'string' && p.trim()) {
        all.push({ author: r.respondent_name, text: p.trim() });
      }
    });
  });

  if (all.length === 0) {
    return res.status(200).json({
      clusters: [],
      meta: { n_principles: 0, n_respondents_with_principles: 0 },
    });
  }

  const respondentsWithPrinciples = new Set(all.map(p => p.author));

  // Build the input for the AI — number each principle so the AI can refer to them by index
  const numbered = all.map((p, i) => `[${i}] (${p.author}): ${p.text}`).join('\n');

  const aiPrompt = `You are helping a facilitator make sense of the principles a group of leaders from ${th} have committed to.

${all.length} principles have been chosen by ${respondentsWithPrinciples.size} people. Many will overlap or share a common underlying commitment. Your job is to cluster them into themed groups so the facilitator can see the patterns at a glance.

Here are the principles, each with an index and the author's name:

${numbered}

CLUSTERING RULES:
- Group principles that share an underlying commitment, even if the wording differs.
- Each cluster must have a short THEME HEADING (3 to 7 words, plain English, in the form of a commitment — e.g. "Letting people closest to the work decide", "Treating consensus as a tool not a goal", "Making space for unfamiliar problems").
- Aim for 3 to 6 clusters total. Smaller groups can have fewer clusters.
- Every principle must end up in exactly one cluster.
- If a principle truly stands alone, give it its own cluster — but try to group where there is a real shared commitment.
- Within a cluster, order principles by how strongly they express the theme (clearest first).
- Order the clusters by size (largest cluster first), with ties broken by clarity of theme.

OUTPUT FORMAT — respond with ONLY a JSON object, no preamble, no markdown, no code fences:

{
  "clusters": [
    {
      "theme": "Short theme heading",
      "summary": "One sentence (max 25 words) describing the underlying commitment this cluster expresses.",
      "principle_indices": [0, 5, 12]
    },
    ...
  ]
}

Use the index numbers from the bracketed [N] in the input. Each index must appear in exactly one cluster.`;

  let aiData = null;
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
        messages: [{ role: 'user', content: aiPrompt }],
      }),
    });
    const data = await aiResp.json();
    const text = data.content?.[0]?.text || '{}';
    // Robust JSON extraction — strip code fences and find first { last }
    let cleaned = text.replace(/```json|```/g, '').trim();
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      cleaned = cleaned.slice(firstBrace, lastBrace + 1);
    }
    aiData = JSON.parse(cleaned);
  } catch (e) {
    console.error('stat-principles-cluster AI error:', e);
    // Fallback: one cluster per author
    const byAuthor = {};
    all.forEach((p, i) => {
      if (!byAuthor[p.author]) byAuthor[p.author] = { theme: p.author + "'s commitments", summary: 'Grouped by author (clustering unavailable).', principle_indices: [] };
      byAuthor[p.author].principle_indices.push(i);
    });
    aiData = { clusters: Object.values(byAuthor) };
  }

  // Validate and resolve principle_indices to actual principle objects
  const clusters = Array.isArray(aiData?.clusters) ? aiData.clusters : [];
  const seen = new Set();
  const resolved = [];

  clusters.forEach(c => {
    const indices = Array.isArray(c?.principle_indices) ? c.principle_indices : [];
    const items = indices
      .map(idx => Number(idx))
      .filter(idx => Number.isInteger(idx) && idx >= 0 && idx < all.length && !seen.has(idx))
      .map(idx => {
        seen.add(idx);
        return { author: all[idx].author, text: all[idx].text };
      });
    if (items.length > 0) {
      resolved.push({
        theme: typeof c.theme === 'string' && c.theme.trim() ? c.theme.trim() : 'Cluster',
        summary: typeof c.summary === 'string' ? c.summary.trim() : '',
        items,
      });
    }
  });

  // Catch any orphaned principles (AI forgot to assign them)
  const orphans = all
    .map((p, i) => ({ p, i }))
    .filter(({ i }) => !seen.has(i))
    .map(({ p }) => ({ author: p.author, text: p.text }));
  if (orphans.length > 0) {
    resolved.push({
      theme: 'Other commitments',
      summary: 'Principles that did not cluster with the main themes.',
      items: orphans,
    });
  }

  return res.status(200).json({
    clusters: resolved,
    meta: {
      n_principles: all.length,
      n_respondents_with_principles: respondentsWithPrinciples.size,
    },
  });
}
