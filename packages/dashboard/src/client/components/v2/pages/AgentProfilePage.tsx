import { useMemo, useState } from 'react';
import type { AgentStats } from '../../../hooks/useAgents';
import type { ProcessModelData } from '../../../hooks/useProcessModel';
import type { TraceEntry } from '../../../hooks/useTraces';
import { Badge, Card, Dot, type DotKind, fmtAgo, fmtMs, Kpi, StatusPill } from '../atoms';
import type { ProcessActivity, ProcessEdge } from '../charts';
import { Gantt, type GanttRow, Heatmap, LineChart, ProcessMap, StateMachine } from '../charts';

type Tab =
  | 'timeline'
  | 'gantt'
  | 'transcript'
  | 'graph'
  | 'metrics'
  | 'heatmap'
  | 'state'
  | 'procmap'
  | 'summary';

interface TabDef {
  id: Tab;
  label: string;
  count?: number;
}

function deriveDotKind(a: AgentStats): DotKind {
  if (a.totalExecutions === 0) return 'idle';
  if (a.failedExecutions > 0 && a.successRate < 50) return 'fail';
  if (a.successRate < 95 || a.failedExecutions > 0) return 'warn';
  return 'ok';
}

function traceStatusForGantt(status: string): GanttRow['status'] {
  if (status === 'failed') return 'fail';
  return 'ok';
}

function heatmapFromTraces(traces: TraceEntry[]): ('fail' | 'warn' | number)[][] | undefined {
  if (traces.length === 0) return undefined;
  const grid: ('fail' | 'warn' | number)[][] = Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, () => 0 as number),
  );
  const fails = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  const start = Date.now() - 7 * 24 * 60 * 60 * 1000;
  for (const t of traces) {
    if (t.timestamp < start) continue;
    const d = new Date(t.timestamp);
    const row = (d.getDay() + 6) % 7;
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

function modelToMap(transitions: { from: string; to: string; count: number }[] | undefined): {
  activities: ProcessActivity[];
  edges: ProcessEdge[];
} {
  if (!transitions || transitions.length === 0) return { activities: [], edges: [] };
  const nodes = [...new Set(transitions.flatMap((t) => [t.from, t.to]))];
  const depth: Record<string, number> = {};
  const inEdges: Record<string, number> = Object.fromEntries(nodes.map((n) => [n, 0]));
  for (const t of transitions) inEdges[t.to] += 1;
  const queue = nodes.filter((n) => inEdges[n] === 0);
  for (const n of queue) depth[n] = 0;
  const visited = new Set<string>();
  while (queue.length) {
    const n = queue.shift();
    if (!n || visited.has(n)) continue;
    visited.add(n);
    const d = depth[n] ?? 0;
    for (const t of transitions) {
      if (t.from === n) {
        depth[t.to] = Math.max(depth[t.to] ?? 0, d + 1);
        queue.push(t.to);
      }
    }
  }
  for (const n of nodes) if (depth[n] == null) depth[n] = 0;
  const maxD = Math.max(...Object.values(depth), 0);
  const cols: string[][] = Array.from({ length: maxD + 1 }, () => []);
  for (const n of nodes) cols[depth[n]].push(n);
  const count: Record<string, number> = Object.fromEntries(nodes.map((n) => [n, 0]));
  for (const t of transitions) {
    count[t.from] += t.count;
    count[t.to] += t.count;
  }
  const xStep = 1080 / Math.max(1, maxD + 1);
  const activities: ProcessActivity[] = [];
  cols.forEach((col, ci) => {
    const yStep = 240 / (col.length + 1);
    col.forEach((n, i) => {
      activities.push({
        id: n,
        x: 20 + xStep * ci + xStep / 2,
        y: 20 + yStep * (i + 1),
        count: count[n],
        failRate: 0,
      });
    });
  });
  return { activities, edges: transitions.map((t): ProcessEdge => [t.from, t.to, t.count]) };
}

function TranscriptView() {
  const msgs = [
    { role: 'user', at: 't+0s', body: 'Plan weekly digest for ingestion-queue.' },
    {
      role: 'assistant',
      at: 't+0.42s',
      body: 'Collecting queue snapshot, current depth 144 items. Will cluster by source.',
    },
    {
      role: 'thinking',
      at: 't+0.9s',
      body: "Consider throttling source 'firehose' — last batch hit rate-limit twice.",
    },
    {
      role: 'tool',
      at: 't+1.3s',
      body: "tool.search({ index: 'ingest/2026-w16', top_k: 40 })",
      result: '40 hits · 280ms',
    },
    {
      role: 'tool',
      at: 't+1.9s',
      body: 'tool.retrieve({ ids: [...] })',
      result: 'ok · 710ms · 12.4kb',
    },
    { role: 'assistant', at: 't+2.6s', body: 'Drafting summary.' },
    {
      role: 'assistant',
      at: 't+3.0s',
      body: "Verifying against guard 'block_external_writes'.",
      flag: 'warn' as const,
    },
    { role: 'guard', at: 't+3.8s', body: 'guard.check(policy.block_external_writes) → ALLOW' },
    {
      role: 'tool',
      at: 't+4.4s',
      body: "tool.notify({ channel: 'digest-w16' })",
      result: 'fail · 403',
      flag: 'fail' as const,
    },
    {
      role: 'assistant',
      at: 't+4.7s',
      body: "Retrying with fallback channel 'digest-fallback'...",
    },
  ];
  const roleColor: Record<string, string> = {
    user: 'var(--info)',
    assistant: 'var(--accent)',
    thinking: 'var(--purple)',
    tool: 'var(--magenta)',
    guard: 'var(--warn)',
  };
  return (
    <Card title="Transcript" sub="Sample trace \u00B7 interactive placeholder">
      <div
        style={{
          display: 'grid',
          gap: 12,
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--fs-12)',
        }}
      >
        {msgs.map((m) => {
          const flag = 'flag' in m ? (m as { flag?: 'warn' | 'fail' }).flag : undefined;
          return (
            <div
              key={`${m.at}-${m.role}`}
              style={{
                display: 'grid',
                gridTemplateColumns: '74px 80px 1fr',
                gap: 12,
                alignItems: 'start',
                padding: '8px 10px',
                background: 'var(--bg-2)',
                borderRadius: 'var(--radius)',
                borderLeft: `2px solid ${
                  flag === 'fail' ? 'var(--fail)' : flag === 'warn' ? 'var(--warn)' : 'var(--bd)'
                }`,
              }}
            >
              <div style={{ color: 'var(--t-3)', fontSize: 'var(--fs-10)' }}>{m.at}</div>
              <div
                style={{
                  color: roleColor[m.role],
                  textTransform: 'uppercase',
                  fontSize: 'var(--fs-10)',
                  letterSpacing: '0.08em',
                  fontWeight: 600,
                  fontStyle: m.role === 'thinking' ? 'italic' : 'normal',
                }}
              >
                {m.role}
              </div>
              <div>
                <div style={{ color: 'var(--t-1)' }}>{m.body}</div>
                {'result' in m && (m as { result?: string }).result && (
                  <div
                    style={{
                      color: 'var(--t-3)',
                      fontSize: 'var(--fs-11)',
                      marginTop: 3,
                    }}
                  >
                    {'\u21B3'} {(m as { result: string }).result}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function ExecutionGraph() {
  const nodes = [
    { id: 'plan', x: 100, y: 160 },
    { id: 'fetch_ctx', x: 260, y: 100 },
    { id: 'think', x: 260, y: 220 },
    { id: 'search', x: 420, y: 100 },
    { id: 'retrieve', x: 420, y: 220 },
    { id: 'summarize', x: 580, y: 160 },
    { id: 'verify', x: 740, y: 160 },
    { id: 'write', x: 900, y: 100 },
    { id: 'notify', x: 900, y: 220, kind: 'fail' as const },
    { id: 'done', x: 1060, y: 160, kind: 'ok' as const },
  ];
  const by = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const edges: [string, string][] = [
    ['plan', 'fetch_ctx'],
    ['plan', 'think'],
    ['fetch_ctx', 'search'],
    ['think', 'retrieve'],
    ['search', 'summarize'],
    ['retrieve', 'summarize'],
    ['summarize', 'verify'],
    ['verify', 'write'],
    ['verify', 'notify'],
    ['write', 'done'],
    ['notify', 'done'],
  ];
  return (
    <svg
      width="100%"
      viewBox="0 0 1140 300"
      style={{
        background: 'var(--bg-2)',
        border: '1px solid var(--bd)',
        borderRadius: 'var(--radius)',
      }}
      role="img"
      aria-label="Execution graph"
    >
      <title>Execution graph</title>
      <defs>
        <marker
          id="v2-eg-arrow"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--t-3)" />
        </marker>
      </defs>
      {edges.map(([f, t]) => {
        const a = by[f];
        const b = by[t];
        return (
          <line
            key={`${f}-${t}`}
            x1={a.x + 32}
            y1={a.y}
            x2={b.x - 32}
            y2={b.y}
            stroke="var(--t-3)"
            strokeWidth="1.4"
            opacity="0.55"
            markerEnd="url(#v2-eg-arrow)"
          />
        );
      })}
      {nodes.map((n) => {
        const color =
          n.kind === 'fail' ? 'var(--fail)' : n.kind === 'ok' ? 'var(--ok)' : 'var(--accent)';
        return (
          <g key={n.id}>
            <rect
              x={n.x - 40}
              y={n.y - 16}
              width="80"
              height="32"
              rx="4"
              fill="var(--bg-3)"
              stroke={color}
              strokeWidth="1.5"
            />
            <text
              x={n.x}
              y={n.y + 4}
              fontSize="11"
              fontFamily="var(--font-mono)"
              fill="var(--t-1)"
              textAnchor="middle"
              fontWeight="600"
            >
              {n.id}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function NodeBreakdown() {
  const rows = [
    { kind: 'assistant', count: 412, pct: 39, p95: 420 },
    { kind: 'tool', count: 308, pct: 29, p95: 1820 },
    { kind: 'thinking', count: 180, pct: 17, p95: 640 },
    { kind: 'guard', count: 98, pct: 9, p95: 80 },
    { kind: 'retrieve', count: 64, pct: 6, p95: 910 },
  ];
  return (
    <table className="v2-tbl">
      <thead>
        <tr>
          <th>Kind</th>
          <th className="num">Count</th>
          <th>Share</th>
          <th className="num">p95</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.kind}>
            <td>{r.kind}</td>
            <td className="num">{r.count}</td>
            <td style={{ minWidth: 140 }}>
              <div
                style={{
                  background: 'var(--bg-3)',
                  borderRadius: 2,
                  height: 6,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${r.pct}%`,
                    background: 'var(--accent)',
                    height: '100%',
                  }}
                />
              </div>
              <span className="t-dim" style={{ fontSize: 'var(--fs-10)' }}>
                {r.pct}%
              </span>
            </td>
            <td className="num">{fmtMs(r.p95)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ErrorTable() {
  const rows = [
    { code: '403', msg: 'Key limit exceeded', count: 14, last: '2m' },
    { code: '429', msg: 'Rate limited', count: 9, last: '5m' },
    { code: '500', msg: 'Upstream crash', count: 3, last: '31m' },
    { code: 'POL', msg: 'Policy violation', count: 2, last: '54m' },
  ];
  return (
    <table className="v2-tbl">
      <thead>
        <tr>
          <th>Code</th>
          <th>Message</th>
          <th className="num">Count</th>
          <th>Last</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.code}>
            <td>
              <Badge kind="fail">{r.code}</Badge>
            </td>
            <td>{r.msg}</td>
            <td className="num">{r.count}</td>
            <td className="t-dim">{r.last} ago</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SummaryView({ agent }: { agent: AgentStats }) {
  const success = 100 - (agent.failedExecutions / Math.max(1, agent.totalExecutions)) * 100;
  return (
    <Card title="Auto-summary" sub="24h window">
      <div style={{ display: 'grid', gap: 14, fontSize: 'var(--fs-13)', lineHeight: 1.55 }}>
        <p>
          <strong>{agent.displayName ?? agent.agentId}</strong> processed{' '}
          <strong>{agent.totalExecutions}</strong> traces in the last 24h with a{' '}
          <strong
            style={{
              color: success < 50 ? 'var(--fail)' : success < 95 ? 'var(--warn)' : 'var(--ok)',
            }}
          >
            {success.toFixed(1)}%
          </strong>{' '}
          success rate and an avg duration of <strong>{fmtMs(agent.avgExecutionTime)}</strong>.
        </p>
        {agent.failedExecutions > 0 && (
          <div
            style={{
              borderLeft: '2px solid var(--fail)',
              paddingLeft: 12,
              color: 'var(--t-2)',
            }}
          >
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--fs-10)',
                color: 'var(--fail)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
              }}
            >
              Failures
            </div>
            {agent.failedExecutions} execution(s) failed. Review the most recent in the Timeline
            tab.
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <SummaryStat
            label="Last seen"
            value={agent.lastExecution ? fmtAgo(agent.lastExecution) : '\u2014'}
          />
          <SummaryStat label="Sources" value={String(agent.sources?.length ?? 1)} />
          <SummaryStat
            label="Triggers"
            value={Object.keys(agent.triggers ?? {}).join(', ') || '\u2014'}
          />
        </div>
      </div>
    </Card>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
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
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--fs-10)',
          color: 'var(--t-3)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}
      >
        {label}
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-12)', marginTop: 3 }}>
        {value}
      </div>
    </div>
  );
}

export interface AgentProfilePageProps {
  agentId: string;
  agents: AgentStats[];
  traces: TraceEntry[];
  processModel: ProcessModelData | null;
  onSelectTrace?: (filename: string, agentId: string) => void;
}

export function AgentProfilePage({
  agentId,
  agents,
  traces,
  processModel,
  onSelectTrace,
}: AgentProfilePageProps) {
  const agent = agents.find((a) => a.agentId === agentId) ?? agents[0];
  const [tab, setTab] = useState<Tab>('timeline');

  const agentTraces = useMemo(
    () => traces.filter((t) => t.agentId === agent?.agentId),
    [traces, agent],
  );

  if (!agent) {
    return (
      <div className="page">
        <div className="page__header">
          <div>
            <div className="page__eyebrow">Agent</div>
            <div className="page__title">No agent selected</div>
            <div className="page__subtitle">Pick an agent from the sidebar.</div>
          </div>
        </div>
      </div>
    );
  }

  const tabs: TabDef[] = [
    { id: 'timeline', label: 'Timeline', count: agentTraces.length },
    { id: 'gantt', label: 'Gantt' },
    { id: 'transcript', label: 'Transcript' },
    { id: 'graph', label: 'Graph' },
    { id: 'metrics', label: 'Metrics' },
    { id: 'heatmap', label: 'Heatmap' },
    { id: 'state', label: 'State Machine' },
    { id: 'procmap', label: 'Process Map' },
    { id: 'summary', label: 'Summary' },
  ];

  const dotKind = deriveDotKind(agent);
  const ganttRows: GanttRow[] = agentTraces.slice(0, 20).map((t) => ({
    id: t.filename,
    start: t.timestamp - t.duration,
    duration: t.duration,
    status: traceStatusForGantt(t.status),
  }));
  const heatmapValues = heatmapFromTraces(agentTraces);
  const procMap = modelToMap(processModel?.model?.transitions);

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <div className="page__eyebrow">
            Agent {'\u00B7'} {agent.sources?.join(' + ') ?? 'agentflow'}
          </div>
          <div className="page__title" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <Dot kind={dotKind} /> {agent.displayName ?? agent.agentId}
          </div>
          <div className="page__subtitle">
            {agent.totalExecutions} runs {'\u00B7'} last {fmtAgo(agent.lastExecution ?? Date.now())}{' '}
            {'\u00B7'} {Object.keys(agent.triggers ?? {}).join(', ') || 'no triggers'}
          </div>
        </div>
        <div className="page__head-actions">
          <StatusPill status={dotKind} />
          <button type="button" className="v2-btn v2-btn--sm">
            Open config
          </button>
          <button type="button" className="v2-btn v2-btn--sm">
            Logs
          </button>
        </div>
      </div>

      <div
        className="v2-kpi-row"
        style={{ margin: 'var(--s-6) var(--s-8) 0', borderRadius: 'var(--radius)' }}
      >
        <Kpi label="Executions" value={agent.totalExecutions} />
        <Kpi
          label="Failed"
          value={agent.failedExecutions}
          sparkColor={agent.failedExecutions > 0 ? 'var(--fail)' : 'var(--ok)'}
        />
        <Kpi
          label="Success"
          value={agent.successRate.toFixed(1)}
          unit="%"
          sparkColor={
            agent.successRate < 50
              ? 'var(--fail)'
              : agent.successRate < 95
                ? 'var(--warn)'
                : 'var(--ok)'
          }
        />
        <Kpi label="Avg" value={fmtMs(agent.avgExecutionTime)} />
        <Kpi label="Last" value={agent.lastExecution ? fmtAgo(agent.lastExecution) : '\u2014'} />
      </div>

      <div className="v2-tabs" style={{ marginTop: 16 }} role="tablist">
        {tabs.map((t) => (
          <button
            type="button"
            key={t.id}
            className={`v2-tabs__tab ${tab === t.id ? 'is-active' : ''}`}
            onClick={() => setTab(t.id)}
            aria-selected={tab === t.id}
            role="tab"
          >
            {t.label}
            {t.count != null && <span className="v2-tabs__tab-count">{t.count}</span>}
          </button>
        ))}
      </div>

      <div className="page__body">
        {tab === 'timeline' && (
          <Card title={`Executions \u00B7 ${agentTraces.length}`} flush>
            <table className="v2-tbl">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Trace</th>
                  <th>Status</th>
                  <th className="num">Nodes</th>
                  <th className="num">Duration</th>
                  <th>Trigger</th>
                  <th>Graph</th>
                </tr>
              </thead>
              <tbody>
                {agentTraces.slice(0, 100).map((t) => (
                  <tr
                    key={t.traceKey}
                    onClick={() => onSelectTrace?.(t.filename, t.agentId)}
                    style={onSelectTrace ? { cursor: 'pointer' } : undefined}
                  >
                    <td className="t-dim">{fmtAgo(t.timestamp)}</td>
                    <td>
                      <span style={{ color: 'var(--accent)' }}>{t.filename}</span>
                    </td>
                    <td>
                      <StatusPill status={t.status === 'failed' ? 'fail' : 'ok'} />
                    </td>
                    <td className="num">{t.nodeCount}</td>
                    <td className="num">{fmtMs(t.duration)}</td>
                    <td className="t-dim">{t.trigger}</td>
                    <td className="t-dim mono">{t.graphId}</td>
                  </tr>
                ))}
                {agentTraces.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      style={{
                        textAlign: 'center',
                        color: 'var(--t-3)',
                        padding: 'var(--s-6)',
                      }}
                    >
                      No traces for this agent yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>
        )}
        {tab === 'gantt' && (
          <Card title="Gantt \u00B7 recent 20">
            <Gantt rows={ganttRows} />
          </Card>
        )}
        {tab === 'transcript' && <TranscriptView />}
        {tab === 'graph' && (
          <Card title="Execution graph">
            <ExecutionGraph />
          </Card>
        )}
        {tab === 'metrics' && (
          <div className="v2-grid v2-grid-2">
            <Card title="Latency distribution">
              <LineChart
                data={agentTraces
                  .slice(0, 30)
                  .map((t) => t.duration)
                  .reverse()}
              />
            </Card>
            <Card title="Execution count \u00B7 hourly">
              <LineChart
                data={Array.from({ length: 24 }, (_, i) => {
                  const end = Date.now() - (23 - i) * 60 * 60 * 1000;
                  const start = end - 60 * 60 * 1000;
                  return agentTraces.filter((t) => t.timestamp >= start && t.timestamp < end)
                    .length;
                })}
              />
            </Card>
            <Card title="Node breakdown" flush>
              <NodeBreakdown />
            </Card>
            <Card title="Error types" flush>
              <ErrorTable />
            </Card>
          </div>
        )}
        {tab === 'heatmap' && (
          <Card title="Errors \u00B7 7d \u00D7 24h">
            {heatmapValues ? (
              <Heatmap values={heatmapValues} />
            ) : (
              <Heatmap seed={agent.agentId.length} />
            )}
          </Card>
        )}
        {tab === 'state' && (
          <Card title="State machine">
            <StateMachine />
          </Card>
        )}
        {tab === 'procmap' && (
          <Card title="Process mining">
            <ProcessMap activities={procMap.activities} edges={procMap.edges} />
          </Card>
        )}
        {tab === 'summary' && <SummaryView agent={agent} />}
      </div>
    </div>
  );
}
