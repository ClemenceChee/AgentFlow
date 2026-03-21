import type { FullTrace, TraceNode } from '../hooks/useSelectedTrace';

const TYPE_COLORS: Record<string, string> = {
  agent: '#58a6ff',
  tool: '#d29922',
  pipeline: '#bc8cff',
  daemon: '#6e7681',
  embedder: '#f0883e',
  watcher: '#79c0ff',
  writer: '#56d364',
  default: '#8b949e',
};

function fmtDur(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(0)}m`;
}

function NodeRow({ node, trace, depth }: { node: TraceNode; trace: FullTrace; depth: number }) {
  const children = Object.values(trace.nodes).filter((n) => n.parentId === node.id);
  const dur = (node.endTime ?? node.startTime) - node.startTime;
  const fail = node.status === 'failed';
  const color = fail ? 'var(--color-critical)' : (TYPE_COLORS[node.type] ?? TYPE_COLORS.default);
  const icon = fail ? '\u2718' : node.status === 'completed' ? '\u2714' : '\u25CF';

  return (
    <>
      <div
        className={`dt-node ${fail ? 'dt-node--fail' : ''}`}
        style={{ paddingLeft: depth * 20 + 8 }}
      >
        <span style={{ color, marginRight: 6 }}>{icon}</span>
        <span className="dt-node__name">{node.name}</span>
        <span className="dt-node__type" style={{ color }}>
          {node.type}
        </span>
        <span className="dt-node__dur">{fmtDur(dur)}</span>
        {node.metadata?.error && (
          <span className="dt-node__err">{String(node.metadata.error)}</span>
        )}
      </div>
      {children
        .sort((a, b) => a.startTime - b.startTime)
        .map((c) => (
          <NodeRow key={c.id} node={c} trace={trace} depth={depth + 1} />
        ))}
    </>
  );
}

export function DependencyTree({ trace }: { trace: FullTrace }) {
  const roots = Object.values(trace.nodes).filter((n) => !n.parentId);
  if (roots.length === 0) {
    // No parent-child structure — show flat list
    const all = Object.values(trace.nodes).sort((a, b) => a.startTime - b.startTime);
    return (
      <div className="dtree">
        {all.map((n) => (
          <NodeRow key={n.id} node={n} trace={trace} depth={0} />
        ))}
      </div>
    );
  }

  return (
    <div className="dtree">
      {roots
        .sort((a, b) => a.startTime - b.startTime)
        .map((r) => (
          <NodeRow key={r.id} node={r} trace={trace} depth={0} />
        ))}
    </div>
  );
}
