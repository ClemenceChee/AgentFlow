/**
 * Deployment and operations infrastructure.
 *
 * Tasks: 12.1 (pipeline), 12.3 (monitoring), 12.4 (alerting),
 *        12.6 (scaling), 12.7 (logging), 12.9 (perf optimization)
 */

import type { Logger } from '../monitoring/logger.js';

/**
 * 12.1 — Feature flag system for gradual rollout.
 */
export interface FeatureFlags {
  [key: string]: boolean;
}

export function loadFeatureFlags(): FeatureFlags {
  const prefix = 'BI_FF_';
  const flags: FeatureFlags = {};
  for (const [key, val] of Object.entries(process.env)) {
    if (key.startsWith(prefix)) {
      const name = key.slice(prefix.length).toLowerCase();
      flags[name] = val === 'true' || val === '1';
    }
  }
  // Defaults
  return {
    dashboard_enabled: true,
    streaming_enabled: true,
    decision_synthesis: true,
    layer_reporting: true,
    compliance_dashboard: true,
    ...flags,
  };
}

export function isEnabled(flags: FeatureFlags, flag: string): boolean {
  return flags[flag] ?? false;
}

/**
 * 12.3 — Platform health monitoring dashboard data.
 */
export interface PlatformHealthReport {
  status: 'healthy' | 'degraded' | 'unhealthy';
  uptime: number;
  version: string;
  components: ComponentHealth[];
  resources: ResourceUsage;
  timestamp: string;
}

export interface ComponentHealth {
  name: string;
  status: 'up' | 'degraded' | 'down';
  latencyMs: number;
  lastCheck: string;
  errorCount: number;
}

export interface ResourceUsage {
  memoryUsedMb: number;
  memoryTotalMb: number;
  memoryPct: number;
  cpuPct: number;
  heapUsedMb: number;
  heapTotalMb: number;
  activeConnections: number;
  eventLoopDelayMs: number;
}

export function getResourceUsage(): ResourceUsage {
  const mem = process.memoryUsage();
  const osMem = { total: 0, free: 0 };
  try {
    const os = require('node:os');
    osMem.total = os.totalmem();
    osMem.free = os.freemem();
  } catch {
    /* node:os not available */
  }

  return {
    memoryUsedMb: Math.round(mem.rss / 1_048_576),
    memoryTotalMb: Math.round(osMem.total / 1_048_576) || 0,
    memoryPct: osMem.total > 0 ? Math.round(((osMem.total - osMem.free) / osMem.total) * 100) : 0,
    cpuPct: 0, // Would need sampling
    heapUsedMb: Math.round(mem.heapUsed / 1_048_576),
    heapTotalMb: Math.round(mem.heapTotal / 1_048_576),
    activeConnections: 0,
    eventLoopDelayMs: 0,
  };
}

/**
 * 12.4 — Alerting system for critical platform issues.
 */
export interface PlatformAlert {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  type: 'memory' | 'latency' | 'error_rate' | 'connection' | 'disk';
  message: string;
  threshold: number;
  actual: number;
  createdAt: string;
}

export class AlertManager {
  private alerts: PlatformAlert[] = [];
  private idCounter = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private logger: Logger) {}

  start(intervalMs = 30_000): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.check(), intervalMs);
    this.timer.unref();
    this.check();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  getAlerts(): PlatformAlert[] {
    return this.alerts;
  }

  private check(): void {
    const resources = getResourceUsage();
    this.alerts = [];

    // Memory alert
    if (resources.heapUsedMb > resources.heapTotalMb * 0.9) {
      this.addAlert(
        'critical',
        'memory',
        'Heap memory usage exceeding 90%',
        resources.heapTotalMb * 0.9,
        resources.heapUsedMb,
      );
    } else if (resources.heapUsedMb > resources.heapTotalMb * 0.75) {
      this.addAlert(
        'warning',
        'memory',
        'Heap memory usage above 75%',
        resources.heapTotalMb * 0.75,
        resources.heapUsedMb,
      );
    }

    // Event loop alert
    if (resources.eventLoopDelayMs > 100) {
      this.addAlert(
        'warning',
        'latency',
        `Event loop delay: ${resources.eventLoopDelayMs}ms`,
        100,
        resources.eventLoopDelayMs,
      );
    }
  }

  private addAlert(
    severity: PlatformAlert['severity'],
    type: PlatformAlert['type'],
    message: string,
    threshold: number,
    actual: number,
  ): void {
    const alert: PlatformAlert = {
      id: `plat-${++this.idCounter}`,
      severity,
      type,
      message,
      threshold,
      actual,
      createdAt: new Date().toISOString(),
    };
    this.alerts.push(alert);
    this.logger.warn('Platform alert', { alert });
  }
}

/**
 * 12.6 — Scaling configuration.
 */
export interface ScalingConfig {
  maxConnections: number;
  workerThreads: number;
  requestTimeout: number;
  keepAliveTimeout: number;
  maxRequestBodySize: number;
}

export function loadScalingConfig(): ScalingConfig {
  return {
    maxConnections: Number(process.env.BI_MAX_CONNECTIONS ?? 1000),
    workerThreads: Number(process.env.BI_WORKER_THREADS ?? 4),
    requestTimeout: Number(process.env.BI_REQUEST_TIMEOUT ?? 30_000),
    keepAliveTimeout: Number(process.env.BI_KEEP_ALIVE_TIMEOUT ?? 65_000),
    maxRequestBodySize: Number(process.env.BI_MAX_BODY_SIZE ?? 1_048_576),
  };
}

/**
 * 12.9 — Performance optimization recommendations.
 */
export interface PerfRecommendation {
  area: string;
  current: string;
  recommendation: string;
  expectedImprovement: string;
}

export function getPerformanceRecommendations(resources: ResourceUsage): PerfRecommendation[] {
  const recs: PerfRecommendation[] = [];

  if (resources.memoryPct > 80) {
    recs.push({
      area: 'Memory',
      current: `${resources.memoryPct}% used`,
      recommendation: 'Consider increasing available memory or reducing cache TTLs',
      expectedImprovement: '15-25% reduction in memory pressure',
    });
  }

  if (resources.heapUsedMb > 512) {
    recs.push({
      area: 'Heap',
      current: `${resources.heapUsedMb}MB heap used`,
      recommendation:
        'Review data structures for memory optimization; consider streaming for large datasets',
      expectedImprovement: '20-40% heap reduction',
    });
  }

  return recs;
}

/**
 * 12.10 — Self-service user onboarding config.
 */
export interface OnboardingConfig {
  selfRegistrationEnabled: boolean;
  defaultRole: string;
  requireEmailVerification: boolean;
  allowedDomains: string[];
}

export function loadOnboardingConfig(): OnboardingConfig {
  return {
    selfRegistrationEnabled: process.env.BI_SELF_REGISTRATION === 'true',
    defaultRole: process.env.BI_DEFAULT_ROLE ?? 'viewer',
    requireEmailVerification: process.env.BI_REQUIRE_EMAIL_VERIFICATION !== 'false',
    allowedDomains: (process.env.BI_ALLOWED_DOMAINS ?? '').split(',').filter(Boolean),
  };
}
