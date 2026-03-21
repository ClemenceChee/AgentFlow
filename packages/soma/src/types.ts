/**
 * Soma type definitions.
 *
 * Entity types, vault interface, vector store interface, worker configs.
 * All types are framework-agnostic — no hardcoded agent names or systems.
 *
 * @module
 */

import type { AgentProfile, AnalysisFn } from 'agentflow-core';

// ---------------------------------------------------------------------------
// Entity base
// ---------------------------------------------------------------------------

/** All valid entity types. Extensible via the type registry. */
export type EntityType =
  | 'agent'
  | 'execution'
  | 'archetype' // Agent Layer
  | 'insight'
  | 'policy'
  | 'decision' // Knowledge Layer
  | 'assumption'
  | 'constraint'
  | 'contradiction'
  | 'synthesis'
  | string; // Extensible

/** Valid statuses per entity type. */
export const ENTITY_STATUSES: Record<string, readonly string[]> = {
  agent: ['active', 'inactive', 'deprecated'],
  execution: ['completed', 'failed', 'running', 'pending'],
  archetype: ['active', 'proposed', 'deprecated'],
  insight: ['active', 'superseded', 'rejected'],
  policy: ['active', 'draft', 'deprecated', 'enforcing'],
  decision: ['active', 'superseded', 'reversed'],
  assumption: ['active', 'validated', 'invalidated'],
  constraint: ['active', 'resolved', 'deprecated'],
  contradiction: ['active', 'resolved'],
  synthesis: ['active', 'superseded'],
};

/** Required fields for all entity types. */
export const REQUIRED_FIELDS = ['type', 'id', 'name', 'created'] as const;

/** Base entity — all entities extend this. */
export interface Entity {
  /** Entity type (matches directory name in vault) */
  type: EntityType;
  /** Unique identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Current status */
  status: string;
  /** ISO timestamp of creation */
  created: string;
  /** ISO timestamp of last update */
  updated: string;
  /** Tags for categorization and filtering */
  tags: string[];
  /** Wikilinks to related entities: `["agent/my-agent", "archetype/scan-pattern"]` */
  related: string[];
  /** Body content (Markdown) */
  body: string;
  /** Arbitrary extra frontmatter fields */
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Agent Layer entities
// ---------------------------------------------------------------------------

export interface AgentEntity extends Entity {
  type: 'agent';
  /** Agent identifier (matches AgentFlow agentId) */
  agentId: string;
  /** Agent framework (agentflow, openclaw, langchain, etc.) */
  framework?: string;
  /** Purpose description */
  purpose?: string;
  /** Rolling profile stats */
  profile?: AgentProfile;
  /** Total execution count */
  totalExecutions?: number;
  /** Failure rate (0.0–1.0) */
  failureRate?: number;
}

export interface ExecutionEntity extends Entity {
  type: 'execution';
  /** Reference to the agent */
  agentId: string;
  /** Execution duration in ms */
  duration?: number;
  /** Number of nodes in the execution graph */
  nodeCount?: number;
  /** Execution path variant signature */
  variant?: string;
  /** Conformance score (0.0–1.0) */
  conformanceScore?: number;
  /** Trigger type */
  trigger?: string;
}

export interface ArchetypeEntity extends Entity {
  type: 'archetype';
  /** Pattern description */
  pattern: string;
  /** Confidence score (0.0–1.0) */
  confidence: number;
  /** Agent IDs that exhibit this pattern */
  memberAgents: string[];
  /** Execution IDs that match this pattern */
  memberExecutions: string[];
  /** Known bottleneck node names */
  bottlenecks: string[];
  /** Suggested policies derived from this archetype */
  suggestedPolicies: string[];
}

// ---------------------------------------------------------------------------
// Knowledge Layer entities
// ---------------------------------------------------------------------------

export interface InsightEntity extends Entity {
  type: 'insight';
  /** What was discovered */
  claim: string;
  /** Supporting evidence */
  evidence: string[];
  /** Confidence level */
  confidence: 'low' | 'medium' | 'high';
  /** Source entity IDs that led to this insight */
  sourceIds: string[];
}

export interface PolicyEntity extends Entity {
  type: 'policy';
  /** What this policy applies to (agent, node type, etc.) */
  scope: string;
  /** Conditions that trigger the policy */
  conditions: string;
  /** Enforcement type */
  enforcement: 'warn' | 'error' | 'abort' | 'info';
  /** Threshold values for guards */
  thresholds?: Record<string, number>;
}

export interface DecisionEntity extends Entity {
  type: 'decision';
  /** What was decided */
  claim: string;
  /** Why this decision was made */
  rationale: string;
  /** Evidence supporting the decision */
  evidence: string[];
  /** Confidence level */
  confidence: 'low' | 'medium' | 'high';
  sourceIds: string[];
}

export interface AssumptionEntity extends Entity {
  type: 'assumption';
  claim: string;
  evidence: string[];
  confidence: 'low' | 'medium' | 'high';
  sourceIds: string[];
}

export interface ConstraintEntity extends Entity {
  type: 'constraint';
  claim: string;
  evidence: string[];
  confidence: 'low' | 'medium' | 'high';
  sourceIds: string[];
}

export interface ContradictionEntity extends Entity {
  type: 'contradiction';
  claim: string;
  /** The two conflicting positions */
  positionA: string;
  positionB: string;
  evidence: string[];
  sourceIds: string[];
}

export interface SynthesisEntity extends Entity {
  type: 'synthesis';
  claim: string;
  /** IDs of entities synthesized */
  synthesizedFrom: string[];
  evidence: string[];
  confidence: 'low' | 'medium' | 'high';
}

// ---------------------------------------------------------------------------
// Vault
// ---------------------------------------------------------------------------

export interface VaultConfig {
  /** Base directory for the vault. Default: `.soma/vault` */
  baseDir?: string;
}

export interface QueryFilter {
  [key: string]: unknown;
  limit?: number;
  offset?: number;
}

export interface Vault {
  /** Base directory path */
  readonly baseDir: string;

  /** Create an entity. Returns the entity ID. */
  create(entity: Partial<Entity> & { type: string; name: string }): string;
  /** Read an entity by type and ID (or name). */
  read(type: string, id: string): Entity | null;
  /** Update an entity's frontmatter fields. */
  update(id: string, patch: Partial<Entity>): void;
  /** Delete an entity. */
  remove(id: string): void;

  /** List entities of a type with optional filters. */
  list(type: string, filter?: QueryFilter): Entity[];
  /** Find entities by tag. */
  findByTag(tag: string): Entity[];
  /** Find entities linked to a given entity (follow wikilinks). */
  findLinked(id: string): Entity[];

  /** Rebuild the fast-lookup index from disk. */
  rebuildIndex(): void;
}

// ---------------------------------------------------------------------------
// Vector Store
// ---------------------------------------------------------------------------

export interface VectorSearchResult {
  id: string;
  score: number;
  metadata: Record<string, unknown>;
}

export interface VectorStore {
  /** Store a vector with metadata. */
  upsert(id: string, vector: number[], metadata: Record<string, unknown>): Promise<void>;
  /** Delete a vector. */
  delete(id: string): Promise<void>;
  /** Semantic search — find nearest neighbors. */
  search(
    queryVector: number[],
    options?: {
      limit?: number;
      filter?: Record<string, unknown>;
    },
  ): Promise<VectorSearchResult[]>;
  /** Get count of stored vectors. */
  count(): Promise<number>;
}

// ---------------------------------------------------------------------------
// Worker configs
// ---------------------------------------------------------------------------

/** User-provided embedding function. */
export type EmbedFn = (text: string) => Promise<number[]>;

export interface HarvesterConfig {
  /** Concurrency limit for inbox processing. Default: 4 */
  concurrency?: number;
  /** State file path. Default: `.soma/harvester-state.json` */
  stateFile?: string;
  /** Custom inbox parsers keyed by file extension (e.g., `.csv`). Merged with built-in parsers. */
  parsers?: Record<string, InboxParserFn>;
}

/** Inbox parser function signature for HarvesterConfig. */
export type InboxParserFn = (
  content: string,
  fileName: string,
) => {
  events?: (import('agentflow-core').ExecutionEvent | import('agentflow-core').PatternEvent)[];
  entities?: (Partial<Entity> & { type: string; name: string })[];
};

export interface SynthesizerConfig {
  /** Minimum score threshold for candidates. Default: 0.4 */
  scoreThreshold?: number;
  /** Fuzzy match threshold for dedup. Default: 0.7 */
  dedupThreshold?: number;
  /** State file path. Default: `.soma/synthesizer-state.json` */
  stateFile?: string;
}

export interface CartographerConfig {
  /** Minimum cluster size. Default: 3 */
  minClusterSize?: number;
  /** Similarity threshold for relationship suggestions. Default: 0.5 */
  similarityThreshold?: number;
  /** State file path. Default: `.soma/cartographer-state.json` */
  stateFile?: string;
}

export interface ReconcilerConfig {
  /** Minimum body length for non-stub. Default: 100 */
  stubThreshold?: number;
  /** State file path. Default: `.soma/reconciler-state.json` */
  stateFile?: string;
}

export interface SomaConfig {
  /** Vault directory. Default: `.soma/vault` */
  vaultDir?: string;
  /** Vector store instance. If not provided, uses JSON file backend. */
  vectorStore?: VectorStore;
  /** LLM function for Synthesizer and Reconciler. */
  analysisFn?: AnalysisFn;
  /** Embedding function for Cartographer. */
  embedFn?: EmbedFn;
  /** Inbox directory for Harvester. Default: `.soma/inbox` */
  inboxDir?: string;
  /** Worker configs */
  harvester?: HarvesterConfig;
  synthesizer?: SynthesizerConfig;
  cartographer?: CartographerConfig;
  reconciler?: ReconcilerConfig;
}

// ---------------------------------------------------------------------------
// Scan issues (Reconciler)
// ---------------------------------------------------------------------------

export interface ScanIssue {
  /** Issue code (FM001, LINK001, etc.) */
  code: string;
  /** Severity */
  severity: 'error' | 'warning' | 'info';
  /** Affected entity path */
  entityPath: string;
  /** Human-readable description */
  message: string;
  /** Can this be auto-fixed? */
  autoFixable: boolean;
}
