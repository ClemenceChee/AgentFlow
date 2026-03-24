/**
 * Agent Health Briefing — single-page operational intelligence view.
 * Synthesizes: status, constraints, decisions, policies, contradictions,
 * peer comparison, and drift data for one agent.
 */

import { useEffect, useState } from 'react';

interface IntelItem {
  type: string;
  name: string;
  claim: string;
  confidence?: string;
}

interface Peer {
  name: string;
  successRate: number;
  runs: number;
}

interface BriefingData {
  agentId: string;
  status: 'critical' | 'degraded' | 'healthy';
  totalExecutions: number;
  failureRate: number;
  failureCount: number;
  intelligence: {
    total: number;
    byType: Record<string, IntelItem[]>;
  };
  peers: Peer[];
  drift: { status: string; dataPoints: number } | null;
}

const STATUS_CONFIG = {
  critical: { icon: '\u26D4', color: 'var(--fail)', label: 'CRITICAL' },
  degraded: { icon: '\u26A0', color: 'var(--warn, orange)', label: 'DEGRADED' },
  healthy: { icon: '\u2714', color: 'var(--ok)', label: 'HEALTHY' },
};

export function AgentHealthBriefing({ agentId }: { agentId: string }) {
  const [data, setData] = useState<BriefingData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/agents/${encodeURIComponent(agentId)}/health-briefing`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))))
      .then(setData)
      .catch((e) => setError(e.message));
  }, [agentId]);

  if (error)
    return (
      <div className="briefing">
        <em>Briefing unavailable</em>
      </div>
    );
  if (!data)
    return (
      <div className="briefing">
        <em>Loading briefing...</em>
      </div>
    );

  const cfg = STATUS_CONFIG[data.status];

  return (
    <div className="briefing">
      {/* Status */}
      <div className="briefing__status" style={{ borderLeftColor: cfg.color }}>
        <span style={{ fontSize: 20 }}>{cfg.icon}</span>
        <div>
          <strong style={{ color: cfg.color }}>{cfg.label}</strong>
          <span style={{ marginLeft: 8, color: 'var(--t2)' }}>
            {(data.failureRate * 100).toFixed(1)}% failure rate ({data.failureCount}/
            {data.totalExecutions})
          </span>
        </div>
      </div>

      {/* Drift */}
      {data.drift && (
        <div className="briefing__section">
          <strong>Trend:</strong>{' '}
          <span style={{ color: data.drift.status === 'degrading' ? 'var(--fail)' : 'var(--t2)' }}>
            {data.drift.status} ({data.drift.dataPoints} data points)
          </span>
        </div>
      )}

      {/* Intelligence sections */}
      {['contradiction', 'constraint', 'decision', 'policy', 'insight'].map((type) => {
        const items = data.intelligence.byType[type];
        if (!items || items.length === 0) return null;
        const label =
          type === 'contradiction'
            ? '\u26A0 Contradictions'
            : type === 'constraint'
              ? 'Why It Fails'
              : type === 'decision'
                ? 'What To Do'
                : type === 'policy'
                  ? 'Active Policies'
                  : 'Insights';

        return (
          <div key={type} className="briefing__section">
            <div className="briefing__section-header">
              {label} <span className="briefing__count">({items.length})</span>
            </div>
            {items.slice(0, 3).map((item, i) => (
              <div key={i} className="briefing__item">
                <div className="briefing__item-name">{item.name}</div>
                {item.claim && <div className="briefing__item-claim">{item.claim}</div>}
              </div>
            ))}
            {items.length > 3 && <div className="briefing__more">+ {items.length - 3} more</div>}
          </div>
        );
      })}

      {/* Peer Comparison */}
      {data.peers.length > 1 && (
        <div className="briefing__section">
          <div className="briefing__section-header">Peer Comparison</div>
          {data.peers.map((peer) => {
            const isMe = peer.name === agentId || peer.name === agentId.replace(/:/g, '-');
            return (
              <div key={peer.name} className={`briefing__peer ${isMe ? 'briefing__peer--me' : ''}`}>
                <span className="briefing__peer-name">{peer.name}</span>
                <span className="briefing__peer-bar">
                  <span
                    className="briefing__peer-fill"
                    style={{
                      width: `${peer.successRate * 100}%`,
                      background:
                        peer.successRate > 0.9
                          ? 'var(--ok)'
                          : peer.successRate > 0.5
                            ? 'var(--warn, orange)'
                            : 'var(--fail)',
                    }}
                  />
                </span>
                <span className="briefing__peer-pct">{(peer.successRate * 100).toFixed(0)}%</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
