/**
 * JSON file-based trace storage for ExecutionGraphs.
 *
 * One JSON file per graph, using existing graphToJson/loadGraph for serialization.
 * Compatible with `agentflow watch` auto-detection.
 *
 * @module
 */

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { graphToJson, loadGraph } from './loader.js';
import type { ExecutionGraph, ExecutionNode, GraphStatus, NodeType } from './types.js';

/**
 * Trace storage interface for saving, loading, and querying execution graphs.
 */
export interface TraceStore {
  /** Save a graph to disk. Returns the file path. */
  save(graph: ExecutionGraph): Promise<string>;
  /** Load a graph by ID. Returns null if not found. */
  get(graphId: string): Promise<ExecutionGraph | null>;
  /** List all stored graphs, optionally filtered by status. */
  list(opts?: { status?: GraphStatus; limit?: number }): Promise<ExecutionGraph[]>;
  /** Find all nodes with stuck status (running/hung/timeout) across all stored traces. */
  getStuckSpans(): Promise<ExecutionNode[]>;
  /** Find reasoning loops: consecutive same-type node sequences exceeding threshold. */
  getReasoningLoops(
    threshold?: number,
  ): Promise<ReadonlyArray<{ graphId: string; nodes: ExecutionNode[] }>>;
}

/**
 * Create a JSON file-based trace store.
 *
 * @param dir - Directory to store trace JSON files.
 * @returns A TraceStore instance.
 *
 * @example
 * ```ts
 * const store = createTraceStore('./traces');
 * await store.save(graph);
 * const loaded = await store.get(graph.id);
 * ```
 */
export function createTraceStore(dir: string): TraceStore {
  async function ensureDir(): Promise<void> {
    await mkdir(dir, { recursive: true });
  }

  async function loadAll(): Promise<ExecutionGraph[]> {
    await ensureDir();
    let files: string[];
    try {
      files = await readdir(dir);
    } catch {
      return [];
    }

    const graphs: ExecutionGraph[] = [];
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const content = await readFile(join(dir, file), 'utf-8');
        const graph = loadGraph(content);
        graphs.push(graph);
      } catch {
        // Skip malformed files
      }
    }
    return graphs;
  }

  return {
    async save(graph: ExecutionGraph): Promise<string> {
      await ensureDir();
      const json = graphToJson(graph);
      const filePath = join(dir, `${graph.id}.json`);
      const resolvedBase = resolve(dir);
      const resolvedPath = resolve(filePath);
      if (!resolvedPath.startsWith(`${resolvedBase}/`) && resolvedPath !== resolvedBase) {
        throw new Error(`Path traversal detected: "${graph.id}" escapes base directory`);
      }
      await writeFile(filePath, JSON.stringify(json, null, 2), 'utf-8');
      return filePath;
    },

    async get(graphId: string): Promise<ExecutionGraph | null> {
      await ensureDir();
      // Try exact filename first
      const filePath = join(dir, `${graphId}.json`);
      try {
        const content = await readFile(filePath, 'utf-8');
        return loadGraph(content);
      } catch {
        // Fall back to scanning all files for matching graph ID
      }
      // Search by graph ID or filename prefix across all files
      const all = await loadAll();
      return all.find((g) => g.id === graphId) ?? null;
    },

    async list(opts?: { status?: GraphStatus; limit?: number }): Promise<ExecutionGraph[]> {
      let graphs = await loadAll();

      if (opts?.status) {
        graphs = graphs.filter((g) => g.status === opts.status);
      }

      // Sort by startTime descending (newest first)
      graphs.sort((a, b) => b.startTime - a.startTime);

      if (opts?.limit && opts.limit > 0) {
        graphs = graphs.slice(0, opts.limit);
      }

      return graphs;
    },

    async getStuckSpans(): Promise<ExecutionNode[]> {
      const graphs = await loadAll();
      const stuck: ExecutionNode[] = [];

      for (const graph of graphs) {
        for (const node of graph.nodes.values()) {
          if (node.status === 'running' || node.status === 'hung' || node.status === 'timeout') {
            stuck.push(node);
          }
        }
      }

      return stuck;
    },

    async getReasoningLoops(
      threshold = 25,
    ): Promise<ReadonlyArray<{ graphId: string; nodes: ExecutionNode[] }>> {
      const graphs = await loadAll();
      const results: Array<{ graphId: string; nodes: ExecutionNode[] }> = [];

      for (const graph of graphs) {
        const loops = findLoopsInGraph(graph, threshold);
        if (loops.length > 0) {
          results.push({ graphId: graph.id, nodes: loops });
        }
      }

      return results;
    },
  };
}

/**
 * Find consecutive same-type node sequences in a graph that exceed a threshold.
 */
function findLoopsInGraph(graph: ExecutionGraph, threshold: number): ExecutionNode[] {
  const loopNodes: ExecutionNode[] = [];

  function walk(nodeId: string, consecutiveCount: number, consecutiveType: NodeType | null): void {
    const node = graph.nodes.get(nodeId);
    if (!node) return;

    const newCount = node.type === consecutiveType ? consecutiveCount + 1 : 1;

    if (newCount > threshold) {
      loopNodes.push(node);
    }

    for (const childId of node.children) {
      walk(childId, newCount, node.type);
    }
  }

  walk(graph.rootNodeId, 0, null);
  return loopNodes;
}
