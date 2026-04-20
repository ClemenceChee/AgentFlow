import { useMemo } from 'react';

export function Sparkline({
  data,
  width = 80,
  height = 20,
  color = 'var(--accent)',
  fill = true,
}: {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  fill?: boolean;
}) {
  const { path, area } = useMemo(() => {
    if (data.length < 2) return { path: '', area: '' };
    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min || 1;
    const step = width / (data.length - 1);
    const pts = data.map((v, i) => {
      const x = i * step;
      const y = height - ((v - min) / range) * (height - 2) - 1;
      return [x, y] as const;
    });
    const path = pts.map(([x, y], i) => (i === 0 ? `M${x},${y}` : `L${x},${y}`)).join(' ');
    const area = `${path} L${width},${height} L0,${height} Z`;
    return { path, area };
  }, [data, width, height]);

  return (
    <svg
      width={width}
      height={height}
      style={{ display: 'block' }}
      role="img"
      aria-label="Trend sparkline"
    >
      <title>Trend sparkline</title>
      {fill && <path d={area} fill={color} opacity="0.15" />}
      <path d={path} stroke={color} strokeWidth="1.2" fill="none" />
    </svg>
  );
}

export function MiniBars({
  data,
  width = 140,
  height = 28,
  kinds,
}: {
  data: number[];
  width?: number;
  height?: number;
  kinds?: ('ok' | 'warn' | 'fail')[];
}) {
  const max = Math.max(...data, 1);
  const w = width / data.length - 2;
  return (
    <svg width={width} height={height} role="img" aria-label="Mini bars">
      <title>Mini bars</title>
      {data.map((v, i) => {
        const h = Math.max(1, (v / max) * (height - 2));
        const color =
          kinds?.[i] === 'fail'
            ? 'var(--fail)'
            : kinds?.[i] === 'warn'
              ? 'var(--warn)'
              : 'var(--accent)';
        return (
          <rect
            key={`${i}-${v}`}
            x={i * (w + 2)}
            y={height - h}
            width={w}
            height={h}
            fill={color}
            rx="1"
          />
        );
      })}
    </svg>
  );
}
