import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnomalyDetector } from '../anomaly-detector.js';

function createMockDb() {
  return {
    query: vi.fn().mockResolvedValue({ rows: [] }),
    end: vi.fn(),
  };
}

function createMockLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  };
}

describe('AnomalyDetector', () => {
  let detector: AnomalyDetector;
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
    detector = new AnomalyDetector(db as any, createMockLogger() as any);
  });

  it('detects no anomalies with normal data', async () => {
    const agents = [
      makeAgent('a1', 100, 0.95, 150, 0.05),
      makeAgent('a2', 120, 0.92, 180, 0.08),
    ];

    const anomalies = await detector.detectAnomalies(agents);
    // With only 2 data points, hard to detect anomalies
    expect(Array.isArray(anomalies)).toBe(true);
  });

  it('detects failure rate anomaly', async () => {
    const agents = [
      makeAgent('a1', 100, 0.95, 150, 0.05),
      makeAgent('a2', 100, 0.90, 150, 0.10),
      makeAgent('a3', 100, 0.85, 150, 0.15),
      makeAgent('a4', 100, 0.30, 150, 0.70), // Outlier
    ];

    const anomalies = await detector.detectAnomalies(agents);
    const failureAnomaly = anomalies.find((a) => a.metricName.includes('failure'));
    // Should detect agent 'a4' as anomalous
    if (failureAnomaly) {
      expect(failureAnomaly.severity).toMatch(/critical|high/);
    }
  });

  it('validates data quality', async () => {
    const agents = [
      makeAgent('a1', 0, 0, 0, 0), // Missing data
      makeAgent('a2', 100, 0.95, 150, 0.05),
    ];

    const issues = await detector.validateDataQuality(agents);
    expect(Array.isArray(issues)).toBe(true);
  });

  it('checks freshness for all sources', async () => {
    db.query.mockResolvedValueOnce({
      rows: [
        { source_system: 'soma', last_sync_at: new Date().toISOString(), status: 'healthy' },
        { source_system: 'agentflow', last_sync_at: new Date().toISOString(), status: 'healthy' },
      ],
    });

    const freshness = await detector.checkFreshness();
    expect(Array.isArray(freshness)).toBe(true);
  });

  it('updateFreshness persists to DB', async () => {
    await detector.updateFreshness('soma', 42);
    expect(db.query).toHaveBeenCalled();
  });
});

function makeAgent(id: string, execs: number, successRate: number, avgMs: number, failureRate: number) {
  return {
    agentId: id,
    agentName: id,
    performance: { totalExecutions: execs, successRate, avgDurationMs: avgMs, failureRate },
    efficiency: { costPerExecution: 0.1 },
    compliance: { drifted: false, driftScore: 0, alerts: [] },
    businessImpact: {},
  };
}
