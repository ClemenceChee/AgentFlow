import { beforeEach, describe, expect, it } from 'vitest';
import { AgentStats } from '../../src/stats.js';
import { TestDataGenerator } from '../fixtures/test-data-generator.js';

describe('AgentStats', () => {
  let stats: AgentStats;

  beforeEach(() => {
    stats = new AgentStats();
    TestDataGenerator.resetCounters();
  });

  describe('trace processing', () => {
    it('should process a successful trace', () => {
      const trace = TestDataGenerator.createWatchedTrace({
        agentId: 'test-agent',
        nodeCount: 5,
        failureRate: 0,
        includeTimings: true,
      });

      stats.processTrace(trace);

      const agentMetrics = stats.getAgentStats('test-agent');
      expect(agentMetrics).toBeDefined();
      expect(agentMetrics?.totalExecutions).toBe(1);
      expect(agentMetrics?.successfulExecutions).toBe(1);
      expect(agentMetrics?.failedExecutions).toBe(0);
      expect(agentMetrics?.successRate).toBe(100);
    });

    it('should process a failed trace', () => {
      const trace = TestDataGenerator.createWatchedTrace({
        agentId: 'failing-agent',
        nodeCount: 3,
        failureRate: 1, // All nodes fail
      });

      stats.processTrace(trace);

      const agentMetrics = stats.getAgentStats('failing-agent');
      expect(agentMetrics).toBeDefined();
      expect(agentMetrics?.totalExecutions).toBe(1);
      expect(agentMetrics?.successfulExecutions).toBe(0);
      expect(agentMetrics?.failedExecutions).toBe(1);
      expect(agentMetrics?.successRate).toBe(0);
    });

    it('should calculate average execution time', () => {
      const trace1 = TestDataGenerator.createWatchedTrace({
        agentId: 'timed-agent',
        nodeCount: 2,
        includeTimings: true,
      });

      // Manually set execution times
      const nodes = Array.from(trace1.nodes.values());
      nodes[0].startTime = 1000;
      nodes[0].endTime = 3000; // 2 second duration
      trace1.startTime = 1000;
      trace1.endTime = 3000;

      const trace2 = TestDataGenerator.createWatchedTrace({
        agentId: 'timed-agent',
        nodeCount: 2,
        includeTimings: true,
      });

      // Second trace with 4 second duration
      const nodes2 = Array.from(trace2.nodes.values());
      nodes2[0].startTime = 10000;
      nodes2[0].endTime = 14000; // 4 second duration
      trace2.startTime = 10000;
      trace2.endTime = 14000;

      stats.processTrace(trace1);
      stats.processTrace(trace2);

      const agentMetrics = stats.getAgentStats('timed-agent');
      expect(agentMetrics?.avgExecutionTime).toBe(3000); // Average of 2000ms and 4000ms
    });

    it('should track trigger types', () => {
      const trace1 = TestDataGenerator.createWatchedTrace({
        agentId: 'trigger-agent',
        trigger: 'user-request',
      });

      const trace2 = TestDataGenerator.createWatchedTrace({
        agentId: 'trigger-agent',
        trigger: 'cron',
      });

      const trace3 = TestDataGenerator.createWatchedTrace({
        agentId: 'trigger-agent',
        trigger: 'user-request',
      });

      stats.processTrace(trace1);
      stats.processTrace(trace2);
      stats.processTrace(trace3);

      const agentMetrics = stats.getAgentStats('trigger-agent');
      expect(agentMetrics?.triggers['user-request']).toBe(2);
      expect(agentMetrics?.triggers.cron).toBe(1);
    });

    it('should track recent activity', () => {
      const baseTime = Date.now() - 10000;

      for (let i = 0; i < 5; i++) {
        const trace = TestDataGenerator.createWatchedTrace({
          agentId: 'activity-agent',
          failureRate: i % 2 === 0 ? 0 : 0.5, // Alternate success/failure
        });
        trace.startTime = baseTime + i * 1000;

        stats.processTrace(trace);
      }

      const agentMetrics = stats.getAgentStats('activity-agent');
      expect(agentMetrics?.recentActivity).toHaveLength(5);

      // Should be sorted by timestamp descending
      for (let i = 1; i < agentMetrics?.recentActivity.length; i++) {
        const current = agentMetrics?.recentActivity[i].timestamp;
        const previous = agentMetrics?.recentActivity[i - 1].timestamp;
        expect(current).toBeLessThanOrEqual(previous);
      }
    });

    it('should not process the same trace twice', () => {
      const trace = TestDataGenerator.createWatchedTrace({
        agentId: 'duplicate-agent',
      });

      stats.processTrace(trace);
      stats.processTrace(trace); // Process same trace again

      const agentMetrics = stats.getAgentStats('duplicate-agent');
      expect(agentMetrics?.totalExecutions).toBe(1); // Should only count once
    });

    it('should handle session traces with token usage', () => {
      const sessionTrace = TestDataGenerator.createSessionTrace({
        agentId: 'session-agent',
        provider: 'anthropic',
        model: 'claude-3-sonnet',
      });

      stats.processTrace(sessionTrace);

      const agentMetrics = stats.getAgentStats('session-agent');
      expect(agentMetrics).toBeDefined();
      expect(agentMetrics?.totalExecutions).toBe(1);
      expect(agentMetrics?.successfulExecutions).toBe(1);
    });
  });

  describe('agent statistics', () => {
    beforeEach(() => {
      // Create test data for multiple agents
      const agents = ['agent-A', 'agent-B', 'agent-C'];

      agents.forEach((agentId, index) => {
        for (let i = 0; i < (index + 1) * 2; i++) {
          const trace = TestDataGenerator.createWatchedTrace({
            agentId,
            nodeCount: Math.floor(Math.random() * 5) + 2,
            failureRate: index === 2 ? 0.3 : 0.1, // agent-C has higher failure rate
          });
          trace.startTime = Date.now() - i * 60000; // Spread over time
          stats.processTrace(trace);
        }
      });
    });

    it('should return agent list sorted by last execution', () => {
      const agentsList = stats.getAgentsList();
      expect(agentsList).toHaveLength(3);

      // Should be sorted by lastExecution descending
      for (let i = 1; i < agentsList.length; i++) {
        expect(agentsList[i].lastExecution).toBeLessThanOrEqual(agentsList[i - 1].lastExecution);
      }
    });

    it('should calculate global statistics correctly', () => {
      const globalStats = stats.getGlobalStats();

      expect(globalStats.totalAgents).toBe(3);
      expect(globalStats.totalExecutions).toBeGreaterThan(0);
      expect(globalStats.globalSuccessRate).toBeGreaterThan(0);
      expect(globalStats.globalSuccessRate).toBeLessThanOrEqual(100);
      expect(globalStats.topAgents).toHaveLength(3);
      expect(globalStats.recentActivity.length).toBeGreaterThan(0);
    });

    it('should identify active agents correctly', () => {
      // Create a recent trace for agent-A
      const recentTrace = TestDataGenerator.createWatchedTrace({
        agentId: 'agent-A',
      });
      recentTrace.startTime = Date.now() - 30 * 60 * 1000; // 30 minutes ago
      stats.processTrace(recentTrace);

      const globalStats = stats.getGlobalStats();
      expect(globalStats.activeAgents).toBeGreaterThan(0);
    });

    it('should sort top agents by execution count', () => {
      const globalStats = stats.getGlobalStats();
      const topAgents = globalStats.topAgents;

      for (let i = 1; i < topAgents.length; i++) {
        expect(topAgents[i].executionCount).toBeLessThanOrEqual(topAgents[i - 1].executionCount);
      }
    });

    it('should limit recent activity to reasonable size', () => {
      const globalStats = stats.getGlobalStats();
      expect(globalStats.recentActivity.length).toBeLessThanOrEqual(200);
    });
  });

  describe('performance summary', () => {
    beforeEach(() => {
      // Create varied test data
      const scenarios = [
        { agentId: 'fast-agent', nodeCount: 2, failureRate: 0 },
        { agentId: 'slow-agent', nodeCount: 10, failureRate: 0.1 },
        { agentId: 'failing-agent', nodeCount: 3, failureRate: 0.8 },
      ];

      scenarios.forEach((scenario) => {
        for (let i = 0; i < 5; i++) {
          const trace = TestDataGenerator.createWatchedTrace(scenario);
          stats.processTrace(trace);
        }
      });
    });

    it('should provide performance overview', () => {
      const summary = stats.getPerformanceSummary();

      expect(summary.overview).toBeDefined();
      expect(summary.overview.totalAgents).toBe(3);
      expect(summary.overview.totalExecutions).toBe(15);
      expect(typeof summary.overview.successRate).toBe('number');
      expect(summary.overview.activeAgents).toBeGreaterThanOrEqual(0);
    });

    it('should identify top performers', () => {
      const summary = stats.getPerformanceSummary();

      expect(summary.topPerformers).toHaveLength(3);
      expect(summary.topPerformers[0].agentId).toBeDefined();
      expect(summary.topPerformers[0].executions).toBeGreaterThan(0);
      expect(summary.topPerformers[0].successRate).toBeGreaterThanOrEqual(0);
    });

    it('should analyze recent trends', () => {
      const summary = stats.getPerformanceSummary();

      expect(summary.recentTrends).toBeDefined();
      expect(summary.recentTrends.hourlyExecutions).toBeGreaterThanOrEqual(0);
      expect(summary.recentTrends.hourlyFailures).toBeGreaterThanOrEqual(0);
      expect(summary.recentTrends.hourlySuccessRate).toBeGreaterThanOrEqual(0);
      expect(summary.recentTrends.hourlySuccessRate).toBeLessThanOrEqual(100);
    });
  });

  describe('cleanup', () => {
    it('should remove old agent data during cleanup', () => {
      const oldTrace = TestDataGenerator.createWatchedTrace({
        agentId: 'old-agent',
      });
      oldTrace.startTime = Date.now() - 8 * 24 * 60 * 60 * 1000; // 8 days ago

      const recentTrace = TestDataGenerator.createWatchedTrace({
        agentId: 'recent-agent',
      });
      recentTrace.startTime = Date.now() - 60 * 60 * 1000; // 1 hour ago

      stats.processTrace(oldTrace);
      stats.processTrace(recentTrace);

      expect(stats.getAgentStats('old-agent')).toBeDefined();
      expect(stats.getAgentStats('recent-agent')).toBeDefined();

      stats.cleanup();

      expect(stats.getAgentStats('old-agent')).toBeUndefined();
      expect(stats.getAgentStats('recent-agent')).toBeDefined();
    });

    it('should remove old activity from remaining agents', () => {
      const agent = 'test-agent';

      // Add old activity
      const oldTrace = TestDataGenerator.createWatchedTrace({ agentId: agent });
      oldTrace.startTime = Date.now() - 8 * 24 * 60 * 60 * 1000; // 8 days ago
      stats.processTrace(oldTrace);

      // Add recent activity
      const recentTrace = TestDataGenerator.createWatchedTrace({ agentId: agent });
      recentTrace.startTime = Date.now() - 60 * 60 * 1000; // 1 hour ago
      stats.processTrace(recentTrace);

      const beforeCleanup = stats.getAgentStats(agent);
      expect(beforeCleanup?.recentActivity).toHaveLength(2);

      stats.cleanup();

      const afterCleanup = stats.getAgentStats(agent);
      expect(afterCleanup?.recentActivity).toHaveLength(1);
      expect(afterCleanup?.recentActivity[0].timestamp).toBeGreaterThan(
        Date.now() - 2 * 60 * 60 * 1000,
      );
    });
  });

  describe('edge cases', () => {
    it('should handle traces without timing information', () => {
      const trace = TestDataGenerator.createWatchedTrace({
        agentId: 'no-timing-agent',
        includeTimings: false,
      });
      // Zero out times to simulate no timing data
      trace.startTime = 0;
      trace.endTime = 0;

      stats.processTrace(trace);

      const agentMetrics = stats.getAgentStats('no-timing-agent');
      expect(agentMetrics?.avgExecutionTime).toBe(0);
    });

    it('should handle traces with missing fields', () => {
      const incompleteTrace: any = {
        agentId: 'incomplete-agent',
        startTime: Date.now(),
        nodes: new Map(),
        filename: 'test.json',
      };

      expect(() => {
        stats.processTrace(incompleteTrace);
      }).not.toThrow();

      const agentMetrics = stats.getAgentStats('incomplete-agent');
      expect(agentMetrics).toBeDefined();
    });

    it('should handle empty node maps', () => {
      const emptyTrace = TestDataGenerator.createWatchedTrace({
        agentId: 'empty-agent',
        nodeCount: 0,
      });
      emptyTrace.nodes = new Map();

      stats.processTrace(emptyTrace);

      const agentMetrics = stats.getAgentStats('empty-agent');
      expect(agentMetrics?.totalExecutions).toBe(1);
    });

    it('should handle very large activity lists', () => {
      const agent = 'high-activity-agent';

      // Create more than 100 activities
      for (let i = 0; i < 150; i++) {
        const trace = TestDataGenerator.createWatchedTrace({ agentId: agent });
        trace.startTime = Date.now() - i * 1000;
        stats.processTrace(trace);
      }

      const agentMetrics = stats.getAgentStats(agent);
      expect(agentMetrics?.recentActivity.length).toBeLessThanOrEqual(100);
    });
  });
});
