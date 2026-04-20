export interface ProcessActivity {
  id: string;
  x: number;
  y: number;
  count: number;
  failRate: number;
}
export type ProcessEdge = [from: string, to: string, count: number];

export function ProcessMap({
  activities,
  edges,
}: {
  activities: ProcessActivity[];
  edges: ProcessEdge[];
}) {
  if (activities.length === 0) {
    return (
      <div
        style={{
          padding: 'var(--s-8)',
          textAlign: 'center',
          color: 'var(--t-3)',
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--fs-12)',
        }}
      >
        No process model available. Run the mining pipeline to populate.
      </div>
    );
  }
  const byId = Object.fromEntries(activities.map((a) => [a.id, a]));
  const maxCount = Math.max(...edges.map(([, , c]) => c), 1);
  const maxNode = Math.max(...activities.map((a) => a.count), 1);
  const colorFor = (fr: number) => {
    if (fr > 0.15) return 'var(--fail)';
    if (fr > 0.05) return 'var(--warn)';
    return 'var(--ok)';
  };
  return (
    <svg
      width="100%"
      viewBox="0 0 1120 280"
      style={{
        background: 'var(--bg-2)',
        borderRadius: 'var(--radius)',
        border: '1px solid var(--bd)',
      }}
      role="img"
      aria-label="Process map"
    >
      <title>Directly-follows process map</title>
      <defs>
        <marker
          id="v2-proc-arrow"
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
      {edges.map(([from, to, count], i) => {
        const f = byId[from];
        const t = byId[to];
        if (!f || !t) return null;
        const strokeW = 1 + (count / maxCount) * 4;
        const mx = (f.x + t.x) / 2;
        const my = (f.y + t.y) / 2 - 12;
        return (
          <g key={`edge-${from}-${to}-${i}`}>
            <path
              d={`M ${f.x + 22} ${f.y} Q ${mx} ${my} ${t.x - 22} ${t.y}`}
              stroke="var(--t-3)"
              strokeWidth={strokeW}
              fill="none"
              markerEnd="url(#v2-proc-arrow)"
              opacity="0.55"
            />
            <text
              x={mx}
              y={my + 2}
              fontSize="10"
              fontFamily="var(--font-mono)"
              fill="var(--t-3)"
              textAnchor="middle"
            >
              {count}
            </text>
          </g>
        );
      })}
      {activities.map((a) => {
        const r = 18 + (a.count / maxNode) * 14;
        return (
          <g key={a.id}>
            <circle
              cx={a.x}
              cy={a.y}
              r={r}
              fill="var(--bg-3)"
              stroke={colorFor(a.failRate)}
              strokeWidth="2"
            />
            <text
              x={a.x}
              y={a.y + 3}
              fontSize="11"
              fontFamily="var(--font-mono)"
              fill="var(--t-1)"
              textAnchor="middle"
              fontWeight="600"
            >
              {a.id}
            </text>
            <text
              x={a.x}
              y={a.y + r + 14}
              fontSize="10"
              fontFamily="var(--font-mono)"
              fill="var(--t-3)"
              textAnchor="middle"
            >
              {a.count} {'\u00B7'} {(a.failRate * 100).toFixed(0)}%
            </text>
          </g>
        );
      })}
    </svg>
  );
}
