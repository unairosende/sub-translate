import { requireUser, logUsage } from './_auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const user = await requireUser(req, res);
  if (!user) return;

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
      const GEMINI_FALLBACK = 'gemini-2.5-flash';
      const geminiModelsToTry = model !== GEMINI_FALLBACK ? [model, GEMINI_FALLBACK] : [model];
      let data, r, usedModel;
      for (const tryModel of geminiModelsToTry) {
        r = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${tryModel}:generateContent?key=${geminiKey}`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }],
              generationConfig: { temperature: 0.3, maxOutputTokens: 16000 } }) }
        );
        data = await r.json();
        usedModel = tryModel;
        // Retry with fallback only on model-not-found errors
        if (data.error && (data.error.status === 'NOT_FOUND' || (data.error.message || '').includes('not found'))) {
          console.warn(`[translate] model ${tryModel} not found, trying fallback`);
          continue;
        }
        break;
      }
      if (data.error) return res.status(r.status).json({ error: data.error.message, is429: r.status === 429 || data.error.code === 429 || data.error.status === 'RESOURCE_EXHAUSTED', usedModel });
      // Skip thinking parts (thought:true) — find the actual text response
      const parts = data?.candidates?.[0]?.content?.parts || [];
      const textPart = parts.find(p => !p.thought) || parts[0];
      rawText = textPart?.text || '';
      console.log('[translate] model:', usedModel, '| parts count:', parts.length, '| rawText preview:', rawText?.slice(0,200));
      // An empty response is a failure, not an empty translation. Saying so
      // beats returning "[]" and letting the caller fall back to the source.
      if (!rawText) {
        const reason = data?.candidates?.[0]?.finishReason || 'unknown';
        return res.status(502).json({ error: `Model returned no text (finishReason: ${reason}). Thinking may have consumed the output budget — try a smaller batch or another model.`, usedModel });
      }
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
      rawText = data?.choices?.[0]?.message?.content || '';
      if (!rawText) return res.status(502).json({ error: `${provider} returned no text.` });
    }

    await logUsage(req, user, { kind: 'translate', model, units: prompt.length, unitsOut: rawText.length, project });
    res.status(200).json({ text: rawText });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
