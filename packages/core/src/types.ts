/**
 * Core type definitions for AgentFlow execution graphs.
 *
 * All public interfaces use `readonly` at every level.
 * String literal unions are used instead of enums for clean ESM erasure.
 * @module
 */

// ---------------------------------------------------------------------------
// String literal union types
// ---------------------------------------------------------------------------

/** The kind of step an execution node represents. */
export type NodeType = 'agent' | 'tool' | 'subagent' | 'wait' | 'decision' | 'custom';

/** Lifecycle status of an execution node. */
export type NodeStatus = 'running' | 'completed' | 'failed' | 'hung' | 'timeout';

/** Relationship type between two nodes in the execution graph. */
export type EdgeType = 'spawned' | 'waited_on' | 'called' | 'retried' | 'branched';

/** Aggregate status of the entire execution graph. */
export type GraphStatus = 'running' | 'completed' | 'failed';

/**
 * Event types emitted during execution.
 * These map to framework-level lifecycle events for adapter compatibility.
 */
export type TraceEventType =
  | 'agent_start'
  | 'agent_end'
  | 'tool_start'
  | 'tool_end'
  | 'tool_error'
  | 'subagent_spawn'
  | 'decision'
  | 'timeout'
  | 'custom';

// ---------------------------------------------------------------------------
// Core data interfaces (readonly — returned from build())
// ---------------------------------------------------------------------------

/** A single step in the execution graph. */
export interface ExecutionNode {
  readonly id: string;
  readonly type: NodeType;
  readonly name: string;
  /** Epoch milliseconds (Date.now()). */
  readonly startTime: number;
  /** Epoch milliseconds. `null` while the node is still running. */
  readonly endTime: number | null;
  readonly status: NodeStatus;
  /** `null` for the root node. */
  readonly parentId: string | null;
  /** IDs of child nodes spawned by this node. */
  readonly children: readonly string[];
  /** Arbitrary key-value data attached to this node. */
  readonly metadata: Readonly<Record<string, unknown>>;
  /** Mutable-at-build-time state snapshot for this node. */
  readonly state: Readonly<Record<string, unknown>>;
}

/** A directed relationship between two execution nodes. */
export interface ExecutionEdge {
  readonly from: string;
  readonly to: string;
  readonly type: EdgeType;
}

/** A raw event recorded during execution, before graph construction. */
export interface TraceEvent {
  readonly timestamp: number;
  readonly eventType: TraceEventType;
  readonly nodeId: string;
  readonly data: Readonly<Record<string, unknown>>;
}

/**
 * Optional typed data for `decision` trace events.
 * Frameworks can emit these to provide richer decision data than graph inference.
 * SOMA will use these fields if present, falling back to graph-structure inference.
 */
export interface DecisionTraceData {
  /** What was selected */
  readonly choice: string;
  /** Other options available */
  readonly alternatives?: readonly string[];
  /** Why this choice was made */
  readonly rationale?: string;
  /** Confidence in the decision (0.0-1.0) */
  readonly confidence?: number;
  /** Arbitrary context */
  readonly context?: Readonly<Record<string, unknown>>;
  /** Decision outcome */
  readonly outcome?: string;
}

/** The complete execution graph for one agent run. */
export interface ExecutionGraph {
  readonly id: string;
  readonly rootNodeId: string;
  /** All nodes indexed by ID. */
  readonly nodes: ReadonlyMap<string, ExecutionNode>;
  readonly edges: readonly ExecutionEdge[];
  readonly startTime: number;
  /** `null` if the graph is still running. */
  readonly endTime: number | null;
  readonly status: GraphStatus;
  readonly trigger: string;
  readonly agentId: string;
  /** Full ordered event log for auditability. */
  readonly events: readonly TraceEvent[];
  /** Distributed trace ID linking graphs across services. */
  readonly traceId?: string;
  /** Unique span ID for this graph within the trace. */
  readonly spanId?: string;
  /** Parent span ID, or null if this is the root span. */
  readonly parentSpanId?: string | null;
}

// ---------------------------------------------------------------------------
// Configuration and extension interfaces
// ---------------------------------------------------------------------------

/**
 * Configuration for AgentFlow.
 *
 * @example
 * ```ts
 * const builder = createGraphBuilder({
 *   agentId: 'portfolio-recon',
 *   trigger: 'user-request',
 * });
 * ```
 */
export interface AgentFlowConfig {
  /** Identifier for the agent whose execution is being traced. */
  readonly agentId?: string;
  /** What initiated this execution (e.g. "user-request", "cron-job"). */
  readonly trigger?: string;
  /** Display name for the execution graph. */
  readonly name?: string;
  /** Output writer for completed graphs. */
  readonly writer?: Writer;
  /** Framework adapters to install. */
  readonly adapters?: readonly Adapter[];
  /** Override the default counter-based ID generator. */
  readonly idGenerator?: () => string;
  /** Timeout configuration in milliseconds. */
  readonly timeout?: {
    readonly default?: number;
    readonly tool?: number;
    readonly agent?: number;
  };
  /** Custom logger (defaults to console.warn). */
  readonly logger?: (message: string) => void;
  /** Error callback for internal failures. */
  readonly onError?: (error: unknown) => void;
  /** Distributed trace ID to join an existing trace. */
  readonly traceId?: string;
  /** Parent span ID for linking to an upstream graph. */
  readonly parentSpanId?: string;
}

/**
 * Output adapter interface. Writers receive the completed execution graph
 * and persist it to their target (console, file, etc.).
 *
 * @example
 * ```ts
 * const myWriter: Writer = {
 *   write: async (graph) => { console.log(graph.id); },
 * };
 * ```
 */
export interface Writer {
  /** Write the execution graph to the output target. */
  write(graph: ExecutionGraph): Promise<void>;
}

/**
 * Framework adapter interface. Adapters hook into agent runtime lifecycle
 * events and translate them into graph builder calls.
 *
 * @example
 * ```ts
 * const myAdapter: Adapter = {
 *   name: 'my-framework',
 *   attach: (builder) => { /* hook into runtime *\/ },
 *   detach: () => { /* unhook *\/ },
 * };
 * ```
 */
export interface Adapter {
  /** Human-readable adapter name. */
  readonly name: string;
  /** Hook into the framework's lifecycle, calling builder methods on events. */
  attach(builder: GraphBuilder): void;
  /** Unhook from the framework (cleanup). */
  detach(): void;
}

// ---------------------------------------------------------------------------
// Builder interfaces
// ---------------------------------------------------------------------------

/** Options for starting a new execution node. */
export interface StartNodeOptions {
  readonly type: NodeType;
  readonly name: string;
  /** Explicit parent node ID. If omitted, uses the `withParent` stack context. */
  readonly parentId?: string;
  readonly metadata?: Record<string, unknown>;
}

/**
 * Mutable graph builder returned by `createGraphBuilder`.
 *
 * @example
 * ```ts
 * const builder = createGraphBuilder({ agentId: 'main' });
 * const rootId = builder.startNode({ type: 'agent', name: 'main' });
 * const toolId = builder.startNode({ type: 'tool', name: 'search', parentId: rootId });
 * builder.endNode(toolId);
 * builder.endNode(rootId);
 * const graph = builder.build();
 * ```
 */
export interface GraphBuilder {
  /** The graph's ID, available before `build()`. */
  readonly graphId: string;

  /** Trace context for propagating distributed trace information. */
  readonly traceContext: { traceId: string; spanId: string };

  /** Start a new execution node. Returns the generated node ID. */
  startNode(opts: StartNodeOptions): string;

  /** End a node. Status defaults to `'completed'`. */
  endNode(nodeId: string, status?: NodeStatus): void;

  /** Mark a node as failed with an error. */
  failNode(nodeId: string, error: Error | string): void;

  /** Add an explicit edge between two nodes. */
  addEdge(from: string, to: string, type: EdgeType): void;

  /**
   * Record a trace event. Timestamp is added automatically.
   *
   * @example
   * ```ts
   * builder.pushEvent({ eventType: 'custom', nodeId: rootId, data: { key: 'value' } });
   * ```
   */
  pushEvent(event: Omit<TraceEvent, 'timestamp'>): void;

  /** Shallow-merge state into a node's state object. */
  updateState(nodeId: string, state: Record<string, unknown>): void;

  /**
   * Execute `fn` with an implicit parent context.
   * Any `startNode` calls inside `fn` that omit `parentId`
   * will automatically use `parentId` as their parent.
   */
  withParent<T>(parentId: string, fn: () => T): T;

  /**
   * Return a frozen snapshot of the current graph state without finalising.
   * The builder remains usable after calling this.
   */
  getSnapshot(): ExecutionGraph;

  /** Freeze and return the completed execution graph. Throws if no root node exists. */
  build(): ExecutionGraph;
}

// ---------------------------------------------------------------------------
// Query result types
// ---------------------------------------------------------------------------

/** Aggregate statistics for an execution graph. */
export interface GraphStats {
  readonly totalNodes: number;
  readonly byStatus: Readonly<Record<NodeStatus, number>>;
  readonly byType: Readonly<Record<NodeType, number>>;
  readonly depth: number;
  readonly duration: number;
  readonly failureCount: number;
  readonly hungCount: number;
}

// ---------------------------------------------------------------------------
// Distributed tracing
// ---------------------------------------------------------------------------

/** A stitched distributed trace spanning multiple execution graphs. */
export interface DistributedTrace {
  readonly traceId: string;
  readonly graphs: ReadonlyMap<string, ExecutionGraph>;
  readonly rootGraph: ExecutionGraph;
  readonly childMap: ReadonlyMap<string, readonly string[]>;
  readonly startTime: number;
  readonly endTime: number | null;
  readonly status: GraphStatus;
}

// ---------------------------------------------------------------------------
// Process mining types
// ---------------------------------------------------------------------------

/** A transition between two steps in a discovered process model. */
export interface ProcessTransition {
  /** Source step identifier (`type:name`). */
  readonly from: string;
  /** Target step identifier (`type:name`). */
  readonly to: string;
  /** Absolute frequency: how many times this transition was observed. */
  readonly count: number;
  /** Relative frequency from the source step (0.0–1.0). */
  readonly probability: number;
}

/** A process model discovered from multiple execution graphs. */
export interface ProcessModel {
  /** All observed step identifiers (`type:name`). */
  readonly steps: readonly string[];
  /** All observed transitions with frequencies. */
  readonly transitions: readonly ProcessTransition[];
  /** Number of graphs used to build this model. */
  readonly totalGraphs: number;
  /** Agent ID from the input graphs. */
  readonly agentId: string;
}

/** A group of execution graphs that share the same structural path. */
export interface Variant {
  /** Canonical path signature for this variant. */
  readonly pathSignature: string;
  /** Number of graphs in this variant. */
  readonly count: number;
  /** Percentage of total graphs (0–100). */
  readonly percentage: number;
  /** IDs of graphs belonging to this variant. */
  readonly graphIds: readonly string[];
  /** First graph in the group (representative example). */
  readonly exampleGraph: ExecutionGraph;
}

/** Duration statistics for a node across multiple execution graphs. */
export interface Bottleneck {
  /** Node name (e.g. `"fetch-data"`). */
  readonly nodeName: string;
  /** Node type (e.g. `"tool"`). */
  readonly nodeType: NodeType;
  /** How many graphs contain this node. */
  readonly occurrences: number;
  /** Duration statistics in milliseconds. */
  readonly durations: {
    readonly median: number;
    readonly p95: number;
    readonly p99: number;
    readonly min: number;
    readonly max: number;
  };
  /** Fraction of input graphs that include this node (0–100). */
  readonly percentOfGraphs: number;
}

/** Category of deviation detected during conformance checking. */
export type DeviationType = 'unexpected-transition' | 'missing-transition' | 'low-frequency-path';

/** A specific deviation between a graph and a process model. */
export interface Deviation {
  /** Category of deviation. */
  readonly type: DeviationType;
  /** Source step identifier. */
  readonly from: string;
  /** Target step identifier. */
  readonly to: string;
  /** Human-readable description of the deviation. */
  readonly message: string;
  /** Model probability of this transition (if applicable). */
  readonly modelProbability?: number;
}

/** Result of comparing a single graph against a process model. */
export interface ConformanceReport {
  /** Ratio of conforming transitions to total transitions (0.0–1.0). */
  readonly conformanceScore: number;
  /** True when conformanceScore is 1.0 (no deviations). */
  readonly isConforming: boolean;
  /** List of specific deviations found. */
  readonly deviations: readonly Deviation[];
}

// ---------------------------------------------------------------------------
// Guard types
// ---------------------------------------------------------------------------

/** Explanation attached to every guard violation for transparency. */
export interface GuardExplanation {
  /** The guard rule name (e.g., 'max-depth', 'timeout'). */
  readonly rule: string;
  /** The configured threshold that was exceeded. */
  readonly threshold: number | string;
  /** The actual observed value. */
  readonly actual: number | string;
  /** Where the threshold came from. */
  readonly source: 'static' | 'soma-policy' | 'adaptive' | 'assertion';
  /** Optional historical evidence supporting the threshold. */
  readonly evidence?: string;
}

/** Outcome assertion for post-action verification. */
export interface OutcomeAssertion {
  /** Human-readable label for this assertion. */
  readonly name: string;
  /** Verification function — returns true if the expected outcome occurred. */
  readonly verify: () => Promise<boolean> | boolean;
  /** Timeout in milliseconds (default: 5000). */
  readonly timeout?: number;
}

/**
 * A detected guard violation.
 */
export interface GuardViolation {
  readonly type:
    | 'timeout'
    | 'reasoning-loop'
    | 'spawn-explosion'
    | 'high-failure-rate'
    | 'conformance-drift'
    | 'known-bottleneck'
    | 'outcome_mismatch';
  readonly nodeId: string;
  readonly message: string;
  readonly timestamp: number;
  readonly explanation: GuardExplanation;
}

// ---------------------------------------------------------------------------
// Efficiency & Receipts types
// ---------------------------------------------------------------------------

/** Per-node cost attribution. */
export interface NodeCost {
  readonly nodeId: string;
  readonly name: string;
  readonly type: NodeType;
  readonly tokenCost: number | null;
  readonly durationMs: number | null;
}

/** Wasteful pattern detection flag. */
export interface EfficiencyFlag {
  readonly pattern: 'wasteful_retry' | 'context_bloat';
  readonly nodeName: string;
  readonly retryCount?: number;
  readonly tokenCost: number;
  readonly message: string;
}

/** Per-run efficiency summary. */
export interface RunEfficiency {
  readonly graphId: string;
  readonly agentId: string;
  readonly totalTokenCost: number;
  readonly completedNodes: number;
  readonly costPerNode: number;
}

/** Aggregate efficiency report across runs. */
export interface EfficiencyReport {
  readonly runs: readonly RunEfficiency[];
  readonly aggregate: { mean: number; median: number; p95: number };
  readonly flags: readonly EfficiencyFlag[];
  readonly nodeCosts: readonly NodeCost[];
  readonly dataCoverage: number;
}

/** Per-step summary in a run receipt. */
export interface StepSummary {
  readonly nodeId: string;
  readonly name: string;
  readonly type: NodeType;
  readonly status: NodeStatus;
  readonly durationMs: number | null;
  readonly tokenCost: number | null;
  readonly error: string | null;
}

/** Structured run summary. */
export interface RunReceipt {
  readonly runId: string;
  readonly agentId: string;
  readonly status: GraphStatus;
  readonly startTime: number;
  readonly endTime: number | null;
  readonly totalDurationMs: number | null;
  readonly totalTokenCost: number | null;
  readonly steps: readonly StepSummary[];
  readonly summary: {
    readonly attempted: number;
    readonly succeeded: number;
    readonly failed: number;
    readonly skipped: number;
  };
}

// ---------------------------------------------------------------------------
// Drift detection types
// ---------------------------------------------------------------------------

/** A single conformance history entry. */
export interface ConformanceHistoryEntry {
  readonly agentId: string;
  readonly timestamp: number;
  readonly score: number;
  readonly runId: string;
}

/** Conformance score history for an agent. */
export type ConformanceHistory = ConformanceHistoryEntry[];

/** Options for drift detection. */
export interface DriftOptions {
  /** Sliding window size (number of runs). Default: 50. */
  readonly windowSize?: number;
}

/** Drift detection report. */
export interface DriftReport {
  readonly status: 'stable' | 'degrading' | 'improving' | 'insufficient_data';
  readonly slope: number;
  readonly r2: number;
  readonly windowSize: number;
  readonly dataPoints: number;
  readonly alert?: {
    readonly type: 'conformance_trend_degradation';
    readonly agentId: string;
    readonly currentScore: number;
    readonly trendSlope: number;
    readonly windowSize: number;
    readonly message: string;
  };
}

// ---------------------------------------------------------------------------
// Variant options
// ---------------------------------------------------------------------------

/** Options for variant analysis. */
export interface VariantOptions {
  /** Dimensions to include in variant signature. Default: ['path']. */
  readonly dimensions?: readonly ('path' | 'modelId' | 'status')[];
}

// ---------------------------------------------------------------------------
// Event emission types
// ---------------------------------------------------------------------------

/** Event type discriminator for AgentFlow events. */
export type AgentFlowEventType =
  | 'execution.completed'
  | 'execution.failed'
  | 'pattern.discovered'
  | 'pattern.updated';

/** Optional semantic context attached to an execution event by adapters. */
export interface SemanticContext {
  readonly intent?: string;
  readonly trigger?: string;
  readonly inputSummary?: string;
  readonly outputSummary?: string;
  readonly tokenCost?: number;
  readonly modelId?: string;
}

/** Process mining context for an execution event. */
export interface ProcessContext {
  readonly variant: string;
  readonly conformanceScore: number;
  readonly isAnomaly: boolean;
}

/** The point at which an execution failed. */
export interface FailurePoint {
  readonly nodeId: string;
  readonly nodeName: string;
  readonly nodeType: NodeType;
  readonly error?: string;
}

/** A structured event emitted after an agent execution completes or fails. */
export interface ExecutionEvent {
  readonly eventType: 'execution.completed' | 'execution.failed';
  readonly graphId: string;
  readonly agentId: string;
  readonly timestamp: number;
  readonly schemaVersion: number;
  readonly status: GraphStatus;
  readonly duration: number;
  readonly nodeCount: number;
  readonly pathSignature: string;
  readonly failurePoint?: FailurePoint;
  readonly processContext?: ProcessContext;
  readonly semantic?: SemanticContext;
  readonly violations: readonly GuardViolation[];
}

/** A structured event emitted when process mining discovers a pattern. */
export interface PatternEvent {
  readonly eventType: 'pattern.discovered' | 'pattern.updated';
  readonly agentId: string;
  readonly timestamp: number;
  readonly schemaVersion: number;
  readonly pattern: {
    readonly totalGraphs: number;
    readonly variantCount: number;
    readonly topVariants: readonly {
      readonly pathSignature: string;
      readonly count: number;
      readonly percentage: number;
    }[];
    readonly topBottlenecks: readonly {
      readonly nodeName: string;
      readonly nodeType: NodeType;
      readonly p95: number;
    }[];
    readonly processModel: ProcessModel;
  };
}

/** Options for creating an ExecutionEvent from a graph. */
export interface ExecutionEventOptions {
  readonly processContext?: ProcessContext;
  readonly semantic?: SemanticContext;
  readonly violations?: readonly GuardViolation[];
}

/** Configuration for the event emitter. */
export interface EventEmitterConfig {
  readonly writers?: readonly EventWriter[];
  readonly onError?: (error: unknown) => void;
  /** Optional knowledge store for automatic event persistence. */
  readonly knowledgeStore?: KnowledgeStore;
}

/**
 * Extended Writer interface that can handle structured events.
 * Backward-compatible — existing Writers are unaffected.
 */
export interface EventWriter extends Writer {
  /** Write a structured event to the output target. */
  writeEvent(event: ExecutionEvent | PatternEvent): Promise<void>;
}

/** Event emitter for routing AgentFlow events to writers and subscribers. */
export interface EventEmitter {
  /** Emit an event to all writers and subscribers. */
  emit(event: ExecutionEvent | PatternEvent): Promise<void>;
  /** Subscribe to events. Returns an unsubscribe function. */
  subscribe(listener: (event: ExecutionEvent | PatternEvent) => void): () => void;
}

// ---------------------------------------------------------------------------
// Knowledge store & policy source
// ---------------------------------------------------------------------------

/** Derived per-agent profile accumulated from execution and pattern events. */
export interface AgentProfile {
  readonly agentId: string;
  readonly totalRuns: number;
  readonly successCount: number;
  readonly failureCount: number;
  readonly failureRate: number;
  readonly recentDurations: readonly number[];
  readonly lastConformanceScore: number | null;
  readonly knownBottlenecks: readonly string[];
  readonly lastPatternTimestamp: number | null;
  readonly updatedAt: string;
}

/** Configuration for the knowledge store. */
export interface KnowledgeStoreConfig {
  /** Base directory for knowledge storage. Defaults to `.agentflow/knowledge`. */
  readonly baseDir?: string;
}

/**
 * Filesystem-based knowledge store that accumulates execution and pattern events.
 * Implements EventWriter so it can be used directly with createEventEmitter.
 */
export interface KnowledgeStore extends EventWriter {
  /** Base directory of the knowledge store. */
  readonly baseDir: string;
  /** Persist an event and update the agent profile. */
  append(event: ExecutionEvent | PatternEvent): void;
  /** Query recent execution events for an agent. */
  getRecentEvents(agentId: string, options?: { limit?: number; since?: number }): ExecutionEvent[];
  /** Get the derived profile for an agent, or null if no history. */
  getAgentProfile(agentId: string): AgentProfile | null;
  /** Query pattern event history for an agent. */
  getPatternHistory(agentId: string, options?: { limit?: number }): PatternEvent[];
  /** Remove event files older than the given timestamp. Profiles are preserved. */
  compact(options: { olderThan: number }): { removed: number };
  /** Persist an insight event generated by the insight engine. */
  appendInsight(event: InsightEvent): void;
  /** Query recent insight events for an agent. */
  getRecentInsights(agentId: string, options?: { type?: string; limit?: number }): InsightEvent[];
}

/**
 * Read-only interface for querying accumulated knowledge.
 * Used by guards to make adaptive decisions based on execution history.
 */
export interface PolicySource {
  /** Recent failure rate for an agent (0.0–1.0). Returns 0 if no history. */
  recentFailureRate(agentId: string): number;
  /** Whether a node name appears as a known bottleneck across any agent. */
  isKnownBottleneck(nodeName: string): boolean;
  /** Most recent conformance score for an agent, or null if none recorded. */
  lastConformanceScore(agentId: string): number | null;
  /** Full derived profile for an agent, or null if no history. */
  getAgentProfile(agentId: string): AgentProfile | null;
}

// ---------------------------------------------------------------------------
// Insight engine (Tier 2 — semantic analysis)
// ---------------------------------------------------------------------------

/**
 * User-provided LLM function. AgentFlow constructs prompts and delegates
 * the actual LLM call to this function. Any provider can be wrapped as an AnalysisFn.
 */
export type AnalysisFn = (prompt: string) => Promise<string>;

/** A structured event emitted when the insight engine generates an LLM-powered analysis. */
export interface InsightEvent {
  readonly eventType: 'insight.generated';
  readonly agentId: string;
  readonly timestamp: number;
  readonly schemaVersion: number;
  readonly insightType:
    | 'failure-analysis'
    | 'anomaly-explanation'
    | 'agent-summary'
    | 'fix-suggestion';
  /** The prompt that was sent to the AnalysisFn (for auditing). */
  readonly prompt: string;
  /** The LLM response. */
  readonly response: string;
  /** Hash of input data — used for cache identity. */
  readonly dataHash: string;
}

/** Result returned by InsightEngine methods. */
export interface InsightResult {
  readonly agentId: string;
  readonly insightType: InsightEvent['insightType'];
  /** The LLM response or pre-computed message. */
  readonly content: string;
  /** Whether this result came from cache. */
  readonly cached: boolean;
  /** When the insight was generated (epoch ms). */
  readonly timestamp: number;
}

/** Configuration for the insight engine. */
export interface InsightEngineConfig {
  /** How long cached insights remain valid (ms). Default: 3600000 (1 hour). */
  readonly cacheTtlMs?: number;
}

/** LLM-powered semantic analysis engine for agent execution data. */
export interface InsightEngine {
  /** Explain recent failures for an agent in natural language. */
  explainFailures(agentId: string): Promise<InsightResult>;
  /** Explain why a specific execution was anomalous. */
  explainAnomaly(agentId: string, event: ExecutionEvent): Promise<InsightResult>;
  /** Generate a natural language health summary for an agent. */
  summarizeAgent(agentId: string): Promise<InsightResult>;
  /** Suggest actionable fixes based on failure patterns and bottlenecks. */
  suggestFixes(agentId: string): Promise<InsightResult>;
}

/** Thresholds for policy-derived guard violations. */
export interface PolicyThresholds {
  /** Maximum acceptable failure rate before triggering a violation (default 0.5). */
  readonly maxFailureRate?: number;
  /** Minimum acceptable conformance score before triggering a violation (default 0.7). */
  readonly minConformance?: number;
}

// ---------------------------------------------------------------------------
// Internal mutable types (used only by graph-builder)
// ---------------------------------------------------------------------------

/** @internal Mutable version of ExecutionNode used during graph construction. */
export interface MutableExecutionNode {
  id: string;
  type: NodeType;
  name: string;
  startTime: number;
  endTime: number | null;
  status: NodeStatus;
  parentId: string | null;
  children: string[];
  metadata: Record<string, unknown>;
  state: Record<string, unknown>;
}
