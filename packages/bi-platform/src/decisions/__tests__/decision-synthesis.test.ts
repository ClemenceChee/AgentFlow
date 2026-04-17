import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DecisionSynthesisService } from '../decision-synthesis.js';

function createMockDb() {
  return { query: vi.fn().mockResolvedValue({ rows: [] }), end: vi.fn() };
}

function createMockCache() {
  return {
    get: vi.fn(async () => null),
    set: vi.fn(),
    del: vi.fn(),
    invalidatePattern: vi.fn(async () => 0),
    getStats: vi.fn(() => ({ hits: 0, misses: 0, hitRate: 0, errors: 0 })),
    close: vi.fn(),
  };
}

function createMockLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), child: vi.fn().mockReturnThis() };
}

function createMockAggregator(agents: any[] = []) {
  return {
    getLatest: vi.fn(() => ({
      timestamp: new Date().toISOString(),
      agents,
      systemHealth: { soma: { status: 'healthy', insightCount: 0, policyCount: 0 }, agentflow: { status: 'healthy', activeAgents: 0, totalExecutions: 0 }, opsintel: { status: 'healthy', driftAlerts: 0, assertionsPassed: 0 } },
      crossSystemCorrelations: [],
    })),
    aggregate: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  };
}

function createMockRecommendationEngine() {
  return { generateRecommendations: vi.fn(async () => []) };
}

function createMockAnomalyDetector() {
  return { detectAnomalies: vi.fn(async () => []), checkFreshness: vi.fn(async () => []) };
}

function makeAgent(id: string, failureRate: number, drifted: boolean, costPerExec = 0.1) {
  return {
    agentId: id, agentName: id,
    performance: { totalExecutions: 100, successRate: 1 - failureRate, avgDurationMs: 100, failureRate },
    efficiency: { costPerExecution: costPerExec },
    compliance: { drifted, driftScore: drifted ? 0.5 : 0, alerts: [] },
    businessImpact: {},
  };
}

describe('DecisionSynthesisService', () => {
  let service: DecisionSynthesisService;

  beforeEach(() => {
    const agents = [
      makeAgent('a1', 0.05, false),
      makeAgent('a2', 0.10, false),
    ];
    service = new DecisionSynthesisService(
      createMockAggregator(agents) as any,
      createMockRecommendationEngine() as any,
      createMockAnomalyDetector() as any,
      createMockDb() as any,
      createMockCache() as any,
      createMockLogger() as any,
    );
  });

  it('detectPatterns returns empty for healthy agents', async () => {
    const patterns = await service.detectPatterns();
    expect(patterns).toEqual([]);
  });

  it('detectPatterns finds failure cascade', async () => {
    const agents = [
      makeAgent('a1', 0.30, false),
      makeAgent('a2', 0.40, false),
      makeAgent('a3', 0.50, false),
    ];
    service = new DecisionSynthesisService(
      createMockAggregator(agents) as any,
      createMockRecommendationEngine() as any,
      createMockAnomalyDetector() as any,
      createMockDb() as any,
      createMockCache() as any,
      createMockLogger() as any,
    );

    const patterns = await service.detectPatterns();
    const cascade = patterns.find((p) => p.type === 'failure_cascade');
    expect(cascade).toBeDefined();
    expect(cascade!.affectedAgents).toHaveLength(3);
    expect(cascade!.businessImpact.severity).toBe('critical');
  });

  it('detectPatterns finds compliance drift', async () => {
    const agents = [
      makeAgent('a1', 0.05, true),
      makeAgent('a2', 0.05, true),
    ];
    service = new DecisionSynthesisService(
      createMockAggregator(agents) as any,
      createMockRecommendationEngine() as any,
      createMockAnomalyDetector() as any,
      createMockDb() as any,
      createMockCache() as any,
      createMockLogger() as any,
    );

    const patterns = await service.detectPatterns();
    const drift = patterns.find((p) => p.type === 'compliance_drift');
    expect(drift).toBeDefined();
  });

  it('getDelegationRoiAnalysis calculates ROI', async () => {
    const analysis = await service.getDelegationRoiAnalysis();
    expect(analysis.period).toBe('last_30_days');
    expect(analysis.totalDelegations).toBe(200); // 100 + 100
    expect(analysis.roiMultiplier).toBeGreaterThan(0);
  });

  it('getComplianceRisks returns risks for drifting agents', async () => {
    const agents = [
      makeAgent('a1', 0.05, true),
      makeAgent('a2', 0.05, true),
    ];
    service = new DecisionSynthesisService(
      createMockAggregator(agents) as any,
      createMockRecommendationEngine() as any,
      createMockAnomalyDetector() as any,
      createMockDb() as any,
      createMockCache() as any,
      createMockLogger() as any,
    );

    const risks = await service.getComplianceRisks();
    expect(risks.length).toBeGreaterThan(0);
    expect(risks[0].regulation).toBe('Behavioral Compliance');
  });

  it('getCriticalAlerts converts critical patterns to alerts', async () => {
    const agents = [
      makeAgent('a1', 0.30, false),
      makeAgent('a2', 0.40, false),
      makeAgent('a3', 0.50, false),
    ];
    service = new DecisionSynthesisService(
      createMockAggregator(agents) as any,
      createMockRecommendationEngine() as any,
      createMockAnomalyDetector() as any,
      createMockDb() as any,
      createMockCache() as any,
      createMockLogger() as any,
    );

    const alerts = await service.getCriticalAlerts();
    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts[0].acknowledged).toBe(false);
  });

  it('validateConfidence adjusts for sample size', () => {
    const high = service.validateConfidence(0.9, 500);
    expect(high.reliability).toBe('high');
    expect(high.adjustedConfidence).toBe(0.9);

    const low = service.validateConfidence(0.9, 10);
    expect(low.reliability).toBe('low');
    expect(low.adjustedConfidence).toBeLessThan(0.9);
  });
});
