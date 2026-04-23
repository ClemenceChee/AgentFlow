import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AggregatedMetrics } from '../../synthesis/aggregator.js';
import { RecommendationEngine } from '../recommendation-engine.js';

function createMockDb() {
  return {
    query: vi.fn().mockResolvedValue({ rows: [] }),
    end: vi.fn(),
  };
}

function createMockAggregator(agents: AggregatedMetrics['agents'] = []) {
  return {
    getLatest: vi.fn(() => ({
      timestamp: new Date().toISOString(),
      agents,
      systemHealth: {
        soma: { status: 'healthy', insightCount: 5, policyCount: 3 },
        agentflow: { status: 'healthy', activeAgents: agents.length, totalExecutions: 100 },
        opsintel: { status: 'healthy', driftAlerts: 0, assertionsPassed: 50 },
      },
      crossSystemCorrelations: [],
    })),
    aggregate: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  };
}

describe('RecommendationEngine', () => {
  let engine: RecommendationEngine;
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
  });

  it('returns empty array when no aggregation data', async () => {
    const agg = createMockAggregator();
    agg.getLatest.mockReturnValue(null as any);
    engine = new RecommendationEngine(db as any, agg as any);

    const recs = await engine.generateRecommendations();
    expect(recs).toEqual([]);
  });

  it('generates performance recommendation for high failure agents', async () => {
    const agents = [makeAgent('bot1', 'Bot One', 100, 0.7, 0.3, false, 0)];
    engine = new RecommendationEngine(db as any, createMockAggregator(agents) as any);

    const recs = await engine.generateRecommendations();
    expect(recs.length).toBeGreaterThan(0);

    const perfRec = recs.find((r) => r.type === 'performance');
    expect(perfRec).toBeDefined();
    expect(perfRec?.title).toContain('Bot One');
    expect(['critical', 'high']).toContain(perfRec?.priority);
  });

  it('generates cost recommendation for expensive low-success agents', async () => {
    const agents = [makeAgent('bot2', 'Bot Two', 200, 0.75, 0.25, false, 0, 0.8)];
    engine = new RecommendationEngine(db as any, createMockAggregator(agents) as any);

    const recs = await engine.generateRecommendations();
    const costRec = recs.find((r) => r.type === 'cost');
    expect(costRec).toBeDefined();
    expect(costRec?.title).toContain('Bot Two');
  });

  it('generates compliance recommendation for drifting agents', async () => {
    const agents = [makeAgent('bot3', 'Bot Three', 100, 0.95, 0.05, true, 0.5)];
    engine = new RecommendationEngine(db as any, createMockAggregator(agents) as any);

    const recs = await engine.generateRecommendations();
    const compRec = recs.find((r) => r.type === 'compliance');
    expect(compRec).toBeDefined();
    expect(compRec?.priority).toBe('high');
  });

  it('filters recommendations by role', async () => {
    const agents = [makeAgent('bot1', 'Bot One', 100, 0.7, 0.3, true, 0.5)];
    engine = new RecommendationEngine(db as any, createMockAggregator(agents) as any);

    const execRecs = await engine.generateRecommendations('executive');
    const viewerRecs = await engine.generateRecommendations('viewer');

    // Executives get all, viewers should get none (recs target exec/manager)
    expect(execRecs.length).toBeGreaterThan(0);
    expect(viewerRecs.length).toBe(0);
  });

  it('sorts recommendations by priority', async () => {
    const agents = [
      makeAgent('bot1', 'Bot One', 100, 0.5, 0.5, true, 0.8), // Critical
      makeAgent('bot2', 'Bot Two', 200, 0.75, 0.25, false, 0, 0.8), // Medium
    ];
    engine = new RecommendationEngine(db as any, createMockAggregator(agents) as any);

    const recs = await engine.generateRecommendations();
    if (recs.length >= 2) {
      const priorities = recs.map((r) => r.priority);
      const order = { critical: 0, high: 1, medium: 2, low: 3 };
      for (let i = 1; i < priorities.length; i++) {
        expect(order[priorities[i]]).toBeGreaterThanOrEqual(order[priorities[i - 1]]);
      }
    }
  });

  it('records outcome to database', async () => {
    engine = new RecommendationEngine(db as any, createMockAggregator() as any);

    await engine.recordOutcome({
      recommendationId: 'rec-1',
      status: 'implemented',
      decidedBy: 'user1',
      decidedAt: new Date().toISOString(),
    });

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO business_decisions'),
      expect.any(Array),
    );
  });

  it('getEffectiveness returns metrics', async () => {
    db.query.mockResolvedValueOnce({
      rows: [
        { status: 'implemented', count: '5' },
        { status: 'rejected', count: '2' },
      ],
    });

    engine = new RecommendationEngine(db as any, createMockAggregator() as any);
    const eff = await engine.getEffectiveness();

    expect(eff.total).toBe(7);
    expect(eff.implemented).toBe(5);
    expect(eff.rejected).toBe(2);
  });
});

function makeAgent(
  id: string,
  name: string,
  execs: number,
  successRate: number,
  failureRate: number,
  drifted: boolean,
  driftScore: number,
  costPerExec?: number,
) {
  return {
    agentId: id,
    agentName: name,
    performance: { totalExecutions: execs, successRate, avgDurationMs: 150, failureRate },
    efficiency: { costPerExecution: costPerExec },
    compliance: { drifted, driftScore, alerts: drifted ? ['drift_alert'] : [] },
    businessImpact: {},
  };
}
