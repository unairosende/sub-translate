import { requireUser } from './_auth.js';

// ElevenLabs holds the connection open while it transcribes, so the ceiling
// here is how long the audio takes to process, not how large the file is.
export const config = { maxDuration: 300 };

const PB_URL = process.env.PB_URL || 'https://api.captio.studio';

// The browser uploads audio to PocketBase and sends us the URL; ElevenLabs
// fetches it from there. Only a small JSON body crosses Vercel, so the ~4.5 MB
// request limit no longer caps how long a clip can be.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const user = await requireUser(req, res);
  if (!user) return;

  const elKey = process.env.Elevenlabs_key;
  if (!elKey) return res.status(500).json({ error: 'ElevenLabs key not configured' });

  const { fileUrl, model_id = 'scribe_v1', language_code } = req.body || {};
  if (!fileUrl) return res.status(400).json({ error: 'Missing fileUrl' });

  // Only ever hand our own storage to ElevenLabs — an arbitrary URL here would
  // turn this route into a fetch-anything proxy.
  if (!fileUrl.startsWith(PB_URL + '/')) {
    return res.status(400).json({ error: 'fileUrl must point to the media backend' });
  }

  try {
    const fd = new FormData();
    fd.append('cloud_storage_url', fileUrl);
    fd.append('model_id', model_id);
    fd.append('timestamps_granularity', 'word');
    fd.append('tag_audio_events', 'false');
    if (language_code) fd.append('language_code', language_code);

    const r = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: { 'xi-api-key': elKey },
      body: fd,
    });

    const data = await r.json();
    if (r.ok) {
      // Scribe reports word-level timings; the last one is the audio length.
      const words = data?.words || [];
      const seconds = words.length ? (words[words.length - 1].end || 0) : 0;
      await logUsage(req, user, { kind: 'transcribe', model: model_id, units: seconds, project: req.body?.project });
    }
    res.status(r.status).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
