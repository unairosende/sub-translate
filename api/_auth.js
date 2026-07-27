const PB_URL = process.env.PB_URL || 'https://api.captio.studio';

// Price list in USD, set through the PRICES env var as JSON, e.g.
//   {"gemini-3.5-flash":{"inPerMTok":1.5,"outPerMTok":9},
//    "scribe_v1":{"perHour":0.22}}
// Deliberately empty by default: recording a made-up cost is worse than
// recording none, and the unit counts stay exact either way.
let PRICES = {};
try { PRICES = JSON.parse(process.env.PRICES || '{}'); } catch { /* keep empty */ }

// Output tokens cost several times more than input on every current Gemini
// model, so both directions are priced separately.
// ponytail: ~4 characters per token is a rough conversion — good enough to
// track spend, not a substitute for the provider's invoice.
function estimateCost(kind, model, units, unitsOut) {
  const p = PRICES[model];
  if (!p) return 0;
  if (kind === 'translate') {
    const inCost  = p.inPerMTok  ? (units / 4) / 1e6 * p.inPerMTok      : 0;
    const outCost = p.outPerMTok ? ((unitsOut || 0) / 4) / 1e6 * p.outPerMTok : 0;
    return inCost + outCost;
  }
  if (kind === 'transcribe') {
    if (p.perHour)   return (units / 3600) * p.perHour;   // units are seconds
    if (p.perMinute) return (units / 60) * p.perMinute;
  }
  return 0;
}

// Records what an operation consumed. Never throws: a failed log must not cost
// the user the work they just paid for.
export async function logUsage(req, user, { kind, model, units, unitsOut, project }) {
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
        units_out: Math.round(unitsOut || 0),
        cost: estimateCost(kind, model, units || 0, unitsOut || 0),
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
