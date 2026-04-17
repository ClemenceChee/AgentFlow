/**
 * OpenClaw Session Adapter — reads agent session JSONL and session indexes
 * to discover all agents, extract token usage/cost, and model info.
 *
 * Tasks: 1.1-1.7
 */

import { readFile, readdir, stat, lstat, readlink } from 'node:fs/promises';
import { join, resolve, basename } from 'node:path';
import type { SourceAdapter, SystemHealth, AgentPerformance } from './types.js';

export interface OpenClawSessionConfig {
  agentsDir: string;
}

export function loadOpenClawSessionConfig(): OpenClawSessionConfig {
  return {
    agentsDir: process.env.BI_OPENCLAW_AGENTS_DIR ?? `${process.env.HOME}/.openclaw/agents`,
  };
}

/** Per-message usage extracted from JSONL */
export interface SessionUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost: number;
}

/** Per-agent aggregated session data */
export interface OpenClawAgentData {
  agentId: string;
  realPath: string;
  sessionCount: number;
  lastActivityAt: string | null;
  totalMessages: number;
  totalTokens: number;
  totalCost: number;
  activeModel: string | null;
  activeProvider: string | null;
  models: Map<string, { tokens: number; cost: number }>;
  status: 'healthy' | 'warning' | 'critical';
}

/** Tail-read last N lines from a file */
async function tailRead(filePath: string, maxLines: number): Promise<string[]> {
  const info = await stat(filePath);
  // For files under 1MB, read the whole thing
  if (info.size < 1_048_576) {
    const content = await readFile(filePath, 'utf-8');
    return content.trim().split('\n');
  }
  // For large files, read last chunk
  const { open } = await import('node:fs/promises');
  const chunkSize = Math.min(info.size, maxLines * 2048); // ~2KB per line estimate
  const buf = Buffer.alloc(chunkSize);
  const fh = await open(filePath, 'r');
  try {
    await fh.read(buf, 0, chunkSize, info.size - chunkSize);
    const text = buf.toString('utf-8');
    const lines = text.split('\n').filter(Boolean);
    return lines.slice(-maxLines);
  } finally {
    await fh.close();
  }
}

export class OpenClawSessionAdapter implements SourceAdapter {
  readonly name = 'openclaw-sessions';
  private config: OpenClawSessionConfig;
  private cachedAgents: OpenClawAgentData[] | null = null;
  private cacheTime = 0;
  private readonly cacheTtlMs = 30_000;

  constructor(config: OpenClawSessionConfig) {
    this.config = config;
  }

  async health(): Promise<SystemHealth> {
    try {
      await stat(this.config.agentsDir);
      const agents = await this.getAgentData();
      return {
        system: 'openclaw-sessions',
        status: agents.length > 0 ? 'healthy' : 'degraded',
        lastSyncAt: new Date().toISOString(),
        recordCount: agents.length,
      };
    } catch {
      return {
        system: 'openclaw-sessions',
        status: 'failing',
        lastSyncAt: null,
        recordCount: 0,
        errorMessage: 'Cannot access OpenClaw agents directory',
      };
    }
  }

  /** Discover all agents, resolve symlinks, deduplicate, extract metrics */
  async getAgentData(): Promise<OpenClawAgentData[]> {
    const now = Date.now();
    if (this.cachedAgents && now - this.cacheTime < this.cacheTtlMs) {
      return this.cachedAgents;
    }

    try {
      const entries = await readdir(this.config.agentsDir, { withFileTypes: true });
      const realPaths = new Map<string, string>(); // realPath → agentId

      // Phase 1: Resolve symlinks and deduplicate
      for (const entry of entries) {
        const fullPath = join(this.config.agentsDir, entry.name);
        try {
          const lstats = await lstat(fullPath);
          let realPath: string;
          if (lstats.isSymbolicLink()) {
            const target = await readlink(fullPath);
            realPath = resolve(this.config.agentsDir, target);
          } else if (lstats.isDirectory()) {
            realPath = fullPath;
          } else {
            continue;
          }
          // Keep the non-symlink name as canonical
          if (!realPaths.has(realPath) || !entry.name.startsWith('vault-')) {
            realPaths.set(realPath, entry.name);
          }
        } catch {
          continue;
        }
      }

      // Phase 2: Extract data from each unique agent
      const agents: OpenClawAgentData[] = [];
      for (const [realPath, agentId] of realPaths) {
        try {
          const data = await this.extractAgentData(agentId, realPath);
          agents.push(data);
        } catch {
          agents.push({
            agentId,
            realPath,
            sessionCount: 0,
            lastActivityAt: null,
            totalMessages: 0,
            totalTokens: 0,
            totalCost: 0,
            activeModel: null,
            activeProvider: null,
            models: new Map(),
            status: 'critical',
          });
        }
      }

      this.cachedAgents = agents;
      this.cacheTime = now;
      return agents;
    } catch {
      return [];
    }
  }

  /** Convert to AgentPerformance for aggregator compatibility */
  async getAgentPerformance(): Promise<AgentPerformance[]> {
    const agents = await this.getAgentData();
    return agents.map((a) => ({
      agentId: `openclaw-${a.agentId}`,
      agentName: a.agentId,
      status: a.status,
      totalExecutions: a.totalMessages,
      successCount: a.totalMessages, // session messages are inherently successful
      failureCount: 0,
      failureRate: 0,
      avgDurationMs: 0,
    }));
  }

  /** Get token economics for all agents */
  async getTokenEconomics(): Promise<{
    totalCost: number;
    totalTokens: number;
    perAgent: Array<{ agentId: string; cost: number; tokens: number }>;
    perModel: Array<{ model: string; cost: number; tokens: number }>;
  }> {
    const agents = await this.getAgentData();
    const totalCost = agents.reduce((s, a) => s + a.totalCost, 0);
    const totalTokens = agents.reduce((s, a) => s + a.totalTokens, 0);
    const perAgent = agents
      .filter((a) => a.totalCost > 0)
      .map((a) => ({ agentId: a.agentId, cost: a.totalCost, tokens: a.totalTokens }))
      .sort((a, b) => b.cost - a.cost);

    // Merge model data across agents
    const modelMap = new Map<string, { cost: number; tokens: number }>();
    for (const agent of agents) {
      for (const [model, data] of agent.models) {
        const existing = modelMap.get(model) ?? { cost: 0, tokens: 0 };
        existing.cost += data.cost;
        existing.tokens += data.tokens;
        modelMap.set(model, existing);
      }
    }
    const perModel = Array.from(modelMap.entries())
      .map(([model, data]) => ({ model, ...data }))
      .sort((a, b) => b.cost - a.cost);

    return { totalCost, totalTokens, perAgent, perModel };
  }

  private async extractAgentData(agentId: string, dirPath: string): Promise<OpenClawAgentData> {
    const sessionsDir = join(dirPath, 'sessions');
    const data: OpenClawAgentData = {
      agentId,
      realPath: dirPath,
      sessionCount: 0,
      lastActivityAt: null,
      totalMessages: 0,
      totalTokens: 0,
      totalCost: 0,
      activeModel: null,
      activeProvider: null,
      models: new Map(),
      status: 'critical',
    };

    // Try sessions.json index first
    const indexPath = join(sessionsDir, 'sessions.json');
    try {
      const indexRaw = await readFile(indexPath, 'utf-8');
      const index = JSON.parse(indexRaw) as Record<string, {
        sessionId: string;
        updatedAt: number;
        sessionFile?: string;
      }>;

      const sessions = Object.values(index);
      data.sessionCount = sessions.length;

      // Find most recent activity
      let maxUpdated = 0;
      for (const s of sessions) {
        if (s.updatedAt > maxUpdated) maxUpdated = s.updatedAt;
      }
      if (maxUpdated > 0) {
        data.lastActivityAt = new Date(maxUpdated).toISOString();
      }
    } catch {
      // No index — fall back to directory listing
      try {
        const files = await readdir(sessionsDir);
        const jsonlFiles = files.filter((f) => f.endsWith('.jsonl') && !f.includes('.reset.') && !f.includes('.deleted.'));
        data.sessionCount = jsonlFiles.length;

        if (jsonlFiles.length > 0) {
          const latestFile = join(sessionsDir, jsonlFiles[jsonlFiles.length - 1]);
          const info = await stat(latestFile);
          data.lastActivityAt = info.mtime.toISOString();
        }
      } catch {
        // No sessions dir
        return data;
      }
    }

    // Parse active JSONL files for usage data
    try {
      const files = await readdir(sessionsDir);
      const activeJsonl = files.filter((f) => f.endsWith('.jsonl') && !f.includes('.reset.') && !f.includes('.deleted.'));

      let currentModel = 'unknown';
      for (const file of activeJsonl) {
        const filePath = join(sessionsDir, file);
        try {
          const lines = await tailRead(filePath, 500);
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const event = JSON.parse(line);
              if (event.type === 'model_change') {
                currentModel = event.modelId ?? 'unknown';
                data.activeModel = event.modelId ?? null;
                data.activeProvider = event.provider ?? null;
              } else if (event.type === 'message' && event.usage) {
                const usage = event.usage;
                const tokens = usage.totalTokens ?? ((usage.input ?? 0) + (usage.output ?? 0));
                const cost = usage.cost?.total ?? 0;
                data.totalMessages++;
                data.totalTokens += tokens;
                data.totalCost += cost;

                // Track per-model
                const modelData = data.models.get(currentModel) ?? { cost: 0, tokens: 0 };
                modelData.cost += cost;
                modelData.tokens += tokens;
                data.models.set(currentModel, modelData);
              }
            } catch {
              // Skip malformed lines
            }
          }
        } catch {
          // Skip unreadable files
        }
      }
    } catch {
      // No session files to parse
    }

    // Derive health status from last activity
    data.status = deriveHealthStatus(data.lastActivityAt);
    return data;
  }
}

function deriveHealthStatus(lastActivity: string | null): 'healthy' | 'warning' | 'critical' {
  if (!lastActivity) return 'critical';
  const ageMs = Date.now() - new Date(lastActivity).getTime();
  const oneDay = 24 * 60 * 60 * 1000;
  const sevenDays = 7 * oneDay;
  if (ageMs < oneDay) return 'healthy';
  if (ageMs < sevenDays) return 'warning';
  return 'critical';
}
