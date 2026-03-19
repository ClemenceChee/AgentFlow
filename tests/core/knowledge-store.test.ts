import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import type { ExecutionEvent, ExecutionGraph, InsightEvent, PatternEvent } from 'agentflow-core';
import {
  createEventEmitter,
  createExecutionEvent,
  createGraphBuilder,
  createKnowledgeStore,
  createPatternEvent,
  discoverProcess,
  findVariants,
  getBottlenecks,
} from 'agentflow-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function testIdGenerator(): () => string {
  let counter = 0;
  return () => {
    counter++;
    return `ks_${String(counter).padStart(3, '0')}`;
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
    metadata: { error: 'timeout' },
  });
  builder.failNode(tool, 'timeout');
  builder.endNode(root, 'failed');
  return builder.build();
}

let testDir: string;

beforeEach(() => {
  testDir = join(tmpdir(), `ks-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('KnowledgeStore', () => {
  describe('creation', () => {
    it('creates a store with the given baseDir', () => {
      const store = createKnowledgeStore({ baseDir: testDir });
      expect(store.baseDir).toBe(testDir);
    });

    it('has all required methods', () => {
      const store = createKnowledgeStore({ baseDir: testDir });
      expect(typeof store.append).toBe('function');
      expect(typeof store.getRecentEvents).toBe('function');
      expect(typeof store.getAgentProfile).toBe('function');
      expect(typeof store.getPatternHistory).toBe('function');
      expect(typeof store.compact).toBe('function');
      expect(typeof store.write).toBe('function');
      expect(typeof store.writeEvent).toBe('function');
    });
  });

  describe('event persistence', () => {
    it('persists an execution event as a JSON file', () => {
      const store = createKnowledgeStore({ baseDir: testDir });
      const event = createExecutionEvent(buildCompletedGraph());
      store.append(event);

      const agentEventsDir = join(testDir, 'events', 'test-agent');
      expect(existsSync(agentEventsDir)).toBe(true);

      // Should have a date directory with one file
      const dateDirs = readdirSync(agentEventsDir);
      expect(dateDirs.length).toBe(1);
      const files = readdirSync(join(agentEventsDir, dateDirs[0]!));
      expect(files.length).toBe(1);
      expect(files[0]).toMatch(/^execution-completed-\d+-\d+\.json$/);
    });

    it('persists a pattern event in patterns directory', () => {
      const store = createKnowledgeStore({ baseDir: testDir });
      const graphs = [buildCompletedGraph()];
      const event = createPatternEvent('test-agent', discoverProcess(graphs), findVariants(graphs), getBottlenecks(graphs));
      store.append(event);

      const patternDir = join(testDir, 'patterns', 'test-agent');
      expect(existsSync(patternDir)).toBe(true);
      const files = readdirSync(patternDir);
      expect(files.length).toBe(1);
    });

    it('creates directories automatically', () => {
      const store = createKnowledgeStore({ baseDir: join(testDir, 'deep', 'nested') });
      expect(existsSync(join(testDir, 'deep', 'nested'))).toBe(false);
      store.append(createExecutionEvent(buildCompletedGraph()));
      expect(existsSync(join(testDir, 'deep', 'nested', 'events'))).toBe(true);
    });
  });

  describe('profile derivation', () => {
    it('creates a profile on first event', () => {
      const store = createKnowledgeStore({ baseDir: testDir });
      store.append(createExecutionEvent(buildCompletedGraph()));

      const profile = store.getAgentProfile('test-agent');
      expect(profile).not.toBeNull();
      expect(profile!.totalRuns).toBe(1);
      expect(profile!.successCount).toBe(1);
      expect(profile!.failureCount).toBe(0);
      expect(profile!.failureRate).toBe(0);
    });

    it('updates profile on subsequent events', () => {
      const store = createKnowledgeStore({ baseDir: testDir });
      store.append(createExecutionEvent(buildCompletedGraph()));
      store.append(createExecutionEvent(buildCompletedGraph()));
      store.append(createExecutionEvent(buildCompletedGraph()));

      const profile = store.getAgentProfile('test-agent');
      expect(profile!.totalRuns).toBe(3);
      expect(profile!.successCount).toBe(3);
      expect(profile!.recentDurations.length).toBe(3);
    });

    it('computes failure rate correctly', () => {
      const store = createKnowledgeStore({ baseDir: testDir });
      // 7 successes, 3 failures
      for (let i = 0; i < 7; i++) store.append(createExecutionEvent(buildCompletedGraph()));
      for (let i = 0; i < 3; i++) store.append(createExecutionEvent(buildFailedGraph()));

      const profile = store.getAgentProfile('test-agent');
      expect(profile!.failureRate).toBeCloseTo(0.3, 5);
      expect(profile!.successCount).toBe(7);
      expect(profile!.failureCount).toBe(3);
    });

    it('maintains rolling window of 100 durations', () => {
      const store = createKnowledgeStore({ baseDir: testDir });
      for (let i = 0; i < 110; i++) {
        store.append(createExecutionEvent(buildCompletedGraph()));
      }

      const profile = store.getAgentProfile('test-agent');
      expect(profile!.recentDurations.length).toBe(100);
    });

    it('accumulates bottlenecks from pattern events', () => {
      const store = createKnowledgeStore({ baseDir: testDir });
      const graphs = [buildCompletedGraph()];
      const event = createPatternEvent('test-agent', discoverProcess(graphs), findVariants(graphs), getBottlenecks(graphs));
      store.append(event);

      const profile = store.getAgentProfile('test-agent');
      expect(profile!.knownBottlenecks.length).toBeGreaterThan(0);
      expect(profile!.knownBottlenecks).toContain('main');
    });

    it('tracks conformance score from process context', () => {
      const store = createKnowledgeStore({ baseDir: testDir });
      const event = createExecutionEvent(buildCompletedGraph(), {
        processContext: { variant: 'A→B', conformanceScore: 0.85, isAnomaly: false },
      });
      store.append(event);

      const profile = store.getAgentProfile('test-agent');
      expect(profile!.lastConformanceScore).toBe(0.85);
    });
  });

  describe('getRecentEvents', () => {
    it('returns events sorted newest first', () => {
      const store = createKnowledgeStore({ baseDir: testDir });
      store.append(createExecutionEvent(buildCompletedGraph()));
      store.append(createExecutionEvent(buildCompletedGraph()));
      store.append(createExecutionEvent(buildCompletedGraph()));

      const events = store.getRecentEvents('test-agent');
      expect(events.length).toBe(3);
      expect(events[0]!.timestamp).toBeGreaterThanOrEqual(events[1]!.timestamp);
    });

    it('respects limit option', () => {
      const store = createKnowledgeStore({ baseDir: testDir });
      for (let i = 0; i < 10; i++) store.append(createExecutionEvent(buildCompletedGraph()));

      const events = store.getRecentEvents('test-agent', { limit: 3 });
      expect(events.length).toBe(3);
    });

    it('returns empty array for unknown agent', () => {
      const store = createKnowledgeStore({ baseDir: testDir });
      expect(store.getRecentEvents('nonexistent')).toEqual([]);
    });

    it('filters by since timestamp', () => {
      const store = createKnowledgeStore({ baseDir: testDir });
      store.append(createExecutionEvent(buildCompletedGraph()));

      const futureTimestamp = Date.now() + 100_000;
      const events = store.getRecentEvents('test-agent', { since: futureTimestamp });
      expect(events.length).toBe(0);
    });
  });

  describe('getAgentProfile', () => {
    it('returns null for nonexistent agent', () => {
      const store = createKnowledgeStore({ baseDir: testDir });
      expect(store.getAgentProfile('nonexistent')).toBeNull();
    });
  });

  describe('getPatternHistory', () => {
    it('returns pattern events sorted newest first', () => {
      const store = createKnowledgeStore({ baseDir: testDir });
      const graphs = [buildCompletedGraph()];
      const model = discoverProcess(graphs);
      const variants = findVariants(graphs);
      const bottlenecks = getBottlenecks(graphs);

      store.append(createPatternEvent('test-agent', model, variants, bottlenecks));
      store.append(createPatternEvent('test-agent', model, variants, bottlenecks));

      const history = store.getPatternHistory('test-agent');
      expect(history.length).toBe(2);
      expect(history[0]!.timestamp).toBeGreaterThanOrEqual(history[1]!.timestamp);
    });

    it('returns empty array for unknown agent', () => {
      const store = createKnowledgeStore({ baseDir: testDir });
      expect(store.getPatternHistory('nonexistent')).toEqual([]);
    });
  });

  describe('compact', () => {
    it('removes old event files', () => {
      const store = createKnowledgeStore({ baseDir: testDir });
      store.append(createExecutionEvent(buildCompletedGraph()));

      // Compact with a future timestamp should remove everything
      const result = store.compact({ olderThan: Date.now() + 100_000 });
      expect(result.removed).toBeGreaterThan(0);
    });

    it('preserves profiles', () => {
      const store = createKnowledgeStore({ baseDir: testDir });
      store.append(createExecutionEvent(buildCompletedGraph()));

      store.compact({ olderThan: Date.now() + 100_000 });

      // Profile should still exist
      const profile = store.getAgentProfile('test-agent');
      expect(profile).not.toBeNull();
    });
  });

  describe('EventWriter interface', () => {
    it('write() is a no-op', async () => {
      const store = createKnowledgeStore({ baseDir: testDir });
      await store.write(buildCompletedGraph());
      // No event files should be created
      expect(existsSync(join(testDir, 'events'))).toBe(false);
    });

    it('writeEvent() delegates to append', async () => {
      const store = createKnowledgeStore({ baseDir: testDir });
      await store.writeEvent(createExecutionEvent(buildCompletedGraph()));

      const profile = store.getAgentProfile('test-agent');
      expect(profile).not.toBeNull();
      expect(profile!.totalRuns).toBe(1);
    });

    it('works as an EventEmitter writer', async () => {
      const store = createKnowledgeStore({ baseDir: testDir });
      const emitter = createEventEmitter({ writers: [store] });

      await emitter.emit(createExecutionEvent(buildCompletedGraph()));

      const profile = store.getAgentProfile('test-agent');
      expect(profile!.totalRuns).toBe(1);
    });
  });

  describe('EventEmitter knowledgeStore integration', () => {
    it('auto-persists events to knowledge store', async () => {
      const store = createKnowledgeStore({ baseDir: testDir });
      const emitter = createEventEmitter({ knowledgeStore: store });

      await emitter.emit(createExecutionEvent(buildCompletedGraph()));
      await emitter.emit(createExecutionEvent(buildCompletedGraph()));

      const profile = store.getAgentProfile('test-agent');
      expect(profile!.totalRuns).toBe(2);
    });

    it('handles knowledge store errors via onError', async () => {
      const errors: unknown[] = [];
      // Use a store with an invalid baseDir that will fail on write
      const store = createKnowledgeStore({ baseDir: '/dev/null/impossible' });
      const emitter = createEventEmitter({
        knowledgeStore: store,
        onError: (err) => errors.push(err),
      });

      await emitter.emit(createExecutionEvent(buildCompletedGraph()));
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('insight persistence', () => {
    function makeInsightEvent(agentId = 'test-agent', type: InsightEvent['insightType'] = 'failure-analysis', ts = Date.now()): InsightEvent {
      return {
        eventType: 'insight.generated',
        agentId,
        timestamp: ts,
        schemaVersion: 1,
        insightType: type,
        prompt: 'test prompt',
        response: 'test response',
        dataHash: 'abc123',
      };
    }

    it('persists an insight event as a JSON file', () => {
      const store = createKnowledgeStore({ baseDir: testDir });
      const event = makeInsightEvent();
      store.appendInsight(event);

      const insightDir = join(testDir, 'insights', 'test-agent');
      expect(existsSync(insightDir)).toBe(true);
      const files = readdirSync(insightDir).filter(f => f.endsWith('.json'));
      expect(files).toHaveLength(1);
      expect(files[0]).toContain('failure-analysis');
    });

    it('persists multiple insights with distinct filenames', () => {
      const store = createKnowledgeStore({ baseDir: testDir });
      store.appendInsight(makeInsightEvent('test-agent', 'failure-analysis', 1000));
      store.appendInsight(makeInsightEvent('test-agent', 'failure-analysis', 1001));

      const insightDir = join(testDir, 'insights', 'test-agent');
      const files = readdirSync(insightDir).filter(f => f.endsWith('.json'));
      expect(files).toHaveLength(2);
    });

    it('reads back persisted insight content', () => {
      const store = createKnowledgeStore({ baseDir: testDir });
      const event = makeInsightEvent();
      store.appendInsight(event);

      const insightDir = join(testDir, 'insights', 'test-agent');
      const files = readdirSync(insightDir).filter(f => f.endsWith('.json'));
      const persisted = JSON.parse(readFileSync(join(insightDir, files[0]!), 'utf-8'));
      expect(persisted.insightType).toBe('failure-analysis');
      expect(persisted.response).toBe('test response');
      expect(persisted.dataHash).toBe('abc123');
    });
  });

  describe('insight querying', () => {
    function makeInsightEvent(agentId: string, type: InsightEvent['insightType'], ts: number): InsightEvent {
      return {
        eventType: 'insight.generated',
        agentId,
        timestamp: ts,
        schemaVersion: 1,
        insightType: type,
        prompt: `prompt-${ts}`,
        response: `response-${ts}`,
        dataHash: `hash-${ts}`,
      };
    }

    it('returns recent insights sorted newest first', () => {
      const store = createKnowledgeStore({ baseDir: testDir });
      store.appendInsight(makeInsightEvent('alfred', 'failure-analysis', 1000));
      store.appendInsight(makeInsightEvent('alfred', 'agent-summary', 2000));
      store.appendInsight(makeInsightEvent('alfred', 'fix-suggestion', 3000));

      const insights = store.getRecentInsights('alfred');
      expect(insights).toHaveLength(3);
      expect(insights[0]!.timestamp).toBe(3000);
      expect(insights[2]!.timestamp).toBe(1000);
    });

    it('filters by insight type', () => {
      const store = createKnowledgeStore({ baseDir: testDir });
      store.appendInsight(makeInsightEvent('alfred', 'failure-analysis', 1000));
      store.appendInsight(makeInsightEvent('alfred', 'agent-summary', 2000));
      store.appendInsight(makeInsightEvent('alfred', 'failure-analysis', 3000));

      const insights = store.getRecentInsights('alfred', { type: 'failure-analysis' });
      expect(insights).toHaveLength(2);
      for (const i of insights) {
        expect(i.insightType).toBe('failure-analysis');
      }
    });

    it('respects limit', () => {
      const store = createKnowledgeStore({ baseDir: testDir });
      for (let i = 0; i < 15; i++) {
        store.appendInsight(makeInsightEvent('alfred', 'failure-analysis', 1000 + i));
      }

      const insights = store.getRecentInsights('alfred', { limit: 5 });
      expect(insights).toHaveLength(5);
    });

    it('defaults limit to 10', () => {
      const store = createKnowledgeStore({ baseDir: testDir });
      for (let i = 0; i < 15; i++) {
        store.appendInsight(makeInsightEvent('alfred', 'failure-analysis', 1000 + i));
      }

      const insights = store.getRecentInsights('alfred');
      expect(insights).toHaveLength(10);
    });

    it('returns empty array for unknown agent', () => {
      const store = createKnowledgeStore({ baseDir: testDir });
      expect(store.getRecentInsights('nonexistent')).toEqual([]);
    });
  });

  describe('insight compaction', () => {
    it('removes insight files older than threshold', () => {
      const store = createKnowledgeStore({ baseDir: testDir });
      const oldEvent: InsightEvent = {
        eventType: 'insight.generated',
        agentId: 'alfred',
        timestamp: 1000,
        schemaVersion: 1,
        insightType: 'failure-analysis',
        prompt: 'old prompt',
        response: 'old response',
        dataHash: 'old-hash',
      };
      const newEvent: InsightEvent = {
        eventType: 'insight.generated',
        agentId: 'alfred',
        timestamp: 5000,
        schemaVersion: 1,
        insightType: 'agent-summary',
        prompt: 'new prompt',
        response: 'new response',
        dataHash: 'new-hash',
      };

      store.appendInsight(oldEvent);
      store.appendInsight(newEvent);

      const result = store.compact({ olderThan: 3000 });
      expect(result.removed).toBeGreaterThanOrEqual(1);

      const remaining = store.getRecentInsights('alfred');
      expect(remaining).toHaveLength(1);
      expect(remaining[0]!.timestamp).toBe(5000);
    });
  });
});
