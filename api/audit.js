// api/audit.js — Beacon AI audit proxy (Vercel serverless)
export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { prompt } = req.body || {};
  if (!prompt || typeof prompt !== 'string' || prompt.length > 20000) {
    return res.status(400).json({ error: 'Invalid prompt', detail: 'Prompt missing or too long' });
  }

  const KEY = process.env.ANTHROPIC_API_KEY;
  if (!KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      return res.status(r.status).json({ error: err.error?.message || 'Anthropic API error', status: r.status });
    }

    const data = await r.json();
    return res.status(200).json(data);

  } catch (err) {
    return res.status(500).json({ error: err.message, stack: err.stack?.slice(0, 200) });
  }
}
