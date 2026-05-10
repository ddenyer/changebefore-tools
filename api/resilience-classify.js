// /api/resilience-classify.js
//
// Classify words into one of five quadrants for the Resilience-Is tool.
//   refine | reinvent | resist | respond | central | outside
//
// Flow per word:
//   1. Check the shared Supabase cache (ri_word_classifications).
//   2. If cached, return it (zero token cost).
//   3. If not, call Anthropic API in a single batch for all uncached words.
//   4. Cache the AI response back into Supabase for next time.
//   5. Return the merged map.
//
// Body: { words: ["adapt", "control", ...] }
// Response: { classifications: { "adapt": "central", "control": "resist", ... } }
//
// Words are expected to be normalised (lowercased, trimmed) by the caller.
// This endpoint will normalise again defensively.

const VALID_QUADRANTS = ['refine','reinvent','resist','respond','central','outside'];

const CLASSIFICATION_PROMPT = `You classify single words or short phrases that complete the sentence:
"Organisational resilience is the ability of an organisation to [WORD]"

into EXACTLY ONE of these six categories:

REFINE — improving and exploiting existing capabilities. Refining, optimising, performing, delivering, improving what already exists. Continuous improvement language. Examples: optimise, perform, deliver, achieve, streamline, execute.

REINVENT — imagining and creating new things. Fundamental change, innovation, transformation, disruption. Examples: innovate, transform, reinvent, imagine, create, disrupt, invent.

RESIST — monitoring and complying. Preventing bad things, controlling, protecting, defending. Compliance and stability language. Examples: prevent, control, protect, comply, defend, maintain, withstand, fortify.

RESPOND — noticing and responding. Sensing, recovering, adjusting in the moment, bouncing back. Examples: respond, recover, sense, notice, bounce back, adjust, repair.

CENTRAL — meta-resilience capabilities that genuinely cut ACROSS quadrants. Use this when a word reads strongly in two or more quadrants. Examples: learn, anticipate, prepare, navigate, endure, adapt, change, evolve, grow, flex, sustain.

OUTSIDE — enablers of resilience or general organisational verbs that don't name what resilience itself DOES. These describe inputs, conditions, or general activities. Examples: leadership, culture, mindset, capability, manage, organise, plan, communicate, collaborate, train, invest, strategy, vision.

Rules:
- Default to CENTRAL if a word fits multiple quadrants meaningfully.
- Default to OUTSIDE if the word names an enabler/condition/general verb rather than a resilience action.
- If you cannot reasonably place a word, use CENTRAL.

Return your response as JSON only, with this exact shape:
{ "WORD_1": "quadrant", "WORD_2": "quadrant", ... }

Where each value is one of: refine, reinvent, resist, respond, central, outside.

Do not include any other text. No explanation. No markdown fences. Just the JSON object.

Classify these words:
`;

function normaliseWord(w) {
  return (w || '').toString().trim().toLowerCase().replace(/\s+/g, ' ');
}

async function fetchCache(words, supabaseUrl, supabaseKey) {
  if (words.length === 0) return {};
  // Supabase REST: words.in.(a,b,c) — encode commas and special chars
  const escaped = words.map(w => '"' + w.replace(/"/g, '\\"') + '"').join(',');
  const url = `${supabaseUrl}/rest/v1/ri_word_classifications?word=in.(${encodeURIComponent(escaped)})&select=word,quadrant`;
  try {
    const r = await fetch(url, {
      headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` },
    });
    if (!r.ok) return {};
    const rows = await r.json();
    const out = {};
    rows.forEach(row => { out[row.word] = row.quadrant; });
    return out;
  } catch (e) {
    console.warn('cache fetch failed:', e.message);
    return {};
  }
}

async function writeCache(entries, supabaseUrl, supabaseKey) {
  if (entries.length === 0) return;
  try {
    await fetch(`${supabaseUrl}/rest/v1/ri_word_classifications`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Prefer': 'resolution=ignore-duplicates',
      },
      body: JSON.stringify(entries),
    });
  } catch (e) {
    console.warn('cache write failed:', e.message);
  }
}

async function callAnthropic(words, apiKey) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: CLASSIFICATION_PROMPT + words.map(w => `- ${w}`).join('\n'),
      }],
    }),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error('Anthropic API error: ' + r.status + ' ' + t.slice(0, 200));
  }
  const data = await r.json();
  const text = (data.content || []).map(c => c.text || '').join('').trim();
  // Strip any stray markdown fences just in case
  const clean = text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
  let parsed;
  try { parsed = JSON.parse(clean); }
  catch (e) {
    console.error('Could not parse classification JSON:', clean.slice(0, 400));
    return {};
  }
  // Defensive normalisation
  const out = {};
  Object.entries(parsed).forEach(([k, v]) => {
    const word = normaliseWord(k);
    const q = (v || '').toString().trim().toLowerCase();
    if (!word) return;
    if (!VALID_QUADRANTS.includes(q)) {
      out[word] = 'central'; // fall back
    } else {
      out[word] = q;
    }
  });
  return out;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
  // Use SERVICE_ROLE_KEY if available — cache writes need it bypassing RLS.
  // Fall back to anon key (works for reads; writes may fail silently and that's fine).
  const SUPABASE_WRITE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || SUPABASE_KEY;
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }
  if (!ANTHROPIC_KEY) {
    return res.status(500).json({ error: 'Anthropic API key not configured' });
  }

  const rawWords = (req.body && Array.isArray(req.body.words)) ? req.body.words : [];
  const words = Array.from(new Set(rawWords.map(normaliseWord))).filter(Boolean);
  if (words.length === 0) {
    return res.status(200).json({ classifications: {} });
  }
  if (words.length > 50) {
    return res.status(400).json({ error: 'Too many words in one batch (max 50)' });
  }

  try {
    // 1. Hit the cache
    const cached = await fetchCache(words, SUPABASE_URL, SUPABASE_KEY);
    const stillNeed = words.filter(w => !cached[w]);

    let aiResults = {};
    if (stillNeed.length > 0) {
      aiResults = await callAnthropic(stillNeed, ANTHROPIC_KEY);
      // Write back to cache (with service role if available)
      const entries = Object.entries(aiResults).map(([word, quadrant]) => ({
        word, quadrant, source: 'ai',
      }));
      await writeCache(entries, SUPABASE_URL, SUPABASE_WRITE_KEY);
    }

    const merged = { ...cached, ...aiResults };
    // Anything still missing -> central
    words.forEach(w => { if (!merged[w]) merged[w] = 'central'; });

    return res.status(200).json({ classifications: merged });
  } catch (err) {
    console.error('resilience-classify error:', err);
    // Fail soft: return central for everything so the tool keeps working
    const fallback = {};
    words.forEach(w => { fallback[w] = 'central'; });
    return res.status(200).json({ classifications: fallback, fallback: true, error: err.message });
  }
}
