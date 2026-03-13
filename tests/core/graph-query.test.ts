import type { ExecutionGraph } from '@agentflow/core';
import {
  createGraphBuilder,
  findWaitingOn,
  getChildren,
  getCriticalPath,
  getDepth,
  getDuration,
  getFailures,
  getHungNodes,
  getNode,
  getParent,
  getStats,
  getSubtree,
} from '@agentflow/core';
import { describe, expect, it } from 'vitest';

/** Deterministic counter-based ID generator for tests. */
function testIdGenerator(): () => string {
  let counter = 0;
  return () => {
    counter++;
    return `t_${String(counter).padStart(3, '0')}`;
  };
}

/**
 * Build the reference graph used across query tests:
 *
 * root-agent (completed)
 *   ├── tool-a (completed)
 *   ├── subagent-b (completed)
 *   │   ├── tool-b1 (completed)
 *   │   └── tool-b2 (failed)
 *   └── wait-c (timeout)
 *
 * IDs: t_001=graphId, t_002=root, t_003=tool-a, t_004=sub-b,
 *       t_005=tool-b1, t_006=tool-b2, t_007=wait-c
 */
function buildReferenceGraph(): ExecutionGraph {
  const builder = createGraphBuilder({
    idGenerator: testIdGenerator(),
    agentId: 'test-agent',
    trigger: 'unit-test',
  });

  const rootId = builder.startNode({ type: 'agent', name: 'root-agent' });

  // tool-a: completed
  const toolA = builder.startNode({ type: 'tool', name: 'tool-a', parentId: rootId });
  builder.endNode(toolA);

  // subagent-b with two nested tools
  const subB = builder.startNode({ type: 'subagent', name: 'subagent-b', parentId: rootId });
  const toolB1 = builder.startNode({ type: 'tool', name: 'tool-b1', parentId: subB });
  builder.endNode(toolB1);
  const toolB2 = builder.startNode({ type: 'tool', name: 'tool-b2', parentId: subB });
  builder.failNode(toolB2, 'assertion error');
  builder.endNode(subB);

  // wait-c: timeout
  const waitC = builder.startNode({ type: 'wait', name: 'wait-c', parentId: rootId });
  builder.endNode(waitC, 'timeout');

  // Add a waited_on edge for testing
  builder.addEdge(waitC, toolA, 'waited_on');

  builder.endNode(rootId);
  return builder.build();
}

describe('graph-query', () => {
  const graph = buildReferenceGraph();

  describe('getNode', () => {
    it('finds an existing node', () => {
      const node = getNode(graph, 't_002');
      expect(node).toBeDefined();
      expect(node!.name).toBe('root-agent');
    });

    it('returns undefined for non-existent node', () => {
      expect(getNode(graph, 'fake')).toBeUndefined();
    });
  });

  describe('getChildren', () => {
    it('returns direct children of root', () => {
      const children = getChildren(graph, 't_002');
      expect(children).toHaveLength(3);
      expect(children.map((c) => c.name)).toEqual(
        expect.arrayContaining(['tool-a', 'subagent-b', 'wait-c']),
      );
    });

    it('returns nested children of subagent', () => {
      const children = getChildren(graph, 't_004');
      expect(children).toHaveLength(2);
      expect(children.map((c) => c.name)).toEqual(expect.arrayContaining(['tool-b1', 'tool-b2']));
    });

    it('returns empty for leaf node', () => {
      expect(getChildren(graph, 't_003')).toHaveLength(0);
    });

    it('returns empty for non-existent node', () => {
      expect(getChildren(graph, 'fake')).toHaveLength(0);
    });
  });

  describe('getParent', () => {
    it('returns parent of a child node', () => {
      const parent = getParent(graph, 't_005');
      expect(parent).toBeDefined();
      expect(parent!.name).toBe('subagent-b');
    });

    it('returns undefined for root node', () => {
      expect(getParent(graph, 't_002')).toBeUndefined();
    });

    it('returns undefined for non-existent node', () => {
      expect(getParent(graph, 'fake')).toBeUndefined();
    });
  });

  describe('getFailures', () => {
    it('returns failed, hung, and timeout nodes', () => {
      const failures = getFailures(graph);
      const names = failures.map((n) => n.name);
      expect(names).toContain('tool-b2'); // failed
      expect(names).toContain('wait-c'); // timeout
      expect(failures).toHaveLength(2);
    });
  });

  describe('getHungNodes', () => {
    it('returns empty when no running nodes exist', () => {
      expect(getHungNodes(graph)).toHaveLength(0);
    });

    it('returns running nodes from an in-progress graph', () => {
      const builder = createGraphBuilder({ idGenerator: testIdGenerator() });
      const rootId = builder.startNode({ type: 'agent', name: 'root' });
      builder.startNode({ type: 'tool', name: 'stuck', parentId: rootId });
      const snapshot = builder.getSnapshot();

      const hung = getHungNodes(snapshot);
      expect(hung).toHaveLength(2); // root and stuck tool are both running
      expect(hung.map((n) => n.name)).toContain('stuck');
    });
  });

  describe('getCriticalPath', () => {
    it('returns the longest path from root to leaf', () => {
      const path = getCriticalPath(graph);
      expect(path.length).toBeGreaterThanOrEqual(1);
      expect(path[0]!.name).toBe('root-agent');
    });

    it('returns single node for single-node graph', () => {
      const builder = createGraphBuilder({ idGenerator: testIdGenerator() });
      const rootId = builder.startNode({ type: 'agent', name: 'solo' });
      builder.endNode(rootId);
      const solo = builder.build();

      const path = getCriticalPath(solo);
      expect(path).toHaveLength(1);
      expect(path[0]!.name).toBe('solo');
    });
  });

  describe('findWaitingOn', () => {
    it('finds waited_on dependencies', () => {
      const waiting = findWaitingOn(graph, 't_007'); // wait-c
      expect(waiting).toHaveLength(1);
      expect(waiting[0]!.name).toBe('tool-a');
    });

    it('returns empty when no waited_on edges', () => {
      expect(findWaitingOn(graph, 't_002')).toHaveLength(0);
    });
  });

  describe('getSubtree', () => {
    it('returns all descendants in BFS order', () => {
      const subtree = getSubtree(graph, 't_002');
      expect(subtree).toHaveLength(5); // all nodes except root
    });

    it('returns children of a subtree root', () => {
      const subtree = getSubtree(graph, 't_004');
      expect(subtree).toHaveLength(2);
      expect(subtree.map((n) => n.name)).toEqual(expect.arrayContaining(['tool-b1', 'tool-b2']));
    });

    it('returns empty for leaf node', () => {
      expect(getSubtree(graph, 't_003')).toHaveLength(0);
    });
  });

  describe('getDuration', () => {
    it('returns non-negative duration', () => {
      const duration = getDuration(graph);
      expect(duration).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getDepth', () => {
    it('returns correct depth for reference graph (depth 2)', () => {
      expect(getDepth(graph)).toBe(2); // root -> subagent-b -> tool-b1
    });

    it('returns 0 for single-node graph', () => {
      const builder = createGraphBuilder({ idGenerator: testIdGenerator() });
      const rootId = builder.startNode({ type: 'agent', name: 'solo' });
      builder.endNode(rootId);
      expect(getDepth(builder.build())).toBe(0);
    });
  });

  describe('getStats', () => {
    it('returns correct aggregate statistics', () => {
      const stats = getStats(graph);

      expect(stats.totalNodes).toBe(6);
      expect(stats.depth).toBe(2);
      expect(stats.duration).toBeGreaterThanOrEqual(0);
      expect(stats.failureCount).toBe(2); // tool-b2 (failed) + wait-c (timeout)
      expect(stats.hungCount).toBe(0);

      // By type
      expect(stats.byType.agent).toBe(1);
      expect(stats.byType.tool).toBe(3);
      expect(stats.byType.subagent).toBe(1);
      expect(stats.byType.wait).toBe(1);
      expect(stats.byType.decision).toBe(0);
      expect(stats.byType.custom).toBe(0);

      // By status
      expect(stats.byStatus.completed).toBe(4);
      expect(stats.byStatus.failed).toBe(1);
      expect(stats.byStatus.timeout).toBe(1);
      expect(stats.byStatus.running).toBe(0);
      expect(stats.byStatus.hung).toBe(0);
    });

    it('handles single-node graph', () => {
      const builder = createGraphBuilder({ idGenerator: testIdGenerator() });
      const rootId = builder.startNode({ type: 'agent', name: 'solo' });
      builder.endNode(rootId);
      const stats = getStats(builder.build());

      expect(stats.totalNodes).toBe(1);
      expect(stats.failureCount).toBe(0);
      expect(stats.depth).toBe(0);
    });
  });
});
