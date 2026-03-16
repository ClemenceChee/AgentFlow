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
// Distributed tracing
export { getTraceTree, groupByTraceId, stitchTrace } from './graph-stitch.js';
export type { GuardConfig, GuardViolation } from './guards.js';
// Runtime guards
export { checkGuards, withGuards } from './guards.js';
// Live monitor
export { startLive } from './live.js';
// Serialization / deserialization
export { graphToJson, loadGraph } from './loader.js';
export type { RunConfig, RunResult } from './runner.js';
// CLI runner
export { runTraced } from './runner.js';
export type { TraceStore } from './trace-store.js';
// Trace storage
export { createTraceStore } from './trace-store.js';
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
// Trace visualization
export { toAsciiTree, toTimeline } from './visualize.js';
// Watch (headless alerts)
export { startWatch } from './watch.js';
export type { AlertCondition, AlertPayload, NotifyChannel, WatchConfig } from './watch-types.js';
