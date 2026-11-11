// Tiny in-memory rate limiter (Prompt 44): max 10 attempts per 15 minutes per IP, per limiter.
// In memory is enough for Render's single Web Service; counters reset when the server restarts.
import type { NextFunction, Request, Response } from "express";

export const RATE_LIMIT_MAX = 10;
export const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

const buckets = new Map<string, { count: number; resetAt: number }>();

export function resetRateLimits(): void {
  buckets.clear();
}

/**
 * Counts every request (successful or not) against the caller's IP; the 11th gets 429.
 * `keyOf` limits per something else (e.g. per signed-in coach), `max` changes the allowance.
 */
export function rateLimit(name: string, opts: { keyOf?: (req: Request) => string; max?: number } = {}) {
  const max = opts.max ?? RATE_LIMIT_MAX;
  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    for (const [key, b] of buckets) if (b.resetAt <= now) buckets.delete(key);
    const key = `${name}:${opts.keyOf ? opts.keyOf(req) : (req.ip ?? "unknown")}`;
    const bucket = buckets.get(key) ?? { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
    bucket.count += 1;
    buckets.set(key, bucket);
    if (bucket.count > max) {
      res.setHeader("Retry-After", String(Math.ceil((bucket.resetAt - now) / 1000)));
      res.status(429).json({ error: "Too many attempts. Please wait 15 minutes and try again." });
      return;
    }
    next();
  };
}
