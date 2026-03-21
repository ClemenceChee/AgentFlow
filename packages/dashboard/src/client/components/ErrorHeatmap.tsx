import { useMemo, useState } from 'react';
import type { TraceEntry } from '../hooks/useTraces';

export function ErrorHeatmap({ traces }: { traces: TraceEntry[] }) {
  const [hovered, setHovered] = useState<TraceEntry | null>(null);

  const recent = useMemo(
    () =>
      [...traces]
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 200)
        .reverse(),
    [traces],
  );

  if (recent.length === 0) return <div className="placeholder">No executions to display</div>;

  return (
    <div style={{ padding: 'var(--sp-4)' }}>
      <div
        style={{
          fontSize: 'var(--text-xs)',
          color: 'var(--text-muted)',
          marginBottom: 'var(--sp-3)',
        }}
      >
        Last {recent.length} executions &middot; Green = OK &middot; Red = Failed &middot;
        Brightness = node count
      </div>
      <div className="heatmap-grid">
        {recent.map((t, i) => {
          const isFailed = t.status === 'failed';
          const intensity = t.nodeCount / Math.max(...recent.map((x) => x.nodeCount), 1);
          const bg = isFailed
            ? `rgba(248,81,73,${0.3 + intensity * 0.7})`
            : `rgba(63,185,80,${0.1 + intensity * 0.35})`;
          return (
            <div
              key={t.filename || i}
              className="heatmap-cell"
              style={{ background: bg }}
              onMouseEnter={() => setHovered(t)}
              onMouseLeave={() => setHovered(null)}
            >
              {isFailed && <span className="heatmap-cell__fail">{'\u2718'}</span>}
            </div>
          );
        })}
      </div>
      {hovered && (
        <div
          style={{
            marginTop: 'var(--sp-2)',
            fontSize: 'var(--text-xs)',
            color: 'var(--text-secondary)',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--sp-2) var(--sp-3)',
            display: 'inline-block',
          }}
        >
          <strong>{hovered.agentId}</strong> &middot; {hovered.status} &middot; {hovered.nodeCount}{' '}
          nodes &middot;{' '}
          {hovered.duration < 1000
            ? `${hovered.duration}ms`
            : `${(hovered.duration / 1000).toFixed(1)}s`}
        </div>
      )}
    </div>
  );
}
