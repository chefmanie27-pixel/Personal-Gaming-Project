import type { RequestHandler } from "express";
export function authRateLimit(
  max = 30,
  windowMs = 15 * 60 * 1000,
): RequestHandler {
  const buckets = new Map<string, { count: number; reset: number }>();
  return (req, res, next) => {
    const now = Date.now(),
      key = req.ip ?? "unknown";
    let bucket = buckets.get(key);
    if (!bucket || bucket.reset <= now) {
      if (buckets.size >= 10000) {
        for (const [key, value] of buckets)
          if (value.reset <= now) buckets.delete(key);
        if (buckets.size >= 10000)
          return res.status(429).json({ error: "Please retry later." });
      }
      bucket = { count: 0, reset: now + windowMs };
      buckets.set(key, bucket);
    }
    if (++bucket.count > max) {
      res.setHeader(
        "Retry-After",
        String(Math.ceil((bucket.reset - now) / 1000)),
      );
      return res
        .status(429)
        .json({ error: "Too many attempts. Please retry later." });
    }
    return next();
  };
}
