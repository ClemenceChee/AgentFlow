import { createGraphBuilder } from '@agentflow/core';
import { describe, expect, it } from 'vitest';

/** Deterministic counter-based ID generator for tests. */
function testIdGenerator(): () => string {
  let counter = 0;
  return () => {
    counter++;
    return `test_${String(counter).padStart(3, '0')}`;
  };
}

describe('createGraphBuilder', () => {
  describe('basic construction', () => {
    it('creates a single-node graph', () => {
      const builder = createGraphBuilder({ idGenerator: testIdGenerator() });
      // test_001 = graphId, test_002 = rootNodeId
      const rootId = builder.startNode({ type: 'agent', name: 'main' });
      builder.endNode(rootId);
      const graph = builder.build();

      expect(graph.rootNodeId).toBe(rootId);
      expect(graph.nodes.size).toBe(1);
      expect(graph.status).toBe('completed');

      const root = graph.nodes.get(rootId);
      expect(root).toBeDefined();
      expect(root!.name).toBe('main');
      expect(root!.type).toBe('agent');
      expect(root!.status).toBe('completed');
      expect(root!.endTime).not.toBeNull();
    });

    it('establishes parent-child relationships', () => {
      const builder = createGraphBuilder({ idGenerator: testIdGenerator() });
      const rootId = builder.startNode({ type: 'agent', name: 'root' });
      const toolId = builder.startNode({ type: 'tool', name: 'search', parentId: rootId });
      builder.endNode(toolId);
      builder.endNode(rootId);
      const graph = builder.build();

      const root = graph.nodes.get(rootId)!;
      const tool = graph.nodes.get(toolId)!;

      expect(root.children).toContain(toolId);
      expect(tool.parentId).toBe(rootId);
      expect(
        graph.edges.some((e) => e.from === rootId && e.to === toolId && e.type === 'spawned'),
      ).toBe(true);
    });

    it('supports 3-level nesting with withParent', () => {
      const builder = createGraphBuilder({ idGenerator: testIdGenerator() });
      const rootId = builder.startNode({ type: 'agent', name: 'root' });

      let subId = '';
      let toolId = '';

      builder.withParent(rootId, () => {
        subId = builder.startNode({ type: 'subagent', name: 'sub' });
        builder.withParent(subId, () => {
          toolId = builder.startNode({ type: 'tool', name: 'deep-tool' });
          builder.endNode(toolId);
        });
        builder.endNode(subId);
      });

      builder.endNode(rootId);
      const graph = builder.build();

      expect(graph.nodes.size).toBe(3);
      const root = graph.nodes.get(rootId)!;
      const sub = graph.nodes.get(subId)!;
      const tool = graph.nodes.get(toolId)!;

      expect(root.children).toContain(subId);
      expect(sub.children).toContain(toolId);
      expect(tool.parentId).toBe(subId);
    });

    it('handles concurrent branches under the same parent', () => {
      const builder = createGraphBuilder({ idGenerator: testIdGenerator() });
      const rootId = builder.startNode({ type: 'agent', name: 'root' });
      const tool1 = builder.startNode({ type: 'tool', name: 'tool-a', parentId: rootId });
      const tool2 = builder.startNode({ type: 'tool', name: 'tool-b', parentId: rootId });
      builder.endNode(tool1);
      builder.endNode(tool2);
      builder.endNode(rootId);
      const graph = builder.build();

      const root = graph.nodes.get(rootId)!;
      expect(root.children).toHaveLength(2);
      expect(root.children).toContain(tool1);
      expect(root.children).toContain(tool2);
    });
  });

  describe('node failure', () => {
    it('fails a node with an Error object', () => {
      const builder = createGraphBuilder({ idGenerator: testIdGenerator() });
      const rootId = builder.startNode({ type: 'agent', name: 'root' });
      const toolId = builder.startNode({ type: 'tool', name: 'bad-tool', parentId: rootId });
      builder.failNode(toolId, new Error('connection timeout'));
      builder.endNode(rootId);
      const graph = builder.build();

      const tool = graph.nodes.get(toolId)!;
      expect(tool.status).toBe('failed');
      expect(tool.metadata.error).toBe('connection timeout');
      expect(tool.metadata.errorStack).toBeDefined();
      expect(graph.status).toBe('failed');
    });

    it('fails a node with a string error', () => {
      const builder = createGraphBuilder({ idGenerator: testIdGenerator() });
      const rootId = builder.startNode({ type: 'agent', name: 'root' });
      const toolId = builder.startNode({ type: 'tool', name: 'bad', parentId: rootId });
      builder.failNode(toolId, 'rate limit exceeded');
      builder.endNode(rootId);
      const graph = builder.build();

      const tool = graph.nodes.get(toolId)!;
      expect(tool.status).toBe('failed');
      expect(tool.metadata.error).toBe('rate limit exceeded');
      expect(tool.metadata.errorStack).toBeUndefined();
    });
  });

  describe('hung and running nodes', () => {
    it('leaves a hung node with running status', () => {
      const builder = createGraphBuilder({ idGenerator: testIdGenerator() });
      const rootId = builder.startNode({ type: 'agent', name: 'root' });
      builder.startNode({ type: 'tool', name: 'stuck', parentId: rootId });
      // deliberately never end the tool or root
      const graph = builder.build();

      expect(graph.status).toBe('running');
      expect(graph.endTime).toBeNull();
    });
  });

  describe('failed status priority', () => {
    it('failed status takes priority over running', () => {
      const builder = createGraphBuilder({ idGenerator: testIdGenerator() });
      const rootId = builder.startNode({ type: 'agent', name: 'root' });
      builder.startNode({ type: 'tool', name: 'running-tool', parentId: rootId });
      const failId = builder.startNode({ type: 'tool', name: 'failed-tool', parentId: rootId });
      builder.failNode(failId, 'boom');
      // root and running-tool never end
      const graph = builder.build();

      expect(graph.status).toBe('failed');
    });
  });

  describe('state and events', () => {
    it('updates node state via shallow merge', () => {
      const builder = createGraphBuilder({ idGenerator: testIdGenerator() });
      const rootId = builder.startNode({ type: 'agent', name: 'root' });
      builder.updateState(rootId, { count: 1 });
      builder.updateState(rootId, { count: 2, extra: 'value' });
      builder.endNode(rootId);
      const graph = builder.build();

      const root = graph.nodes.get(rootId)!;
      expect(root.state.count).toBe(2);
      expect(root.state.extra).toBe('value');
    });

    it('records events via pushEvent', () => {
      const builder = createGraphBuilder({ idGenerator: testIdGenerator() });
      const rootId = builder.startNode({ type: 'agent', name: 'root' });
      builder.pushEvent({ eventType: 'custom', nodeId: rootId, data: { key: 'value' } });
      builder.endNode(rootId);
      const graph = builder.build();

      const customEvents = graph.events.filter((e) => e.eventType === 'custom');
      expect(customEvents.length).toBeGreaterThanOrEqual(1);
      const pushed = customEvents.find((e) => e.data.key === 'value');
      expect(pushed).toBeDefined();
      expect(pushed!.nodeId).toBe(rootId);
    });

    it('records ordered event stream', () => {
      const builder = createGraphBuilder({ idGenerator: testIdGenerator() });
      const rootId = builder.startNode({ type: 'agent', name: 'root' });
      const toolId = builder.startNode({ type: 'tool', name: 'search', parentId: rootId });
      builder.endNode(toolId);
      builder.endNode(rootId);
      const graph = builder.build();

      // Events should be in order: agent_start(root), agent_start(tool), agent_end(tool), agent_end(root)
      expect(graph.events.length).toBeGreaterThanOrEqual(4);
      const eventTypes = graph.events.map((e) => e.eventType);
      expect(eventTypes[0]).toBe('agent_start');
      expect(eventTypes[1]).toBe('agent_start');
      expect(eventTypes[2]).toBe('agent_end');
      expect(eventTypes[3]).toBe('agent_end');
    });
  });

  describe('edges', () => {
    it('adds explicit edges between nodes', () => {
      const builder = createGraphBuilder({ idGenerator: testIdGenerator() });
      const rootId = builder.startNode({ type: 'agent', name: 'root' });
      const tool1 = builder.startNode({ type: 'tool', name: 'a', parentId: rootId });
      const tool2 = builder.startNode({ type: 'tool', name: 'b', parentId: rootId });
      builder.addEdge(tool1, tool2, 'waited_on');
      builder.endNode(tool1);
      builder.endNode(tool2);
      builder.endNode(rootId);
      const graph = builder.build();

      const waitEdge = graph.edges.find(
        (e) => e.from === tool1 && e.to === tool2 && e.type === 'waited_on',
      );
      expect(waitEdge).toBeDefined();
    });
  });

  describe('metadata', () => {
    it('passes metadata through to built node', () => {
      const builder = createGraphBuilder({ idGenerator: testIdGenerator() });
      const rootId = builder.startNode({
        type: 'agent',
        name: 'root',
        metadata: { model: 'gpt-4', temperature: 0.7 },
      });
      builder.endNode(rootId);
      const graph = builder.build();

      const root = graph.nodes.get(rootId)!;
      expect(root.metadata.model).toBe('gpt-4');
      expect(root.metadata.temperature).toBe(0.7);
    });
  });

  describe('ID generation', () => {
    it('uses counter-based IDs by default', () => {
      const builder = createGraphBuilder();
      const rootId = builder.startNode({ type: 'agent', name: 'root' });
      const toolId = builder.startNode({ type: 'tool', name: 'search', parentId: rootId });

      // graphId = node_001, rootId = node_002, toolId = node_003
      expect(builder.graphId).toBe('node_001');
      expect(rootId).toBe('node_002');
      expect(toolId).toBe('node_003');
    });

    it('accepts a custom ID generator', () => {
      const builder = createGraphBuilder({ idGenerator: testIdGenerator() });
      const rootId = builder.startNode({ type: 'agent', name: 'root' });
      expect(builder.graphId).toBe('test_001');
      expect(rootId).toBe('test_002');
    });
  });

  describe('config passthrough', () => {
    it('uses agentId and trigger from config', () => {
      const builder = createGraphBuilder({
        idGenerator: testIdGenerator(),
        agentId: 'portfolio-recon',
        trigger: 'cron-job',
      });
      const rootId = builder.startNode({ type: 'agent', name: 'root' });
      builder.endNode(rootId);
      const graph = builder.build();

      expect(graph.agentId).toBe('portfolio-recon');
      expect(graph.trigger).toBe('cron-job');
    });

    it('defaults agentId and trigger when not provided', () => {
      const builder = createGraphBuilder({ idGenerator: testIdGenerator() });
      const rootId = builder.startNode({ type: 'agent', name: 'root' });
      builder.endNode(rootId);
      const graph = builder.build();

      expect(graph.agentId).toBe('unknown');
      expect(graph.trigger).toBe('manual');
    });
  });

  describe('getSnapshot', () => {
    it('returns current state without finalising', () => {
      const builder = createGraphBuilder({ idGenerator: testIdGenerator() });
      const rootId = builder.startNode({ type: 'agent', name: 'root' });
      builder.startNode({ type: 'tool', name: 'tool-a', parentId: rootId });

      const snapshot = builder.getSnapshot();
      expect(snapshot.nodes.size).toBe(2);
      expect(snapshot.status).toBe('running');

      // Can still add more nodes after snapshot
      const tool2 = builder.startNode({ type: 'tool', name: 'tool-b', parentId: rootId });
      builder.endNode(tool2);

      const snapshot2 = builder.getSnapshot();
      expect(snapshot2.nodes.size).toBe(3);
    });

    it('snapshot is frozen', () => {
      const builder = createGraphBuilder({ idGenerator: testIdGenerator() });
      const rootId = builder.startNode({ type: 'agent', name: 'root' });
      builder.endNode(rootId);

      const snapshot = builder.getSnapshot();
      expect(Object.isFrozen(snapshot)).toBe(true);
    });
  });

  describe('Map-based nodes', () => {
    it('graph.nodes is a Map', () => {
      const builder = createGraphBuilder({ idGenerator: testIdGenerator() });
      const rootId = builder.startNode({ type: 'agent', name: 'root' });
      builder.endNode(rootId);
      const graph = builder.build();

      expect(graph.nodes).toBeInstanceOf(Map);
      expect(graph.nodes.get(rootId)).toBeDefined();
      expect(graph.nodes.size).toBe(1);
    });

    it('frozen Map is Object.frozen and node values are frozen', () => {
      const builder = createGraphBuilder({ idGenerator: testIdGenerator() });
      const rootId = builder.startNode({ type: 'agent', name: 'root' });
      builder.endNode(rootId);
      const graph = builder.build();

      // Map itself is frozen (prevents adding new properties)
      expect(Object.isFrozen(graph.nodes)).toBe(true);
      // Each node value inside the Map is deeply frozen
      const root = graph.nodes.get(rootId)!;
      expect(Object.isFrozen(root)).toBe(true);
      expect(Object.isFrozen(root.metadata)).toBe(true);
      expect(Object.isFrozen(root.children)).toBe(true);
    });
  });

  describe('immutability', () => {
    it('build() produces a deeply frozen graph', () => {
      const builder = createGraphBuilder({ idGenerator: testIdGenerator() });
      const rootId = builder.startNode({ type: 'agent', name: 'root' });
      builder.endNode(rootId);
      const graph = builder.build();

      expect(Object.isFrozen(graph)).toBe(true);
      expect(Object.isFrozen(graph.edges)).toBe(true);
      expect(Object.isFrozen(graph.events)).toBe(true);

      const root = graph.nodes.get(rootId)!;
      expect(Object.isFrozen(root)).toBe(true);
      expect(Object.isFrozen(root.children)).toBe(true);
      expect(Object.isFrozen(root.metadata)).toBe(true);
    });
  });

  describe('error handling', () => {
    it('throws when building with no nodes', () => {
      const builder = createGraphBuilder({ idGenerator: testIdGenerator() });
      expect(() => builder.build()).toThrow('cannot build a graph with no nodes');
    });

    it('throws when mutating after build', () => {
      const builder = createGraphBuilder({ idGenerator: testIdGenerator() });
      const rootId = builder.startNode({ type: 'agent', name: 'root' });
      builder.endNode(rootId);
      builder.build();

      expect(() => builder.startNode({ type: 'tool', name: 'late' })).toThrow(
        'cannot mutate after build()',
      );
    });

    it('throws when referencing non-existent parent', () => {
      const builder = createGraphBuilder({ idGenerator: testIdGenerator() });
      expect(() => builder.startNode({ type: 'tool', name: 'orphan', parentId: 'fake' })).toThrow(
        'does not exist',
      );
    });

    it('throws when ending an already-ended node', () => {
      const builder = createGraphBuilder({ idGenerator: testIdGenerator() });
      const rootId = builder.startNode({ type: 'agent', name: 'root' });
      builder.endNode(rootId);
      expect(() => builder.endNode(rootId)).toThrow('has already ended');
    });

    it('throws when pushEvent references non-existent node', () => {
      const builder = createGraphBuilder({ idGenerator: testIdGenerator() });
      builder.startNode({ type: 'agent', name: 'root' });
      expect(() => builder.pushEvent({ eventType: 'custom', nodeId: 'nope', data: {} })).toThrow(
        'does not exist',
      );
    });
  });
});
