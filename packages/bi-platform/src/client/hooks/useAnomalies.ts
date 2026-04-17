import { useState, useEffect, useCallback } from 'react';

export interface Anomaly {
  id: string;
  source_system: string;
  metric_name: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  baseline_value: number;
  observed_value: number;
  deviation_pct: number;
  business_impact?: {
    description: string;
    estimatedSeverity: string;
    affectedAgents?: string[];
  };
  acknowledged: boolean;
  detected_at: string;
  resolved_at: string | null;
}

export interface AnomaliesResponse {
  anomalies: Anomaly[];
  count: number;
  timestamp: string;
}

const POLL = 15_000;

export function useAnomalies(): AnomaliesResponse | null {
  const [data, setData] = useState<AnomaliesResponse | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/anomalies');
      if (res.ok) setData(await res.json());
    } catch { /* retry */ }
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, POLL);
    return () => clearInterval(id);
  }, [fetchData]);

  return data;
}
