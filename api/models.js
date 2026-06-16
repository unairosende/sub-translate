export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).end();

  const geminiKey = process.env.gemini_key;
  if (!geminiKey) return res.status(500).json({ error: 'Gemini key not configured' });

  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${geminiKey}&pageSize=100`
    );
    const data = await r.json();
    if (!r.ok || data.error) {
      return res.status(r.status).json({ error: data?.error?.message || 'Failed to list models' });
    }

    // Filter to generateContent-capable models only
    const available = (data.models || [])
      .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
      .map(m => m.name.replace('models/', ''));

    res.status(200).json({ models: available, checkedAt: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
