import { requireUser } from './_auth.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  // Monitor bypass: an automated health check can authenticate with a shared
  // secret via the x-monitor-key header instead of a user session. This only
  // grants listing of model names — the Gemini key stays server-side and is
  // never exposed. Set MONITOR_KEY in the Vercel env to enable; if it is unset
  // the bypass is inert and normal user auth is always required.
  const monitorKey = process.env.MONITOR_KEY;
  const providedKey = req.headers['x-monitor-key'];
  const isMonitor = Boolean(monitorKey) && providedKey === monitorKey;

  if (!isMonitor) {
    const user = await requireUser(req, res);
    if (!user) return;
  }

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
