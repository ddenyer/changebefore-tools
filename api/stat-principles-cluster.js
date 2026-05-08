// stat-principles-cluster.js — group all selected behaviours across a session into
// bucket-aware themed clusters with rank-weighted aggregation.
//
// New shape (May 2026): each respondent's selected_behaviours is an array of
// { text, bucket, category, axis, rank, is_custom } objects. Items are clustered
// WITHIN their bucket — Keep items cluster with Keep items, Add with Add, etc.
// Rank affects weight (Borda-style): rank-1 picks count more than rank-5 picks.
//
// Backward compat: still accepts old-shape selected_principles (flat string array).
// Those items are treated as Add-bucket, no rank, for graceful degradation.

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

  // Normalise into a single flat list of {author, text, bucket, rank, ...}
  const all = [];
  respondents.forEach(r => {
    if (!r) return;
    if (r.respondent_name === '__facilitator__' || r.respondent_name === '__session_closed__') return;
    const displayName = (r.respondent_name && r.respondent_name.trim())
      ? r.respondent_name.trim()
      : (r.participant_id_padded ? `Participant ${r.participant_id_padded}` : 'Participant');

    const newShape = r.selected_behaviours;
    if (Array.isArray(newShape) && newShape.length > 0) {
      newShape.forEach(item => {
        if (!item || typeof item.text !== 'string' || !item.text.trim()) return;
        const bucket = ['keep','add','replace'].includes(item.bucket) ? item.bucket : 'add';
        all.push({
          author: displayName,
          text: item.text.trim(),
          bucket,
          category: item.category || null,
          axis: item.axis || null,
          rank: typeof item.rank === 'number' ? item.rank : 99,
          is_custom: !!item.is_custom,
        });
      });
      return;
    }
    // Legacy: flat string array of principles → Add bucket, rank by order
    const legacy = r.selected_principles;
    if (Array.isArray(legacy) && legacy.length > 0) {
      legacy.forEach((text, i) => {
        if (typeof text !== 'string' || !text.trim()) return;
        all.push({
          author: displayName,
          text: text.trim(),
          bucket: 'add',
          category: null,
          axis: null,
          rank: i + 1,
          is_custom: false,
        });
      });
    }
  });

  if (all.length === 0) {
    return res.status(200).json({
      bucket_clusters: { keep: [], add: [], replace: [] },
      meta: { n_items: 0, n_respondents_with_items: 0 },
    });
  }

  const respondentsWithItems = new Set(all.map(p => p.author));

  // Borda-weight: rank 1 = 5pts, rank 5 = 1pt, beyond = 0.5pt
  const rankWeight = (rank) => {
    if (rank >= 1 && rank <= 5) return 6 - rank;
    return 0.5;
  };
  all.forEach(item => { item.weight = rankWeight(item.rank); });

  async function clusterBucket(bucketName, bucketItems) {
    if (bucketItems.length === 0) return [];
    if (bucketItems.length === 1) {
      const it = bucketItems[0];
      return [{
        theme: it.text.length > 60 ? it.text.slice(0, 57) + '...' : it.text,
        summary: 'Single item.',
        items: [{
          author: it.author, text: it.text, rank: it.rank, weight: it.weight, is_custom: it.is_custom,
          category: it.category, axis: it.axis,
        }],
        score: it.weight,
        weight_total: it.weight,
        author_count: 1,
      }];
    }

    const numbered = bucketItems.map((it, i) => `[${i}] (${it.author}, rank ${it.rank}${it.is_custom?', custom':''}): ${it.text}`).join('\n');

    const bucketGuidance = {
      keep: `These are practices the leadership group wants to PROTECT. Cluster items that point at the same underlying practice — what the team sees as essential to keep doing.`,
      add: `These are capacities the group wants to BUILD ALONGSIDE existing practice. Cluster items that point at the same underlying capacity to develop.`,
      replace: `These are defaults the group wants to SUBSTITUTE OUT. Cluster items that point at the same underlying default — the same thing being given up, even if the substitute differs.`,
    }[bucketName] || '';

    const prompt = `You are clustering ${bucketItems.length} ${bucketName.toUpperCase()} commitments selected by leaders from ${th}.

${bucketGuidance}

Each item below has an index, the author, the rank they assigned (1 = highest priority), and the text:

${numbered}

CLUSTERING RULES:
- Group items that share an underlying commitment, even if the wording differs.
- Each cluster needs a short THEME HEADING (3 to 7 words, plain English, in the form of a commitment — e.g. "Letting people closest to the work decide", "Preserving procedural rigour where it matters").
- Aim for 2 to 5 clusters total. Smaller groups can have fewer clusters.
- Every item must end up in exactly one cluster.
- If an item truly stands alone, give it its own cluster — but try to group where there is a real shared commitment.

OUTPUT FORMAT — respond with ONLY a JSON object, no preamble, no markdown, no code fences:

{
  "clusters": [
    {
      "theme": "Short theme heading",
      "summary": "One sentence (max 25 words) describing the underlying commitment.",
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
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      const data = await aiResp.json();
      const text = data.content?.[0]?.text || '{}';
      let cleaned = text.replace(/```json|```/g, '').trim();
      const firstBrace = cleaned.indexOf('{');
      const lastBrace = cleaned.lastIndexOf('}');
      if (firstBrace >= 0 && lastBrace > firstBrace) {
        cleaned = cleaned.slice(firstBrace, lastBrace + 1);
      }
      aiData = JSON.parse(cleaned);
    } catch (e) {
      console.error(`cluster ${bucketName} AI error:`, e);
      // Fallback: one cluster per author
      const byAuthor = {};
      bucketItems.forEach((it, i) => {
        if (!byAuthor[it.author]) byAuthor[it.author] = { theme: `${it.author}'s ${bucketName} picks`, summary: 'Grouped by author (clustering unavailable).', principle_indices: [] };
        byAuthor[it.author].principle_indices.push(i);
      });
      aiData = { clusters: Object.values(byAuthor) };
    }

    const rawClusters = Array.isArray(aiData?.clusters) ? aiData.clusters : [];
    const seen = new Set();
    const resolved = [];

    rawClusters.forEach(c => {
      const indices = Array.isArray(c?.principle_indices) ? c.principle_indices : [];
      const items = indices
        .map(idx => Number(idx))
        .filter(idx => Number.isInteger(idx) && idx >= 0 && idx < bucketItems.length && !seen.has(idx))
        .map(idx => {
          seen.add(idx);
          const it = bucketItems[idx];
          return {
            author: it.author, text: it.text, rank: it.rank, weight: it.weight,
            is_custom: it.is_custom, category: it.category, axis: it.axis,
          };
        });
      if (items.length > 0) {
        const authorSet = new Set(items.map(i => i.author));
        const totalWeight = items.reduce((s, i) => s + i.weight, 0);
        resolved.push({
          theme: typeof c.theme === 'string' && c.theme.trim() ? c.theme.trim() : 'Cluster',
          summary: typeof c.summary === 'string' ? c.summary.trim() : '',
          items,
          score: totalWeight,
          weight_total: Math.round(totalWeight * 10) / 10,
          author_count: authorSet.size,
        });
      }
    });

    // Orphan catch
    const orphanItems = bucketItems
      .map((it, i) => ({ it, i }))
      .filter(({ i }) => !seen.has(i))
      .map(({ it }) => ({
        author: it.author, text: it.text, rank: it.rank, weight: it.weight,
        is_custom: it.is_custom, category: it.category, axis: it.axis,
      }));
    if (orphanItems.length > 0) {
      const authorSet = new Set(orphanItems.map(i => i.author));
      const totalWeight = orphanItems.reduce((s, i) => s + i.weight, 0);
      resolved.push({
        theme: 'Other',
        summary: 'Items not clustered with the main themes.',
        items: orphanItems,
        score: totalWeight,
        weight_total: Math.round(totalWeight * 10) / 10,
        author_count: authorSet.size,
      });
    }

    resolved.sort((a, b) => b.score - a.score);
    return resolved;
  }

  const [keepClusters, addClusters, replaceClusters] = await Promise.all([
    clusterBucket('keep', all.filter(i => i.bucket === 'keep')),
    clusterBucket('add', all.filter(i => i.bucket === 'add')),
    clusterBucket('replace', all.filter(i => i.bucket === 'replace')),
  ]);

  return res.status(200).json({
    clusters_keep: keepClusters,
    clusters_add: addClusters,
    clusters_replace: replaceClusters,
    meta: {
      n_items: all.length,
      n_respondents_with_items: respondentsWithItems.size,
      n_keep: all.filter(i=>i.bucket==='keep').length,
      n_add: all.filter(i=>i.bucket==='add').length,
      n_replace: all.filter(i=>i.bucket==='replace').length,
      n_custom: all.filter(i=>i.is_custom).length,
    },
  });
}
