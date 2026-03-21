/**
 * Pure functions for building and formatting run receipts from execution graphs.
 *
 * A receipt is a structured summary of a completed (or running) agent execution,
 * including per-step details, cost attribution, and aggregate counts.
 * @module
 */

import type {
  ExecutionGraph,
  ExecutionNode,
  RunReceipt,
  SemanticContext,
  StepSummary,
} from './types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract tokenCost from a node, checking metadata.semantic and state.
 * Returns `null` when no cost data is available.
 */
function extractTokenCost(node: ExecutionNode): number | null {
  // Check metadata.semantic first (adapter-provided SemanticContext)
  const semantic = node.metadata?.semantic as SemanticContext | undefined;
  if (semantic?.tokenCost !== undefined && semantic.tokenCost !== null) {
    return semantic.tokenCost;
  }

  // Fall back to node.state.tokenCost
  if (node.state?.tokenCost !== undefined && node.state.tokenCost !== null) {
    return node.state.tokenCost as number;
  }

  return null;
}

/**
 * Extract an error string from a node, if present.
 */
function extractError(node: ExecutionNode): string | null {
  if (node.state?.error !== undefined && node.state.error !== null) {
    return String(node.state.error);
  }
  if (node.metadata?.error !== undefined && node.metadata.error !== null) {
    return String(node.metadata.error);
  }
  return null;
}

/**
 * Compute duration in milliseconds for a node. Returns `null` if the node is
 * still running (no endTime).
 */
function nodeDuration(node: ExecutionNode): number | null {
  if (node.endTime === null) return null;
  return node.endTime - node.startTime;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Walk an execution graph and produce a structured {@link RunReceipt}.
 *
 * Steps are sorted by `startTime`. Summary counts classify each node as
 * succeeded (`completed`), failed (`failed | hung | timeout`), or skipped
 * (none currently — reserved for future use). `attempted` equals the total
 * node count.
 *
 * @param graph - A built (or snapshot) execution graph.
 * @returns A frozen run receipt.
 */
export function toReceipt(graph: ExecutionGraph): RunReceipt {
  const nodes = [...graph.nodes.values()];

  // Sort by startTime ascending
  nodes.sort((a, b) => a.startTime - b.startTime);

  const steps: StepSummary[] = nodes.map((node) => ({
    nodeId: node.id,
    name: node.name,
    type: node.type,
    status: node.status,
    durationMs: nodeDuration(node),
    tokenCost: extractTokenCost(node),
    error: extractError(node),
  }));

  // Aggregate counts
  let succeeded = 0;
  let failed = 0;
  const skipped = 0; // reserved for future 'skipped' status

  for (const node of nodes) {
    if (node.status === 'completed') {
      succeeded++;
    } else if (node.status === 'failed' || node.status === 'hung' || node.status === 'timeout') {
      failed++;
    }
    // 'running' nodes are neither succeeded nor failed — they count toward attempted only
  }

  const attempted = nodes.length;

  // Total token cost: sum of all non-null step costs, or null if none available
  let totalTokenCost: number | null = null;
  for (const step of steps) {
    if (step.tokenCost !== null) {
      totalTokenCost = (totalTokenCost ?? 0) + step.tokenCost;
    }
  }

  // Total duration
  const totalDurationMs = graph.endTime !== null ? graph.endTime - graph.startTime : null;

  return {
    runId: graph.id,
    agentId: graph.agentId,
    status: graph.status,
    startTime: graph.startTime,
    endTime: graph.endTime,
    totalDurationMs,
    totalTokenCost,
    steps,
    summary: { attempted, succeeded, failed, skipped },
  };
}

/**
 * Format a {@link RunReceipt} into a human-readable text block.
 *
 * Layout:
 * ```
 * === Run Receipt ===
 * Run:      <runId>
 * Agent:    <agentId>
 * Status:   <status>
 * Duration: <totalDurationMs>ms
 *
 * Summary: <attempted> attempted, <succeeded> succeeded, <failed> failed, <skipped> skipped
 *
 *  # | Step             | Type    | Status    | Duration | Tokens
 * ---|------------------|---------|-----------|----------|-------
 *  1 | fetch-data       | tool    | completed | 120ms    | 450
 *  ...
 *
 * Total token cost: 1 250
 * ```
 *
 * Shows `'---'` for missing duration and `'---'` for missing cost data per step.
 * Shows `'no cost data'` for the totals line when no cost information is available.
 *
 * @param receipt - A run receipt produced by {@link toReceipt}.
 * @returns Multi-line formatted string.
 */
export function formatReceipt(receipt: RunReceipt): string {
  const lines: string[] = [];

  // Header
  lines.push('=== Run Receipt ===');
  lines.push(`Run:      ${receipt.runId}`);
  lines.push(`Agent:    ${receipt.agentId}`);
  lines.push(`Status:   ${receipt.status}`);
  lines.push(
    `Duration: ${receipt.totalDurationMs !== null ? `${receipt.totalDurationMs}ms` : '\u2014'}`,
  );
  lines.push('');

  // Summary line
  const s = receipt.summary;
  lines.push(
    `Summary: ${s.attempted} attempted, ${s.succeeded} succeeded, ${s.failed} failed, ${s.skipped} skipped`,
  );
  lines.push('');

  // Step table
  // Compute column widths
  const nameWidth = Math.max(4, ...receipt.steps.map((st) => st.name.length));
  const typeWidth = Math.max(4, ...receipt.steps.map((st) => st.type.length));

  const pad = (str: string, width: number) => str.padEnd(width);
  const padNum = (str: string, width: number) => str.padStart(width);

  const idxWidth = Math.max(2, String(receipt.steps.length).length);
  const statusWidth = 9; // 'completed' is longest
  const durWidth = 10;
  const tokWidth = 8;

  // Header row
  lines.push(
    ` ${padNum('#', idxWidth)} | ${pad('Step', nameWidth)} | ${pad('Type', typeWidth)} | ${pad('Status', statusWidth)} | ${padNum('Duration', durWidth)} | ${padNum('Tokens', tokWidth)}`,
  );
  lines.push(
    `${'-'.repeat(idxWidth + 1)}|${'-'.repeat(nameWidth + 2)}|${'-'.repeat(typeWidth + 2)}|${'-'.repeat(statusWidth + 2)}|${'-'.repeat(durWidth + 2)}|${'-'.repeat(tokWidth + 2)}`,
  );

  // Step rows
  for (let i = 0; i < receipt.steps.length; i++) {
    const step = receipt.steps[i]!;
    const durStr = step.durationMs !== null ? `${step.durationMs}ms` : '\u2014';
    const tokStr = step.tokenCost !== null ? String(step.tokenCost) : '\u2014';
    lines.push(
      ` ${padNum(String(i + 1), idxWidth)} | ${pad(step.name, nameWidth)} | ${pad(step.type, typeWidth)} | ${pad(step.status, statusWidth)} | ${padNum(durStr, durWidth)} | ${padNum(tokStr, tokWidth)}`,
    );
  }

  lines.push('');

  // Totals
  if (receipt.totalTokenCost !== null) {
    lines.push(`Total token cost: ${receipt.totalTokenCost}`);
  } else {
    lines.push('Total token cost: no cost data');
  }

  return lines.join('\n');
}
