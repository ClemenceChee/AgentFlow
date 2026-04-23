/**
 * Health check and observability endpoints.
 */

import type { RouteHandler } from '../api/router.js';
import { sendJson } from '../api/router.js';
import type { DbPool } from '../db/pool.js';
import type { CacheClient } from '../cache/cache.js';
import type { SourceAdapter } from '../integrations/types.js';

export interface HealthDependencies {
  db: DbPool;
  cache: CacheClient;
  adapters: SourceAdapter[];
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  checks: Record<string, { status: string; latencyMs?: number; error?: string }>;
}

const startTime = Date.now();

export function createHealthHandler(deps: HealthDependencies): RouteHandler {
  return async (ctx) => {
    const checks: HealthStatus['checks'] = {};
    let overallHealthy = true;

    // Check database
    const dbStart = Date.now();
    try {
      await deps.db.query('SELECT 1');
      checks.database = { status: 'healthy', latencyMs: Date.now() - dbStart };
    } catch (err) {
      checks.database = {
        status: 'unhealthy',
        latencyMs: Date.now() - dbStart,
        error: err instanceof Error ? err.message : 'Unknown',
      };
      overallHealthy = false;
    }

    // Check cache
    const cacheStats = deps.cache.getStats();
    checks.cache = {
      status: 'healthy',
      latencyMs: 0,
    };

    // Check source adapters
    for (const adapter of deps.adapters) {
      try {
        const health = await adapter.health();
        checks[adapter.name] = { status: health.status };
        if (health.status === 'failing') overallHealthy = false;
      } catch (err) {
        checks[adapter.name] = {
          status: 'unhealthy',
          error: err instanceof Error ? err.message : 'Unknown',
        };
      }
    }

    const result: HealthStatus = {
      status: overallHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - startTime) / 1000),
      version: process.env.BI_VERSION ?? '0.1.0',
      checks,
    };

    sendJson(ctx.res, overallHealthy ? 200 : 503, result);
  };
}

export function createReadinessHandler(deps: HealthDependencies): RouteHandler {
  return async (ctx) => {
    try {
      await deps.db.query('SELECT 1');
      sendJson(ctx.res, 200, { ready: true });
    } catch {
      sendJson(ctx.res, 503, { ready: false });
    }
  };
}

export function createLivenessHandler(): RouteHandler {
  return (ctx) => {
    sendJson(ctx.res, 200, { alive: true, uptime: Math.floor((Date.now() - startTime) / 1000) });
  };
}

export function createMetricsHandler(deps: HealthDependencies): RouteHandler {
  return (ctx) => {
    const cacheStats = deps.cache.getStats();
    sendJson(ctx.res, 200, {
      uptime: Math.floor((Date.now() - startTime) / 1000),
      cache: cacheStats,
      memory: process.memoryUsage(),
    });
  };
}
