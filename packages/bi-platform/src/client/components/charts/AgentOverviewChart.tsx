import { useState } from 'react';
import type { AgentsResponse } from '../../hooks/useAgents';

interface Props {
  agents: AgentsResponse | null;
  onSelect?: (agentId: string) => void;
}

export function AgentOverviewChart({ agents, onSelect }: Props) {
  const [hover, setHover] = useState<string | null>(null);

  if (!agents || agents.agents.length === 0) {
    return (
      <div className="bi-empty">
        <span>No agent data</span>
      </div>
    );
  }

  const sorted = [...agents.agents].sort((a, b) => b.totalExecutions - a.totalExecutions);
  const maxExec = Math.max(...sorted.map((a) => a.totalExecutions), 1);

  const barH = 28;
  const gap = 4;
  const labelW = 140;
  const valueW = 60;
  const chartW = 400;
  const totalW = labelW + chartW + valueW;
  const totalH = sorted.length * (barH + gap) + gap;

  return (
    <div className="bi-chart" style={{ overflowX: 'auto' }}>
      <svg
        width="100%"
        height={totalH}
        viewBox={`0 0 ${totalW} ${totalH}`}
        preserveAspectRatio="xMinYMin meet"
      >
        {sorted.map((agent, i) => {
          const y = i * (barH + gap) + gap;
          const w = (agent.totalExecutions / maxExec) * (chartW - 8);
          const fill =
            agent.status === 'healthy'
              ? 'var(--ok)'
              : agent.status === 'warning'
                ? 'var(--warn)'
                : 'var(--fail)';
          const isHovered = hover === agent.agentId;

          return (
            <g
              key={agent.agentId}
              className="bi-chart__bar"
              opacity={isHovered ? 1 : 0.85}
              onMouseEnter={() => setHover(agent.agentId)}
              onMouseLeave={() => setHover(null)}
              onClick={() => onSelect?.(agent.agentId)}
              style={{ cursor: onSelect ? 'pointer' : undefined }}
            >
              <text className="bi-chart__label" x={0} y={y + barH / 2 + 4} fontSize="12">
                {truncate(agent.agentName, 18)}
              </text>
              <rect
                x={labelW}
                y={y}
                width={Math.max(w, 2)}
                height={barH}
                rx={3}
                fill={fill}
                opacity={isHovered ? 1 : 0.7}
              />
              <text
                className="bi-chart__value"
                x={labelW + w + 6}
                y={y + barH / 2 + 4}
                fontSize="11"
              >
                {agent.totalExecutions.toLocaleString()} ({agent.successRate.toFixed(0)}%)
              </text>
            </g>
          );
        })}
      </svg>
      {hover && <AgentTooltip agent={sorted.find((a) => a.agentId === hover)!} />}
    </div>
  );
}

function AgentTooltip({ agent }: { agent: AgentsResponse['agents'][0] }) {
  return (
    <div className="bi-chart__tooltip" style={{ top: 4, right: 4 }}>
      <strong>{agent.agentName}</strong>
      <br />
      Executions: {agent.totalExecutions.toLocaleString()}
      <br />
      Success: {agent.successRate.toFixed(1)}%<br />
      Avg: {agent.avgResponseTimeMs.toFixed(0)}ms
    </div>
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}\u2026` : s;
}
