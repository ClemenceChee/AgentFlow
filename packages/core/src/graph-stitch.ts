import type { ExecutionGraph, DistributedTrace, GraphStatus } from './types.js';

export function groupByTraceId(graphs: ExecutionGraph[]): Map<string, ExecutionGraph[]> {
  const groups = new Map<string, ExecutionGraph[]>();
  for (const g of graphs) {
    if (!g.traceId) continue;
    const arr = groups.get(g.traceId) ?? [];
    arr.push(g);
    groups.set(g.traceId, arr);
  }
  return groups;
}

export function stitchTrace(graphs: ExecutionGraph[]): DistributedTrace {
  if (graphs.length === 0) throw new Error('No graphs to stitch');

  const traceId = graphs[0]!.traceId ?? '';
  const graphsBySpan = new Map<string, ExecutionGraph>();
  const childMap = new Map<string, string[]>();
  let rootGraph: ExecutionGraph | null = null;

  for (const g of graphs) {
    if (g.spanId) graphsBySpan.set(g.spanId, g);
    if (!g.parentSpanId) {
      if (!rootGraph || g.startTime < rootGraph.startTime) rootGraph = g;
    }
    if (g.parentSpanId) {
      const siblings = childMap.get(g.parentSpanId) ?? [];
      if (g.spanId) siblings.push(g.spanId);
      childMap.set(g.parentSpanId, siblings);
    }
  }

  if (!rootGraph) rootGraph = graphs[0]!; // fallback

  // Aggregate status
  let status: GraphStatus = 'completed';
  let endTime: number | null = 0;
  let startTime = Infinity;

  for (const g of graphs) {
    startTime = Math.min(startTime, g.startTime);
    if (g.status === 'failed') status = 'failed';
    else if (g.status === 'running' && status !== 'failed') status = 'running';
    if (g.endTime === null) endTime = null;
    else if (endTime !== null) endTime = Math.max(endTime, g.endTime);
  }

  // Freeze childMap values
  const frozenChildMap = new Map<string, readonly string[]>();
  for (const [k, v] of childMap) frozenChildMap.set(k, Object.freeze([...v]));

  return Object.freeze({
    traceId,
    graphs: graphsBySpan,
    rootGraph,
    childMap: frozenChildMap,
    startTime,
    endTime,
    status,
  });
}

export function getTraceTree(trace: DistributedTrace): ExecutionGraph[] {
  const result: ExecutionGraph[] = [];

  function walk(spanId: string) {
    const graph = trace.graphs.get(spanId);
    if (graph) result.push(graph);
    const children = trace.childMap.get(spanId) ?? [];
    for (const childSpan of children) walk(childSpan);
  }

  if (trace.rootGraph.spanId) walk(trace.rootGraph.spanId);
  else result.push(trace.rootGraph);

  return result;
}
