// Models to try in order — first one that works wins
const MODELS = [
  'claude-haiku-4-5-20251001',
  'claude-sonnet-4-6',
  'claude-opus-4-6',
  'claude-3-5-haiku-20241022',
  'claude-3-5-sonnet-20241022',
];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
  };

  for (const model of MODELS) {
    try {
      const body = {
        ...req.body,
        model,
        max_tokens: req.body.max_tokens || 1500,
      };

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (response.ok) {
        return res.status(200).json(data);
      }

      // If model not found, try next one
      const errType = data?.error?.type;
      if (errType === 'not_found_error' || errType === 'invalid_request_error') {
        console.warn(`Model ${model} failed (${errType}), trying next...`);
        continue;
      }

      // Any other error (auth, rate limit, etc) — return immediately
      console.error('Anthropic error:', JSON.stringify(data));
      return res.status(response.status).json(data);

    } catch (err) {
      console.error(`stat-chat error with ${model}:`, err.message);
      continue;
    }
  }

  return res.status(500).json({ error: 'No working model found' });
}
