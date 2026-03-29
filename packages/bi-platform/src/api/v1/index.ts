/**
 * API v1 route registration — wires all business API endpoints.
 *
 * Tasks: 3.4 (error handling), 3.5 (versioning), 3.6 (documentation),
 *        3.7 (rate limiting), 3.8 (auth middleware), 3.9 (caching), 3.10 (monitoring)
 */

import type { Router } from '../router.js';
import { sendJson } from '../router.js';
import type { DataAggregator } from '../../synthesis/aggregator.js';
import type { MetricEngine } from '../../synthesis/metric-engine.js';
import type { AnomalyDetector } from '../../synthesis/anomaly-detector.js';
import type { DbPool } from '../../db/pool.js';
import type { CacheClient } from '../../cache/cache.js';
import type { Logger } from '../../monitoring/logger.js';
import { registerPerformanceRoutes } from './performance.js';
import { registerFinancialRoutes } from './financial.js';
import { registerComplianceRoutes } from './compliance.js';

export interface ApiDependencies {
  router: Router;
  aggregator: DataAggregator;
  metricEngine: MetricEngine;
  anomalyDetector: AnomalyDetector;
  db: DbPool;
  cache: CacheClient;
  logger: Logger;
  layerReporting?: import('../../synthesis/layer-reporting.js').LayerReportingService;
  decisionSynthesis?: import('../../decisions/decision-synthesis.js').DecisionSynthesisService;
  alertManager?: import('../../ops/deployment.js').AlertManager;
  featureFlags?: Record<string, boolean>;
  openclawAdapter?: import('../../integrations/openclaw-session-adapter.js').OpenClawSessionAdapter;
  cronAdapter?: import('../../integrations/cron-adapter.js').CronAdapter;
  somaAdapter?: import('../../integrations/soma-adapter.js').SomaAdapter;
}

export function registerApiV1Routes(deps: ApiDependencies): void {
  const { router, aggregator, metricEngine, anomalyDetector, db, cache, logger } = deps;

  // Register domain routes
  registerPerformanceRoutes(router, aggregator, metricEngine, db, cache);
  registerFinancialRoutes(router, db, cache);
  registerComplianceRoutes(router, db, cache);

  // --- API info / versioning (3.5, 3.6) ---
  router.get('/api/v1', (ctx) => {
    sendJson(ctx.res, 200, {
      version: 'v1',
      status: 'stable',
      endpoints: {
        agents: '/api/v1/agents',
        agentPerformance: '/api/v1/agents/:agentId/performance',
        roi: '/api/v1/analytics/roi',
        costs: '/api/v1/analytics/costs',
        compliance: '/api/v1/compliance',
        complianceByRegulation: '/api/v1/compliance/:regulation',
        violations: '/api/v1/compliance/violations',
        kpis: '/api/v1/kpis',
        anomalies: '/api/v1/anomalies',
        freshness: '/api/v1/system/freshness',
      },
      documentation: '/api/v1/docs',
    });
  });

  // --- Executive KPIs ---
  router.get('/api/v1/kpis', async (ctx) => {
    const cacheKey = 'api:kpis';
    const cached = await cache.get(cacheKey);
    if (cached) {
      sendJson(ctx.res, 200, cached);
      return;
    }

    let kpis = await metricEngine.getExecutiveKPIs();

    // Fall back to live aggregator data if DB returned all zeros
    const allZero = kpis.every((k) => k.value === 0 || (k.name === 'Compliance Score' && k.value === 100));
    if (allZero) {
      const latest = aggregator.getLatest();
      if (latest && latest.agents.length > 0) {
        const agents = latest.agents;
        const totalExec = agents.reduce((s, a) => s + a.performance.totalExecutions, 0);
        const totalSuccess = agents.reduce((s, a) => s + Math.round(a.performance.totalExecutions * a.performance.successRate), 0);
        const avgMs = agents.reduce((s, a) => s + a.performance.avgDurationMs, 0) / (agents.length || 1);
        const totalCost = agents.reduce((s, a) => s + (a.efficiency.costPerExecution ?? 0) * a.performance.totalExecutions, 0);
        const now = new Date().toISOString();
        // Compute utilization
        const ocAgents = agents.filter((a) => !a.agentId.startsWith('soma-'));
        const utilization = agents.length > 0 ? (ocAgents.length / agents.length) * 100 : 0;

        kpis = [
          { name: 'total_executions', value: totalExec, unit: 'count', trend: 'stable', trendPct: 0, period: 'current', calculatedAt: now },
          { name: 'overall_success_rate', value: totalExec > 0 ? (totalSuccess / totalExec) * 100 : 0, unit: '%', trend: 'stable', trendPct: 0, period: 'current', calculatedAt: now },
          { name: 'avg_response_time', value: Math.round(avgMs), unit: 'ms', trend: 'stable', trendPct: 0, period: 'current', calculatedAt: now },
          { name: 'active_agents', value: agents.length, unit: 'agents', trend: 'stable', trendPct: 0, period: 'current', calculatedAt: now },
          { name: 'compliance_score', value: 100 - agents.filter((a) => a.compliance.drifted).length * 15, unit: '%', trend: 'stable', trendPct: 0, period: 'current', calculatedAt: now },
          { name: 'total_cost', value: totalCost, unit: 'USD', trend: 'stable', trendPct: 0, period: 'current', calculatedAt: now },
          { name: 'agent_utilization', value: Math.round(utilization), unit: '%', trend: 'stable', trendPct: 0, period: 'current', calculatedAt: now },
          { name: 'token_spend', value: totalCost, unit: 'USD', trend: 'stable', trendPct: 0, period: 'current', calculatedAt: now },
        ];
      }
    }

    const response = { kpis, timestamp: new Date().toISOString() };
    await cache.set(cacheKey, response, 30);
    sendJson(ctx.res, 200, response);
  });

  // --- Anomalies ---
  router.get('/api/v1/anomalies', async (ctx) => {
    const severity = ctx.query.severity;
    const acknowledged = ctx.query.acknowledged;

    let sql = `SELECT id, source_system, metric_name, severity, description,
                      baseline_value, observed_value, deviation_pct,
                      business_impact, acknowledged, detected_at, resolved_at
               FROM anomalies WHERE 1=1`;
    const params: unknown[] = [];

    if (severity) {
      params.push(severity);
      sql += ` AND severity = $${params.length}`;
    }
    if (acknowledged === 'false') {
      sql += ` AND acknowledged = false`;
    }
    sql += ` ORDER BY detected_at DESC LIMIT 100`;

    const { rows } = await db.query(sql, params);
    sendJson(ctx.res, 200, {
      anomalies: rows,
      count: rows.length,
      timestamp: new Date().toISOString(),
    });
  });

  // --- Enhanced KPIs (Sections 3-5, 7) ---
  if (deps.openclawAdapter && deps.cronAdapter && deps.somaAdapter) {
    const oc = deps.openclawAdapter;
    const cron = deps.cronAdapter;
    const soma = deps.somaAdapter;

    // 7.1 — Cron job metrics and reliability
    router.get('/api/v1/cron', async (ctx) => {
      const overview = await cron.getOverview();
      sendJson(ctx.res, 200, { ...overview, timestamp: new Date().toISOString() });
    });

    // 7.2 — Token economics
    router.get('/api/v1/token-economics', async (ctx) => {
      const { computeTokenEconomics } = await import('../../synthesis/enhanced-kpis.js');
      const latest = aggregator.getLatest();
      const econ = await computeTokenEconomics(oc, cron, latest?.agents ?? []);
      sendJson(ctx.res, 200, { ...econ, timestamp: new Date().toISOString() });
    });

    // 7.3 — Knowledge health
    router.get('/api/v1/knowledge-health', async (ctx) => {
      const { computeKnowledgeHealth } = await import('../../synthesis/enhanced-kpis.js');
      const latest = aggregator.getLatest();
      const health = await computeKnowledgeHealth(soma, latest?.agents.length ?? 0);
      sendJson(ctx.res, 200, { ...health, timestamp: new Date().toISOString() });
    });

    // 7.4 — OpenClaw agents (merged into /agents via enhanced response)
    router.get('/api/v1/openclaw-agents', async (ctx) => {
      const agents = await oc.getAgentData();
      sendJson(ctx.res, 200, {
        agents: agents.map((a) => ({
          agentId: a.agentId,
          status: a.status,
          sessions: a.sessionCount,
          lastActivity: a.lastActivityAt,
          totalMessages: a.totalMessages,
          totalTokens: a.totalTokens,
          totalCost: a.totalCost,
          activeModel: a.activeModel,
          activeProvider: a.activeProvider,
        })),
        totalAgents: agents.length,
        timestamp: new Date().toISOString(),
      });
    });

    // 7.5 — Operational effectiveness
    router.get('/api/v1/operational-effectiveness', async (ctx) => {
      const { computeOperationalEffectiveness } = await import('../../synthesis/enhanced-kpis.js');
      const latest = aggregator.getLatest();
      const eff = await computeOperationalEffectiveness(oc, cron, latest?.agents ?? []);
      sendJson(ctx.res, 200, { ...eff, timestamp: new Date().toISOString() });
    });
  }

  // --- Data freshness (3.10) ---
  router.get('/api/v1/system/freshness', async (ctx) => {
    const freshness = await anomalyDetector.checkFreshness();
    sendJson(ctx.res, 200, {
      sources: freshness,
      timestamp: new Date().toISOString(),
    });
  });

  // --- API usage tracking (3.10) ---
  router.get('/api/v1/system/usage', async (ctx) => {
    const { rows } = await db.query<{
      endpoint: string;
      total_requests: string;
      avg_response_time_ms: string;
      error_count: string;
    }>(
      `SELECT
        endpoint,
        COUNT(*) AS total_requests,
        ROUND(AVG(response_time_ms)) AS avg_response_time_ms,
        COUNT(*) FILTER (WHERE status_code >= 400) AS error_count
       FROM api_usage
       WHERE request_at > NOW() - INTERVAL '24 hours'
       GROUP BY endpoint
       ORDER BY total_requests DESC`,
    );

    sendJson(ctx.res, 200, {
      period: '24h',
      endpoints: rows.map((r) => ({
        endpoint: r.endpoint,
        totalRequests: Number(r.total_requests),
        avgResponseTimeMs: Number(r.avg_response_time_ms),
        errorCount: Number(r.error_count),
      })),
      timestamp: new Date().toISOString(),
    });
  });

  // --- Layer-Aware Reporting (Section 8) ---
  if (deps.layerReporting) {
    const reporting = deps.layerReporting;

    // 8.1 — SOMA business report
    router.get('/api/v1/reporting/soma', async (ctx) => {
      const report = await reporting.getSomaBusinessReport();
      sendJson(ctx.res, 200, report);
    });

    // 8.6 — Access metrics / performance monitoring
    router.get('/api/v1/reporting/access-metrics', async (ctx) => {
      const metrics = await reporting.getAccessMetrics();
      sendJson(ctx.res, 200, { ...metrics, timestamp: new Date().toISOString() });
    });

    // 8.10 — Business context enrichment per agent
    router.get('/api/v1/reporting/agents/:agentId/context', async (ctx) => {
      const enriched = await reporting.enrichWithBusinessContext(ctx.params.agentId);
      sendJson(ctx.res, 200, enriched);
    });

    // 8.4 — Materialized view query
    router.get('/api/v1/reporting/views/:viewName', async (ctx) => {
      const rows = await reporting.getBusinessMetricView(ctx.params.viewName, ctx.query);
      sendJson(ctx.res, 200, { rows, count: (rows as unknown[]).length, timestamp: new Date().toISOString() });
    });

    // 8.9 — SSE streaming endpoint
    router.get('/api/v1/reporting/stream', (ctx) => {
      ctx.res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });

      const unsubscribe = reporting.subscribeFeed((event) => {
        ctx.res.write(`event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`);
      });

      // Send initial heartbeat
      ctx.res.write(`event: connected\ndata: {"status":"ok"}\n\n`);

      ctx.req.on('close', () => {
        unsubscribe();
      });
    });
  }

  // --- Decision Synthesis (Section 9) ---
  if (deps.decisionSynthesis) {
    const synthesis = deps.decisionSynthesis;

    // 9.1 — Cross-agent pattern detection with business impact
    router.get('/api/v1/decisions/patterns', async (ctx) => {
      const patterns = await synthesis.detectPatterns();
      sendJson(ctx.res, 200, { patterns, timestamp: new Date().toISOString() });
    });

    // 9.2 — Business-context decision recommendations
    router.get('/api/v1/decisions/recommendations', async (ctx) => {
      const role = ctx.query.role;
      const recommendations = await synthesis.getBusinessRecommendations(role);
      sendJson(ctx.res, 200, { recommendations, timestamp: new Date().toISOString() });
    });

    // 9.5 — ROI analysis for delegation effectiveness
    router.get('/api/v1/decisions/roi-analysis', async (ctx) => {
      const analysis = await synthesis.getDelegationRoiAnalysis();
      sendJson(ctx.res, 200, { analysis, timestamp: new Date().toISOString() });
    });

    // 9.8 — Compliance risk notifications
    router.get('/api/v1/decisions/compliance-risks', async (ctx) => {
      const risks = await synthesis.getComplianceRisks();
      sendJson(ctx.res, 200, { risks, timestamp: new Date().toISOString() });
    });

    // 9.10 — Real-time business alerting
    router.get('/api/v1/decisions/alerts', async (ctx) => {
      const alerts = await synthesis.getCriticalAlerts();
      sendJson(ctx.res, 200, { alerts, timestamp: new Date().toISOString() });
    });
  }

  // --- Operations (Section 12) ---
  router.get('/api/v1/ops/health', async (ctx) => {
    const { getResourceUsage, getPerformanceRecommendations } = await import('../../ops/deployment.js');
    const resources = getResourceUsage();
    const recommendations = getPerformanceRecommendations(resources);
    sendJson(ctx.res, 200, {
      resources,
      recommendations,
      featureFlags: deps.featureFlags ?? {},
      timestamp: new Date().toISOString(),
    });
  });

  if (deps.alertManager) {
    router.get('/api/v1/ops/alerts', (ctx) => {
      sendJson(ctx.res, 200, {
        alerts: deps.alertManager!.getAlerts(),
        timestamp: new Date().toISOString(),
      });
    });
  }

  // --- API documentation (3.6) ---
  router.get('/api/v1/docs', (ctx) => {
    sendJson(ctx.res, 200, {
      title: 'Business Intelligence Platform API',
      version: 'v1',
      description: 'RESTful APIs exposing organizational intelligence in business-friendly formats',
      baseUrl: '/api/v1',
      authentication: 'OAuth 2.0 Bearer token',
      rateLimit: {
        description: 'Rate limiting is applied per-client',
        headers: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
      },
      endpoints: [
        { method: 'GET', path: '/agents', description: 'List all agents with performance summary' },
        { method: 'GET', path: '/agents/:agentId/performance', description: 'Detailed agent performance metrics and history' },
        { method: 'GET', path: '/analytics/roi', description: 'ROI analysis with cost/revenue/savings breakdown', params: ['period'] },
        { method: 'GET', path: '/analytics/costs', description: 'Cost breakdown by agent', params: ['period'] },
        { method: 'GET', path: '/compliance', description: 'Overall compliance status across regulations' },
        { method: 'GET', path: '/compliance/:regulation', description: 'Regulation-specific compliance records' },
        { method: 'GET', path: '/compliance/violations', description: 'Active compliance violations sorted by severity' },
        { method: 'GET', path: '/kpis', description: 'Executive KPI summary' },
        { method: 'GET', path: '/anomalies', description: 'Detected anomalies', params: ['severity', 'acknowledged'] },
        { method: 'GET', path: '/system/freshness', description: 'Data freshness status per source system' },
        { method: 'GET', path: '/system/usage', description: 'API usage statistics (last 24h)' },
        { method: 'GET', path: '/reporting/soma', description: 'SOMA business intelligence report' },
        { method: 'GET', path: '/reporting/access-metrics', description: 'BI access performance metrics' },
        { method: 'GET', path: '/reporting/agents/:agentId/context', description: 'Business context enrichment for agent' },
        { method: 'GET', path: '/reporting/views/:viewName', description: 'Query materialized business views' },
        { method: 'GET', path: '/reporting/stream', description: 'SSE stream for real-time BI updates' },
        { method: 'GET', path: '/decisions/patterns', description: 'Cross-agent pattern detection with business impact' },
        { method: 'GET', path: '/decisions/recommendations', description: 'Business-context decision recommendations', params: ['role'] },
        { method: 'GET', path: '/decisions/roi-analysis', description: 'Delegation effectiveness ROI analysis' },
        { method: 'GET', path: '/decisions/compliance-risks', description: 'Compliance risk notifications' },
        { method: 'GET', path: '/decisions/alerts', description: 'Critical business alerts' },
        { method: 'GET', path: '/ops/health', description: 'Platform health and resource usage' },
        { method: 'GET', path: '/ops/alerts', description: 'Platform operational alerts' },
      ],
    });
  });
}
