import { useEffect, useState } from 'react';
import type { AgentStats } from '../hooks/useAgents';
import type { ProcessHealthData } from '../hooks/useProcessHealth';
import type { TraceEntry } from '../hooks/useTraces';

declare const __APP_VERSION__: string;

interface StatCell {
  label: string;
  value: string | number;
  kind?: 'ok' | 'warn' | 'fail';
  sparkline?: boolean[];
}

export function HealthBanner({
  processHealth,
  agents,
  traces,
  onOpenSettings,
}: {
  processHealth: ProcessHealthData | null;
  agents: AgentStats[];
  traces: TraceEntry[];
  onOpenSettings?: () => void;
}) {
  const serviceCount = processHealth?.services.length ?? 0;
  const activeServices =
    processHealth?.services.filter(
      (s) => s.systemd?.activeState === 'active' || (s.pidFile?.alive && s.pidFile.matchesProcess),
    ).length ?? 0;
  const failedServices = processHealth?.services.filter((s) => s.systemd?.failed).length ?? 0;

  const totalExec = traces.length;
  const failedExec = traces.filter((t) => t.status === 'failed').length;
  const successRate =
    totalExec > 0 ? (((totalExec - failedExec) / totalExec) * 100).toFixed(1) : '—';
  const orphans = processHealth?.orphans.length ?? 0;

  const recentSparkline = traces.slice(0, 30).map((t) => t.status !== 'failed');

  const stats: StatCell[] = [
    {
      label: 'SERVICES',
      value: `${activeServices}/${serviceCount}`,
      kind: failedServices > 0 ? 'fail' : 'ok',
    },
    { label: 'AGENTS', value: agents.length },
    { label: 'EXECUTIONS', value: totalExec, sparkline: recentSparkline },
    {
      label: 'SUCCESS',
      value: `${successRate}%`,
      kind: Number.parseFloat(String(successRate)) < 95 ? 'warn' : 'ok',
    },
    {
      label: 'FAILURES',
      value: failedExec,
      kind: failedExec > 0 ? 'fail' : 'ok',
    },
    { label: 'ORPHANS', value: orphans, kind: orphans > 0 ? 'warn' : undefined },
  ];

  const [connected, setConnected] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(Date.now());

  useEffect(() => {
    setLastUpdate(Date.now());
    setConnected(true);
  }, []);

  useEffect(() => {
    const check = setInterval(() => {
      if (Date.now() - lastUpdate > 30000) setConnected(false);
    }, 5000);
    return () => clearInterval(check);
  }, [lastUpdate]);

  return (
    <header className="health-banner">
      <div className="health-banner__brand">
        <span className="health-banner__title">AgentFlow</span>
        <span className="health-banner__version">v{__APP_VERSION__}</span>
        <span
          className={`badge ${connected ? 'badge--ok' : 'badge--fail'} health-banner__status`}
          title={connected ? 'Connected — scanning live' : 'Disconnected'}
        >
          <span className={`dot dot--${connected ? 'ok' : 'fail'}`} />
          {connected ? 'LIVE' : 'OFFLINE'}
        </span>
      </div>

      <div className="health-banner__stats">
        {stats.map((s) => (
          <div key={s.label} className="health-banner__stat">
            <span className="health-banner__stat-label">{s.label}</span>
            <span
              className={`health-banner__stat-value ${s.kind ? `health-banner__stat-value--${s.kind}` : ''}`}
            >
              {s.value}
            </span>
            {s.sparkline && (
              <div className="health-banner__sparkline">
                {s.sparkline.map((ok, i) => (
                  <span
                    key={`${s.label}-${i}-${ok ? 'o' : 'f'}`}
                    className={`health-banner__spark health-banner__spark--${ok ? 'ok' : 'fail'}`}
                  />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {onOpenSettings && (
        <button
          type="button"
          className="btn btn--secondary health-banner__settings"
          onClick={onOpenSettings}
          title="Settings"
          aria-label="Open settings"
        >
          {'\u2699'}
        </button>
      )}
    </header>
  );
}
