import { useState, useEffect, useCallback } from 'react';

export interface RoiBreakdown {
  category: string;
  amount: number;
  currency: string;
}

export interface RoiResponse {
  roi: number;
  totalCost: number;
  totalRevenue: number;
  totalSavings: number;
  netBenefit: number;
  currency: string;
  period: string;
  breakdown: RoiBreakdown[];
  timestamp: string;
}

const POLL = 30_000;

export function useRoi(period = '30d'): RoiResponse | null {
  const [data, setData] = useState<RoiResponse | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/analytics/roi?period=${period}`);
      if (res.ok) setData(await res.json());
    } catch { /* retry */ }
  }, [period]);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, POLL);
    return () => clearInterval(id);
  }, [fetchData]);

  return data;
}
