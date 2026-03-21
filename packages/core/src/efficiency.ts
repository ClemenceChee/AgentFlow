/**
 * Efficiency scoring module for cross-run token cost analysis.
 *
 * Computes per-run and aggregate efficiency metrics from execution graphs,
 * detecting wasteful retry patterns and building per-node cost attribution.
 * All functions are pure — no mutation or side effects.
 *
 * @module
 */

import type {
  EfficiencyFlag,
  EfficiencyReport,
  ExecutionGraph,
  ExecutionNode,
  NodeCost,
  RunEfficiency,
  SemanticContext,
} from './types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract tokenCost from a node, checking metadata.semantic?.tokenCost
 * first, then state.tokenCost. Returns null when neither is present.
 */
function extractTokenCost(node: ExecutionNode): number | null {
  const semantic = node.metadata.semantic as SemanticContext | undefined;
  if (semantic?.tokenCost != null && typeof semantic.tokenCost === 'number') {
    return semantic.tokenCost;
  }
  if (node.state.tokenCost != null && typeof node.state.tokenCost === 'number') {
    return node.state.tokenCost as number;
  }
  return null;
}

/** Compute the median of a sorted (ascending) numeric array. */
function median(sorted: readonly number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Compute the p-th percentile of a sorted (ascending) numeric array. */
function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute an efficiency report across one or more execution graphs.
 *
 * Extracts token costs from node metadata/state, computes per-run and
 * aggregate statistics, detects wasteful retry patterns, and reports
 * data coverage.
 *
 * @param graphs - The execution graphs to analyse.
 * @returns An {@link EfficiencyReport} with runs, aggregate stats, flags,
 *          per-node costs, and data coverage.
 *
 * @example
 * ```ts
 * const report = getEfficiency([graph1, graph2]);
 * console.log(report.aggregate.median); // median cost-per-node
 * console.log(report.dataCoverage);     // 0.0–1.0
 * ```
 */
export function getEfficiency(graphs: ExecutionGraph[]): EfficiencyReport {
  const allNodeCosts: NodeCost[] = [];
  const runs: RunEfficiency[] = [];
  let totalNodesWithCost = 0;
  let totalNodes = 0;

  // Per-graph: accumulate node costs and build run efficiency entries.
  for (const graph of graphs) {
    let graphTokenCost = 0;
    let completedNodes = 0;

    for (const node of graph.nodes.values()) {
      totalNodes++;
      const cost = extractTokenCost(node);
      if (cost !== null) totalNodesWithCost++;

      const duration =
        node.startTime && node.endTime != null ? node.endTime - node.startTime : null;

      allNodeCosts.push({
        nodeId: node.id,
        name: node.name,
        type: node.type,
        tokenCost: cost,
        durationMs: duration,
      });

      if (node.status === 'completed') {
        completedNodes++;
      }

      if (cost !== null) {
        graphTokenCost += cost;
      }
    }

    const costPerNode = completedNodes > 0 ? graphTokenCost / completedNodes : 0;

    runs.push({
      graphId: graph.id,
      agentId: graph.agentId,
      totalTokenCost: graphTokenCost,
      completedNodes,
      costPerNode,
    });
  }

  // Aggregate statistics across runs.
  const costPerNodeValues = runs
    .map((r) => r.costPerNode)
    .filter((v) => v > 0)
    .sort((a, b) => a - b);

  const mean =
    costPerNodeValues.length > 0
      ? costPerNodeValues.reduce((a, b) => a + b, 0) / costPerNodeValues.length
      : 0;

  const aggregate = {
    mean,
    median: median(costPerNodeValues),
    p95: percentile(costPerNodeValues, 95),
  };

  // Detect wasteful retry patterns.
  const flags: EfficiencyFlag[] = [];
  const medianCostPerNode = aggregate.median;

  for (let gi = 0; gi < graphs.length; gi++) {
    const graph = graphs[gi];
    const run = runs[gi];

    // Build name frequency map for this graph.
    const nameCounts = new Map<string, number>();
    const nameCost = new Map<string, number>();

    for (const node of graph.nodes.values()) {
      nameCounts.set(node.name, (nameCounts.get(node.name) ?? 0) + 1);
      const cost = extractTokenCost(node);
      if (cost !== null) {
        nameCost.set(node.name, (nameCost.get(node.name) ?? 0) + cost);
      }
    }

    // A run is flagged when its cost-per-node is > 3x the median AND
    // there are nodes with the same name appearing multiple times (retries).
    if (medianCostPerNode > 0 && run.costPerNode > 3 * medianCostPerNode) {
      for (const [name, count] of nameCounts) {
        if (count > 1) {
          flags.push({
            pattern: 'wasteful_retry',
            nodeName: name,
            retryCount: count,
            tokenCost: nameCost.get(name) ?? 0,
            message: `Node "${name}" appears ${count} times with cost-per-node ${run.costPerNode.toFixed(1)} (>3x median ${medianCostPerNode.toFixed(1)})`,
          });
        }
      }
    }
  }

  const dataCoverage = totalNodes > 0 ? totalNodesWithCost / totalNodes : 0;

  return {
    runs,
    aggregate,
    flags,
    nodeCosts: allNodeCosts,
    dataCoverage,
  };
}
