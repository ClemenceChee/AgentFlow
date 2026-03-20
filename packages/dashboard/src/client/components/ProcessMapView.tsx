import { useMemo, useState } from 'react';
import type { ProcessModelData } from '../hooks/useProcessModel';
import { useZoomPan } from '../hooks/useZoomPan';

function fmtDur(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(0)}m`;
}

export function ProcessMapView({ model }: { model: ProcessModelData }) {
  const [minFreq, setMinFreq] = useState(0);
  const zp = useZoomPan();

  const { nodes, edges, maxCount } = useMemo(() => {
    const trans = model.model.transitions;
    const maxC = Math.max(...trans.map((t) => t.count), 1);
    const nodeSet = new Set<string>();
    for (const t of trans) { nodeSet.add(t.from); nodeSet.add(t.to); }
    const nodeArr = [...nodeSet];
    const filtered = trans.filter((t) => (t.count / maxC) * 100 >= minFreq);
    return { nodes: nodeArr, edges: filtered, maxCount: maxC };
  }, [model, minFreq]);

  // Simple layered layout: assign layers by topological order
  const positions = useMemo(() => {
    const pos = new Map<string, { x: number; y: number }>();
    const layers = new Map<string, number>();

    // BFS from nodes that have no incoming edges
    const incoming = new Set(edges.map((e) => e.to));
    const roots = nodes.filter((n) => !incoming.has(n));
    const queue = roots.length > 0 ? roots : [nodes[0]!];
    for (const r of queue) layers.set(r, 0);

    const visited = new Set(queue);
    const bfs = [...queue];
    while (bfs.length > 0) {
      const current = bfs.shift()!;
      const layer = layers.get(current) ?? 0;
      for (const e of edges) {
        if (e.from === current && !visited.has(e.to)) {
          visited.add(e.to);
          layers.set(e.to, layer + 1);
          bfs.push(e.to);
        }
      }
    }
    // Assign any unvisited
    for (const n of nodes) if (!layers.has(n)) layers.set(n, 0);

    // Position nodes in layers
    const layerNodes = new Map<number, string[]>();
    for (const [n, l] of layers) {
      const arr = layerNodes.get(l) ?? [];
      arr.push(n);
      layerNodes.set(l, arr);
    }

    const COL = 200;
    const ROW = 60;
    for (const [layer, layerNs] of layerNodes) {
      layerNs.forEach((n, i) => {
        pos.set(n, { x: 60 + layer * COL, y: 40 + i * ROW });
      });
    }
    return pos;
  }, [nodes, edges]);

  const maxLayer = Math.max(...[...positions.values()].map((p) => p.x), 200);
  const maxY = Math.max(...[...positions.values()].map((p) => p.y), 100);

  return (
    <div className="pmap">
      <div className="pmap__controls">
        <label className="pmap__slider-label">
          Simplify: {minFreq}%
          <input type="range" min={0} max={80} value={minFreq} onChange={(e) => setMinFreq(Number(e.target.value))} className="pmap__slider" />
        </label>
        <span className="pmap__info">{nodes.length} steps, {edges.length} transitions</span>
        <span className="pmap__zoom">
          <button onClick={zp.zoomOut} className="zb">−</button>
          <button onClick={zp.reset} className="zb">⟲</button>
          <button onClick={zp.zoomIn} className="zb">+</button>
        </span>
      </div>

      <svg width="100%" height={maxY + 80} viewBox={`0 0 ${maxLayer + 200} ${maxY + 80}`} className="pmap__svg"
           {...zp.handlers} style={{ cursor: 'grab' }}>
        <g transform={zp.svgTransform}>
        {/* Edges */}
        {edges.map((e, i) => {
          const from = positions.get(e.from);
          const to = positions.get(e.to);
          if (!from || !to) return null;
          const thickness = Math.max(1, (e.count / maxCount) * 6);
          const opacity = 0.3 + (e.count / maxCount) * 0.7;
          return (
            <line key={i} x1={from.x + 70} y1={from.y + 16} x2={to.x} y2={to.y + 16}
              stroke="var(--color-info)" strokeWidth={thickness} opacity={opacity}
              markerEnd="url(#arrow)" />
          );
        })}

        {/* Arrow marker */}
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-info)" opacity="0.6" />
          </marker>
        </defs>

        {/* Nodes */}
        {nodes.map((n) => {
          const p = positions.get(n);
          if (!p) return null;
          const bn = model.bottlenecks.find((b) => b.nodeName === n);
          const maxP95 = Math.max(...model.bottlenecks.map((b) => b.p95), 1);
          const heat = bn ? bn.p95 / maxP95 : 0;
          // Blue → Red gradient
          const r = Math.round(heat * 248 + (1 - heat) * 88);
          const g = Math.round(heat * 81 + (1 - heat) * 166);
          const b2 = Math.round(heat * 73 + (1 - heat) * 255);
          const fill = `rgb(${r},${g},${b2})`;

          return (
            <g key={n}>
              <rect x={p.x} y={p.y} width={140} height={32} rx={5} fill="var(--bg-surface)" stroke={fill} strokeWidth={2} />
              <text x={p.x + 8} y={p.y + 14} fill="#e6edf3" fontSize={10} fontFamily="var(--font-mono)" fontWeight={600}>
                {n.length > 18 ? n.slice(0, 18) + '\u2026' : n}
              </text>
              {bn && (
                <text x={p.x + 8} y={p.y + 26} fill={fill} fontSize={9} fontFamily="var(--font-mono)">
                  p95: {fmtDur(bn.p95)}
                </text>
              )}
            </g>
          );
        })}
        </g>
      </svg>
    </div>
  );
}
