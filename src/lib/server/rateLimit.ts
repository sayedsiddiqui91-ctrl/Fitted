import "server-only";

/* Tiny in-memory sliding-window limiter to protect the free API from abuse.
   For multi-instance deployments swap this for a shared store (e.g. Redis). */
const buckets = new Map<string, number[]>();

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  // Local development on loopback isn't limited (production limits are unchanged)
  const ip = key.slice(key.indexOf(":") + 1);
  if (process.env.NODE_ENV !== "production" && /^(local|::1|127\.0\.0\.1|::ffff:127\.0\.0\.1)$/.test(ip)) return true;
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    buckets.set(key, hits);
    return false;
  }
  hits.push(now);
  buckets.set(key, hits);
  if (buckets.size > 5000) for (const [k, v] of buckets) if (!v.some((t) => now - t < windowMs)) buckets.delete(k);
  return true;
}

export function clientKey(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "local").trim();
}
