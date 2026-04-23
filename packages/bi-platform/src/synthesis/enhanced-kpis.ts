/**
 * Enhanced KPI computation — token economics, knowledge health,
 * and operational effectiveness from OpenClaw + cron + SOMA data.
 *
 * Tasks: 3.1-3.6, 4.1-4.5, 5.1-5.5
 */

import type { CronAdapter } from '../integrations/cron-adapter.js';
import type { OpenClawSessionAdapter } from '../integrations/openclaw-session-adapter.js';
import type { SomaAdapter } from '../integrations/soma-adapter.js';
import type { AgentAggregation } from './aggregator.js';

// --- 3. Token Economics ---

export interface TokenEconomics {
  totalSpend: number;
  totalTokens: number;
  sessionSpend: number;
  cronSpend: number;
  perAgent: Array<{ agentId: string; cost: number; tokens: number; costPerSuccess: number }>;
  perModel: Array<{ model: string; cost: number; tokens: number; costPerToken: number }>;
  wastedSpend: number;
  wastedPct: number;
  wastedWarning: boolean;
}

export async function computeTokenEconomics(
  openclawAdapter: OpenClawSessionAdapter,
  cronAdapter: CronAdapter,
  agents: AgentAggregation[],
): Promise<TokenEconomics> {
  const sessionEcon = await openclawAdapter.getTokenEconomics();
  const cronOverview = await cronAdapter.getOverview();

  // Estimate cron cost from tokens (rough: $0.01 per 1K tokens)
  const cronTokenCost = cronOverview.totalTokens * 0.00001;
  const totalSpend = sessionEcon.totalCost + cronTokenCost;
  const totalTokens = sessionEcon.totalTokens + cronOverview.totalTokens;

  // Per-agent with cost per success
  const perAgent = sessionEcon.perAgent.map((a) => {
    const agg = agents.find(
      (ag) => ag.agentId.includes(a.agentId) || a.agentId.includes(ag.agentId),
    );
    const successCount = agg
      ? Math.round(agg.performance.totalExecutions * agg.performance.successRate)
      : 1;
    return {
      ...a,
      costPerSuccess: successCount > 0 ? a.cost / successCount : a.cost,
    };
  });

  // Per-model with cost per token
  const perModel = sessionEcon.perModel.map((m) => ({
    ...m,
    costPerToken: m.tokens > 0 ? m.cost / m.tokens : 0,
  }));

  // Wasted spend: cost proportional to failures
  let wastedSpend = 0;
  for (const agent of agents) {
    if (agent.performance.failureRate > 0) {
      const agentCost = perAgent.find((a) => a.agentId.includes(agent.agentId))?.cost ?? 0;
      wastedSpend += agentCost * agent.performance.failureRate;
    }
  }
  // Add failed cron cost
  const cronFailedPct =
    cronOverview.totalRuns > 0
      ? (cronOverview.totalRuns -
          Math.round(cronOverview.overallSuccessRate * cronOverview.totalRuns)) /
        cronOverview.totalRuns
      : 0;
  wastedSpend += cronTokenCost * cronFailedPct;

  const wastedPct = totalSpend > 0 ? (wastedSpend / totalSpend) * 100 : 0;

  return {
    totalSpend,
    totalTokens,
    sessionSpend: sessionEcon.totalCost,
    cronSpend: cronTokenCost,
    perAgent,
    perModel,
    wastedSpend,
    wastedPct,
    wastedWarning: wastedPct > 20,
  };
}

// --- 4. Knowledge Health ---

export interface KnowledgeHealth {
  layers: { name: string; count: number }[];
  totalEntities: number;
  canonToArchiveRatio: number;
  synthesisRate: number;
  zerInsightWarning: boolean;
  governance: { pending: number; promoted: number; rejected: number };
  policyCount: number;
  policiesPerAgent: number;
  totalInsights: number;
  totalExecutions: number;
}

export async function computeKnowledgeHealth(
  somaAdapter: SomaAdapter,
  agentCount: number,
): Promise<KnowledgeHealth> {
  const [layerCounts, totals] = await Promise.all([
    somaAdapter.getLayerCounts(),
    somaAdapter.getTotals(),
  ]);

  // Also read governance from the report
  let governance = { pending: 0, promoted: 0, rejected: 0 };
  try {
    // Access the raw report for governance field
    const insights = await somaAdapter.getInsights();
    const _policies = await somaAdapter.getPolicies();
    // Governance is embedded — count by status
    const proposed = insights.filter((i) => i.status === 'proposed').length;
    const promoted = insights.filter((i) => i.status === 'promoted').length;
    const rejected = insights.filter((i) => i.status === 'rejected').length;
    governance = { pending: proposed, promoted, rejected };
  } catch {
    // Use defaults
  }

  const layers = [
    { name: 'archive', count: layerCounts.archive ?? 0 },
    { name: 'working', count: layerCounts.working ?? 0 },
    { name: 'emerging', count: layerCounts.emerging ?? 0 },
    { name: 'canon', count: layerCounts.canon ?? 0 },
  ];

  const totalEntities = layers.reduce((s, l) => s + l.count, 0);
  const archiveCount = layerCounts.archive ?? 0;
  const canonCount = layerCounts.canon ?? 0;
  const canonToArchiveRatio = archiveCount > 0 ? canonCount / archiveCount : 0;

  const totalInsights = (totals as Record<string, number>).insights ?? 0;
  const totalExecutions = (totals as Record<string, number>).executions ?? 0;
  const synthesisRate = totalExecutions > 0 ? totalInsights / totalExecutions : 0;
  const policyCount = (totals as Record<string, number>).policies ?? 0;

  return {
    layers,
    totalEntities,
    canonToArchiveRatio,
    synthesisRate,
    zerInsightWarning: totalExecutions > 0 && totalInsights === 0,
    governance,
    policyCount,
    policiesPerAgent: agentCount > 0 ? policyCount / agentCount : 0,
    totalInsights,
    totalExecutions,
  };
}

// --- 5. Operational Effectiveness ---

export interface OperationalEffectiveness {
  agentUtilization: number;
  utilizationWarning: boolean;
  activeAgents: number;
  totalRegistered: number;
  delegationSuccessRate: number;
  delegationBreakdown: Array<{ source: string; successRate: number; total: number }>;
  meanDurationMs: number;
  p95DurationMs: number;
  cronReliability: number;
  cronJobsBelow80: string[];
  durationDegrading: boolean;
}

export async function computeOperationalEffectiveness(
  openclawAdapter: OpenClawSessionAdapter,
  cronAdapter: CronAdapter,
  somaAgents: AgentAggregation[],
): Promise<OperationalEffectiveness> {
  const [ocAgents, cronOverview] = await Promise.all([
    openclawAdapter.getAgentData(),
    cronAdapter.getOverview(),
  ]);

  // Utilization: agents active in last 24h / total registered
  const activeOC = ocAgents.filter((a) => a.status === 'healthy').length;
  const totalRegistered = ocAgents.length;
  const utilization = totalRegistered > 0 ? activeOC / totalRegistered : 0;

  // Delegation success: combine SOMA + OpenClaw + Cron
  const somaTotal = somaAgents.reduce((s, a) => s + a.performance.totalExecutions, 0);
  const somaSuccess = somaAgents.reduce(
    (s, a) => s + Math.round(a.performance.totalExecutions * a.performance.successRate),
    0,
  );
  const cronTotal = cronOverview.totalRuns;
  const cronSuccess = Math.round(cronOverview.overallSuccessRate * cronTotal);
  const ocTotal = ocAgents.reduce((s, a) => s + a.totalMessages, 0);

  const grandTotal = somaTotal + cronTotal + ocTotal;
  const grandSuccess = somaSuccess + cronSuccess + ocTotal; // OC messages are inherently successful
  const delegationSuccessRate = grandTotal > 0 ? grandSuccess / grandTotal : 0;

  const breakdown = [
    { source: 'SOMA', successRate: somaTotal > 0 ? somaSuccess / somaTotal : 0, total: somaTotal },
    { source: 'OpenClaw', successRate: 1, total: ocTotal },
    { source: 'Cron', successRate: cronOverview.overallSuccessRate, total: cronTotal },
  ];

  // Duration from cron runs
  const allDurations = cronOverview.jobs.flatMap((j) => j.recentDurations);
  const sortedDurations = [...allDurations].sort((a, b) => a - b);
  const meanDuration =
    sortedDurations.length > 0
      ? sortedDurations.reduce((s, d) => s + d, 0) / sortedDurations.length
      : 0;
  const p95Index = Math.floor(sortedDurations.length * 0.95);
  const p95Duration = sortedDurations[p95Index] ?? 0;

  // Cron reliability: per-job + overall
  const jobsBelow80 = cronOverview.jobs
    .filter((j) => j.successRate < 0.8 && j.totalRuns >= 3)
    .map((j) => j.jobId);

  // Duration degradation: any job with anomaly flag
  const durationDegrading = cronOverview.jobs.some((j) => j.durationAnomaly);

  return {
    agentUtilization: utilization,
    utilizationWarning: utilization < 0.5,
    activeAgents: activeOC,
    totalRegistered,
    delegationSuccessRate,
    delegationBreakdown: breakdown,
    meanDurationMs: Math.round(meanDuration),
    p95DurationMs: Math.round(p95Duration),
    cronReliability: cronOverview.overallSuccessRate,
    cronJobsBelow80: jobsBelow80,
    durationDegrading,
  };
}
