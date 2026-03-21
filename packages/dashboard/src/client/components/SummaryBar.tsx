import type { ProcessHealthData } from '../hooks/useProcessHealth';
import type { TraceEntry } from '../hooks/useTraces';

export function SummaryBar({
  processHealth,
  traces,
}: {
  processHealth: ProcessHealthData | null;
  traces: TraceEntry[];
}) {
  const services = processHealth?.services.length ?? 0;
  const active =
    processHealth?.services.filter((s) => s.systemd?.activeState === 'active').length ?? 0;
  const failures = traces.filter((t) => t.status === 'failed').length;
  const orphans = processHealth?.orphans.length ?? 0;
  const rate =
    traces.length > 0 ? (((traces.length - failures) / traces.length) * 100).toFixed(1) : '—';

  return (
    <footer className="summary-bar">
      <span>
        {services} services ({active} active)
      </span>
      <span>&middot;</span>
      <span>{traces.length} executions</span>
      <span>&middot;</span>
      <span
        style={
          parseFloat(String(rate)) < 95
            ? { color: 'var(--color-warn)' }
            : { color: 'var(--color-ok)' }
        }
      >
        {rate}% success
      </span>
      {failures > 0 && (
        <>
          <span>&middot;</span>
          <span style={{ color: 'var(--color-critical)' }}>
            {'\u2718'} {failures} failures
          </span>
        </>
      )}
      {orphans > 0 && (
        <>
          <span>&middot;</span>
          <span style={{ color: 'var(--color-warn)' }}>
            {'\u26A0'} {orphans} orphans
          </span>
        </>
      )}
    </footer>
  );
}
