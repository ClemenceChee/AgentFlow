/**
 * LangChain trace adapter.
 *
 * Converts a LangChain Run tree into SOMA's GraphLike format,
 * enabling SOMA ingestion from LangChain-based agent systems.
 *
 * @module
 */

import type { GraphLike } from '../decision-extractor.js';
import type { TraceAdapter } from './types.js';

// ---------------------------------------------------------------------------
// LangChain Run type (minimal shape matching LangSmith's Run)
// ---------------------------------------------------------------------------

export interface LangChainRun {
  id: string;
  name: string;
  run_type: 'chain' | 'tool' | 'llm' | 'retriever' | 'prompt' | 'parser';
  start_time: number;
  end_time?: number | null;
  status: 'success' | 'error' | 'pending';
  child_runs?: LangChainRun[];
  inputs?: Record<string, unknown>;
  outputs?: Record<string, unknown>;
  error?: string;
}

// ---------------------------------------------------------------------------
// Type guard
// ---------------------------------------------------------------------------

/**
 * Type guard for LangChainRun — validates minimum required fields.
 */
export function isLangChainRun(obj: unknown): obj is LangChainRun {
  if (typeof obj !== 'object' || obj === null) return false;
  const o = obj as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.name === 'string' &&
    typeof o.run_type === 'string' &&
    typeof o.start_time === 'number' &&
    typeof o.status === 'string'
  );
}

// ---------------------------------------------------------------------------
// Status mapping
// ---------------------------------------------------------------------------

function mapStatus(status: string): string {
  if (status === 'success') return 'completed';
  if (status === 'error') return 'failed';
  if (status === 'pending') return 'running';
  return 'completed';
}

// ---------------------------------------------------------------------------
// Run type → GraphNode type mapping
// ---------------------------------------------------------------------------

function mapRunType(runType: string): string {
  switch (runType) {
    case 'chain': return 'agent';
    case 'tool': return 'tool';
    case 'llm': return 'tool';
    case 'retriever': return 'tool';
    case 'prompt': return 'tool';
    case 'parser': return 'tool';
    default: return 'custom';
  }
}

// ---------------------------------------------------------------------------
// Transform
// ---------------------------------------------------------------------------

interface BuildResult {
  nodes: Record<string, {
    id: string;
    type: string;
    name: string;
    startTime: number;
    endTime: number | null;
    status: string;
    parentId: string | null;
    children: string[];
    metadata: Record<string, unknown>;
  }>;
  edges: { from: string; to: string; type: string }[];
}

function buildGraph(run: LangChainRun, parentId: string | null, result: BuildResult): void {
  const nodeId = run.id;

  const metadata: Record<string, unknown> = {};
  if (run.error) metadata.error = run.error;
  if (run.inputs) metadata.inputs = run.inputs;
  if (run.outputs) metadata.outputs = run.outputs;

  const childIds: string[] = [];

  result.nodes[nodeId] = {
    id: nodeId,
    type: mapRunType(run.run_type),
    name: run.name,
    startTime: run.start_time,
    endTime: run.end_time ?? null,
    status: mapStatus(run.status),
    parentId,
    children: childIds,
    metadata,
  };

  if (parentId) {
    result.edges.push({ from: parentId, to: nodeId, type: 'called' });
    // Add to parent's children
    const parent = result.nodes[parentId];
    if (parent) parent.children.push(nodeId);
  }

  if (run.child_runs) {
    for (const child of run.child_runs) {
      childIds.push(child.id);
      buildGraph(child, nodeId, result);
    }
  }
}

/**
 * Convert a LangChain Run tree into a GraphLike object.
 */
export function langchainRunToGraphLike(run: LangChainRun): GraphLike {
  const result: BuildResult = { nodes: {}, edges: [] };
  buildGraph(run, null, result);

  return {
    id: run.id,
    agentId: run.name,
    nodes: result.nodes,
    edges: result.edges,
    status: mapStatus(run.status),
    rootNodeId: run.id,
  };
}

// ---------------------------------------------------------------------------
// Adapter class
// ---------------------------------------------------------------------------

/**
 * LangChain trace adapter implementing TraceAdapter<LangChainRun>.
 */
export const langchainAdapter: TraceAdapter<LangChainRun> = {
  canAdapt: isLangChainRun,
  adapt: langchainRunToGraphLike,
};
