import { useCallback, useEffect, useState } from 'react';
import type { AgentStats } from '../hooks/useAgents';
import type { ProcessHealthData } from '../hooks/useProcessHealth';
import type { TraceEntry } from '../hooks/useTraces';

function useVersion(): string {
  const [version, setVersion] = useState('…');
  const fetchVersion = useCallback(async () => {
    try {
      const res = await fetch('/api/version');
      if (res.ok) {
        const data = await res.json();
        setVersion(data.version);
      }
    } catch { /* ignore */ }
  }, []);
  useEffect(() => { fetchVersion(); }, [fetchVersion]);
  return version;
}

interface StatCell {
  label: string;
  value: string | number;
  color?: string;
  sparkline?: boolean[];
}

export function HealthBanner({ processHealth, agents, traces, onOpenSettings }: {
  processHealth: ProcessHealthData | null;
  agents: AgentStats[];
  traces: TraceEntry[];
  onOpenSettings?: () => void;
}) {
  const serviceCount = processHealth?.services.length ?? 0;
  const activeServices = processHealth?.services.filter(
    (s) => s.systemd?.activeState === 'active' || (s.pidFile?.alive && s.pidFile.matchesProcess),
  ).length ?? 0;
  const failedServices = processHealth?.services.filter((s) => s.systemd?.failed).length ?? 0;

  const totalExec = traces.length;
  const failedExec = traces.filter((t) => t.status === 'failed').length;
  const successRate = totalExec > 0 ? ((totalExec - failedExec) / totalExec * 100).toFixed(1) : '—';
  const orphans = processHealth?.orphans.length ?? 0;

  // Sparkline: last 30 executions pass/fail
  const recentSparkline = traces.slice(0, 30).map((t) => t.status !== 'failed');

  const stats: StatCell[] = [
    { label: 'Services', value: `${activeServices}/${serviceCount}`, color: failedServices > 0 ? 'var(--color-critical)' : 'var(--color-ok)' },
    { label: 'Agents', value: agents.length },
    { label: 'Executions', value: totalExec, sparkline: recentSparkline },
    { label: 'Success', value: `${successRate}%`, color: parseFloat(String(successRate)) < 95 ? 'var(--color-warn)' : 'var(--color-ok)' },
    { label: 'Failures', value: failedExec, color: failedExec > 0 ? 'var(--color-critical)' : 'var(--color-ok)' },
    { label: 'Orphans', value: orphans, color: orphans > 0 ? 'var(--color-warn)' : undefined },
  ];

  const version = useVersion();
  const [connected, setConnected] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(Date.now());

  // Detect connection by checking if data is stale
  useEffect(() => {
    setLastUpdate(Date.now());
    setConnected(true);
  }, [processHealth, traces]);

  useEffect(() => {
    const check = setInterval(() => {
      // If no update in 30s, show disconnected
      if (Date.now() - lastUpdate > 30000) setConnected(false);
    }, 5000);
    return () => clearInterval(check);
  }, [lastUpdate]);

  return (
    <header className="health-banner">
      <span className="health-banner__title">AgentFlow</span>
      <span className="hb-version">v{version}</span>
      <span className={`hb-live ${connected ? 'hb-live--on' : 'hb-live--off'}`} title={connected ? 'Connected — scanning live' : 'Disconnected'}>
        <span className={`hb-live__dot ${connected ? 'hb-live__dot--pulse' : ''}`} />
        {connected ? 'LIVE' : 'OFFLINE'}
      </span>
      <div className="health-banner__stats">
        {stats.map((s) => (
          <div key={s.label} className="stat-cell">
            <span className="stat-cell__value" style={s.color ? { color: s.color } : undefined}>
              {s.value}
            </span>
            <span className="stat-cell__label">{s.label}</span>
            {s.sparkline && (
              <div className="stat-cell__sparkline">
                {s.sparkline.map((ok, i) => (
                  <div key={i} className={`spark ${ok ? 'spark--ok' : 'spark--fail'}`} />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      {onOpenSettings && (
        <button onClick={onOpenSettings} style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: 'var(--t3)', cursor: 'pointer', fontSize: 'var(--base)', padding: '0 var(--s2)' }} title="Settings">
          {'\u2699'}
        </button>
      )}
    </header>
  );
}
