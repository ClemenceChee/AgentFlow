import { useState, useEffect, useCallback } from 'react';

export interface BusinessMetric {
  name: string;
  value: number;
  unit: string;
  trend: 'up' | 'down' | 'stable';
  trendPct: number;
  period: string;
  calculatedAt: string;
}

export interface KpisResponse {
  kpis: BusinessMetric[];
  timestamp: string;
}

const POLL = 15_000;

export function useKpis(): KpisResponse | null {
  const [data, setData] = useState<KpisResponse | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/kpis');
      if (res.ok) setData(await res.json());
    } catch { /* retry next interval */ }
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, POLL);
    return () => clearInterval(id);
  }, [fetchData]);

  return data;
}
