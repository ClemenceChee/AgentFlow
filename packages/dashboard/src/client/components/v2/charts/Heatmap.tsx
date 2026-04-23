import { useMemo } from 'react';

type CellValue = 'fail' | 'warn' | number;

export function Heatmap({
  cols = 24,
  rows = 7,
  seed = 42,
  dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  values,
  title = 'Error heatmap',
}: {
  cols?: number;
  rows?: number;
  seed?: number;
  dayLabels?: string[];
  values?: CellValue[][];
  title?: string;
}) {
  const data = useMemo<CellValue[][]>(() => {
    if (values) return values;
    let x = seed;
    const rand = () => {
      x = (x * 9301 + 49297) % 233280;
      return x / 233280;
    };
    return Array.from({ length: rows }, () =>
      Array.from({ length: cols }, (): CellValue => {
        const base = rand();
        if (base < 0.03) return 'fail';
        if (base < 0.1) return 'warn';
        if (base < 0.5) return Math.floor(rand() * 5);
        return Math.floor(rand() * 20) + 5;
      }),
    );
  }, [cols, rows, seed, values]);

  const cellColor = (v: CellValue) => {
    if (v === 'fail') return 'var(--fail)';
    if (v === 'warn') return 'var(--warn)';
    if (typeof v === 'number') {
      if (v === 0) return 'var(--bg-3)';
      const alpha = Math.min(0.85, 0.15 + v / 25);
      return `oklch(from var(--accent) l c h / ${alpha})`;
    }
    return 'var(--bg-3)';
  };

  return (
    <div>
      <div
        // biome-ignore lint/a11y/useSemanticElements: visual grid layout, not tabular data
        role="img"
        aria-label={title}
        style={{ display: 'grid', gridTemplateColumns: `36px repeat(${cols}, 1fr)`, gap: 2 }}
      >
        <div />
        {Array.from({ length: cols }, (_, i) => (
          <div
            key={`col-${i}`}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              color: 'var(--t-3)',
              textAlign: 'center',
            }}
          >
            {i % 4 === 0 ? String(i).padStart(2, '0') : ''}
          </div>
        ))}
        {data.map((row, r) => (
          <>
            <div
              key={`row-label-${r}-${dayLabels[r]}`}
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--fs-10)',
                color: 'var(--t-3)',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              {dayLabels[r]}
            </div>
            {row.map((v, c) => (
              <div
                key={`cell-${r}-${c}-${String(v)}`}
                title={`${dayLabels[r]} ${String(c).padStart(2, '0')}:00 \u00B7 ${v}`}
                style={{
                  background: cellColor(v),
                  aspectRatio: '1',
                  borderRadius: 2,
                  minHeight: 14,
                }}
              />
            ))}
          </>
        ))}
      </div>
      <div
        style={{
          marginTop: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--fs-10)',
          color: 'var(--t-3)',
        }}
      >
        <span>less</span>
        {[0.2, 0.35, 0.5, 0.7, 0.9].map((a) => (
          <span
            key={a}
            style={{
              width: 14,
              height: 14,
              background: `oklch(from var(--accent) l c h / ${a})`,
              borderRadius: 2,
            }}
          />
        ))}
        <span>more</span>
        <span style={{ marginLeft: 14, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 14, height: 14, background: 'var(--warn)', borderRadius: 2 }} />{' '}
          warn
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 14, height: 14, background: 'var(--fail)', borderRadius: 2 }} />{' '}
          fail
        </span>
      </div>
    </div>
  );
}
