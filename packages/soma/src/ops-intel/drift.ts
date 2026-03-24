/**
 * Drift detection — conformance score trend tracking with linear regression.
 *
 * @module
 */

import type { ConformanceHistory, DriftOptions, DriftReport } from './types.js';

/**
 * Append a new conformance score entry to history.
 * Returns a new array (does not mutate the original).
 */
export function trackConformanceTrend(
  history: ConformanceHistory,
  newEntry: { agentId: string; score: number; runId: string },
): ConformanceHistory {
  return [
    ...history,
    {
      agentId: newEntry.agentId,
      timestamp: Date.now(),
      score: newEntry.score,
      runId: newEntry.runId,
    },
  ];
}

/**
 * Detect conformance drift via linear regression over a sliding window.
 *
 * - Requires minimum 10 data points (returns 'insufficient_data' otherwise)
 * - status='degrading' when slope < 0 AND R² > 0.3
 * - status='improving' when slope > 0 AND R² > 0.3
 * - status='stable' when R² < 0.3 (noise, not trend)
 */
export function detectDrift(history: ConformanceHistory, options?: DriftOptions): DriftReport {
  const windowSize = options?.windowSize ?? 50;
  const window = history.slice(-windowSize);
  const n = window.length;

  if (n < 10) {
    return { status: 'insufficient_data', slope: 0, r2: 0, windowSize, dataPoints: n };
  }

  // Linear regression: x = index, y = score
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;

  for (let i = 0; i < n; i++) {
    const y = window[i]!.score;
    sumX += i;
    sumY += y;
    sumXY += i * y;
    sumX2 += i * i;
  }

  const denominator = n * sumX2 - sumX * sumX;
  const slope = denominator !== 0 ? (n * sumXY - sumX * sumY) / denominator : 0;
  const intercept = (sumY - slope * sumX) / n;
  const meanY = sumY / n;

  // R² = 1 - SS_res / SS_tot
  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    const y = window[i]!.score;
    const yHat = intercept + slope * i;
    ssRes += (y - yHat) ** 2;
    ssTot += (y - meanY) ** 2;
  }

  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;

  let status: DriftReport['status'] = 'stable';
  if (r2 > 0.3) {
    status = slope < 0 ? 'degrading' : 'improving';
  }

  const currentScore = window[n - 1]!.score;
  const agentId = window[n - 1]!.agentId;

  const alert =
    status === 'degrading'
      ? {
          type: 'conformance_trend_degradation' as const,
          agentId,
          currentScore,
          trendSlope: slope,
          windowSize: n,
          message: `Agent '${agentId}' conformance declining (slope: ${slope.toFixed(4)}/run, R²: ${r2.toFixed(2)}, current: ${(currentScore * 100).toFixed(0)}%)`,
        }
      : undefined;

  return { status, slope, r2, windowSize: n, dataPoints: n, alert };
}
