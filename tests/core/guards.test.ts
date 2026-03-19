/**
 * Tests for runtime guards functionality.
 */

import { describe, expect, it, vi } from 'vitest';

import { createGraphBuilder } from '../../packages/core/src/graph-builder.js';
import type { GuardConfig } from '../../packages/core/src/guards.js';
import { checkGuards, withGuards } from '../../packages/core/src/guards.js';
import type { ExecutionGraph } from '../../packages/core/src/types.js';

/**
 * Helper to create deterministic IDs for testing.
 */
function createTestIdGenerator(): () => string {
  let counter = 0;
  return () => {
    counter++;
    return `test_${String(counter).padStart(3, '0')}`;
  };
}

/**
 * Create a simple healthy graph for testing.
 */
function createHealthyGraph(): ExecutionGraph {
  const builder = createGraphBuilder({
    agentId: 'test',
    idGenerator: createTestIdGenerator(),
  });

  const root = builder.startNode({ type: 'agent', name: 'main' });
  const tool = builder.startNode({ type: 'tool', name: 'search', parentId: root });
  builder.endNode(tool);
  builder.endNode(root);

  return builder.build();
}

/**
 * Create a graph with a long-running tool node by patching startTime.
 */
function createTimeoutGraph(): ExecutionGraph {
  const builder = createGraphBuilder({
    agentId: 'test',
    idGenerator: createTestIdGenerator(),
  });

  const root = builder.startNode({ type: 'agent', name: 'main' });
  const tool = builder.startNode({ type: 'tool', name: 'slow_search', parentId: root });

  // Get snapshot to create a modified graph with the tool still running
  // but with a backdated start time
  builder.endNode(root);
  const graph = builder.build();

  // Patch the tool node to have an old start time and still be running
  const toolNode = graph.nodes.get(tool)!;
  const modifiedNodes = new Map(graph.nodes);
  modifiedNodes.set(tool, {
    ...toolNode,
    startTime: Date.now() - 60_000, // 60s ago
    endTime: null,
    status: 'running',
  });

  return { ...graph, nodes: modifiedNodes } as ExecutionGraph;
}

/**
 * Create a graph with excessive depth (chain of nested agents).
 */
function createDeepGraph(depth: number): ExecutionGraph {
  const builder = createGraphBuilder({
    agentId: 'test',
    idGenerator: createTestIdGenerator(),
  });

  const ids: string[] = [];
  let parentId: string | undefined;

  for (let i = 0; i < depth; i++) {
    const id = builder.startNode({
      type: 'agent',
      name: `level_${i}`,
      parentId,
    });
    ids.push(id);
    parentId = id;
  }

  // End in reverse order
  for (let i = ids.length - 1; i >= 0; i--) {
    builder.endNode(ids[i]);
  }

  return builder.build();
}

/**
 * Create a graph with many agent/subagent nodes (flat, under root).
 */
function createSpawnExplosionGraph(agentCount: number): ExecutionGraph {
  const builder = createGraphBuilder({
    agentId: 'test',
    idGenerator: createTestIdGenerator(),
  });

  const root = builder.startNode({ type: 'agent', name: 'root' });

  for (let i = 0; i < agentCount - 1; i++) {
    const id = builder.startNode({
      type: i % 2 === 0 ? 'agent' : 'subagent',
      name: `worker_${i}`,
      parentId: root,
    });
    builder.endNode(id);
  }

  builder.endNode(root);
  return builder.build();
}

/**
 * Create a graph with a reasoning loop pattern:
 * root (agent) -> tool_0 -> tool_1 -> ... -> tool_N (chain of same-type nodes).
 */
function createReasoningLoopGraph(loopCount: number): ExecutionGraph {
  const builder = createGraphBuilder({
    agentId: 'test',
    idGenerator: createTestIdGenerator(),
  });

  const root = builder.startNode({ type: 'agent', name: 'main' });
  const ids: string[] = [root];

  let parentId = root;
  for (let i = 0; i < loopCount; i++) {
    const id = builder.startNode({
      type: 'tool',
      name: `search_attempt_${i}`,
      parentId,
    });
    ids.push(id);
    parentId = id;
  }

  // End in reverse
  for (let i = ids.length - 1; i >= 0; i--) {
    builder.endNode(ids[i]);
  }

  return builder.build();
}

describe('guards', () => {
  describe('checkGuards', () => {
    it('should return no violations for healthy graphs', () => {
      const graph = createHealthyGraph();
      const violations = checkGuards(graph);
      expect(violations).toHaveLength(0);
    });

    it('should detect timeout violations', () => {
      const graph = createTimeoutGraph();
      const config: GuardConfig = {
        timeouts: { tool: 30_000 },
      };

      const violations = checkGuards(graph, config);

      const timeoutViolations = violations.filter((v) => v.type === 'timeout');
      expect(timeoutViolations).toHaveLength(1);
      expect(timeoutViolations[0].message).toContain('exceeding timeout');
    });

    it('should detect spawn explosion by depth', () => {
      const graph = createDeepGraph(15); // Exceeds default max depth of 10

      const violations = checkGuards(graph);

      const depthViolations = violations.filter(
        (v) => v.type === 'spawn-explosion' && v.message.includes('depth'),
      );
      expect(depthViolations).toHaveLength(1);
      expect(depthViolations[0].message).toContain('exceeds maximum depth');
    });

    it('should detect spawn explosion by agent count', () => {
      const graph = createSpawnExplosionGraph(60); // Exceeds default max of 50

      const violations = checkGuards(graph);

      const countViolations = violations.filter(
        (v) => v.type === 'spawn-explosion' && v.message.includes('count'),
      );
      expect(countViolations).toHaveLength(1);
      expect(countViolations[0].message).toContain('agent/subagent count');
    });

    it('should detect reasoning loops', () => {
      const graph = createReasoningLoopGraph(30); // Exceeds default max of 25

      const violations = checkGuards(graph);

      const loopViolations = violations.filter((v) => v.type === 'reasoning-loop');
      expect(loopViolations).toHaveLength(1);
      expect(loopViolations[0].message).toContain('consecutive');
    });

    it('should respect custom config overrides', () => {
      const graph = createDeepGraph(8);
      const config: GuardConfig = {
        maxDepth: 5, // Lower than default
      };

      const violations = checkGuards(graph, config);

      const depthViolations = violations.filter((v) => v.type === 'spawn-explosion');
      expect(depthViolations).toHaveLength(1);
    });

    it('should not flag healthy graphs with custom thresholds', () => {
      // Create a small graph that is well within all limits
      const graph = createHealthyGraph();
      const config: GuardConfig = {
        maxReasoningSteps: 25,
        maxDepth: 10,
        maxAgentSpawns: 50,
      };

      const violations = checkGuards(graph, config);
      expect(violations).toHaveLength(0);
    });
  });

  describe('withGuards', () => {
    it('should create a builder with identical interface', () => {
      const builder = createGraphBuilder({ agentId: 'test' });
      const guarded = withGuards(builder);

      expect(typeof guarded.startNode).toBe('function');
      expect(typeof guarded.endNode).toBe('function');
      expect(typeof guarded.failNode).toBe('function');
      expect(typeof guarded.addEdge).toBe('function');
      expect(typeof guarded.pushEvent).toBe('function');
      expect(typeof guarded.updateState).toBe('function');
      expect(typeof guarded.withParent).toBe('function');
      expect(typeof guarded.getSnapshot).toBe('function');
      expect(typeof guarded.build).toBe('function');
      expect(guarded.graphId).toBe(builder.graphId);
      expect(guarded.traceContext).toEqual(builder.traceContext);
    });

    it('should warn on violations when onViolation is warn', () => {
      const logger = vi.fn();
      const builder = createGraphBuilder({
        agentId: 'test',
        idGenerator: createTestIdGenerator(),
      });
      const guarded = withGuards(builder, {
        maxAgentSpawns: 2,
        onViolation: 'warn',
        logger,
      });

      // 3 agents exceeds maxAgentSpawns of 2
      const root = guarded.startNode({ type: 'agent', name: 'root' });
      const child1 = guarded.startNode({ type: 'agent', name: 'child1', parentId: root });
      guarded.endNode(child1);
      const child2 = guarded.startNode({ type: 'agent', name: 'child2', parentId: root });
      guarded.endNode(child2); // 3 agents > 2, should trigger warning

      expect(logger).toHaveBeenCalledWith(expect.stringContaining('Guard violation'));
    });

    it('should push events when onViolation is error', () => {
      const logger = vi.fn();
      const builder = createGraphBuilder({
        agentId: 'test',
        idGenerator: createTestIdGenerator(),
      });
      const guarded = withGuards(builder, {
        maxAgentSpawns: 2,
        onViolation: 'error',
        logger,
      });

      const root = guarded.startNode({ type: 'agent', name: 'root' });
      const child1 = guarded.startNode({ type: 'agent', name: 'child1', parentId: root });
      guarded.endNode(child1);
      const child2 = guarded.startNode({ type: 'agent', name: 'child2', parentId: root });
      guarded.endNode(child2);

      expect(logger).toHaveBeenCalledWith(expect.stringContaining('Guard violation'));
      // Check that the graph has a guard violation event
      const snapshot = guarded.getSnapshot();
      const guardEvents = snapshot.events.filter(
        (e) => e.eventType === 'custom' && (e.data as Record<string, unknown>).guardViolation,
      );
      expect(guardEvents.length).toBeGreaterThan(0);
    });

    it('should throw when onViolation is abort', () => {
      const builder = createGraphBuilder({
        agentId: 'test',
        idGenerator: createTestIdGenerator(),
      });
      const guarded = withGuards(builder, {
        maxAgentSpawns: 2,
        onViolation: 'abort',
      });

      const root = guarded.startNode({ type: 'agent', name: 'root' });
      const child1 = guarded.startNode({ type: 'agent', name: 'child1', parentId: root });
      guarded.endNode(child1);
      const child2 = guarded.startNode({ type: 'agent', name: 'child2', parentId: root });

      expect(() => {
        guarded.endNode(child2);
      }).toThrow(/AgentFlow guard violation/);
    });

    it('should allow normal operation when no violations occur', () => {
      const builder = createGraphBuilder({
        agentId: 'test',
        idGenerator: createTestIdGenerator(),
      });
      const guarded = withGuards(builder);

      const root = guarded.startNode({ type: 'agent', name: 'main' });
      const tool = guarded.startNode({ type: 'tool', name: 'search', parentId: root });
      guarded.endNode(tool);
      guarded.endNode(root);

      const graph = guarded.build();
      expect(graph.nodes.size).toBe(2);
      expect(graph.status).toBe('completed');
    });

    it('should check violations on build', () => {
      const logger = vi.fn();
      const builder = createGraphBuilder({
        agentId: 'test',
        idGenerator: createTestIdGenerator(),
      });
      const guarded = withGuards(builder, {
        maxAgentSpawns: 2,
        onViolation: 'warn',
        logger,
      });

      const root = guarded.startNode({ type: 'agent', name: 'root' });
      const child1 = guarded.startNode({ type: 'agent', name: 'child1', parentId: root });
      guarded.endNode(child1);
      const child2 = guarded.startNode({ type: 'agent', name: 'child2', parentId: root });
      guarded.endNode(child2);
      guarded.endNode(root);

      // Logger was called during endNode, clear it
      logger.mockClear();

      // build() also checks — 3 agents > maxAgentSpawns 2
      guarded.build();
      expect(logger).toHaveBeenCalledWith(expect.stringContaining('Guard violation'));
    });
  });
});
