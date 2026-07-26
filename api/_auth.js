const PB_URL = process.env.PB_URL || 'https://api.captio.studio';

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
