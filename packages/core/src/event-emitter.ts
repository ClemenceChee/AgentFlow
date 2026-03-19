/**
 * Event emission layer for AgentFlow execution intelligence.
 *
 * Transforms completed execution graphs and process mining results into
 * structured, self-describing events consumable by external systems
 * (Soma, dashboards, sentinel agents, custom knowledge engines).
 *
 * @module
 */

import { getPathSignature } from './process-mining.js';
import type {
  Bottleneck,
  EventEmitter,
  EventEmitterConfig,
  EventWriter,
  ExecutionEvent,
  ExecutionEventOptions,
  ExecutionGraph,
  FailurePoint,
  PatternEvent,
  ProcessModel,
  Variant,
} from './types.js';

/** Current schema version for event serialization. */
const SCHEMA_VERSION = 1;

/**
 * Create a structured ExecutionEvent from a completed execution graph.
 *
 * Pure function — no side effects. The returned event is self-describing:
 * it contains all context needed to understand the execution without
 * reading the original graph.
 *
 * @param graph - The completed execution graph.
 * @param options - Optional process mining context, semantic context, and violations.
 * @returns A structured ExecutionEvent.
 *
 * @example
 * ```ts
 * const event = createExecutionEvent(graph, {
 *   processContext: { variant: 'A→B→C', conformanceScore: 0.9, isAnomaly: false },
 *   semantic: { intent: 'daily-rebalance', trigger: 'cron' },
 * });
 * ```
 */
export function createExecutionEvent(
  graph: ExecutionGraph,
  options?: ExecutionEventOptions,
): ExecutionEvent {
  const duration =
    graph.endTime !== null ? graph.endTime - graph.startTime : Date.now() - graph.startTime;

  // Find failure point if graph failed — prefer leaf/tool nodes over the root agent
  let failurePoint: FailurePoint | undefined;
  if (graph.status === 'failed') {
    let candidate: FailurePoint | undefined;
    for (const node of graph.nodes.values()) {
      if (node.status === 'failed' || node.status === 'timeout') {
        const errorMeta = node.metadata.error;
        const fp: FailurePoint = {
          nodeId: node.id,
          nodeName: node.name,
          nodeType: node.type,
          error: typeof errorMeta === 'string' ? errorMeta : undefined,
        };
        // Prefer non-root nodes (the actual failure source)
        if (node.id !== graph.rootNodeId) {
          failurePoint = fp;
          break;
        }
        // Fall back to root if it's the only failed node
        if (!candidate) candidate = fp;
      }
    }
    if (!failurePoint) failurePoint = candidate;
  }

  return {
    eventType: graph.status === 'failed' ? 'execution.failed' : 'execution.completed',
    graphId: graph.id,
    agentId: graph.agentId,
    timestamp: Date.now(),
    schemaVersion: SCHEMA_VERSION,
    status: graph.status,
    duration,
    nodeCount: graph.nodes.size,
    pathSignature: getPathSignature(graph),
    ...(failurePoint ? { failurePoint } : {}),
    ...(options?.processContext ? { processContext: options.processContext } : {}),
    ...(options?.semantic ? { semantic: options.semantic } : {}),
    violations: options?.violations ?? [],
  };
}

/**
 * Create a structured PatternEvent from process mining results.
 *
 * Pure function — no side effects. Summarizes the mining results into
 * a compact event with top variants (up to 5) and top bottlenecks (up to 5).
 *
 * @param agentId - The agent these patterns belong to.
 * @param model - The discovered process model.
 * @param variants - Variant analysis results.
 * @param bottlenecks - Bottleneck detection results.
 * @returns A structured PatternEvent.
 *
 * @example
 * ```ts
 * const model = discoverProcess(graphs);
 * const variants = findVariants(graphs);
 * const bottlenecks = getBottlenecks(graphs);
 * const event = createPatternEvent('my-agent', model, variants, bottlenecks);
 * ```
 */
export function createPatternEvent(
  agentId: string,
  model: ProcessModel,
  variants: Variant[],
  bottlenecks: Bottleneck[],
): PatternEvent {
  return {
    eventType: 'pattern.discovered',
    agentId,
    timestamp: Date.now(),
    schemaVersion: SCHEMA_VERSION,
    pattern: {
      totalGraphs: model.totalGraphs,
      variantCount: variants.length,
      topVariants: variants.slice(0, 5).map((v) => ({
        pathSignature: v.pathSignature,
        count: v.count,
        percentage: v.percentage,
      })),
      topBottlenecks: bottlenecks.slice(0, 5).map((b) => ({
        nodeName: b.nodeName,
        nodeType: b.nodeType,
        p95: b.durations.p95,
      })),
      processModel: model,
    },
  };
}

/**
 * Create an event emitter for routing AgentFlow events to writers and subscribers.
 *
 * The emitter is a simple pub/sub — no queuing, no retry, no backpressure.
 * Writer errors are reported via the `onError` callback and do not block emission.
 *
 * @param config - Optional configuration with writers and error handler.
 * @returns An EventEmitter with emit and subscribe methods.
 *
 * @example
 * ```ts
 * const emitter = createEventEmitter({
 *   writers: [jsonWriter],
 *   onError: (err) => console.error('Event write failed:', err),
 * });
 *
 * emitter.subscribe((event) => console.log('Event:', event.eventType));
 *
 * await emitter.emit(createExecutionEvent(graph));
 * ```
 */
export function createEventEmitter(config?: EventEmitterConfig): EventEmitter {
  const writers: readonly EventWriter[] = config?.writers ?? [];
  const knowledgeStore = config?.knowledgeStore;
  const onError = config?.onError ?? (() => {});
  const subscribers = new Set<(event: ExecutionEvent | PatternEvent) => void>();

  return {
    async emit(event: ExecutionEvent | PatternEvent): Promise<void> {
      // Persist to knowledge store
      if (knowledgeStore) {
        try {
          knowledgeStore.append(event);
        } catch (err) {
          onError(err);
        }
      }

      // Send to writers
      for (const writer of writers) {
        try {
          await writer.writeEvent(event);
        } catch (err) {
          onError(err);
        }
      }

      // Send to subscribers
      for (const listener of subscribers) {
        try {
          listener(event);
        } catch (err) {
          onError(err);
        }
      }
    },

    subscribe(listener: (event: ExecutionEvent | PatternEvent) => void): () => void {
      subscribers.add(listener);
      return () => {
        subscribers.delete(listener);
      };
    },
  };
}
