/**
 * Enhanced Decision Synthesis — cross-agent pattern detection,
 * business-context recommendations, stakeholder notifications,
 * ROI analysis, compliance risk, and real-time alerting.
 *
 * Tasks: 9.1-9.10
 */

import type { UserRole } from '../auth/types.js';
import type { CacheClient } from '../cache/cache.js';
import type { DbPool } from '../db/pool.js';
import type { Logger } from '../monitoring/logger.js';
import type { DataAggregator } from '../synthesis/aggregator.js';
import type { AnomalyDetector } from '../synthesis/anomaly-detector.js';
import type { Recommendation, RecommendationEngine } from './recommendation-engine.js';

/**
 * 9.1 — Cross-agent pattern with business impact assessment
 */
export interface BusinessPattern {
  id: string;
  type:
    | 'performance_cluster'
    | 'cost_trend'
    | 'failure_cascade'
    | 'efficiency_gap'
    | 'compliance_drift';
  title: string;
  description: string;
  affectedAgents: string[];
  businessImpact: {
    severity: 'critical' | 'high' | 'medium' | 'low';
    estimatedCostImpact: number;
    affectedOperations: string[];
    riskCategory: string;
  };
  confidence: number;
  detectedAt: string;
}

/**
 * 9.5 — Delegation effectiveness ROI analysis
 */
export interface DelegationRoiAnalysis {
  period: string;
  totalDelegations: number;
  successfulDelegations: number;
  delegationSuccessRate: number;
  costPerDelegation: number;
  estimatedTimeSavedHours: number;
  roiMultiplier: number;
  topPerformingAgents: Array<{
    agentId: string;
    agentName: string;
    delegations: number;
    successRate: number;
    costEfficiency: number;
  }>;
  recommendations: string[];
}

/**
 * 9.8 — Compliance risk notification
 */
export interface ComplianceRisk {
  id: string;
  riskLevel: 'critical' | 'high' | 'medium' | 'low';
  regulation: string;
  description: string;
  affectedAgents: string[];
  currentScore: number;
  trendDirection: 'improving' | 'degrading' | 'stable';
  requiredActions: string[];
  deadline?: string;
}

/**
 * 9.10 — Critical business alert
 */
export interface CriticalAlert {
  id: string;
  type:
    | 'system_failure'
    | 'compliance_breach'
    | 'cost_spike'
    | 'performance_degradation'
    | 'pattern_detected';
  severity: 'critical' | 'high';
  title: string;
  description: string;
  affectedSystems: string[];
  suggestedAction: string;
  createdAt: string;
  acknowledged: boolean;
}

/**
 * 9.7 — Categorized recommendation
 */
export interface CategorizedRecommendation extends Recommendation {
  category: 'strategic' | 'operational' | 'tactical';
  businessDomain: string;
  stakeholders: string[];
}

export class DecisionSynthesisService {
  constructor(
    private aggregator: DataAggregator,
    private recommendationEngine: RecommendationEngine,
    _anomalyDetector: AnomalyDetector,
    private db: DbPool,
    private cache: CacheClient,
    _logger: Logger,
  ) {}

  /**
   * 9.1 — Detect cross-agent patterns with business impact assessment.
   */
  async detectPatterns(): Promise<BusinessPattern[]> {
    const cached = await this.cache.get<BusinessPattern[]>('bi:patterns');
    if (cached) return cached;

    const latest = this.aggregator.getLatest();
    if (!latest) return [];

    const patterns: BusinessPattern[] = [];
    const agents = latest.agents;
    let idCounter = 0;
    const nextId = () => `pat-${Date.now()}-${++idCounter}`;

    // Pattern: Failure cascade — multiple agents failing simultaneously
    const failingAgents = agents.filter((a) => a.performance.failureRate > 0.2);
    if (failingAgents.length >= 2) {
      patterns.push({
        id: nextId(),
        type: 'failure_cascade',
        title: 'Multi-agent failure cascade detected',
        description: `${failingAgents.length} agents experiencing elevated failure rates simultaneously, suggesting systemic infrastructure or dependency issues.`,
        affectedAgents: failingAgents.map((a) => a.agentId),
        businessImpact: {
          severity: failingAgents.length >= 3 ? 'critical' : 'high',
          estimatedCostImpact: failingAgents.reduce(
            (sum, a) => sum + a.performance.totalExecutions * a.performance.failureRate * 5,
            0,
          ),
          affectedOperations: failingAgents.map((a) => a.agentName),
          riskCategory: 'operational_resilience',
        },
        confidence: Math.min(0.95, 0.6 + failingAgents.length * 0.1),
        detectedAt: new Date().toISOString(),
      });
    }

    // Pattern: Cost trend — agents with disproportionate cost
    const withCost = agents.filter(
      (a) => a.efficiency.costPerExecution != null && a.efficiency.costPerExecution! > 0,
    );
    if (withCost.length >= 2) {
      const avgCost =
        withCost.reduce((s, a) => s + a.efficiency.costPerExecution!, 0) / withCost.length;
      const expensive = withCost.filter((a) => a.efficiency.costPerExecution! > avgCost * 2);
      if (expensive.length > 0) {
        patterns.push({
          id: nextId(),
          type: 'cost_trend',
          title: 'Cost outlier agents detected',
          description: `${expensive.length} agent(s) cost more than 2x the average (avg: $${avgCost.toFixed(2)}/exec). Review for optimization.`,
          affectedAgents: expensive.map((a) => a.agentId),
          businessImpact: {
            severity: 'medium',
            estimatedCostImpact: expensive.reduce(
              (s, a) =>
                s + (a.efficiency.costPerExecution! - avgCost) * a.performance.totalExecutions,
              0,
            ),
            affectedOperations: expensive.map((a) => a.agentName),
            riskCategory: 'cost_efficiency',
          },
          confidence: 0.8,
          detectedAt: new Date().toISOString(),
        });
      }
    }

    // Pattern: Efficiency gap — some agents significantly outperforming others on same workload
    const successRates = agents.map((a) => a.performance.successRate).filter((r) => r > 0);
    if (successRates.length >= 3) {
      const avgRate = successRates.reduce((s, r) => s + r, 0) / successRates.length;
      const underperformers = agents.filter(
        (a) => a.performance.successRate < avgRate * 0.7 && a.performance.totalExecutions > 10,
      );
      if (underperformers.length > 0) {
        patterns.push({
          id: nextId(),
          type: 'efficiency_gap',
          title: 'Significant performance gap across agents',
          description: `${underperformers.length} agent(s) performing >30% below average success rate. Knowledge transfer or configuration alignment recommended.`,
          affectedAgents: underperformers.map((a) => a.agentId),
          businessImpact: {
            severity: 'medium',
            estimatedCostImpact: 0,
            affectedOperations: underperformers.map((a) => a.agentName),
            riskCategory: 'operational_efficiency',
          },
          confidence: 0.7,
          detectedAt: new Date().toISOString(),
        });
      }
    }

    // Pattern: Compliance drift — multiple agents drifting
    const driftingAgents = agents.filter((a) => a.compliance.drifted);
    if (driftingAgents.length >= 2) {
      patterns.push({
        id: nextId(),
        type: 'compliance_drift',
        title: 'Widespread behavioral drift detected',
        description: `${driftingAgents.length} agents showing behavioral drift. May indicate policy changes needed or environmental shifts.`,
        affectedAgents: driftingAgents.map((a) => a.agentId),
        businessImpact: {
          severity: driftingAgents.length >= 3 ? 'high' : 'medium',
          estimatedCostImpact: 0,
          affectedOperations: driftingAgents.map((a) => a.agentName),
          riskCategory: 'compliance',
        },
        confidence: 0.85,
        detectedAt: new Date().toISOString(),
      });
    }

    await this.cache.set('bi:patterns', patterns, 60);
    return patterns;
  }

  /**
   * 9.2 — Business-context decision recommendations.
   * 9.7 — Strategic/operational/tactical categorization.
   */
  async getBusinessRecommendations(role?: string): Promise<CategorizedRecommendation[]> {
    const recs = await this.recommendationEngine.generateRecommendations(
      role as UserRole | undefined,
    );

    return recs.map((rec) => ({
      ...rec,
      category: categorizeRecommendation(rec),
      businessDomain:
        rec.type === 'cost' ? 'finance' : rec.type === 'compliance' ? 'governance' : 'operations',
      stakeholders: rec.targetRoles,
    }));
  }

  /**
   * 9.3 — Business stakeholder notification payloads.
   */
  async getStakeholderNotifications(): Promise<
    Array<{
      recipientRole: string;
      notificationType: string;
      title: string;
      message: string;
      severity: string;
      actionRequired: boolean;
    }>
  > {
    const patterns = await this.detectPatterns();
    const notifications: Array<{
      recipientRole: string;
      notificationType: string;
      title: string;
      message: string;
      severity: string;
      actionRequired: boolean;
    }> = [];

    for (const pattern of patterns) {
      if (
        pattern.businessImpact.severity === 'critical' ||
        pattern.businessImpact.severity === 'high'
      ) {
        notifications.push({
          recipientRole: 'executive',
          notificationType: 'critical_pattern',
          title: pattern.title,
          message: pattern.description,
          severity: pattern.businessImpact.severity,
          actionRequired: true,
        });

        notifications.push({
          recipientRole: 'manager',
          notificationType: 'pattern_alert',
          title: pattern.title,
          message: `${pattern.description} Affected: ${pattern.affectedAgents.join(', ')}`,
          severity: pattern.businessImpact.severity,
          actionRequired: true,
        });
      }
    }

    return notifications;
  }

  /**
   * 9.4 — Decision pattern BI integration (query historical decisions).
   */
  async getDecisionHistory(limit = 20): Promise<
    Array<{
      id: string;
      type: string;
      title: string;
      status: string;
      confidence: number;
      decidedAt: string;
    }>
  > {
    const { rows } = await this.db
      .query<{
        id: string;
        decision_type: string;
        title: string;
        status: string;
        confidence_score: string;
        decided_at: string;
      }>(
        `SELECT id, decision_type, title, status, confidence_score, decided_at
       FROM business_decisions
       ORDER BY decided_at DESC
       LIMIT $1`,
        [limit],
      )
      .catch(() => ({ rows: [] }));

    return rows.map((r) => ({
      id: r.id,
      type: r.decision_type,
      title: r.title,
      status: r.status,
      confidence: Number(r.confidence_score),
      decidedAt: r.decided_at,
    }));
  }

  /**
   * 9.5 — ROI analysis for delegation effectiveness patterns.
   */
  async getDelegationRoiAnalysis(): Promise<DelegationRoiAnalysis> {
    const cached = await this.cache.get<DelegationRoiAnalysis>('bi:delegation-roi');
    if (cached) return cached;

    const latest = this.aggregator.getLatest();
    const agents = latest?.agents ?? [];

    const totalDelegations = agents.reduce((s, a) => s + a.performance.totalExecutions, 0);
    const successfulDelegations = agents.reduce(
      (s, a) => s + Math.round(a.performance.totalExecutions * a.performance.successRate),
      0,
    );
    const totalCost = agents.reduce(
      (s, a) => s + (a.efficiency.costPerExecution ?? 0) * a.performance.totalExecutions,
      0,
    );
    const costPerDelegation = totalDelegations > 0 ? totalCost / totalDelegations : 0;

    // Estimate time saved: assume each successful delegation saves 15 minutes of human time
    const estimatedTimeSavedHours = (successfulDelegations * 15) / 60;
    // ROI: value of time saved ($50/hr) vs cost
    const valueSaved = estimatedTimeSavedHours * 50;
    const roiMultiplier = totalCost > 0 ? valueSaved / totalCost : 0;

    const topPerforming = [...agents]
      .filter((a) => a.performance.totalExecutions > 0)
      .sort((a, b) => b.performance.successRate - a.performance.successRate)
      .slice(0, 5)
      .map((a) => ({
        agentId: a.agentId,
        agentName: a.agentName,
        delegations: a.performance.totalExecutions,
        successRate: a.performance.successRate,
        costEfficiency: a.efficiency.costPerExecution ?? 0,
      }));

    const recommendations: string[] = [];
    if (roiMultiplier < 1)
      recommendations.push('Overall delegation ROI is below 1x — review agent cost optimization');
    if (costPerDelegation > 0.5)
      recommendations.push(
        'Average cost per delegation is high — consider model downgrades for simple tasks',
      );
    const lowPerformers = agents.filter((a) => a.performance.successRate < 0.7);
    if (lowPerformers.length > 0)
      recommendations.push(
        `${lowPerformers.length} agents below 70% success — retrain or reconfigure`,
      );

    const analysis: DelegationRoiAnalysis = {
      period: 'last_30_days',
      totalDelegations,
      successfulDelegations,
      delegationSuccessRate: totalDelegations > 0 ? successfulDelegations / totalDelegations : 0,
      costPerDelegation,
      estimatedTimeSavedHours,
      roiMultiplier,
      topPerformingAgents: topPerforming,
      recommendations,
    };

    await this.cache.set('bi:delegation-roi', analysis, 120);
    return analysis;
  }

  /**
   * 9.6 — Business validation for confidence scoring.
   */
  validateConfidence(
    confidence: number,
    sampleSize: number,
  ): {
    adjustedConfidence: number;
    reliability: 'high' | 'medium' | 'low';
    reasoning: string;
  } {
    // Penalize confidence for small sample sizes
    const sampleFactor = Math.min(1, sampleSize / 100);
    const adjusted = confidence * sampleFactor;

    return {
      adjustedConfidence: Math.round(adjusted * 100) / 100,
      reliability: adjusted >= 0.8 ? 'high' : adjusted >= 0.5 ? 'medium' : 'low',
      reasoning:
        sampleSize < 30
          ? `Low sample size (${sampleSize}) reduces confidence from ${(confidence * 100).toFixed(0)}% to ${(adjusted * 100).toFixed(0)}%`
          : `Sufficient data (${sampleSize} samples) — confidence ${(adjusted * 100).toFixed(0)}%`,
    };
  }

  /**
   * 9.8 — Compliance risk notifications.
   */
  async getComplianceRisks(): Promise<ComplianceRisk[]> {
    const cached = await this.cache.get<ComplianceRisk[]>('bi:compliance-risks');
    if (cached) return cached;

    const latest = this.aggregator.getLatest();
    if (!latest) return [];

    const risks: ComplianceRisk[] = [];
    let idCounter = 0;

    // Check for drifting agents as compliance risks
    const drifting = latest.agents.filter((a) => a.compliance.drifted);
    if (drifting.length > 0) {
      risks.push({
        id: `crisk-${++idCounter}`,
        riskLevel: drifting.length >= 3 ? 'high' : 'medium',
        regulation: 'Behavioral Compliance',
        description: `${drifting.length} agent(s) showing behavioral drift from established baselines`,
        affectedAgents: drifting.map((a) => a.agentId),
        currentScore: Math.max(0, 100 - drifting.length * 15),
        trendDirection: 'degrading',
        requiredActions: [
          'Review drift alerts for each agent',
          'Update baselines if drift represents desired evolution',
          'Remediate unauthorized behavioral changes',
        ],
      });
    }

    // Check for high failure rates as risk
    const highFailure = latest.agents.filter((a) => a.performance.failureRate > 0.2);
    if (highFailure.length > 0) {
      risks.push({
        id: `crisk-${++idCounter}`,
        riskLevel: highFailure.some((a) => a.performance.failureRate > 0.4) ? 'critical' : 'high',
        regulation: 'Operational Reliability',
        description: `${highFailure.length} agent(s) with failure rates exceeding 20% threshold`,
        affectedAgents: highFailure.map((a) => a.agentId),
        currentScore: Math.max(
          0,
          100 -
            highFailure.reduce((s, a) => s + a.performance.failureRate * 100, 0) /
              highFailure.length,
        ),
        trendDirection: 'degrading',
        requiredActions: [
          'Investigate root causes of failures',
          'Implement circuit breakers for cascading failures',
          'Review and update error handling policies',
        ],
      });
    }

    await this.cache.set('bi:compliance-risks', risks, 60);
    return risks;
  }

  /**
   * 9.9 — Financial impact notifications.
   */
  async getFinancialImpactAlerts(): Promise<
    Array<{
      type: string;
      description: string;
      amount: number;
      currency: string;
      trend: string;
    }>
  > {
    const latest = this.aggregator.getLatest();
    if (!latest) return [];

    const alerts: Array<{
      type: string;
      description: string;
      amount: number;
      currency: string;
      trend: string;
    }> = [];

    const totalCost = latest.agents.reduce(
      (s, a) => s + (a.efficiency.costPerExecution ?? 0) * a.performance.totalExecutions,
      0,
    );
    if (totalCost > 100) {
      alerts.push({
        type: 'cost_threshold',
        description: `Total agent costs exceed $100 for current period`,
        amount: totalCost,
        currency: 'USD',
        trend: 'increasing',
      });
    }

    const wastedCost = latest.agents.reduce(
      (s, a) =>
        s +
        (a.efficiency.costPerExecution ?? 0) *
          a.performance.totalExecutions *
          a.performance.failureRate,
      0,
    );
    if (wastedCost > 10) {
      alerts.push({
        type: 'wasted_spend',
        description: `$${wastedCost.toFixed(2)} spent on failed executions`,
        amount: wastedCost,
        currency: 'USD',
        trend: 'increasing',
      });
    }

    return alerts;
  }

  /**
   * 9.10 — Real-time business alerting for critical patterns.
   */
  async getCriticalAlerts(): Promise<CriticalAlert[]> {
    const cached = await this.cache.get<CriticalAlert[]>('bi:critical-alerts');
    if (cached) return cached;

    const [patterns, risks] = await Promise.all([this.detectPatterns(), this.getComplianceRisks()]);

    const alerts: CriticalAlert[] = [];
    const now = new Date().toISOString();
    let idCounter = 0;

    // Convert critical patterns to alerts
    for (const pattern of patterns) {
      if (
        pattern.businessImpact.severity === 'critical' ||
        pattern.businessImpact.severity === 'high'
      ) {
        alerts.push({
          id: `alert-${++idCounter}`,
          type:
            pattern.type === 'failure_cascade'
              ? 'system_failure'
              : pattern.type === 'compliance_drift'
                ? 'compliance_breach'
                : pattern.type === 'cost_trend'
                  ? 'cost_spike'
                  : 'pattern_detected',
          severity: pattern.businessImpact.severity === 'critical' ? 'critical' : 'high',
          title: pattern.title,
          description: pattern.description,
          affectedSystems: pattern.affectedAgents,
          suggestedAction: `Review ${pattern.affectedAgents.length} affected agent(s) and implement remediation`,
          createdAt: now,
          acknowledged: false,
        });
      }
    }

    // Convert critical compliance risks to alerts
    for (const risk of risks) {
      if (risk.riskLevel === 'critical') {
        alerts.push({
          id: `alert-${++idCounter}`,
          type: 'compliance_breach',
          severity: 'critical',
          title: `Compliance risk: ${risk.regulation}`,
          description: risk.description,
          affectedSystems: risk.affectedAgents,
          suggestedAction: risk.requiredActions[0] ?? 'Review compliance risks',
          createdAt: now,
          acknowledged: false,
        });
      }
    }

    await this.cache.set('bi:critical-alerts', alerts, 30);
    return alerts;
  }
}

// --- Helpers ---

function categorizeRecommendation(rec: Recommendation): 'strategic' | 'operational' | 'tactical' {
  if (
    rec.type === 'strategic' ||
    (rec.impact.timeframe === 'next_quarter' && rec.priority === 'high')
  )
    return 'strategic';
  if (rec.type === 'compliance' || rec.type === 'risk') return 'operational';
  return 'tactical';
}
