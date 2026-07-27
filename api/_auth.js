const PB_URL = process.env.PB_URL || 'https://api.captio.studio';

// Price list in USD, set through the PRICES env var as JSON, e.g.
//   {"gemini-2.5-flash":{"perMTok":0.3},"scribe_v1":{"perMinute":0.4}}
// Deliberately empty by default: recording a made-up cost is worse than
// recording none, and the unit counts stay exact either way.
let PRICES = {};
try { PRICES = JSON.parse(process.env.PRICES || '{}'); } catch { /* keep empty */ }

function estimateCost(kind, model, units) {
  const p = PRICES[model];
  if (!p) return 0;
  // units: characters for translation, seconds of audio for transcription.
  if (kind === 'translate' && p.perMTok) return (units / 4) / 1e6 * p.perMTok;  // ~4 chars per token
  if (kind === 'transcribe' && p.perMinute) return (units / 60) * p.perMinute;
  return 0;
}

// Records what an operation consumed. Never throws: a failed log must not cost
// the user the work they just paid for.
export async function logUsage(req, user, { kind, model, units, project }) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  try {
    await fetch(`${PB_URL}/api/collections/usage_events/records`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: token },
      body: JSON.stringify({
        user: user.id,
        kind,
        model: model || '',
        units: Math.round(units || 0),
        cost: estimateCost(kind, model, units || 0),
        project: project || '',
      }),
    });
  } catch (e) {
    console.error('[usage] could not record event:', e.message);
  }
}

// Validates a PocketBase auth token and returns the user record, or null.
// On failure it already sent the response — callers just `return`.
//
// ponytail: one round-trip to PocketBase per request instead of local JWT
// verification. PocketBase signs tokens with a per-user secret we don't have,
// so asking it is the only honest check. If the extra latency ever matters,
// cache token -> user for a few seconds.
export async function requireUser(req, res) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    res.status(401).json({ error: 'Not authenticated' });
    return null;
  }

  try {
    const r = await fetch(`${PB_URL}/api/collections/users/auth-refresh`, {
      method: 'POST',
      headers: { Authorization: token },
    });
    if (!r.ok) {
      res.status(401).json({ error: 'Invalid or expired session' });
      return null;
    }
    const { record } = await r.json();
    return record;
  } catch (e) {
    // Backend unreachable — fail closed, never fall through to the paid APIs.
    console.error('[auth] PocketBase unreachable:', e.message);
    res.status(503).json({ error: 'Authentication service unavailable' });
    return null;
  }
}
