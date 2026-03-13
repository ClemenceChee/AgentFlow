/**
 * Pure query functions for interrogating a built `ExecutionGraph`.
 * Every function takes a frozen graph and returns derived data without mutation.
 * @module
 */

import type { ExecutionGraph, ExecutionNode, GraphStats, NodeStatus, NodeType } from './types.js';

/**
 * Find a node by its ID.
 *
 * @param graph - The execution graph to search.
 * @param nodeId - The node ID to look up.
 * @returns The node, or `undefined` if not found.
 *
 * @example
 * ```ts
 * const node = getNode(graph, 'node_002');
 * if (node) console.log(node.name);
 * ```
 */
export function getNode(graph: ExecutionGraph, nodeId: string): ExecutionNode | undefined {
  return graph.nodes.get(nodeId);
}

/**
 * Get the direct children of a node.
 *
 * @param graph - The execution graph to search.
 * @param nodeId - The parent node ID.
 * @returns Array of child nodes (may be empty).
 *
 * @example
 * ```ts
 * const children = getChildren(graph, rootId);
 * ```
 */
export function getChildren(graph: ExecutionGraph, nodeId: string): ExecutionNode[] {
  const node = graph.nodes.get(nodeId);
  if (!node) return [];

  const result: ExecutionNode[] = [];
  for (const childId of node.children) {
    const child = graph.nodes.get(childId);
    if (child) result.push(child);
  }
  return result;
}

/**
 * Get the parent of a node.
 *
 * @param graph - The execution graph to search.
 * @param nodeId - The child node ID.
 * @returns The parent node, or `undefined` if root or not found.
 *
 * @example
 * ```ts
 * const parent = getParent(graph, toolId);
 * ```
 */
export function getParent(graph: ExecutionGraph, nodeId: string): ExecutionNode | undefined {
  const node = graph.nodes.get(nodeId);
  if (!node || node.parentId === null) return undefined;
  return graph.nodes.get(node.parentId);
}

/**
 * Find all nodes with a failure-category status: `failed`, `hung`, or `timeout`.
 *
 * @param graph - The execution graph to search.
 * @returns Array of nodes with failure statuses (may be empty).
 */
export function getFailures(graph: ExecutionGraph): ExecutionNode[] {
  const failureStatuses: ReadonlySet<string> = new Set(['failed', 'hung', 'timeout']);
  return [...graph.nodes.values()].filter((node) => failureStatuses.has(node.status));
}

/**
 * Find all nodes that are still running (status `'running'`, no endTime).
 *
 * @param graph - The execution graph to search.
 * @returns Array of running/hung nodes.
 */
export function getHungNodes(graph: ExecutionGraph): ExecutionNode[] {
  return [...graph.nodes.values()].filter(
    (node) => node.status === 'running' && node.endTime === null,
  );
}

/**
 * Find the critical path: the longest-duration path from the root to any leaf node.
 * Uses node duration (endTime - startTime) as the weight.
 * Running nodes use `Date.now()` as a provisional endTime.
 *
 * @param graph - The execution graph to analyse.
 * @returns Nodes ordered from root to the deepest leaf on the longest path.
 */
export function getCriticalPath(graph: ExecutionGraph): ExecutionNode[] {
  const root = graph.nodes.get(graph.rootNodeId);
  if (!root) return [];

  function nodeDuration(node: ExecutionNode): number {
    const end = node.endTime ?? Date.now();
    return end - node.startTime;
  }

  function dfs(node: ExecutionNode): { duration: number; path: ExecutionNode[] } {
    if (node.children.length === 0) {
      return { duration: nodeDuration(node), path: [node] };
    }

    let bestChild: { duration: number; path: ExecutionNode[] } = { duration: -1, path: [] };

    for (const childId of node.children) {
      const child = graph.nodes.get(childId);
      if (!child) continue;
      const result = dfs(child);
      if (result.duration > bestChild.duration) {
        bestChild = result;
      }
    }

    return {
      duration: nodeDuration(node) + bestChild.duration,
      path: [node, ...bestChild.path],
    };
  }

  return dfs(root).path;
}

/**
 * Find what a node is waiting on.
 * Returns nodes connected via `waited_on` edges where the given nodeId is the `from` side.
 *
 * @param graph - The execution graph to search.
 * @param nodeId - The node that is doing the waiting.
 * @returns Array of nodes that are being waited on.
 */
export function findWaitingOn(graph: ExecutionGraph, nodeId: string): ExecutionNode[] {
  const results: ExecutionNode[] = [];
  for (const edge of graph.edges) {
    if (edge.from === nodeId && edge.type === 'waited_on') {
      const node = graph.nodes.get(edge.to);
      if (node) results.push(node);
    }
  }
  return results;
}

/**
 * Get all descendants of a node (children, grandchildren, etc.) in breadth-first order.
 * The given node itself is NOT included.
 *
 * @param graph - The execution graph to search.
 * @param nodeId - The ancestor node ID.
 * @returns All descendant nodes in BFS order.
 */
export function getSubtree(graph: ExecutionGraph, nodeId: string): ExecutionNode[] {
  const startNode = graph.nodes.get(nodeId);
  if (!startNode) return [];

  const result: ExecutionNode[] = [];
  const queue: string[] = [...startNode.children];

  while (queue.length > 0) {
    const currentId = queue.shift();
    if (currentId === undefined) break;
    const current = graph.nodes.get(currentId);
    if (!current) continue;
    result.push(current);
    queue.push(...current.children);
  }

  return result;
}

/**
 * Total wall-clock duration of the graph in milliseconds.
 * If the graph is still running, uses `Date.now()` as the provisional end.
 *
 * @param graph - The execution graph.
 * @returns Duration in milliseconds.
 */
export function getDuration(graph: ExecutionGraph): number {
  const end = graph.endTime ?? Date.now();
  return end - graph.startTime;
}

/**
 * Maximum nesting depth of the graph. The root node is depth 0.
 *
 * @param graph - The execution graph.
 * @returns The maximum depth (0 for a single-node graph, -1 for empty).
 */
export function getDepth(graph: ExecutionGraph): number {
  const root = graph.nodes.get(graph.rootNodeId);
  if (!root) return -1;

  function dfs(node: ExecutionNode, depth: number): number {
    if (node.children.length === 0) return depth;

    let maxDepth = depth;
    for (const childId of node.children) {
      const child = graph.nodes.get(childId);
      if (!child) continue;
      const childDepth = dfs(child, depth + 1);
      if (childDepth > maxDepth) maxDepth = childDepth;
    }
    return maxDepth;
  }

  return dfs(root, 0);
}

/**
 * Compute aggregate statistics for the execution graph.
 *
 * @param graph - The execution graph to analyse.
 * @returns Statistics including node counts by type and status, depth, duration, and failure counts.
 *
 * @example
 * ```ts
 * const stats = getStats(graph);
 * console.log(`${stats.totalNodes} nodes, ${stats.failureCount} failures`);
 * ```
 */
export function getStats(graph: ExecutionGraph): GraphStats {
  const byStatus: Record<NodeStatus, number> = {
    running: 0,
    completed: 0,
    failed: 0,
    hung: 0,
    timeout: 0,
  };
  const byType: Record<NodeType, number> = {
    agent: 0,
    tool: 0,
    subagent: 0,
    wait: 0,
    decision: 0,
    custom: 0,
  };

  let failureCount = 0;
  let hungCount = 0;

  for (const node of graph.nodes.values()) {
    byStatus[node.status]++;
    byType[node.type]++;
    if (node.status === 'failed' || node.status === 'timeout' || node.status === 'hung') {
      failureCount++;
    }
    if (node.status === 'running' && node.endTime === null) {
      hungCount++;
    }
  }

  return {
    totalNodes: graph.nodes.size,
    byStatus,
    byType,
    depth: getDepth(graph),
    duration: getDuration(graph),
    failureCount,
    hungCount,
  };
}
