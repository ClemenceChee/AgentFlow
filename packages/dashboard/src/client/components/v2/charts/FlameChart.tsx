import type { FullTrace, TraceNode } from '../../../hooks/useSelectedTrace';

function laneFor(type: string): number {
  const t = type.toLowerCase();
  if (t.includes('assistant') || t === 'agent') return 0;
  if (t.includes('think')) return 1;
  if (t.includes('guard')) return 3;
  return 2; // tool / other
}

const LANE_COLORS = [
  'var(--accent)', // assistant
  'var(--info)', // thinking
  'var(--purple)', // tool
  'var(--magenta)', // guard
];
const LANE_NAMES = ['assistant', 'thinking', 'tool', 'guard'];

export function FlameChart({ trace }: { trace: FullTrace }) {
  const nodes = Object.values(trace.nodes) as TraceNode[];
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
        No nodes in this trace.
      </div>
    );
  }
  const origin = Math.min(...nodes.map((n) => n.startTime));
  const maxEnd = Math.max(...nodes.map((n) => n.endTime ?? n.startTime + 1));
  const total = Math.max(1, maxEnd - origin);
  const width = 100;
  const rowH = 16;
  const rows = 4;
  return (
    <div
      style={{
        background: 'var(--bg-2)',
        border: '1px solid var(--bd)',
        borderRadius: 'var(--radius)',
        padding: '12px 16px',
      }}
    >
      <div
        style={{
          display: 'flex',
          gap: 14,
          marginBottom: 10,
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--fs-10)',
          color: 'var(--t-3)',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
        }}
      >
        {LANE_COLORS.map((c, i) => (
          <span
            key={LANE_NAMES[i]}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <span style={{ width: 10, height: 10, background: c, borderRadius: 2 }} />
            {LANE_NAMES[i]}
          </span>
        ))}
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', color: 'var(--t-2)' }}>
          {total}ms total
        </span>
      </div>
      <svg
        width="100%"
        height={rows * rowH + 20}
        viewBox={`0 0 ${width} ${rows * rowH + 20}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="Flame chart"
      >
        <title>Flame chart</title>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <line
            key={t}
            x1={t * width}
            x2={t * width}
            y1="0"
            y2={rows * rowH}
            stroke="var(--bd)"
            strokeWidth="0.1"
          />
        ))}
        {nodes.map((n) => {
          const s = n.startTime - origin;
          const e = (n.endTime ?? n.startTime + 1) - origin;
          const x = (s / total) * width;
          const w = Math.max(0.2, ((e - s) / total) * width);
          const lane = laneFor(n.type);
          const y = lane * rowH + 2;
          const color =
            n.status === 'failed'
              ? 'var(--fail)'
              : n.status === 'warn'
                ? 'var(--warn)'
                : LANE_COLORS[lane];
          return (
            <g key={n.id}>
              <rect x={x} y={y} width={w} height={rowH - 4} fill={color} opacity="0.85" rx="0.3" />
            </g>
          );
        })}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <text
            key={`label-${t}`}
            x={t * width}
            y={rows * rowH + 14}
            fontSize="2.5"
            fill="var(--t-3)"
            fontFamily="var(--font-mono)"
            textAnchor={t === 0 ? 'start' : t === 1 ? 'end' : 'middle'}
          >
            {Math.round(t * total)}ms
          </text>
        ))}
      </svg>
      <div
        style={{
          marginTop: 8,
          display: 'grid',
          gridTemplateColumns: '110px 1fr',
          rowGap: 4,
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--fs-11)',
        }}
      >
        {nodes.map((n) => {
          const dur = (n.endTime ?? n.startTime + 1) - n.startTime;
          const lane = laneFor(n.type);
          return (
            <span key={`label-${n.id}`} style={{ display: 'contents' }}>
              <span
                style={{
                  color: 'var(--t-3)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 2,
                    background:
                      n.status === 'failed'
                        ? 'var(--fail)'
                        : n.status === 'warn'
                          ? 'var(--warn)'
                          : LANE_COLORS[lane],
                  }}
                />
                {n.type}
              </span>
              <span style={{ color: 'var(--t-1)' }}>
                <span style={{ color: 'var(--t-1)' }}>{n.name ?? n.id}</span>
                <span style={{ color: 'var(--t-3)', marginLeft: 8 }}>{dur}ms</span>
                {n.status !== 'completed' && n.status !== 'ok' && (
                  <span
                    style={{
                      marginLeft: 10,
                      color: n.status === 'failed' ? 'var(--fail)' : 'var(--warn)',
                      textTransform: 'uppercase',
                      fontSize: 'var(--fs-10)',
                    }}
                  >
                    {n.status}
                  </span>
                )}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
