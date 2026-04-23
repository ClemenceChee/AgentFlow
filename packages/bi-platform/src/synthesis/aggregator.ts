/**
 * Real-time data aggregation service — pulls data from SOMA, AgentFlow, OpsIntel
 * and aggregates it into business-ready metrics.
 *
 * Tasks: 2.1 (aggregation), 2.6 (cross-system correlation), 2.7 (incremental processing)
 */

import type { DbPool } from '../db/pool.js';
import type { AgentFlowAdapter } from '../integrations/agentflow-adapter.js';
import type { CronAdapter } from '../integrations/cron-adapter.js';
import type { OpenClawSessionAdapter } from '../integrations/openclaw-session-adapter.js';
import type { OpsIntelAdapter } from '../integrations/opsintel-adapter.js';
import type { SomaAdapter } from '../integrations/soma-adapter.js';
import type { Logger } from '../monitoring/logger.js';

export interface AggregatedMetrics {
  timestamp: string;
  agents: AgentAggregation[];
  systemHealth: SystemAggregation;
  crossSystemCorrelations: Correlation[];
}

export interface AgentAggregation {
  agentId: string;
  agentName: string;
  performance: {
    totalExecutions: number;
    successRate: number;
    avgDurationMs: number;
    failureRate: number;
  };
  efficiency: {
    costPerExecution?: number;
    tokenUsage?: number;
  };
  compliance: {
    drifted: boolean;
    driftScore: number;
    alerts: string[];
  };
  businessImpact: {
    roi?: number;
    satisfactionScore?: number;
    revenueImpact?: number;
  };
}

export interface SystemAggregation {
  soma: { status: string; insightCount: number; policyCount: number };
  agentflow: { status: string; activeAgents: number; totalExecutions: number };
  opsintel: { status: string; driftAlerts: number; assertionsPassed: number };
}

export interface Correlation {
  type: string;
  description: string;
  systems: string[];
  confidence: number;
  businessRelevance: string;
}

export interface AggregatorConfig {
  /** Interval between aggregation runs in ms */
  intervalMs: number;
  /** Whether to persist aggregations to DB */
  persistToDb: boolean;
}

export function loadAggregatorConfig(): AggregatorConfig {
  return {
    intervalMs: Number(process.env.BI_AGGREGATION_INTERVAL_MS ?? 30_000),
    persistToDb: process.env.BI_AGGREGATION_PERSIST !== 'false',
  };
}

export class DataAggregator {
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastAggregation: AggregatedMetrics | null = null;

  private openclaw: OpenClawSessionAdapter | null = null;

  constructor(
    private soma: SomaAdapter,
    private agentflow: AgentFlowAdapter,
    private opsintel: OpsIntelAdapter,
    private db: DbPool,
    private logger: Logger,
    private config: AggregatorConfig,
  ) {}

  /** Attach optional OpenClaw and Cron adapters for enhanced metrics. */
  setEnhancedAdapters(openclaw: OpenClawSessionAdapter, cron: CronAdapter): void {
    this.openclaw = openclaw;
    this.cron = cron;
  }

  /** Run a single aggregation cycle. */
  async aggregate(): Promise<AggregatedMetrics> {
    const start = Date.now();

    // Pull data from all sources concurrently
    const [
      somaAgents,
      somaInsights,
      somaPolicies,
      afPerformance,
      opsEfficiency,
      opsDrift,
      somaHealth,
      afHealth,
      opsHealth,
    ] = await Promise.all([
      this.soma.getAgents(),
      this.soma.getInsights(),
      this.soma.getPolicies(),
      this.agentflow.getAgentPerformance(),
      this.opsintel.getEfficiencyMetrics(),
      this.opsintel.getDriftAlerts(),
      this.soma.health(),
      this.agentflow.health(),
      this.opsintel.health(),
    ]);

    // Cross-system correlation: merge agent data from multiple sources
    const agentMap = new Map<string, AgentAggregation>();

    // Seed from AgentFlow performance data
    for (const af of afPerformance) {
      agentMap.set(af.agentId, {
        agentId: af.agentId,
        agentName: af.agentName,
        performance: {
          totalExecutions: af.totalExecutions,
          successRate: af.totalExecutions > 0 ? af.successCount / af.totalExecutions : 0,
          avgDurationMs: af.avgDurationMs ?? 0,
          failureRate: af.failureRate,
        },
        efficiency: {},
        compliance: { drifted: false, driftScore: 0, alerts: [] },
        businessImpact: {},
      });
    }

    // Enrich from SOMA agent data
    for (const sa of somaAgents) {
      const existing = agentMap.get(sa.agentId);
      if (existing) {
        // Merge — SOMA may have satisfaction scores
        existing.businessImpact.satisfactionScore = undefined; // populated from business data later
      } else {
        agentMap.set(sa.agentId, {
          agentId: sa.agentId,
          agentName: sa.agentName,
          performance: {
            totalExecutions: sa.totalExecutions,
            successRate: sa.totalExecutions > 0 ? sa.successCount / sa.totalExecutions : 0,
            avgDurationMs: 0,
            failureRate: sa.failureRate,
          },
          efficiency: {},
          compliance: { drifted: false, driftScore: 0, alerts: [] },
          businessImpact: {},
        });
      }
    }

    // Enrich with OpsIntel efficiency data
    for (const eff of opsEfficiency) {
      const agent = agentMap.get(eff.agentId);
      if (agent) {
        agent.efficiency.costPerExecution = eff.costPerExecution;
        agent.efficiency.tokenUsage = eff.tokenUsage;
      }
    }

    // Enrich with drift alerts
    for (const drift of opsDrift) {
      const agent = agentMap.get(drift.agentId);
      if (agent) {
        agent.compliance.drifted = drift.drifted;
        agent.compliance.driftScore = drift.score;
        agent.compliance.alerts = drift.alerts;
      }
    }

    // Enrich with OpenClaw session data (if available)
    if (this.openclaw) {
      try {
        const ocAgents = await this.openclaw.getAgentData();
        for (const oc of ocAgents) {
          // Merge by matching agent ID (openclaw agentId may match soma agentName)
          const existing = agentMap.get(oc.agentId) ?? agentMap.get(`openclaw-${oc.agentId}`);
          if (existing) {
            // Enrich existing agent with token cost data
            if (oc.totalCost > 0) {
              existing.efficiency.costPerExecution =
                existing.performance.totalExecutions > 0
                  ? oc.totalCost / existing.performance.totalExecutions
                  : oc.totalCost;
              existing.efficiency.tokenUsage = oc.totalTokens;
            }
          } else {
            // New agent only visible via OpenClaw
            agentMap.set(oc.agentId, {
              agentId: oc.agentId,
              agentName: oc.agentId,
              performance: {
                totalExecutions: oc.totalMessages,
                successRate: 1, // session messages are successful
                avgDurationMs: 0,
                failureRate: 0,
              },
              efficiency: {
                costPerExecution: oc.totalMessages > 0 ? oc.totalCost / oc.totalMessages : 0,
                tokenUsage: oc.totalTokens,
              },
              compliance: { drifted: false, driftScore: 0, alerts: [] },
              businessImpact: {},
            });
          }
        }
      } catch (err) {
        this.logger.warn('OpenClaw adapter failed', { error: String(err) });
      }
    }

    // Cross-system correlations
    const correlations = this.detectCorrelations(Array.from(agentMap.values()));

    const result: AggregatedMetrics = {
      timestamp: new Date().toISOString(),
      agents: Array.from(agentMap.values()),
      systemHealth: {
        soma: {
          status: somaHealth.status,
          insightCount: somaInsights.length,
          policyCount: somaPolicies.length,
        },
        agentflow: {
          status: afHealth.status,
          activeAgents: afPerformance.length,
          totalExecutions: afPerformance.reduce((s, a) => s + a.totalExecutions, 0),
        },
        opsintel: {
          status: opsHealth.status,
          driftAlerts: opsDrift.filter((d) => d.drifted).length,
          assertionsPassed: 0,
        },
      },
      crossSystemCorrelations: correlations,
    };

    // Persist to DB if configured
    if (this.config.persistToDb) {
      await this.persistMetrics(result);
    }

    this.lastAggregation = result;
    this.logger.info('Aggregation complete', {
      agents: result.agents.length,
      correlations: correlations.length,
      durationMs: Date.now() - start,
    });

    return result;
  }

  /** Start periodic aggregation. */
  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.aggregate().catch((err) => {
        this.logger.error('Aggregation failed', { error: String(err) });
      });
    }, this.config.intervalMs);
    this.timer.unref();

    // Run immediately
    this.aggregate().catch((err) => {
      this.logger.error('Initial aggregation failed', { error: String(err) });
    });
  }

  /** Stop periodic aggregation. */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Get latest cached aggregation. */
  getLatest(): AggregatedMetrics | null {
    return this.lastAggregation;
  }

  private detectCorrelations(agents: AgentAggregation[]): Correlation[] {
    const correlations: Correlation[] = [];

    // Correlation: high failure rate + drift
    const driftingWithFailures = agents.filter(
      (a) => a.compliance.drifted && a.performance.failureRate > 0.1,
    );
    if (driftingWithFailures.length > 0) {
      correlations.push({
        type: 'drift-failure-correlation',
        description: `${driftingWithFailures.length} agent(s) showing both behavioral drift and elevated failure rates`,
        systems: ['agentflow', 'opsintel'],
        confidence: 0.8,
        businessRelevance:
          'Drifting agents with failures may indicate systemic issues requiring intervention',
      });
    }

    // Correlation: high cost + low success
    const inefficient = agents.filter(
      (a) =>
        a.efficiency.costPerExecution &&
        a.efficiency.costPerExecution > 0.1 &&
        a.performance.successRate < 0.8,
    );
    if (inefficient.length > 0) {
      correlations.push({
        type: 'cost-effectiveness-correlation',
        description: `${inefficient.length} agent(s) with high cost and low success rate`,
        systems: ['agentflow', 'opsintel'],
        confidence: 0.75,
        businessRelevance:
          'High-cost underperforming agents represent ROI optimization opportunities',
      });
    }

    return correlations;
  }

  private async persistMetrics(metrics: AggregatedMetrics): Promise<void> {
    const now = new Date();
    const periodStart = new Date(now.getTime() - this.config.intervalMs);

    for (const agent of metrics.agents) {
      try {
        await this.db.query(
          `INSERT INTO agent_metrics
            (agent_id, agent_name, period_start, period_end, total_executions, successful, failed, avg_duration_ms, error_rate)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            agent.agentId,
            agent.agentName,
            periodStart.toISOString(),
            now.toISOString(),
            agent.performance.totalExecutions,
            Math.round(agent.performance.totalExecutions * agent.performance.successRate),
            Math.round(agent.performance.totalExecutions * agent.performance.failureRate),
            agent.performance.avgDurationMs,
            agent.performance.failureRate,
          ],
        );
      } catch (err) {
        this.logger.error('Failed to persist agent metrics', {
          agentId: agent.agentId,
          error: String(err),
        });
      }
    }
  }
}
