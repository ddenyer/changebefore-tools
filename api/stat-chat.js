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

  // Log what we actually received
  console.log('Request body keys:', Object.keys(req.body || {}));
  console.log('Messages present:', !!req.body?.messages);
  console.log('Messages length:', req.body?.messages?.length);
  console.log('First message role:', req.body?.messages?.[0]?.role);
  console.log('Content type (first 100):', String(req.body?.messages?.[0]?.content || '').slice(0, 100));

  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
  };

  // Build clean body — only include what Anthropic needs
  const cleanBody = {
    model: MODELS[0],
    max_tokens: 1500,
    messages: req.body?.messages || [],
  };

  if (!cleanBody.messages.length) {
    console.error('No messages in request body');
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

      // Only try next model if this model was not found
      if (data?.error?.type === 'not_found_error') {
        continue;
      }

      // Any other error — return it so we can see what's wrong
      return res.status(response.status).json(data);

    } catch (err) {
      console.error(`stat-chat error with ${model}:`, err.message);
      continue;
    }
  }

  return res.status(500).json({ error: 'No working model found' });
}
