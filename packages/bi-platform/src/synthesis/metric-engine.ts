/**
 * Business-context metric calculation engine.
 *
 * Tasks: 2.2 (metric calculation), 2.9 (query optimization)
 */

import type { CacheClient } from '../cache/cache.js';
import type { DbPool } from '../db/pool.js';

export interface BusinessMetric {
  name: string;
  value: number;
  unit: string;
  trend: 'up' | 'down' | 'stable';
  trendPct: number;
  period: string;
  calculatedAt: string;
}

export interface MetricQuery {
  metric: string;
  agentId?: string;
  periodStart?: string;
  periodEnd?: string;
  granularity?: 'hourly' | 'daily' | 'weekly' | 'monthly';
}

export class MetricEngine {
  constructor(
    private db: DbPool,
    private cache: CacheClient,
  ) {}

  /** Calculate a business metric with caching. */
  async calculate(query: MetricQuery): Promise<BusinessMetric | null> {
    const cacheKey = `metric:${query.metric}:${query.agentId ?? 'all'}:${query.periodStart ?? ''}:${query.periodEnd ?? ''}`;
    const cached = await this.cache.get<BusinessMetric>(cacheKey);
    if (cached) return cached;

    const calculator = METRIC_CALCULATORS[query.metric];
    if (!calculator) return null;

    const result = await calculator(this.db, query);
    if (result) {
      await this.cache.set(cacheKey, result, 60); // 1 minute TTL for real-time feel
    }
    return result;
  }

  /** Get multiple metrics at once. */
  async calculateBatch(queries: MetricQuery[]): Promise<Map<string, BusinessMetric | null>> {
    const results = new Map<string, BusinessMetric | null>();
    // Run in parallel for performance
    await Promise.all(
      queries.map(async (q) => {
        results.set(q.metric, await this.calculate(q));
      }),
    );
    return results;
  }

  /** Get summary KPIs for executive dashboard. */
  async getExecutiveKPIs(): Promise<BusinessMetric[]> {
    const queries: MetricQuery[] = [
      { metric: 'total_executions' },
      { metric: 'overall_success_rate' },
      { metric: 'avg_response_time' },
      { metric: 'active_agents' },
      { metric: 'compliance_score' },
      { metric: 'total_cost' },
    ];

    const results = await this.calculateBatch(queries);
    return Array.from(results.values()).filter((r): r is BusinessMetric => r !== null);
  }
}

type MetricCalculator = (db: DbPool, query: MetricQuery) => Promise<BusinessMetric | null>;

const METRIC_CALCULATORS: Record<string, MetricCalculator> = {
  total_executions: async (db, query) => {
    const where = buildWhereClause(query);
    const { rows } = await db.query<{ total: string; prev_total: string }>(
      `SELECT
        (SELECT COALESCE(SUM(total_executions), 0) FROM agent_metrics ${where.current}) AS total,
        (SELECT COALESCE(SUM(total_executions), 0) FROM agent_metrics ${where.previous}) AS prev_total`,
    );
    const total = Number(rows[0]?.total ?? 0);
    const prev = Number(rows[0]?.prev_total ?? 0);
    return makeMetric('Total Executions', total, 'count', prev);
  },

  overall_success_rate: async (db, query) => {
    const where = buildWhereClause(query);
    const { rows } = await db.query<{ rate: string; prev_rate: string }>(
      `SELECT
        (SELECT CASE WHEN SUM(total_executions) > 0
          THEN SUM(successful)::float / SUM(total_executions) ELSE 0 END
         FROM agent_metrics ${where.current}) AS rate,
        (SELECT CASE WHEN SUM(total_executions) > 0
          THEN SUM(successful)::float / SUM(total_executions) ELSE 0 END
         FROM agent_metrics ${where.previous}) AS prev_rate`,
    );
    const rate = Number(rows[0]?.rate ?? 0) * 100;
    const prev = Number(rows[0]?.prev_rate ?? 0) * 100;
    return makeMetric('Success Rate', rate, '%', prev);
  },

  avg_response_time: async (db, query) => {
    const where = buildWhereClause(query);
    const { rows } = await db.query<{ avg: string; prev_avg: string }>(
      `SELECT
        (SELECT COALESCE(AVG(avg_duration_ms), 0) FROM agent_metrics ${where.current}) AS avg,
        (SELECT COALESCE(AVG(avg_duration_ms), 0) FROM agent_metrics ${where.previous}) AS prev_avg`,
    );
    const avg = Number(rows[0]?.avg ?? 0);
    const prev = Number(rows[0]?.prev_avg ?? 0);
    return makeMetric('Avg Response Time', Math.round(avg), 'ms', prev);
  },

  active_agents: async (db, query) => {
    const where = buildWhereClause(query);
    const { rows } = await db.query<{ count: string; prev_count: string }>(
      `SELECT
        (SELECT COUNT(DISTINCT agent_id) FROM agent_metrics ${where.current}) AS count,
        (SELECT COUNT(DISTINCT agent_id) FROM agent_metrics ${where.previous}) AS prev_count`,
    );
    const count = Number(rows[0]?.count ?? 0);
    const prev = Number(rows[0]?.prev_count ?? 0);
    return makeMetric('Active Agents', count, 'agents', prev);
  },

  compliance_score: async (db) => {
    const { rows } = await db.query<{ total: string; compliant: string }>(
      `SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status = 'compliant') AS compliant
       FROM compliance_records
       WHERE detected_at > NOW() - INTERVAL '30 days'`,
    );
    const total = Number(rows[0]?.total ?? 0);
    const compliant = Number(rows[0]?.compliant ?? 0);
    const score = total > 0 ? (compliant / total) * 100 : 100;
    return makeMetric('Compliance Score', Math.round(score), '%', 100);
  },

  total_cost: async (db, query) => {
    const where = buildFinancialWhereClause(query);
    const { rows } = await db.query<{ total: string; prev_total: string }>(
      `SELECT
        (SELECT COALESCE(SUM(amount), 0) FROM financial_metrics WHERE category = 'agent_cost' ${where.current}) AS total,
        (SELECT COALESCE(SUM(amount), 0) FROM financial_metrics WHERE category = 'agent_cost' ${where.previous}) AS prev_total`,
    );
    const total = Number(rows[0]?.total ?? 0);
    const prev = Number(rows[0]?.prev_total ?? 0);
    return makeMetric('Total Cost', total, 'USD', prev);
  },
};

function makeMetric(
  name: string,
  value: number,
  unit: string,
  previousValue: number,
): BusinessMetric {
  const trendPct = previousValue !== 0 ? ((value - previousValue) / previousValue) * 100 : 0;
  return {
    name,
    value,
    unit,
    trend: Math.abs(trendPct) < 1 ? 'stable' : trendPct > 0 ? 'up' : 'down',
    trendPct: Math.round(trendPct * 10) / 10,
    period: 'last_30_days',
    calculatedAt: new Date().toISOString(),
  };
}

function buildWhereClause(query: MetricQuery) {
  const agentFilter = query.agentId ? ` AND agent_id = '${query.agentId}'` : '';
  return {
    current: `WHERE period_start > NOW() - INTERVAL '30 days'${agentFilter}`,
    previous: `WHERE period_start BETWEEN NOW() - INTERVAL '60 days' AND NOW() - INTERVAL '30 days'${agentFilter}`,
  };
}

function buildFinancialWhereClause(query: MetricQuery) {
  const agentFilter = query.agentId ? ` AND agent_id = '${query.agentId}'` : '';
  return {
    current: `AND period_start > NOW() - INTERVAL '30 days'${agentFilter}`,
    previous: `AND period_start BETWEEN NOW() - INTERVAL '60 days' AND NOW() - INTERVAL '30 days'${agentFilter}`,
  };
}
