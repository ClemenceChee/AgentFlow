/**
 * Agent performance metrics API endpoints.
 * GET /api/v1/agents — list all agents with performance summary
 * GET /api/v1/agents/:agentId/performance — detailed agent performance
 *
 * Task: 3.1
 */

import type { CacheClient } from '../../cache/cache.js';
import type { DbPool } from '../../db/pool.js';
import type { DataAggregator } from '../../synthesis/aggregator.js';
import type { MetricEngine } from '../../synthesis/metric-engine.js';
import type { Router } from '../router.js';
import { sendJson } from '../router.js';

export function registerPerformanceRoutes(
  router: Router,
  aggregator: DataAggregator,
  _metricEngine: MetricEngine,
  db: DbPool,
  cache: CacheClient,
): void {
  // List all agents with performance summary
  router.get('/api/v1/agents', async (ctx) => {
    const cacheKey = 'api:agents:list';
    const cached = await cache.get(cacheKey);
    if (cached) {
      sendJson(ctx.res, 200, cached);
      return;
    }

    const latest = aggregator.getLatest();
    if (!latest) {
      sendJson(ctx.res, 503, {
        error: 'Service Unavailable',
        message: 'Data aggregation in progress. Please try again shortly.',
      });
      return;
    }

    const response = {
      agents: latest.agents.map((a) => ({
        agentId: a.agentId,
        agentName: a.agentName,
        status:
          a.performance.failureRate > 0.5
            ? 'critical'
            : a.performance.failureRate > 0.1
              ? 'warning'
              : 'healthy',
        totalExecutions: a.performance.totalExecutions,
        successRate: Math.round(a.performance.successRate * 1000) / 10,
        avgResponseTimeMs: Math.round(a.performance.avgDurationMs),
        source: a.agentId.startsWith('openclaw-')
          ? 'openclaw'
          : a.agentId.startsWith('soma-')
            ? 'soma'
            : 'agentflow',
        costPerExecution: a.efficiency.costPerExecution ?? null,
        tokenUsage: a.efficiency.tokenUsage ?? null,
      })),
      totalAgents: latest.agents.length,
      timestamp: latest.timestamp,
    };

    await cache.set(cacheKey, response, 30);
    sendJson(ctx.res, 200, response);
  });

  // Detailed agent performance
  router.get('/api/v1/agents/:agentId/performance', async (ctx) => {
    const { agentId } = ctx.params;
    const cacheKey = `api:agent:${agentId}:performance`;
    const cached = await cache.get(cacheKey);
    if (cached) {
      sendJson(ctx.res, 200, cached);
      return;
    }

    const latest = aggregator.getLatest();
    const agent = latest?.agents.find((a) => a.agentId === agentId);

    if (!agent) {
      sendJson(ctx.res, 404, {
        error: 'Not Found',
        message: `Agent not found: ${agentId}. Verify the agent name and try again.`,
      });
      return;
    }

    // Get historical data
    const { rows: history } = await db.query<{
      day: string;
      total_executions: string;
      total_successful: string;
      avg_duration_ms: string;
      avg_error_rate: string;
    }>(
      `SELECT
        DATE(period_start) AS day,
        SUM(total_executions) AS total_executions,
        SUM(successful) AS total_successful,
        AVG(avg_duration_ms) AS avg_duration_ms,
        AVG(error_rate) AS avg_error_rate
       FROM agent_metrics
       WHERE agent_id = $1 AND period_start > NOW() - INTERVAL '30 days'
       GROUP BY DATE(period_start)
       ORDER BY day`,
      [agentId],
    );

    const response = {
      agentId: agent.agentId,
      agentName: agent.agentName,
      current: {
        totalExecutions: agent.performance.totalExecutions,
        successRate: Math.round(agent.performance.successRate * 1000) / 10,
        failureRate: Math.round(agent.performance.failureRate * 1000) / 10,
        avgResponseTimeMs: Math.round(agent.performance.avgDurationMs),
        costPerExecution: agent.efficiency.costPerExecution,
        tokenUsage: agent.efficiency.tokenUsage,
      },
      compliance: {
        drifted: agent.compliance.drifted,
        driftScore: agent.compliance.driftScore,
        alerts: agent.compliance.alerts,
      },
      history: history.map((h) => ({
        date: h.day,
        executions: Number(h.total_executions),
        successful: Number(h.total_successful),
        avgDurationMs: Math.round(Number(h.avg_duration_ms)),
        errorRate: Math.round(Number(h.avg_error_rate) * 1000) / 10,
      })),
      timestamp: new Date().toISOString(),
    };

    await cache.set(cacheKey, response, 30);
    sendJson(ctx.res, 200, response);
  });
}
