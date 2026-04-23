import { type GuardDef, type GuardFire, useGuards } from '../../../hooks/useGuards';
import { Badge, type BadgeKind, Card, fmtAgo, fmtMs, Kpi, StatusPill } from '../atoms';

function modeBadge(mode: GuardDef['mode']): BadgeKind {
  if (mode === 'ABORT') return 'fail';
  if (mode === 'BLOCK') return 'warn';
  return 'info';
}

function severityBadge(sev: GuardFire['severity']): BadgeKind {
  if (sev === 'fail') return 'fail';
  if (sev === 'warn') return 'warn';
  return 'info';
}

export function GuardsPage() {
  const { data, loading, error } = useGuards();

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <div className="page__eyebrow">AgentFlow {'\u00B7'} Runtime Guards</div>
          <div className="page__title">Adaptive enforcement</div>
          <div className="page__subtitle">
            Thresholds learned from mined patterns {'\u00B7'} zero LLM cost {'\u00B7'} fires in-line
          </div>
        </div>
        <div className="page__head-actions">
          <button type="button" className="v2-btn v2-btn--sm">
            Simulate
          </button>
          <button type="button" className="v2-btn v2-btn--primary v2-btn--sm">
            + new guard
          </button>
        </div>
      </div>

      {data.source === 'fallback' && !loading && (
        <div
          style={{
            margin: 'var(--s-6) var(--s-8) 0',
            padding: '8px 14px',
            background: 'oklch(from var(--warn) l c h / 0.10)',
            border: '1px solid oklch(from var(--warn) l c h / 0.30)',
            borderRadius: 'var(--radius)',
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--fs-11)',
            color: 'var(--t-2)',
          }}
        >
          <span
            style={{
              color: 'var(--warn)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              fontSize: 'var(--fs-10)',
              marginRight: 8,
            }}
          >
            preview
          </span>
          Showing default guard registry {'\u2014'} <code>GET /api/guards</code> not wired. Connect
          SOMA policy-bridge to surface live fire counts.
        </div>
      )}

      {error && (
        <div
          style={{
            margin: 'var(--s-6) var(--s-8) 0',
            padding: '8px 14px',
            background: 'oklch(from var(--fail) l c h / 0.10)',
            border: '1px solid oklch(from var(--fail) l c h / 0.30)',
            borderRadius: 'var(--radius)',
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--fs-11)',
            color: 'var(--fail)',
          }}
        >
          {error}
        </div>
      )}

      <div className="page__body">
        <div className="v2-kpi-row">
          <Kpi label="Guards active" value={`${data.stats.active} / ${data.stats.total}`} />
          <Kpi label="Fires \u00B7 24h" value={data.stats.fires24h.toLocaleString()} />
          <Kpi
            label="Violations"
            value={data.stats.violations24h}
            sparkColor={data.stats.violations24h > 0 ? 'var(--warn)' : 'var(--ok)'}
          />
          <Kpi label="Blocks" value={data.stats.blocks24h} />
          <Kpi label="Aborts" value={data.stats.aborts24h} />
          <Kpi label="Avg overhead" value={fmtMs(data.stats.avgOverheadMs)} />
        </div>

        <Card title="Guards" flush>
          <table className="v2-tbl">
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
                <tr key={g.name}>
                  <td className="mono">{g.name}</td>
                  <td>
                    <Badge kind={modeBadge(g.mode)}>{g.mode}</Badge>
                  </td>
                  <td className="mono t-dim" style={{ fontSize: 'var(--fs-11)' }}>
                    {g.threshold}
                  </td>
                  <td className="num">{g.fires24h.toLocaleString()}</td>
                  <td
                    className="num"
                    style={{
                      color:
                        g.violations24h > 30
                          ? 'var(--warn)'
                          : g.violations24h > 0
                            ? 'var(--t-2)'
                            : 'var(--t-3)',
                    }}
                  >
                    {g.violations24h}
                  </td>
                  <td>
                    {g.adaptive ? (
                      <Badge kind="accent">adaptive</Badge>
                    ) : (
                      <span className="t-dim">static</span>
                    )}
                  </td>
                  <td>
                    <StatusPill status={g.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <div className="v2-grid v2-grid-2">
          <Card title="Recent fires">
            <div style={{ display: 'grid', gap: 10 }}>
              {data.fires.length === 0 && (
                <div
                  style={{
                    color: 'var(--t-3)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'var(--fs-12)',
                  }}
                >
                  No recent fires recorded.
                </div>
              )}
              {data.fires.map((f) => (
                <div
                  key={`${f.guardName}-${f.firedAt}-${f.agentId}`}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'auto 1fr auto',
                    gap: 10,
                    alignItems: 'center',
                  }}
                >
                  <Badge kind={severityBadge(f.severity)}>{f.severity}</Badge>
                  <div>
                    <div
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 'var(--fs-12)',
                      }}
                    >
                      <span style={{ color: 'var(--accent)' }}>{f.guardName}</span> {'\u00B7'}{' '}
                      {f.agentId}
                    </div>
                    <div style={{ color: 'var(--t-3)', fontSize: 'var(--fs-11)' }}>{f.note}</div>
                  </div>
                  <div
                    style={{
                      color: 'var(--t-3)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 'var(--fs-10)',
                    }}
                  >
                    {fmtAgo(f.firedAt)}
                  </div>
                </div>
              ))}
            </div>
          </Card>
          <Card title="Adaptive feedback" sub="AgentFlow \u2192 guards loop">
            <div
              style={{
                display: 'grid',
                gap: 10,
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--fs-12)',
              }}
            >
              <FeedbackItem
                when="last update"
                title="Thresholds tuning"
                body="Adaptive guards recompute thresholds from the last 24h of mined patterns."
              />
              <FeedbackItem
                when="integration"
                title="SOMA policy-bridge"
                body="When the SOMA Pro vault is connected, policy promotions surface here as 'policy_adapt' events."
              />
              <FeedbackItem
                when="status"
                title={`API ${data.source === 'api' ? 'connected' : 'offline'}`}
                body={
                  data.source === 'api'
                    ? 'Live telemetry from /api/guards.'
                    : 'Using fallback registry. Wire GET /api/guards to show real data.'
                }
              />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function FeedbackItem({ when, title, body }: { when: string; title: string; body: string }) {
  return (
    <div
      style={{
        padding: 10,
        background: 'var(--bg-2)',
        border: '1px solid var(--bd)',
        borderRadius: 'var(--radius)',
      }}
    >
      <div
        className="t-dim"
        style={{
          fontSize: 'var(--fs-10)',
          textTransform: 'uppercase',
          letterSpacing: '.08em',
          marginBottom: 3,
        }}
      >
        {when}
      </div>
      <div style={{ color: 'var(--t-1)', fontWeight: 600 }}>{title}</div>
      <div style={{ color: 'var(--t-2)', fontSize: 'var(--fs-11)', marginTop: 2 }}>{body}</div>
    </div>
  );
}
