/**
 * Cartographer — connection discovery worker.
 *
 * Embeds entities, clusters them semantically and structurally,
 * discovers archetypes, and suggests relationships.
 *
 * @module
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
// cosineSimilarity and extractWikilinks available for future use
// import { cosineSimilarity } from './vector-store.js';
// import { extractWikilinks } from './entity.js';
import type {
  CartographerConfig,
  EmbedFn,
  Entity,
  Vault,
  VectorSearchResult,
  VectorStore,
} from './types.js';

const DEFAULT_MIN_CLUSTER_SIZE = 3;
const DEFAULT_SIMILARITY_THRESHOLD = 0.5;

interface CartographerState {
  embeddedIds: Set<string>;
  /** MD5 hashes of entity text at time of embedding — used for incremental re-embedding. */
  entityHashes: Map<string, string>;
  clusterAssignments: Record<string, number>;
}

/**
 * Create a Cartographer worker.
 */
export function createCartographer(
  vault: Vault,
  vectorStore: VectorStore,
  embedFn?: EmbedFn,
  config?: CartographerConfig,
) {
  const minClusterSize = config?.minClusterSize ?? DEFAULT_MIN_CLUSTER_SIZE;
  const similarityThreshold = config?.similarityThreshold ?? DEFAULT_SIMILARITY_THRESHOLD;
  const stateFile = config?.stateFile ?? '.soma/cartographer-state.json';

  let state: CartographerState = {
    embeddedIds: new Set(),
    entityHashes: new Map(),
    clusterAssignments: {},
  };
  try {
    if (existsSync(stateFile)) {
      const raw = JSON.parse(readFileSync(stateFile, 'utf-8'));
      state = {
        embeddedIds: new Set(raw.embeddedIds ?? []),
        entityHashes: new Map(Object.entries(raw.entityHashes ?? {})),
        clusterAssignments: raw.clusterAssignments ?? {},
      };
    }
  } catch {
    /* fresh */
  }

  function saveState(): void {
    const dir = dirname(stateFile);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(
      stateFile,
      JSON.stringify({
        embeddedIds: [...state.embeddedIds],
        entityHashes: Object.fromEntries(state.entityHashes),
        clusterAssignments: state.clusterAssignments,
      }),
      'utf-8',
    );
  }

  function contentHash(text: string): string {
    return createHash('md5').update(text).digest('hex');
  }

  /** Extract embeddable text from an entity. */
  function entityToText(entity: Entity): string {
    return `${entity.type}: ${entity.name}\n${entity.tags.join(', ')}\n${entity.body}`.slice(
      0,
      2000,
    );
  }

  /** Build wikilink graph and find structural communities. */
  function clusterByLinks(entities: Entity[]): Map<number, string[]> {
    // Build adjacency list
    const adj = new Map<string, Set<string>>();
    for (const e of entities) {
      if (!adj.has(e.id)) adj.set(e.id, new Set());
      for (const link of e.related) {
        const linkedId = link.split('/').pop() ?? '';
        if (!adj.has(linkedId)) adj.set(linkedId, new Set());
        adj.get(e.id)?.add(linkedId);
        adj.get(linkedId)?.add(e.id); // Undirected
      }
    }

    // Simple BFS-based community detection
    const visited = new Set<string>();
    const clusters = new Map<number, string[]>();
    let clusterId = 0;

    for (const [nodeId] of adj) {
      if (visited.has(nodeId)) continue;

      const community: string[] = [];
      const queue = [nodeId];
      while (queue.length > 0) {
        const current = queue.shift()!;
        if (visited.has(current)) continue;
        visited.add(current);
        community.push(current);

        for (const neighbor of adj.get(current) ?? []) {
          if (!visited.has(neighbor)) queue.push(neighbor);
        }
      }

      if (community.length >= minClusterSize) {
        clusters.set(clusterId++, community);
      }
    }

    return clusters;
  }

  return {
    /**
     * Embed all new/changed entities into the vector store.
     * Returns the number of entities embedded.
     */
    async embed(): Promise<number> {
      if (!embedFn) return 0;

      const allTypes = [
        'agent',
        'execution',
        'archetype',
        'insight',
        'policy',
        'decision',
        'assumption',
        'constraint',
        'contradiction',
        'synthesis',
      ];
      let embedded = 0;

      for (const type of allTypes) {
        const entities = vault.list(type);
        for (const entity of entities) {
          const text = entityToText(entity);
          const hash = contentHash(text);

          // Skip if already embedded and unchanged
          if (state.embeddedIds.has(entity.id) && state.entityHashes.get(entity.id) === hash)
            continue;

          try {
            const vector = await embedFn(text);
            await vectorStore.upsert(entity.id, vector, {
              type: entity.type,
              name: entity.name,
              status: entity.status,
              tags: entity.tags,
            });
            state.embeddedIds.add(entity.id);
            state.entityHashes.set(entity.id, hash);
            embedded++;
          } catch {
            // Skip failed embeddings, continue
          }
        }
      }

      if (embedded > 0) saveState();
      return embedded;
    },

    /**
     * Discover clusters and archetypes.
     * Returns the number of archetypes created.
     */
    async discover(): Promise<number> {
      // Get all entities for structural clustering
      const allEntities: Entity[] = [];
      for (const type of ['agent', 'execution', 'archetype', 'insight', 'policy']) {
        allEntities.push(...vault.list(type));
      }

      if (allEntities.length < minClusterSize) return 0;

      // Structural clustering via wikilinks
      const linkClusters = clusterByLinks(allEntities);

      // Check for cross-agent/cross-type clusters → archetypes
      let archetypesCreated = 0;
      for (const [, members] of linkClusters) {
        const memberEntities = members
          .map((id) => allEntities.find((e) => e.id === id))
          .filter(Boolean) as Entity[];

        const types = new Set(memberEntities.map((e) => e.type));
        const agents = new Set(
          memberEntities
            .filter((e) => e.type === 'execution' || e.type === 'agent')
            .map((e) => (e as Record<string, unknown>).agentId as string)
            .filter(Boolean),
        );

        // Cross-agent or cross-type cluster → archetype candidate
        if (agents.size >= 2 || types.size >= 3) {
          const name = `archetype-cluster-${Date.now()}-${archetypesCreated}`;
          vault.create({
            type: 'archetype',
            name,
            status: 'proposed',
            pattern: `Cluster of ${members.length} entities across ${agents.size} agents and ${types.size} types`,
            confidence: Math.min(members.length / 10, 1),
            memberAgents: [...agents],
            memberExecutions: members.filter(
              (id) => memberEntities.find((e) => e.id === id)?.type === 'execution',
            ),
            bottlenecks: [],
            suggestedPolicies: [],
            tags: ['archetype', 'auto-discovered'],
            related: members.map((id) => {
              const e = memberEntities.find((x) => x.id === id);
              return e ? `${e.type}/${e.id}` : id;
            }),
            body: `Auto-discovered archetype spanning ${agents.size} agents.\n\nMembers:\n${members.map((id) => `- [[${id}]]`).join('\n')}`,
          } as Partial<Entity> & { type: string; name: string });
          archetypesCreated++;
        }
      }

      saveState();
      return archetypesCreated;
    },

    /**
     * Semantic search across all entity types.
     */
    async search(
      query: string,
      options?: { limit?: number; filter?: Record<string, unknown> },
    ): Promise<VectorSearchResult[]> {
      if (!embedFn) return [];
      const queryVector = await embedFn(query);
      return vectorStore.search(queryVector, options);
    },

    /** Suggest missing relationships within clusters. */
    async suggestRelationships(): Promise<
      { from: string; to: string; type: string; confidence: number }[]
    > {
      const suggestions: { from: string; to: string; type: string; confidence: number }[] = [];

      // For each entity, find similar entities not yet linked
      const allEntities = vault
        .list('insight')
        .concat(vault.list('decision'), vault.list('archetype'));

      for (const entity of allEntities) {
        if (!embedFn) break;

        try {
          const text = entityToText(entity);
          const vector = await embedFn(text);
          const similar = await vectorStore.search(vector, { limit: 5 });

          for (const result of similar) {
            if (result.id === entity.id) continue;
            if (result.score < similarityThreshold) continue;
            if (entity.related.some((r) => r.includes(result.id))) continue; // Already linked

            suggestions.push({
              from: entity.id,
              to: result.id,
              type: 'related-to',
              confidence: result.score,
            });
          }
        } catch {
          // Skip
        }
      }

      return suggestions;
    },
  };
}
