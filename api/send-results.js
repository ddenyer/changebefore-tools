// api/send-results.js
// Vercel serverless function — sends FBaM Strategy Lab results via Resend
// Env var required: RESEND_API_KEY

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { to, subject, html } = req.body || {};

  if (!to || !subject || !html) {
    return res.status(400).json({ error: "Missing required fields: to, subject, html" });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "RESEND_API_KEY not configured" });
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "FBaM Strategy Lab <noreply@changebefore.com>",
        to: [to],
        subject,
        html,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Resend error:", data);
      return res.status(response.status).json({ error: data.message || "Send failed" });
    }

    return res.status(200).json({ success: true, id: data.id });
  } catch (err) {
    console.error("send-results error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
