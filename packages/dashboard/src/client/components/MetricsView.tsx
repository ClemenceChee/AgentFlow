import type { FullTrace } from '../hooks/useSelectedTrace';

const TYPE_COLORS: Record<string, string> = {
  agent: '#58a6ff', tool: '#d29922', pipeline: '#bc8cff', daemon: '#6e7681',
  embedder: '#f0883e', watcher: '#79c0ff', writer: '#56d364', scanner: '#a5d6ff',
  extraction: '#ff7b72', sweep: '#ffa657', default: '#8b949e',
};

function fmtDur(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(0)}m`;
}

export function MetricsView({ trace }: { trace: FullTrace }) {
  const nodes = Object.values(trace.nodes);
  const completed = nodes.filter((n) => n.status === 'completed').length;
  const failed = nodes.filter((n) => n.status === 'failed').length;
  const running = nodes.filter((n) => n.status === 'running').length;
  const dur = trace.endTime - trace.startTime;
  const rate = nodes.length > 0 ? ((completed / nodes.length) * 100).toFixed(1) : '0';

  const durations = nodes.filter((n) => n.endTime).map((n) => (n.endTime ?? 0) - n.startTime);
  const avg = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
  const max = durations.length > 0 ? Math.max(...durations) : 0;
  const p95 = durations.length > 0 ? durations.sort((a, b) => a - b)[Math.floor(durations.length * 0.95)] ?? 0 : 0;

  const types = new Map<string, { count: number; avgD: number; fails: number }>();
  for (const n of nodes) {
    const e = types.get(n.type) ?? { count: 0, avgD: 0, fails: 0 };
    const d = (n.endTime ?? n.startTime) - n.startTime;
    e.avgD = (e.avgD * e.count + d) / (e.count + 1);
    e.count++;
    if (n.status === 'failed') e.fails++;
    types.set(n.type, e);
  }

  return (
    <div className="mview">
      <div className="mv-row">
        <div className="mv-c"><span className="mv-v">{nodes.length}</span><span className="mv-l">Nodes</span></div>
        <div className="mv-c"><span className="mv-v c-ok">{completed}</span><span className="mv-l">OK</span></div>
        <div className="mv-c"><span className="mv-v" style={failed > 0 ? { color: 'var(--color-critical)' } : {}}>{failed}</span><span className="mv-l">Fail</span></div>
        <div className="mv-c"><span className="mv-v">{rate}%</span><span className="mv-l">Success</span></div>
        <div className="mv-c"><span className="mv-v">{fmtDur(dur)}</span><span className="mv-l">Total</span></div>
        <div className="mv-c"><span className="mv-v">{fmtDur(avg)}</span><span className="mv-l">Avg</span></div>
        <div className="mv-c"><span className="mv-v">{fmtDur(p95)}</span><span className="mv-l">P95</span></div>
        <div className="mv-c"><span className="mv-v">{fmtDur(max)}</span><span className="mv-l">Max</span></div>
      </div>
      <h4 className="mview__section">Node Types</h4>
      {[...types.entries()].sort((a, b) => b[1].count - a[1].count).map(([t, s]) => (
        <div key={t} className="mt-row">
          <span className="mt-dot" style={{ background: TYPE_COLORS[t] ?? TYPE_COLORS.default }} />
          <span className="mt-name">{t}</span>
          <span className="mt-cnt">{s.count}</span>
          {s.fails > 0 && <span className="mt-fail">{s.fails}!</span>}
          <span className="mt-dur">{fmtDur(s.avgD)}</span>
          <span className="mt-bar"><span className="mt-fill" style={{ width: `${(s.count / nodes.length) * 100}%`, background: TYPE_COLORS[t] ?? TYPE_COLORS.default }} /></span>
        </div>
      ))}
    </div>
  );
}
