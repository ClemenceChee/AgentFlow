import { useCallback, useState } from 'react';
import type { ProcessHealthData } from '../hooks/useProcessHealth';

interface Alert {
  id: string;
  severity: 'critical' | 'warn' | 'info';
  title: string;
  description: string;
  actions?: { label: string; command: string }[];
}

function deriveAlerts(data: ProcessHealthData): Alert[] {
  const alerts: Alert[] = [];

  for (const svc of data.services) {
    if (svc.systemd?.failed) {
      alerts.push({
        id: `failed-${svc.name}`,
        severity: 'critical',
        title: `${svc.name || 'unnamed'}.service has failed`,
        description: `State: ${svc.systemd.activeState}/${svc.systemd.subState}. Restarts: ${svc.systemd.restarts}. Result: ${svc.systemd.result}`,
        actions: [
          { label: 'Restart', command: `systemctl --user restart ${svc.systemd.unit}` },
          { label: 'View logs', command: `journalctl --user -u ${svc.systemd.unit} -n 50` },
        ],
      });
    }
  }

  for (const svc of data.services) {
    if (svc.pidFile?.stale) {
      alerts.push({
        id: `stale-pid-${svc.name}`,
        severity: 'warn',
        title: `Stale PID file: ${svc.name || 'unnamed'}`,
        description: svc.pidFile.reason,
        actions: [{ label: 'Remove PID file', command: `rm ${svc.pidFile.path}` }],
      });
    }
  }

  for (const svc of data.services) {
    if (svc.workers) {
      for (const w of svc.workers.workers) {
        if (w.stale) {
          alerts.push({
            id: `stale-worker-${svc.name}-${w.name}`,
            severity: 'warn',
            title: `Worker "${w.name}" is dead but declared running`,
            description: `Service: ${svc.name}. PID ${w.pid} is no longer alive.`,
          });
        }
      }
    }
  }

  if (data.orphans.length > 0) {
    const pids = data.orphans.map((o) => o.pid).join(', ');
    alerts.push({
      id: `orphans-${pids}`,
      severity: 'warn',
      title: `${data.orphans.length} orphan process(es) not tracked`,
      description: `PIDs: ${pids}`,
      actions: [
        { label: 'Kill all', command: `kill ${data.orphans.map((o) => o.pid).join(' ')}` },
        {
          label: 'Investigate',
          command: `ps -p ${data.orphans.map((o) => o.pid).join(',')} -o pid,ppid,etime,cmd`,
        },
      ],
    });
  }

  const order = { critical: 0, warn: 1, info: 2 };
  alerts.sort((a, b) => order[a.severity] - order[b.severity]);

  return alerts;
}

const SEVERITY_GLYPHS: Record<string, string> = {
  critical: '\u2718',
  warn: '\u26A0',
  info: '\u2139',
};

const SEVERITY_KIND: Record<string, 'fail' | 'warn' | 'info'> = {
  critical: 'fail',
  warn: 'warn',
  info: 'info',
};

export function AlertBanner({ processHealth }: { processHealth: ProcessHealthData | null }) {
  const [dismissed, setDismissed] = useState<Set<string>>(() => {
    try {
      const stored = sessionStorage.getItem('agentflow-dismissed-alerts');
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });

  const dismiss = useCallback((id: string) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      sessionStorage.setItem('agentflow-dismissed-alerts', JSON.stringify([...next]));
      return next;
    });
  }, []);

  if (!processHealth) return null;

  const alerts = deriveAlerts(processHealth).filter((a) => !dismissed.has(a.id));
  if (alerts.length === 0) return null;

  return (
    <div className="alert-strip">
      {alerts.map((alert) => (
        <div key={alert.id} className={`alert-strip__item alert-strip__item--${alert.severity}`}>
          <span className={`dot dot--${SEVERITY_KIND[alert.severity]}`} />
          <span className="alert-strip__glyph">{SEVERITY_GLYPHS[alert.severity]}</span>
          <div className="alert-strip__content">
            <div className="alert-strip__title">{alert.title}</div>
            <div className="alert-strip__description">{alert.description}</div>
            {alert.actions && (
              <div className="alert-strip__actions">
                {alert.actions.map((action) => (
                  <button
                    type="button"
                    key={action.label}
                    className="btn btn--secondary"
                    title={`Copy: ${action.command}`}
                    onClick={() => navigator.clipboard.writeText(action.command)}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            className="alert-strip__dismiss"
            onClick={() => dismiss(alert.id)}
            title="Dismiss"
            aria-label="Dismiss alert"
          >
            {'\u00D7'}
          </button>
        </div>
      ))}
    </div>
  );
}
