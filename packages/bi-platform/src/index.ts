/**
 * BI Platform — Business Intelligence layer for SOMA/AgentFlow/OpsIntel.
 *
 * Provides business-native APIs, dashboards, and analytics
 * for non-technical stakeholders.
 *
 * @module
 */

export type { HttpMethod, Middleware, RouteContext, RouteHandler } from './api/router.js';
// Router
export { Router, sendJson } from './api/router.js';
export type { AuthUser, OAuthConfig, Permission, UserRole } from './auth/index.js';
// Auth
export {
  AuthError,
  loadOAuthConfig,
  ROLE_PERMISSIONS,
  requireAuth,
  requirePermission,
  requireRole,
  verifyToken,
} from './auth/index.js';
export type { CacheClient, CacheConfig, CacheStats } from './cache/index.js';
// Cache
export { createCacheClient, createMemoryCache, loadCacheConfig } from './cache/index.js';
export type { DbConfig, DbPool } from './db/index.js';
// Database
export { createDbPool, loadDbConfig, rollbackLastMigration, runMigrations } from './db/index.js';
export type {
  AgentPerformance,
  KnowledgeInsight,
  SourceAdapter,
  SystemHealth,
} from './integrations/index.js';
// Integrations
export { AgentFlowAdapter, OpsIntelAdapter, SomaAdapter } from './integrations/index.js';
// Middleware
export { createRateLimiter } from './middleware/rate-limiter.js';
export { createRequestLogger } from './middleware/request-logger.js';
export { createCorsMiddleware, createSecurityHeaders } from './middleware/security.js';
export type { Logger, LogLevel } from './monitoring/logger.js';
// Monitoring
export { createLogger } from './monitoring/logger.js';
