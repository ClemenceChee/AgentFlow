/**
 * Process mining primitives for cross-run analysis of execution graphs.
 *
 * All functions are pure: they take frozen graphs and return derived data
 * without mutation or side effects. Designed to operate on `ExecutionGraph[]`
 * collections to discover patterns across multiple agent runs.
 *
 * @module
 */

import type {
  Bottleneck,
  ConformanceReport,
  Deviation,
  DeviationType,
  ExecutionGraph,
  ExecutionNode,
  ProcessModel,
  ProcessTransition,
  Variant,
} from './types.js';

// ---------------------------------------------------------------------------
// Path signature
// ---------------------------------------------------------------------------

/**
 * Produce a canonical string representation of a graph's execution path.
 *
 * Performs a depth-first traversal, emitting `type:name` for each node.
 * Children are sorted alphabetically by `type:name` to ensure deterministic output.
 *
 * @param graph - The execution graph.
 * @returns A `→`-separated path signature, or `""` if the root is unresolvable.
 *
 * @example
 * ```ts
 * const sig = getPathSignature(graph);
 * // "agent:main→tool:fetch→tool:analyze"
 * ```
 */
export function getPathSignature(graph: ExecutionGraph): string {
  const root = graph.nodes.get(graph.rootNodeId);
  if (!root) return '';

  const parts: string[] = [];

  function walk(node: ExecutionNode): void {
    parts.push(`${node.type}:${node.name}`);

    const childNodes: ExecutionNode[] = [];
    for (const childId of node.children) {
      const child = graph.nodes.get(childId);
      if (child) childNodes.push(child);
    }

    childNodes.sort((a, b) => {
      const keyA = `${a.type}:${a.name}`;
      const keyB = `${b.type}:${b.name}`;
      return keyA.localeCompare(keyB);
    });

    for (const child of childNodes) {
      walk(child);
    }
  }

  walk(root);
  return parts.join('→');
}

// ---------------------------------------------------------------------------
// Process model discovery
// ---------------------------------------------------------------------------

/**
 * Step key for a node: `type:name`.
 */
function stepKey(node: ExecutionNode): string {
  return `${node.type}:${node.name}`;
}

/**
 * Discover a process model from multiple execution graphs.
 *
 * Walks every graph's node tree and counts parent→child transitions.
 * The returned model is a directly-follows graph (DFG) annotated with
 * absolute and relative frequencies.
 *
 * @param graphs - Array of execution graphs (must not be empty).
 * @returns A process model with steps, transitions, and frequencies.
 * @throws If `graphs` is empty.
 *
 * @example
 * ```ts
 * const model = discoverProcess(graphs);
 * for (const t of model.transitions) {
 *   console.log(`${t.from} → ${t.to} (${(t.probability * 100).toFixed(0)}%)`);
 * }
 * ```
 */
export function discoverProcess(graphs: ExecutionGraph[]): ProcessModel {
  if (graphs.length === 0) {
    throw new Error('discoverProcess requires at least one graph');
  }

  const steps = new Set<string>();
  // Key: "from\0to", value: count
  const transitionCounts = new Map<string, number>();
  // Key: step, value: total outgoing transitions
  const outgoingCounts = new Map<string, number>();

  for (const graph of graphs) {
    for (const node of graph.nodes.values()) {
      const parentKey = stepKey(node);
      steps.add(parentKey);

      for (const childId of node.children) {
        const child = graph.nodes.get(childId);
        if (!child) continue;

        const childKey = stepKey(child);
        const tKey = `${parentKey}\0${childKey}`;

        transitionCounts.set(tKey, (transitionCounts.get(tKey) ?? 0) + 1);
        outgoingCounts.set(parentKey, (outgoingCounts.get(parentKey) ?? 0) + 1);
      }
    }
  }

  const transitions: ProcessTransition[] = [];
  for (const [tKey, count] of transitionCounts) {
    const [from, to] = tKey.split('\0') as [string, string];
    const outgoing = outgoingCounts.get(from) ?? count;
    transitions.push({
      from,
      to,
      count,
      probability: count / outgoing,
    });
  }

  // Sort transitions for deterministic output
  transitions.sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));

  return {
    steps: [...steps].sort(),
    transitions,
    totalGraphs: graphs.length,
    agentId: graphs[0]?.agentId ?? '',
  };
}

// ---------------------------------------------------------------------------
// Variant analysis
// ---------------------------------------------------------------------------

/**
 * Group execution graphs by their structural path and return variant clusters.
 *
 * Variants are sorted by frequency (most common first). Ties are broken
 * alphabetically by path signature.
 *
 * @param graphs - Array of execution graphs.
 * @returns Variant clusters sorted by frequency descending.
 *
 * @example
 * ```ts
 * const variants = findVariants(graphs);
 * console.log(`${variants[0].percentage}% of runs follow the happy path`);
 * ```
 */
export function findVariants(graphs: ExecutionGraph[]): Variant[] {
  if (graphs.length === 0) return [];

  const groups = new Map<string, ExecutionGraph[]>();

  for (const graph of graphs) {
    const sig = getPathSignature(graph);
    const group = groups.get(sig) ?? [];
    group.push(graph);
    groups.set(sig, group);
  }

  const total = graphs.length;
  const variants: Variant[] = [];

  for (const [pathSignature, groupGraphs] of groups) {
    variants.push({
      pathSignature,
      count: groupGraphs.length,
      percentage: (groupGraphs.length / total) * 100,
      graphIds: groupGraphs.map((g) => g.id),
      exampleGraph: groupGraphs[0] as ExecutionGraph,
    });
  }

  variants.sort((a, b) => {
    const freqDiff = b.count - a.count;
    if (freqDiff !== 0) return freqDiff;
    return a.pathSignature.localeCompare(b.pathSignature);
  });

  return variants;
}

// ---------------------------------------------------------------------------
// Bottleneck detection
// ---------------------------------------------------------------------------

/**
 * Compute a percentile value from a sorted array.
 */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0] ?? 0;
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower] ?? 0;
  const weight = index - lower;
  return (sorted[lower] ?? 0) * (1 - weight) + (sorted[upper] ?? 0) * weight;
}

/**
 * Identify performance bottlenecks by aggregating node durations across graphs.
 *
 * Collects duration samples per node `name` (grouped by `type:name`),
 * computes percentile statistics, and returns results sorted by p95 descending.
 *
 * @param graphs - Array of execution graphs.
 * @returns Bottleneck entries sorted by p95 duration descending.
 *
 * @example
 * ```ts
 * const bottlenecks = getBottlenecks(graphs);
 * console.log(`Slowest: ${bottlenecks[0].nodeName} (p95: ${bottlenecks[0].durations.p95}ms)`);
 * ```
 */
export function getBottlenecks(graphs: ExecutionGraph[]): Bottleneck[] {
  if (graphs.length === 0) return [];

  const now = Date.now();
  // Key: "type:name", value: { durations, nodeType, nodeName }
  const stats = new Map<string, { durations: number[]; nodeType: string; nodeName: string }>();

  for (const graph of graphs) {
    for (const node of graph.nodes.values()) {
      const key = `${node.type}:${node.name}`;
      const entry = stats.get(key) ?? { durations: [], nodeType: node.type, nodeName: node.name };
      const end = node.endTime ?? now;
      entry.durations.push(end - node.startTime);
      stats.set(key, entry);
    }
  }

  const total = graphs.length;
  const bottlenecks: Bottleneck[] = [];

  for (const [, entry] of stats) {
    const sorted = [...entry.durations].sort((a, b) => a - b);

    bottlenecks.push({
      nodeName: entry.nodeName,
      nodeType: entry.nodeType as Bottleneck['nodeType'],
      occurrences: sorted.length,
      durations: {
        median: percentile(sorted, 50),
        p95: percentile(sorted, 95),
        p99: percentile(sorted, 99),
        min: sorted[0] ?? 0,
        max: sorted[sorted.length - 1] ?? 0,
      },
      percentOfGraphs: (sorted.length / total) * 100,
    });
  }

  bottlenecks.sort((a, b) => b.durations.p95 - a.durations.p95);

  return bottlenecks;
}

// ---------------------------------------------------------------------------
// Conformance checking
// ---------------------------------------------------------------------------

/**
 * Extract the set of transitions from a single graph as `"from\0to"` keys.
 */
function extractGraphTransitions(graph: ExecutionGraph): Set<string> {
  const transitions = new Set<string>();

  for (const node of graph.nodes.values()) {
    const parentKey = stepKey(node);
    for (const childId of node.children) {
      const child = graph.nodes.get(childId);
      if (!child) continue;
      transitions.add(`${parentKey}\0${stepKey(child)}`);
    }
  }

  return transitions;
}

/**
 * Compare a single execution graph against a discovered process model.
 *
 * Classifies deviations into three categories:
 * - `unexpected-transition`: exists in the graph but not in the model
 * - `missing-transition`: exists in the model with probability > 0.5 but not in the graph
 * - `low-frequency-path`: exists in both but model probability < 0.1
 *
 * @param graph - The execution graph to check.
 * @param model - The process model to check against.
 * @returns A conformance report with score, deviations, and conformance flag.
 *
 * @example
 * ```ts
 * const report = checkConformance(newRun, model);
 * if (!report.isConforming) {
 *   console.log(`Conformance: ${(report.conformanceScore * 100).toFixed(0)}%`);
 *   for (const d of report.deviations) console.log(d.message);
 * }
 * ```
 */
export function checkConformance(graph: ExecutionGraph, model: ProcessModel): ConformanceReport {
  const graphTransitions = extractGraphTransitions(graph);
  const deviations: Deviation[] = [];

  // Build model lookup: "from\0to" → ProcessTransition
  const modelLookup = new Map<string, ProcessTransition>();
  for (const t of model.transitions) {
    modelLookup.set(`${t.from}\0${t.to}`, t);
  }

  let totalChecks = 0;
  let deviationCount = 0;

  // Check graph transitions against model
  for (const tKey of graphTransitions) {
    totalChecks++;
    const [from, to] = tKey.split('\0') as [string, string];
    const modelTransition = modelLookup.get(tKey);

    if (!modelTransition) {
      deviationCount++;
      deviations.push({
        type: 'unexpected-transition' as DeviationType,
        from,
        to,
        message: `Unexpected transition ${from} → ${to} (not in process model)`,
      });
    } else if (modelTransition.probability < 0.1) {
      deviationCount++;
      deviations.push({
        type: 'low-frequency-path' as DeviationType,
        from,
        to,
        message: `Low-frequency path ${from} → ${to} (model probability: ${(modelTransition.probability * 100).toFixed(1)}%)`,
        modelProbability: modelTransition.probability,
      });
    }
  }

  // Build a set of step keys present in this graph
  const graphSteps = new Set<string>();
  for (const node of graph.nodes.values()) {
    graphSteps.add(stepKey(node));
  }

  // Check for missing common transitions
  for (const t of model.transitions) {
    if (t.probability > 0.5) {
      const tKey = `${t.from}\0${t.to}`;
      // Only flag as missing if the source step exists in the graph's nodes
      if (graphSteps.has(t.from) && !graphTransitions.has(tKey)) {
        totalChecks++;
        deviationCount++;
        deviations.push({
          type: 'missing-transition' as DeviationType,
          from: t.from,
          to: t.to,
          message: `Missing expected transition ${t.from} → ${t.to} (model probability: ${(t.probability * 100).toFixed(1)}%)`,
          modelProbability: t.probability,
        });
      }
    }
  }

  const conformanceScore = totalChecks === 0 ? 1.0 : (totalChecks - deviationCount) / totalChecks;

  return {
    conformanceScore,
    isConforming: deviations.length === 0,
    deviations,
  };
}
