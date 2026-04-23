import { useMemo } from 'react';

export function LineChart({
  data,
  height = 120,
  color = 'var(--accent)',
  xLabels,
  label,
}: {
  data: number[];
  height?: number;
  color?: string;
  xLabels?: string[];
  label?: string;
}) {
  const { path, area } = useMemo(() => {
    if (data.length < 2) return { path: '', area: '' };
    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min || 1;
    const w = 100;
    const step = w / (data.length - 1);
    const pts = data.map((v, i) => [i * step, height - ((v - min) / range) * (height - 20) - 10]);
    const p = pts.map(([x, y], i) => (i === 0 ? `M${x},${y}` : `L${x},${y}`)).join(' ');
    const a = `${p} L${w},${height} L0,${height} Z`;
    return { path: p, area: a };
  }, [data, height]);

  const labels = xLabels ?? ['00:00', '06:00', '12:00', '18:00', 'now'];

  return (
    <div>
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 100 ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={label ?? 'Time-series chart'}
      >
        <title>{label ?? 'Time-series chart'}</title>
        {[0.25, 0.5, 0.75].map((t) => (
          <line
            key={t}
            x1="0"
            x2="100"
            y1={t * height}
            y2={t * height}
            stroke="var(--bd-weak)"
            strokeWidth="0.2"
            strokeDasharray="0.5 0.5"
          />
        ))}
        <path d={area} fill={color} opacity="0.14" />
        <path
          d={path}
          stroke={color}
          strokeWidth="0.6"
          fill="none"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--fs-10)',
          color: 'var(--t-3)',
          marginTop: 6,
        }}
      >
        {labels.map((l) => (
          <span key={l}>{l}</span>
        ))}
      </div>
    </div>
  );
}
