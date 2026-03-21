/**
 * Conformance drift chart — SVG line chart with regression overlay.
 * Pro tier only (SOMA premium feature).
 */

import { useEffect, useState } from 'react';

interface DriftReport {
  status: 'stable' | 'degrading' | 'improving' | 'insufficient_data';
  slope: number;
  r2: number;
  windowSize: number;
  dataPoints: number;
  alert?: {
    type: string;
    agentId: string;
    currentScore: number;
    trendSlope: number;
    message: string;
  };
}

interface ConformancePoint {
  timestamp: number;
  score: number;
}

const WIDTH = 400;
const HEIGHT = 120;
const PAD = 24;

function scaleX(i: number, total: number): number {
  return PAD + (i / Math.max(1, total - 1)) * (WIDTH - 2 * PAD);
}

function scaleY(score: number): number {
  return HEIGHT - PAD - score * (HEIGHT - 2 * PAD);
}

export function DriftChart({ apiBase, agentId }: { apiBase: string; agentId: string }) {
  const [drift, setDrift] = useState<DriftReport | null>(null);
  const [points, setPoints] = useState<ConformancePoint[]>([]);

  useEffect(() => {
    fetch(`${apiBase}/api/soma/drift?agentId=${encodeURIComponent(agentId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          setDrift(data.drift);
          setPoints(data.points ?? []);
        }
      })
      .catch(() => {});
  }, [apiBase, agentId]);

  if (!drift) return null;

  if (drift.status === 'insufficient_data') {
    return (
      <div className="drift-chart">
        <h4>Conformance Trend: {agentId}</h4>
        <span className="drift-chart__stable">Needs more data ({drift.dataPoints}/10 min)</span>
      </div>
    );
  }

  const n = points.length;
  const pathD =
    points.length > 1
      ? points
          .map(
            (p, i) =>
              `${i === 0 ? 'M' : 'L'}${scaleX(i, n).toFixed(1)},${scaleY(p.score).toFixed(1)}`,
          )
          .join(' ')
      : '';

  // Regression line
  const regY0 = drift.slope * 0 + (points[0]?.score ?? 0.9);
  const regYN = drift.slope * (n - 1) + (points[0]?.score ?? 0.9);

  return (
    <div className="drift-chart">
      <h4>
        Conformance Trend: {agentId}{' '}
        {drift.status === 'degrading' && <span className="drift-chart__alert">Degrading</span>}
        {drift.status === 'stable' && <span className="drift-chart__stable">Stable</span>}
        {drift.status === 'improving' && <span className="drift-chart__stable">Improving</span>}
      </h4>

      <svg width={WIDTH} height={HEIGHT} style={{ background: 'var(--bg2)', borderRadius: 4 }}>
        <title>Conformance drift chart</title>
        {/* Y axis labels */}
        <text x={2} y={PAD} fontSize={9} fill="var(--t3)">
          1.0
        </text>
        <text x={2} y={HEIGHT - PAD} fontSize={9} fill="var(--t3)">
          0.0
        </text>

        {/* Data line */}
        {pathD && <path d={pathD} fill="none" stroke="var(--accent)" strokeWidth={1.5} />}

        {/* Data points */}
        {points.map((p, i) => (
          <circle key={p.timestamp} cx={scaleX(i, n)} cy={scaleY(p.score)} r={2} fill="var(--accent)" />
        ))}

        {/* Regression line */}
        {n > 1 && (
          <line
            x1={scaleX(0, n)}
            y1={scaleY(regY0)}
            x2={scaleX(n - 1, n)}
            y2={scaleY(regYN)}
            stroke={drift.status === 'degrading' ? 'var(--fail)' : 'var(--ok)'}
            strokeWidth={1.5}
            strokeDasharray="4,3"
          />
        )}
      </svg>

      <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4 }}>
        Slope: {drift.slope.toFixed(4)}/run &middot; R&sup2;: {drift.r2.toFixed(2)} &middot;{' '}
        {drift.dataPoints} points
      </div>
    </div>
  );
}
