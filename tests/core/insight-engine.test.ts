import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import type { AnalysisFn, ExecutionEvent, InsightEvent } from 'agentflow-core';
import {
  createExecutionEvent,
  createGraphBuilder,
  createInsightEngine,
  createKnowledgeStore,
  createPatternEvent,
  discoverProcess,
  findVariants,
  getBottlenecks,
} from 'agentflow-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let testDir: string;

beforeEach(() => {
  testDir = join(tmpdir(), `ie-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

function testIdGenerator(): () => string {
  let counter = 0;
  return () => {
    counter++;
    return `ie_${String(counter).padStart(3, '0')}`;
  };
}

function buildCompletedGraph(agentId = 'test-agent') {
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

function buildFailedGraph(agentId = 'test-agent') {
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
    metadata: { error: 'timeout' },
  });
  builder.failNode(tool, 'timeout');
  builder.endNode(root, 'failed');
  return builder.build();
}

function seedStore(baseDir: string) {
  const store = createKnowledgeStore({ baseDir });

  // Seed some completed events
  for (let i = 0; i < 5; i++) {
    store.append(createExecutionEvent(buildCompletedGraph()));
  }
  // Seed some failed events
  for (let i = 0; i < 3; i++) {
    store.append(createExecutionEvent(buildFailedGraph()));
  }

  // Seed a pattern event
  const graphs = [];
  for (let i = 0; i < 5; i++) {
    graphs.push(buildCompletedGraph());
  }
  const model = discoverProcess(graphs);
  const variants = findVariants(graphs);
  const bottlenecks = getBottlenecks(graphs);
  store.append(createPatternEvent('test-agent', model, variants, bottlenecks));

  return store;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('InsightEngine', () => {
  describe('creation', () => {
    it('creates an engine with all methods', () => {
      const store = createKnowledgeStore({ baseDir: testDir });
      const fn: AnalysisFn = async () => 'response';
      const engine = createInsightEngine(store, fn);

      expect(typeof engine.explainFailures).toBe('function');
      expect(typeof engine.explainAnomaly).toBe('function');
      expect(typeof engine.summarizeAgent).toBe('function');
      expect(typeof engine.suggestFixes).toBe('function');
    });
  });

  describe('explainFailures', () => {
    it('calls analysisFn and returns insight for agent with failures', async () => {
      const store = seedStore(testDir);
      const fn = vi.fn<AnalysisFn>(async () => 'The failures are caused by network timeouts.');
      const engine = createInsightEngine(store, fn);

      const result = await engine.explainFailures('test-agent');
      expect(result.agentId).toBe('test-agent');
      expect(result.insightType).toBe('failure-analysis');
      expect(result.content).toBe('The failures are caused by network timeouts.');
      expect(result.cached).toBe(false);
      expect(fn).toHaveBeenCalledOnce();
    });

    it('returns no-data message for unknown agent', async () => {
      const store = createKnowledgeStore({ baseDir: testDir });
      const fn = vi.fn<AnalysisFn>(async () => 'response');
      const engine = createInsightEngine(store, fn);

      const result = await engine.explainFailures('unknown');
      expect(result.content).toContain('No data available');
      expect(result.cached).toBe(false);
      expect(fn).not.toHaveBeenCalled();
    });

    it('returns no-failures message for agent with only successes', async () => {
      const store = createKnowledgeStore({ baseDir: testDir });
      for (let i = 0; i < 3; i++) {
        store.append(createExecutionEvent(buildCompletedGraph()));
      }
      const fn = vi.fn<AnalysisFn>(async () => 'response');
      const engine = createInsightEngine(store, fn);

      const result = await engine.explainFailures('test-agent');
      expect(result.content).toContain('No recent failures');
      expect(fn).not.toHaveBeenCalled();
    });

    it('caches insight and returns from cache on second call', async () => {
      const store = seedStore(testDir);
      const fn = vi.fn<AnalysisFn>(async () => 'Analysis result');
      const engine = createInsightEngine(store, fn);

      const result1 = await engine.explainFailures('test-agent');
      expect(result1.cached).toBe(false);

      const result2 = await engine.explainFailures('test-agent');
      expect(result2.cached).toBe(true);
      expect(result2.content).toBe('Analysis result');
      expect(fn).toHaveBeenCalledOnce();
    });

    it('stores insight event in knowledge store', async () => {
      const store = seedStore(testDir);
      const fn: AnalysisFn = async () => 'Stored insight';
      const engine = createInsightEngine(store, fn);

      await engine.explainFailures('test-agent');

      const insights = store.getRecentInsights('test-agent', { type: 'failure-analysis' });
      expect(insights).toHaveLength(1);
      expect(insights[0]!.response).toBe('Stored insight');
      expect(insights[0]!.prompt).toContain('Failure');
    });
  });

  describe('explainAnomaly', () => {
    it('analyzes a specific event', async () => {
      const store = seedStore(testDir);
      const fn = vi.fn<AnalysisFn>(async () => 'This event deviated due to slow network.');
      const engine = createInsightEngine(store, fn);

      const event = createExecutionEvent(buildFailedGraph());
      const result = await engine.explainAnomaly('test-agent', event);
      expect(result.insightType).toBe('anomaly-explanation');
      expect(result.content).toBe('This event deviated due to slow network.');
      expect(fn).toHaveBeenCalledOnce();
    });

    it('returns no-data for unknown agent', async () => {
      const store = createKnowledgeStore({ baseDir: testDir });
      const fn = vi.fn<AnalysisFn>(async () => 'response');
      const engine = createInsightEngine(store, fn);

      const event = createExecutionEvent(buildFailedGraph());
      const result = await engine.explainAnomaly('unknown', event);
      expect(result.content).toContain('No data available');
      expect(fn).not.toHaveBeenCalled();
    });
  });

  describe('summarizeAgent', () => {
    it('generates a summary using profile, events, and patterns', async () => {
      const store = seedStore(testDir);
      const fn = vi.fn<AnalysisFn>(async () => 'Agent is mostly healthy with occasional timeouts.');
      const engine = createInsightEngine(store, fn);

      const result = await engine.summarizeAgent('test-agent');
      expect(result.insightType).toBe('agent-summary');
      expect(result.content).toBe('Agent is mostly healthy with occasional timeouts.');
      expect(fn).toHaveBeenCalledOnce();
    });

    it('returns no-data for unknown agent', async () => {
      const store = createKnowledgeStore({ baseDir: testDir });
      const fn = vi.fn<AnalysisFn>(async () => 'response');
      const engine = createInsightEngine(store, fn);

      const result = await engine.summarizeAgent('unknown');
      expect(result.content).toContain('No data available');
      expect(fn).not.toHaveBeenCalled();
    });
  });

  describe('suggestFixes', () => {
    it('generates fix suggestions for agent with failures', async () => {
      const store = seedStore(testDir);
      const fn = vi.fn<AnalysisFn>(async () => '1. Add retry logic. 2. Increase timeout.');
      const engine = createInsightEngine(store, fn);

      const result = await engine.suggestFixes('test-agent');
      expect(result.insightType).toBe('fix-suggestion');
      expect(result.content).toBe('1. Add retry logic. 2. Increase timeout.');
      expect(fn).toHaveBeenCalledOnce();
    });

    it('returns healthy message for agent with no failures and no bottlenecks', async () => {
      const store = createKnowledgeStore({ baseDir: testDir });
      for (let i = 0; i < 3; i++) {
        store.append(createExecutionEvent(buildCompletedGraph()));
      }
      const fn = vi.fn<AnalysisFn>(async () => 'response');
      const engine = createInsightEngine(store, fn);

      const result = await engine.suggestFixes('test-agent');
      expect(result.content).toContain('healthy');
      expect(fn).not.toHaveBeenCalled();
    });
  });

  describe('data hash for cache identity', () => {
    it('produces different hash when new event is added', async () => {
      const store = seedStore(testDir);
      const fn = vi.fn<AnalysisFn>(async () => 'analysis');
      const engine = createInsightEngine(store, fn);

      await engine.explainFailures('test-agent');
      expect(fn).toHaveBeenCalledTimes(1);

      // Add a new failure event — data changes, hash should differ
      store.append(createExecutionEvent(buildFailedGraph()));

      await engine.explainFailures('test-agent');
      expect(fn).toHaveBeenCalledTimes(2); // Called again (cache miss due to new data)
    });
  });

  describe('cache TTL', () => {
    it('expired cache triggers new analysis', async () => {
      const store = seedStore(testDir);
      const fn = vi.fn<AnalysisFn>(async () => 'analysis');
      // Set TTL to 0ms so cache expires immediately
      const engine = createInsightEngine(store, fn, { cacheTtlMs: 0 });

      await engine.explainFailures('test-agent');
      await engine.explainFailures('test-agent');
      expect(fn).toHaveBeenCalledTimes(2); // No cache hit due to 0 TTL
    });
  });

  describe('error handling', () => {
    it('catches analysisFn errors and returns error message', async () => {
      const store = seedStore(testDir);
      const fn: AnalysisFn = async () => { throw new Error('LLM quota exceeded'); };
      const engine = createInsightEngine(store, fn);

      const result = await engine.explainFailures('test-agent');
      expect(result.content).toBe('Analysis failed: LLM quota exceeded');
      expect(result.cached).toBe(false);
    });

    it('does not cache failed analyses', async () => {
      const store = seedStore(testDir);
      const fn: AnalysisFn = async () => { throw new Error('LLM quota exceeded'); };
      const engine = createInsightEngine(store, fn);

      await engine.explainFailures('test-agent');

      const insights = store.getRecentInsights('test-agent', { type: 'failure-analysis' });
      expect(insights).toHaveLength(0);
    });

    it('handles non-Error throws', async () => {
      const store = seedStore(testDir);
      const fn: AnalysisFn = async () => { throw 'string error'; };
      const engine = createInsightEngine(store, fn);

      const result = await engine.explainFailures('test-agent');
      expect(result.content).toBe('Analysis failed: string error');
    });
  });
});
