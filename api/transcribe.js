import { requireUser } from './_auth.js';

export const config = { api: { bodyParser: false, sizeLimit: '25mb' } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  // Before reading the body — never buffer an upload for an unauthenticated caller.
  const user = await requireUser(req, res);
  if (!user) return;

  const elKey = process.env.Elevenlabs_key;
  if (!elKey) return res.status(500).json({ error: 'ElevenLabs key not configured' });

  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);

    const r = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: {
        'xi-api-key': elKey,
        'content-type': req.headers['content-type'],
      },
      body,
    });

    const data = await r.json();
    res.status(r.status).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
