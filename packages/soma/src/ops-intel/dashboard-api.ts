/**
 * Dashboard API functions — structured data for React components.
 *
 * These functions extract the same data as the CLI commands but return
 * typed objects instead of printing to console. No side effects.
 *
 * @module
 */

import { existsSync, readFileSync } from 'node:fs';
import { createVault } from '../vault.js';
import {
  computePatternSignature,
  extractDecisionsFromNodes,
  extractDecisionsFromSession,
} from './decision-extraction.js';
import type { AgentBriefingResult, DecisionReplayResult } from './types.js';

/**
 * Extract decision chain from a trace file as structured data.
 */
export function getDecisionReplayData(options: {
  trace: string;
  vault?: string;
}): DecisionReplayResult {
  const { trace, vault: vaultDir = '.soma/vault' } = options;

  if (!trace) {
    return { error: 'Missing trace file path' };
  }

  // Resolve trace file
  const searchPaths = [trace, `${vaultDir}/../traces/${trace}`];
  let content: string | null = null;
  let isJsonl = false;

  for (const p of searchPaths) {
    if (existsSync(p)) {
      content = readFileSync(p, 'utf-8');
      isJsonl = p.endsWith('.jsonl');
      break;
    }
  }

  if (!content) {
    return { error: `Trace not found: ${trace}` };
  }

  let decisions: import('./types.js').NormalizedDecision[];
  if (isJsonl) {
    const events = content
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l));
    decisions = extractDecisionsFromSession(events);
  } else {
    // JSON graph — parse nodes
    try {
      const parsed = JSON.parse(content);
      const nodes = parsed.nodes ?? parsed;
      decisions = extractDecisionsFromNodes(
        nodes as unknown as Record<
          string,
          {
            id: string;
            type: string;
            name: string;
            status: string;
            startTime: number;
            endTime: number | null;
            metadata?: Record<string, unknown>;
            state?: Record<string, unknown>;
          }
        >,
      );
    } catch {
      return { error: `Failed to parse trace file: ${trace}` };
    }
  }

  const okCount = decisions.filter((d) => d.outcome === 'ok').length;
  const failedCount = decisions.filter((d) => d.outcome === 'failed').length;

  return {
    decisions,
    total: decisions.length,
    pattern: computePatternSignature(decisions),
    okCount,
    failedCount,
    skippedCount: decisions.length - okCount - failedCount,
  };
}

/**
 * Get agent health briefing as structured data.
 */
export function getAgentBriefingData(options: {
  agent: string;
  vault?: string;
}): AgentBriefingResult {
  const { agent: agentId, vault: vaultDir = '.soma/vault' } = options;

  if (!agentId) {
    return { error: 'Missing agent ID' };
  }

  const vault = createVault({ baseDir: vaultDir });
  const agents = vault.list('agent');
  const agent = agents.find(
    (a) => a.name === agentId || (a as Record<string, unknown>).agentId === agentId,
  );

  if (!agent) {
    return {
      error: `Agent not found: ${agentId}`,
      available: agents.map((a) => a.name),
    };
  }

  const data = agent as Record<string, unknown>;
  const totalExecutions = (data.totalExecutions as number) ?? 0;
  const failureRate = (data.failureRate as number) ?? 0;
  const failureCount = (data.failureCount as number) ?? 0;
  const status =
    failureRate > 0.5
      ? ('CRITICAL' as const)
      : failureRate > 0.1
        ? ('DEGRADED' as const)
        : ('HEALTHY' as const);

  // Gather related intelligence
  const entityTypes = ['decision', 'insight', 'constraint', 'contradiction', 'policy'];
  const intelligence: { type: string; name: string; claim: string }[] = [];

  for (const etype of entityTypes) {
    for (const e of vault.list(etype)) {
      const eData = e as Record<string, unknown>;
      const body = `${e.body} ${eData.claim ?? ''} ${e.related.join(' ')}`;
      if (body.includes(agentId) || body.includes(agent.name)) {
        intelligence.push({
          type: etype,
          name: e.name,
          claim: String(eData.claim ?? '').slice(0, 100),
        });
      }
    }
  }

  // Peer comparison
  const peers = agents
    .map((a) => ({
      name: a.name,
      failureRate: ((a as Record<string, unknown>).failureRate as number) ?? 0,
      totalExecutions: ((a as Record<string, unknown>).totalExecutions as number) ?? 0,
    }))
    .filter((a) => a.totalExecutions > 0)
    .sort((a, b) => a.failureRate - b.failureRate);

  return {
    agentId,
    status,
    failureRate,
    failureCount,
    totalExecutions,
    intelligence,
    peers,
  };
}
