import { useMemo, useState } from 'react';
import type { FullTrace, TraceNode } from '../hooks/useSelectedTrace';

const TYPE_COLORS: Record<string, string> = {
  agent: '#58a6ff',
  tool: '#d29922',
  pipeline: '#bc8cff',
  daemon: '#6e7681',
  embedder: '#f0883e',
  watcher: '#79c0ff',
  writer: '#56d364',
  scanner: '#a5d6ff',
  extraction: '#ff7b72',
  sweep: '#ffa657',
  autofix: '#d2a8ff',
  default: '#8b949e',
};
function typeColor(t: string) {
  return TYPE_COLORS[t] ?? TYPE_COLORS.default;
}

function fmtDur(ms: number): string {
  if (ms < 1) return '<1ms';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function getDepth(id: string, nodes: Record<string, TraceNode>): number {
  let d = 0,
    n = nodes[id];
  while (n?.parentId && nodes[n.parentId]) {
    d++;
    n = nodes[n.parentId];
  }
  return d;
}

export function FlameChart({ trace }: { trace: FullTrace }) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const { rows, timeStart, timeEnd, totalDur, failedNodes } = useMemo(() => {
    const nodes = Object.values(trace.nodes).filter((n) => n.startTime > 0);
    const starts = nodes.map((n) => n.startTime);
    const ends = nodes.map((n) => n.endTime ?? n.startTime);
    const tS = starts.length > 0 ? Math.min(...starts) : trace.startTime;
    const tE = ends.length > 0 ? Math.max(...ends) : trace.endTime;
    const total = Math.max(tE - tS, 1);

    // Group by depth
    const byDepth = new Map<number, TraceNode[]>();
    for (const n of nodes) {
      const d = getDepth(n.id, trace.nodes);
      const arr = byDepth.get(d) ?? [];
      arr.push(n);
      byDepth.set(d, arr);
    }

    const r: { depth: number; nodes: TraceNode[] }[] = [];
    for (const [depth, dns] of [...byDepth.entries()].sort((a, b) => a[0] - b[0])) {
      r.push({ depth, nodes: dns.sort((a, b) => a.startTime - b.startTime) });
    }

    return {
      rows: r,
      timeStart: tS,
      timeEnd: tE,
      totalDur: total,
      failedNodes: nodes.filter((n) => n.status === 'failed'),
    };
  }, [trace]);

  return (
    <div className="flame">
      {/* Failure callout */}
      {failedNodes.length > 0 && (
        <div className="flame__fail-callout">
          <div className="flame__fail-title">
            {'\u2718'} {failedNodes.length} Failed
          </div>
          {failedNodes.map((n) => (
            <div key={n.id} className="flame__fail-item">
              <span style={{ color: typeColor(n.type) }}>{n.type}:</span>
              <strong>{n.name}</strong>
              <span className="flame__fail-ts">
                {new Date(n.startTime).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </span>
              {(n.metadata?.error ?? n.state?.error) && (
                <span className="flame__fail-err">
                  {String(n.metadata?.error ?? n.state?.error)}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Time range */}
      <div className="flame__range">
        {new Date(timeStart).toLocaleString([], {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })}
        {' \u2192 '}
        {new Date(timeEnd).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })}{' '}
        ({fmtDur(totalDur)})
      </div>

      {/* Time axis */}
      <div className="flame__axis">
        <span>0</span>
        <span>{fmtDur(totalDur * 0.25)}</span>
        <span>{fmtDur(totalDur * 0.5)}</span>
        <span>{fmtDur(totalDur * 0.75)}</span>
        <span>{fmtDur(totalDur)}</span>
      </div>

      {/* Flame rows */}
      {rows.map(({ depth, nodes }) => (
        <div key={depth} className="flame__row">
          <div className="flame__depth">L{depth}</div>
          <div className="flame__track">
            {nodes.map((n) => {
              const left = ((n.startTime - timeStart) / totalDur) * 100;
              const width = Math.max(
                (((n.endTime ?? n.startTime) - n.startTime) / totalDur) * 100,
                0.2,
              );
              const fail = n.status === 'failed';
              const color = fail ? 'var(--color-critical)' : typeColor(n.type);
              const isHov = hovered === n.id;

              return (
                <div
                  key={n.id}
                  className={`flame__bar ${isHov ? 'flame__bar--hov' : ''}`}
                  style={{
                    left: `${left}%`,
                    width: `${width}%`,
                    background: color,
                    opacity: isHov ? 1 : 0.8,
                  }}
                  onMouseEnter={(e) => {
                    setHovered(n.id);
                    setMousePos({ x: e.clientX, y: e.clientY });
                  }}
                  onMouseMove={(e) => setMousePos({ x: e.clientX, y: e.clientY })}
                  onMouseLeave={() => setHovered(null)}
                >
                  {width > 1.5 && <span className="flame__bar-label">{n.name}</span>}
                  {/* Side label for narrow bars */}
                  {width <= 1.5 && isHov && <span className="flame__side-label">{n.name}</span>}
                  {isHov && (
                    <div
                      className="flame__tooltip"
                      style={{ left: mousePos.x + 12, top: mousePos.y - 10 }}
                    >
                      <div className="flame__tt-title">{n.name}</div>
                      <div className="flame__tt-type" style={{ color }}>
                        {n.type}
                        {n.metadata?.operation ? ` \u2192 ${String(n.metadata.operation)}` : ''}
                      </div>
                      <div className="flame__tt-dur">
                        {fmtDur((n.endTime ?? n.startTime) - n.startTime)} &middot; {n.status}
                      </div>
                      {n.metadata?.component && (
                        <div className="flame__tt-meta">
                          Component: {String(n.metadata.component)}
                        </div>
                      )}
                      {n.metadata?.action && (
                        <div className="flame__tt-meta">Action: {String(n.metadata.action)}</div>
                      )}
                      {n.metadata?.model && (
                        <div className="flame__tt-meta">Model: {String(n.metadata.model)}</div>
                      )}
                      {(n.metadata?.error ?? n.state?.error) && (
                        <div className="flame__tt-err">
                          {'\u2718'} {String(n.metadata?.error ?? n.state?.error)}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
