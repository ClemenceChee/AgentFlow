import React from 'react';
import type { Anomaly } from '../hooks/useAnomalies';

interface Props {
  anomalies: Anomaly[];
}

const sevIcon: Record<string, string> = { critical: '!!', high: '!', medium: '~', low: '-' };

export function AnomalyList({ anomalies }: Props) {
  if (anomalies.length === 0) {
    return <div className="bi-empty"><span>No anomalies detected</span></div>;
  }

  return (
    <div>
      {anomalies.map((a) => (
        <div key={a.id} className="bi-anomaly">
          <div className={`bi-anomaly__icon bi-anomaly__icon--${a.severity}`}>
            {sevIcon[a.severity] ?? '?'}
          </div>
          <div className="bi-anomaly__body">
            <div className="bi-anomaly__title">{a.description}</div>
            <div className="bi-anomaly__desc">
              {a.source_system} &middot; {a.metric_name} &middot;{' '}
              <span className="bi-anomaly__deviation" style={{ color: deviationColor(a.deviation_pct) }}>
                {a.deviation_pct > 0 ? '+' : ''}{a.deviation_pct.toFixed(1)}%
              </span>
              {' '}&middot; {fmtAgo(a.detected_at)}
            </div>
            {a.business_impact && (
              <div className="bi-anomaly__desc" style={{ marginTop: 2 }}>
                Impact: {a.business_impact.description}
              </div>
            )}
          </div>
          <span className={`badge badge--${sevBadge(a.severity)}`}>{a.severity}</span>
        </div>
      ))}
    </div>
  );
}

function sevBadge(s: string): string {
  if (s === 'critical') return 'fail';
  if (s === 'high') return 'warn';
  if (s === 'medium') return 'info';
  return 'neutral';
}

function deviationColor(pct: number): string {
  const abs = Math.abs(pct);
  if (abs > 50) return 'var(--fail)';
  if (abs > 20) return 'var(--warn)';
  return 'var(--t2)';
}

function fmtAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
