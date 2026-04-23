import { describe, it, expect, vi } from 'vitest';
import { computeTokenEconomics, computeKnowledgeHealth, computeOperationalEffectiveness } from '../enhanced-kpis.js';

function createMockOpenClaw(agentData: any[] = [], tokenEcon?: any) {
  return {
    getAgentData: vi.fn(async () => agentData),
    getTokenEconomics: vi.fn(async () => tokenEcon ?? {
      totalCost: 0.15, totalTokens: 50000,
      perAgent: [{ agentId: 'main', cost: 0.10, tokens: 30000 }, { agentId: 'test', cost: 0.05, tokens: 20000 }],
      perModel: [{ model: 'gpt-4o', cost: 0.15, tokens: 50000 }],
    }),
    getAgentPerformance: vi.fn(async () => []),
    health: vi.fn(async () => ({ system: 'openclaw', status: 'healthy', lastSyncAt: null, recordCount: 0 })),
    name: 'openclaw-sessions',
  };
}

function createMockCron(overview?: any) {
  return {
    getOverview: vi.fn(async () => overview ?? {
      totalJobs: 3, totalRuns: 30, overallSuccessRate: 0.8, totalTokens: 100000,
      jobs: [
        { jobId: 'heartbeat', totalRuns: 20, successfulRuns: 18, failedRuns: 2, successRate: 0.9, avgDurationMs: 50000, totalTokens: 60000, lastRunAt: new Date().toISOString(), lastStatus: 'ok', lastError: null, durationAnomaly: false, recentDurations: [50000, 55000, 48000] },
        { jobId: 'digest', totalRuns: 10, successfulRuns: 6, failedRuns: 4, successRate: 0.6, avgDurationMs: 300000, totalTokens: 40000, lastRunAt: new Date().toISOString(), lastStatus: 'error', lastError: 'timeout', durationAnomaly: true, recentDurations: [300000, 400000, 500000] },
      ],
    }),
    health: vi.fn(async () => ({ system: 'cron', status: 'healthy', lastSyncAt: null, recordCount: 0 })),
    name: 'cron',
  };
}

function createMockSoma() {
  return {
    getLayerCounts: vi.fn(async () => ({ archive: 333, working: 0, emerging: 0, canon: 0 })),
    getTotals: vi.fn(async () => ({ agents: 8, executions: 325, insights: 0, policies: 0 })),
    getInsights: vi.fn(async () => []),
    getPolicies: vi.fn(async () => []),
    health: vi.fn(async () => ({ system: 'soma', status: 'healthy', lastSyncAt: null, recordCount: 0 })),
    name: 'soma',
  };
}

function makeAgent(id: string, failRate: number, cost?: number) {
  return {
    agentId: id, agentName: id,
    performance: { totalExecutions: 100, successRate: 1 - failRate, avgDurationMs: 100, failureRate: failRate },
    efficiency: { costPerExecution: cost },
    compliance: { drifted: false, driftScore: 0, alerts: [] },
    businessImpact: {},
  };
}

describe('computeTokenEconomics', () => {
  it('aggregates session and cron spend', async () => {
    const econ = await computeTokenEconomics(createMockOpenClaw() as any, createMockCron() as any, []);
    expect(econ.totalSpend).toBeGreaterThan(0.15);
    expect(econ.totalTokens).toBe(150000); // 50K session + 100K cron
    expect(econ.perAgent.length).toBe(2);
    expect(econ.perModel.length).toBe(1);
  });

  it('computes wasted spend from failures', async () => {
    const agents = [makeAgent('main', 0.3, 0.001)];
    const econ = await computeTokenEconomics(createMockOpenClaw() as any, createMockCron() as any, agents);
    expect(econ.wastedSpend).toBeGreaterThan(0);
  });

  it('flags wasted warning above 20%', async () => {
    const agents = [makeAgent('main', 0.5, 0.01)];
    const oc = createMockOpenClaw([], { totalCost: 1.0, totalTokens: 10000, perAgent: [{ agentId: 'main', cost: 1.0, tokens: 10000 }], perModel: [] });
    const econ = await computeTokenEconomics(oc as any, createMockCron() as any, agents);
    // 50% failure rate on $1 spend = $0.50 waste = 50% > 20%
    expect(econ.wastedWarning).toBe(true);
  });
});

describe('computeKnowledgeHealth', () => {
  it('computes layer distribution', async () => {
    const health = await computeKnowledgeHealth(createMockSoma() as any, 8);
    expect(health.layers).toHaveLength(4);
    expect(health.layers[0]).toEqual({ name: 'archive', count: 333 });
    expect(health.totalEntities).toBe(333);
  });

  it('flags zero insight warning', async () => {
    const health = await computeKnowledgeHealth(createMockSoma() as any, 8);
    expect(health.zerInsightWarning).toBe(true);
    expect(health.synthesisRate).toBe(0);
  });

  it('computes canon to archive ratio', async () => {
    const soma = createMockSoma();
    soma.getLayerCounts.mockResolvedValue({ archive: 100, working: 10, emerging: 5, canon: 20 });
    const health = await computeKnowledgeHealth(soma as any, 4);
    expect(health.canonToArchiveRatio).toBe(0.2);
  });

  it('computes policies per agent', async () => {
    const soma = createMockSoma();
    soma.getTotals.mockResolvedValue({ agents: 4, executions: 100, insights: 10, policies: 8 });
    const health = await computeKnowledgeHealth(soma as any, 4);
    expect(health.policiesPerAgent).toBe(2);
  });
});

describe('computeOperationalEffectiveness', () => {
  it('computes utilization rate', async () => {
    const ocAgents = [
      { agentId: 'main', status: 'healthy', totalMessages: 100, totalTokens: 1000, totalCost: 0.1 },
      { agentId: 'old', status: 'critical', totalMessages: 5, totalTokens: 100, totalCost: 0.01 },
    ];
    const eff = await computeOperationalEffectiveness(
      createMockOpenClaw(ocAgents) as any,
      createMockCron() as any,
      [makeAgent('soma-harvester', 0.05)],
    );
    expect(eff.agentUtilization).toBe(0.5); // 1/2 active
    expect(eff.utilizationWarning).toBe(false); // exactly 50%, not below
  });

  it('computes delegation success across sources', async () => {
    const eff = await computeOperationalEffectiveness(
      createMockOpenClaw([{ agentId: 'main', status: 'healthy', totalMessages: 50, totalTokens: 0, totalCost: 0 }]) as any,
      createMockCron() as any,
      [makeAgent('soma-worker', 0.1)],
    );
    expect(eff.delegationSuccessRate).toBeGreaterThan(0);
    expect(eff.delegationBreakdown).toHaveLength(3);
  });

  it('identifies cron jobs below 80%', async () => {
    const eff = await computeOperationalEffectiveness(
      createMockOpenClaw([]) as any,
      createMockCron() as any,
      [],
    );
    expect(eff.cronJobsBelow80).toContain('digest'); // 60% success rate
    expect(eff.cronJobsBelow80).not.toContain('heartbeat'); // 90%
  });

  it('detects duration degradation', async () => {
    const eff = await computeOperationalEffectiveness(
      createMockOpenClaw([]) as any,
      createMockCron() as any,
      [],
    );
    expect(eff.durationDegrading).toBe(true); // digest has durationAnomaly: true
  });
});
