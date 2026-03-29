/**
 * SOMA integration adapter — read-only access to organizational intelligence.
 *
 * Reads soma-report.json and vault data to provide business intelligence.
 * Does NOT import SOMA directly; reads its output files for loose coupling.
 */

import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  SourceAdapter,
  SystemHealth,
  AgentPerformance,
  KnowledgeInsight,
  PolicyInfo,
} from './types.js';

export interface SomaAdapterConfig {
  /** Path to soma-report.json */
  reportPath: string;
  /** Path to SOMA vault directory */
  vaultDir: string;
}

export function loadSomaAdapterConfig(): SomaAdapterConfig {
  return {
    reportPath: process.env.BI_SOMA_REPORT_PATH ?? '.soma/soma-report.json',
    vaultDir: process.env.BI_SOMA_VAULT_DIR ?? '.soma/vault',
  };
}

interface SomaReport {
  available: boolean;
  generatedAt: string;
  agents: Array<{
    name: string;
    totalRuns: number;
    failures: number;
    failureRate: number;
    status: 'healthy' | 'warning' | 'critical';
  }>;
  insights: Array<{
    type: string;
    title: string;
    claim: string;
    confidence: string;
    layer?: string;
    confidence_score?: number;
    proposal_status?: string;
  }>;
  policies: Array<{
    name: string;
    enforcement: string;
    scope: string;
    conditions: string;
  }>;
  totals: {
    agents: number;
    executions: number;
    insights: number;
    policies: number;
  };
  layers?: Record<string, number>;
}

export class SomaAdapter implements SourceAdapter {
  readonly name = 'soma';
  private config: SomaAdapterConfig;
  private cachedReport: SomaReport | null = null;
  private cacheTime = 0;
  private readonly cacheTtlMs = 30_000;

  constructor(config: SomaAdapterConfig) {
    this.config = config;
  }

  async health(): Promise<SystemHealth> {
    try {
      const info = await stat(this.config.reportPath);
      const report = await this.getReport();
      return {
        system: 'soma',
        status: report.available ? 'healthy' : 'degraded',
        lastSyncAt: info.mtime.toISOString(),
        recordCount: report.totals?.insights ?? 0,
      };
    } catch {
      return {
        system: 'soma',
        status: 'failing',
        lastSyncAt: null,
        recordCount: 0,
        errorMessage: 'Cannot read soma-report.json',
      };
    }
  }

  async getAgents(): Promise<AgentPerformance[]> {
    const report = await this.getReport();
    return (report.agents ?? []).map((a) => ({
      agentId: a.name,
      agentName: a.name,
      status: a.status,
      totalExecutions: a.totalRuns,
      successCount: a.totalRuns - a.failures,
      failureCount: a.failures,
      failureRate: a.failureRate,
    }));
  }

  async getInsights(): Promise<KnowledgeInsight[]> {
    const report = await this.getReport();
    return (report.insights ?? []).map((i) => ({
      type: i.type,
      title: i.title,
      claim: i.claim,
      confidence: i.confidence,
      confidenceScore: i.confidence_score,
      layer: i.layer,
      status: i.proposal_status,
    }));
  }

  async getPolicies(): Promise<PolicyInfo[]> {
    const report = await this.getReport();
    return report.policies ?? [];
  }

  async getLayerCounts(): Promise<Record<string, number>> {
    const report = await this.getReport();
    return report.layers ?? {};
  }

  async getTotals(): Promise<Record<string, number>> {
    const report = await this.getReport();
    return report.totals ?? {};
  }

  private async getReport(): Promise<SomaReport> {
    const now = Date.now();
    if (this.cachedReport && now - this.cacheTime < this.cacheTtlMs) {
      return this.cachedReport;
    }

    try {
      const raw = await readFile(this.config.reportPath, 'utf-8');
      this.cachedReport = JSON.parse(raw) as SomaReport;
      this.cacheTime = now;
      return this.cachedReport;
    } catch {
      return {
        available: false,
        generatedAt: new Date().toISOString(),
        agents: [],
        insights: [],
        policies: [],
        totals: { agents: 0, executions: 0, insights: 0, policies: 0 },
      };
    }
  }
}
