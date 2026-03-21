/**
 * Policy Bridge — connects Soma vault to AgentFlow guards.
 *
 * Implements AgentFlow's PolicySource interface by reading from the vault.
 * This closes the feedback loop: execution data → knowledge → enforcement.
 *
 * @module
 */

import type { AgentProfile, PolicySource } from 'agentflow-core';
import type { AgentEntity, Vault } from './types.js';

/**
 * Create a PolicySource that reads from Soma's vault.
 *
 * AgentFlow guards can use this to make adaptive decisions
 * based on accumulated organizational knowledge.
 */
export function createSomaPolicySource(vault: Vault): PolicySource {
  return {
    recentFailureRate(agentId: string): number {
      const normalized = agentId.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const agent = vault.read('agent', normalized) as AgentEntity | null;
      return agent?.failureRate ?? 0;
    },

    isKnownBottleneck(nodeName: string): boolean {
      const archetypes = vault.list('archetype');
      return archetypes.some((a) => {
        const bottlenecks = (a as Record<string, unknown>).bottlenecks;
        return Array.isArray(bottlenecks) && bottlenecks.includes(nodeName);
      });
    },

    lastConformanceScore(agentId: string): number | null {
      const normalized = agentId.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const executions = vault.list('execution', { agentId: normalized, limit: 1 });
      if (executions.length === 0) return null;
      return ((executions[0] as Record<string, unknown>).conformanceScore as number) ?? null;
    },

    getAgentProfile(agentId: string): AgentProfile | null {
      const normalized = agentId.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const agent = vault.read('agent', normalized) as AgentEntity | null;
      return agent?.profile ?? null;
    },
  };
}
