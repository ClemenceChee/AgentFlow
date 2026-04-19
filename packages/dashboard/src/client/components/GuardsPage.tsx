// packages/dashboard/src/client/components/GuardsPage.tsx
//
// Runtime Guards dashboard. Mirrors the look of AicpPage / SomaPage.
// Shows the guard registry, recent fires, and the adaptive-feedback log
// that links AgentFlow -> Guards (thresholds auto-tuned from mined data).

import { useState } from 'react';
import type { GuardDef, GuardFire } from '../hooks/useGuards';
import { useGuards } from '../hooks/useGuards';

function modeClass(m: GuardDef['mode']): string {
  return m === 'ABORT' ? 'guard-mode--fail' : m === 'BLOCK' ? 'guard-mode--warn' : 'guard-mode--info';
}

function fmtAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60_000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function Kpi({ label, value, delta }: { label: string; value: string; delta?: string }) {
  return (
    <div className="guards-kpi">
      <div className="guards-kpi__label">{label}</div>
      <div className="guards-kpi__value">{value}</div>
      {delta && <div className="guards-kpi__delta">{delta}</div>}
    </div>
  );
}

function GuardRow({ g }: { g: GuardDef }) {
  return (
    <tr>
      <td className="mono">{g.name}</td>
      <td>
        <span className={`guard-mode ${modeClass(g.mode)}`}>{g.mode}</span>
      </td>
      <td className="mono t-dim" style={{ fontSize: 'var(--xs)' }}>
        {g.threshold}
      </td>
      <td className="num">{g.fires24h.toLocaleString()}</td>
      <td className="num">{g.violations24h}</td>
      <td>
        {g.adaptive ? (
          <span className="guard-badge guard-badge--accent">adaptive</span>
        ) : (
          <span className="t-dim">static</span>
        )}
      </td>
      <td>
        <span className={`guard-status guard-status--${g.status}`}>
          {g.status === 'ok' ? '\u25CF' : g.status === 'warn' ? '\u25B2' : '\u25A0'} {g.status}
        </span>
      </td>
    </tr>
  );
}

function FireRow({ f }: { f: GuardFire }) {
  return (
    <div className="guard-fire">
      <span className={`guard-fire__severity guard-fire__severity--${f.severity}`}>
        {f.severity}
      </span>
      <div className="guard-fire__body">
        <div className="guard-fire__title">
          <span className="guard-fire__guard">{f.guardName}</span>
          <span className="t-dim"> \u00B7 {f.agentId}</span>
        </div>
        <div className="guard-fire__note">{f.note}</div>
      </div>
      <div className="guard-fire__time">{fmtAgo(f.firedAt)}</div>
    </div>
  );
}

export function GuardsPage() {
  const { data, loading, error, refetch } = useGuards();
  const [simulating, setSimulating] = useState(false);

  if (loading && !data) return <div className="guards-page__loading">Loading guards\u2026</div>;
  if (error && !data) {
    return (
      <div className="guards-page__empty">
        Could not load guards ({error}). The <code>/api/guards</code> endpoint may not be wired up
        yet.
      </div>
    );
  }
  if (!data) return <div className="guards-page__empty">No guards configured.</div>;

  return (
    <div className="guards-page">
      {/* Header */}
      <div className="guards-page__header">
        <div>
          <div className="guards-page__eyebrow">AgentFlow \u00B7 Runtime Guards</div>
          <h2 className="guards-page__title">Adaptive enforcement</h2>
          <p className="guards-page__subtitle">
            Thresholds learned from mined patterns. Fires in-line. Zero LLM cost.
          </p>
        </div>
        <div className="guards-page__head-actions">
          <button
            type="button"
            className="guards-page__btn"
            onClick={() => setSimulating((s) => !s)}
          >
            Simulate
          </button>
          <button type="button" className="guards-page__btn" onClick={refetch}>
            {'\u27F3'} Refresh
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="guards-page__kpis">
        <Kpi label="Guards active" value={`${data.stats.active} / ${data.stats.total}`} />
        <Kpi label="Fires \u00B7 24h" value={data.stats.fires24h.toLocaleString()} />
        <Kpi
          label="Violations"
          value={String(data.stats.violations24h)}
          delta={data.stats.deltaViolations > 0 ? `+${data.stats.deltaViolations}` : String(data.stats.deltaViolations)}
        />
        <Kpi label="Blocks" value={String(data.stats.blocks24h)} />
        <Kpi label="Aborts" value={String(data.stats.aborts24h)} />
        <Kpi label="Avg overhead" value={`${data.stats.avgOverheadMs}ms`} />
      </div>

      {/* Guard registry */}
      <div className="guards-page__section">
        <h3 className="guards-page__section-title">Registry</h3>
        <table className="guards-table">
          <thead>
            <tr>
              <th>Guard</th>
              <th>Mode</th>
              <th>Threshold</th>
              <th className="num">Fires \u00B7 24h</th>
              <th className="num">Violations</th>
              <th>Adaptive</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {data.guards.map((g) => (
              <GuardRow key={g.name} g={g} />
            ))}
          </tbody>
        </table>
      </div>

      {/* Two-column: recent fires + adaptive feedback */}
      <div className="guards-page__two-col">
        <div className="guards-page__section">
          <h3 className="guards-page__section-title">Recent fires</h3>
          <div className="guards-fires">
            {data.fires.length === 0 && <div className="t-dim">No recent fires.</div>}
            {data.fires.map((f) => (
              <FireRow key={f.id} f={f} />
            ))}
          </div>
        </div>

        <div className="guards-page__section">
          <h3 className="guards-page__section-title">Adaptive feedback</h3>
          <p className="t-dim" style={{ fontSize: 'var(--xs)', marginBottom: 'var(--s2)' }}>
            AgentFlow \u2192 Guards loop. Thresholds auto-tune from mined run distributions.
          </p>
          <div className="guards-feedback">
            <FeedbackItem
              when="12m ago"
              title="timeout.tool.retrieve adjusted"
              body="p95\u00D71.5 raised from 2.6s \u2192 3.9s based on 1,240 mined runs."
            />
            <FeedbackItem
              when="1h ago"
              title="New bottleneck candidate"
              body="tool.notify flagged (p95 \u00D7 10.1). Guard draft created in review queue."
            />
            <FeedbackItem
              when="2h ago"
              title="SOMA policy promoted"
              body="policy-bridge promoted rate_limit_upstream from WARN \u2192 BLOCK."
            />
          </div>
        </div>
      </div>

      {simulating && (
        <div className="guards-page__section">
          <h3 className="guards-page__section-title">Simulation \u2014 stub</h3>
          <p className="t-dim" style={{ fontSize: 'var(--xs)' }}>
            Wire this to <code>POST /api/guards/simulate</code> with a trace fixture to preview how
            proposed threshold changes would have affected the last 24h of runs.
          </p>
        </div>
      )}
    </div>
  );
}

function FeedbackItem({ when, title, body }: { when: string; title: string; body: string }) {
  return (
    <div className="guards-feedback__item">
      <div className="guards-feedback__when">{when}</div>
      <div className="guards-feedback__title">{title}</div>
      <div className="guards-feedback__body">{body}</div>
    </div>
  );
}
