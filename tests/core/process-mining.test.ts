import type { ExecutionGraph } from 'agentflow-core';
import {
  checkConformance,
  createGraphBuilder,
  discoverProcess,
  findVariants,
  getBottlenecks,
  getPathSignature,
} from 'agentflow-core';
import { describe, expect, it } from 'vitest';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Deterministic counter-based ID generator for tests. */
function testIdGenerator(): () => string {
  let counter = 0;
  return () => {
    counter++;
    return `pm_${String(counter).padStart(3, '0')}`;
  };
}

/**
 * Build a simple graph: agent:main → tool:fetch → tool:analyze
 * This is the "happy path" used across tests.
 */
function buildHappyPath(suffix = ''): ExecutionGraph {
  const builder = createGraphBuilder({
    idGenerator: testIdGenerator(),
    agentId: `test-agent${suffix}`,
    trigger: 'unit-test',
  });

  const rootId = builder.startNode({ type: 'agent', name: 'main' });
  const fetchId = builder.startNode({ type: 'tool', name: 'fetch', parentId: rootId });
  builder.endNode(fetchId);
  const analyzeId = builder.startNode({ type: 'tool', name: 'analyze', parentId: rootId });
  builder.endNode(analyzeId);
  builder.endNode(rootId);

  return builder.build();
}

/**
 * Build a failure variant: agent:main → tool:fetch (failed)
 */
function buildFailurePath(suffix = ''): ExecutionGraph {
  const builder = createGraphBuilder({
    idGenerator: testIdGenerator(),
    agentId: `test-agent${suffix}`,
    trigger: 'unit-test',
  });

  const rootId = builder.startNode({ type: 'agent', name: 'main' });
  const fetchId = builder.startNode({ type: 'tool', name: 'fetch', parentId: rootId });
  builder.failNode(fetchId, 'timeout');
  builder.endNode(rootId);

  return builder.build();
}

/**
 * Build a retry variant: agent:main → tool:fetch → tool:retry → tool:analyze
 */
function buildRetryPath(suffix = ''): ExecutionGraph {
  const builder = createGraphBuilder({
    idGenerator: testIdGenerator(),
    agentId: `test-agent${suffix}`,
    trigger: 'unit-test',
  });

  const rootId = builder.startNode({ type: 'agent', name: 'main' });
  const fetchId = builder.startNode({ type: 'tool', name: 'fetch', parentId: rootId });
  builder.endNode(fetchId);
  const retryId = builder.startNode({ type: 'tool', name: 'retry', parentId: rootId });
  builder.endNode(retryId);
  const analyzeId = builder.startNode({ type: 'tool', name: 'analyze', parentId: rootId });
  builder.endNode(analyzeId);
  builder.endNode(rootId);

  return builder.build();
}

/**
 * Build a graph with a single root node only.
 */
function buildSingleNode(): ExecutionGraph {
  const builder = createGraphBuilder({
    idGenerator: testIdGenerator(),
    agentId: 'test-agent',
    trigger: 'unit-test',
  });

  const rootId = builder.startNode({ type: 'agent', name: 'main' });
  builder.endNode(rootId);

  return builder.build();
}

// ---------------------------------------------------------------------------
// getPathSignature
// ---------------------------------------------------------------------------

describe('getPathSignature', () => {
  it('returns type:name pairs for a linear execution', () => {
    const graph = buildHappyPath();
    const sig = getPathSignature(graph);
    // Children sorted alphabetically: analyze < fetch
    expect(sig).toBe('agent:main→tool:analyze→tool:fetch');
  });

  it('returns deterministic signature for branching execution', () => {
    const sig1 = getPathSignature(buildHappyPath());
    const sig2 = getPathSignature(buildHappyPath());
    expect(sig1).toBe(sig2);
  });

  it('returns single step for single-node graph', () => {
    const sig = getPathSignature(buildSingleNode());
    expect(sig).toBe('agent:main');
  });

  it('returns empty string for graph with unresolvable root', () => {
    // Build a valid graph then create one with a bad rootNodeId
    const good = buildSingleNode();
    const bad: ExecutionGraph = {
      ...good,
      rootNodeId: 'nonexistent',
    };
    expect(getPathSignature(bad)).toBe('');
  });

  it('includes nested children in DFS order', () => {
    const builder = createGraphBuilder({
      idGenerator: testIdGenerator(),
      agentId: 'test',
      trigger: 'test',
    });

    const root = builder.startNode({ type: 'agent', name: 'main' });
    const sub = builder.startNode({ type: 'subagent', name: 'worker', parentId: root });
    const tool = builder.startNode({ type: 'tool', name: 'search', parentId: sub });
    builder.endNode(tool);
    builder.endNode(sub);
    builder.endNode(root);

    const sig = getPathSignature(builder.build());
    expect(sig).toBe('agent:main→subagent:worker→tool:search');
  });
});

// ---------------------------------------------------------------------------
// discoverProcess
// ---------------------------------------------------------------------------

describe('discoverProcess', () => {
  it('discovers model from identical runs', () => {
    const graphs = Array.from({ length: 10 }, () => buildHappyPath());
    const model = discoverProcess(graphs);

    expect(model.totalGraphs).toBe(10);
    expect(model.agentId).toBe('test-agent');
    expect(model.steps).toContain('agent:main');
    expect(model.steps).toContain('tool:fetch');
    expect(model.steps).toContain('tool:analyze');

    // All transitions should have count 10 and probability 1.0
    const mainToFetch = model.transitions.find(
      (t) => t.from === 'agent:main' && t.to === 'tool:fetch',
    );
    expect(mainToFetch).toBeDefined();
    expect(mainToFetch!.count).toBe(10);
    expect(mainToFetch!.probability).toBe(0.5); // 50% because main has two children
  });

  it('discovers divergent transitions with correct probabilities', () => {
    const happy = Array.from({ length: 8 }, () => buildHappyPath());
    const retry = Array.from({ length: 2 }, () => buildRetryPath());
    const model = discoverProcess([...happy, ...retry]);

    expect(model.totalGraphs).toBe(10);

    // main→analyze: 10 times (in both variants)
    const mainToAnalyze = model.transitions.find(
      (t) => t.from === 'agent:main' && t.to === 'tool:analyze',
    );
    expect(mainToAnalyze).toBeDefined();
    expect(mainToAnalyze!.count).toBe(10);

    // main→retry: only 2 times (retry variant only)
    const mainToRetry = model.transitions.find(
      (t) => t.from === 'agent:main' && t.to === 'tool:retry',
    );
    expect(mainToRetry).toBeDefined();
    expect(mainToRetry!.count).toBe(2);
  });

  it('works with a single graph', () => {
    const model = discoverProcess([buildHappyPath()]);
    expect(model.totalGraphs).toBe(1);
    expect(model.transitions.length).toBeGreaterThan(0);
    // All transitions should have probability based on sibling count
    for (const t of model.transitions) {
      expect(t.count).toBe(1);
      expect(t.probability).toBeGreaterThan(0);
      expect(t.probability).toBeLessThanOrEqual(1);
    }
  });

  it('throws on empty input', () => {
    expect(() => discoverProcess([])).toThrow('at least one graph');
  });
});

// ---------------------------------------------------------------------------
// findVariants
// ---------------------------------------------------------------------------

describe('findVariants', () => {
  it('returns single variant when all runs follow same path', () => {
    const graphs = Array.from({ length: 10 }, () => buildHappyPath());
    const variants = findVariants(graphs);

    expect(variants).toHaveLength(1);
    expect(variants[0]!.count).toBe(10);
    expect(variants[0]!.percentage).toBe(100);
  });

  it('returns multiple variants sorted by frequency', () => {
    const happy = Array.from({ length: 8 }, () => buildHappyPath());
    const failure = Array.from({ length: 2 }, () => buildFailurePath());
    const variants = findVariants([...happy, ...failure]);

    expect(variants).toHaveLength(2);
    expect(variants[0]!.count).toBe(8);
    expect(variants[0]!.percentage).toBe(80);
    expect(variants[1]!.count).toBe(2);
    expect(variants[1]!.percentage).toBe(20);
  });

  it('returns empty array for empty input', () => {
    expect(findVariants([])).toEqual([]);
  });

  it('handles all-unique runs', () => {
    const graphs = [buildHappyPath(), buildFailurePath(), buildRetryPath()];
    const variants = findVariants(graphs);

    expect(variants).toHaveLength(3);
    for (const v of variants) {
      expect(v.count).toBe(1);
      expect(v.percentage).toBeCloseTo(33.33, 1);
    }
  });

  it('includes graphIds and exampleGraph', () => {
    const graphs = Array.from({ length: 3 }, () => buildHappyPath());
    const variants = findVariants(graphs);

    expect(variants[0]!.graphIds).toHaveLength(3);
    expect(variants[0]!.exampleGraph).toBeDefined();
    expect(variants[0]!.exampleGraph.agentId).toBe('test-agent');
  });
});

// ---------------------------------------------------------------------------
// getBottlenecks
// ---------------------------------------------------------------------------

describe('getBottlenecks', () => {
  it('returns bottlenecks sorted by p95 descending', () => {
    // Build graphs where fetch is slower than analyze
    const graphs = Array.from({ length: 5 }, () => buildHappyPath());
    const bottlenecks = getBottlenecks(graphs);

    expect(bottlenecks.length).toBeGreaterThan(0);

    // Verify sorted by p95 descending
    for (let i = 1; i < bottlenecks.length; i++) {
      expect(bottlenecks[i - 1]!.durations.p95).toBeGreaterThanOrEqual(
        bottlenecks[i]!.durations.p95,
      );
    }
  });

  it('tracks node presence across graphs', () => {
    // 3 happy paths have fetch+analyze, 2 failure paths have only fetch
    const graphs = [
      ...Array.from({ length: 3 }, () => buildHappyPath()),
      ...Array.from({ length: 2 }, () => buildFailurePath()),
    ];
    const bottlenecks = getBottlenecks(graphs);

    const fetchBottleneck = bottlenecks.find((b) => b.nodeName === 'fetch');
    const analyzeBottleneck = bottlenecks.find((b) => b.nodeName === 'analyze');

    expect(fetchBottleneck).toBeDefined();
    expect(fetchBottleneck!.occurrences).toBe(5); // present in all 5 graphs
    expect(fetchBottleneck!.percentOfGraphs).toBe(100);

    expect(analyzeBottleneck).toBeDefined();
    expect(analyzeBottleneck!.occurrences).toBe(3); // only in happy paths
    expect(analyzeBottleneck!.percentOfGraphs).toBe(60);
  });

  it('returns empty array for empty input', () => {
    expect(getBottlenecks([])).toEqual([]);
  });

  it('computes valid duration stats', () => {
    const graphs = Array.from({ length: 10 }, () => buildHappyPath());
    const bottlenecks = getBottlenecks(graphs);

    for (const b of bottlenecks) {
      expect(b.durations.min).toBeLessThanOrEqual(b.durations.median);
      expect(b.durations.median).toBeLessThanOrEqual(b.durations.p95);
      expect(b.durations.p95).toBeLessThanOrEqual(b.durations.p99);
      expect(b.durations.p99).toBeLessThanOrEqual(b.durations.max);
      expect(b.durations.min).toBeGreaterThanOrEqual(0);
    }
  });

  it('handles running nodes with provisional end time', () => {
    const builder = createGraphBuilder({
      idGenerator: testIdGenerator(),
      agentId: 'test',
      trigger: 'test',
    });

    const root = builder.startNode({ type: 'agent', name: 'main' });
    builder.startNode({ type: 'tool', name: 'running-tool', parentId: root });
    // Don't end the tool — it's still running
    const snapshot = builder.getSnapshot();

    const bottlenecks = getBottlenecks([snapshot]);
    const runningTool = bottlenecks.find((b) => b.nodeName === 'running-tool');
    expect(runningTool).toBeDefined();
    expect(runningTool!.durations.median).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// checkConformance
// ---------------------------------------------------------------------------

describe('checkConformance', () => {
  it('returns perfect score for conforming run', () => {
    const graphs = Array.from({ length: 10 }, () => buildHappyPath());
    const model = discoverProcess(graphs);
    const report = checkConformance(buildHappyPath(), model);

    expect(report.conformanceScore).toBe(1.0);
    expect(report.isConforming).toBe(true);
    expect(report.deviations).toHaveLength(0);
  });

  it('detects unexpected transitions', () => {
    // Build model from happy paths only
    const graphs = Array.from({ length: 10 }, () => buildHappyPath());
    const model = discoverProcess(graphs);

    // Check a retry path against the happy-path model
    const retryGraph = buildRetryPath();
    const report = checkConformance(retryGraph, model);

    expect(report.isConforming).toBe(false);
    const unexpected = report.deviations.filter((d) => d.type === 'unexpected-transition');
    expect(unexpected.length).toBeGreaterThan(0);
    expect(unexpected.some((d) => d.to === 'tool:retry')).toBe(true);
  });

  it('detects missing common transitions', () => {
    // Build a model where parent→child has probability 1.0 (single child)
    // so the missing-transition threshold (> 0.5) is satisfied.
    function buildLinearPath(): ExecutionGraph {
      const builder = createGraphBuilder({
        idGenerator: testIdGenerator(),
        agentId: 'test',
        trigger: 'test',
      });
      const root = builder.startNode({ type: 'agent', name: 'main' });
      const fetch = builder.startNode({ type: 'tool', name: 'fetch', parentId: root });
      const analyze = builder.startNode({ type: 'tool', name: 'analyze', parentId: fetch });
      builder.endNode(analyze);
      builder.endNode(fetch);
      builder.endNode(root);
      return builder.build();
    }

    // Model: main→fetch (1.0), fetch→analyze (1.0)
    const graphs = Array.from({ length: 10 }, () => buildLinearPath());
    const model = discoverProcess(graphs);

    // Check a graph that has main→fetch but fetch has NO children
    const builder = createGraphBuilder({
      idGenerator: testIdGenerator(),
      agentId: 'test',
      trigger: 'test',
    });
    const root = builder.startNode({ type: 'agent', name: 'main' });
    const fetch = builder.startNode({ type: 'tool', name: 'fetch', parentId: root });
    builder.endNode(fetch);
    builder.endNode(root);
    const truncatedGraph = builder.build();

    const report = checkConformance(truncatedGraph, model);

    expect(report.isConforming).toBe(false);
    const missing = report.deviations.filter((d) => d.type === 'missing-transition');
    // fetch→analyze is missing (model has it at probability 1.0)
    expect(missing.some((d) => d.from === 'tool:fetch' && d.to === 'tool:analyze')).toBe(true);
  });

  it('detects low-frequency paths', () => {
    // Build model where retry is rare (2 out of 100)
    const happy = Array.from({ length: 98 }, () => buildHappyPath());
    const retry = Array.from({ length: 2 }, () => buildRetryPath());
    const model = discoverProcess([...happy, ...retry]);

    // Check a retry path — it exists in model but is low frequency
    const report = checkConformance(buildRetryPath(), model);

    const lowFreq = report.deviations.filter((d) => d.type === 'low-frequency-path');
    expect(lowFreq.length).toBeGreaterThan(0);
  });

  it('computes correct conformance score', () => {
    const graphs = Array.from({ length: 10 }, () => buildHappyPath());
    const model = discoverProcess(graphs);

    // A perfectly conforming graph should score 1.0
    const perfectReport = checkConformance(buildHappyPath(), model);
    expect(perfectReport.conformanceScore).toBe(1.0);

    // A non-conforming graph should score < 1.0
    const badReport = checkConformance(buildRetryPath(), model);
    expect(badReport.conformanceScore).toBeLessThan(1.0);
    expect(badReport.conformanceScore).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// Integration test
// ---------------------------------------------------------------------------

describe('process mining integration', () => {
  it('builds graphs → discovers model → finds variants → checks conformance', () => {
    // Phase 1: Build a set of execution graphs
    const happyPaths = Array.from({ length: 8 }, (_, i) => buildHappyPath(`-${i}`));
    const failurePaths = Array.from({ length: 2 }, (_, i) => buildFailurePath(`-fail-${i}`));
    const allGraphs = [...happyPaths, ...failurePaths];

    // Phase 2: Discover the process model
    const model = discoverProcess(allGraphs);
    expect(model.totalGraphs).toBe(10);
    expect(model.steps.length).toBeGreaterThan(0);
    expect(model.transitions.length).toBeGreaterThan(0);

    // Phase 3: Find variants
    const variants = findVariants(allGraphs);
    expect(variants.length).toBe(2);
    expect(variants[0]!.count).toBe(8); // happy path is dominant
    expect(variants[1]!.count).toBe(2); // failure variant

    // Phase 4: Get bottlenecks
    const bottlenecks = getBottlenecks(allGraphs);
    expect(bottlenecks.length).toBeGreaterThan(0);
    // main agent should be present in all runs
    const mainBottleneck = bottlenecks.find((b) => b.nodeName === 'main');
    expect(mainBottleneck).toBeDefined();
    expect(mainBottleneck!.occurrences).toBe(10);

    // Phase 5: Check conformance of a new happy path
    const newHappy = buildHappyPath('-new');
    const happyReport = checkConformance(newHappy, model);
    expect(happyReport.conformanceScore).toBeGreaterThan(0.5);

    // Phase 6: Check conformance of a completely new variant
    const retryPath = buildRetryPath('-new');
    const retryReport = checkConformance(retryPath, model);
    expect(retryReport.isConforming).toBe(false);
    expect(retryReport.deviations.length).toBeGreaterThan(0);
  });
});
