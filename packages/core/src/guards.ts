/**
 * Runtime guards for detecting problematic agent behaviors during graph construction.
 *
 * Guards operate on ExecutionGraph snapshots and detect three types of violations:
 * - Long-running spans: nodes that exceed timeout thresholds for their type
 * - Reasoning loops: consecutive nodes of the same type in a parent-child chain
 * - Spawn explosion: excessive depth or agent/subagent spawn counts
 *
 * @module
 */

import { getChildren, getDepth, getNode } from './graph-query.js';
import type { ExecutionGraph, ExecutionNode, GraphBuilder, NodeType } from './types.js';

/**
 * Configuration for runtime guard detection.
 */
export interface GuardConfig {
  /** Timeout thresholds per node type in milliseconds. */
  readonly timeouts?: Partial<Record<NodeType, number>>;
  /** Maximum consecutive same-type nodes before flagging reasoning loop (default: 25). */
  readonly maxReasoningSteps?: number;
  /** Maximum graph depth before flagging spawn explosion (default: 10). */
  readonly maxDepth?: number;
  /** Maximum total agent/subagent nodes before flagging spawn explosion (default: 50). */
  readonly maxAgentSpawns?: number;
  /** Action to take when guard violations are detected. */
  readonly onViolation?: 'warn' | 'error' | 'abort';
  /** Custom logger for warnings (defaults to console.warn). */
  readonly logger?: (message: string) => void;
}

/**
 * A detected guard violation.
 */
export interface GuardViolation {
  readonly type: 'timeout' | 'reasoning-loop' | 'spawn-explosion';
  readonly nodeId: string;
  readonly message: string;
  readonly timestamp: number;
}

/** Default timeout values in milliseconds per node type. */
const DEFAULT_TIMEOUTS: Record<NodeType, number> = {
  tool: 30_000, // 30s
  agent: 300_000, // 5m
  subagent: 300_000, // 5m
  wait: 600_000, // 10m
  decision: 30_000, // 30s
  custom: 30_000, // 30s
};

/**
 * Check an execution graph for guard violations.
 *
 * This is a pure function that analyzes a graph snapshot and returns detected violations
 * without modifying the graph or producing side effects.
 *
 * @param graph - The execution graph to analyze.
 * @param config - Optional guard configuration.
 * @returns Array of detected violations (may be empty).
 *
 * @example
 * ```ts
 * const violations = checkGuards(graph, { maxDepth: 5 });
 * if (violations.length > 0) {
 *   console.log(`Found ${violations.length} violations`);
 * }
 * ```
 */
export function checkGuards(
  graph: ExecutionGraph,
  config?: GuardConfig,
): readonly GuardViolation[] {
  const violations: GuardViolation[] = [];
  const now = Date.now();

  const timeouts = { ...DEFAULT_TIMEOUTS, ...config?.timeouts };
  const maxReasoningSteps = config?.maxReasoningSteps ?? 25;
  const maxDepth = config?.maxDepth ?? 10;
  const maxAgentSpawns = config?.maxAgentSpawns ?? 50;

  // Check for timeout violations
  for (const node of graph.nodes.values()) {
    if (node.status === 'running' && node.endTime === null) {
      const timeoutThreshold = timeouts[node.type];
      const elapsed = now - node.startTime;

      if (elapsed > timeoutThreshold) {
        violations.push({
          type: 'timeout',
          nodeId: node.id,
          message: `Node ${node.id} (${node.type}: ${node.name}) has been running for ${elapsed}ms, exceeding timeout of ${timeoutThreshold}ms`,
          timestamp: now,
        });
      }
    }
  }

  // Check for depth violations
  const depth = getDepth(graph);
  if (depth > maxDepth) {
    violations.push({
      type: 'spawn-explosion',
      nodeId: graph.rootNodeId,
      message: `Graph depth ${depth} exceeds maximum depth of ${maxDepth}`,
      timestamp: now,
    });
  }

  // Check for agent spawn violations
  let agentCount = 0;
  for (const node of graph.nodes.values()) {
    if (node.type === 'agent' || node.type === 'subagent') {
      agentCount++;
    }
  }
  if (agentCount > maxAgentSpawns) {
    violations.push({
      type: 'spawn-explosion',
      nodeId: graph.rootNodeId,
      message: `Total agent/subagent count ${agentCount} exceeds maximum of ${maxAgentSpawns}`,
      timestamp: now,
    });
  }

  // Check for reasoning loops
  violations.push(...detectReasoningLoops(graph, maxReasoningSteps, now));

  return violations;
}

/**
 * Detect reasoning loops: consecutive same-type nodes along any root-to-leaf path.
 *
 * Walks the tree depth-first, tracking a running count of consecutive same-type nodes.
 * If the count exceeds `maxSteps`, a violation is emitted.
 */
function detectReasoningLoops(
  graph: ExecutionGraph,
  maxSteps: number,
  timestamp: number,
): GuardViolation[] {
  const violations: GuardViolation[] = [];
  const reported = new Set<string>();

  function walk(nodeId: string, consecutiveCount: number, consecutiveType: NodeType | null): void {
    const node = getNode(graph, nodeId);
    if (!node) return;

    let newCount: number;
    let newType: NodeType;

    if (node.type === consecutiveType) {
      newCount = consecutiveCount + 1;
      newType = node.type;
    } else {
      newCount = 1;
      newType = node.type;
    }

    if (newCount > maxSteps && !reported.has(newType)) {
      reported.add(newType);
      violations.push({
        type: 'reasoning-loop',
        nodeId: node.id,
        message: `Detected ${newCount} consecutive ${newType} nodes along path to ${node.name}`,
        timestamp,
      });
    }

    const children = getChildren(graph, nodeId);
    for (const child of children) {
      walk(child.id, newCount, newType);
    }
  }

  walk(graph.rootNodeId, 0, null);
  return violations;
}

/**
 * Create a guard-aware wrapper around a GraphBuilder.
 *
 * The returned builder has an identical interface to the original but intercepts
 * `endNode` and `build` calls to check for guard violations. Violations are handled
 * according to the `onViolation` configuration.
 *
 * @param builder - The original GraphBuilder to wrap.
 * @param config - Guard configuration.
 * @returns A GraphBuilder with identical interface but guard protection.
 *
 * @example
 * ```ts
 * const raw = createGraphBuilder({ agentId: 'test' });
 * const guarded = withGuards(raw, { maxDepth: 5, onViolation: 'abort' });
 *
 * // Use exactly like a normal builder
 * const root = guarded.startNode({ type: 'agent', name: 'main' });
 * guarded.endNode(root); // Will check for violations
 * ```
 */
export function withGuards(builder: GraphBuilder, config?: GuardConfig): GraphBuilder {
  const logger = config?.logger ?? ((msg: string) => console.warn(`[AgentFlow Guard] ${msg}`));
  const onViolation = config?.onViolation ?? 'warn';

  function handleViolations(violations: readonly GuardViolation[]): void {
    if (violations.length === 0) return;

    for (const violation of violations) {
      const message = `Guard violation: ${violation.message}`;

      switch (onViolation) {
        case 'warn':
          logger(message);
          break;
        case 'error':
          logger(message);
          builder.pushEvent({
            eventType: 'custom',
            nodeId: violation.nodeId,
            data: {
              guardViolation: violation.type,
              message: violation.message,
              severity: 'error',
            },
          });
          break;
        case 'abort':
          throw new Error(`AgentFlow guard violation: ${violation.message}`);
        default:
          logger(message);
      }
    }
  }

  return {
    get graphId() {
      return builder.graphId;
    },
    get traceContext() {
      return builder.traceContext;
    },

    startNode: (opts) => builder.startNode(opts),

    endNode: (nodeId, status) => {
      builder.endNode(nodeId, status);
      const snapshot = builder.getSnapshot();
      const violations = checkGuards(snapshot, config);
      handleViolations(violations);
    },

    failNode: (nodeId, error) => {
      builder.failNode(nodeId, error);
      const snapshot = builder.getSnapshot();
      const violations = checkGuards(snapshot, config);
      handleViolations(violations);
    },

    addEdge: (from, to, type) => builder.addEdge(from, to, type),
    pushEvent: (event) => builder.pushEvent(event),
    updateState: (nodeId, state) => builder.updateState(nodeId, state),
    withParent: (parentId, fn) => builder.withParent(parentId, fn),
    getSnapshot: () => builder.getSnapshot(),

    build: () => {
      const snapshot = builder.getSnapshot();
      const violations = checkGuards(snapshot, config);
      handleViolations(violations);
      return builder.build();
    },
  };
}
