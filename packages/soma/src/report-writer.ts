/**
 * Report writer — generates soma-report.json from vault data.
 *
 * The report JSON is the bridge between Soma (private) and
 * the AgentFlow dashboard (public). The dashboard reads this file
 * without importing any Soma code.
 *
 * @module
 */

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { KnowledgeLayer, Vault } from './types.js';
import { queryByLayer } from './layers.js';

export interface SomaReportAgent {
  name: string;
  totalRuns: number;
  failures: number;
  failureRate: number;
  status: 'healthy' | 'warning' | 'critical';
}

export interface SomaReportInsight {
  type: string;
  title: string;
  claim: string;
  confidence: string;
  layer?: KnowledgeLayer;
  confidence_score?: number;
  proposal_status?: string;
  ratified_by?: string;
  ratified_at?: string;
}

export interface SomaReportPolicy {
  name: string;
  enforcement: string;
  scope: string;
  conditions: string;
}

export interface SomaReportGuard {
  agent: string;
  action: 'allow' | 'block';
  reason: string;
}

export interface SomaReport {
  available: boolean;
  generatedAt: string;
  agents: SomaReportAgent[];
  insights: SomaReportInsight[];
  policies: SomaReportPolicy[];
  guardRecommendations: SomaReportGuard[];
  totals: {
    agents: number;
    executions: number;
    insights: number;
    policies: number;
    archetypes: number;
  };
  layers: {
    archive: number;
    working: number;
    emerging: number;
    canon: number;
  };
  governance: {
    pending: number;
    promoted: number;
    rejected: number;
  };
}

/**
 * Build a report from vault data.
 */
export function buildReport(vault: Vault, guardThreshold = 0.3): SomaReport {
  const agents = vault.list('agent');
  const executions = vault.list('execution');
  const archetypes = vault.list('archetype');

  // Collect insights from all knowledge types
  const insightEntities = [
    ...vault.list('insight'),
    ...vault.list('decision'),
    ...vault.list('assumption'),
    ...vault.list('constraint'),
    ...vault.list('contradiction'),
    ...vault.list('synthesis'),
  ];

  const policyEntities = vault.list('policy');

  // Agent stats
  const reportAgents: SomaReportAgent[] = agents.map((a) => {
    const data = a as Record<string, unknown>;
    const totalRuns = (data.totalExecutions as number) ?? 0;
    const failureRate = (data.failureRate as number) ?? 0;
    const failures = Math.round(totalRuns * failureRate);

    let status: SomaReportAgent['status'] = 'healthy';
    if (failureRate > guardThreshold) status = 'critical';
    else if (failureRate > guardThreshold * 0.5) status = 'warning';

    return { name: a.name, totalRuns, failures, failureRate, status };
  }).sort((a, b) => b.totalRuns - a.totalRuns);

  // Insights — sorted by confidence (high first), capped at 15
  const confidenceOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
  const reportInsights: SomaReportInsight[] = insightEntities
    .filter((e) => e.tags.includes('synthesized'))
    .map((e) => {
      const data = e as Record<string, unknown>;
      return {
        type: e.type,
        title: e.name,
        claim: data.claim as string ?? '',
        confidence: data.confidence as string ?? 'medium',
        layer: data.layer as KnowledgeLayer | undefined,
        confidence_score: data.confidence_score as number | undefined,
        proposal_status: data.status as string | undefined,
        ratified_by: data.ratified_by as string | undefined,
        ratified_at: data.ratified_at as string | undefined,
      };
    })
    .sort((a, b) => (confidenceOrder[a.confidence] ?? 2) - (confidenceOrder[b.confidence] ?? 2))
    .slice(0, 15);

  // Policies — sorted by enforcement severity, capped at 10
  const enforcementOrder: Record<string, number> = { error: 0, abort: 1, warn: 2, info: 3 };
  const reportPolicies: SomaReportPolicy[] = policyEntities.map((p) => {
    const data = p as Record<string, unknown>;
    return {
      name: p.name,
      enforcement: (data.enforcement as string) ?? 'warn',
      scope: (data.scope as string) ?? 'unattributed',
      conditions: (data.conditions as string) ?? '',
    };
  })
    .sort((a, b) => (enforcementOrder[a.enforcement] ?? 3) - (enforcementOrder[b.enforcement] ?? 3))
    .slice(0, 10);

  // Guard recommendations
  const guardRecommendations: SomaReportGuard[] = reportAgents
    .filter((a) => a.totalRuns >= 2) // Need at least 2 runs for meaningful data
    .map((a) => ({
      agent: a.name,
      action: (a.failureRate > guardThreshold ? 'block' : 'allow') as 'allow' | 'block',
      reason: a.failureRate > guardThreshold
        ? `Failure rate ${(a.failureRate * 100).toFixed(1)}% exceeds threshold ${(guardThreshold * 100).toFixed(0)}%`
        : `Failure rate ${(a.failureRate * 100).toFixed(1)}% is within threshold`,
    }));

  // Layer counts via queryByLayer
  const archiveEntries = queryByLayer(vault, 'archive');
  const workingEntries = queryByLayer(vault, 'working');
  const emergingEntries = queryByLayer(vault, 'emerging');
  const canonEntries = queryByLayer(vault, 'canon');

  // Governance stats from emerging entries
  const pendingCount = emergingEntries.filter((e) => e.status === 'pending').length;
  const promotedCount = emergingEntries.filter((e) => e.status === 'promoted').length;
  const rejectedCount = emergingEntries.filter((e) => e.status === 'rejected').length;

  return {
    available: true,
    generatedAt: new Date().toISOString(),
    agents: reportAgents,
    insights: reportInsights,
    policies: reportPolicies,
    guardRecommendations,
    totals: {
      agents: agents.length,
      executions: executions.length,
      insights: insightEntities.length,
      policies: policyEntities.length,
      archetypes: archetypes.length,
    },
    layers: {
      archive: archiveEntries.length,
      working: workingEntries.length,
      emerging: emergingEntries.length,
      canon: canonEntries.length,
    },
    governance: {
      pending: pendingCount,
      promoted: promotedCount,
      rejected: rejectedCount,
    },
  };
}

/**
 * Write the report to disk.
 */
export function writeReport(report: SomaReport, vaultDir: string): string {
  const reportPath = join(dirname(vaultDir), 'soma-report.json');
  const dir = dirname(reportPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
  return reportPath;
}
