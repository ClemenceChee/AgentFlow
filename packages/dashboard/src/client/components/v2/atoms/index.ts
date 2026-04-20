export { Badge, type BadgeKind, StatusPill } from './Badge';
export { Card, Chip } from './Card';
export { Dot, type DotKind } from './Dot';
export { Kpi, KpiRow } from './Kpi';
export { MiniBars, Sparkline } from './Sparkline';

export function fmtMs(ms: number | null | undefined): string {
  if (ms == null) return '\u2014';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(ms < 10000 ? 2 : 1)}s`;
}

export function fmtAgo(t: number): string {
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function fmtTime(t: number): string {
  const d = new Date(t);
  return d.toLocaleTimeString([], { hour12: false });
}
