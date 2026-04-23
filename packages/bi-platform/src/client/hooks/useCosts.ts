import { useCallback, useEffect, useState } from 'react';

export interface AgentCost {
  agentId: string;
  totalCost: number;
  currency: string;
}

export interface CostsResponse {
  costs: AgentCost[];
  period: string;
  timestamp: string;
}

const POLL = 30_000;

export function useCosts(period = '30d'): CostsResponse | null {
  const [data, setData] = useState<CostsResponse | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/analytics/costs?period=${period}`);
      if (res.ok) setData(await res.json());
    } catch {
      /* retry */
    }
  }, [period]);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, POLL);
    return () => clearInterval(id);
  }, [fetchData]);

  return data;
}
