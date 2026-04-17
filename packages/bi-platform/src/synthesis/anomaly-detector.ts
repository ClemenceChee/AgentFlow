/**
 * Anomaly detection algorithms for business intelligence metrics.
 *
 * Tasks: 2.4 (anomaly detection), 2.5 (data quality), 2.8 (freshness tracking), 2.10 (consistency)
 */

import type { DbPool } from '../db/pool.js';
import type { Logger } from '../monitoring/logger.js';
import type { AgentAggregation } from './aggregator.js';

export interface Anomaly {
  sourceSystem: string;
  metricName: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  baselineValue: number;
  observedValue: number;
  deviationPct: number;
  businessImpact: {
    description: string;
    estimatedSeverity: string;
    affectedAgents?: string[];
  };
  detectedAt: string;
}

export interface DataQualityIssue {
  source: string;
  field: string;
  issue: 'missing' | 'invalid' | 'stale' | 'inconsistent';
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
}

export interface FreshnessStatus {
  source: string;
  lastSync: string | null;
  ageSeconds: number;
  status: 'fresh' | 'acceptable' | 'stale' | 'critical';
  threshold: number;
}

export class AnomalyDetector {
  private baselines = new Map<string, { mean: number; stddev: number; samples: number }>();

  constructor(
    private db: DbPool,
    private logger: Logger,
  ) {}

  /** Detect anomalies in current agent metrics. */
  detectAnomalies(agents: AgentAggregation[]): Anomaly[] {
    const anomalies: Anomaly[] = [];
    const now = new Date().toISOString();

    for (const agent of agents) {
      // Check failure rate anomaly
      const failureBaseline = this.getBaseline(`failure_rate:${agent.agentId}`);
      if (failureBaseline && agent.performance.failureRate > 0) {
        const deviation = this.calculateDeviation(
          agent.performance.failureRate,
          failureBaseline.mean,
          failureBaseline.stddev,
        );
        if (Math.abs(deviation) > 2) {
          anomalies.push({
            sourceSystem: 'agentflow',
            metricName: 'failure_rate',
            severity: deviation > 3 ? 'critical' : deviation > 2.5 ? 'high' : 'medium',
            description: `Agent ${agent.agentName} failure rate ${(agent.performance.failureRate * 100).toFixed(1)}% deviates significantly from baseline ${(failureBaseline.mean * 100).toFixed(1)}%`,
            baselineValue: failureBaseline.mean,
            observedValue: agent.performance.failureRate,
            deviationPct: ((agent.performance.failureRate - failureBaseline.mean) / failureBaseline.mean) * 100,
            businessImpact: {
              description: 'Elevated failure rate may impact service reliability and user experience',
              estimatedSeverity: deviation > 3 ? 'critical' : 'moderate',
              affectedAgents: [agent.agentId],
            },
            detectedAt: now,
          });
        }
      }

      // Update baselines
      this.updateBaseline(`failure_rate:${agent.agentId}`, agent.performance.failureRate);
      if (agent.performance.avgDurationMs > 0) {
        this.updateBaseline(`duration:${agent.agentId}`, agent.performance.avgDurationMs);
      }

      // Check duration anomaly
      const durationBaseline = this.getBaseline(`duration:${agent.agentId}`);
      if (durationBaseline && agent.performance.avgDurationMs > 0) {
        const deviation = this.calculateDeviation(
          agent.performance.avgDurationMs,
          durationBaseline.mean,
          durationBaseline.stddev,
        );
        if (deviation > 2) {
          anomalies.push({
            sourceSystem: 'agentflow',
            metricName: 'response_time',
            severity: deviation > 3 ? 'high' : 'medium',
            description: `Agent ${agent.agentName} avg response time ${Math.round(agent.performance.avgDurationMs)}ms significantly above baseline ${Math.round(durationBaseline.mean)}ms`,
            baselineValue: durationBaseline.mean,
            observedValue: agent.performance.avgDurationMs,
            deviationPct: ((agent.performance.avgDurationMs - durationBaseline.mean) / durationBaseline.mean) * 100,
            businessImpact: {
              description: 'Increased response time may degrade user experience and throughput',
              estimatedSeverity: 'moderate',
              affectedAgents: [agent.agentId],
            },
            detectedAt: now,
          });
        }
      }
    }

    return anomalies;
  }

  /** Validate data quality across sources. */
  validateDataQuality(agents: AgentAggregation[]): DataQualityIssue[] {
    const issues: DataQualityIssue[] = [];

    for (const agent of agents) {
      if (!agent.agentId) {
        issues.push({
          source: 'agentflow',
          field: 'agentId',
          issue: 'missing',
          description: 'Agent record missing required agentId field',
          severity: 'high',
        });
      }

      if (agent.performance.totalExecutions < 0) {
        issues.push({
          source: 'agentflow',
          field: 'totalExecutions',
          issue: 'invalid',
          description: `Agent ${agent.agentId} has negative execution count`,
          severity: 'high',
        });
      }

      if (agent.performance.failureRate > 1 || agent.performance.failureRate < 0) {
        issues.push({
          source: 'agentflow',
          field: 'failureRate',
          issue: 'invalid',
          description: `Agent ${agent.agentId} failure rate ${agent.performance.failureRate} out of valid range [0,1]`,
          severity: 'medium',
        });
      }
    }

    return issues;
  }

  /** Check data freshness across source systems. */
  async checkFreshness(): Promise<FreshnessStatus[]> {
    const { rows } = await this.db.query<{
      source_system: string;
      last_sync_at: string | null;
      status: string;
    }>('SELECT source_system, last_sync_at, status FROM data_freshness');

    const thresholds: Record<string, number> = {
      soma: 120,       // 2 minutes
      agentflow: 60,   // 1 minute
      opsintel: 120,   // 2 minutes
    };

    return rows.map((row) => {
      const ageSeconds = row.last_sync_at
        ? Math.floor((Date.now() - new Date(row.last_sync_at).getTime()) / 1000)
        : Infinity;
      const threshold = thresholds[row.source_system] ?? 120;

      let status: FreshnessStatus['status'];
      if (ageSeconds < threshold) status = 'fresh';
      else if (ageSeconds < threshold * 2) status = 'acceptable';
      else if (ageSeconds < threshold * 5) status = 'stale';
      else status = 'critical';

      return {
        source: row.source_system,
        lastSync: row.last_sync_at,
        ageSeconds,
        status,
        threshold,
      };
    });
  }

  /** Update data freshness record. */
  async updateFreshness(source: string, recordCount: number, error?: string): Promise<void> {
    const status = error ? 'failing' : 'healthy';
    await this.db.query(
      `INSERT INTO data_freshness (source_system, last_sync_at, last_success_at, record_count, status, error_message, updated_at)
       VALUES ($1, NOW(), ${error ? 'NULL' : 'NOW()'}, $2, $3, $4, NOW())
       ON CONFLICT (source_system) DO UPDATE SET
         last_sync_at = NOW(),
         last_success_at = ${error ? 'data_freshness.last_success_at' : 'NOW()'},
         record_count = $2,
         status = $3,
         error_message = $4,
         updated_at = NOW()`,
      [source, recordCount, status, error ?? null],
    );
  }

  /** Persist anomalies to database. */
  async persistAnomalies(anomalies: Anomaly[]): Promise<void> {
    for (const a of anomalies) {
      try {
        await this.db.query(
          `INSERT INTO anomalies (source_system, metric_name, severity, description, baseline_value, observed_value, deviation_pct, business_impact)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [a.sourceSystem, a.metricName, a.severity, a.description, a.baselineValue, a.observedValue, a.deviationPct, JSON.stringify(a.businessImpact)],
        );
      } catch (err) {
        this.logger.error('Failed to persist anomaly', { error: String(err) });
      }
    }
  }

  private calculateDeviation(value: number, mean: number, stddev: number): number {
    if (stddev === 0) return value === mean ? 0 : 3; // If no variance, any difference is significant
    return (value - mean) / stddev;
  }

  private getBaseline(key: string) {
    return this.baselines.get(key);
  }

  private updateBaseline(key: string, value: number): void {
    const existing = this.baselines.get(key);
    if (!existing) {
      this.baselines.set(key, { mean: value, stddev: 0, samples: 1 });
      return;
    }

    // Welford's online algorithm for running mean/stddev
    const n = existing.samples + 1;
    const delta = value - existing.mean;
    const newMean = existing.mean + delta / n;
    const delta2 = value - newMean;
    const newM2 = existing.stddev * existing.stddev * existing.samples + delta * delta2;

    this.baselines.set(key, {
      mean: newMean,
      stddev: Math.sqrt(newM2 / n),
      samples: n,
    });
  }
}
