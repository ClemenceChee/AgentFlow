/**
 * Trace visualization: ASCII tree and timeline rendering for ExecutionGraphs.
 *
 * All functions are pure — they take an ExecutionGraph and return formatted strings.
 *
 * @module
 */

import { getChildren } from './graph-query.js';
import type { ExecutionGraph, ExecutionNode, NodeStatus } from './types.js';

/** Status icon mapping. */
const STATUS_ICONS: Record<NodeStatus, string> = {
  completed: '\u2713',
  failed: '\u2717',
  running: '\u231B',
  hung: '\u231B',
  timeout: '\u231B',
};

/**
 * Format a duration in milliseconds to a human-readable string.
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3_600_000) return `${(ms / 60_000).toFixed(1)}m`;
  return `${(ms / 3_600_000).toFixed(1)}h`;
}

/**
 * Get the duration string for a node.
 */
function nodeDuration(node: ExecutionNode, graphEndTime: number): string {
  const end = node.endTime ?? graphEndTime;
  return formatDuration(end - node.startTime);
}

/**
 * Extract notable gen_ai.* attributes from node metadata.
 */
function getGenAiInfo(node: ExecutionNode): string {
  const parts: string[] = [];
  const meta = node.metadata;

  if (meta['gen_ai.request.model']) {
    parts.push(String(meta['gen_ai.request.model']));
  }
  const tokens =
    (meta['gen_ai.usage.prompt_tokens'] as number | undefined) ??
    (meta['gen_ai.usage.completion_tokens'] as number | undefined);
  if (tokens !== undefined) {
    const prompt = (meta['gen_ai.usage.prompt_tokens'] as number | undefined) ?? 0;
    const completion = (meta['gen_ai.usage.completion_tokens'] as number | undefined) ?? 0;
    if (prompt || completion) {
      parts.push(`${prompt + completion} tok`);
    }
  }
  return parts.length > 0 ? ` [${parts.join(', ')}]` : '';
}

/**
 * Check if a node has guard violation events.
 */
function hasViolation(node: ExecutionNode, graph: ExecutionGraph): boolean {
  return graph.events.some(
    (e) =>
      e.nodeId === node.id &&
      e.eventType === 'custom' &&
      (e.data as Record<string, unknown>).guardViolation !== undefined,
  );
}

/**
 * Render an ExecutionGraph as an ASCII tree showing parent-child hierarchy.
 *
 * @param graph - The execution graph to render.
 * @returns A multi-line string showing the tree with status icons, durations, and metadata.
 *
 * @example
 * ```ts
 * console.log(toAsciiTree(graph));
 * // ✓ main (agent) 4.2s
 * // ├─ ✓ search (tool) 1.1s
 * // └─ ✗ analyze (tool) 0.5s — Error: rate limit
 * ```
 */
export function toAsciiTree(graph: ExecutionGraph): string {
  if (graph.nodes.size === 0) return '(empty graph)';

  const now = Date.now();
  const endTime = graph.endTime ?? now;
  const lines: string[] = [];

  function renderNode(nodeId: string, prefix: string, isLast: boolean, isRoot: boolean): void {
    const node = graph.nodes.get(nodeId);
    if (!node) return;

    const icon = STATUS_ICONS[node.status];
    const duration = nodeDuration(node, endTime);
    const genAi = getGenAiInfo(node);
    const violation = hasViolation(node, graph) ? ' \u26A0' : '';
    const errorInfo =
      node.status === 'failed' && node.metadata.error ? ` \u2014 ${node.metadata.error}` : '';
    const timeoutInfo = node.status === 'timeout' ? ' [TIMEOUT]' : '';
    const hungInfo = node.status === 'hung' ? ' [HUNG]' : '';

    const connector = isRoot ? '' : isLast ? '\u2514\u2500 ' : '\u251C\u2500 ';
    const line = `${prefix}${connector}${icon} ${node.name} (${node.type}) ${duration}${genAi}${violation}${timeoutInfo}${hungInfo}${errorInfo}`;
    lines.push(line);

    const children = getChildren(graph, nodeId);
    const childPrefix = isRoot ? '' : prefix + (isLast ? '   ' : '\u2502  ');
    for (let i = 0; i < children.length; i++) {
      const childId = children[i]?.id;
      if (childId) renderNode(childId, childPrefix, i === children.length - 1, false);
    }
  }

  renderNode(graph.rootNodeId, '', true, true);
  return lines.join('\n');
}

/**
 * Render an ExecutionGraph as a horizontal timeline/waterfall.
 *
 * @param graph - The execution graph to render.
 * @returns A multi-line string showing spans as horizontal bars relative to graph start.
 *
 * @example
 * ```ts
 * console.log(toTimeline(graph));
 * // 0s        1s        2s        3s
 * // ├─────────┼─────────┼─────────┤
 * // ████████████████████████████████ main (4.2s)
 * //  ██████████                      search (1.1s)
 * ```
 */
export function toTimeline(graph: ExecutionGraph): string {
  if (graph.nodes.size === 0) return '(empty graph)';

  const now = Date.now();
  const graphStart = graph.startTime;
  const graphEnd = graph.endTime ?? now;
  const totalDuration = graphEnd - graphStart;

  if (totalDuration <= 0) return '(zero duration)';

  const barWidth = 60;
  const lines: string[] = [];

  // Header: time scale
  const scaleLabels: string[] = [];
  const tickCount = Math.min(5, Math.max(2, Math.floor(barWidth / 10)));
  for (let i = 0; i <= tickCount; i++) {
    const t = (totalDuration * i) / tickCount;
    scaleLabels.push(formatDuration(t));
  }

  // Build header line
  let header = '';
  for (let i = 0; i < scaleLabels.length; i++) {
    const pos = Math.round((barWidth * i) / tickCount);
    while (header.length < pos) header += ' ';
    header += scaleLabels[i];
  }
  lines.push(header);

  // Tick line
  let tickLine = '';
  for (let i = 0; i < barWidth; i++) {
    const tickPos = tickCount > 0 ? (i * tickCount) / barWidth : 0;
    if (
      Number.isInteger(Math.round(tickPos * 100) / 100) &&
      Math.abs(tickPos - Math.round(tickPos)) < 0.01
    ) {
      tickLine += '\u253C';
    } else {
      tickLine += '\u2500';
    }
  }
  lines.push(tickLine);

  // Collect all nodes in DFS order for consistent rendering
  const orderedNodes: ExecutionNode[] = [];
  function collectNodes(nodeId: string): void {
    const node = graph.nodes.get(nodeId);
    if (!node) return;
    orderedNodes.push(node);
    const children = getChildren(graph, nodeId);
    for (const child of children) {
      collectNodes(child.id);
    }
  }
  collectNodes(graph.rootNodeId);

  // Render each node as a bar
  for (const node of orderedNodes) {
    const nodeStart = node.startTime - graphStart;
    const nodeEnd = (node.endTime ?? now) - graphStart;

    const startCol = Math.round((nodeStart / totalDuration) * barWidth);
    const endCol = Math.max(startCol + 1, Math.round((nodeEnd / totalDuration) * barWidth));

    let bar = '';
    for (let i = 0; i < barWidth; i++) {
      if (i >= startCol && i < endCol) {
        bar += '\u2588';
      } else {
        bar += ' ';
      }
    }

    const icon = STATUS_ICONS[node.status];
    const duration = nodeDuration(node, graphEnd);
    const violation = hasViolation(node, graph) ? ' \u26A0' : '';
    lines.push(`${bar} ${icon} ${node.name} (${duration})${violation}`);
  }

  return lines.join('\n');
}
