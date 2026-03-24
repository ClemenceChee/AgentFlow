import { useMemo } from 'react';
import type { ProcessModelData } from '../hooks/useProcessModel';
import { useZoomPan } from '../hooks/useZoomPan';

function fmtDur(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(0)}m`;
}

function heatColor(ratio: number): string {
  // Blue (cold) → Yellow → Red (hot)
  if (ratio < 0.5) {
    const t = ratio * 2;
    const r = Math.round(88 + t * (210 - 88));
    const g = Math.round(166 + t * (153 - 166));
    const b = Math.round(255 + t * (34 - 255));
    return `rgb(${r},${g},${b})`;
  }
  const t = (ratio - 0.5) * 2;
  const r = Math.round(210 + t * (248 - 210));
  const g = Math.round(153 + t * (81 - 153));
  const b = Math.round(34 + t * (73 - 34));
  return `rgb(${r},${g},${b})`;
}

export function BottleneckView({ model }: { model: ProcessModelData }) {
  const zp = useZoomPan();
  const { nodes, edges, positions, maxP95 } = useMemo(() => {
    const trans = model.model.transitions;
    const nodeSet = new Set<string>();
    for (const t of trans) {
      nodeSet.add(t.from);
      nodeSet.add(t.to);
    }
    const nodeArr = [...nodeSet];
    const _maxCount = Math.max(...trans.map((t) => t.count), 1);

    // Build p95 map
    const p95Map = new Map<string, number>();
    let maxP = 0;
    for (const b of model.bottlenecks) {
      p95Map.set(b.nodeName, b.p95);
      if (b.p95 > maxP) maxP = b.p95;
    }

    // Layout
    const pos = new Map<string, { x: number; y: number }>();
    const layers = new Map<string, number>();
    const incoming = new Set(trans.map((e) => e.to));
    const roots = nodeArr.filter((n) => !incoming.has(n));
    const queue =
      roots.length > 0 ? [...roots] : nodeArr.length > 0 && nodeArr[0] ? [nodeArr[0]] : [];
    for (const r of queue) layers.set(r, 0);
    const visited = new Set(queue);
    const bfs = [...queue];
    while (bfs.length > 0) {
      const cur = bfs.shift();
      if (!cur) break;
      const layer = layers.get(cur) ?? 0;
      for (const e of trans) {
        if (e.from === cur && !visited.has(e.to)) {
          visited.add(e.to);
          layers.set(e.to, layer + 1);
          bfs.push(e.to);
        }
      }
    }
    for (const n of nodeArr) if (!layers.has(n)) layers.set(n, 0);

    const layerNodes = new Map<number, string[]>();
    for (const [n, l] of layers) {
      const arr = layerNodes.get(l) ?? [];
      arr.push(n);
      layerNodes.set(l, arr);
    }
    for (const [layer, ns] of layerNodes) {
      ns.forEach((n, i) => {
        pos.set(n, { x: 60 + layer * 200, y: 40 + i * 70 });
      });
    }

    return { nodes: nodeArr, edges: trans, positions: pos, maxP95: maxP };
  }, [model]);

  if (nodes.length === 0)
    return <div className="workspace__empty">No process data to visualize</div>;

  const maxX = Math.max(...[...positions.values()].map((p) => p.x), 200);
  const maxY = Math.max(...[...positions.values()].map((p) => p.y), 100);

  return (
    <div className="bn-layout">
      <div style={{ fontSize: 'var(--xs)', color: 'var(--t3)', marginBottom: 'var(--s2)' }}>
        Thermal view — blue = fast, red = slow (by p95 duration). {model.bottlenecks.length}{' '}
        bottlenecks detected.
      </div>

      {/* Legend */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--s2)',
          marginBottom: 'var(--s3)',
          fontSize: 'var(--xs)',
        }}
      >
        <span style={{ color: heatColor(0) }}>{'\u25A0'} Fast</span>
        <div
          style={{
            width: 80,
            height: 8,
            borderRadius: 4,
            background:
              'linear-gradient(to right, rgb(88,166,255), rgb(210,153,34), rgb(248,81,73))',
          }}
        />
        <span style={{ color: heatColor(1) }}>{'\u25A0'} Slow</span>
      </div>

      {/* Chart area — fixed height with scroll */}
      <div className="bn-chart-area">
        <div className="bn-chart-controls">
          <button type="button" onClick={zp.zoomOut} className="zb">
            −
          </button>
          <button type="button" onClick={zp.reset} className="zb">
            ⟲
          </button>
          <button type="button" onClick={zp.zoomIn} className="zb">
            +
          </button>
        </div>
        <svg
          width="100%"
          height={maxY + 80}
          viewBox={`0 0 ${maxX + 220} ${maxY + 80}`}
          {...zp.handlers}
          style={{ cursor: 'grab' }}
        >
          <title>Bottleneck thermal chart</title>
          <g transform={zp.svgTransform}>
            <defs>
              <marker
                id="bn-arrow"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="5"
                markerHeight="5"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--t3)" opacity="0.4" />
              </marker>
              <filter id="glow">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Edges */}
            {edges.map((e, _i) => {
              const from = positions.get(e.from);
              const to = positions.get(e.to);
              if (!from || !to) return null;
              return (
                <line
                  key={`${e.from}-${e.to}`}
                  x1={from.x + 140}
                  y1={from.y + 20}
                  x2={to.x}
                  y2={to.y + 20}
                  stroke="var(--t3)"
                  strokeWidth={1}
                  opacity={0.3}
                  markerEnd="url(#bn-arrow)"
                />
              );
            })}

            {/* Nodes with heat coloring */}
            {nodes.map((n) => {
              const p = positions.get(n);
              if (!p) return null;
              const p95 = model.bottlenecks.find((b) => b.nodeName === n)?.p95 ?? 0;
              const ratio = maxP95 > 0 ? p95 / maxP95 : 0;
              const color = heatColor(ratio);
              const isHot = ratio > 0.7;

              return (
                <g key={n} filter={isHot ? 'url(#glow)' : undefined}>
                  <rect
                    x={p.x}
                    y={p.y}
                    width={140}
                    height={40}
                    rx={5}
                    fill={color}
                    opacity={0.15}
                    stroke={color}
                    strokeWidth={isHot ? 3 : 1.5}
                  />
                  <text
                    x={p.x + 8}
                    y={p.y + 16}
                    fill="#e6edf3"
                    fontSize={10}
                    fontFamily="var(--fm)"
                    fontWeight={600}
                  >
                    {n.length > 18 ? `${n.slice(0, 18)}\u2026` : n}
                  </text>
                  {p95 > 0 && (
                    <text
                      x={p.x + 8}
                      y={p.y + 32}
                      fill={color}
                      fontSize={10}
                      fontFamily="var(--fm)"
                      fontWeight={700}
                    >
                      p95: {fmtDur(p95)}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      {/* Bottleneck ranking — always visible */}
      <div className="bn-ranking">
        <h4
          style={{
            fontSize: 'var(--xs)',
            color: 'var(--t3)',
            textTransform: 'uppercase',
            letterSpacing: '.06em',
            margin: 'var(--s3) 0 var(--s2)',
          }}
        >
          Bottleneck Ranking
        </h4>
        {model.bottlenecks
          .sort((a, b) => b.p95 - a.p95)
          .map((b, i) => {
            const ratio = maxP95 > 0 ? b.p95 / maxP95 : 0;
            return (
              <div key={b.nodeName} className="bn-row">
                <span style={{ width: 18, color: 'var(--t3)', fontSize: 'var(--xs)' }}>
                  #{i + 1}
                </span>
                <span className="bn-row__name">{b.nodeName}</span>
                <span className="bn-row__type">{b.nodeType}</span>
                <span className="bn-row__p95" style={{ color: heatColor(ratio) }}>
                  {fmtDur(b.p95)}
                </span>
                <span className="bn-row__bar">
                  <span
                    className="bn-row__fill"
                    style={{ width: `${ratio * 100}%`, background: heatColor(ratio) }}
                  />
                </span>
              </div>
            );
          })}
      </div>
    </div>
  );
}
