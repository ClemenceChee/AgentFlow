/**
 * Token-bucket rate limiter middleware.
 * Uses in-memory store by default; can be backed by Redis for multi-instance.
 */

import type { Middleware, RouteContext } from '../api/router.js';
import { sendJson } from '../api/router.js';

export interface RateLimitConfig {
  /** Max requests per window */
  maxRequests: number;
  /** Window size in seconds */
  windowSeconds: number;
  /** Key extractor — defaults to IP-based */
  keyFn?: (ctx: RouteContext) => string;
}

interface BucketEntry {
  count: number;
  resetAt: number;
}

export function createRateLimiter(config: RateLimitConfig): Middleware {
  const buckets = new Map<string, BucketEntry>();
  const { maxRequests, windowSeconds } = config;

  // Periodic cleanup to prevent memory leaks
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of buckets) {
      if (entry.resetAt <= now) buckets.delete(key);
    }
  }, 60_000);
  cleanupInterval.unref();

  const keyFn =
    config.keyFn ??
    ((ctx: RouteContext) => {
      const forwarded = ctx.req.headers['x-forwarded-for'];
      const ip =
        typeof forwarded === 'string'
          ? forwarded.split(',')[0].trim()
          : (ctx.req.socket.remoteAddress ?? 'unknown');
      return ip;
    });

  return async (ctx: RouteContext, next: () => Promise<void>): Promise<void> => {
    const key = keyFn(ctx);
    const now = Date.now();

    let entry = buckets.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowSeconds * 1000 };
      buckets.set(key, entry);
    }

    entry.count++;

    // Set rate limit headers
    const remaining = Math.max(0, maxRequests - entry.count);
    const resetSeconds = Math.ceil((entry.resetAt - now) / 1000);

    ctx.res.setHeader('X-RateLimit-Limit', maxRequests);
    ctx.res.setHeader('X-RateLimit-Remaining', remaining);
    ctx.res.setHeader('X-RateLimit-Reset', resetSeconds);

    if (entry.count > maxRequests) {
      sendJson(ctx.res, 429, {
        error: 'Too Many Requests',
        message: `Rate limit exceeded. Please wait ${resetSeconds} seconds before retrying.`,
        retryAfter: resetSeconds,
      });
      return;
    }

    await next();
  };
}

export function loadRateLimitConfig(): RateLimitConfig {
  return {
    maxRequests: Number(process.env.BI_RATE_LIMIT_MAX ?? 100),
    windowSeconds: Number(process.env.BI_RATE_LIMIT_WINDOW_SECONDS ?? 60),
  };
}
