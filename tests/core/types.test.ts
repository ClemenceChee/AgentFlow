import type {
  Adapter,
  AgentFlowConfig,
  ExecutionGraph,
  GraphBuilder,
  GraphStats,
  NodeStatus,
  NodeType,
  TraceEventType,
  Writer,
} from 'agentflow-core';
import { describe, expect, it } from 'vitest';

describe('types', () => {
  it('NodeType includes all expected values including custom', () => {
    const types: NodeType[] = ['agent', 'tool', 'subagent', 'wait', 'decision', 'custom'];
    expect(types).toHaveLength(6);
  });

  it('TraceEventType includes adapter-friendly event types', () => {
    const events: TraceEventType[] = [
      'agent_start',
      'agent_end',
      'tool_start',
      'tool_end',
      'tool_error',
      'subagent_spawn',
      'decision',
      'timeout',
      'custom',
    ];
    expect(events).toHaveLength(9);
  });

  it('NodeStatus includes all lifecycle states', () => {
    const statuses: NodeStatus[] = ['running', 'completed', 'failed', 'hung', 'timeout'];
    expect(statuses).toHaveLength(5);
  });

  it('ExecutionGraph.nodes is typed as ReadonlyMap', () => {
    // Compile-time check: this function signature validates the Map type
    function acceptGraph(graph: ExecutionGraph): number {
      // .get and .size are Map methods, not Record methods
      const node = graph.nodes.get('any');
      return node ? 1 : graph.nodes.size;
    }
    expect(acceptGraph).toBeTypeOf('function');
  });

  it('AgentFlowConfig shape compiles with all optional fields', () => {
    const config: AgentFlowConfig = {
      agentId: 'test',
      trigger: 'manual',
      name: 'test-run',
      idGenerator: () => 'id',
      timeout: { default: 1000, tool: 500, agent: 5000 },
      logger: () => {},
      onError: () => {},
    };
    expect(config.agentId).toBe('test');
  });

  it('Writer interface compiles', () => {
    const writer: Writer = {
      write: async () => {},
    };
    expect(writer.write).toBeTypeOf('function');
  });

  it('Adapter interface compiles', () => {
    const adapter: Adapter = {
      name: 'test-adapter',
      attach: () => {},
      detach: () => {},
    };
    expect(adapter.name).toBe('test-adapter');
  });

  it('GraphStats shape is correct', () => {
    const stats: GraphStats = {
      totalNodes: 5,
      byStatus: { running: 0, completed: 4, failed: 1, hung: 0, timeout: 0 },
      byType: { agent: 1, tool: 2, subagent: 1, wait: 0, decision: 1, custom: 0 },
      depth: 2,
      duration: 100,
      failureCount: 1,
      hungCount: 0,
    };
    expect(stats.totalNodes).toBe(5);
  });

  it('GraphBuilder interface includes pushEvent and getSnapshot', () => {
    // Compile-time check: verify the interface shape
    function acceptBuilder(b: GraphBuilder): void {
      b.pushEvent({ eventType: 'custom', nodeId: 'x', data: {} });
      b.getSnapshot();
    }
    expect(acceptBuilder).toBeTypeOf('function');
  });
});
