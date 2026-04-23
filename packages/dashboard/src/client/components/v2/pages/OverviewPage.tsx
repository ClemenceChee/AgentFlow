import { useMemo } from 'react';
import type { AgentStats, GroupedAgents } from '../../../hooks/useAgents';
import type { ProcessHealthData } from '../../../hooks/useProcessHealth';
import type { TraceEntry } from '../../../hooks/useTraces';
import type { BadgeKind, DotKind } from '../atoms';
import { Badge, Card, Chip, Dot, fmtAgo, fmtMs, fmtTime, Kpi, Sparkline } from '../atoms';
import type { ProcessActivity, ProcessEdge } from '../charts';
import { Heatmap, LineChart, ProcessMap, StateMachine } from '../charts';

interface TeamRollup {
  id: string;
  name: string;
  members: number;
  traces: number;
  success: number;
  latency: number;
  owner: string;
}

function deriveDotKind(a: AgentStats): DotKind {
  if (a.totalExecutions === 0) return 'idle';
  if (a.failedExecutions > 0 && a.successRate < 50) return 'fail';
  if (a.successRate < 95 || a.failedExecutions > 0) return 'warn';
  return 'ok';
}

function toBadge(kind: DotKind): BadgeKind {
  return kind === 'idle' ? 'neutral' : kind;
}

/** Group agents by their team field (first slash-prefix of agentId) as a best-effort. */
function rollUpTeams(_agents: AgentStats[], groups: GroupedAgents | null): TeamRollup[] {
  const list = groups?.groups ?? [];
  if (list.length === 0) return [];
  return list.map((g) => {
    const members = g.agents.length;
    const traces = g.totalExecutions;
    const failed = g.failedExecutions;
    const success = traces > 0 ? ((traces - failed) / traces) * 100 : 100;
    const avgLatency =
      g.agents.reduce((sum, a) => sum + a.avgExecutionTime, 0) / Math.max(1, members);
    return {
      id: g.name,
      name: g.displayName || g.name,
      members,
      traces,
      success,
      latency: Math.round(avgLatency),
      owner: '\u2014',
    };
  });
}

/** Transform 24-hour traces into an hourly bucket array. */
function throughputBuckets(traces: TraceEntry[]): number[] {
  const now = Date.now();
  const start = now - 24 * 60 * 60 * 1000;
  const buckets = new Array<number>(24).fill(0);
  for (const t of traces) {
    if (t.timestamp < start) continue;
    const hoursAgo = Math.floor((now - t.timestamp) / (60 * 60 * 1000));
    const idx = 23 - hoursAgo;
    if (idx >= 0 && idx < 24) buckets[idx] += 1;
  }
  return buckets;
}

/** Synthesize a weekly × hourly heatmap from traces (or fall back to pseudo-random). */
function traceHeatmap(traces: TraceEntry[]): ('fail' | 'warn' | number)[][] {
  if (traces.length === 0) return [];
  const now = Date.now();
  const weekStart = now - 7 * 24 * 60 * 60 * 1000;
  const grid: ('fail' | 'warn' | number)[][] = Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, () => 0 as number),
  );
  const fails = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));

  for (const t of traces) {
    if (t.timestamp < weekStart) continue;
    const d = new Date(t.timestamp);
    // Monday=0 ... Sunday=6
    const jsDay = d.getDay(); // 0=Sun..6=Sat
    const row = (jsDay + 6) % 7;
    const col = d.getHours();
    (grid[row][col] as number) += 1;
    if (t.status === 'failed') fails[row][col] += 1;
  }

  return grid.map((row, r) =>
    row.map((v, c) => {
      const fail = fails[r][c];
      if (fail > 0 && (v === 0 || fail / v > 0.2)) return 'fail';
      if (fail > 0) return 'warn';
      return v as number;
    }),
  );
}

/** Convert ProcessModel-like transitions into ProcessMap activities + edges. */
function processModelToMap(
  transitions: { from: string; to: string; count: number }[] | undefined,
): { activities: ProcessActivity[]; edges: ProcessEdge[] } {
  if (!transitions || transitions.length === 0) return { activities: [], edges: [] };

  const nodeSet = new Set<string>();
  for (const t of transitions) {
    nodeSet.add(t.from);
    nodeSet.add(t.to);
  }
  const nodes = [...nodeSet];

  // Topological-ish layout: count in/out degrees, sort by depth.
  const inDegree: Record<string, number> = {};
  const outDegree: Record<string, number> = {};
  for (const n of nodes) {
    inDegree[n] = 0;
    outDegree[n] = 0;
  }
  for (const t of transitions) {
    inDegree[t.to] += 1;
    outDegree[t.from] += 1;
  }

  const depth: Record<string, number> = {};
  const visited = new Set<string>();
  const queue: string[] = nodes.filter((n) => inDegree[n] === 0);
  for (const n of queue) depth[n] = 0;

  while (queue.length > 0) {
    const n = queue.shift();
    if (!n) break;
    if (visited.has(n)) continue;
    visited.add(n);
    const d = depth[n] ?? 0;
    for (const t of transitions) {
      if (t.from === n) {
        const next = t.to;
        depth[next] = Math.max(depth[next] ?? 0, d + 1);
        queue.push(next);
      }
    }
  }
  for (const n of nodes) if (depth[n] == null) depth[n] = 0;

  const maxDepth = Math.max(...Object.values(depth), 0);
  const cols: string[][] = Array.from({ length: maxDepth + 1 }, () => []);
  for (const n of nodes) cols[depth[n]].push(n);

  const canvasW = 1080;
  const canvasH = 240;
  const xStep = canvasW / Math.max(1, maxDepth + 1);

  // Count totals per node as sum of transitions touching it.
  const count: Record<string, number> = {};
  for (const n of nodes) count[n] = 0;
  for (const t of transitions) {
    count[t.from] += t.count;
    count[t.to] += t.count;
  }

  const activities: ProcessActivity[] = [];
  cols.forEach((col, colIdx) => {
    const yStep = canvasH / (col.length + 1);
    col.forEach((n, i) => {
      activities.push({
        id: n,
        x: 20 + xStep * colIdx + xStep / 2,
        y: 20 + yStep * (i + 1),
        count: count[n],
        failRate: 0, // ProcessModelData doesn't expose fail rate per node
      });
    });
  });

  const edges: ProcessEdge[] = transitions.map((t) => [t.from, t.to, t.count]);
  return { activities, edges };
}

interface AlertRowProps {
  kind: 'ok' | 'warn' | 'fail' | 'info';
  who: string;
  what: string;
  when: number;
}

function AlertRow({ kind, who, what, when }: AlertRowProps) {
  const badgeKind: BadgeKind = kind === 'info' ? 'info' : kind;
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'auto 1fr auto',
        gap: 10,
        alignItems: 'center',
      }}
    >
      <Badge kind={badgeKind}>{kind}</Badge>
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
        {fmtAgo(when)}
      </div>
    </div>
  );
}

function AgentsTable({
  agents,
  onSelect,
}: {
  agents: AgentStats[];
  onSelect?: (id: string) => void;
}) {
  return (
    <table className="v2-tbl">
      <thead>
        <tr>
          <th>Agent</th>
          <th>Status</th>
          <th className="num">Traces</th>
          <th className="num">Success</th>
          <th className="num">Failed</th>
          <th className="num">Avg</th>
          <th>Last</th>
        </tr>
      </thead>
      <tbody>
        {agents.map((a) => {
          const kind = deriveDotKind(a);
          return (
            <tr
              key={a.agentId}
              onClick={() => onSelect?.(a.agentId)}
              style={onSelect ? { cursor: 'pointer' } : undefined}
            >
              <td>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <Dot kind={kind} />
                  <span style={{ fontFamily: 'var(--font-mono)' }}>
                    {a.displayName ?? a.agentId}
                  </span>
                </div>
              </td>
              <td>
                <Badge kind={toBadge(kind)}>{kind}</Badge>
              </td>
              <td className="num">{a.totalExecutions}</td>
              <td
                className="num"
                style={{
                  color:
                    a.successRate < 50
                      ? 'var(--fail)'
                      : a.successRate < 95
                        ? 'var(--warn)'
                        : 'var(--t-2)',
                }}
              >
                {a.successRate.toFixed(1)}%
              </td>
              <td
                className="num"
                style={{
                  color: a.failedExecutions > 0 ? 'var(--warn)' : 'var(--t-3)',
                }}
              >
                {a.failedExecutions}
              </td>
              <td className="num">{fmtMs(a.avgExecutionTime)}</td>
              <td className="t-dim">{a.lastExecution ? fmtAgo(a.lastExecution) : '\u2014'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function ActivityStream({ traces }: { traces: TraceEntry[] }) {
  const recent = useMemo(
    () => [...traces].sort((a, b) => b.timestamp - a.timestamp).slice(0, 20),
    [traces],
  );
  if (recent.length === 0) {
    return (
      <div
        style={{
          padding: 'var(--s-6)',
          color: 'var(--t-3)',
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--fs-12)',
        }}
      >
        No recent activity.
      </div>
    );
  }
  return (
    <div style={{ maxHeight: 480, overflowY: 'auto' }}>
      {recent.map((t) => {
        const kind: DotKind = t.status === 'failed' ? 'fail' : 'ok';
        return (
          <div
            key={t.traceKey}
            style={{
              display: 'grid',
              gridTemplateColumns: '70px 14px 1fr',
              gap: 10,
              padding: '8px 16px',
              borderBottom: '1px solid var(--bd-weak)',
              alignItems: 'start',
            }}
          >
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--fs-10)',
                color: 'var(--t-3)',
                paddingTop: 2,
              }}
            >
              {fmtTime(t.timestamp)}
            </div>
            <div style={{ paddingTop: 6 }}>
              <Dot kind={kind} />
            </div>
            <div>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--fs-11)',
                  color: 'var(--t-3)',
                }}
              >
                {t.agentId}
              </div>
              <div style={{ fontSize: 'var(--fs-12)' }}>
                {t.status === 'failed' ? 'Trace failed' : 'Trace completed'}
                {' \u00B7 '}
                {t.nodeCount} nodes {'\u00B7'} {fmtMs(t.duration)}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function buildAlerts(
  agents: AgentStats[],
  health: ProcessHealthData | null,
  traces: TraceEntry[],
): AlertRowProps[] {
  const alerts: AlertRowProps[] = [];

  if (health) {
    for (const svc of health.services) {
      if (svc.systemd?.failed) {
        alerts.push({
          kind: 'fail',
          who: svc.name || 'unnamed',
          what: `Systemd unit failed · ${svc.systemd.restarts} restarts`,
          when: Date.now() - 60_000,
        });
      }
      if (svc.pidFile?.stale) {
        alerts.push({
          kind: 'warn',
          who: svc.name || 'unnamed',
          what: 'Stale PID file (mismatched process)',
          when: Date.now() - 5 * 60_000,
        });
      }
    }
    if (health.orphans?.length > 0) {
      alerts.push({
        kind: 'warn',
        who: 'process-health',
        what: `${health.orphans.length} orphan process(es) not tracked`,
        when: Date.now() - 10 * 60_000,
      });
    }
  }

  const degraded = agents
    .filter((a) => a.totalExecutions > 0 && a.successRate < 95)
    .sort((a, b) => a.successRate - b.successRate)
    .slice(0, 3);
  for (const a of degraded) {
    alerts.push({
      kind: a.successRate < 50 ? 'fail' : 'warn',
      who: a.agentId,
      what: `Success rate ${a.successRate.toFixed(1)}% (${a.failedExecutions} fails / ${a.totalExecutions})`,
      when: a.lastExecution ?? Date.now(),
    });
  }

  if (alerts.length === 0 && traces.length > 0) {
    alerts.push({
      kind: 'ok',
      who: 'fleet',
      what: 'All agents healthy',
      when: Date.now(),
    });
  }

  return alerts.slice(0, 6);
}

export interface OverviewPageProps {
  agents: AgentStats[];
  grouped: GroupedAgents | null;
  traces: TraceEntry[];
  processHealth: ProcessHealthData | null;
  processModel?: { model: { transitions: { from: string; to: string; count: number }[] } } | null;
  onSelectAgent?: (id: string) => void;
  onRefresh?: () => void;
}

export function OverviewPage({
  agents,
  grouped,
  traces,
  processHealth,
  processModel,
  onSelectAgent,
  onRefresh,
}: OverviewPageProps) {
  const okCount = agents.filter((a) => deriveDotKind(a) === 'ok').length;
  const warnCount = agents.filter((a) => deriveDotKind(a) === 'warn').length;
  const failCount = agents.filter((a) => deriveDotKind(a) === 'fail').length;

  const now = Date.now();
  const start24h = now - 24 * 60 * 60 * 1000;
  const traces24h = traces.filter((t) => t.timestamp >= start24h);
  const failed24h = traces24h.filter((t) => t.status === 'failed').length;
  const totalTraces = traces24h.length;
  const successRate = totalTraces > 0 ? ((totalTraces - failed24h) / totalTraces) * 100 : 0;

  const durations = traces24h.map((t) => t.duration).sort((a, b) => a - b);
  const p95 = durations.length
    ? (durations[Math.floor(durations.length * 0.95)] ?? durations[durations.length - 1])
    : 0;

  const teams = rollUpTeams(agents, grouped);
  const teamCount = teams.length;

  const throughput = throughputBuckets(traces);
  const heatmapValues = traceHeatmap(traces);
  const procMap = processModelToMap(processModel?.model?.transitions);
  const alerts = buildAlerts(agents, processHealth, traces);

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <div className="page__eyebrow">Control Plane {'\u00B7'} last 24h</div>
          <div className="page__title">Fleet Overview</div>
          <div className="page__subtitle">
            {agents.length} agents {'\u00B7'} {teamCount} teams {'\u00B7'} {failCount} failing{' '}
            {'\u00B7'} {warnCount} warn
          </div>
        </div>
        <div className="page__head-actions">
          {onRefresh && (
            <button type="button" className="v2-btn v2-btn--sm" onClick={onRefresh}>
              {'\u21BB'} Refresh
            </button>
          )}
          <button type="button" className="v2-btn v2-btn--sm">
            Export
          </button>
        </div>
      </div>

      <div className="page__body">
        <div className="v2-kpi-row">
          <Kpi
            label="Agents online"
            value={okCount + warnCount}
            unit={`/ ${agents.length}`}
            spark={[9, 9, 10, 10, 11, 10, 11]}
          />
          <Kpi
            label="Traces \u00B7 24h"
            value={totalTraces.toLocaleString()}
            spark={throughput.length > 6 ? throughput : undefined}
          />
          <Kpi
            label="Success rate"
            value={successRate.toFixed(1)}
            unit="%"
            sparkColor={
              successRate < 95 ? 'var(--warn)' : successRate < 50 ? 'var(--fail)' : 'var(--ok)'
            }
          />
          <Kpi label="p95 latency" value={fmtMs(p95)} sparkColor="var(--warn)" />
          <Kpi label="Failed \u00B7 24h" value={failed24h} sparkColor="var(--fail)" />
          <Kpi label="Teams" value={teamCount} />
        </div>

        <div className="v2-grid v2-grid-2-1">
          <Card title="Throughput \u00B7 24h" sub="traces/hour" actions={<Chip>all teams</Chip>}>
            <LineChart data={throughput.length ? throughput : [0, 0, 0, 0]} height={140} />
          </Card>
          <Card title="Alerts" sub={`${alerts.length} open`}>
            <div style={{ display: 'grid', gap: 10 }}>
              {alerts.map((a) => (
                <AlertRow key={`${a.who}-${a.what}-${a.when}`} {...a} />
              ))}
              {alerts.length === 0 && (
                <div
                  style={{
                    color: 'var(--t-3)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'var(--fs-12)',
                  }}
                >
                  No open alerts.
                </div>
              )}
            </div>
          </Card>
        </div>

        <div className="v2-grid v2-grid-2">
          <Card title="Agents" sub={`${agents.length} total`} flush>
            <AgentsTable agents={agents} onSelect={onSelectAgent} />
          </Card>
          <Card title="Live activity" sub="real-time stream" flush>
            <ActivityStream traces={traces} />
          </Card>
        </div>

        <Card title="Error distribution" sub="7d \u00D7 24h" actions={<Chip>all agents</Chip>}>
          {heatmapValues.length > 0 ? <Heatmap values={heatmapValues} /> : <Heatmap seed={42} />}
        </Card>

        <div className="v2-grid v2-grid-2">
          <Card title="Process map" sub={`${totalTraces} traces \u00B7 agg`}>
            <ProcessMap activities={procMap.activities} edges={procMap.edges} />
          </Card>
          <Card title="State machine" sub="all agents">
            <StateMachine />
          </Card>
        </div>

        <Card title="Teams" flush>
          <table className="v2-tbl">
            <thead>
              <tr>
                <th>Team</th>
                <th className="num">Members</th>
                <th className="num">Traces 24h</th>
                <th className="num">Success</th>
                <th className="num">Avg</th>
                <th>Trend</th>
              </tr>
            </thead>
            <tbody>
              {teams.map((t) => (
                <tr key={t.id}>
                  <td style={{ fontWeight: 600 }}>{t.name}</td>
                  <td className="num t-dim">{t.members}</td>
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
                  <td>
                    <Sparkline
                      data={throughput.length ? throughput : [1, 2, 3, 4, 5]}
                      width={80}
                      height={20}
                    />
                  </td>
                </tr>
              ))}
              {teams.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
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
      </div>
    </div>
  );
}
