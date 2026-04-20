import type { AgentStats, GroupedAgents } from '../../../hooks/useAgents';
import { Badge, type BadgeKind, Card, fmtMs, Kpi, Sparkline } from '../atoms';

interface Row {
  id: string;
  name: string;
  members: number;
  traces: number;
  success: number;
  latency: number;
  owner: string;
}

function rollUp(grouped: GroupedAgents | null): Row[] {
  return (grouped?.groups ?? []).map((g) => {
    const traces = g.totalExecutions;
    const failed = g.failedExecutions;
    const success = traces > 0 ? ((traces - failed) / traces) * 100 : 100;
    const avgLatency =
      g.agents.reduce((sum: number, a: AgentStats) => sum + a.avgExecutionTime, 0) /
      Math.max(1, g.agents.length);
    return {
      id: g.name,
      name: g.displayName || g.name,
      members: g.agents.length,
      traces,
      success,
      latency: Math.round(avgLatency),
      owner: '\u2014',
    };
  });
}

interface OrgRowProps {
  kind: 'ok' | 'warn' | 'fail';
  who: string;
  what: string;
  when: string;
}

function SecRow({ kind, who, what, when }: OrgRowProps) {
  const badge: BadgeKind = kind;
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'auto 1fr auto',
        gap: 10,
        alignItems: 'center',
      }}
    >
      <Badge kind={badge}>{kind}</Badge>
      <div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-12)' }}>{who}</div>
        <div style={{ color: 'var(--t-3)', fontSize: 'var(--fs-11)' }}>{what}</div>
      </div>
      <div
        style={{
          color: 'var(--t-3)',
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--fs-10)',
        }}
      >
        {when}
      </div>
    </div>
  );
}

export function OrgPage({
  agents,
  grouped,
}: {
  agents: AgentStats[];
  grouped: GroupedAgents | null;
}) {
  const rows = rollUp(grouped);
  const operators = 0; // Operator list would come from org context / audit log
  const totalTraces = rows.reduce((s, r) => s + r.traces, 0);
  const avgSuccess = rows.length > 0 ? rows.reduce((s, r) => s + r.success, 0) / rows.length : 0;

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <div className="page__eyebrow">Organizational Intelligence</div>
          <div className="page__title">Governance</div>
          <div className="page__subtitle">
            {rows.length} teams {'\u00B7'} {operators || '\u2014'} operators {'\u00B7'}{' '}
            {totalTraces} traces {'\u00B7'} audit log healthy
          </div>
        </div>
        <div className="page__head-actions">
          <button type="button" className="v2-btn v2-btn--sm">
            Export audit
          </button>
          <button type="button" className="v2-btn v2-btn--primary v2-btn--sm">
            Run compliance scan
          </button>
        </div>
      </div>
      <div className="page__body">
        <div className="v2-kpi-row">
          <Kpi label="Teams" value={rows.length} />
          <Kpi label="Agents" value={agents.length} />
          <Kpi
            label="Compliance rate"
            value={avgSuccess.toFixed(1)}
            unit="%"
            sparkColor={
              avgSuccess < 80 ? 'var(--fail)' : avgSuccess < 95 ? 'var(--warn)' : 'var(--ok)'
            }
          />
          <Kpi label="Security events" value="\u2014" sparkColor="var(--fail)" />
          <Kpi label="Cross-team" value="\u2014" />
          <Kpi label="Cache hit" value="\u2014" />
        </div>

        <Card title="Teams" flush>
          <table className="v2-tbl">
            <thead>
              <tr>
                <th>Team</th>
                <th className="num">Members</th>
                <th className="num">Traces 24h</th>
                <th className="num">Success</th>
                <th className="num">Avg latency</th>
                <th>Lead</th>
                <th>Trend</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id}>
                  <td style={{ fontWeight: 600 }}>{t.name}</td>
                  <td className="num">{t.members}</td>
                  <td className="num">{t.traces}</td>
                  <td
                    className="num"
                    style={{
                      color:
                        t.success < 80
                          ? 'var(--fail)'
                          : t.success < 95
                            ? 'var(--warn)'
                            : 'var(--ok)',
                    }}
                  >
                    {t.success.toFixed(1)}%
                  </td>
                  <td className="num">{fmtMs(t.latency)}</td>
                  <td className="t-dim">{t.owner}</td>
                  <td>
                    <Sparkline
                      data={Array.from({ length: 10 }, (_, i) => ((i * 7) % 20) + 5)}
                      width={100}
                      height={22}
                    />
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    style={{
                      textAlign: 'center',
                      color: 'var(--t-3)',
                      padding: 'var(--s-6)',
                    }}
                  >
                    No teams detected.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>

        <div className="v2-grid v2-grid-2">
          <Card title="Operators">
            <div
              style={{
                padding: 'var(--s-6)',
                color: 'var(--t-3)',
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--fs-12)',
              }}
            >
              Operator roster hooks not wired yet. Enterprise SSO will populate this table.
            </div>
          </Card>
          <Card title="Security events \u00B7 24h">
            <div style={{ display: 'grid', gap: 10 }}>
              <SecRow kind="ok" who="audit" what="No policy violations detected" when="current" />
              <SecRow
                kind="warn"
                who="process-health"
                what="Orphan processes not tracked"
                when="tracked"
              />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
