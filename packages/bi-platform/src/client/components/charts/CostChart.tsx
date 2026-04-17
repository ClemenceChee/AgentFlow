import React from 'react';
import type { CostsResponse } from '../../hooks/useCosts';
import type { AgentsResponse } from '../../hooks/useAgents';

interface Props {
  costs: CostsResponse | null;
  agents: AgentsResponse | null;
}

export function CostChart({ costs, agents }: Props) {
  if (!costs || costs.costs.length === 0) {
    return <div className="bi-empty"><span>No cost data available</span></div>;
  }

  const sorted = [...costs.costs].sort((a, b) => b.totalCost - a.totalCost);
  const maxCost = Math.max(...sorted.map((c) => c.totalCost), 1);
  const total = sorted.reduce((sum, c) => sum + c.totalCost, 0);

  const agentMap = new Map((agents?.agents ?? []).map((a) => [a.agentId, a]));

  return (
    <div>
      <div className="bi-card__header">
        <span className="bi-card__title">Cost Breakdown by Agent</span>
        <span style={{ fontFamily: 'var(--fm)', fontSize: 'var(--sm)', color: 'var(--t1)' }}>
          Total: {fmtCurrency(total, costs.costs[0]?.currency ?? 'USD')}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s2)' }}>
        {sorted.map((c) => {
          const pct = (c.totalCost / maxCost) * 100;
          const agent = agentMap.get(c.agentId);
          const color = !agent ? 'var(--info)' : agent.status === 'healthy' ? 'var(--ok)' : agent.status === 'warning' ? 'var(--warn)' : 'var(--fail)';

          return (
            <div key={c.agentId} style={{ display: 'flex', alignItems: 'center', gap: 'var(--s3)' }}>
              <span style={{ width: 140, fontSize: 'var(--sm)', color: 'var(--t2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {c.agentId}
              </span>
              <div style={{ flex: 1 }}>
                <div className="bi-cost-bar">
                  <div className="bi-cost-bar__fill" style={{ width: `${pct}%`, background: color }} />
                </div>
              </div>
              <span style={{ width: 80, textAlign: 'right', fontFamily: 'var(--fm)', fontSize: 'var(--sm)' }}>
                {fmtCurrency(c.totalCost, c.currency)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function fmtCurrency(value: number, currency: string): string {
  const sym = currency === 'USD' ? '$' : currency;
  if (value >= 1_000_000) return `${sym}${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${sym}${(value / 1_000).toFixed(1)}K`;
  return `${sym}${value.toFixed(2)}`;
}
