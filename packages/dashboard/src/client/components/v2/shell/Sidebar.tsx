import { useMemo, useState } from 'react';
import type { AgentStats, GroupedAgents } from '../../../hooks/useAgents';
import { Dot } from '../atoms/Dot';

function deriveDotKind(a: AgentStats): 'ok' | 'warn' | 'fail' | 'idle' {
  if (a.totalExecutions === 0) return 'idle';
  if (a.failedExecutions > 0 && a.successRate < 50) return 'fail';
  if (a.successRate < 95 || a.failedExecutions > 0) return 'warn';
  return 'ok';
}

export function Sidebar({
  grouped,
  selectedAgent,
  onSelectAgent,
  collapsed,
}: {
  grouped: GroupedAgents | null;
  selectedAgent: string | null;
  onSelectAgent: (id: string) => void;
  collapsed?: boolean;
}) {
  const [q, setQ] = useState('');

  const agents = useMemo<AgentStats[]>(
    () => grouped?.groups.flatMap((g) => g.agents) ?? [],
    [grouped],
  );

  if (collapsed) {
    return (
      <aside className="shell__sidebar is-collapsed" aria-label="Agents (collapsed)">
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            padding: 10,
            alignItems: 'center',
          }}
        >
          {agents.map((a) => (
            <button
              key={a.agentId}
              type="button"
              title={a.agentId}
              onClick={() => onSelectAgent(a.agentId)}
              className="v2-btn v2-btn--ghost v2-btn--sm"
              style={{ padding: 6, width: 34, height: 34, borderColor: 'transparent' }}
              aria-label={`Select ${a.agentId}`}
            >
              <Dot kind={deriveDotKind(a)} />
            </button>
          ))}
        </div>
      </aside>
    );
  }

  const query = q.toLowerCase();
  const groups = grouped?.groups ?? [];

  return (
    <aside className="shell__sidebar" aria-label="Agents">
      <div className="sidebar__header">
        <div className="sidebar__title">Agents</div>
        <div className="sidebar__count">{agents.length}</div>
      </div>
      <div className="sidebar__filter">
        <input
          placeholder={'filter\u2026 (\u2303F)'}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Filter agents"
        />
      </div>
      {groups.map((group) => {
        const visible = group.agents.filter((a) => a.agentId.toLowerCase().includes(query));
        if (!visible.length) return null;
        return (
          <div key={group.name} className="sidebar__section">
            <div className="sidebar__section-head">
              <span aria-hidden>{'\u25BE'}</span>
              {group.displayName || group.name}
              <span className="sidebar__section-count">{visible.length}</span>
            </div>
            {visible.map((a) => {
              const dotKind = deriveDotKind(a);
              const active = selectedAgent === a.agentId;
              return (
                <button
                  type="button"
                  key={a.agentId}
                  className={`agent-row ${active ? 'is-active' : ''}`}
                  onClick={() => onSelectAgent(a.agentId)}
                  aria-current={active ? 'true' : undefined}
                >
                  <Dot kind={dotKind} />
                  <div>
                    <div className="agent-row__name">{a.displayName ?? a.agentId}</div>
                    <div className="agent-row__meta">
                      {a.totalExecutions} {'\u00B7'} {a.successRate.toFixed(1)}% {'\u00B7'}{' '}
                      {a.failedExecutions} fail
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        );
      })}
      {groups.length === 0 && (
        <div
          style={{
            padding: 'var(--s-6)',
            color: 'var(--t-3)',
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--fs-12)',
          }}
        >
          No agents yet.
        </div>
      )}
    </aside>
  );
}
