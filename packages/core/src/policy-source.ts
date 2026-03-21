/**
 * PolicySource: read-only interface over the knowledge store for adaptive guards.
 *
 * Bridges accumulated execution knowledge to guard decisions without
 * coupling guards to storage internals.
 *
 * @module
 */

import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import type { AgentProfile, KnowledgeStore, PolicySource } from './types.js';

/**
 * Create a PolicySource backed by a knowledge store.
 *
 * All methods delegate to the store's profile data. The PolicySource is a
 * pure read interface — it never writes to the store.
 *
 * @param store - The knowledge store to query.
 * @returns A PolicySource for use with adaptive guards.
 *
 * @example
 * ```ts
 * const store = createKnowledgeStore({ baseDir: '.agentflow/knowledge' });
 * const policy = createPolicySource(store);
 * const rate = policy.recentFailureRate('my-agent'); // 0.0–1.0
 * ```
 */
export function createPolicySource(store: KnowledgeStore): PolicySource {
  return {
    recentFailureRate(agentId: string): number {
      const profile = store.getAgentProfile(agentId);
      return profile?.failureRate ?? 0;
    },

    isKnownBottleneck(nodeName: string): boolean {
      const profilesDir = join(store.baseDir, 'profiles');
      let agentIds: string[];
      try {
        agentIds = readdirSync(profilesDir)
          .filter((f) => f.endsWith('.json'))
          .map((f) => f.replace('.json', ''));
      } catch {
        return false;
      }

      for (const agentId of agentIds) {
        const profile = store.getAgentProfile(agentId);
        if (profile?.knownBottlenecks.includes(nodeName)) {
          return true;
        }
      }
      return false;
    },

    lastConformanceScore(agentId: string): number | null {
      const profile = store.getAgentProfile(agentId);
      return profile?.lastConformanceScore ?? null;
    },

    getAgentProfile(agentId: string): AgentProfile | null {
      return store.getAgentProfile(agentId);
    },
  };
}
