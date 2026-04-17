/**
 * BI Platform — Business Intelligence layer for SOMA/AgentFlow/OpsIntel.
 *
 * Provides business-native APIs, dashboards, and analytics
 * for non-technical stakeholders.
 *
 * @module
 */

// Database
export { loadDbConfig, createDbPool, runMigrations, rollbackLastMigration } from './db/index.js';
export type { DbConfig, DbPool } from './db/index.js';

// Cache
export { loadCacheConfig, createCacheClient, createMemoryCache } from './cache/index.js';
export type { CacheConfig, CacheClient, CacheStats } from './cache/index.js';

// Auth
export { verifyToken, loadOAuthConfig, AuthError, requireAuth, requirePermission, requireRole } from './auth/index.js';
export type { AuthUser, UserRole, Permission, OAuthConfig } from './auth/index.js';
export { ROLE_PERMISSIONS } from './auth/index.js';

// Router
export { Router, sendJson } from './api/router.js';
export type { RouteContext, RouteHandler, Middleware, HttpMethod } from './api/router.js';

// Integrations
export { SomaAdapter, AgentFlowAdapter, OpsIntelAdapter } from './integrations/index.js';
export type { SourceAdapter, SystemHealth, AgentPerformance, KnowledgeInsight } from './integrations/index.js';

// Monitoring
export { createLogger } from './monitoring/logger.js';
export type { Logger, LogLevel } from './monitoring/logger.js';

// Middleware
export { createRateLimiter } from './middleware/rate-limiter.js';
export { createSecurityHeaders, createCorsMiddleware } from './middleware/security.js';
export { createRequestLogger } from './middleware/request-logger.js';
