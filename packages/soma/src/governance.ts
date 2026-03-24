/**
 * Governance API — L3→L4 promotion pipeline.
 *
 * Provides operations for human reviewers to inspect, promote, or reject
 * L3 (Emerging Knowledge) proposals into L4 (Institutional Canon).
 *
 * L2 entries cannot be promoted. Only L3 entries with status 'pending'
 * are eligible for promotion.
 *
 * @module
 */

import type { AutoPromoteConfig, Entity, Vault } from './types.js';
import { queryByLayer, writeToLayer } from './layers.js';

export class GovernanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GovernanceError';
  }
}

export interface AutoPromoteResult {
  promoted: string[];
  skipped: number;
}

export interface GovernanceAPI {
  /** List L3 entries with status 'pending', ordered by confidence_score descending. */
  list_pending(): Entity[];
  /** Promote an L3 entry to L4. Creates a new L4 entry and marks L3 as 'promoted'. */
  promote(entryId: string, reviewerId: string): string;
  /** Reject an L3 entry. Marks it as 'rejected' with reason recorded. */
  reject(entryId: string, reviewerId: string, reason: string): void;
  /** Get an L3 entry with its full evidence chain (linked L1 traces). */
  get_evidence(entryId: string): { entry: Entity; evidence: Entity[] };
  /** Auto-promote L3 proposals meeting confidence and agent count thresholds. */
  autoPromote(config?: AutoPromoteConfig): AutoPromoteResult;
}

/**
 * Create a Governance API instance.
 */
export function createGovernanceAPI(vault: Vault): GovernanceAPI {
  return {
    list_pending(): Entity[] {
      const l3Entries = queryByLayer(vault, 'emerging');
      return l3Entries
        .filter((e) => e.status === 'pending')
        .sort((a, b) => (b.confidence_score ?? 0) - (a.confidence_score ?? 0));
    },

    promote(entryId: string, reviewerId: string): string {
      // Find the entry
      const l3Entries = queryByLayer(vault, 'emerging');
      const entry = l3Entries.find((e) => e.id === entryId);

      if (!entry) {
        // Check if it's an L2 entry
        const l2Entries = queryByLayer(vault, 'working');
        const l2Entry = l2Entries.find((e) => e.id === entryId);
        if (l2Entry) {
          throw new GovernanceError(`L2 entries cannot be promoted. Entry '${entryId}' is in Working Memory (L2).`);
        }
        throw new GovernanceError(`Entry '${entryId}' not found in L3 (Emerging Knowledge).`);
      }

      if (entry.layer === 'working') {
        throw new GovernanceError(`L2 entries cannot be promoted. Entry '${entryId}' is in Working Memory (L2).`);
      }

      if (entry.status === 'promoted') {
        throw new GovernanceError(`Entry '${entryId}' has already been promoted.`);
      }

      if (entry.status === 'rejected') {
        throw new GovernanceError(`Entry '${entryId}' has been rejected. Resubmit to promote.`);
      }

      // Create L4 entry via governance-authorized write
      // Use distinct ID to avoid colliding with the L3 entry in the same type directory
      const now = new Date().toISOString();
      const entryData = entry as Record<string, unknown>;
      const l4Id = writeToLayer(vault, 'governance', 'canon', {
        type: entry.type,
        id: `canon-${entryId}`,
        name: entry.name,
        status: 'active',
        ratified_by: reviewerId,
        ratified_at: now,
        origin_l3_id: entryId,
        // Preserve evidence chain from L3
        evidence_links: entry.evidence_links ?? [],
        confidence_score: entry.confidence_score,
        claim: entryData.claim,
        source_agents: entryData.source_agents,
        tags: [...entry.tags.filter((t) => t !== 'l3-proposal'), 'ratified', 'canon'],
        related: entry.related,
        body: entry.body,
      } as Partial<Entity> & { type: string; name: string });

      // Mark L3 entry as promoted
      vault.update(entryId, { status: 'promoted' } as Partial<Entity>);

      return l4Id;
    },

    reject(entryId: string, reviewerId: string, reason: string): void {
      const l3Entries = queryByLayer(vault, 'emerging');
      const entry = l3Entries.find((e) => e.id === entryId);

      if (!entry) {
        // Check if it's an L2 entry
        const l2Entries = queryByLayer(vault, 'working');
        const l2Entry = l2Entries.find((e) => e.id === entryId);
        if (l2Entry) {
          throw new GovernanceError(`L2 entries cannot be rejected via governance. Entry '${entryId}' is in Working Memory (L2).`);
        }
        throw new GovernanceError(`Entry '${entryId}' not found in L3 (Emerging Knowledge).`);
      }

      if (entry.status === 'promoted') {
        throw new GovernanceError(`Entry '${entryId}' has already been promoted.`);
      }

      if (entry.status === 'rejected') {
        throw new GovernanceError(`Entry '${entryId}' has already been rejected.`);
      }

      vault.update(entryId, {
        status: 'rejected',
        rejected_by: reviewerId,
        rejected_at: new Date().toISOString(),
        rejection_reason: reason,
      } as Partial<Entity>);
    },

    autoPromote(config?: AutoPromoteConfig): AutoPromoteResult {
      const enabled = config?.enabled ?? false;
      if (!enabled) return { promoted: [], skipped: 0 };

      const minConfidence = config?.minConfidence ?? 0.9;
      const minAgentCount = config?.minAgentCount ?? 5;

      const pending = this.list_pending();
      const promoted: string[] = [];
      let skipped = 0;

      for (const entry of pending) {
        const confidence = entry.confidence_score ?? 0;
        if (confidence < minConfidence) {
          skipped++;
          continue;
        }

        // Count distinct agent_ids from evidence links
        const evidenceLinks = entry.evidence_links ?? [];
        const l1Entries = queryByLayer(vault, 'archive');
        const agentIds = new Set<string>();
        for (const linkId of evidenceLinks) {
          const linked = l1Entries.find((e) => e.id === linkId);
          if (linked) {
            const agentId = (linked as Record<string, unknown>).agent_id as string
              ?? (linked as Record<string, unknown>).agentId as string;
            if (agentId) agentIds.add(agentId);
          }
        }

        if (agentIds.size < minAgentCount) {
          skipped++;
          continue;
        }

        // Auto-promote with ratified_by='auto-promote'
        try {
          const l4Id = this.promote(entry.id, 'auto-promote');
          promoted.push(l4Id);
          console.log(`[Governance] Auto-promoted '${entry.name}' (confidence: ${confidence}, agents: ${agentIds.size})`);
        } catch {
          skipped++;
        }
      }

      return { promoted, skipped };
    },

    get_evidence(entryId: string): { entry: Entity; evidence: Entity[] } {
      const l3Entries = queryByLayer(vault, 'emerging');
      const entry = l3Entries.find((e) => e.id === entryId);

      if (!entry) {
        throw new GovernanceError(`Entry '${entryId}' not found in L3 (Emerging Knowledge).`);
      }

      // Resolve evidence links to L1 entries
      const evidence: Entity[] = [];
      const evidenceLinks = entry.evidence_links ?? [];

      for (const linkId of evidenceLinks) {
        // Search L1 for the linked entry
        const l1Entries = queryByLayer(vault, 'archive');
        const linked = l1Entries.find((e) => e.id === linkId);
        if (linked) evidence.push(linked);
      }

      return { entry, evidence };
    },
  };
}
