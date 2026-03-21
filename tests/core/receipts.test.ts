import type { ExecutionGraph } from 'agentflow-core';
import { createGraphBuilder, formatReceipt, toReceipt } from 'agentflow-core';
import { describe, expect, it } from 'vitest';

/** Deterministic counter-based ID generator for tests. */
function testIdGenerator(): () => string {
  let counter = 0;
  return () => {
    counter++;
    return `r_${String(counter).padStart(3, '0')}`;
  };
}

/**
 * Build a completed graph with cost data:
 *
 * root-agent (completed)
 *   ├── fetch-data   (tool, completed, tokenCost=450 via metadata.semantic)
 *   └── summarize    (tool, completed, tokenCost=200 via state.tokenCost)
 */
function buildCompletedGraph(): ExecutionGraph {
  const builder = createGraphBuilder({
    idGenerator: testIdGenerator(),
    agentId: 'receipt-agent',
    trigger: 'unit-test',
  });

  const rootId = builder.startNode({ type: 'agent', name: 'root-agent' });

  const fetchId = builder.startNode({
    type: 'tool',
    name: 'fetch-data',
    parentId: rootId,
    metadata: { semantic: { tokenCost: 450 } },
  });
  builder.endNode(fetchId);

  const sumId = builder.startNode({
    type: 'tool',
    name: 'summarize',
    parentId: rootId,
  });
  builder.updateState(sumId, { tokenCost: 200 });
  builder.endNode(sumId);

  builder.endNode(rootId);
  return builder.build();
}

/**
 * Build a graph with a failed step and no cost data.
 *
 * root-agent (completed)
 *   ├── tool-a (completed, no cost)
 *   └── tool-b (failed, no cost)
 */
function buildFailedGraph(): ExecutionGraph {
  const builder = createGraphBuilder({
    idGenerator: testIdGenerator(),
    agentId: 'fail-agent',
    trigger: 'unit-test',
  });

  const rootId = builder.startNode({ type: 'agent', name: 'root-agent' });

  const toolA = builder.startNode({ type: 'tool', name: 'tool-a', parentId: rootId });
  builder.endNode(toolA);

  const toolB = builder.startNode({ type: 'tool', name: 'tool-b', parentId: rootId });
  builder.failNode(toolB, 'connection timeout');

  builder.endNode(rootId);
  return builder.build();
}

/**
 * Build a graph that is still running (snapshot, not built).
 */
function buildRunningGraph(): ExecutionGraph {
  const builder = createGraphBuilder({
    idGenerator: testIdGenerator(),
    agentId: 'running-agent',
    trigger: 'unit-test',
  });

  const rootId = builder.startNode({ type: 'agent', name: 'root-agent' });

  const toolA = builder.startNode({ type: 'tool', name: 'tool-a', parentId: rootId });
  builder.endNode(toolA);

  // root still running — use snapshot instead of build
  return builder.getSnapshot();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('toReceipt', () => {
  it('completed run produces correct receipt with all fields', () => {
    const graph = buildCompletedGraph();
    const receipt = toReceipt(graph);

    expect(receipt.runId).toBe(graph.id);
    expect(receipt.agentId).toBe('receipt-agent');
    expect(receipt.status).toBe('completed');
    expect(receipt.startTime).toBe(graph.startTime);
    expect(receipt.endTime).toBe(graph.endTime);
    expect(receipt.totalDurationMs).toBeTypeOf('number');
    expect(receipt.totalDurationMs).toBeGreaterThanOrEqual(0);

    // Token cost is sum of 450 + 200 = 650
    expect(receipt.totalTokenCost).toBe(650);

    // Steps sorted by startTime
    expect(receipt.steps).toHaveLength(3); // root + 2 tools
    expect(receipt.steps[0].name).toBe('root-agent');
    expect(receipt.steps[1].name).toBe('fetch-data');
    expect(receipt.steps[2].name).toBe('summarize');

    // Step details
    const fetchStep = receipt.steps[1];
    expect(fetchStep.type).toBe('tool');
    expect(fetchStep.status).toBe('completed');
    expect(fetchStep.durationMs).toBeTypeOf('number');
    expect(fetchStep.tokenCost).toBe(450);
    expect(fetchStep.error).toBeNull();

    const sumStep = receipt.steps[2];
    expect(sumStep.tokenCost).toBe(200);

    // Summary counts
    expect(receipt.summary.attempted).toBe(3);
    expect(receipt.summary.succeeded).toBe(3);
    expect(receipt.summary.failed).toBe(0);
    expect(receipt.summary.skipped).toBe(0);
  });

  it('running graph produces receipt with status=running and endTime=null', () => {
    const graph = buildRunningGraph();
    const receipt = toReceipt(graph);

    expect(receipt.status).toBe('running');
    expect(receipt.endTime).toBeNull();
    expect(receipt.totalDurationMs).toBeNull();

    // root-agent is still running so durationMs is null for it
    const rootStep = receipt.steps.find((s) => s.name === 'root-agent');
    expect(rootStep).toBeDefined();
    expect(rootStep?.status).toBe('running');
    expect(rootStep?.durationMs).toBeNull();

    // tool-a is completed
    const toolStep = receipt.steps.find((s) => s.name === 'tool-a');
    expect(toolStep).toBeDefined();
    expect(toolStep?.status).toBe('completed');
    expect(toolStep?.durationMs).toBeTypeOf('number');
  });

  it('failed steps are counted correctly', () => {
    const graph = buildFailedGraph();
    const receipt = toReceipt(graph);

    expect(receipt.summary.attempted).toBe(3);
    expect(receipt.summary.succeeded).toBe(2); // root + tool-a
    expect(receipt.summary.failed).toBe(1); // tool-b

    const failedStep = receipt.steps.find((s) => s.name === 'tool-b');
    expect(failedStep).toBeDefined();
    expect(failedStep?.status).toBe('failed');
    expect(failedStep?.error).toBe('connection timeout');
  });
});

describe('formatReceipt', () => {
  it('output has header, summary line, step table, and totals', () => {
    const graph = buildCompletedGraph();
    const receipt = toReceipt(graph);
    const output = formatReceipt(receipt);

    // Header
    expect(output).toContain('=== Run Receipt ===');
    expect(output).toContain(`Run:      ${receipt.runId}`);
    expect(output).toContain('Agent:    receipt-agent');
    expect(output).toContain('Status:   completed');
    expect(output).toContain('Duration:');

    // Summary line
    expect(output).toContain('3 attempted');
    expect(output).toContain('3 succeeded');
    expect(output).toContain('0 failed');
    expect(output).toContain('0 skipped');

    // Step table has headers
    expect(output).toContain('Step');
    expect(output).toContain('Type');
    expect(output).toContain('Status');
    expect(output).toContain('Duration');
    expect(output).toContain('Tokens');

    // Step names appear
    expect(output).toContain('root-agent');
    expect(output).toContain('fetch-data');
    expect(output).toContain('summarize');

    // Totals
    expect(output).toContain('Total token cost: 650');
  });

  it('receipt with no cost data shows "no cost data" in formatted output', () => {
    const graph = buildFailedGraph();
    const receipt = toReceipt(graph);

    // Verify no cost data exists
    expect(receipt.totalTokenCost).toBeNull();

    const output = formatReceipt(receipt);
    expect(output).toContain('Total token cost: no cost data');

    // Individual steps should show em-dash for missing costs
    expect(output).toContain('\u2014');
  });

  it('running graph receipt shows em-dash for missing duration', () => {
    const graph = buildRunningGraph();
    const receipt = toReceipt(graph);
    const output = formatReceipt(receipt);

    expect(output).toContain('Status:   running');
    // Duration line uses em-dash when totalDurationMs is null
    expect(output).toMatch(/Duration:\s+\u2014/);
  });
});
