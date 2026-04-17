/**
 * OpsIntel integration adapter — read-only access to operational intelligence.
 *
 * Provides efficiency metrics, drift detection results, and assertions.
 * Reads SOMA ops-intel output; does not import ops-intel directly.
 */

import { readFile, stat } from 'node:fs/promises';
import type { SourceAdapter, SystemHealth, EfficiencyMetrics } from './types.js';

export interface OpsIntelAdapterConfig {
  /** Path to ops-intel report or data directory */
  dataPath: string;
}

export function loadOpsIntelAdapterConfig(): OpsIntelAdapterConfig {
  return {
    dataPath: process.env.BI_OPSINTEL_DATA_PATH ?? '.soma/ops-intel.json',
  };
}

interface OpsIntelReport {
  generatedAt: string;
  efficiency: Array<{
    agentId: string;
    score: number;
    flags: Array<{ flag: string; severity: string; detail: string }>;
    costPerExecution?: number;
    tokenUsage?: number;
  }>;
  drift: Array<{
    agentId: string;
    drifted: boolean;
    score: number;
    alerts: string[];
  }>;
  assertions: Array<{
    name: string;
    passed: boolean;
    message?: string;
  }>;
}

export class OpsIntelAdapter implements SourceAdapter {
  readonly name = 'opsintel';
  private config: OpsIntelAdapterConfig;
  private cachedReport: OpsIntelReport | null = null;
  private cacheTime = 0;
  private readonly cacheTtlMs = 30_000;

  constructor(config: OpsIntelAdapterConfig) {
    this.config = config;
  }

  async health(): Promise<SystemHealth> {
    try {
      const info = await stat(this.config.dataPath);
      const report = await this.getReport();
      return {
        system: 'opsintel',
        status: 'healthy',
        lastSyncAt: info.mtime.toISOString(),
        recordCount: (report.efficiency?.length ?? 0) + (report.drift?.length ?? 0),
      };
    } catch {
      return {
        system: 'opsintel',
        status: 'failing',
        lastSyncAt: null,
        recordCount: 0,
        errorMessage: 'Cannot read ops-intel data',
      };
    }
  }

  async getEfficiencyMetrics(): Promise<EfficiencyMetrics[]> {
    const report = await this.getReport();
    return (report.efficiency ?? []).map((e) => ({
      agentId: e.agentId,
      costPerExecution: e.costPerExecution,
      tokenUsage: e.tokenUsage,
    }));
  }

  async getDriftAlerts(): Promise<
    Array<{ agentId: string; drifted: boolean; score: number; alerts: string[] }>
  > {
    const report = await this.getReport();
    return report.drift ?? [];
  }

  async getAssertionResults(): Promise<
    Array<{ name: string; passed: boolean; message?: string }>
  > {
    const report = await this.getReport();
    return report.assertions ?? [];
  }

  private async getReport(): Promise<OpsIntelReport> {
    const now = Date.now();
    if (this.cachedReport && now - this.cacheTime < this.cacheTtlMs) {
      return this.cachedReport;
    }

    try {
      const raw = await readFile(this.config.dataPath, 'utf-8');
      this.cachedReport = JSON.parse(raw) as OpsIntelReport;
      this.cacheTime = now;
      return this.cachedReport;
    } catch {
      return { generatedAt: new Date().toISOString(), efficiency: [], drift: [], assertions: [] };
    }
  }
}
