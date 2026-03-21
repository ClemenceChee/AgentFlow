import type { ExecutionGraph } from 'agentflow-core';
import { getTraceTree, groupByTraceId, stitchTrace } from 'agentflow-core';
import { describe, expect, it } from 'vitest';

function makeGraph(overrides: Partial<ExecutionGraph> = {}): ExecutionGraph {
  return {
    id: 'g1',
    agentId: 'test-agent',
    rootNodeId: 'root',
    nodes: new Map([
      [
        'root',
        {
          id: 'root',
          type: 'agent' as const,
          name: 'root',
          status: 'completed' as const,
          startTime: 1000,
          endTime: 2000,
          children: [],
          metadata: {},
        },
      ],
    ]),
    edges: [],
    events: [],
    startTime: 1000,
    endTime: 2000,
    status: 'completed' as const,
    trigger: 'test',
    ...overrides,
  };
}

describe('Graph Stitch', () => {
  describe('groupByTraceId', () => {
    it('groups graphs by traceId', () => {
      const g1 = makeGraph({ id: 'g1', traceId: 'trace-1' });
      const g2 = makeGraph({ id: 'g2', traceId: 'trace-1' });
      const g3 = makeGraph({ id: 'g3', traceId: 'trace-2' });

      const groups = groupByTraceId([g1, g2, g3]);
      expect(groups.size).toBe(2);
      expect(groups.get('trace-1')?.length).toBe(2);
      expect(groups.get('trace-2')?.length).toBe(1);
    });

    it('skips graphs without traceId', () => {
      const g1 = makeGraph({ id: 'g1' });
      const g2 = makeGraph({ id: 'g2', traceId: 'trace-1' });

      const groups = groupByTraceId([g1, g2]);
      expect(groups.size).toBe(1);
    });

    it('returns empty map for empty input', () => {
      expect(groupByTraceId([]).size).toBe(0);
    });
  });

  describe('stitchTrace', () => {
    it('throws on empty input', () => {
      expect(() => stitchTrace([])).toThrow('No graphs to stitch');
    });

    it('stitches a single graph', () => {
      const g = makeGraph({ traceId: 'trace-1', spanId: 'span-1' });
      const trace = stitchTrace([g]);

      expect(trace.traceId).toBe('trace-1');
      expect(trace.rootGraph).toBe(g);
      expect(trace.status).toBe('completed');
      expect(trace.startTime).toBe(1000);
      expect(trace.endTime).toBe(2000);
    });

    it('stitches parent-child graphs', () => {
      const parent = makeGraph({
        id: 'parent',
        traceId: 'trace-1',
        spanId: 'span-parent',
        startTime: 1000,
        endTime: 3000,
      });
      const child = makeGraph({
        id: 'child',
        traceId: 'trace-1',
        spanId: 'span-child',
        parentSpanId: 'span-parent',
        startTime: 1500,
        endTime: 2500,
      });

      const trace = stitchTrace([parent, child]);

      expect(trace.rootGraph).toBe(parent);
      expect(trace.graphs.size).toBe(2);
      expect(trace.childMap.get('span-parent')).toEqual(['span-child']);
      expect(trace.startTime).toBe(1000);
      expect(trace.endTime).toBe(3000);
    });

    it('aggregates failed status', () => {
      const g1 = makeGraph({
        traceId: 'trace-1',
        spanId: 'span-1',
        status: 'completed',
      });
      const g2 = makeGraph({
        traceId: 'trace-1',
        spanId: 'span-2',
        parentSpanId: 'span-1',
        status: 'failed',
      });

      const trace = stitchTrace([g1, g2]);
      expect(trace.status).toBe('failed');
    });

    it('aggregates running status', () => {
      const g1 = makeGraph({
        traceId: 'trace-1',
        spanId: 'span-1',
        status: 'completed',
      });
      const g2 = makeGraph({
        traceId: 'trace-1',
        spanId: 'span-2',
        parentSpanId: 'span-1',
        status: 'running',
        endTime: null as unknown as number,
      });

      const trace = stitchTrace([g1, g2]);
      expect(trace.status).toBe('running');
      expect(trace.endTime).toBeNull();
    });

    it('result is frozen', () => {
      const g = makeGraph({ traceId: 'trace-1', spanId: 'span-1' });
      const trace = stitchTrace([g]);
      expect(Object.isFrozen(trace)).toBe(true);
    });
  });

  describe('getTraceTree', () => {
    it('returns ordered tree of graphs', () => {
      const parent = makeGraph({
        traceId: 'trace-1',
        spanId: 'span-parent',
      });
      const child = makeGraph({
        traceId: 'trace-1',
        spanId: 'span-child',
        parentSpanId: 'span-parent',
      });

      const trace = stitchTrace([parent, child]);
      const tree = getTraceTree(trace);

      expect(tree.length).toBe(2);
      expect(tree[0]).toBe(parent);
      expect(tree[1]).toBe(child);
    });

    it('handles single graph without spanId', () => {
      const g = makeGraph({ traceId: 'trace-1' });
      const trace = stitchTrace([g]);
      const tree = getTraceTree(trace);

      expect(tree.length).toBe(1);
      expect(tree[0]).toBe(g);
    });
  });
});
