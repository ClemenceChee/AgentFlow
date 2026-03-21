import { describe, expect, it } from 'vitest';
import { detectDrift, trackConformanceTrend } from '../../packages/core/src/drift.js';
import type { ConformanceHistory } from '../../packages/core/src/types.js';

/** Helper: build a history array with linearly changing scores. */
function buildHistory(
  count: number,
  scoreFn: (i: number) => number,
  agentId = 'test-agent',
): ConformanceHistory {
  return Array.from({ length: count }, (_, i) => ({
    agentId,
    timestamp: Date.now() - (count - i) * 1000,
    score: scoreFn(i),
    runId: `run-${i}`,
  }));
}

describe('detectDrift', () => {
  it('detects clear downward drift as degrading with alert', () => {
    // Scores drop from 0.95 to ~0.45 over 20 runs
    const history = buildHistory(20, (i) => 0.95 - i * 0.025);
    const report = detectDrift(history);

    expect(report.status).toBe('degrading');
    expect(report.slope).toBeLessThan(0);
    expect(report.r2).toBeGreaterThan(0.3);
    expect(report.dataPoints).toBe(20);
    expect(report.alert).toBeDefined();
    expect(report.alert!.type).toBe('conformance_trend_degradation');
    expect(report.alert!.agentId).toBe('test-agent');
  });

  it('reports stable for flat scores', () => {
    // All scores at 0.9 — no trend
    const history = buildHistory(15, () => 0.9);
    const report = detectDrift(history);

    expect(report.status).toBe('stable');
    expect(report.r2).toBeLessThan(0.3);
    expect(report.alert).toBeUndefined();
  });

  it('returns insufficient_data with fewer than 10 points', () => {
    const history = buildHistory(5, (i) => 0.9 - i * 0.1);
    const report = detectDrift(history);

    expect(report.status).toBe('insufficient_data');
    expect(report.slope).toBe(0);
    expect(report.r2).toBe(0);
    expect(report.dataPoints).toBe(5);
    expect(report.alert).toBeUndefined();
  });

  it('reports stable for noisy but flat data (R² < 0.3)', () => {
    // Alternating high/low scores around 0.8 — no clear trend
    const history = buildHistory(20, (i) => 0.8 + (i % 2 === 0 ? 0.1 : -0.1));
    const report = detectDrift(history);

    expect(report.status).toBe('stable');
    expect(report.r2).toBeLessThan(0.3);
    expect(report.alert).toBeUndefined();
  });

  it('detects improving trend', () => {
    // Scores rise from 0.5 to ~0.95 over 20 runs
    const history = buildHistory(20, (i) => 0.5 + i * 0.025);
    const report = detectDrift(history);

    expect(report.status).toBe('improving');
    expect(report.slope).toBeGreaterThan(0);
    expect(report.r2).toBeGreaterThan(0.3);
    expect(report.alert).toBeUndefined();
  });

  it('respects windowSize option', () => {
    // 60 entries but window=10 — only last 10 used
    const history = buildHistory(60, (i) => 0.9 - i * 0.005);
    const report = detectDrift(history, { windowSize: 10 });

    expect(report.dataPoints).toBe(10);
    expect(report.windowSize).toBe(10);
  });
});

describe('trackConformanceTrend', () => {
  it('appends entry with timestamp', () => {
    const history: ConformanceHistory = [];
    const before = Date.now();
    const result = trackConformanceTrend(history, {
      agentId: 'agent-1',
      score: 0.85,
      runId: 'run-abc',
    });
    const after = Date.now();

    expect(result).toHaveLength(1);
    expect(result[0].agentId).toBe('agent-1');
    expect(result[0].score).toBe(0.85);
    expect(result[0].runId).toBe('run-abc');
    expect(result[0].timestamp).toBeGreaterThanOrEqual(before);
    expect(result[0].timestamp).toBeLessThanOrEqual(after);

    // Original array is not mutated
    expect(history).toHaveLength(0);
  });

  it('preserves existing entries', () => {
    const existing: ConformanceHistory = [
      { agentId: 'a', timestamp: 1000, score: 0.9, runId: 'r1' },
    ];
    const result = trackConformanceTrend(existing, {
      agentId: 'a',
      score: 0.8,
      runId: 'r2',
    });

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(existing[0]);
    expect(result[1].score).toBe(0.8);
  });
});
