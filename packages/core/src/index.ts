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

// Event emission
export { createEventEmitter, createExecutionEvent, createPatternEvent } from './event-emitter.js';
// Graph construction
export { createGraphBuilder } from './graph-builder.js';
// Insight engine (Tier 2)
export { createInsightEngine } from './insight-engine.js';
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
export type { JsonEventWriterConfig } from './json-event-writer.js';
// JSON event writer
export { createJsonEventWriter } from './json-event-writer.js';
// Knowledge store
export { createKnowledgeStore } from './knowledge-store.js';
// Policy source
export { createPolicySource } from './policy-source.js';
export type { SomaEventWriterConfig } from './soma-event-writer.js';
// Soma event writer
export { createSomaEventWriter } from './soma-event-writer.js';
// Live monitor
export { startLive } from './live.js';
// Serialization / deserialization
export { graphToJson, loadGraph } from './loader.js';
export type {
  OsProcess,
  PidFileResult,
  ProcessAuditConfig,
  ProcessAuditResult,
  SystemdUnitResult,
  WorkerEntry,
  WorkersResult,
} from './process-audit.js';
// Process audit
export { auditProcesses, discoverAllProcessConfigs, discoverProcessConfig, formatAuditReport } from './process-audit.js';
// Prompt builders (Tier 2)
export {
  buildFailureAnalysisPrompt,
  buildAnomalyExplanationPrompt,
  buildAgentSummaryPrompt,
  buildFixSuggestionPrompt,
} from './prompt-builder.js';
// Process mining
export {
  checkConformance,
  discoverProcess,
  findVariants,
  getBottlenecks,
  getPathSignature,
} from './process-mining.js';
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
  AgentFlowEventType,
  AgentProfile,
  Bottleneck,
  ConformanceReport,
  Deviation,
  DeviationType,
  DistributedTrace,
  EdgeType,
  EventEmitter,
  EventEmitterConfig,
  EventWriter,
  ExecutionEdge,
  ExecutionEvent,
  ExecutionEventOptions,
  ExecutionGraph,
  ExecutionNode,
  FailurePoint,
  GraphBuilder,
  InsightEngine,
  InsightEngineConfig,
  InsightEvent,
  InsightResult,
  GraphStats,
  GraphStatus,
  KnowledgeStore,
  KnowledgeStoreConfig,
  MutableExecutionNode,
  NodeStatus,
  NodeType,
  PatternEvent,
  PolicySource,
  PolicyThresholds,
  ProcessContext,
  ProcessModel,
  ProcessTransition,
  SemanticContext,
  StartNodeOptions,
  DecisionTraceData,
  TraceEvent,
  TraceEventType,
  Variant,
  Writer,
  AnalysisFn,
} from './types.js';
// Trace visualization
export { toAsciiTree, toTimeline } from './visualize.js';
// Watch (headless alerts)
export { startWatch } from './watch.js';
export type { AlertCondition, AlertPayload, NotifyChannel, WatchConfig } from './watch-types.js';
