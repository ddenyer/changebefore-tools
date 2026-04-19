const MODELS = [
  'claude-haiku-4-5-20251001',
  'claude-sonnet-4-6',
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

  const cleanBody = {
    model: MODELS[0],
    max_tokens: 4000,
    messages: req.body?.messages || [],
  };

  if (!cleanBody.messages.length) {
    return res.status(400).json({ error: 'No messages provided' });
  }

  for (const model of MODELS) {
    cleanBody.model = model;
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers,
        body: JSON.stringify(cleanBody),
      });
      const data = await response.json();
      if (response.ok) {
        console.log('Success with model:', model);
        return res.status(200).json(data);
      }
      console.warn(`Model ${model} failed: ${data?.error?.type} — ${data?.error?.message}`);
      if (data?.error?.type === 'not_found_error') { continue; }
      return res.status(response.status).json(data);
    } catch (err) {
      console.error(`stat-chat error with ${model}:`, err.message);
      continue;
    }
  }

  return res.status(500).json({ error: 'No working model found' });
}
