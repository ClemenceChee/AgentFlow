/**
 * Policy Bridge — layer-aware query interface.
 *
 * Bidirectional interface between knowledge layers and agents:
 * - L4 (canon) → hard enforcement (MUST follow)
 * - L3 (emerging) → soft advisory (SHOULD consider)
 * - L2 (working) → context briefing (FYI)
 * - L1 (archive) → historical routing (reference)
 *
 * The Policy Bridge is read-only — it never writes to any layer.
 * Also implements AgentFlow's PolicySource interface for backward compatibility.
 *
 * @module
 */

import type { AgentProfile, PolicySource } from 'agentflow-core';
import { queryByLayer } from './layers.js';
import type { AgentEntity, Entity, KnowledgeLayer, Vault } from './types.js';
import { LAYER_SEMANTIC_WEIGHTS } from './types.js';

// ---------------------------------------------------------------------------
// Layer-aware query types
// ---------------------------------------------------------------------------

/** Query intents supported by the Policy Bridge. */
export type PolicyBridgeIntent = 'enforce' | 'advise' | 'brief' | 'route' | 'all';

/** Intent to layer mapping. */
const INTENT_TO_LAYER: Record<string, KnowledgeLayer> = {
  enforce: 'canon',
  advise: 'emerging',
  brief: 'working',
  route: 'archive',
};

/** A query result from the Policy Bridge with layer metadata. */
export interface PolicyBridgeResult {
  /** The matched entity */
  entry: Entity;
  /** Source knowledge layer */
  source_layer: KnowledgeLayer;
  /** Semantic weight: mandatory, advisory, contextual, historical */
  semantic_weight: string;
}

/** Stratified results from an 'all' query, grouped by layer. */
export interface StratifiedResults {
  canon: PolicyBridgeResult[];
  emerging: PolicyBridgeResult[];
  working: PolicyBridgeResult[];
  archive: PolicyBridgeResult[];
}

export class PolicyBridgeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PolicyBridgeError';
  }
}

// ---------------------------------------------------------------------------
// Layer-aware Policy Bridge
// ---------------------------------------------------------------------------

export interface LayerPolicyBridge {
  /** Query by intent (enforce, advise, brief, route, all). */
  query(
    intent: PolicyBridgeIntent,
    options?: {
      topic?: string;
      team_id?: string;
      limit?: number;
    },
  ): PolicyBridgeResult[] | StratifiedResults;

  /** Legacy PolicySource interface for AgentFlow guards. */
  policySource: PolicySource;
}

/**
 * Create a layer-aware Policy Bridge.
 * Read-only: rejects any write attempts.
 */
export function createPolicyBridge(vault: Vault): LayerPolicyBridge {
  function tagResults(entries: Entity[], layer: KnowledgeLayer): PolicyBridgeResult[] {
    return entries.map((entry) => ({
      entry,
      source_layer: layer,
      semantic_weight: LAYER_SEMANTIC_WEIGHTS[layer],
    }));
  }

  function filterByTopic(entries: Entity[], topic?: string): Entity[] {
    if (!topic) return entries;
    const lower = topic.toLowerCase();
    return entries.filter(
      (e) =>
        e.name.toLowerCase().includes(lower) ||
        e.body.toLowerCase().includes(lower) ||
        e.tags.some((t) => t.toLowerCase().includes(lower)),
    );
  }

  return {
    query(intent, options?) {
      const topic = options?.topic;
      const teamId = options?.team_id;
      const limit = options?.limit ?? 100;

      // Read-only enforcement: there's no write path here by design.
      // This is a query-only interface.

      if (intent === 'all') {
        // Combined query: return stratified results from all four layers
        const result: StratifiedResults = {
          canon: tagResults(filterByTopic(queryByLayer(vault, 'canon', { limit }), topic), 'canon'),
          emerging: tagResults(
            filterByTopic(queryByLayer(vault, 'emerging', { limit }), topic),
            'emerging',
          ),
          working: tagResults(
            filterByTopic(queryByLayer(vault, 'working', { limit, team_id: teamId }), topic),
            'working',
          ),
          archive: tagResults(
            filterByTopic(queryByLayer(vault, 'archive', { limit }), topic),
            'archive',
          ),
        };
        return result;
      }

      // Single-layer query
      const layer = INTENT_TO_LAYER[intent];
      if (!layer) {
        throw new PolicyBridgeError(
          `Unknown intent: '${intent}'. Use: enforce, advise, brief, route, or all.`,
        );
      }

      // Enforce team_id requirement for brief (L2) queries
      if (intent === 'brief' && !teamId) {
        throw new PolicyBridgeError('team_id is required for brief (L2) queries.');
      }

      const entries = queryByLayer(vault, layer, { limit, team_id: teamId });
      return tagResults(filterByTopic(entries, topic), layer);
    },

    // Legacy PolicySource for backward compatibility with AgentFlow guards
    policySource: createSomaPolicySource(vault),
  };
}

// ---------------------------------------------------------------------------
// Legacy PolicySource (backward compatible)
// ---------------------------------------------------------------------------

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
