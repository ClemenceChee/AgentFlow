import type { ReactNode } from 'react';
import { Sparkline } from './Sparkline';

export function Kpi({
  label,
  value,
  unit,
  delta,
  deltaKind = 'up',
  spark,
  sparkColor,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  delta?: string;
  deltaKind?: 'up' | 'down';
  spark?: number[];
  sparkColor?: string;
}) {
  return (
    <div className="v2-kpi">
      <div className="v2-kpi__label">{label}</div>
      <div className="v2-kpi__value">
        {value}
        {unit && <small>{unit}</small>}
      </div>
      {delta != null && (
        <div className={`v2-kpi__delta ${deltaKind}`}>
          <span aria-hidden>{deltaKind === 'up' ? '\u25B2' : '\u25BC'}</span> {delta}
        </div>
      )}
      {spark && (
        <div className="v2-kpi__spark">
          <Sparkline data={spark} color={sparkColor || 'var(--accent)'} width={60} height={18} />
        </div>
      )}
    </div>
  );
}

export function KpiRow({ children }: { children: ReactNode }) {
  return <div className="v2-kpi-row">{children}</div>;
}
