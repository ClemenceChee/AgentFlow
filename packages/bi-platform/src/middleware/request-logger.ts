/**
 * Request logging middleware — logs each request with timing.
 */

import type { Middleware, RouteContext } from '../api/router.js';
import type { Logger } from '../monitoring/logger.js';

export function createRequestLogger(logger: Logger): Middleware {
  return async (ctx: RouteContext, next: () => Promise<void>): Promise<void> => {
    const start = Date.now();
    const method = ctx.req.method;
    const url = ctx.req.url;

    try {
      await next();
    } finally {
      const duration = Date.now() - start;
      const status = ctx.res.statusCode;

      const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';
      logger[level](`${method} ${url} ${status}`, {
        method,
        url,
        status,
        durationMs: duration,
        userId: ctx.userId,
      });
    }
  };
}
