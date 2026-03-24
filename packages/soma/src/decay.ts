/**
 * Decay mechanics for ephemeral knowledge layers.
 *
 * L2 (Working Memory) and L3 (Emerging Knowledge) entries have configurable
 * decay windows. Expired entries are moved to L1 (Execution Archive) with
 * original metadata preserved and a `decayed_from` field.
 *
 * L1 and L4 entries never decay.
 *
 * @module
 */

import type { DecayConfig, Entity, KnowledgeLayer, Vault } from './types.js';
import { queryByLayer, writeToLayer } from './layers.js';

const DEFAULT_L2_DECAY_DAYS = 14;
const DEFAULT_L3_DECAY_DAYS = 90;

/**
 * Update evidence_links in L3/L4 entries that reference the old ID to point to the new ID.
 */
function updateEvidenceReferences(vault: Vault, oldId: string, newId: string): void {
  // Scan L3 and L4 entries for evidence_links containing oldId
  for (const layer of ['emerging', 'canon'] as KnowledgeLayer[]) {
    const entries = queryByLayer(vault, layer);
    for (const entry of entries) {
      const links = entry.evidence_links;
      if (!Array.isArray(links) || !links.includes(oldId)) continue;

      const updatedLinks = links.map((id: string) => id === oldId ? newId : id);
      vault.update(entry.id, { evidence_links: updatedLinks } as Partial<Entity>);
    }
  }
}

/**
 * Check for dangling evidence_links across all layered entries.
 * Returns array of { entryId, missingTargetId } for broken links.
 */
export function checkDanglingReferences(vault: Vault): { entryId: string; missingTargetId: string }[] {
  const dangling: { entryId: string; missingTargetId: string }[] = [];

  for (const layer of ['emerging', 'canon'] as KnowledgeLayer[]) {
    const entries = queryByLayer(vault, layer);
    for (const entry of entries) {
      const links = entry.evidence_links;
      if (!Array.isArray(links)) continue;

      for (const linkId of links) {
        // Check if linked entity exists in any type
        let found = false;
        for (const type of ['execution', 'insight', 'decision', 'policy', 'agent', 'archetype', 'assumption', 'constraint', 'contradiction', 'synthesis']) {
          if (vault.read(type, linkId)) { found = true; break; }
        }
        if (!found) {
          dangling.push({ entryId: entry.id, missingTargetId: linkId });
        }
      }
    }
  }

  return dangling;
}

export interface DecayResult {
  /** Number of L2 entries decayed to L1 */
  l2Decayed: number;
  /** Number of L3 entries decayed to L1 */
  l3Decayed: number;
  /** Total entries processed */
  total: number;
}

/**
 * Create a decay processor.
 */
export function createDecayProcessor(vault: Vault, config?: DecayConfig) {
  const l2DefaultDays = config?.l2DefaultDays ?? DEFAULT_L2_DECAY_DAYS;
  const l3DefaultDays = config?.l3DefaultDays ?? DEFAULT_L3_DECAY_DAYS;
  const teamDecayDays = config?.teamDecayDays ?? {};

  /**
   * Calculate the decay_at timestamp for a new L2 entry.
   */
  function computeL2DecayAt(teamId: string): string {
    const days = teamDecayDays[teamId] ?? l2DefaultDays;
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  }

  /**
   * Calculate the decay_at timestamp for a new L3 entry.
   */
  function computeL3DecayAt(): string {
    return new Date(Date.now() + l3DefaultDays * 24 * 60 * 60 * 1000).toISOString();
  }

  /**
   * Extend decay_at on read access (activity-based decay extension).
   * Resets the decay timer to now + configured window.
   */
  function extendDecayOnAccess(entity: Entity): void {
    if (!entity.layer || !entity.decay_at) return;
    if (entity.layer !== 'working' && entity.layer !== 'emerging') return;

    let newDecayAt: string;
    if (entity.layer === 'working') {
      const days = (entity.team_id ? teamDecayDays[entity.team_id] : undefined) ?? l2DefaultDays;
      newDecayAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
    } else {
      newDecayAt = new Date(Date.now() + l3DefaultDays * 24 * 60 * 60 * 1000).toISOString();
    }

    vault.update(entity.id, { decay_at: newDecayAt } as Partial<Entity>);
  }

  /**
   * Process expired entries: move L2/L3 entries past their decay_at to L1.
   */
  function processDecay(): DecayResult {
    const now = Date.now();
    let l2Decayed = 0;
    let l3Decayed = 0;

    // Process L2 entries
    const l2Entries = queryByLayer(vault, 'working');
    for (const entry of l2Entries) {
      if (!entry.decay_at) continue;
      if (new Date(entry.decay_at).getTime() > now) continue;

      // Move to L1 with decayed_from metadata
      // Use distinct ID to avoid colliding with the original entry
      try {
        writeToLayer(vault, 'reconciler', 'archive', {
          type: entry.type,
          id: `decayed-${entry.id}`,
          name: entry.name,
          status: entry.status,
          tags: [...entry.tags, 'decayed'],
          related: entry.related,
          body: entry.body,
          decayed_from: 'working' as KnowledgeLayer,
          // Preserve original metadata
          team_id: entry.team_id,
          agent_id: entry.agent_id,
          trace_id: entry.trace_id,
          source_system: entry.source_system,
        } as Partial<Entity> & { type: string; name: string });

        // Update evidence references before removing
        updateEvidenceReferences(vault, entry.id, `decayed-${entry.id}`);
        vault.remove(entry.id);
        l2Decayed++;
      } catch {
        // Skip failed decays
      }
    }

    // Process L3 entries — skip promoted and rejected
    const l3Entries = queryByLayer(vault, 'emerging');
    for (const entry of l3Entries) {
      if (!entry.decay_at) continue;
      if (new Date(entry.decay_at).getTime() > now) continue;

      // Skip promoted and rejected entries
      if (entry.status === 'promoted' || entry.status === 'rejected') continue;

      // Move to L1 with decayed_from metadata
      // Use distinct ID to avoid colliding with the original entry
      try {
        writeToLayer(vault, 'reconciler', 'archive', {
          type: entry.type,
          id: `decayed-${entry.id}`,
          name: entry.name,
          status: entry.status,
          tags: [...entry.tags, 'decayed'],
          related: entry.related,
          body: entry.body,
          decayed_from: 'emerging' as KnowledgeLayer,
          // Preserve original metadata
          confidence_score: entry.confidence_score,
          evidence_links: entry.evidence_links,
          agent_id: entry.agent_id,
        } as Partial<Entity> & { type: string; name: string });

        // Update evidence references before removing
        updateEvidenceReferences(vault, entry.id, `decayed-${entry.id}`);
        vault.remove(entry.id);
        l3Decayed++;
      } catch {
        // Skip failed decays
      }
    }

    return { l2Decayed, l3Decayed, total: l2Decayed + l3Decayed };
  }

  return {
    computeL2DecayAt,
    computeL3DecayAt,
    extendDecayOnAccess,
    processDecay,

    /** Get the configured decay windows. */
    getConfig() {
      return { l2DefaultDays, l3DefaultDays, teamDecayDays };
    },
  };
}
