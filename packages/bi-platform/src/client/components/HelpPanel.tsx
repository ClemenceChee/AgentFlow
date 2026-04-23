import { useState } from 'react';

interface Props {
  onClose: () => void;
}

const sections = [
  {
    title: 'Executive Dashboard',
    content:
      'High-level KPI overview showing agent performance, ROI, compliance, and system health. Click any KPI card to drill down. Real-time data refreshes every 15 seconds.',
  },
  {
    title: 'Operational Dashboard',
    content:
      'Detailed agent performance table with cost analysis and anomaly tracking. Switch between Agents, Cost Analysis, and Anomalies tabs. Click "Details" on any agent for drill-down.',
  },
  {
    title: 'Compliance Dashboard',
    content:
      'Regulatory compliance overview with per-regulation scores. Shows violation severity breakdown and active remediation tracking. Click a regulation card to filter violations.',
  },
  {
    title: 'Decisions Dashboard',
    content:
      'AI-powered decision intelligence showing recommendations, cross-agent patterns, delegation ROI, and compliance risks. Recommendations are sorted by priority with confidence scores and action items. Patterns detect failure cascades, cost trends, and drift across agents.',
  },
  {
    title: 'Data Sources',
    content:
      'The BI Platform aggregates data from three sources: SOMA (organizational intelligence), AgentFlow (execution observability), and OpsIntel (operational verification). Freshness indicators in the status bar show sync status.',
  },
  {
    title: 'Real-time Updates',
    content:
      'All dashboards auto-refresh at regular intervals. The green "Live" indicator confirms active data streaming. KPIs refresh every 15s, compliance every 30s, freshness every 10s.',
  },
  {
    title: 'Keyboard Shortcuts',
    content:
      '1 = Executive, 2 = Operational, 3 = Compliance, 4 = Decisions. Esc = close panels. ? = help. These work anywhere on the page.',
  },
  {
    title: 'API Access',
    content:
      'All dashboard data is available via REST API at /api/v1/. See /api/v1/docs for full endpoint documentation. Use Bearer token authentication for programmatic access.',
  },
];

export function HelpPanel({ onClose }: Props) {
  const [expanded, setExpanded] = useState<number | null>(null);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 100,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg2)',
          border: '1px solid var(--bd)',
          borderRadius: 'var(--r2)',
          width: 500,
          maxHeight: '80vh',
          overflow: 'auto',
          padding: 'var(--s5)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--s4)' }}
        >
          <h2 style={{ fontSize: 'var(--lg)' }}>Help</h2>
          <button className="bi-btn bi-btn--sm" onClick={onClose}>
            &times;
          </button>
        </div>
        {sections.map((s, i) => (
          <div key={i} style={{ borderBottom: '1px solid var(--bdm)', padding: 'var(--s3) 0' }}>
            <button
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--t1)',
                cursor: 'pointer',
                fontSize: 'var(--sm)',
                fontWeight: 600,
                width: '100%',
                textAlign: 'left',
                display: 'flex',
                justifyContent: 'space-between',
              }}
              onClick={() => setExpanded(expanded === i ? null : i)}
            >
              {s.title}
              <span style={{ color: 'var(--t3)' }}>{expanded === i ? '\u25B2' : '\u25BC'}</span>
            </button>
            {expanded === i && (
              <p
                style={{
                  fontSize: 'var(--sm)',
                  color: 'var(--t2)',
                  marginTop: 'var(--s2)',
                  lineHeight: 1.5,
                }}
              >
                {s.content}
              </p>
            )}
          </div>
        ))}
        <div style={{ marginTop: 'var(--s4)', fontSize: 'var(--xs)', color: 'var(--t3)' }}>
          API docs: <span style={{ fontFamily: 'var(--fm)' }}>/api/v1/docs</span>
        </div>
      </div>
    </div>
  );
}
