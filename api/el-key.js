export default function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const key = process.env.Elevenlabs_key;
  if (!key) return res.status(500).json({ error: 'ElevenLabs key not configured' });
  res.status(200).json({ key });
}
