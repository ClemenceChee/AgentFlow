/**
 * AgentFlow integration adapter — read-only access to agent execution data.
 *
 * Reads AgentFlow trace files and execution logs to provide performance metrics.
 * Loosely coupled: reads output files, does not import agentflow-core directly.
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { AgentPerformance, SourceAdapter, SystemHealth } from './types.js';

export interface AgentFlowAdapterConfig {
  /** Path to AgentFlow traces directory */
  tracesDir: string;
  /** Path to AgentFlow config (for agent list) */
  configPath: string;
}

export function loadAgentFlowAdapterConfig(): AgentFlowAdapterConfig {
  return {
    tracesDir: process.env.BI_AGENTFLOW_TRACES_DIR ?? '.agentflow/traces',
    configPath: process.env.BI_AGENTFLOW_CONFIG_PATH ?? 'agentflow.config.json',
  };
}

interface TraceFile {
  agentId: string;
  startTime: number;
  endTime?: number;
  status: string;
  nodes?: Array<{
    id: string;
    type: string;
    status: string;
    startTime: number;
    endTime?: number;
    metadata?: Record<string, unknown>;
  }>;
}

export class AgentFlowAdapter implements SourceAdapter {
  readonly name = 'agentflow';
  private config: AgentFlowAdapterConfig;

  constructor(config: AgentFlowAdapterConfig) {
    this.config = config;
  }

  async health(): Promise<SystemHealth> {
    try {
      const info = await stat(this.config.tracesDir);
      const files = await readdir(this.config.tracesDir);
      return {
        system: 'agentflow',
        status: 'healthy',
        lastSyncAt: info.mtime.toISOString(),
        recordCount: files.filter((f) => f.endsWith('.json') || f.endsWith('.jsonl')).length,
      };
    } catch {
      return {
        system: 'agentflow',
        status: 'failing',
        lastSyncAt: null,
        recordCount: 0,
        errorMessage: 'Cannot access traces directory',
      };
    }
  }

  async getRecentTraces(limit = 50): Promise<TraceFile[]> {
    try {
      const files = await readdir(this.config.tracesDir);
      const jsonFiles = files
        .filter((f) => f.endsWith('.json'))
        .sort()
        .reverse()
        .slice(0, limit);

      const traces: TraceFile[] = [];
      for (const file of jsonFiles) {
        try {
          const raw = await readFile(join(this.config.tracesDir, file), 'utf-8');
          traces.push(JSON.parse(raw) as TraceFile);
        } catch {
          // Skip malformed trace files
        }
      }
      return traces;
    } catch {
      return [];
    }
  }

  async getAgentPerformance(): Promise<AgentPerformance[]> {
    const traces = await this.getRecentTraces(200);

    // Aggregate by agent
    const byAgent = new Map<
      string,
      { total: number; success: number; failed: number; durations: number[] }
    >();

    for (const trace of traces) {
      const agentId = trace.agentId ?? 'unknown';
      const entry = byAgent.get(agentId) ?? { total: 0, success: 0, failed: 0, durations: [] };

      entry.total++;
      if (trace.status === 'completed') {
        entry.success++;
      } else if (trace.status === 'failed') {
        entry.failed++;
      }

      if (trace.startTime && trace.endTime) {
        entry.durations.push(trace.endTime - trace.startTime);
      }

      byAgent.set(agentId, entry);
    }

    return Array.from(byAgent.entries()).map(([agentId, data]) => {
      const failureRate = data.total > 0 ? data.failed / data.total : 0;
      const avgDurationMs =
        data.durations.length > 0
          ? data.durations.reduce((a, b) => a + b, 0) / data.durations.length
          : undefined;

      return {
        agentId,
        agentName: agentId,
        status: failureRate > 0.5 ? 'critical' : failureRate > 0.1 ? 'warning' : 'healthy',
        totalExecutions: data.total,
        successCount: data.success,
        failureCount: data.failed,
        failureRate,
        avgDurationMs,
      } satisfies AgentPerformance;
    });
  }
}
