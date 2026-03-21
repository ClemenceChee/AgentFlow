/**
 * Load and deserialize execution graphs from JSON.
 *
 * Handles all serialization formats produced by the runner, graph-builder,
 * and third-party tools:
 *   - `nodes` as a plain object `{ "node_001": { ... } }`  (runner.ts output)
 *   - `nodes` as an array of `[id, node]` pairs              (Map JSON serialization)
 *   - `nodes` already a Map                                   (in-memory passthrough)
 *
 * @module
 */

import type { ExecutionGraph, ExecutionNode } from './types.js';

/**
 * Convert a raw JSON-parsed value into a `ReadonlyMap<string, ExecutionNode>`.
 *
 * @internal
 */
function toNodesMap(raw: unknown): ReadonlyMap<string, ExecutionNode> {
  // Already a Map (in-memory graph passed directly)
  if (raw instanceof Map) return raw;

  // Array of [id, node] pairs (JSON.stringify(Map) format)
  if (Array.isArray(raw)) {
    return new Map(raw as [string, ExecutionNode][]);
  }

  // Plain object keyed by node ID (graphToJson / runner output)
  if (raw !== null && typeof raw === 'object') {
    return new Map(Object.entries(raw as Record<string, ExecutionNode>));
  }

  // Fallback: empty map
  return new Map();
}

/**
 * Deserialize a JSON object (or JSON string) into a valid `ExecutionGraph`.
 *
 * Use this whenever you read a trace file from disk or receive one over the
 * network.  It normalizes `nodes` into a proper `Map` regardless of the
 * serialization format.
 *
 * @param input - A parsed JSON object, or a JSON string to be parsed.
 * @returns A valid `ExecutionGraph` ready for use with query functions.
 * @throws {Error} If the input cannot be parsed or is missing required fields.
 *
 * @example
 * ```ts
 * import { readFileSync } from 'fs';
 * import { loadGraph, getStats } from 'agentflow-core';
 *
 * const graph = loadGraph(readFileSync('trace.json', 'utf8'));
 * console.log(getStats(graph));
 * ```
 */
export function loadGraph(input: string | Record<string, unknown>): ExecutionGraph {
  const raw: Record<string, unknown> =
    typeof input === 'string' ? (JSON.parse(input) as Record<string, unknown>) : input;

  const nodes = toNodesMap(raw.nodes);

  return {
    id: (raw.id as string) ?? '',
    rootNodeId: (raw.rootNodeId ?? raw.rootId ?? '') as string,
    nodes,
    edges: (raw.edges as ExecutionGraph['edges']) ?? [],
    startTime: (raw.startTime as number) ?? 0,
    endTime: (raw.endTime as number | null) ?? null,
    status: (raw.status as ExecutionGraph['status']) ?? 'completed',
    trigger: (raw.trigger as string) ?? 'unknown',
    agentId: (raw.agentId as string) ?? 'unknown',
    events: (raw.events as ExecutionGraph['events']) ?? [],
    traceId: raw.traceId as string | undefined,
    spanId: raw.spanId as string | undefined,
    parentSpanId: raw.parentSpanId as string | null | undefined,
    metadata: (raw.metadata as Record<string, unknown>) ?? {},
  };
}

/**
 * Serialize an `ExecutionGraph` to a plain JSON-safe object.
 *
 * The inverse of `loadGraph`.  `nodes` is written as a plain object keyed by
 * node ID, which is the most readable format for trace files on disk.
 *
 * @param graph - The execution graph to serialize.
 * @returns A plain object safe to pass to `JSON.stringify`.
 *
 * @example
 * ```ts
 * import { writeFileSync } from 'fs';
 * import { graphToJson } from 'agentflow-core';
 *
 * writeFileSync('trace.json', JSON.stringify(graphToJson(graph), null, 2));
 * ```
 */
export function graphToJson(graph: ExecutionGraph): Record<string, unknown> {
  const nodesObj: Record<string, unknown> = {};
  for (const [id, node] of graph.nodes) {
    nodesObj[id] = node;
  }
  return {
    id: graph.id,
    rootNodeId: graph.rootNodeId,
    nodes: nodesObj,
    edges: graph.edges,
    startTime: graph.startTime,
    endTime: graph.endTime,
    status: graph.status,
    trigger: graph.trigger,
    agentId: graph.agentId,
    events: graph.events,
    traceId: graph.traceId,
    spanId: graph.spanId,
    parentSpanId: graph.parentSpanId,
  };
}
