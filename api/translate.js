export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { prompt, model = 'gemini-2.5-flash', provider = 'gemini' } = req.body;
  if (!prompt) return res.status(400).json({ error: 'Missing prompt' });

  const geminiKey = process.env.gemini_key;
  const groqKey   = process.env.GROQ_API_KEY;
  const orKey     = process.env.OPENROUTER_API_KEY;
  const mistralKey= process.env.MISTRAL_API_KEY;

  try {
    let rawText;

    if (provider === 'gemini') {
      if (!geminiKey) return res.status(500).json({ error: 'Gemini key not configured' });
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.3, maxOutputTokens: 4096 },
            thinkingConfig: { thinkingBudget: 0 } }) }
      );
      const data = await r.json();
      if (data.error) return res.status(r.status).json({ error: data.error.message, is429: r.status === 429 || data.error.code === 429 || data.error.status === 'RESOURCE_EXHAUSTED' });
      // Skip thinking parts (thought:true) — find the actual text response
      const parts = data?.candidates?.[0]?.content?.parts || [];
      const textPart = parts.find(p => !p.thought) || parts[0];
      rawText = textPart?.text || '[]';
    } else {
      const urls   = { groq: 'https://api.groq.com/openai/v1/chat/completions',
                       openrouter: 'https://openrouter.ai/api/v1/chat/completions',
                       mistral: 'https://api.mistral.ai/v1/chat/completions' };
      const keys   = { groq: groqKey, openrouter: orKey, mistral: mistralKey };
      const apiKey = keys[provider];
      if (!apiKey) return res.status(500).json({ error: `${provider} key not configured` });
      const r = await fetch(urls[provider], {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
        body: JSON.stringify({ model, temperature: 0.3, max_tokens: 4096,
          messages: [{ role: 'user', content: prompt }] })
      });
      const data = await r.json();
      if (!r.ok || data.error) return res.status(r.status).json({ error: data?.error?.message || 'HTTP ' + r.status, is429: r.status === 429 });
      rawText = data?.choices?.[0]?.message?.content || '[]';
    }

    res.status(200).json({ text: rawText });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
