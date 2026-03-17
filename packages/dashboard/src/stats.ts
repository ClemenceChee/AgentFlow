import { getFailures, getHungNodes, getStats } from 'agentflow-core';
import type { WatchedTrace } from './watcher.js';

export interface AgentMetrics {
  agentId: string;
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  successRate: number;
  avgExecutionTime: number;
  lastExecution: number;
  triggers: Record<string, number>;
  recentActivity: Array<{
    timestamp: number;
    success: boolean;
    executionTime?: number;
    trigger: string;
  }>;
}

export interface GlobalMetrics {
  totalAgents: number;
  totalExecutions: number;
  globalSuccessRate: number;
  activeAgents: number;
  topAgents: Array<{
    agentId: string;
    executionCount: number;
    successRate: number;
  }>;
  recentActivity: Array<{
    timestamp: number;
    agentId: string;
    success: boolean;
    trigger: string;
  }>;
}

export class AgentStats {
  private agentMetrics = new Map<string, AgentMetrics>();
  private processedTraces = new Set<string>();

  public processTrace(trace: WatchedTrace) {
    const traceKey = `${trace.filename || trace.agentId}-${trace.startTime}`;
    if (this.processedTraces.has(traceKey)) {
      return;
    }
    this.processedTraces.add(traceKey);

    const agentId = trace.agentId;

    let metrics = this.agentMetrics.get(agentId);
    if (!metrics) {
      metrics = {
        agentId,
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        successRate: 0,
        avgExecutionTime: 0,
        lastExecution: 0,
        triggers: {},
        recentActivity: [],
      };
      this.agentMetrics.set(agentId, metrics);
    }

    const analysis = this.analyzeExecution(trace);

    metrics.totalExecutions++;
    metrics.lastExecution = Math.max(metrics.lastExecution, trace.startTime);

    const trigger = trace.trigger || 'unknown';
    metrics.triggers[trigger] = (metrics.triggers[trigger] || 0) + 1;

    if (analysis.success) {
      metrics.successfulExecutions++;
    } else {
      metrics.failedExecutions++;
    }

    metrics.successRate = (metrics.successfulExecutions / metrics.totalExecutions) * 100;

    if (analysis.executionTime > 0) {
      const currentAvg = metrics.avgExecutionTime;
      const count = metrics.totalExecutions;
      metrics.avgExecutionTime = (currentAvg * (count - 1) + analysis.executionTime) / count;
    }

    metrics.recentActivity.push({
      timestamp: trace.startTime,
      success: analysis.success,
      executionTime: analysis.executionTime,
      trigger: trigger,
    });

    if (metrics.recentActivity.length > 100) {
      metrics.recentActivity = metrics.recentActivity.slice(-100);
    }

    metrics.recentActivity.sort((a, b) => b.timestamp - a.timestamp);
  }

  private analyzeExecution(trace: WatchedTrace): {
    success: boolean;
    executionTime: number;
    nodeCount: number;
    failureCount: number;
    hungCount: number;
  } {
    try {
      const stats = getStats(trace);
      const failures = getFailures(trace);
      const hungNodes = getHungNodes(trace);

      return {
        success: failures.length === 0 && hungNodes.length === 0,
        executionTime: stats.duration || 0,
        nodeCount: stats.totalNodes || 0,
        failureCount: failures.length,
        hungCount: hungNodes.length,
      };
    } catch (error) {
      console.warn('Error analyzing trace with AgentFlow:', error);

      const nodes = trace.nodes instanceof Map ? Array.from(trace.nodes.values()) : [];

      const failedNodes = nodes.filter((node) => node.status === 'failed').length;

      return {
        success: failedNodes === 0,
        executionTime: 0,
        nodeCount: nodes.length,
        failureCount: failedNodes,
        hungCount: 0,
      };
    }
  }

  public getAgentStats(agentId: string): AgentMetrics | undefined {
    return this.agentMetrics.get(agentId);
  }

  public getAgentsList(): AgentMetrics[] {
    return Array.from(this.agentMetrics.values()).sort((a, b) => b.lastExecution - a.lastExecution);
  }

  public getGlobalStats(): GlobalMetrics {
    const agents = Array.from(this.agentMetrics.values());
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;

    const totalExecutions = agents.reduce((sum, agent) => sum + agent.totalExecutions, 0);
    const totalSuccessful = agents.reduce((sum, agent) => sum + agent.successfulExecutions, 0);
    const globalSuccessRate = totalExecutions > 0 ? (totalSuccessful / totalExecutions) * 100 : 0;

    const activeAgents = agents.filter((agent) => agent.lastExecution > oneHourAgo).length;

    const topAgents = agents
      .slice()
      .sort((a, b) => b.totalExecutions - a.totalExecutions)
      .slice(0, 10)
      .map((agent) => ({
        agentId: agent.agentId,
        executionCount: agent.totalExecutions,
        successRate: agent.successRate,
      }));

    const recentActivity: Array<{
      timestamp: number;
      agentId: string;
      success: boolean;
      trigger: string;
    }> = [];

    for (const agent of agents) {
      for (const activity of agent.recentActivity.slice(0, 20)) {
        recentActivity.push({
          timestamp: activity.timestamp,
          agentId: agent.agentId,
          success: activity.success,
          trigger: activity.trigger,
        });
      }
    }

    recentActivity.sort((a, b) => b.timestamp - a.timestamp);
    recentActivity.splice(200);

    return {
      totalAgents: agents.length,
      totalExecutions,
      globalSuccessRate,
      activeAgents,
      topAgents,
      recentActivity,
    };
  }

  public getPerformanceSummary() {
    const global = this.getGlobalStats();
    const agents = this.getAgentsList();

    return {
      overview: {
        totalAgents: global.totalAgents,
        totalExecutions: global.totalExecutions,
        successRate: Math.round(global.globalSuccessRate * 100) / 100,
        activeAgents: global.activeAgents,
      },
      topPerformers: agents.slice(0, 5).map((agent) => ({
        agentId: agent.agentId,
        executions: agent.totalExecutions,
        successRate: Math.round(agent.successRate * 100) / 100,
        avgTime: Math.round(agent.avgExecutionTime * 100) / 100,
      })),
      recentTrends: this.analyzeRecentTrends(),
    };
  }

  private analyzeRecentTrends() {
    const agents = Array.from(this.agentMetrics.values());
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;

    let recentExecutions = 0;
    let recentFailures = 0;

    for (const agent of agents) {
      for (const activity of agent.recentActivity) {
        if (activity.timestamp > oneHourAgo) {
          recentExecutions++;
          if (!activity.success) {
            recentFailures++;
          }
        }
      }
    }

    return {
      hourlyExecutions: recentExecutions,
      hourlyFailures: recentFailures,
      hourlySuccessRate:
        recentExecutions > 0
          ? Math.round(((recentExecutions - recentFailures) / recentExecutions) * 10000) / 100
          : 0,
    };
  }

  public cleanup() {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;

    for (const [agentId, metrics] of this.agentMetrics.entries()) {
      metrics.recentActivity = metrics.recentActivity.filter(
        (activity) => activity.timestamp > cutoff,
      );

      if (metrics.lastExecution < cutoff) {
        this.agentMetrics.delete(agentId);
      }
    }

    console.log(`Cleaned up old metrics, ${this.agentMetrics.size} agents remaining`);
  }
}
