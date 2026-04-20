interface StateDef {
  id: string;
  x: number;
  y: number;
  kind?: 'ok' | 'fail';
}

const DEFAULT_STATES: StateDef[] = [
  { id: 'idle', x: 80, y: 100 },
  { id: 'running', x: 280, y: 100 },
  { id: 'waiting', x: 480, y: 40 },
  { id: 'tool', x: 480, y: 160 },
  { id: 'done', x: 680, y: 100, kind: 'ok' },
  { id: 'error', x: 680, y: 200, kind: 'fail' },
];

const DEFAULT_EDGES: [string, string, number][] = [
  ['idle', 'running', 312],
  ['running', 'waiting', 120],
  ['running', 'tool', 240],
  ['waiting', 'running', 115],
  ['tool', 'running', 232],
  ['running', 'done', 298],
  ['tool', 'error', 14],
  ['running', 'error', 8],
];

export function StateMachine({
  states = DEFAULT_STATES,
  edges = DEFAULT_EDGES,
}: {
  states?: StateDef[];
  edges?: [string, string, number][];
}) {
  const by = Object.fromEntries(states.map((s) => [s.id, s]));
  return (
    <svg
      width="100%"
      viewBox="0 0 780 260"
      style={{
        background: 'var(--bg-2)',
        borderRadius: 'var(--radius)',
        border: '1px solid var(--bd)',
      }}
      role="img"
      aria-label="State machine"
    >
      <title>State machine</title>
      <defs>
        <marker
          id="v2-state-arrow"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--t-3)" />
        </marker>
      </defs>
      {edges.map(([f, t, c], i) => {
        const a = by[f];
        const b = by[t];
        if (!a || !b) return null;
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2 - 10;
        return (
          <g key={`edge-${f}-${t}-${i}`}>
            <path
              d={`M ${a.x + 28} ${a.y} Q ${mx} ${my} ${b.x - 28} ${b.y}`}
              stroke="var(--t-3)"
              fill="none"
              strokeWidth="1.4"
              markerEnd="url(#v2-state-arrow)"
              opacity="0.6"
            />
            <text
              x={mx}
              y={my - 2}
              fontSize="10"
              fontFamily="var(--font-mono)"
              fill="var(--t-3)"
              textAnchor="middle"
            >
              {c}
            </text>
          </g>
        );
      })}
      {states.map((s) => {
        const color =
          s.kind === 'ok' ? 'var(--ok)' : s.kind === 'fail' ? 'var(--fail)' : 'var(--accent)';
        return (
          <g key={s.id}>
            <rect
              x={s.x - 40}
              y={s.y - 16}
              width="80"
              height="32"
              rx="4"
              fill="var(--bg-3)"
              stroke={color}
              strokeWidth="1.5"
            />
            <text
              x={s.x}
              y={s.y + 4}
              fontSize="12"
              fontFamily="var(--font-mono)"
              fill="var(--t-1)"
              textAnchor="middle"
              fontWeight="600"
            >
              {s.id}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
