import { createGraphBuilder, getStats, graphToJson, loadGraph } from 'agentflow-core';
import { describe, expect, it } from 'vitest';

function testIdGenerator(): () => string {
  let counter = 0;
  return () => {
    counter++;
    return `t_${String(counter).padStart(3, '0')}`;
  };
}

function buildSimpleGraph() {
  const builder = createGraphBuilder({
    idGenerator: testIdGenerator(),
    agentId: 'test-agent',
    trigger: 'unit-test',
  });
  const rootId = builder.startNode({ type: 'agent', name: 'root' });
  const toolId = builder.startNode({ type: 'tool', name: 'search', parentId: rootId });
  builder.endNode(toolId);
  builder.endNode(rootId);
  return builder.build();
}

describe('loadGraph', () => {
  it('round-trips through graphToJson', () => {
    const original = buildSimpleGraph();
    const json = graphToJson(original);
    const loaded = loadGraph(json);

    expect(loaded.agentId).toBe('test-agent');
    expect(loaded.trigger).toBe('unit-test');
    expect(loaded.nodes).toBeInstanceOf(Map);
    expect(loaded.nodes.size).toBe(2);

    const stats = getStats(loaded);
    expect(stats.totalNodes).toBe(2);
    expect(stats.failureCount).toBe(0);
  });

  it('round-trips through JSON string', () => {
    const original = buildSimpleGraph();
    const jsonString = JSON.stringify(graphToJson(original));
    const loaded = loadGraph(jsonString);

    expect(loaded.agentId).toBe('test-agent');
    expect(loaded.nodes).toBeInstanceOf(Map);
    expect(loaded.nodes.size).toBe(2);
  });

  it('handles nodes as a plain object (runner output format)', () => {
    const json = {
      id: 'g1',
      rootNodeId: 'n1',
      nodes: {
        n1: {
          id: 'n1',
          type: 'agent',
          name: 'root',
          startTime: 100,
          endTime: 200,
          status: 'completed',
          parentId: null,
          children: ['n2'],
          metadata: {},
          state: {},
        },
        n2: {
          id: 'n2',
          type: 'tool',
          name: 'fetch',
          startTime: 110,
          endTime: 190,
          status: 'completed',
          parentId: 'n1',
          children: [],
          metadata: {},
          state: {},
        },
      },
      edges: [{ from: 'n1', to: 'n2', type: 'spawned' }],
      startTime: 100,
      endTime: 200,
      status: 'completed',
      trigger: 'cron',
      agentId: 'my-agent',
      events: [],
    };

    const graph = loadGraph(json);
    expect(graph.nodes).toBeInstanceOf(Map);
    expect(graph.nodes.size).toBe(2);
    expect(graph.nodes.get('n1')?.name).toBe('root');
    expect(graph.nodes.get('n2')?.name).toBe('fetch');

    const stats = getStats(graph);
    expect(stats.totalNodes).toBe(2);
    expect(stats.byType.agent).toBe(1);
    expect(stats.byType.tool).toBe(1);
  });

  it('handles nodes as an array of [id, node] pairs', () => {
    const json = {
      id: 'g1',
      rootNodeId: 'n1',
      nodes: [
        [
          'n1',
          {
            id: 'n1',
            type: 'agent',
            name: 'root',
            startTime: 100,
            endTime: 200,
            status: 'completed',
            parentId: null,
            children: [],
            metadata: {},
            state: {},
          },
        ],
      ],
      edges: [],
      startTime: 100,
      endTime: 200,
      status: 'completed',
      trigger: 'manual',
      agentId: 'test',
      events: [],
    };

    const graph = loadGraph(json);
    expect(graph.nodes).toBeInstanceOf(Map);
    expect(graph.nodes.size).toBe(1);
    expect(graph.nodes.get('n1')?.name).toBe('root');
  });

  it('handles rootId alias for rootNodeId', () => {
    const json = {
      id: 'g1',
      rootId: 'n1',
      nodes: {
        n1: {
          id: 'n1',
          type: 'agent',
          name: 'root',
          startTime: 100,
          endTime: 200,
          status: 'completed',
          parentId: null,
          children: [],
          metadata: {},
          state: {},
        },
      },
      edges: [],
      startTime: 100,
      endTime: 200,
      status: 'completed',
      trigger: 'cron',
      agentId: 'test',
      events: [],
    };

    const graph = loadGraph(json);
    expect(graph.rootNodeId).toBe('n1');
  });

  it('provides defaults for missing optional fields', () => {
    const json = {
      nodes: {
        n1: {
          id: 'n1',
          type: 'agent',
          name: 'root',
          startTime: 100,
          endTime: 200,
          status: 'completed',
          parentId: null,
          children: [],
          metadata: {},
          state: {},
        },
      },
    };

    const graph = loadGraph(json);
    expect(graph.id).toBe('');
    expect(graph.trigger).toBe('unknown');
    expect(graph.agentId).toBe('unknown');
    expect(graph.edges).toEqual([]);
    expect(graph.events).toEqual([]);
  });
});

describe('graphToJson', () => {
  it('serializes nodes as a plain object', () => {
    const graph = buildSimpleGraph();
    const json = graphToJson(graph);

    expect(json.nodes).not.toBeInstanceOf(Map);
    expect(typeof json.nodes).toBe('object');
    expect(Object.keys(json.nodes as object)).toHaveLength(2);
  });

  it('preserves all graph metadata', () => {
    const graph = buildSimpleGraph();
    const json = graphToJson(graph);

    expect(json.agentId).toBe('test-agent');
    expect(json.trigger).toBe('unit-test');
    expect(json.traceId).toBeDefined();
    expect(json.spanId).toBeDefined();
  });
});
