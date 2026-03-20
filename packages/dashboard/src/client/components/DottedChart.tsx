import { useMemo, useState } from 'react';
import type { TraceEntry } from '../hooks/useTraces';

const TYPE_COLORS: Record<string, string> = {
  completed: '#3fb950', failed: '#f85149', running: '#58a6ff', unknown: '#8b949e',
};

export function DottedChart({ traces }: { traces: TraceEntry[] }) {
  const [hovered, setHovered] = useState<TraceEntry | null>(null);

  const sorted = useMemo(() =>
    [...traces].sort((a, b) => a.timestamp - b.timestamp),
    [traces],
  );

  if (sorted.length === 0) return <div className="workspace__empty">No executions to chart</div>;

  const minTime = sorted[0]!.timestamp;
  const maxTime = sorted[sorted.length - 1]!.timestamp;
  const timeRange = Math.max(maxTime - minTime, 1);

  const W = 800;
  const H = Math.max(200, sorted.length * 4 + 40);

  return (
    <div className="dotchart">
      <div style={{ fontSize: 'var(--xs)', color: 'var(--t3)', marginBottom: 'var(--s2)' }}>
        {sorted.length} executions over {Math.round(timeRange / 3600000)}h
      </div>
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
        {/* Time axis labels */}
        {[0, 0.25, 0.5, 0.75, 1].map((pct) => (
          <text key={pct} x={40 + (W - 60) * pct} y={H - 4} fill="#6e7681" fontSize={9} fontFamily="var(--fm)" textAnchor="middle">
            {new Date(minTime + timeRange * pct).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </text>
        ))}

        {/* Dots */}
        {sorted.map((t, i) => {
          const x = 40 + ((t.timestamp - minTime) / timeRange) * (W - 60);
          const y = 10 + (i / sorted.length) * (H - 30);
          const color = TYPE_COLORS[t.status] ?? TYPE_COLORS.unknown;
          const r = t.status === 'failed' ? 4 : 2.5;
          return (
            <circle
              key={t.filename || i}
              cx={x} cy={y} r={r}
              fill={color}
              opacity={hovered === t ? 1 : 0.7}
              onMouseEnter={() => setHovered(t)}
              onMouseLeave={() => setHovered(null)}
              style={{ cursor: 'pointer' }}
            />
          );
        })}
      </svg>

      {hovered && (
        <div style={{ fontSize: 'var(--xs)', color: 'var(--t2)', background: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 'var(--r)', padding: 'var(--s1) var(--s2)', display: 'inline-block', marginTop: 'var(--s1)' }}>
          <strong>{hovered.agentId}</strong> &middot; {hovered.status} &middot; {hovered.nodeCount}n &middot; {hovered.duration < 1000 ? `${hovered.duration}ms` : `${(hovered.duration / 1000).toFixed(1)}s`}
          &middot; {new Date(hovered.timestamp).toLocaleString()}
        </div>
      )}
    </div>
  );
}
