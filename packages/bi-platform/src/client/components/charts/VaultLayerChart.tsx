import React from 'react';
import type { KnowledgeHealthResponse } from '../../hooks/useKnowledgeHealth';

interface Props {
  health: KnowledgeHealthResponse | null;
}

const LAYER_COLORS: Record<string, string> = {
  archive: 'var(--t3)',
  working: 'var(--info)',
  emerging: 'var(--warn)',
  canon: 'var(--ok)',
};

export function VaultLayerChart({ health }: Props) {
  if (!health) return <div className="bi-loading">Loading...</div>;

  const layers = health.layers;
  const total = health.totalEntities || 1;
  const barH = 24;
  const barW = 280;

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s2)' }}>
        {layers.map((l) => {
          const pct = (l.count / total) * 100;
          return (
            <div key={l.name} style={{ display: 'flex', alignItems: 'center', gap: 'var(--s3)' }}>
              <span style={{ width: 70, fontSize: 'var(--xs)', color: 'var(--t3)', textTransform: 'capitalize' }}>
                {l.name}
              </span>
              <div style={{ flex: 1 }}>
                <div className="bi-cost-bar" style={{ height: barH }}>
                  <div
                    className="bi-cost-bar__fill"
                    style={{ width: `${Math.max(pct, l.count > 0 ? 2 : 0)}%`, background: LAYER_COLORS[l.name] ?? 'var(--info)', height: barH }}
                  />
                </div>
              </div>
              <span style={{ width: 50, textAlign: 'right', fontFamily: 'var(--fm)', fontSize: 'var(--xs)' }}>
                {l.count}
              </span>
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 'var(--s4)', marginTop: 'var(--s3)', fontSize: 'var(--xs)', color: 'var(--t3)' }}>
        <span>Maturity: {(health.canonToArchiveRatio * 100).toFixed(1)}%</span>
        <span>Synthesis: {(health.synthesisRate * 100).toFixed(1)}%</span>
        <span>Policies: {health.policyCount}</span>
      </div>
      {health.zerInsightWarning && (
        <div className="badge badge--warn" style={{ marginTop: 'var(--s2)' }}>
          Zero insights from {health.totalExecutions} executions — synthesis pipeline stalled
        </div>
      )}
    </div>
  );
}
