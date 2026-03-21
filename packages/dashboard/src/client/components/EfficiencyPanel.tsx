/**
 * Efficiency panel — per-run cost metrics with wasteful loop detection.
 * Pro tier only (SOMA premium feature).
 */

import { useEffect, useState } from 'react';

interface EfficiencyReport {
  runs: {
    graphId: string;
    agentId: string;
    totalTokenCost: number;
    completedNodes: number;
    costPerNode: number;
  }[];
  aggregate: { mean: number; median: number; p95: number };
  flags: {
    pattern: string;
    nodeName: string;
    retryCount?: number;
    tokenCost: number;
    message: string;
  }[];
  dataCoverage: number;
}

export function EfficiencyPanel({ apiBase }: { apiBase: string }) {
  const [report, setReport] = useState<EfficiencyReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${apiBase}/api/soma/efficiency`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))))
      .then(setReport)
      .catch((e) => setError(e.message));
  }, [apiBase]);

  if (error)
    return (
      <div className="efficiency-panel">
        <em>Efficiency data unavailable</em>
      </div>
    );
  if (!report)
    return (
      <div className="efficiency-panel">
        <em>Loading efficiency data...</em>
      </div>
    );

  return (
    <div className="efficiency-panel">
      <h4>Cost Efficiency</h4>
      <div className="efficiency-panel__stats">
        <div className="efficiency-stat">
          <div className="efficiency-stat__value">{report.aggregate.mean.toFixed(0)}</div>
          <div className="efficiency-stat__label">Mean cost/node</div>
        </div>
        <div className="efficiency-stat">
          <div className="efficiency-stat__value">{report.aggregate.median.toFixed(0)}</div>
          <div className="efficiency-stat__label">Median cost/node</div>
        </div>
        <div className="efficiency-stat">
          <div className="efficiency-stat__value">{report.aggregate.p95.toFixed(0)}</div>
          <div className="efficiency-stat__label">P95 cost/node</div>
        </div>
        <div className="efficiency-stat">
          <div className="efficiency-stat__value">{(report.dataCoverage * 100).toFixed(0)}%</div>
          <div className="efficiency-stat__label">Data coverage</div>
        </div>
      </div>

      {report.flags.length > 0 && (
        <div>
          {report.flags.map((f, i) => (
            <div key={i} className="efficiency-flag">
              {'\u26A0'} {f.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function EfficiencyTeaser() {
  return (
    <div className="efficiency-panel" style={{ opacity: 0.6 }}>
      <h4>Cost Efficiency</h4>
      <p style={{ fontSize: 12, color: 'var(--t3)' }}>
        Upgrade to SOMA Pro to see per-run cost analysis, wasteful loop detection, and aggregate
        efficiency metrics.
      </p>
    </div>
  );
}
