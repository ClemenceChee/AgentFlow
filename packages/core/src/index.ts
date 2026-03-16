/**
 * AgentFlow — Universal execution tracing for AI agent systems.
 *
 * @example
 * ```ts
 * import { createGraphBuilder, getStats } from 'agentflow-core';
 *
 * const builder = createGraphBuilder({ agentId: 'my-agent' });
 * const rootId = builder.startNode({ type: 'agent', name: 'main' });
 * builder.endNode(rootId);
 * const graph = builder.build();
 * console.log(getStats(graph));
 * ```
 * @module
 */

// Graph construction
export { createGraphBuilder } from './graph-builder.js';
// CLI runner
export { runTraced } from './runner.js';
export type { RunConfig, RunResult } from './runner.js';
// Distributed tracing
export { stitchTrace, groupByTraceId, getTraceTree } from './graph-stitch.js';
// Graph querying
export {
  findWaitingOn,
  getChildren,
  getCriticalPath,
  getDepth,
  getDuration,
  getFailures,
  getHungNodes,
  getNode,
  getParent,
  getStats,
  getSubtree,
} from './graph-query.js';
// Types
export type {
  Adapter,
  AgentFlowConfig,
  DistributedTrace,
  EdgeType,
  ExecutionEdge,
  ExecutionGraph,
  ExecutionNode,
  GraphBuilder,
  GraphStats,
  GraphStatus,
  MutableExecutionNode,
  NodeStatus,
  NodeType,
  StartNodeOptions,
  TraceEvent,
  TraceEventType,
  Writer,
} from './types.js';
