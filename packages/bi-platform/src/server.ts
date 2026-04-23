/**
 * BI Platform HTTP server — wires up all middleware, routes, and infrastructure.
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Router } from './api/router.js';
import { registerApiV1Routes } from './api/v1/index.js';
import { loadOAuthConfig, verifyToken } from './auth/index.js';
import { createCacheClient, createMemoryCache, loadCacheConfig } from './cache/index.js';
import { createDbPool, loadDbConfig } from './db/index.js';
import { runMigrations } from './db/migrate.js';
import { DecisionSynthesisService } from './decisions/decision-synthesis.js';
import { RecommendationEngine } from './decisions/recommendation-engine.js';
import { AgentFlowAdapter, loadAgentFlowAdapterConfig } from './integrations/agentflow-adapter.js';
import { CronAdapter, loadCronAdapterConfig } from './integrations/cron-adapter.js';
import {
  loadOpenClawSessionConfig,
  OpenClawSessionAdapter,
} from './integrations/openclaw-session-adapter.js';
import { loadOpsIntelAdapterConfig, OpsIntelAdapter } from './integrations/opsintel-adapter.js';
import { loadSomaAdapterConfig, SomaAdapter } from './integrations/soma-adapter.js';
import { createRateLimiter, loadRateLimitConfig } from './middleware/rate-limiter.js';
import { createRequestLogger } from './middleware/request-logger.js';
import {
  createCorsMiddleware,
  createSecurityHeaders,
  loadCorsConfig,
} from './middleware/security.js';
import {
  createHealthHandler,
  createLivenessHandler,
  createMetricsHandler,
  createReadinessHandler,
} from './monitoring/health.js';
import { createLogger } from './monitoring/logger.js';
import { DataAggregator, loadAggregatorConfig } from './synthesis/aggregator.js';
import { AnomalyDetector } from './synthesis/anomaly-detector.js';
import { MetricEngine } from './synthesis/metric-engine.js';

const logger = createLogger({ context: { service: 'bi-platform' } });

async function main() {
  const port = Number(process.env.BI_PORT ?? 3100);

  // Initialize database (graceful fallback if unavailable)
  let dbPool;
  try {
    logger.info('Connecting to database...');
    dbPool = await createDbPool(loadDbConfig());
    logger.info('Running migrations...');
    const applied = await runMigrations(dbPool);
    if (applied.length > 0) {
      logger.info(`Applied ${applied.length} migration(s)`, { migrations: applied });
    }
  } catch (err) {
    logger.warn('Database unavailable, running in read-only mode', { error: String(err) });
    // Create a noop DB pool that returns empty results
    dbPool = {
      query: async () => ({ rows: [], rowCount: 0, command: '', oid: 0, fields: [] }),
      end: async () => {},
      raw: null as any,
    } as any;
  }

  // Initialize cache (falls back to in-memory if Redis unavailable)
  let cache;
  try {
    cache = await createCacheClient(loadCacheConfig());
    logger.info('Redis cache connected');
  } catch {
    logger.warn('Redis unavailable, using in-memory cache');
    cache = createMemoryCache();
  }

  // Initialize source adapters
  const somaAdapter = new SomaAdapter(loadSomaAdapterConfig());
  const agentFlowAdapter = new AgentFlowAdapter(loadAgentFlowAdapterConfig());
  const opsIntelAdapter = new OpsIntelAdapter(loadOpsIntelAdapterConfig());
  const openclawAdapter = new OpenClawSessionAdapter(loadOpenClawSessionConfig());
  const cronAdapter = new CronAdapter(loadCronAdapterConfig());
  const adapters = [somaAdapter, agentFlowAdapter, opsIntelAdapter, openclawAdapter, cronAdapter];

  // Auth config
  const oauthConfig = loadOAuthConfig();
  const _verifyFn = (token: string) => verifyToken(token, oauthConfig);

  // Build router
  const router = new Router();

  // Global middleware
  router.use(createSecurityHeaders());
  router.use(createCorsMiddleware(loadCorsConfig()));
  router.use(createRequestLogger(logger));
  router.use(createRateLimiter(loadRateLimitConfig()));

  // Health endpoints (unauthenticated)
  const healthDeps = { db: dbPool, cache, adapters };
  router.get('/health', createHealthHandler(healthDeps));
  router.get('/ready', createReadinessHandler(healthDeps));
  router.get('/alive', createLivenessHandler());
  router.get('/metrics', createMetricsHandler(healthDeps));

  // Initialize synthesis services
  const aggregator = new DataAggregator(
    somaAdapter,
    agentFlowAdapter,
    opsIntelAdapter,
    dbPool,
    logger,
    loadAggregatorConfig(),
  );
  const metricEngine = new MetricEngine(dbPool, cache);
  const anomalyDetector = new AnomalyDetector(dbPool, logger);

  // Attach enhanced adapters for OpenClaw + Cron
  aggregator.setEnhancedAdapters(openclawAdapter, cronAdapter);

  // Start background aggregation
  aggregator.start();

  // Initialize decision intelligence
  const recommendationEngine = new RecommendationEngine(dbPool, aggregator);
  const decisionSynthesis = new DecisionSynthesisService(
    aggregator,
    recommendationEngine,
    anomalyDetector,
    dbPool,
    cache,
    logger,
  );

  // Register API v1 routes
  registerApiV1Routes({
    router,
    aggregator,
    metricEngine,
    anomalyDetector,
    db: dbPool,
    cache,
    logger,
    openclawAdapter,
    cronAdapter,
    somaAdapter,
    decisionSynthesis,
  });

  // Serve frontend static files (built by Vite into dist/client/)
  const __dirname = fileURLToPath(new URL('.', import.meta.url));
  const clientDir = join(__dirname, '..', 'dist', 'client');
  const indexHtml = join(clientDir, 'index.html');
  const hasClient = existsSync(indexHtml);

  if (hasClient) {
    logger.info('Serving frontend from dist/client/');
  }

  // Start server
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

    // API and health routes go through the router
    if (
      url.pathname.startsWith('/api/') ||
      url.pathname === '/health' ||
      url.pathname === '/ready' ||
      url.pathname === '/alive' ||
      url.pathname === '/metrics'
    ) {
      router.handle(req, res);
      return;
    }

    // Serve static files from dist/client/
    if (hasClient) {
      const safePath = url.pathname.replace(/\.\./g, '');
      const filePath = join(clientDir, safePath === '/' ? 'index.html' : safePath);

      if (existsSync(filePath) && statSync(filePath).isFile()) {
        const content = readFileSync(filePath);
        const ext = extname(filePath).toLowerCase();
        const mime: Record<string, string> = {
          '.html': 'text/html',
          '.js': 'application/javascript',
          '.css': 'text/css',
          '.json': 'application/json',
          '.png': 'image/png',
          '.svg': 'image/svg+xml',
          '.ico': 'image/x-icon',
          '.woff2': 'font/woff2',
          '.woff': 'font/woff',
        };
        res.writeHead(200, {
          'Content-Type': mime[ext] || 'application/octet-stream',
          'Content-Length': content.length,
          ...(ext !== '.html' ? { 'Cache-Control': 'public, max-age=31536000, immutable' } : {}),
        });
        res.end(content);
        return;
      }

      // SPA fallback — serve index.html for unmatched routes
      const html = readFileSync(indexHtml);
      res.writeHead(200, { 'Content-Type': 'text/html', 'Content-Length': html.length });
      res.end(html);
      return;
    }

    // No client build — pass through to router (will 404)
    router.handle(req, res);
  });

  server.listen(port, () => {
    logger.info(`BI Platform listening on port ${port}`);
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down...`);
    server.close();
    await cache.close();
    await dbPool.end();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error('Failed to start BI Platform', { error: String(err) });
  process.exit(1);
});
