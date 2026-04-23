import { useCallback, useEffect, useState } from 'react';

export interface CriticalAlert {
  id: string;
  type:
    | 'system_failure'
    | 'compliance_breach'
    | 'cost_spike'
    | 'performance_degradation'
    | 'pattern_detected';
  severity: 'critical' | 'high';
  title: string;
  description: string;
  affectedSystems: string[];
  suggestedAction: string;
  createdAt: string;
  acknowledged: boolean;
}

export interface DecisionAlertsResponse {
  alerts: CriticalAlert[];
  timestamp: string;
}

const POLL = 15_000;

export function useDecisionAlerts(): DecisionAlertsResponse | null {
  const [data, setData] = useState<DecisionAlertsResponse | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/decisions/alerts');
      if (res.ok) setData(await res.json());
    } catch {
      /* retry */
    }
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, POLL);
    return () => clearInterval(id);
  }, [fetchData]);

  return data;
}
