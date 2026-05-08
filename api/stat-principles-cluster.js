// stat-principles-cluster.js — cluster all selected behaviours across a session
// into themed clusters within each of the three buckets:
//   retain / less / more
//
// The new shape (May 2026): each respondent's selected_behaviours is an array of
// { text, bucket: 'retain'|'less'|'more', category, axis, is_custom?, is_edited?, original_text? }.
// No ranking — picks are equal-weighted by frequency.
//
// Backward compat:
//   - Old shapes with bucket 'keep'|'add'|'replace' are mapped: keep→retain, add→more, replace→less.
//   - Legacy flat selected_principles (string[]) treated as retain bucket.

export const config = { maxDuration: 30 };

const BUCKET_MAP = { keep: 'retain', add: 'more', replace: 'less' };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'Anthropic key not configured' });

  const { sessionCode, respondents, thing } = req.body;
  if (!Array.isArray(respondents) || respondents.length === 0) {
    return res.status(400).json({ error: 'No respondents supplied' });
  }

  const th = thing || 'the organisation';

  // Flatten everyone's selections into a single tagged list
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
        let bucket = item.bucket;
        // Map legacy bucket names if present
        if (BUCKET_MAP[bucket]) bucket = BUCKET_MAP[bucket];
        if (!['retain','less','more'].includes(bucket)) bucket = 'retain';
        all.push({
          author: displayName,
          text: item.text.trim(),
          bucket,
          category: item.category || null,
          axis: item.axis || null,
          is_custom: !!item.is_custom,
          is_edited: !!item.is_edited,
          original_text: item.original_text || null,
        });
      });
      return;
    }

    // Legacy: flat array of principle strings → treat all as retain
    const legacy = r.selected_principles;
    if (Array.isArray(legacy) && legacy.length > 0) {
      legacy.forEach(text => {
        if (typeof text !== 'string' || !text.trim()) return;
        all.push({
          author: displayName,
          text: text.trim(),
          bucket: 'retain',
          category: null,
          axis: null,
          is_custom: false,
          is_edited: false,
          original_text: null,
        });
      });
    }
  });

  if (all.length === 0) {
    return res.status(200).json({
      clusters_retain: [], clusters_less: [], clusters_more: [],
      meta: { n_items: 0, n_respondents_with_items: 0 },
    });
  }

  const respondentsWithItems = new Set(all.map(p => p.author));

  async function clusterBucket(bucketName, bucketItems) {
    if (bucketItems.length === 0) return [];
    if (bucketItems.length === 1) {
      const it = bucketItems[0];
      return [{
        theme: it.text.length > 60 ? it.text.slice(0, 57) + '...' : it.text,
        summary: 'Single item.',
        items: [{ ...it }],
        author_count: 1,
        n_items: 1,
      }];
    }

    const numbered = bucketItems.map((it, i) => `[${i}] (${it.author}${it.is_custom?', custom':''}${it.is_edited?', edited':''}): ${it.text}`).join('\n');

    const bucketGuidance = {
      retain: `These are practices the leadership group wants to PROTECT. Cluster items that point at the same underlying practice — what the team sees as essential to keep doing.`,
      less: `These are defaults the group wants to DIAL DOWN. Cluster items that point at the same underlying default — the same thing being given up, even if framed differently.`,
      more: `These are disciplines the group wants to DIAL UP. Cluster items that point at the same underlying behaviour to develop.`,
    }[bucketName] || '';

    const prompt = `You are clustering ${bucketItems.length} ${bucketName.toUpperCase()} commitments selected by leaders from ${th}.

${bucketGuidance}

Each item below has an index, the author, and the text:

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
      if (firstBrace >= 0 && lastBrace > firstBrace) cleaned = cleaned.slice(firstBrace, lastBrace + 1);
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
        .map(idx => { seen.add(idx); return bucketItems[idx]; });
      if (items.length > 0) {
        const authorSet = new Set(items.map(i => i.author));
        resolved.push({
          theme: typeof c.theme === 'string' && c.theme.trim() ? c.theme.trim() : 'Cluster',
          summary: typeof c.summary === 'string' ? c.summary.trim() : '',
          items,
          author_count: authorSet.size,
          n_items: items.length,
        });
      }
    });

    // Orphan catch
    const orphanItems = bucketItems
      .map((it, i) => ({ it, i }))
      .filter(({ i }) => !seen.has(i))
      .map(({ it }) => it);
    if (orphanItems.length > 0) {
      const authorSet = new Set(orphanItems.map(i => i.author));
      resolved.push({
        theme: 'Other',
        summary: 'Items not clustered with the main themes.',
        items: orphanItems,
        author_count: authorSet.size,
        n_items: orphanItems.length,
      });
    }

    // Sort by author_count desc, then n_items desc — most converged first
    resolved.sort((a, b) => (b.author_count - a.author_count) || (b.n_items - a.n_items));
    return resolved;
  }

  const [retainClusters, lessClusters, moreClusters] = await Promise.all([
    clusterBucket('retain', all.filter(i => i.bucket === 'retain')),
    clusterBucket('less', all.filter(i => i.bucket === 'less')),
    clusterBucket('more', all.filter(i => i.bucket === 'more')),
  ]);

  return res.status(200).json({
    clusters_retain: retainClusters,
    clusters_less: lessClusters,
    clusters_more: moreClusters,
    meta: {
      n_items: all.length,
      n_respondents_with_items: respondentsWithItems.size,
      n_retain: all.filter(i=>i.bucket==='retain').length,
      n_less: all.filter(i=>i.bucket==='less').length,
      n_more: all.filter(i=>i.bucket==='more').length,
      n_custom: all.filter(i=>i.is_custom).length,
      n_edited: all.filter(i=>i.is_edited).length,
    },
  });
}
