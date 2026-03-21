import type { ExecutionNode } from 'agentflow-core';
import { beforeEach, describe, expect, it } from 'vitest';
import { AgentStats } from '../../packages/dashboard/src/stats.js';
import type { WatchedTrace } from '../../packages/dashboard/src/watcher.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal WatchedTrace with Map nodes. */
function makeTrace(overrides: Partial<WatchedTrace> & { agentId: string }): WatchedTrace {
  const nodes = new Map<string, ExecutionNode>();
  nodes.set('root', {
    id: 'root',
    type: 'agent',
    name: 'test',
    startTime: overrides.startTime ?? 1000,
    endTime: (overrides.startTime ?? 1000) + 1000,
    status: overrides.status === 'failed' ? 'failed' : 'completed',
    parentId: null,
    children: [],
    metadata: {},
    state: {},
  });

  return {
    id: overrides.id ?? `trace-${Date.now()}-${Math.random()}`,
    rootNodeId: 'root',
    nodes,
    edges: [],
    startTime: overrides.startTime ?? 1000,
    endTime: (overrides.startTime ?? 1000) + 1000,
    status: overrides.status ?? 'completed',
    trigger: overrides.trigger ?? 'cron',
    agentId: overrides.agentId,
    events: [],
    filename: overrides.filename ?? `trace-${Math.random()}.json`,
    lastModified: overrides.lastModified,
    sourceType: overrides.sourceType ?? 'trace',
  } as WatchedTrace;
}

/** Build a trace with a failed node */
function makeFailedTrace(agentId: string, startTime: number): WatchedTrace {
  const nodes = new Map<string, ExecutionNode>();
  nodes.set('root', {
    id: 'root',
    type: 'agent',
    name: 'test',
    startTime,
    endTime: startTime + 1000,
    status: 'failed',
    parentId: null,
    children: ['tool1'],
    metadata: {},
    state: {},
  });
  nodes.set('tool1', {
    id: 'tool1',
    type: 'tool',
    name: 'broken-tool',
    startTime: startTime + 100,
    endTime: startTime + 500,
    status: 'failed',
    parentId: 'root',
    children: [],
    metadata: {},
    state: {},
  });

  return {
    id: `failed-${startTime}`,
    rootNodeId: 'root',
    nodes,
    edges: [],
    startTime,
    endTime: startTime + 1000,
    status: 'failed',
    trigger: 'cron',
    agentId,
    events: [],
    filename: `failed-${startTime}.json`,
  } as WatchedTrace;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AgentStats', () => {
  let stats: AgentStats;

  beforeEach(() => {
    stats = new AgentStats();
  });

  describe('processTrace', () => {
    it('correctly updates metrics for a successful trace', () => {
      const trace = makeTrace({ agentId: 'agent-a', startTime: 1000 });
      stats.processTrace(trace);

      const agent = stats.getAgentStats('agent-a');
      expect(agent).toBeDefined();
      expect(agent?.totalExecutions).toBe(1);
      expect(agent?.successfulExecutions).toBe(1);
      expect(agent?.failedExecutions).toBe(0);
      expect(agent?.successRate).toBe(100);
      expect(agent?.lastExecution).toBe(1000);
    });

    it('correctly updates metrics for a failed trace', () => {
      const trace = makeFailedTrace('agent-a', 1000);
      stats.processTrace(trace);

      const agent = stats.getAgentStats('agent-a');
      expect(agent).toBeDefined();
      expect(agent?.totalExecutions).toBe(1);
      expect(agent?.successfulExecutions).toBe(0);
      expect(agent?.failedExecutions).toBe(1);
      expect(agent?.successRate).toBe(0);
    });

    it('handles traces with Map nodes', () => {
      const trace = makeTrace({ agentId: 'map-agent', startTime: 1000 });
      expect(trace.nodes).toBeInstanceOf(Map);

      // Should not throw
      stats.processTrace(trace);
      const agent = stats.getAgentStats('map-agent');
      expect(agent).toBeDefined();
      expect(agent?.totalExecutions).toBe(1);
    });

    it('handles traces with object nodes (fallback path)', () => {
      // Simulate a trace where nodes is a plain object (legacy/broken format)
      // The analyzeExecution fallback catches errors from getStats and processes plain objects
      const trace = makeTrace({ agentId: 'obj-agent', startTime: 1000 });
      // Force nodes to be a plain object to trigger fallback
      (trace as WatchedTrace & { nodes: Record<string, ExecutionNode> }).nodes = {
        root: {
          id: 'root',
          type: 'agent',
          name: 'test',
          startTime: 1000,
          endTime: 2000,
          status: 'completed',
          parentId: null,
          children: [],
          metadata: {},
          state: {},
        },
      };

      stats.processTrace(trace);
      const agent = stats.getAgentStats('obj-agent');
      expect(agent).toBeDefined();
      expect(agent?.totalExecutions).toBe(1);
    });

    it('tracks triggers correctly', () => {
      stats.processTrace(
        makeTrace({ agentId: 'a', trigger: 'cron', filename: 'f1.json', startTime: 1000 }),
      );
      stats.processTrace(
        makeTrace({ agentId: 'a', trigger: 'message', filename: 'f2.json', startTime: 2000 }),
      );
      stats.processTrace(
        makeTrace({ agentId: 'a', trigger: 'cron', filename: 'f3.json', startTime: 3000 }),
      );

      const agent = stats.getAgentStats('a');
      expect(agent?.triggers.cron).toBe(2);
      expect(agent?.triggers.message).toBe(1);
    });
  });

  describe('duplicate trace prevention', () => {
    it('prevents processing the same trace twice (same filename + startTime)', () => {
      const trace = makeTrace({ agentId: 'agent-a', filename: 'same.json', startTime: 1000 });
      stats.processTrace(trace);
      stats.processTrace(trace);

      const agent = stats.getAgentStats('agent-a');
      expect(agent?.totalExecutions).toBe(1);
    });

    it('allows different traces with different keys', () => {
      stats.processTrace(
        makeTrace({ agentId: 'agent-a', filename: 'file1.json', startTime: 1000 }),
      );
      stats.processTrace(
        makeTrace({ agentId: 'agent-a', filename: 'file2.json', startTime: 2000 }),
      );

      const agent = stats.getAgentStats('agent-a');
      expect(agent?.totalExecutions).toBe(2);
    });
  });

  describe('getGlobalStats', () => {
    it('returns correct aggregations', () => {
      stats.processTrace(makeTrace({ agentId: 'a', filename: 'a1.json', startTime: 1000 }));
      stats.processTrace(makeTrace({ agentId: 'a', filename: 'a2.json', startTime: 2000 }));
      stats.processTrace(makeTrace({ agentId: 'b', filename: 'b1.json', startTime: 3000 }));
      stats.processTrace(makeFailedTrace('b', 4000));

      const global = stats.getGlobalStats();
      expect(global.totalAgents).toBe(2);
      expect(global.totalExecutions).toBe(4);
      // 3 successful, 1 failed
      expect(global.globalSuccessRate).toBe(75);
    });

    it('returns empty stats when no traces processed', () => {
      const global = stats.getGlobalStats();
      expect(global.totalAgents).toBe(0);
      expect(global.totalExecutions).toBe(0);
      expect(global.globalSuccessRate).toBe(0);
      expect(global.activeAgents).toBe(0);
      expect(global.topAgents).toEqual([]);
    });

    it('includes recent activity sorted by timestamp', () => {
      stats.processTrace(makeTrace({ agentId: 'a', filename: 'a1.json', startTime: 1000 }));
      stats.processTrace(makeTrace({ agentId: 'b', filename: 'b1.json', startTime: 3000 }));
      stats.processTrace(makeTrace({ agentId: 'a', filename: 'a2.json', startTime: 2000 }));

      const global = stats.getGlobalStats();
      expect(global.recentActivity.length).toBe(3);
      // Should be sorted descending by timestamp
      expect(global.recentActivity[0].timestamp).toBeGreaterThanOrEqual(
        global.recentActivity[1].timestamp,
      );
      expect(global.recentActivity[1].timestamp).toBeGreaterThanOrEqual(
        global.recentActivity[2].timestamp,
      );
    });
  });

  describe('getAgentsList', () => {
    it('returns agents sorted by last execution descending', () => {
      stats.processTrace(
        makeTrace({ agentId: 'old-agent', filename: 'old.json', startTime: 1000 }),
      );
      stats.processTrace(
        makeTrace({ agentId: 'new-agent', filename: 'new.json', startTime: 5000 }),
      );
      stats.processTrace(
        makeTrace({ agentId: 'mid-agent', filename: 'mid.json', startTime: 3000 }),
      );

      const list = stats.getAgentsList();
      expect(list.length).toBe(3);
      expect(list[0].agentId).toBe('new-agent');
      expect(list[1].agentId).toBe('mid-agent');
      expect(list[2].agentId).toBe('old-agent');
    });
  });

  describe('getAgentStats', () => {
    it('returns undefined for unknown agent', () => {
      expect(stats.getAgentStats('nonexistent')).toBeUndefined();
    });

    it('returns correct per-agent metrics', () => {
      stats.processTrace(
        makeTrace({ agentId: 'x', filename: 'x1.json', startTime: 1000, trigger: 'cron' }),
      );
      stats.processTrace(
        makeTrace({ agentId: 'x', filename: 'x2.json', startTime: 2000, trigger: 'message' }),
      );
      stats.processTrace(makeFailedTrace('x', 3000));

      const agent = stats.getAgentStats('x');
      expect(agent).toBeDefined();
      expect(agent?.agentId).toBe('x');
      expect(agent?.totalExecutions).toBe(3);
      expect(agent?.successfulExecutions).toBe(2);
      expect(agent?.failedExecutions).toBe(1);
      expect(agent?.successRate).toBeCloseTo(66.67, 0);
      expect(agent?.lastExecution).toBe(3000);
      expect(agent?.recentActivity.length).toBe(3);
    });
  });

  describe('success rate calculation', () => {
    it('calculates 100% for all successful', () => {
      stats.processTrace(makeTrace({ agentId: 'a', filename: 'f1.json', startTime: 1000 }));
      stats.processTrace(makeTrace({ agentId: 'a', filename: 'f2.json', startTime: 2000 }));

      expect(stats.getAgentStats('a')?.successRate).toBe(100);
    });

    it('calculates 0% for all failed', () => {
      stats.processTrace(makeFailedTrace('a', 1000));
      stats.processTrace(makeFailedTrace('a', 2000));

      expect(stats.getAgentStats('a')?.successRate).toBe(0);
    });

    it('calculates 50% for mixed', () => {
      stats.processTrace(makeTrace({ agentId: 'a', filename: 'ok.json', startTime: 1000 }));
      stats.processTrace(makeFailedTrace('a', 2000));

      expect(stats.getAgentStats('a')?.successRate).toBe(50);
    });
  });

  describe('active agents detection', () => {
    it('detects agents active within the last hour', () => {
      const now = Date.now();
      stats.processTrace(
        makeTrace({ agentId: 'active', filename: 'recent.json', startTime: now - 1000 }),
      );
      stats.processTrace(
        makeTrace({
          agentId: 'inactive',
          filename: 'old.json',
          startTime: now - 2 * 60 * 60 * 1000,
        }),
      );

      const global = stats.getGlobalStats();
      expect(global.activeAgents).toBe(1);
    });

    it('returns zero when no agents are active', () => {
      const longAgo = Date.now() - 3 * 60 * 60 * 1000;
      stats.processTrace(makeTrace({ agentId: 'a', filename: 'old.json', startTime: longAgo }));

      const global = stats.getGlobalStats();
      expect(global.activeAgents).toBe(0);
    });
  });

  describe('recent activity tracking', () => {
    it('limits recent activity to 100 entries per agent', () => {
      for (let i = 0; i < 110; i++) {
        stats.processTrace(
          makeTrace({
            agentId: 'busy',
            filename: `f${i}.json`,
            startTime: i * 1000,
          }),
        );
      }

      const agent = stats.getAgentStats('busy');
      expect(agent?.recentActivity.length).toBeLessThanOrEqual(100);
    });

    it('recent activity is sorted by timestamp descending', () => {
      stats.processTrace(makeTrace({ agentId: 'a', filename: 'f1.json', startTime: 1000 }));
      stats.processTrace(makeTrace({ agentId: 'a', filename: 'f2.json', startTime: 3000 }));
      stats.processTrace(makeTrace({ agentId: 'a', filename: 'f3.json', startTime: 2000 }));

      const agent = stats.getAgentStats('a');
      const timestamps = agent?.recentActivity.map((a) => a.timestamp);
      for (let i = 1; i < timestamps.length; i++) {
        expect(timestamps[i - 1]).toBeGreaterThanOrEqual(timestamps[i]);
      }
    });
  });

  describe('cleanup', () => {
    it('removes agents with lastExecution older than 7 days', () => {
      const sevenDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
      const recent = Date.now() - 1000;

      stats.processTrace(
        makeTrace({ agentId: 'stale', filename: 'stale.json', startTime: sevenDaysAgo }),
      );
      stats.processTrace(
        makeTrace({ agentId: 'fresh', filename: 'fresh.json', startTime: recent }),
      );

      expect(stats.getAgentsList().length).toBe(2);

      stats.cleanup();

      const remaining = stats.getAgentsList();
      expect(remaining.length).toBe(1);
      expect(remaining[0].agentId).toBe('fresh');
    });

    it('removes old recent activity entries within surviving agents', () => {
      const now = Date.now();
      const eightDaysAgo = now - 8 * 24 * 60 * 60 * 1000;

      stats.processTrace(
        makeTrace({ agentId: 'mixed', filename: 'old.json', startTime: eightDaysAgo }),
      );
      stats.processTrace(makeTrace({ agentId: 'mixed', filename: 'new.json', startTime: now }));

      stats.cleanup();

      const agent = stats.getAgentStats('mixed');
      expect(agent).toBeDefined();
      // The old activity entry should have been removed
      expect(agent?.recentActivity.every((a) => a.timestamp > eightDaysAgo)).toBe(true);
    });
  });
});
