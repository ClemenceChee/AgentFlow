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
