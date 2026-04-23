import { useMemo, useState } from 'react';
import type { FullTrace, SessionEvent, TraceNode } from '../../../hooks/useSelectedTrace';
import { Badge, Card, fmtAgo, fmtMs, Kpi, StatusPill } from '../atoms';
import { FlameChart } from '../charts';

type Tab = 'flame' | 'transcript' | 'graph' | 'json' | 'guards';

interface TabDef {
  id: Tab;
  label: string;
}

function statusDot(status: string): 'ok' | 'warn' | 'fail' | 'idle' {
  if (status === 'failed') return 'fail';
  if (status === 'completed' || status === 'ok') return 'ok';
  if (status === 'warn') return 'warn';
  return 'idle';
}

function TranscriptView({ events }: { events: SessionEvent[] }) {
  if (events.length === 0) {
    return (
      <div
        style={{
          padding: 'var(--s-6)',
          color: 'var(--t-3)',
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--fs-12)',
        }}
      >
        No transcript events captured for this trace.
      </div>
    );
  }
  const roleColor: Record<string, string> = {
    user: 'var(--info)',
    assistant: 'var(--accent)',
    thinking: 'var(--purple)',
    tool: 'var(--magenta)',
    guard: 'var(--warn)',
    system: 'var(--t-2)',
  };
  const start = events.find((e) => e.timestamp)?.timestamp ?? Date.now();
  return (
    <div
      style={{
        display: 'grid',
        gap: 12,
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--fs-12)',
      }}
    >
      {events.map((m, idx) => {
        const at = m.timestamp ? `t+${((m.timestamp - start) / 1000).toFixed(2)}s` : `#${idx + 1}`;
        const color = roleColor[m.role] ?? 'var(--t-2)';
        const flag = m.error ? 'fail' : undefined;
        return (
          <div
            key={`${at}-${idx}`}
            style={{
              display: 'grid',
              gridTemplateColumns: '74px 90px 1fr',
              gap: 12,
              alignItems: 'start',
              padding: '8px 10px',
              background: 'var(--bg-2)',
              borderRadius: 'var(--radius)',
              borderLeft: `2px solid ${flag === 'fail' ? 'var(--fail)' : 'var(--bd)'}`,
            }}
          >
            <div style={{ color: 'var(--t-3)', fontSize: 'var(--fs-10)' }}>{at}</div>
            <div
              style={{
                color,
                textTransform: 'uppercase',
                fontSize: 'var(--fs-10)',
                letterSpacing: '0.08em',
                fontWeight: 600,
                fontStyle: m.role === 'thinking' ? 'italic' : 'normal',
              }}
            >
              {m.role}
              {m.toolName ? ` · ${m.toolName}` : ''}
            </div>
            <div>
              <div style={{ color: 'var(--t-1)', whiteSpace: 'pre-wrap' }}>
                {m.content || (m.toolArgs ?? '')}
              </div>
              {m.toolResult && (
                <div
                  style={{
                    color: 'var(--t-3)',
                    fontSize: 'var(--fs-11)',
                    marginTop: 3,
                  }}
                >
                  {'\u21B3'} {m.toolResult}
                </div>
              )}
              {m.error && (
                <div
                  style={{
                    color: 'var(--fail)',
                    fontSize: 'var(--fs-11)',
                    marginTop: 3,
                  }}
                >
                  {'\u26A0'} {m.error}
                </div>
              )}
              {m.tokenCount != null && (
                <div
                  style={{
                    color: 'var(--t-3)',
                    fontSize: 'var(--fs-10)',
                    marginTop: 3,
                  }}
                >
                  {m.tokenCount} tokens
                  {m.model ? ` · ${m.model}` : ''}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TraceGraph({ trace }: { trace: FullTrace }) {
  const nodes = Object.values(trace.nodes);
  if (nodes.length === 0) {
    return (
      <div
        style={{
          padding: 'var(--s-6)',
          color: 'var(--t-3)',
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--fs-12)',
        }}
      >
        No nodes.
      </div>
    );
  }
  const depth: Record<string, number> = {};
  const getDepth = (id: string): number => {
    if (depth[id] != null) return depth[id];
    const n = trace.nodes[id];
    if (!n?.parentId) {
      depth[id] = 0;
      return 0;
    }
    depth[id] = getDepth(n.parentId) + 1;
    return depth[id];
  };
  for (const n of nodes) getDepth(n.id);
  const maxD = Math.max(...Object.values(depth), 0);
  const byDepth: Record<number, string[]> = {};
  for (const n of nodes) {
    const d = depth[n.id];
    (byDepth[d] ||= []).push(n.id);
  }
  const W = 1140;
  const H = 320;
  const xStep = W / Math.max(1, maxD + 1);
  const positions: Record<string, { x: number; y: number; node: TraceNode }> = {};
  for (let d = 0; d <= maxD; d++) {
    const ids = byDepth[d] ?? [];
    const yStep = H / (ids.length + 1);
    ids.forEach((id, i) => {
      positions[id] = {
        x: 20 + xStep * d + xStep / 2,
        y: 20 + yStep * (i + 1),
        node: trace.nodes[id],
      };
    });
  }
  return (
    <svg
      width="100%"
      viewBox={`0 0 ${W} ${H}`}
      style={{
        background: 'var(--bg-2)',
        border: '1px solid var(--bd)',
        borderRadius: 'var(--radius)',
      }}
      role="img"
      aria-label="Trace graph"
    >
      <title>Trace graph</title>
      <defs>
        <marker
          id="v2-trace-arrow"
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
      {trace.edges.map((e, i) => {
        const a = positions[e.from];
        const b = positions[e.to];
        if (!a || !b) return null;
        return (
          <line
            key={`${e.from}-${e.to}-${i}`}
            x1={a.x + 36}
            y1={a.y}
            x2={b.x - 36}
            y2={b.y}
            stroke="var(--t-3)"
            strokeWidth="1.4"
            opacity="0.55"
            markerEnd="url(#v2-trace-arrow)"
          />
        );
      })}
      {Object.values(positions).map((p) => {
        const color =
          p.node.status === 'failed'
            ? 'var(--fail)'
            : p.node.status === 'completed' || p.node.status === 'ok'
              ? 'var(--ok)'
              : 'var(--accent)';
        const label = p.node.name || p.node.id;
        const display = label.length > 14 ? `${label.slice(0, 12)}${'\u2026'}` : label;
        return (
          <g key={p.node.id}>
            <rect
              x={p.x - 44}
              y={p.y - 16}
              width="88"
              height="32"
              rx="4"
              fill="var(--bg-3)"
              stroke={color}
              strokeWidth="1.5"
            />
            <text
              x={p.x}
              y={p.y + 4}
              fontSize="11"
              fontFamily="var(--font-mono)"
              fill="var(--t-1)"
              textAnchor="middle"
              fontWeight="600"
            >
              {display}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function GuardsView({ trace }: { trace: FullTrace }) {
  const guardNodes = Object.values(trace.nodes).filter((n) =>
    n.type?.toLowerCase().includes('guard'),
  );
  if (guardNodes.length === 0) {
    return (
      <div
        style={{
          padding: 'var(--s-6)',
          color: 'var(--t-3)',
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--fs-12)',
        }}
      >
        No guard nodes recorded for this trace.
      </div>
    );
  }
  return (
    <table className="v2-tbl">
      <thead>
        <tr>
          <th>Guard</th>
          <th>Status</th>
          <th>Name</th>
          <th className="num">Duration</th>
          <th>Detail</th>
        </tr>
      </thead>
      <tbody>
        {guardNodes.map((n) => {
          const dur = (n.endTime ?? n.startTime) - n.startTime;
          const detail =
            (n.metadata?.reason as string | undefined) ??
            (n.state?.reason as string | undefined) ??
            '\u2014';
          return (
            <tr key={n.id}>
              <td className="mono">{n.id}</td>
              <td>
                <StatusPill status={statusDot(n.status)} />
              </td>
              <td>{n.name}</td>
              <td className="num">{fmtMs(dur)}</td>
              <td className="t-dim">{detail}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function ExecutionDetailPage({
  trace,
  loading,
  onBack,
}: {
  trace: FullTrace | null;
  loading: boolean;
  onBack?: () => void;
}) {
  const [tab, setTab] = useState<Tab>('flame');

  const nodes = useMemo<TraceNode[]>(() => (trace ? Object.values(trace.nodes) : []), [trace]);
  const completedCount = nodes.filter((n) => n.status === 'completed' || n.status === 'ok').length;
  const failedCount = nodes.filter((n) => n.status === 'failed').length;
  const duration = trace ? trace.endTime - trace.startTime : 0;
  const toolCalls = nodes.filter((n) => n.type?.toLowerCase() === 'tool').length;
  const retries = nodes.filter((n) => n.name?.toLowerCase().includes('retry')).length;

  if (loading) {
    return (
      <div className="page">
        <div className="page__header">
          <div>
            <div className="page__eyebrow">Execution</div>
            <div className="page__title">Loading trace{'\u2026'}</div>
          </div>
        </div>
      </div>
    );
  }

  if (!trace) {
    return (
      <div className="page">
        <div className="page__header">
          <div>
            <div className="page__eyebrow">Execution</div>
            <div className="page__title">No execution selected</div>
            <div className="page__subtitle">Pick a trace from the sidebar to drill in.</div>
          </div>
        </div>
      </div>
    );
  }

  const tabs: TabDef[] = [
    { id: 'flame', label: 'Flame' },
    { id: 'transcript', label: 'Transcript' },
    { id: 'graph', label: 'Graph' },
    { id: 'json', label: 'JSON' },
    { id: 'guards', label: 'Guards' },
  ];

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <div className="page__eyebrow">
            {onBack && (
              <button type="button" className="v2-btn v2-btn--ghost v2-btn--sm" onClick={onBack}>
                {'\u2190'} back
              </button>
            )}
            <span style={{ marginLeft: 10 }}>Execution</span>
          </div>
          <div
            className="page__title"
            style={{
              fontFamily: 'var(--font-mono)',
              display: 'flex',
              gap: 12,
              alignItems: 'center',
            }}
          >
            <StatusPill status={statusDot(trace.status)} /> {trace.filename}
          </div>
          <div className="page__subtitle" style={{ fontFamily: 'var(--font-mono)' }}>
            {trace.agentId} {'\u00B7'} {nodes.length} nodes {'\u00B7'} {fmtMs(duration)} {'\u00B7'}{' '}
            {fmtAgo(trace.startTime)} {'\u00B7'} {trace.trigger}
          </div>
        </div>
        <div className="page__head-actions">
          <button type="button" className="v2-btn v2-btn--sm">
            {'\u2398'} Copy
          </button>
          <button type="button" className="v2-btn v2-btn--sm">
            {'\u2193'} Download
          </button>
          <button type="button" className="v2-btn v2-btn--sm">
            Compare{'\u2026'}
          </button>
          <button type="button" className="v2-btn v2-btn--primary v2-btn--sm">
            Replay
          </button>
        </div>
      </div>

      {trace.status === 'failed' && (
        <div
          style={{
            margin: 'var(--s-6) var(--s-8) 0',
            padding: '10px 14px',
            background: 'oklch(from var(--fail) l c h / 0.12)',
            border: '1px solid oklch(from var(--fail) l c h / 0.4)',
            borderRadius: 'var(--radius)',
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--fs-12)',
          }}
        >
          <span
            style={{
              color: 'var(--fail)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              fontSize: 'var(--fs-10)',
              marginRight: 8,
            }}
          >
            error
          </span>
          Execution failed {'\u00B7'} {failedCount} node(s) in error state
        </div>
      )}

      <div
        className="v2-kpi-row"
        style={{ margin: 'var(--s-6) var(--s-8) 0', borderRadius: 'var(--radius)' }}
      >
        <Kpi label="Duration" value={fmtMs(duration)} />
        <Kpi label="Nodes" value={nodes.length} />
        <Kpi label="Completed" value={completedCount} />
        <Kpi
          label="Failed"
          value={failedCount}
          sparkColor={failedCount > 0 ? 'var(--fail)' : 'var(--ok)'}
        />
        <Kpi label="Tool calls" value={toolCalls} />
        <Kpi label="Retries" value={retries} />
      </div>

      <div className="v2-tabs" style={{ marginTop: 16 }} role="tablist">
        {tabs.map((t) => (
          <button
            type="button"
            key={t.id}
            className={`v2-tabs__tab ${tab === t.id ? 'is-active' : ''}`}
            onClick={() => setTab(t.id)}
            role="tab"
            aria-selected={tab === t.id}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="page__body">
        {tab === 'flame' && (
          <Card title="Flame chart" sub={`${nodes.length} nodes \u00B7 ${fmtMs(duration)}`}>
            <FlameChart trace={trace} />
          </Card>
        )}
        {tab === 'transcript' && (
          <Card title="Transcript" sub={`${trace.sessionEvents?.length ?? 0} events`}>
            <TranscriptView events={trace.sessionEvents ?? []} />
          </Card>
        )}
        {tab === 'graph' && (
          <Card title="Trace graph">
            <TraceGraph trace={trace} />
          </Card>
        )}
        {tab === 'json' && (
          <Card title="Raw trace" sub={trace.filename} flush>
            <pre
              style={{
                padding: 16,
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--fs-11)',
                lineHeight: 1.55,
                color: 'var(--t-2)',
                overflowX: 'auto',
                maxHeight: 560,
              }}
            >
              {JSON.stringify(
                {
                  id: trace.id,
                  agentId: trace.agentId,
                  name: trace.name,
                  trigger: trace.trigger,
                  status: trace.status,
                  startTime: new Date(trace.startTime).toISOString(),
                  endTime: new Date(trace.endTime).toISOString(),
                  nodes: Object.values(trace.nodes).map((n) => ({
                    id: n.id,
                    type: n.type,
                    name: n.name,
                    status: n.status,
                    ms: (n.endTime ?? n.startTime) - n.startTime,
                  })),
                  edges: trace.edges.length,
                  sessionEvents: (trace.sessionEvents ?? []).length,
                  metadata: trace.metadata,
                },
                null,
                2,
              )}
            </pre>
          </Card>
        )}
        {tab === 'guards' && (
          <Card title="Guards fired" flush>
            <GuardsView trace={trace} />
          </Card>
        )}
      </div>
    </div>
  );
}

export { Badge }; // keep export for potential consumers
