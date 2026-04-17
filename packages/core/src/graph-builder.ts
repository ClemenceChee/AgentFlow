/**
 * Closure-based factory for constructing execution graphs.
 *
 * Zero dependencies. Counter-based IDs by default, injectable for testing.
 *
 * @example
 * ```ts
 * const builder = createGraphBuilder({ agentId: 'main', trigger: 'user-request' });
 * const rootId = builder.startNode({ type: 'agent', name: 'main' });
 * const toolId = builder.startNode({ type: 'tool', name: 'search', parentId: rootId });
 * builder.endNode(toolId);
 * builder.endNode(rootId);
 * const graph = builder.build();
 * ```
 * @module
 */

import { randomUUID } from 'node:crypto';

import type {
  AgentFlowConfig,
  EdgeType,
  ExecutionEdge,
  ExecutionGraph,
  GraphBuilder,
  GraphStatus,
  MutableExecutionNode,
  NodeStatus,
  StartNodeOptions,
  TraceEvent,
} from './types.js';

/**
 * Recursively freeze an object, array, or Map and all nested values.
 * Returns the same reference, now deeply frozen.
 */
function deepFreeze<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj;

  // Handle Map: freeze the Map object, then freeze each value
  if (obj instanceof Map) {
    Object.freeze(obj);
    for (const value of obj.values()) {
      deepFreeze(value);
    }
    return obj;
  }

  Object.freeze(obj);
  const record = obj as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    const value = record[key];
    if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
      deepFreeze(value);
    }
  }
  return obj;
}

/** Create a counter-based ID generator: node_001, node_002, etc. */
function createCounterIdGenerator(): () => string {
  let counter = 0;
  return () => {
    counter++;
    return `node_${String(counter).padStart(3, '0')}`;
  };
}

/**
 * Create a new execution graph builder.
 *
 * @param config - Optional configuration (agentId, trigger, custom ID generator, etc.).
 * @returns A `GraphBuilder` with methods to construct the graph incrementally.
 *
 * @example
 * ```ts
 * const builder = createGraphBuilder({ agentId: 'portfolio-recon', trigger: 'cron' });
 * const rootId = builder.startNode({ type: 'agent', name: 'recon' });
 * builder.endNode(rootId);
 * const graph = builder.build();
 * ```
 */
export function createGraphBuilder(config?: AgentFlowConfig): GraphBuilder {
  const generateId = config?.idGenerator ?? createCounterIdGenerator();
  const agentId = config?.agentId ?? 'unknown';
  const trigger = config?.trigger ?? 'manual';
  const spanId = randomUUID();
  const traceId =
    config?.traceId ??
    (typeof process !== 'undefined' ? process.env?.AGENTFLOW_TRACE_ID : undefined) ??
    randomUUID();
  const parentSpanId =
    config?.parentSpanId ??
    (typeof process !== 'undefined' ? process.env?.AGENTFLOW_PARENT_SPAN_ID : undefined) ??
    null;

  // Read Claude Code session context from environment variables if not provided in config
  // Environment variables expected:
  //   OPERATOR_ID - Unique identifier for the operator/user
  //   CLAUDE_CODE_SESSION_ID - Session identifier for the Claude Code instance
  //   TEAM_ID - Team identifier for organizational context
  //   CLAUDE_CODE_INSTANCE_ID - Instance identifier (CLI, desktop, web, etc.)
  //   CLAUDE_CODE_USER_AGENT - User agent string for the Claude Code instance
  const operatorContext = config?.operatorContext ?? (typeof process !== 'undefined' ? {
    operatorId: process.env?.OPERATOR_ID,
    sessionId: process.env?.CLAUDE_CODE_SESSION_ID,
    teamId: process.env?.TEAM_ID,
    instanceId: process.env?.CLAUDE_CODE_INSTANCE_ID,
    timestamp: Date.now(),
    userAgent: process.env?.CLAUDE_CODE_USER_AGENT
  } : undefined);

  // --- Mutable internal state (closure scope) ---
  const graphId = generateId();
  const startTime = Date.now();
  const nodes = new Map<string, MutableExecutionNode>();
  const edges: ExecutionEdge[] = [];
  const events: TraceEvent[] = [];
  const parentStack: string[] = [];
  let rootNodeId: string | null = null;
  let built = false;

  // --- Session initialization hooks ---
  const sessionHooks = config?.sessionHooks;
  let sessionInitialized = false;

  /**
   * Execute session start hook with organizational context.
   */
  async function executeSessionStartHook(): Promise<{
    shouldProceed: boolean;
    briefing?: string;
    warnings?: string[];
  }> {
    if (!sessionHooks?.onSessionStart) {
      return { shouldProceed: true };
    }

    try {
      const hookContext = {
        operatorId: operatorContext?.operatorId,
        teamId: operatorContext?.teamId,
        sessionId: operatorContext?.sessionId,
        agentId,
        trigger,
      };

      const result = await sessionHooks.onSessionStart(hookContext);
      return result;
    } catch (error) {
      console.warn('[AgentFlow] Session start hook failed:', error);
      return { shouldProceed: true }; // Fail gracefully
    }
  }

  /**
   * Execute session initialized hook.
   */
  async function executeSessionInitializedHook(): Promise<void> {
    if (!sessionHooks?.onSessionInitialized || sessionInitialized) {
      return;
    }

    try {
      const hookContext = {
        operatorId: operatorContext?.operatorId,
        teamId: operatorContext?.teamId,
        sessionId: operatorContext?.sessionId,
        graphId,
        traceId,
      };

      await sessionHooks.onSessionInitialized(hookContext);
      sessionInitialized = true;
    } catch (error) {
      console.warn('[AgentFlow] Session initialized hook failed:', error);
    }
  }

  /**
   * Execute session end hook when graph is built.
   */
  async function executeSessionEndHook(status: 'completed' | 'failed' | 'timeout'): Promise<void> {
    if (!sessionHooks?.onSessionEnd) {
      return;
    }

    try {
      const hookContext = {
        operatorId: operatorContext?.operatorId,
        teamId: operatorContext?.teamId,
        sessionId: operatorContext?.sessionId,
        graphId,
        status,
        duration: Date.now() - startTime,
      };

      await sessionHooks.onSessionEnd(hookContext);
    } catch (error) {
      console.warn('[AgentFlow] Session end hook failed:', error);
    }
  }

  function assertNotBuilt(): void {
    if (built) {
      throw new Error('GraphBuilder: cannot mutate after build() has been called');
    }
  }

  function getNode(nodeId: string): MutableExecutionNode {
    const node = nodes.get(nodeId);
    if (!node) {
      throw new Error(`GraphBuilder: node "${nodeId}" does not exist`);
    }
    return node;
  }

  function recordEvent(
    nodeId: string,
    eventType: TraceEvent['eventType'],
    data: Record<string, unknown> = {},
  ): void {
    events.push({
      timestamp: Date.now(),
      eventType,
      nodeId,
      data,
    });
  }

  /** Build an ExecutionGraph from the current state (shared by build and getSnapshot). */
  function buildGraph(): ExecutionGraph {
    if (rootNodeId === null) {
      throw new Error('GraphBuilder: cannot build a graph with no nodes');
    }

    // Determine aggregate graph status
    let graphStatus: GraphStatus = 'completed';
    for (const node of nodes.values()) {
      if (node.status === 'failed' || node.status === 'timeout' || node.status === 'hung') {
        graphStatus = 'failed';
        break;
      }
      if (node.status === 'running') {
        graphStatus = 'running';
        // Don't break — a failed node takes priority over running
      }
    }

    // Determine endTime: null if any node is still running
    const endTime = graphStatus === 'running' ? null : Date.now();

    // Build a frozen Map<string, ExecutionNode> from the mutable map
    const frozenNodes = new Map(
      [...nodes.entries()].map(([id, mNode]) => [
        id,
        {
          id: mNode.id,
          type: mNode.type,
          name: mNode.name,
          startTime: mNode.startTime,
          endTime: mNode.endTime,
          status: mNode.status,
          parentId: mNode.parentId,
          children: [...mNode.children],
          metadata: { ...mNode.metadata },
          state: { ...mNode.state },
        },
      ]),
    );

    const graph: ExecutionGraph = {
      id: graphId,
      rootNodeId,
      nodes: frozenNodes,
      edges: [...edges],
      startTime,
      endTime,
      status: graphStatus,
      trigger,
      agentId,
      events: [...events],
      traceId,
      spanId,
      parentSpanId,
      operatorContext: operatorContext && operatorContext.operatorId && operatorContext.sessionId ? operatorContext : undefined,
    };

    return deepFreeze(graph);
  }

  const builder: GraphBuilder = {
    get graphId() {
      return graphId;
    },

    get traceContext() {
      return { traceId, spanId };
    },

    startNode(opts: StartNodeOptions): string {
      assertNotBuilt();

      const id = generateId();
      const parentId = opts.parentId ?? parentStack[parentStack.length - 1] ?? null;

      // Execute session start hook for the first (root) node
      if (rootNodeId === null && sessionHooks?.onSessionStart) {
        // Note: This is a synchronous version of the hook for compatibility
        // Async session control should be done at the framework level
        try {
          const hookContext = {
            operatorId: operatorContext?.operatorId,
            teamId: operatorContext?.teamId,
            sessionId: operatorContext?.sessionId,
            agentId,
            trigger,
          };

          // For synchronous compatibility, we only call sync hooks here
          // Async hooks should be called by the framework before createGraphBuilder
          if (typeof sessionHooks.onSessionStart !== 'function' || sessionHooks.onSessionStart.constructor.name === 'AsyncFunction') {
            console.warn('[AgentFlow] Async session hooks should be called before createGraphBuilder()');
          }
        } catch (error) {
          console.warn('[AgentFlow] Session start hook validation failed:', error);
        }
      }

      // Validate parent exists if specified
      if (parentId !== null && !nodes.has(parentId)) {
        throw new Error(`GraphBuilder: parent node "${parentId}" does not exist`);
      }

      const node: MutableExecutionNode = {
        id,
        type: opts.type,
        name: opts.name,
        startTime: Date.now(),
        endTime: null,
        status: 'running',
        parentId,
        children: [],
        metadata: opts.metadata ? { ...opts.metadata } : {},
        state: {},
      };

      nodes.set(id, node);

      // Link to parent
      if (parentId !== null) {
        const parent = nodes.get(parentId);
        if (parent) {
          parent.children.push(id);
        }
        edges.push({ from: parentId, to: id, type: 'spawned' });
      }

      // First node becomes root
      if (rootNodeId === null) {
        rootNodeId = id;

        // Execute session initialized hook for the root node
        if (sessionHooks?.onSessionInitialized && !sessionInitialized) {
          try {
            const hookContext = {
              operatorId: operatorContext?.operatorId,
              teamId: operatorContext?.teamId,
              sessionId: operatorContext?.sessionId,
              graphId,
              traceId,
            };

            // Call sync version or queue async version
            const result = sessionHooks.onSessionInitialized(hookContext);
            if (result && typeof result.then === 'function') {
              // Async hook - don't wait but log if it fails
              result.catch(error => {
                console.warn('[AgentFlow] Session initialized hook failed:', error);
              });
            }
            sessionInitialized = true;
          } catch (error) {
            console.warn('[AgentFlow] Session initialized hook failed:', error);
          }
        }
      }

      recordEvent(id, 'agent_start', { type: opts.type, name: opts.name });
      return id;
    },

    endNode(nodeId: string, status: NodeStatus = 'completed'): void {
      assertNotBuilt();
      const node = getNode(nodeId);

      if (node.endTime !== null) {
        throw new Error(
          `GraphBuilder: node "${nodeId}" has already ended (status: ${node.status})`,
        );
      }

      node.endTime = Date.now();
      node.status = status;
      recordEvent(nodeId, 'agent_end', { status });
    },

    failNode(nodeId: string, error: Error | string): void {
      assertNotBuilt();
      const node = getNode(nodeId);

      if (node.endTime !== null) {
        throw new Error(
          `GraphBuilder: node "${nodeId}" has already ended (status: ${node.status})`,
        );
      }

      const errorMessage = error instanceof Error ? error.message : error;
      const errorStack = error instanceof Error ? error.stack : undefined;

      node.endTime = Date.now();
      node.status = 'failed';
      node.metadata.error = errorMessage;
      if (errorStack) {
        node.metadata.errorStack = errorStack;
      }

      recordEvent(nodeId, 'tool_error', { error: errorMessage });
    },

    addEdge(from: string, to: string, type: EdgeType): void {
      assertNotBuilt();
      getNode(from);
      getNode(to);

      edges.push({ from, to, type });
      recordEvent(from, 'custom', { to, type, action: 'edge_add' });
    },

    pushEvent(event: Omit<TraceEvent, 'timestamp'>): void {
      assertNotBuilt();
      getNode(event.nodeId); // validate node exists
      events.push({
        ...event,
        timestamp: Date.now(),
      });
    },

    updateState(nodeId: string, state: Record<string, unknown>): void {
      assertNotBuilt();
      const node = getNode(nodeId);
      Object.assign(node.state, state);
      recordEvent(nodeId, 'custom', { action: 'state_update', ...state });
    },

    withParent<T>(parentId: string, fn: () => T): T {
      assertNotBuilt();
      getNode(parentId); // validate parent exists
      parentStack.push(parentId);
      try {
        return fn();
      } finally {
        parentStack.pop();
      }
    },

    getSnapshot(): ExecutionGraph {
      return buildGraph();
    },

    build(): ExecutionGraph {
      assertNotBuilt();
      const graph = buildGraph();
      built = true;

      // Execute session end hook
      if (sessionHooks?.onSessionEnd) {
        try {
          const hookContext = {
            operatorId: operatorContext?.operatorId,
            teamId: operatorContext?.teamId,
            sessionId: operatorContext?.sessionId,
            graphId,
            status: graph.status as 'completed' | 'failed' | 'timeout',
            duration: Date.now() - startTime,
          };

          const result = sessionHooks.onSessionEnd(hookContext);
          if (result && typeof result.then === 'function') {
            // Async hook - don't wait but log if it fails
            result.catch(error => {
              console.warn('[AgentFlow] Session end hook failed:', error);
            });
          }
        } catch (error) {
          console.warn('[AgentFlow] Session end hook failed:', error);
        }
      }

      return graph;
    },
  };

  return builder;
}
