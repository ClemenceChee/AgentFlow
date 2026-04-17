/**
 * Contextual decision recommendation engine.
 *
 * Tasks: 5.1 (recommendations), 5.2 (scoring), 5.3 (impact modeling),
 *        5.4 (personalized delivery), 5.5 (outcome tracking),
 *        5.8 (effectiveness measurement)
 */

import type { DbPool } from '../db/pool.js';
import type { DataAggregator, AgentAggregation } from '../synthesis/aggregator.js';
import type { UserRole } from '../auth/types.js';

export interface Recommendation {
  id: string;
  type: 'performance' | 'cost' | 'compliance' | 'risk' | 'strategic';
  title: string;
  description: string;
  confidence: number;
  evidence: Evidence[];
  impact: ImpactProjection;
  priority: 'critical' | 'high' | 'medium' | 'low';
  targetRoles: UserRole[];
  actionItems: string[];
  createdAt: string;
}

export interface Evidence {
  source: string;
  metric: string;
  value: number;
  context: string;
}

export interface ImpactProjection {
  category: string;
  estimatedValue: number;
  confidenceInterval: { low: number; high: number };
  timeframe: string;
  riskLevel: 'low' | 'medium' | 'high';
  effort: 'low' | 'medium' | 'high';
}

export interface DecisionOutcome {
  recommendationId: string;
  status: 'accepted' | 'rejected' | 'deferred' | 'implemented';
  actualOutcome?: { value: number; description: string };
  decidedBy: string;
  decidedAt: string;
  notes?: string;
}

export class RecommendationEngine {
  constructor(
    private db: DbPool,
    private aggregator: DataAggregator,
  ) {}

  /** Generate recommendations based on current system state. */
  async generateRecommendations(targetRole?: UserRole): Promise<Recommendation[]> {
    const latest = this.aggregator.getLatest();
    if (!latest) return [];

    const recommendations: Recommendation[] = [];
    const now = new Date().toISOString();
    let idCounter = 0;

    const nextId = () => `rec-${Date.now()}-${++idCounter}`;

    // Analyze agents for performance recommendations
    for (const agent of latest.agents) {
      // High failure rate recommendation
      if (agent.performance.failureRate > 0.15) {
        recommendations.push({
          id: nextId(),
          type: 'performance',
          title: `Investigate high failure rate for ${agent.agentName}`,
          description: `Agent ${agent.agentName} has a ${(agent.performance.failureRate * 100).toFixed(1)}% failure rate, significantly above the 10% threshold.`,
          confidence: Math.min(0.95, 0.6 + agent.performance.totalExecutions / 1000),
          evidence: [
            { source: 'agentflow', metric: 'failure_rate', value: agent.performance.failureRate, context: 'Current failure rate' },
            { source: 'agentflow', metric: 'total_executions', value: agent.performance.totalExecutions, context: 'Sample size for confidence' },
          ],
          impact: {
            category: 'reliability',
            estimatedValue: agent.performance.totalExecutions * agent.performance.failureRate * 10, // $10 per failure estimate
            confidenceInterval: { low: 0.7, high: 1.3 },
            timeframe: 'next_30_days',
            riskLevel: agent.performance.failureRate > 0.3 ? 'high' : 'medium',
            effort: 'medium',
          },
          priority: agent.performance.failureRate > 0.3 ? 'critical' : 'high',
          targetRoles: ['executive', 'manager'],
          actionItems: [
            'Review recent failure logs for common error patterns',
            'Check for drift in agent behavior',
            'Consider rolling back recent configuration changes',
          ],
          createdAt: now,
        });
      }

      // Cost optimization recommendation
      if (agent.efficiency.costPerExecution && agent.efficiency.costPerExecution > 0.5 && agent.performance.successRate < 0.85) {
        recommendations.push({
          id: nextId(),
          type: 'cost',
          title: `Optimize cost-effectiveness of ${agent.agentName}`,
          description: `Agent ${agent.agentName} costs $${agent.efficiency.costPerExecution.toFixed(2)}/execution with only ${(agent.performance.successRate * 100).toFixed(0)}% success rate.`,
          confidence: 0.75,
          evidence: [
            { source: 'opsintel', metric: 'cost_per_execution', value: agent.efficiency.costPerExecution, context: 'Current cost per execution' },
            { source: 'agentflow', metric: 'success_rate', value: agent.performance.successRate, context: 'Current success rate' },
          ],
          impact: {
            category: 'cost_reduction',
            estimatedValue: agent.performance.totalExecutions * agent.efficiency.costPerExecution * 0.2, // 20% savings potential
            confidenceInterval: { low: 0.5, high: 1.5 },
            timeframe: 'next_quarter',
            riskLevel: 'low',
            effort: 'medium',
          },
          priority: 'medium',
          targetRoles: ['executive', 'manager', 'analyst'],
          actionItems: [
            'Analyze token usage patterns for optimization',
            'Consider alternative models for cost-sensitive operations',
            'Implement caching for repeated queries',
          ],
          createdAt: now,
        });
      }

      // Drift/compliance recommendation
      if (agent.compliance.drifted && agent.compliance.driftScore > 0.3) {
        recommendations.push({
          id: nextId(),
          type: 'compliance',
          title: `Address behavioral drift in ${agent.agentName}`,
          description: `Agent ${agent.agentName} shows significant behavioral drift (score: ${agent.compliance.driftScore.toFixed(2)}) with ${agent.compliance.alerts.length} active alert(s).`,
          confidence: 0.85,
          evidence: [
            { source: 'opsintel', metric: 'drift_score', value: agent.compliance.driftScore, context: 'Drift severity' },
          ],
          impact: {
            category: 'compliance_risk',
            estimatedValue: 0,
            confidenceInterval: { low: 0, high: 0 },
            timeframe: 'immediate',
            riskLevel: 'high',
            effort: 'medium',
          },
          priority: 'high',
          targetRoles: ['executive', 'manager'],
          actionItems: [
            'Review drift alerts for specific behavioral changes',
            'Compare current behavior against established baselines',
            'Update policies if drift represents desired evolution',
          ],
          createdAt: now,
        });
      }
    }

    // Filter by target role if specified
    if (targetRole) {
      return recommendations.filter((r) => r.targetRoles.includes(targetRole));
    }

    return recommendations.sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }

  /** Record the outcome of a recommendation. */
  async recordOutcome(outcome: DecisionOutcome): Promise<void> {
    await this.db.query(
      `INSERT INTO business_decisions
        (decision_type, title, description, recommendation, status, confidence_score, created_by, decided_at)
       VALUES ('recommendation_outcome', $1, $2, $3, $4, $5, $6, $7)`,
      [
        `Outcome: ${outcome.recommendationId}`,
        outcome.notes ?? '',
        JSON.stringify(outcome),
        outcome.status === 'implemented' ? 'implemented' : outcome.status === 'rejected' ? 'rejected' : 'pending',
        outcome.actualOutcome ? 1.0 : 0.5,
        outcome.decidedBy,
        outcome.decidedAt,
      ],
    );
  }

  /** Get recommendation effectiveness metrics. */
  async getEffectiveness(): Promise<{
    total: number;
    accepted: number;
    rejected: number;
    implemented: number;
    acceptanceRate: number;
  }> {
    const { rows } = await this.db.query<{
      status: string;
      count: string;
    }>(
      `SELECT status, COUNT(*) AS count
       FROM business_decisions
       WHERE decision_type = 'recommendation_outcome'
       GROUP BY status`,
    );

    const counts: Record<string, number> = {};
    for (const r of rows) counts[r.status] = Number(r.count);

    const total = Object.values(counts).reduce((s, v) => s + v, 0);
    const accepted = (counts.implemented ?? 0) + (counts.approved ?? 0);

    return {
      total,
      accepted,
      rejected: counts.rejected ?? 0,
      implemented: counts.implemented ?? 0,
      acceptanceRate: total > 0 ? accepted / total : 0,
    };
  }
}
