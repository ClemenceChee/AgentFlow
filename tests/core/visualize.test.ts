/**
 * Tests for trace visualization (ASCII tree and timeline).
 */

import { describe, expect, it } from 'vitest';

import { createGraphBuilder } from '../../packages/core/src/graph-builder.js';
import type { ExecutionGraph } from '../../packages/core/src/types.js';
import { toAsciiTree, toTimeline } from '../../packages/core/src/visualize.js';

function createTestIdGenerator(): () => string {
  let counter = 0;
  return () => {
    counter++;
    return `test_${String(counter).padStart(3, '0')}`;
  };
}

describe('visualize', () => {
  describe('toAsciiTree', () => {
    it('should render a single node', () => {
      const builder = createGraphBuilder({
        agentId: 'test',
        idGenerator: createTestIdGenerator(),
      });
      const root = builder.startNode({ type: 'agent', name: 'main' });
      builder.endNode(root);
      const graph = builder.build();

      const tree = toAsciiTree(graph);
      expect(tree).toContain('\u2713'); // checkmark
      expect(tree).toContain('main');
      expect(tree).toContain('agent');
    });

    it('should render nested 3-level tree', () => {
      const builder = createGraphBuilder({
        agentId: 'test',
        idGenerator: createTestIdGenerator(),
      });
      const root = builder.startNode({ type: 'agent', name: 'root' });
      const child = builder.startNode({ type: 'subagent', name: 'planner', parentId: root });
      const tool = builder.startNode({ type: 'tool', name: 'search', parentId: child });
      builder.endNode(tool);
      builder.endNode(child);
      builder.endNode(root);
      const graph = builder.build();

      const tree = toAsciiTree(graph);
      expect(tree).toContain('root');
      expect(tree).toContain('planner');
      expect(tree).toContain('search');
      // Should have tree connectors
      expect(tree).toContain('\u2514\u2500'); // └─
    });

    it('should render concurrent siblings', () => {
      const builder = createGraphBuilder({
        agentId: 'test',
        idGenerator: createTestIdGenerator(),
      });
      const root = builder.startNode({ type: 'agent', name: 'root' });
      const t1 = builder.startNode({ type: 'tool', name: 'search', parentId: root });
      const t2 = builder.startNode({ type: 'tool', name: 'lookup', parentId: root });
      builder.endNode(t1);
      builder.endNode(t2);
      builder.endNode(root);
      const graph = builder.build();

      const tree = toAsciiTree(graph);
      expect(tree).toContain('search');
      expect(tree).toContain('lookup');
      // First sibling uses ├─, last uses └─
      expect(tree).toContain('\u251C\u2500'); // ├─
      expect(tree).toContain('\u2514\u2500'); // └─
    });

    it('should show correct icons for failed and hung nodes', () => {
      const builder = createGraphBuilder({
        agentId: 'test',
        idGenerator: createTestIdGenerator(),
      });
      const root = builder.startNode({ type: 'agent', name: 'root' });
      const failed = builder.startNode({ type: 'tool', name: 'broken', parentId: root });
      builder.failNode(failed, 'rate limit exceeded');
      builder.endNode(root);
      const graph = builder.build();

      const tree = toAsciiTree(graph);
      expect(tree).toContain('\u2717'); // ✗ for failed
      expect(tree).toContain('rate limit exceeded');
    });

    it('should show guard violations with warning marker', () => {
      const builder = createGraphBuilder({
        agentId: 'test',
        idGenerator: createTestIdGenerator(),
      });
      const root = builder.startNode({ type: 'agent', name: 'root' });
      // Add a guard violation event
      builder.pushEvent({
        eventType: 'custom',
        nodeId: root,
        data: { guardViolation: 'timeout', message: 'too slow' },
      });
      builder.endNode(root);
      const graph = builder.build();

      const tree = toAsciiTree(graph);
      expect(tree).toContain('\u26A0'); // ⚠
    });

    it('should show gen_ai attributes', () => {
      const builder = createGraphBuilder({
        agentId: 'test',
        idGenerator: createTestIdGenerator(),
      });
      const root = builder.startNode({
        type: 'agent',
        name: 'llm-call',
        metadata: {
          'gen_ai.request.model': 'gpt-4',
          'gen_ai.usage.prompt_tokens': 100,
          'gen_ai.usage.completion_tokens': 50,
        },
      });
      builder.endNode(root);
      const graph = builder.build();

      const tree = toAsciiTree(graph);
      expect(tree).toContain('gpt-4');
      expect(tree).toContain('150 tok');
    });

    it('should handle empty graph', () => {
      // Create a minimal graph then make a fake empty one
      const builder = createGraphBuilder({
        agentId: 'test',
        idGenerator: createTestIdGenerator(),
      });
      const root = builder.startNode({ type: 'agent', name: 'root' });
      builder.endNode(root);
      const graph = builder.build();

      const emptyGraph: ExecutionGraph = {
        ...graph,
        nodes: new Map(),
        rootNodeId: 'nonexistent',
      };

      const tree = toAsciiTree(emptyGraph);
      expect(tree).toBe('(empty graph)');
    });
  });

  describe('toTimeline', () => {
    it('should render a timeline for a simple graph', () => {
      const builder = createGraphBuilder({
        agentId: 'test',
        idGenerator: createTestIdGenerator(),
      });
      const root = builder.startNode({ type: 'agent', name: 'main' });
      const tool = builder.startNode({ type: 'tool', name: 'search', parentId: root });
      builder.endNode(tool);
      builder.endNode(root);
      const graph = builder.build();

      // Patch times to ensure non-zero duration
      const now = Date.now();
      const patched: ExecutionGraph = {
        ...graph,
        startTime: now - 5000,
        endTime: now,
        nodes: new Map(
          [...graph.nodes.entries()].map(([id, node]) => [
            id,
            { ...node, startTime: now - 5000, endTime: now },
          ]),
        ),
      };

      const timeline = toTimeline(patched);
      expect(timeline).toContain('main');
      expect(timeline).toContain('search');
      expect(timeline).toContain('\u2588'); // block char
    });

    it('should handle empty graph', () => {
      const builder = createGraphBuilder({
        agentId: 'test',
        idGenerator: createTestIdGenerator(),
      });
      const root = builder.startNode({ type: 'agent', name: 'root' });
      builder.endNode(root);
      const graph = builder.build();

      const emptyGraph: ExecutionGraph = {
        ...graph,
        nodes: new Map(),
        rootNodeId: 'nonexistent',
      };

      const timeline = toTimeline(emptyGraph);
      expect(timeline).toBe('(empty graph)');
    });

    it('should show status icons in timeline', () => {
      const builder = createGraphBuilder({
        agentId: 'test',
        idGenerator: createTestIdGenerator(),
      });
      const root = builder.startNode({ type: 'agent', name: 'root' });
      const tool = builder.startNode({ type: 'tool', name: 'broken', parentId: root });
      builder.failNode(tool, 'error');
      builder.endNode(root);
      const graph = builder.build();

      // Patch times to ensure non-zero duration
      const now = Date.now();
      const patched: ExecutionGraph = {
        ...graph,
        startTime: now - 5000,
        endTime: now,
        nodes: new Map(
          [...graph.nodes.entries()].map(([id, node]) => [
            id,
            { ...node, startTime: now - 5000, endTime: now },
          ]),
        ),
      };

      const timeline = toTimeline(patched);
      expect(timeline).toContain('\u2717'); // ✗ for failed
    });
  });
});
