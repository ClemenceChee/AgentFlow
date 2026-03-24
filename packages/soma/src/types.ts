/**
 * Soma type definitions.
 *
 * Entity types, vault interface, vector store interface, worker configs.
 * All types are framework-agnostic — no hardcoded agent names or systems.
 *
 * @module
 */

import type { AgentProfile, AnalysisFn as _AnalysisFn } from 'agentflow-core';

export type AnalysisFn = _AnalysisFn;

// ---------------------------------------------------------------------------
// Knowledge layers
// ---------------------------------------------------------------------------

/** The four knowledge layers in the SOMA four-layer architecture. */
export type KnowledgeLayer = 'archive' | 'working' | 'emerging' | 'canon';

/** All valid knowledge layer values. */
export const KNOWLEDGE_LAYERS: readonly KnowledgeLayer[] = ['archive', 'working', 'emerging', 'canon'] as const;

/** Semantic weight labels per layer. */
export const LAYER_SEMANTIC_WEIGHTS: Record<KnowledgeLayer, string> = {
  archive: 'historical',
  working: 'contextual',
  emerging: 'advisory',
  canon: 'mandatory',
};

// ---------------------------------------------------------------------------
// Entity base
// ---------------------------------------------------------------------------

/** All valid entity types. Extensible via the type registry. */
export type EntityType =
  | 'agent' | 'execution' | 'archetype'          // Agent Layer
  | 'insight' | 'policy' | 'decision'             // Knowledge Layer
  | 'assumption' | 'constraint' | 'contradiction' | 'synthesis'
  | string;                                        // Extensible

/** Valid statuses per entity type. */
export const ENTITY_STATUSES: Record<string, readonly string[]> = {
  agent: ['active', 'inactive', 'deprecated'],
  execution: ['completed', 'failed', 'running', 'pending'],
  archetype: ['active', 'proposed', 'deprecated'],
  insight: ['active', 'superseded', 'rejected'],
  policy: ['active', 'draft', 'deprecated', 'enforcing'],
  decision: ['active', 'superseded', 'reversed', 'flagged'],
  assumption: ['active', 'validated', 'invalidated'],
  constraint: ['active', 'resolved', 'deprecated'],
  contradiction: ['active', 'resolved'],
  synthesis: ['active', 'superseded'],
};

/** Required fields for all entity types. */
export const REQUIRED_FIELDS = ['type', 'id', 'name', 'created'] as const;

/**
 * Resolve the agent ID from an entity that may use `agentId` or `agent_id`.
 * Returns undefined if neither field exists.
 */
export function resolveAgentId(entity: Record<string, unknown>): string | undefined {
  return (entity.agentId ?? entity.agent_id) as string | undefined;
}

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

  // --- Four-layer architecture fields ---

  /** Knowledge layer: archive (L1), working (L2), emerging (L3), canon (L4) */
  layer?: KnowledgeLayer;
  /** Worker that created this entry */
  source_worker?: string;

  // L1-specific
  /** Agent identifier (also used by agent/execution entities) */
  agent_id?: string;
  /** Trace identifier for L1 entries */
  trace_id?: string;
  /** Source system for L1 entries */
  source_system?: string;
  /** Layer this entry was decayed from (set when moved to L1 via decay) */
  decayed_from?: KnowledgeLayer | null;
  /** IDs of entries reconciled into this one */
  reconciled_from?: string[] | null;
  /** ID of the entry that supersedes this one */
  superseded_by?: string | null;

  // L2-specific
  /** Team identifier (required for L2 entries) */
  team_id?: string;
  /** ISO timestamp when this entry should decay */
  decay_at?: string;

  // L3-specific
  /** Confidence score (0.0–1.0) for L3 proposals */
  confidence_score?: number;
  /** Array of L1 entry IDs that support this proposal */
  evidence_links?: string[];

  // L4-specific
  /** Who ratified this entry (L4 only) */
  ratified_by?: string;
  /** ISO timestamp of ratification (L4 only) */
  ratified_at?: string;
  /** Originating L3 entry ID (L4 only) */
  origin_l3_id?: string;

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
  /** Extracted decisions from session trace (agent-agnostic) */
  decisions?: Array<{
    action: string;
    reasoning?: string;
    tool?: string;
    args?: Record<string, unknown>;
    outcome: 'ok' | 'failed' | 'timeout' | 'skipped';
    output?: string;
    error?: string;
    durationMs?: number;
    index: number;
  }>;
  /** Decision pattern signature for cross-agent comparison */
  decisionPattern?: string;
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

  // Graph-inferred decision fields (populated by Harvester from ExecutionGraph)
  /** Decision type: tool_choice, branch, retry, delegation, failure */
  decision_type?: 'tool_choice' | 'branch' | 'retry' | 'delegation' | 'failure';
  /** What was selected (tool name, branch name, subagent name) */
  choice?: string;
  /** Other options that were available (sibling branches, alternative tools) */
  alternatives?: string[];
  /** Outcome of the decision (completed, failed) */
  outcome?: string;
  /** Arbitrary context from node metadata/state */
  decision_context?: Record<string, unknown>;
  /** Source execution graph ID */
  graph_id?: string;
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
  /** Callback invoked after a single-entity read(). Not called by batch methods. */
  onRead?: (entity: Entity) => void;
}

export interface QueryFilter {
  [key: string]: unknown;
  limit?: number;
  offset?: number;
  /** Filter by knowledge layer */
  layer?: KnowledgeLayer;
  /** Filter by team ID (for L2 queries) */
  team_id?: string;
}

// ---------------------------------------------------------------------------
// Layer write permissions
// ---------------------------------------------------------------------------

/** SOMA worker identifiers. */
export type SomaWorker = 'harvester' | 'reconciler' | 'synthesizer' | 'cartographer' | 'policy-bridge' | 'governance' | 'team-context';

/** Worker-to-layer write permission map. */
export const WORKER_WRITE_PERMISSIONS: Record<string, readonly KnowledgeLayer[]> = {
  harvester: ['archive'],
  reconciler: ['archive'],
  synthesizer: ['emerging'],
  cartographer: ['emerging'],
  governance: ['canon'],
  'team-context': ['working'],
  'policy-bridge': [],  // read-only
};

/** Layer-specific required fields. */
export const LAYER_REQUIRED_FIELDS: Record<KnowledgeLayer, readonly string[]> = {
  archive: ['layer', 'source_worker'],
  working: ['layer', 'source_worker', 'team_id', 'decay_at'],
  emerging: ['layer', 'source_worker', 'confidence_score', 'evidence_links', 'decay_at'],
  canon: ['layer', 'source_worker', 'ratified_by', 'ratified_at', 'origin_l3_id'],
};

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

  /** List entities filtered by knowledge layer (index-level filtering). */
  listByLayer(layer: KnowledgeLayer, filter?: QueryFilter): Entity[];

  /** Rebuild the fast-lookup index from disk. */
  rebuildIndex(): void;

  /** Set the onRead callback (used to wire decay-on-read after construction). */
  setOnRead(callback: (entity: Entity) => void): void;
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
  search(queryVector: number[], options?: {
    limit?: number;
    filter?: Record<string, unknown>;
  }): Promise<VectorSearchResult[]>;
  /** Get count of stored vectors. */
  count(): Promise<number>;
}

// ---------------------------------------------------------------------------
// Worker configs
// ---------------------------------------------------------------------------

/** User-provided embedding function. */
export type EmbedFn = (text: string) => Promise<number[] | null>;

export interface HarvesterConfig {
  /** Concurrency limit for inbox processing. Default: 4 */
  concurrency?: number;
  /** State file path. Default: `.soma/harvester-state.json` */
  stateFile?: string;
  /** Custom inbox parsers keyed by file extension (e.g., `.csv`). Merged with built-in parsers. */
  parsers?: Record<string, InboxParserFn>;
}

/** Inbox parser function signature for HarvesterConfig. */
export type InboxParserFn = (content: string, fileName: string) => { events?: (import('agentflow-core').ExecutionEvent | import('agentflow-core').PatternEvent)[]; entities?: (Partial<Entity> & { type: string; name: string })[] };

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

export interface DecayConfig {
  /** Default L2 decay window in days. Default: 14 */
  l2DefaultDays?: number;
  /** Default L3 decay window in days. Default: 90 */
  l3DefaultDays?: number;
  /** Per-team L2 decay windows in days. */
  teamDecayDays?: Record<string, number>;
}

export interface LayersConfig {
  /** Enable L2 (Team Working Memory). Default: false */
  working?: { enabled?: boolean };
}

export interface AutoPromoteConfig {
  /** Enable auto-promotion of high-confidence proposals. Default: false */
  enabled?: boolean;
  /** Minimum confidence score for auto-promotion. Default: 0.9 */
  minConfidence?: number;
  /** Minimum distinct agent count in evidence. Default: 5 */
  minAgentCount?: number;
}

export interface GovernanceConfig {
  /** Auto-promote configuration for high-confidence L3 proposals. */
  autoPromote?: AutoPromoteConfig;
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
  /** Decay mechanics config */
  decay?: DecayConfig;
  /** Governance config (auto-promote, etc.) */
  governance?: GovernanceConfig;
  /** Layer topology config (enable/disable L2). */
  layers?: LayersConfig;
  /** Outcome assertions evaluated after pipeline completes. */
  assertions?: Array<{ name: string; verify: () => Promise<boolean> | boolean; timeout?: number }>;
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

// ---------------------------------------------------------------------------
// AICP (AI Control Plane) — Preflight API
// ---------------------------------------------------------------------------

export interface PreflightWarning {
  rule: string;
  threshold?: number;
  actual?: number;
  message: string;
  source: string;
  sourceAgents?: string[];
}

export interface PreflightRecommendation {
  insight: string;
  sourceAgents: string[];
  confidence: number;
}

export interface PreflightResponse {
  proceed: boolean;
  warnings: PreflightWarning[];
  recommendations: PreflightRecommendation[];
  available: boolean;
  _meta: { durationMs: number };
}
