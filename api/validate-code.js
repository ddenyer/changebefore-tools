// Validates a coupon code by calling our custom WordPress endpoint.
// Returns the coupon's tool, membership, and usage data — or a reason for rejection.

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const code = req.method === 'GET'
    ? req.query.code
    : (req.body && req.body.code);

  if (!code || typeof code !== 'string' || code.length > 50) {
    return res.status(400).json({ valid: false, reason: 'invalid_code_format' });
  }

  const cleanCode = code.trim().toUpperCase();
  if (!/^[A-Z0-9_-]+$/.test(cleanCode)) {
    return res.status(400).json({ valid: false, reason: 'invalid_code_format' });
  }

  const wpUser = process.env.WP_APP_USER;
  const wpPass = process.env.WP_APP_PASSWORD;
  if (!wpUser || !wpPass) {
    return res.status(500).json({ error: 'WP credentials not configured' });
  }

  try {
    const auth = Buffer.from(`${wpUser}:${wpPass}`).toString('base64');
    const r = await fetch(
      `https://changebefore.com/wp-json/changebefore/v1/validate-coupon/${cleanCode}`,
      { headers: { 'Authorization': `Basic ${auth}` } }
    );

    if (!r.ok) {
      console.error('WP validate-coupon non-OK:', r.status);
      return res.status(502).json({ valid: false, reason: 'upstream_error' });
    }

    const data = await r.json();

    // If WP says valid, also check Supabase for any session_config under this code.
    // Returned to the front-end so Group can decide whether to admit participants.
    // Solo doesn't use this — it has no facilitator step. Errors here are non-fatal.
    if (data && data.valid) {
      try {
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (supabaseUrl && supabaseKey) {
          const cfgResp = await fetch(
            `${supabaseUrl}/rest/v1/session_configs?session_code=eq.${encodeURIComponent(cleanCode)}&select=*&limit=1`,
            { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` } }
          );
          if (cfgResp.ok) {
            const cfgRows = await cfgResp.json();
            data.session_config = (Array.isArray(cfgRows) && cfgRows.length > 0) ? cfgRows[0] : null;
          } else {
            data.session_config = null;
          }
        } else {
          data.session_config = null;
        }
      } catch (e) {
        console.warn('session_config lookup failed (non-fatal):', e);
        data.session_config = null;
      }
    }

    return res.status(200).json(data);
  } catch (err) {
    console.error('validate-code handler error:', err);
    return res.status(500).json({ error: err.message });
  }
}
