import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ExecutionGraph, PolicySource } from 'agentflow-core';
import {
  checkGuards,
  createExecutionEvent,
  createGraphBuilder,
  createKnowledgeStore,
  createPatternEvent,
  createPolicySource,
  discoverProcess,
  findVariants,
  getBottlenecks,
} from 'agentflow-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

function testIdGenerator(): () => string {
  let counter = 0;
  return () => {
    counter++;
    return `ag_${String(counter).padStart(3, '0')}`;
  };
}

function buildCompletedGraph(agentId = 'test-agent'): ExecutionGraph {
  const builder = createGraphBuilder({
    idGenerator: testIdGenerator(),
    agentId,
    trigger: 'unit-test',
  });
  const root = builder.startNode({ type: 'agent', name: 'main' });
  const tool = builder.startNode({ type: 'tool', name: 'fetch', parentId: root });
  builder.endNode(tool);
  builder.endNode(root);
  return builder.build();
}

function buildFailedGraph(agentId = 'test-agent'): ExecutionGraph {
  const builder = createGraphBuilder({
    idGenerator: testIdGenerator(),
    agentId,
    trigger: 'unit-test',
  });
  const root = builder.startNode({ type: 'agent', name: 'main' });
  const tool = builder.startNode({
    type: 'tool',
    name: 'fetch-data',
    parentId: root,
    metadata: { error: 'fail' },
  });
  builder.failNode(tool, 'fail');
  builder.endNode(root, 'failed');
  return builder.build();
}

/** Build a graph with a running node (not yet ended) for bottleneck testing. */
function buildRunningGraph(agentId = 'test-agent'): ExecutionGraph {
  const builder = createGraphBuilder({
    idGenerator: testIdGenerator(),
    agentId,
    trigger: 'unit-test',
  });
  const root = builder.startNode({ type: 'agent', name: 'main' });
  builder.startNode({ type: 'tool', name: 'fetch', parentId: root });
  // Don't end the tool — it stays "running"
  return builder.getSnapshot();
}

/** Create a mock PolicySource for testing without filesystem. */
function mockPolicySource(overrides: Partial<PolicySource> = {}): PolicySource {
  return {
    recentFailureRate: () => 0,
    isKnownBottleneck: () => false,
    lastConformanceScore: () => null,
    getAgentProfile: () => null,
    ...overrides,
  };
}

let testDir: string;

beforeEach(() => {
  testDir = join(tmpdir(), `ag-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe('Adaptive Guards', () => {
  describe('high-failure-rate', () => {
    it('emits violation when failure rate exceeds threshold', () => {
      const policy = mockPolicySource({ recentFailureRate: () => 0.6 });
      const graph = buildCompletedGraph();
      const violations = checkGuards(graph, { policySource: policy });

      const hfr = violations.find((v) => v.type === 'high-failure-rate');
      expect(hfr).toBeDefined();
      expect(hfr!.explanation.rule).toBe('max-failure-rate');
      expect(hfr!.explanation.source).toBe('soma-policy');
    });

    it('does not emit when failure rate is acceptable', () => {
      const policy = mockPolicySource({ recentFailureRate: () => 0.2 });
      const graph = buildCompletedGraph();
      const violations = checkGuards(graph, { policySource: policy });

      expect(violations.find((v) => v.type === 'high-failure-rate')).toBeUndefined();
    });

    it('respects custom maxFailureRate threshold', () => {
      const policy = mockPolicySource({ recentFailureRate: () => 0.6 });
      const graph = buildCompletedGraph();

      const violations = checkGuards(graph, {
        policySource: policy,
        policyThresholds: { maxFailureRate: 0.8 },
      });

      expect(violations.find((v) => v.type === 'high-failure-rate')).toBeUndefined();
    });
  });

  describe('conformance-drift', () => {
    it('emits violation when conformance score is below threshold', () => {
      const policy = mockPolicySource({ lastConformanceScore: () => 0.5 });
      const graph = buildCompletedGraph();
      const violations = checkGuards(graph, { policySource: policy });

      const cd = violations.find((v) => v.type === 'conformance-drift');
      expect(cd).toBeDefined();
      expect(cd!.explanation.rule).toBe('min-conformance');
      expect(cd!.explanation.source).toBe('soma-policy');
    });

    it('does not emit when conformance score is null', () => {
      const policy = mockPolicySource({ lastConformanceScore: () => null });
      const graph = buildCompletedGraph();
      const violations = checkGuards(graph, { policySource: policy });

      expect(violations.find((v) => v.type === 'conformance-drift')).toBeUndefined();
    });

    it('does not emit when conformance is above threshold', () => {
      const policy = mockPolicySource({ lastConformanceScore: () => 0.9 });
      const graph = buildCompletedGraph();
      const violations = checkGuards(graph, { policySource: policy });

      expect(violations.find((v) => v.type === 'conformance-drift')).toBeUndefined();
    });

    it('respects custom minConformance threshold', () => {
      const policy = mockPolicySource({ lastConformanceScore: () => 0.5 });
      const graph = buildCompletedGraph();

      const violations = checkGuards(graph, {
        policySource: policy,
        policyThresholds: { minConformance: 0.3 },
      });

      expect(violations.find((v) => v.type === 'conformance-drift')).toBeUndefined();
    });
  });

  describe('known-bottleneck', () => {
    it('emits warning for running nodes that are known bottlenecks', () => {
      const policy = mockPolicySource({ isKnownBottleneck: (name) => name === 'fetch' });
      const graph = buildRunningGraph();
      const violations = checkGuards(graph, { policySource: policy });

      const kb = violations.find((v) => v.type === 'known-bottleneck');
      expect(kb).toBeDefined();
      expect(kb!.explanation.rule).toBe('known-bottleneck');
      expect(kb!.explanation.source).toBe('soma-policy');
    });

    it('does not emit for completed nodes', () => {
      const policy = mockPolicySource({ isKnownBottleneck: () => true });
      const graph = buildCompletedGraph(); // All nodes completed
      const violations = checkGuards(graph, { policySource: policy });

      expect(violations.find((v) => v.type === 'known-bottleneck')).toBeUndefined();
    });
  });

  describe('backward compatibility', () => {
    it('guards without policySource produce no policy violations', () => {
      const graph = buildCompletedGraph();
      const violations = checkGuards(graph);

      // Should only have standard violations (none for a simple completed graph)
      for (const v of violations) {
        expect(v.type).not.toBe('high-failure-rate');
        expect(v.type).not.toBe('conformance-drift');
        expect(v.type).not.toBe('known-bottleneck');
      }
    });
  });

  describe('end-to-end with real store', () => {
    it('full loop: store → policySource → adaptive guards', () => {
      const store = createKnowledgeStore({ baseDir: testDir });

      // Accumulate some failures
      for (let i = 0; i < 4; i++) store.append(createExecutionEvent(buildCompletedGraph()));
      for (let i = 0; i < 6; i++) store.append(createExecutionEvent(buildFailedGraph()));

      // Add bottleneck knowledge
      const graphs = [buildCompletedGraph()];
      store.append(
        createPatternEvent(
          'test-agent',
          discoverProcess(graphs),
          findVariants(graphs),
          getBottlenecks(graphs),
        ),
      );

      const policy = createPolicySource(store);

      // Guards should now detect high failure rate
      const graph = buildCompletedGraph();
      const violations = checkGuards(graph, { policySource: policy });

      const hfr = violations.find((v) => v.type === 'high-failure-rate');
      expect(hfr).toBeDefined();
      expect(hfr!.explanation.rule).toBe('max-failure-rate');
      expect(hfr!.explanation.source).toBe('soma-policy');
    });
  });
});
