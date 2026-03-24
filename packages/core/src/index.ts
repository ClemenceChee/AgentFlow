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
// Insight engine (Tier 2)
export { createInsightEngine } from './insight-engine.js';
export type { JsonEventWriterConfig } from './json-event-writer.js';
// JSON event writer
export { createJsonEventWriter } from './json-event-writer.js';
// Knowledge store
export { createKnowledgeStore } from './knowledge-store.js';
// Live monitor
export { startLive } from './live.js';
// Serialization / deserialization
export { graphToJson, loadGraph } from './loader.js';
// Policy source
export { createPolicySource } from './policy-source.js';
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
export {
  auditProcesses,
  discoverAllProcessConfigs,
  discoverProcessConfig,
  formatAuditReport,
} from './process-audit.js';
// Process mining
export {
  checkConformance,
  discoverProcess,
  findVariants,
  getBottlenecks,
  getPathSignature,
} from './process-mining.js';
// Prompt builders (Tier 2)
export {
  buildAgentSummaryPrompt,
  buildAnomalyExplanationPrompt,
  buildFailureAnalysisPrompt,
  buildFixSuggestionPrompt,
} from './prompt-builder.js';
// Run receipts
export { formatReceipt, toReceipt } from './receipts.js';
export type { RunConfig, RunResult } from './runner.js';
// CLI runner
export { runTraced } from './runner.js';
export type { SomaEventWriterConfig } from './soma-event-writer.js';
// Soma event writer
export { createSomaEventWriter } from './soma-event-writer.js';
export type { TraceStore } from './trace-store.js';
// Trace storage
export { createTraceStore } from './trace-store.js';
// Types
export type {
  Adapter,
  AgentFlowConfig,
  AgentFlowEventType,
  AgentProfile,
  AnalysisFn,
  Bottleneck,
  ConformanceHistory,
  ConformanceHistoryEntry,
  ConformanceReport,
  DecisionTraceData,
  Deviation,
  DeviationType,
  DistributedTrace,
  DriftOptions,
  DriftReport,
  EdgeType,
  EfficiencyFlag,
  EfficiencyReport,
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
  GraphStats,
  GraphStatus,
  GuardExplanation,
  InsightEngine,
  InsightEngineConfig,
  InsightEvent,
  InsightResult,
  KnowledgeStore,
  KnowledgeStoreConfig,
  MutableExecutionNode,
  NodeCost,
  NodeStatus,
  NodeType,
  NormalizedDecision,
  OutcomeAssertion,
  PatternEvent,
  PolicySource,
  PolicyThresholds,
  ProcessContext,
  ProcessModel,
  ProcessTransition,
  RunEfficiency,
  RunReceipt,
  SemanticContext,
  StartNodeOptions,
  StepSummary,
  TraceEvent,
  TraceEventType,
  Variant,
  VariantOptions,
  Writer,
} from './types.js';
// Trace visualization
export { toAsciiTree, toTimeline } from './visualize.js';
// Watch (headless alerts)
export { startWatch } from './watch.js';
export type { AlertCondition, AlertPayload, NotifyChannel, WatchConfig } from './watch-types.js';
