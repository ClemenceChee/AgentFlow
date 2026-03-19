import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import type { ExecutionGraph } from 'agentflow-core';
import {
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
    return `ps_${String(counter).padStart(3, '0')}`;
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
  const tool = builder.startNode({ type: 'tool', name: 'fetch-data', parentId: root, metadata: { error: 'fail' } });
  builder.failNode(tool, 'fail');
  builder.endNode(root, 'failed');
  return builder.build();
}

let testDir: string;

beforeEach(() => {
  testDir = join(tmpdir(), `ps-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe('PolicySource', () => {
  describe('recentFailureRate', () => {
    it('returns 0 for unknown agent', () => {
      const store = createKnowledgeStore({ baseDir: testDir });
      const policy = createPolicySource(store);
      expect(policy.recentFailureRate('unknown')).toBe(0);
    });

    it('returns correct failure rate', () => {
      const store = createKnowledgeStore({ baseDir: testDir });
      for (let i = 0; i < 7; i++) store.append(createExecutionEvent(buildCompletedGraph()));
      for (let i = 0; i < 3; i++) store.append(createExecutionEvent(buildFailedGraph()));

      const policy = createPolicySource(store);
      expect(policy.recentFailureRate('test-agent')).toBeCloseTo(0.3, 5);
    });
  });

  describe('isKnownBottleneck', () => {
    it('returns false for unknown node', () => {
      const store = createKnowledgeStore({ baseDir: testDir });
      const policy = createPolicySource(store);
      expect(policy.isKnownBottleneck('novel-node')).toBe(false);
    });

    it('returns true for known bottleneck', () => {
      const store = createKnowledgeStore({ baseDir: testDir });
      const graphs = [buildCompletedGraph()];
      store.append(createPatternEvent('test-agent', discoverProcess(graphs), findVariants(graphs), getBottlenecks(graphs)));

      const policy = createPolicySource(store);
      expect(policy.isKnownBottleneck('main')).toBe(true);
      expect(policy.isKnownBottleneck('fetch')).toBe(true);
    });
  });

  describe('lastConformanceScore', () => {
    it('returns null for unknown agent', () => {
      const store = createKnowledgeStore({ baseDir: testDir });
      const policy = createPolicySource(store);
      expect(policy.lastConformanceScore('unknown')).toBeNull();
    });

    it('returns conformance score from profile', () => {
      const store = createKnowledgeStore({ baseDir: testDir });
      store.append(createExecutionEvent(buildCompletedGraph(), {
        processContext: { variant: 'A→B', conformanceScore: 0.85, isAnomaly: false },
      }));

      const policy = createPolicySource(store);
      expect(policy.lastConformanceScore('test-agent')).toBe(0.85);
    });
  });

  describe('getAgentProfile', () => {
    it('returns null for unknown agent', () => {
      const store = createKnowledgeStore({ baseDir: testDir });
      const policy = createPolicySource(store);
      expect(policy.getAgentProfile('unknown')).toBeNull();
    });

    it('returns full profile', () => {
      const store = createKnowledgeStore({ baseDir: testDir });
      store.append(createExecutionEvent(buildCompletedGraph()));

      const policy = createPolicySource(store);
      const profile = policy.getAgentProfile('test-agent');
      expect(profile).not.toBeNull();
      expect(profile!.agentId).toBe('test-agent');
    });
  });
});
