/**
 * API usage tracking middleware — records requests to the api_usage table.
 *
 * Task: 3.10
 */

import type { Middleware, RouteContext } from '../api/router.js';
import type { DbPool } from '../db/pool.js';

export function createApiTracker(db: DbPool): Middleware {
  return async (ctx: RouteContext, next: () => Promise<void>): Promise<void> => {
    const start = Date.now();

    await next();

    // Fire-and-forget: don't block response on tracking
    const responseTimeMs = Date.now() - start;
    const url = ctx.req.url?.split('?')[0] ?? '/';

    if (url.startsWith('/api/')) {
      db.query(
        `INSERT INTO api_usage (user_id, endpoint, method, status_code, response_time_ms)
         VALUES ($1, $2, $3, $4, $5)`,
        [ctx.userId ?? null, url, ctx.req.method ?? 'GET', ctx.res.statusCode, responseTimeMs],
      ).catch(() => {
        // Silently ignore tracking failures
      });
    }
  };
}
