/**
 * Enhanced Layer-Aware Reporting — business intelligence metadata enrichment,
 * real-time BI feeds, streaming metrics, and context enrichment.
 *
 * Tasks: 8.1-8.10
 */

import type { CacheClient } from '../cache/cache.js';
import type { DbPool } from '../db/pool.js';
import type { AgentFlowAdapter } from '../integrations/agentflow-adapter.js';
import type { OpsIntelAdapter } from '../integrations/opsintel-adapter.js';
import type { SomaAdapter } from '../integrations/soma-adapter.js';
import type { Logger } from '../monitoring/logger.js';
import type { AggregatedMetrics, DataAggregator } from './aggregator.js';
import type { MaterializedViewManager } from './materialized-views.js';

/**
 * 8.1 — SOMA reporting with BI metadata
 */
export interface SomaBusinessReport {
  layers: LayerReport[];
  knowledgeHealth: {
    totalInsights: number;
    highConfidence: number;
    pendingProposals: number;
    activePolicies: number;
  };
  governanceSummary: GovernanceSummary;
  timestamp: string;
}

export interface LayerReport {
  layer: string;
  entityCount: number;
  businessContext: string;
  freshness: 'current' | 'aging' | 'stale';
}

/**
 * 8.8 — Enhanced governance summary with sync status
 */
export interface GovernanceSummary {
  policyCount: number;
  enforcementBreakdown: Record<string, number>;
  lastSyncAt: string | null;
  syncStatus: 'synced' | 'behind' | 'disconnected';
  driftingAgents: number;
}

/**
 * 8.2 — Real-time BI data feed subscription
 */
export interface BiFeedEvent {
  type:
    | 'kpi_update'
    | 'anomaly_detected'
    | 'compliance_change'
    | 'agent_status_change'
    | 'governance_update';
  data: unknown;
  timestamp: string;
}

export type FeedListener = (event: BiFeedEvent) => void;

/**
 * 8.3 — Business-optimized data formatting
 */
export interface FormattedMetric {
  raw: number;
  formatted: string;
  unit: string;
  color: 'green' | 'yellow' | 'red' | 'neutral';
  sparkTrend: number[];
}

/**
 * 8.7 — BI optimization flags
 */
export interface OptimizationFlags {
  useMaterializedViews: boolean;
  cacheStrategy: 'aggressive' | 'moderate' | 'none';
  refreshIntervalMs: number;
  streamingEnabled: boolean;
}

export function loadOptimizationFlags(): OptimizationFlags {
  return {
    useMaterializedViews: process.env.BI_USE_MATERIALIZED_VIEWS !== 'false',
    cacheStrategy:
      (process.env.BI_CACHE_STRATEGY as OptimizationFlags['cacheStrategy']) || 'moderate',
    refreshIntervalMs: Number(process.env.BI_REFRESH_INTERVAL_MS ?? 15_000),
    streamingEnabled: process.env.BI_STREAMING_ENABLED !== 'false',
  };
}

export class LayerReportingService {
  private feedListeners: Set<FeedListener> = new Set();
  private feedTimer: ReturnType<typeof setInterval> | null = null;
  private lastAggregation: AggregatedMetrics | null = null;

  constructor(
    private soma: SomaAdapter,
    _agentflow: AgentFlowAdapter,
    private opsintel: OpsIntelAdapter,
    private aggregator: DataAggregator,
    _viewManager: MaterializedViewManager,
    private db: DbPool,
    private cache: CacheClient,
    private logger: Logger,
    private flags: OptimizationFlags,
  ) {}

  /**
   * 8.1 — Get SOMA report enriched with business intelligence metadata.
   */
  async getSomaBusinessReport(): Promise<SomaBusinessReport> {
    const cacheKey = 'bi:soma-business-report';
    if (this.flags.cacheStrategy !== 'none') {
      const cached = await this.cache.get<SomaBusinessReport>(cacheKey);
      if (cached) return cached;
    }

    const [insights, policies, layerCounts, health] = await Promise.all([
      this.soma.getInsights(),
      this.soma.getPolicies(),
      this.soma.getLayerCounts(),
      this.soma.health(),
    ]);

    const layers: LayerReport[] = Object.entries(layerCounts).map(([layer, count]) => ({
      layer,
      entityCount: count,
      businessContext: layerBusinessContext(layer),
      freshness:
        health.status === 'healthy' ? 'current' : health.status === 'degraded' ? 'aging' : 'stale',
    }));

    const highConfidence = insights.filter((i) => (i.confidenceScore ?? 0) >= 0.8).length;
    const pendingProposals = insights.filter(
      (i) => i.status === 'proposed' || i.status === 'pending',
    ).length;

    // Build enforcement breakdown
    const enforcementBreakdown: Record<string, number> = {};
    for (const p of policies) {
      const key = p.enforcement || 'unknown';
      enforcementBreakdown[key] = (enforcementBreakdown[key] ?? 0) + 1;
    }

    // Get drift data for governance summary
    const driftAlerts = await this.opsintel.getDriftAlerts();
    const driftingAgents = driftAlerts.filter((d) => d.drifted).length;

    const report: SomaBusinessReport = {
      layers,
      knowledgeHealth: {
        totalInsights: insights.length,
        highConfidence,
        pendingProposals,
        activePolicies: policies.length,
      },
      governanceSummary: {
        policyCount: policies.length,
        enforcementBreakdown,
        lastSyncAt: health.lastSyncAt,
        syncStatus:
          health.status === 'healthy'
            ? 'synced'
            : health.status === 'degraded'
              ? 'behind'
              : 'disconnected',
        driftingAgents,
      },
      timestamp: new Date().toISOString(),
    };

    const ttl = this.flags.cacheStrategy === 'aggressive' ? 60 : 30;
    await this.cache.set(cacheKey, report, ttl);
    return report;
  }

  /**
   * 8.2 — Subscribe to real-time BI data feed.
   */
  subscribeFeed(listener: FeedListener): () => void {
    this.feedListeners.add(listener);
    this.ensureFeedRunning();
    return () => {
      this.feedListeners.delete(listener);
      if (this.feedListeners.size === 0) this.stopFeed();
    };
  }

  /**
   * 8.3 — Format a metric for business display.
   */
  formatMetric(name: string, value: number, unit: string, trend: number[]): FormattedMetric {
    return {
      raw: value,
      formatted: formatBusinessValue(value, unit),
      unit,
      color: metricColor(name, value),
      sparkTrend: trend,
    };
  }

  /**
   * 8.4 — Business-optimized materialized view queries.
   */
  async getBusinessMetricView(
    viewName: string,
    filters?: Record<string, string>,
  ): Promise<unknown[]> {
    if (!this.flags.useMaterializedViews) {
      this.logger.info('Materialized views disabled, using direct query');
      return [];
    }

    const cacheKey = `bi:view:${viewName}:${JSON.stringify(filters ?? {})}`;
    if (this.flags.cacheStrategy !== 'none') {
      const cached = await this.cache.get<unknown[]>(cacheKey);
      if (cached) return cached;
    }

    let sql = `SELECT * FROM ${viewName}`;
    const params: unknown[] = [];
    if (filters) {
      const conditions = Object.entries(filters).map(([key, val], i) => {
        params.push(val);
        return `${key} = $${i + 1}`;
      });
      if (conditions.length > 0) sql += ` WHERE ${conditions.join(' AND ')}`;
    }
    sql += ' LIMIT 1000';

    const { rows } = await this.db.query(sql, params);
    const ttl = this.flags.cacheStrategy === 'aggressive' ? 120 : 30;
    await this.cache.set(cacheKey, rows, ttl);
    return rows;
  }

  /**
   * 8.5 — Intelligent caching for business queries.
   */
  async getCachedOrCompute<T>(
    key: string,
    computeFn: () => Promise<T>,
    ttlOverride?: number,
  ): Promise<T> {
    if (this.flags.cacheStrategy !== 'none') {
      const cached = await this.cache.get<T>(key);
      if (cached) return cached;
    }

    const result = await computeFn();
    const ttl = ttlOverride ?? (this.flags.cacheStrategy === 'aggressive' ? 120 : 60);
    await this.cache.set(key, result, ttl);
    return result;
  }

  /**
   * 8.6 — Performance monitoring for BI access.
   */
  async getAccessMetrics(): Promise<{
    cacheStats: { hits: number; misses: number; hitRate: number };
    queryPerformance: { avgMs: number; p95Ms: number; totalQueries: number };
    viewFreshness: { view: string; lastRefreshed: string | null }[];
  }> {
    const cacheStats = this.cache.getStats();

    // Query performance from api_usage table
    const { rows: perfRows } = await this.db
      .query<{ avg_ms: string; p95_ms: string; total: string }>(
        `SELECT
        ROUND(AVG(response_time_ms)) AS avg_ms,
        ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY response_time_ms)) AS p95_ms,
        COUNT(*) AS total
       FROM api_usage
       WHERE request_at > NOW() - INTERVAL '1 hour'
         AND endpoint LIKE '/api/v1/%'`,
      )
      .catch(() => ({ rows: [{ avg_ms: '0', p95_ms: '0', total: '0' }] }));

    const perf = perfRows[0] ?? { avg_ms: '0', p95_ms: '0', total: '0' };

    return {
      cacheStats: { hits: cacheStats.hits, misses: cacheStats.misses, hitRate: cacheStats.hitRate },
      queryPerformance: {
        avgMs: Number(perf.avg_ms),
        p95Ms: Number(perf.p95_ms),
        totalQueries: Number(perf.total),
      },
      viewFreshness: [],
    };
  }

  /**
   * 8.9 — Streaming business metrics delivery via SSE.
   */
  createSSEStream(): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    let unsubscribe: (() => void) | null = null;

    return new ReadableStream({
      start: (controller) => {
        unsubscribe = this.subscribeFeed((event) => {
          const data = `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`;
          try {
            controller.enqueue(encoder.encode(data));
          } catch {
            // Stream closed
          }
        });
      },
      cancel: () => {
        unsubscribe?.();
      },
    });
  }

  /**
   * 8.10 — Business context enrichment for layer data.
   */
  async enrichWithBusinessContext(agentId: string): Promise<{
    agentId: string;
    somaInsights: number;
    appliedPolicies: string[];
    knowledgeLayer: string;
    businessRecommendation: string;
  }> {
    const [insights, policies] = await Promise.all([
      this.soma.getInsights(),
      this.soma.getPolicies(),
    ]);

    const agentInsights = insights.filter((i) =>
      i.title.toLowerCase().includes(agentId.toLowerCase()),
    );
    const appliedPolicies = policies
      .filter((p) => p.scope === 'all' || p.scope.includes(agentId))
      .map((p) => p.name);

    let recommendation = 'No specific recommendations';
    if (agentInsights.length === 0) {
      recommendation = 'Agent has limited observability — consider enabling trace collection';
    } else if (agentInsights.some((i) => (i.confidenceScore ?? 0) < 0.5)) {
      recommendation = 'Low confidence insights detected — review data quality';
    }

    return {
      agentId,
      somaInsights: agentInsights.length,
      appliedPolicies,
      knowledgeLayer: agentInsights.length > 0 ? (agentInsights[0].layer ?? 'L1') : 'unknown',
      businessRecommendation: recommendation,
    };
  }

  // --- Private ---

  private ensureFeedRunning(): void {
    if (this.feedTimer) return;
    this.feedTimer = setInterval(async () => {
      try {
        const latest = this.aggregator.getLatest();
        if (!latest || latest.timestamp === this.lastAggregation?.timestamp) return;

        const prev = this.lastAggregation;
        this.lastAggregation = latest;

        // Detect changes and emit events
        this.emitFeedEvent({
          type: 'kpi_update',
          data: { agents: latest.agents.length, health: latest.systemHealth },
          timestamp: latest.timestamp,
        });

        // Check for new anomalies
        if (latest.crossSystemCorrelations.length > (prev?.crossSystemCorrelations.length ?? 0)) {
          this.emitFeedEvent({
            type: 'anomaly_detected',
            data: { correlations: latest.crossSystemCorrelations },
            timestamp: latest.timestamp,
          });
        }

        // Check for agent status changes
        if (prev) {
          for (const agent of latest.agents) {
            const prevAgent = prev.agents.find((a) => a.agentId === agent.agentId);
            if (prevAgent && prevAgent.compliance.drifted !== agent.compliance.drifted) {
              this.emitFeedEvent({
                type: 'agent_status_change',
                data: { agentId: agent.agentId, drifted: agent.compliance.drifted },
                timestamp: latest.timestamp,
              });
            }
          }
        }
      } catch (err) {
        this.logger.error('Feed update failed', { error: String(err) });
      }
    }, this.flags.refreshIntervalMs);
    this.feedTimer.unref();
  }

  private stopFeed(): void {
    if (this.feedTimer) {
      clearInterval(this.feedTimer);
      this.feedTimer = null;
    }
  }

  private emitFeedEvent(event: BiFeedEvent): void {
    for (const listener of this.feedListeners) {
      try {
        listener(event);
      } catch {
        // Listener error — continue
      }
    }
  }
}

// --- Helpers ---

function layerBusinessContext(layer: string): string {
  const contexts: Record<string, string> = {
    L1: 'Raw observations — operational telemetry from agent executions',
    L2: 'Emerging patterns — cross-agent behavioral insights',
    L3: 'Working memory — active proposals and synthesized knowledge',
    L4: 'Canon — validated organizational policies and standards',
  };
  return contexts[layer] ?? `Knowledge layer ${layer}`;
}

function formatBusinessValue(value: number, unit: string): string {
  if (unit === '%') return `${value.toFixed(1)}%`;
  if (unit === 'USD' || unit === 'usd') {
    if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
    if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
    return `$${value.toFixed(2)}`;
  }
  if (unit === 'ms') {
    if (value >= 60_000) return `${(value / 60_000).toFixed(1)}m`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(1)}s`;
    return `${Math.round(value)}ms`;
  }
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toFixed(value % 1 === 0 ? 0 : 1);
}

function metricColor(name: string, value: number): 'green' | 'yellow' | 'red' | 'neutral' {
  if (name.includes('success') || name.includes('compliance')) {
    if (value >= 95) return 'green';
    if (value >= 80) return 'yellow';
    return 'red';
  }
  if (name.includes('failure') || name.includes('error')) {
    if (value <= 5) return 'green';
    if (value <= 15) return 'yellow';
    return 'red';
  }
  return 'neutral';
}
