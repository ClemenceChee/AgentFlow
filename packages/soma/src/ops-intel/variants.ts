/**
 * Model-aware variant analysis — extends AgentFlow's findVariants with modelId dimension.
 *
 * @module
 */

import { getPathSignature } from 'agentflow-core';
import type { ExecutionGraph, SemanticContext, Variant, VariantOptions } from './types.js';

/**
 * Get a variant signature that includes model IDs from node metadata.
 */
function getModelAwareSignature(graph: ExecutionGraph, dimensions: readonly string[]): string {
  const parts: string[] = [];

  if (dimensions.includes('path')) {
    parts.push(getPathSignature(graph));
  }

  if (dimensions.includes('modelId')) {
    const models = new Set<string>();
    for (const node of graph.nodes.values()) {
      const semantic = (node.metadata as Record<string, unknown>)?.semantic as
        | SemanticContext
        | undefined;
      const modelId =
        semantic?.modelId ??
        ((node.state as Record<string, unknown>)?.modelId as string | undefined);
      models.add(modelId ?? 'unattributed');
    }
    parts.push(`model:${[...models].sort().join('+')}`);
  }

  if (dimensions.includes('status')) {
    parts.push(`status:${graph.status}`);
  }

  return parts.join('|');
}

/**
 * Model-aware variant analysis.
 *
 * Extends AgentFlow's findVariants with optional dimensions including modelId.
 * Default dimensions=['path'] matches AgentFlow behavior exactly.
 */
export function findVariantsWithModel(
  graphs: ExecutionGraph[],
  options?: VariantOptions,
): Variant[] {
  if (graphs.length === 0) return [];

  const dimensions = options?.dimensions ?? ['path'];
  const groups = new Map<string, ExecutionGraph[]>();

  for (const graph of graphs) {
    const sig = getModelAwareSignature(graph, dimensions);
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
      exampleGraph: groupGraphs[0]!,
    });
  }

  variants.sort((a, b) => {
    const freqDiff = b.count - a.count;
    if (freqDiff !== 0) return freqDiff;
    return a.pathSignature.localeCompare(b.pathSignature);
  });

  return variants;
}
