/**
 * Drift detection module — tracks conformance score trends over time
 * and detects degradation via linear regression.
 * @module
 */

import type {
  ConformanceHistory,
  ConformanceHistoryEntry,
  DriftOptions,
  DriftReport,
} from './types.js';

/**
 * Append a new conformance score entry to the history.
 * Returns a new array (does not mutate the input).
 */
export function trackConformanceTrend(
  history: ConformanceHistory,
  newEntry: { agentId: string; score: number; runId: string },
): ConformanceHistory {
  const entry: ConformanceHistoryEntry = {
    agentId: newEntry.agentId,
    timestamp: Date.now(),
    score: newEntry.score,
    runId: newEntry.runId,
  };
  return [...history, entry];
}

/**
 * Run linear regression over a sliding window of conformance scores
 * and return a drift report indicating whether scores are stable,
 * improving, or degrading.
 */
export function detectDrift(history: ConformanceHistory, options?: DriftOptions): DriftReport {
  const windowSize = options?.windowSize ?? 50;

  // Take the most recent `windowSize` entries
  const window = history.length > windowSize ? history.slice(history.length - windowSize) : history;

  const n = window.length;

  if (n < 10) {
    return {
      status: 'insufficient_data',
      slope: 0,
      r2: 0,
      windowSize,
      dataPoints: n,
    };
  }

  // Use indices 0..n-1 as x values, scores as y values
  const xs = window.map((_, i) => i);
  const ys = window.map((e) => e.score);

  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = ys.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((acc, x, i) => acc + x * ys[i], 0);
  const sumX2 = xs.reduce((acc, x) => acc + x * x, 0);

  const denom = n * sumX2 - sumX * sumX;
  const slope = denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  // R² calculation
  const yMean = sumY / n;
  let ssTot = 0;
  let ssRes = 0;
  for (let i = 0; i < n; i++) {
    const yHat = slope * xs[i] + intercept;
    ssRes += (ys[i] - yHat) ** 2;
    ssTot += (ys[i] - yMean) ** 2;
  }
  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;

  // Determine status
  let status: DriftReport['status'];
  if (r2 < 0.3) {
    status = 'stable';
  } else if (slope < 0) {
    status = 'degrading';
  } else {
    status = 'improving';
  }

  const report: DriftReport = {
    status,
    slope,
    r2,
    windowSize,
    dataPoints: n,
  };

  if (status === 'degrading') {
    const lastEntry = window[window.length - 1];
    return {
      ...report,
      alert: {
        type: 'conformance_trend_degradation',
        agentId: lastEntry.agentId,
        currentScore: lastEntry.score,
        trendSlope: slope,
        windowSize,
        message: `Agent ${lastEntry.agentId} conformance is degrading: slope=${slope.toFixed(4)}, R²=${r2.toFixed(4)} over ${n} runs`,
      },
    };
  }

  return report;
}
