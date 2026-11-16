/**
 * Small in-memory fixed-window rate limiter (no extra dependency).
 * Good enough for a single API process; swap for a shared store when scaling out.
 */
function rateLimit({ windowMs = 60_000, max = 60, keyPrefix = 'rl', keyFn } = {}) {
  const hits = new Map();

  // Opportunistic cleanup so the map cannot grow unbounded.
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) {
      if (entry.resetAt <= now) hits.delete(key);
    }
  }, Math.max(windowMs, 30_000));
  if (timer.unref) timer.unref();

  return function rateLimitMiddleware(req, res, next) {
    const identity = keyFn
      ? keyFn(req)
      : (req.user && req.user.id) || req.ip || 'anonymous';
    const key = `${keyPrefix}:${identity}`;
    const now = Date.now();
    const entry = hits.get(key);

    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    entry.count += 1;
    if (entry.count > max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({ message: 'Too many requests. Please slow down.' });
    }
    return next();
  };
}

module.exports = { rateLimit };
