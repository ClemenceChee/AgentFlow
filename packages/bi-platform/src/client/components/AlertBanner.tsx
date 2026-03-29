import React, { useState } from 'react';
import type { Anomaly } from '../hooks/useAnomalies';

interface Props {
  anomalies: Anomaly[];
}

export function AlertBanner({ anomalies }: Props) {
  const [dismissed, setDismissed] = useState<Set<string>>(() => {
    try {
      const stored = sessionStorage.getItem('bi-dismissed-alerts');
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });

  const visible = anomalies.filter((a) => !dismissed.has(a.id));
  if (visible.length === 0) return null;

  const dismiss = (id: string) => {
    const next = new Set(dismissed);
    next.add(id);
    setDismissed(next);
    sessionStorage.setItem('bi-dismissed-alerts', JSON.stringify([...next]));
  };

  return (
    <div className="bi-alerts">
      {visible.slice(0, 5).map((a) => (
        <div key={a.id} className="bi-alert">
          <span className={`bi-alert__sev bi-alert__sev--${a.severity}`}>{a.severity}</span>
          <span>{a.description}</span>
          <button className="bi-alert__dismiss" onClick={() => dismiss(a.id)} title="Dismiss">
            &times;
          </button>
        </div>
      ))}
    </div>
  );
}
