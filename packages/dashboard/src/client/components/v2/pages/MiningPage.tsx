import { useMemo } from 'react';
import type { AgentStats } from '../../../hooks/useAgents';
import type { ProcessModelData } from '../../../hooks/useProcessModel';
import type { TraceEntry } from '../../../hooks/useTraces';
import { Card, Chip, Dot, type DotKind, fmtMs, Kpi } from '../atoms';
import { type ProcessActivity, type ProcessEdge, ProcessMap } from '../charts';

function deriveDotKind(a: AgentStats): DotKind {
  if (a.totalExecutions === 0) return 'idle';
  if (a.failedExecutions > 0 && a.successRate < 50) return 'fail';
  if (a.successRate < 95 || a.failedExecutions > 0) return 'warn';
  return 'ok';
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

export function MiningPage({
  agents,
  traces,
  processModel,
}: {
  agents: AgentStats[];
  traces: TraceEntry[];
  processModel: ProcessModelData | null;
}) {
  const total = traces.length;

  const procMap = useMemo(() => modelToMap(processModel?.model?.transitions), [processModel]);

  const variants = processModel?.variants ?? [];
  const bottlenecks = processModel?.bottlenecks ?? [];
  const totalVariantRuns = variants.reduce((s, v) => s + v.count, 0);
  const uniqueActivities = procMap.activities.length;
  const rareVariants = variants.filter((v) => v.percentage < 1).length;

  const avgSuccess = agents.length
    ? agents.reduce((s, a) => s + (a.successRate || 0), 0) / agents.length
    : 0;

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <div className="page__eyebrow">AgentFlow {'\u00B7'} Process Mining</div>
          <div className="page__title">Patterns across {total.toLocaleString()} runs</div>
          <div className="page__subtitle">
            Directly-follows graph {'\u00B7'} variant clustering {'\u00B7'} bottleneck analysis{' '}
            {'\u00B7'} conformance scoring {'\u00B7'} zero LLM cost
          </div>
        </div>
        <div className="page__head-actions">
          <Chip>all agents</Chip>
          <Chip>last 7d</Chip>
          <button type="button" className="v2-btn v2-btn--sm">
            Export model
          </button>
          <button type="button" className="v2-btn v2-btn--primary v2-btn--sm">
            Re-mine
          </button>
        </div>
      </div>

      <div className="page__body">
        <div className="v2-kpi-row">
          <Kpi label="Runs analyzed" value={total.toLocaleString()} />
          <Kpi label="Variants found" value={variants.length} />
          <Kpi label="Bottlenecks" value={bottlenecks.length} />
          <Kpi label="Avg conformance" value={avgSuccess.toFixed(1)} unit="%" />
          <Kpi label="Unique activities" value={uniqueActivities} />
          <Kpi label="Rare paths" value={rareVariants} />
        </div>

        <Card
          title="Directly-follows graph"
          sub="aggregated \u00B7 node size = freq \u00B7 edge width = transitions"
        >
          <ProcessMap activities={procMap.activities} edges={procMap.edges} />
        </Card>

        <div className="v2-grid v2-grid-2">
          <Card title="Variants" sub={`${variants.length} paths clustered`} flush>
            <table className="v2-tbl">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Path signature</th>
                  <th className="num">Runs</th>
                  <th>Share</th>
                </tr>
              </thead>
              <tbody>
                {variants.slice(0, 12).map((v, i) => (
                  <tr key={v.pathSignature}>
                    <td className="mono" style={{ color: 'var(--accent)' }}>
                      V{i + 1}
                    </td>
                    <td
                      className="mono"
                      style={{
                        fontSize: 'var(--fs-11)',
                        color: 'var(--t-2)',
                        maxWidth: 360,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={v.pathSignature}
                    >
                      {v.pathSignature}
                    </td>
                    <td className="num">{v.count}</td>
                    <td style={{ minWidth: 120 }}>
                      <div
                        style={{
                          background: 'var(--bg-3)',
                          height: 6,
                          borderRadius: 2,
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            width: `${v.percentage.toFixed(1)}%`,
                            background: 'var(--accent)',
                            height: '100%',
                          }}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
                {variants.length === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      style={{
                        textAlign: 'center',
                        color: 'var(--t-3)',
                        padding: 'var(--s-6)',
                      }}
                    >
                      No variants mined yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>

          <Card title="Bottlenecks (P95)" sub="slowest activities" flush>
            <table className="v2-tbl">
              <thead>
                <tr>
                  <th>Activity</th>
                  <th>Type</th>
                  <th className="num">p95</th>
                </tr>
              </thead>
              <tbody>
                {bottlenecks.slice(0, 12).map((b) => (
                  <tr key={b.nodeName}>
                    <td className="mono">{b.nodeName}</td>
                    <td className="t-dim">{b.nodeType}</td>
                    <td className="num">{fmtMs(b.p95)}</td>
                  </tr>
                ))}
                {bottlenecks.length === 0 && (
                  <tr>
                    <td
                      colSpan={3}
                      style={{
                        textAlign: 'center',
                        color: 'var(--t-3)',
                        padding: 'var(--s-6)',
                      }}
                    >
                      No bottlenecks identified.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>
        </div>

        <Card title="Conformance" sub="per-agent \u00B7 how closely runs match the mined model">
          <div style={{ display: 'grid', gap: 10 }}>
            {agents
              .filter((a) => a.totalExecutions > 0)
              .slice(0, 12)
              .map((a) => {
                const conf = Math.max(10, Math.min(100, a.successRate));
                return (
                  <div
                    key={a.agentId}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '220px 1fr 60px 80px',
                      gap: 12,
                      alignItems: 'center',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 'var(--fs-12)',
                    }}
                  >
                    <div>
                      <Dot kind={deriveDotKind(a)} />{' '}
                      <span style={{ marginLeft: 6 }}>{a.agentId}</span>
                    </div>
                    <div
                      style={{
                        position: 'relative',
                        height: 8,
                        background: 'var(--bg-3)',
                        borderRadius: 2,
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: `${conf}%`,
                          height: '100%',
                          background:
                            conf > 85 ? 'var(--ok)' : conf > 65 ? 'var(--warn)' : 'var(--fail)',
                        }}
                      />
                    </div>
                    <div className="num">{conf.toFixed(0)}%</div>
                    <div className="t-dim">{a.totalExecutions} runs</div>
                  </div>
                );
              })}
            {agents.filter((a) => a.totalExecutions > 0).length === 0 && (
              <div
                style={{
                  color: 'var(--t-3)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--fs-12)',
                }}
              >
                No conformance data yet.
              </div>
            )}
          </div>
        </Card>

        {totalVariantRuns > 0 && (
          <div
            style={{
              color: 'var(--t-3)',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--fs-10)',
              textAlign: 'right',
            }}
          >
            {totalVariantRuns.toLocaleString()} total variant runs
          </div>
        )}
      </div>
    </div>
  );
}
