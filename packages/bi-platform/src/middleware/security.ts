/**
 * Security headers and CORS middleware.
 */

import type { Middleware, RouteContext } from '../api/router.js';
import { sendJson } from '../api/router.js';

export interface CorsConfig {
  allowedOrigins: string[];
  allowedMethods: string[];
  allowedHeaders: string[];
  maxAge: number;
  credentials: boolean;
}

export function loadCorsConfig(): CorsConfig {
  const origins = process.env.BI_CORS_ORIGINS;
  return {
    allowedOrigins: origins ? origins.split(',').map((s) => s.trim()) : ['*'],
    allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
    maxAge: 86400,
    credentials: process.env.BI_CORS_CREDENTIALS === 'true',
  };
}

export function createSecurityHeaders(): Middleware {
  return async (ctx: RouteContext, next: () => Promise<void>): Promise<void> => {
    ctx.res.setHeader('X-Content-Type-Options', 'nosniff');
    ctx.res.setHeader('X-Frame-Options', 'DENY');
    ctx.res.setHeader('X-XSS-Protection', '0');
    ctx.res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    ctx.res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    ctx.res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'",
    );
    ctx.res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

    await next();
  };
}

export function createCorsMiddleware(config: CorsConfig): Middleware {
  return async (ctx: RouteContext, next: () => Promise<void>): Promise<void> => {
    const origin = ctx.req.headers.origin;

    if (origin) {
      const allowed = config.allowedOrigins.includes('*') || config.allowedOrigins.includes(origin);

      if (allowed) {
        ctx.res.setHeader(
          'Access-Control-Allow-Origin',
          config.allowedOrigins.includes('*') ? '*' : origin,
        );
        if (config.credentials) {
          ctx.res.setHeader('Access-Control-Allow-Credentials', 'true');
        }
      }
    }

    // Handle preflight
    if (ctx.req.method === 'OPTIONS') {
      ctx.res.setHeader('Access-Control-Allow-Methods', config.allowedMethods.join(', '));
      ctx.res.setHeader('Access-Control-Allow-Headers', config.allowedHeaders.join(', '));
      ctx.res.setHeader('Access-Control-Max-Age', String(config.maxAge));
      sendJson(ctx.res, 204, null);
      return;
    }

    await next();
  };
}
