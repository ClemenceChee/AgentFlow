/**
 * Soma — Organizational intelligence layer for AI agent systems.
 *
 * Ingests execution events from AgentFlow, external signals, and structured data.
 * Builds a knowledge vault with semantic search. Synthesizes patterns into insights
 * and policies. Feeds learned policies back to AgentFlow guards via PolicySource.
 *
 * Four workers: Harvester (ingest), Reconciler (maintain), Synthesizer (learn), Cartographer (map).
 *
 * @module
 */

export { createCartographer } from './cartographer.js';
// Entity utilities
export { extractWikilinks, parseEntity, serializeEntity } from './entity.js';
export type { InboxParseResult, InboxParser } from './harvester.js';
export { createHarvester } from './harvester.js';
export { createSomaPolicySource } from './policy-bridge.js';
export { createReconciler } from './reconciler.js';
export { createSoma } from './soma.js';
export { createSynthesizer } from './synthesizer.js';
// Types
export type {
  AgentEntity,
  ArchetypeEntity,
  AssumptionEntity,
  CartographerConfig,
  ConstraintEntity,
  ContradictionEntity,
  DecisionEntity,
  EmbedFn,
  Entity,
  EntityType,
  ExecutionEntity,
  HarvesterConfig,
  InsightEntity,
  PolicyEntity,
  QueryFilter,
  ReconcilerConfig,
  ScanIssue,
  SomaConfig,
  SynthesisEntity,
  SynthesizerConfig,
  Vault,
  VaultConfig,
  VectorSearchResult,
  VectorStore,
} from './types.js';
// Factories
export { createVault } from './vault.js';
export {
  cosineSimilarity,
  createJsonVectorStore,
  createLanceVectorStore,
  createMilvusVectorStore,
} from './vector-store.js';
