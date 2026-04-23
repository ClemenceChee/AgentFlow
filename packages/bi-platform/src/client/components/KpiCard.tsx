import type { BusinessMetric } from '../hooks/useKpis';
import { Sparkline } from './charts/Sparkline';

interface Props {
  metric: BusinessMetric;
  onClick?: () => void;
  active?: boolean;
}

export function KpiCard({ metric, onClick, active }: Props) {
  const trendArrow =
    metric.trend === 'up' ? '\u2191' : metric.trend === 'down' ? '\u2193' : '\u2192';
  const isGoodTrend = isPositiveTrend(metric.name, metric.trend);

  return (
    <div
      className="bi-kpi"
      onClick={onClick}
      style={{
        cursor: onClick ? 'pointer' : undefined,
        borderColor: active ? 'var(--info)' : undefined,
      }}
    >
      <span className="bi-kpi__label">{fmtLabel(metric.name)}</span>
      <div className="bi-kpi__row">
        <span className="bi-kpi__value">{fmtValue(metric.value, metric.unit)}</span>
        <span className="bi-kpi__unit">{fmtUnit(metric.unit)}</span>
      </div>
      <div className="bi-kpi__row">
        <span
          className={`bi-kpi__trend bi-kpi__trend--${isGoodTrend ? 'up' : metric.trend === 'stable' ? 'stable' : 'down'}`}
        >
          {trendArrow} {Math.abs(metric.trendPct).toFixed(1)}%
        </span>
        <span style={{ fontSize: 'var(--xs)', color: 'var(--t3)' }}>{metric.period}</span>
      </div>
      <div className="bi-kpi__sparkline">
        <Sparkline
          values={generateSparkData(metric)}
          color={
            isGoodTrend ? 'var(--ok)' : metric.trend === 'stable' ? 'var(--t3)' : 'var(--fail)'
          }
        />
      </div>
    </div>
  );
}

function fmtLabel(name: string): string {
  return name.replace(/_/g, ' ');
}

function fmtValue(value: number, unit: string): string {
  if (unit === '%') return value.toFixed(1);
  if (unit === 'ms')
    return value < 1000 ? Math.round(value).toString() : `${(value / 1000).toFixed(1)}k`;
  if (unit === 'USD' || unit === 'usd') return `$${fmtCompact(value)}`;
  if (value >= 1_000_000) return fmtCompact(value);
  if (value >= 1000) return value.toLocaleString();
  return value.toFixed(value % 1 === 0 ? 0 : 1);
}

function fmtUnit(unit: string): string {
  if (unit === '%') return '%';
  if (unit === 'ms') return 'ms';
  if (unit === 'USD' || unit === 'usd') return '';
  if (unit === 'count') return '';
  return unit;
}

function fmtCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(0);
}

function isPositiveTrend(name: string, trend: string): boolean {
  const higherIsBetter = [
    'overall_success_rate',
    'active_agents',
    'total_executions',
    'compliance_score',
  ];
  const lowerIsBetter = ['avg_response_time', 'total_cost'];
  if (higherIsBetter.includes(name)) return trend === 'up';
  if (lowerIsBetter.includes(name)) return trend === 'down';
  return trend === 'up';
}

function generateSparkData(metric: BusinessMetric): number[] {
  // Generate plausible sparkline from current value + trend
  const base = metric.value;
  const dir = metric.trend === 'up' ? 1 : metric.trend === 'down' ? -1 : 0;
  const pts: number[] = [];
  for (let i = 0; i < 12; i++) {
    const progress = i / 11;
    const noise = Math.sin(i * 2.7) * 0.05 + Math.cos(i * 1.3) * 0.03;
    pts.push(base * (1 - (1 - progress) * dir * (metric.trendPct / 100) + noise));
  }
  return pts;
}
