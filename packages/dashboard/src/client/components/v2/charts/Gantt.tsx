import { fmtMs } from '../atoms';

export interface GanttRow {
  id: string;
  start: number;
  duration: number;
  status: 'ok' | 'warn' | 'fail';
}

export function Gantt({ rows, max = 10 }: { rows: GanttRow[]; max?: number }) {
  if (rows.length === 0) {
    return (
      <div
        style={{
          padding: 'var(--s-6)',
          color: 'var(--t-3)',
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--fs-12)',
        }}
      >
        No traces in window.
      </div>
    );
  }
  const subset = rows.slice(0, max);
  const latest = Math.max(...subset.map((r) => r.start + r.duration));
  const earliest = Math.min(...subset.map((r) => r.start));
  const span = Math.max(1, latest - earliest);

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '180px 1fr 80px',
        rowGap: 4,
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--fs-11)',
      }}
    >
      {subset.map((r) => {
        const offset = (r.start - earliest) / span;
        const w = r.duration / span;
        const color =
          r.status === 'fail'
            ? 'var(--fail)'
            : r.status === 'warn'
              ? 'var(--warn)'
              : 'var(--accent)';
        return (
          <span key={r.id} style={{ display: 'contents' }}>
            <span
              style={{
                color: 'var(--t-2)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {r.id}
            </span>
            <span
              style={{
                position: 'relative',
                height: 18,
                background: 'var(--bg-3)',
                borderRadius: 2,
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  left: `${offset * 100}%`,
                  width: `${w * 100}%`,
                  height: '100%',
                  background: color,
                  borderRadius: 2,
                  minWidth: 3,
                  display: 'block',
                }}
              />
            </span>
            <span style={{ color: 'var(--t-3)', textAlign: 'right' }}>{fmtMs(r.duration)}</span>
          </span>
        );
      })}
    </div>
  );
}
