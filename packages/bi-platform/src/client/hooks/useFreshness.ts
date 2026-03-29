import { useState, useEffect, useCallback } from 'react';

export interface FreshnessSource {
  source: string;
  lastSync: string | null;
  ageSeconds: number;
  status: 'fresh' | 'acceptable' | 'stale' | 'critical';
  threshold: number;
}

export interface FreshnessResponse {
  sources: FreshnessSource[];
  timestamp: string;
}

const POLL = 10_000;

export function useFreshness(): FreshnessResponse | null {
  const [data, setData] = useState<FreshnessResponse | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/system/freshness');
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
