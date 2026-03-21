import type { ExecutionGraph } from 'agentflow-core';
import { createGraphBuilder, getEfficiency } from 'agentflow-core';
import { describe, expect, it } from 'vitest';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function testIdGenerator(prefix = 'eff'): () => string {
  let counter = 0;
  return () => {
    counter++;
    return `${prefix}_${String(counter).padStart(3, '0')}`;
  };
}

/**
 * Build a graph with token costs on every node via metadata.semantic.
 */
function buildWithCosts(costs: number[], agentId = 'test-agent'): ExecutionGraph {
  const builder = createGraphBuilder({
    idGenerator: testIdGenerator(),
    agentId,
    trigger: 'unit-test',
  });

  const rootId = builder.startNode({
    type: 'agent',
    name: 'main',
    metadata: { semantic: { tokenCost: costs[0] ?? 100 } },
  });

  for (let i = 1; i < costs.length; i++) {
    const nodeId = builder.startNode({
      type: 'tool',
      name: `step-${i}`,
      parentId: rootId,
      metadata: { semantic: { tokenCost: costs[i] } },
    });
    builder.endNode(nodeId);
  }

  builder.endNode(rootId);
  return builder.build();
}

/**
 * Build a graph with NO token cost data on any node.
 */
function buildWithoutCosts(agentId = 'test-agent'): ExecutionGraph {
  const builder = createGraphBuilder({
    idGenerator: testIdGenerator(),
    agentId,
    trigger: 'unit-test',
  });

  const rootId = builder.startNode({ type: 'agent', name: 'main' });
  const toolId = builder.startNode({ type: 'tool', name: 'fetch', parentId: rootId });
  builder.endNode(toolId);
  builder.endNode(rootId);
  return builder.build();
}

/**
 * Build a graph with token costs on state.tokenCost (fallback path).
 */
function buildWithStateCosts(agentId = 'test-agent'): ExecutionGraph {
  const builder = createGraphBuilder({
    idGenerator: testIdGenerator(),
    agentId,
    trigger: 'unit-test',
  });

  const rootId = builder.startNode({ type: 'agent', name: 'main' });
  builder.updateState(rootId, { tokenCost: 200 });
  const toolId = builder.startNode({ type: 'tool', name: 'fetch', parentId: rootId });
  builder.updateState(toolId, { tokenCost: 150 });
  builder.endNode(toolId);
  builder.endNode(rootId);
  return builder.build();
}

/**
 * Build a wasteful retry graph: same node name appears 4 times with high cost.
 */
function buildRetryHeavy(agentId = 'test-agent'): ExecutionGraph {
  const builder = createGraphBuilder({
    idGenerator: testIdGenerator(),
    agentId,
    trigger: 'unit-test',
  });

  const rootId = builder.startNode({
    type: 'agent',
    name: 'main',
    metadata: { semantic: { tokenCost: 100 } },
  });

  // Same node name repeated 4 times — retry pattern
  for (let i = 0; i < 4; i++) {
    const nodeId = builder.startNode({
      type: 'tool',
      name: 'flaky-call',
      parentId: rootId,
      metadata: { semantic: { tokenCost: 500 } },
    });
    builder.endNode(nodeId);
  }

  builder.endNode(rootId);
  return builder.build();
}

/**
 * Build an expensive but non-looping graph (unique node names, high cost).
 */
function buildExpensiveUnique(agentId = 'test-agent'): ExecutionGraph {
  const builder = createGraphBuilder({
    idGenerator: testIdGenerator(),
    agentId,
    trigger: 'unit-test',
  });

  const rootId = builder.startNode({
    type: 'agent',
    name: 'main',
    metadata: { semantic: { tokenCost: 100 } },
  });

  for (let i = 0; i < 4; i++) {
    const nodeId = builder.startNode({
      type: 'tool',
      name: `unique-step-${i}`,
      parentId: rootId,
      metadata: { semantic: { tokenCost: 500 } },
    });
    builder.endNode(nodeId);
  }

  builder.endNode(rootId);
  return builder.build();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('getEfficiency', () => {
  it('computes basic efficiency with token costs populated', () => {
    const g1 = buildWithCosts([100, 200, 300]);
    const g2 = buildWithCosts([150, 250, 350]);
    const report = getEfficiency([g1, g2]);

    expect(report.runs).toHaveLength(2);

    // g1: totalTokenCost = 600, completedNodes = 3, costPerNode = 200
    expect(report.runs[0].totalTokenCost).toBe(600);
    expect(report.runs[0].completedNodes).toBe(3);
    expect(report.runs[0].costPerNode).toBe(200);

    // g2: totalTokenCost = 750, completedNodes = 3, costPerNode = 250
    expect(report.runs[1].totalTokenCost).toBe(750);
    expect(report.runs[1].completedNodes).toBe(3);
    expect(report.runs[1].costPerNode).toBe(250);

    // Aggregate: mean = 225, median = 225 (two values: 200, 250)
    expect(report.aggregate.mean).toBe(225);
    expect(report.aggregate.median).toBe(225);
    expect(report.aggregate.p95).toBeGreaterThanOrEqual(200);

    // Full coverage
    expect(report.dataCoverage).toBe(1);
    expect(report.nodeCosts).toHaveLength(6);
    expect(report.flags).toHaveLength(0);
  });

  it('handles missing tokenCost gracefully with dataCoverage reported', () => {
    const withCost = buildWithCosts([100, 200]);
    const withoutCost = buildWithoutCosts();
    const report = getEfficiency([withCost, withoutCost]);

    // withCost has 2 nodes with costs, withoutCost has 2 nodes without
    // dataCoverage = 2 / 4 = 0.5
    expect(report.dataCoverage).toBe(0.5);

    // The run without costs should still have an entry with 0 totalTokenCost
    const noCostRun = report.runs.find((r) => r.totalTokenCost === 0);
    expect(noCostRun).toBeDefined();
    expect(noCostRun!.costPerNode).toBe(0);

    // nodeCosts for the no-cost graph should have null tokenCost
    const nullCostNodes = report.nodeCosts.filter((nc) => nc.tokenCost === null);
    expect(nullCostNodes.length).toBe(2);
  });

  it('reads tokenCost from state.tokenCost as fallback', () => {
    const graph = buildWithStateCosts();
    const report = getEfficiency([graph]);

    expect(report.runs[0].totalTokenCost).toBe(350);
    expect(report.dataCoverage).toBe(1);
  });

  it('detects wasteful retry loop and flags it', () => {
    // Create a normal-cost graph alongside the retry-heavy one
    // so the median is low enough that the retry graph triggers the 3x threshold.
    const normal1 = buildWithCosts([50, 50, 50]);
    const normal2 = buildWithCosts([60, 60, 60]);
    const retryGraph = buildRetryHeavy();

    const report = getEfficiency([normal1, normal2, retryGraph]);

    // The retry graph has costPerNode = (100 + 4*500) / 5 = 420
    // Normal graphs have costPerNode = 50 and 60
    // Median of [50, 60, 420] = 60
    // 420 > 3 * 60 = 180, so the retry graph is flagged
    expect(report.flags.length).toBeGreaterThan(0);

    const retryFlag = report.flags.find((f) => f.nodeName === 'flaky-call');
    expect(retryFlag).toBeDefined();
    expect(retryFlag!.pattern).toBe('wasteful_retry');
    expect(retryFlag!.retryCount).toBe(4);
    expect(retryFlag!.tokenCost).toBe(2000);
  });

  it('does NOT flag expensive but non-looping run', () => {
    // Same structure as above but with unique node names — no retries.
    const normal1 = buildWithCosts([50, 50, 50]);
    const normal2 = buildWithCosts([60, 60, 60]);
    const expensive = buildExpensiveUnique();

    const report = getEfficiency([normal1, normal2, expensive]);

    // The expensive graph has high cost-per-node but no repeated node names,
    // so it should not be flagged as a wasteful retry.
    expect(report.flags).toHaveLength(0);
  });

  it('returns empty report for no graphs', () => {
    const report = getEfficiency([]);

    expect(report.runs).toHaveLength(0);
    expect(report.aggregate.mean).toBe(0);
    expect(report.aggregate.median).toBe(0);
    expect(report.aggregate.p95).toBe(0);
    expect(report.nodeCosts).toHaveLength(0);
    expect(report.dataCoverage).toBe(0);
    expect(report.flags).toHaveLength(0);
  });
});
