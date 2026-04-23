import { useCallback, useEffect, useState } from 'react';

export interface TokenEconomicsResponse {
  totalSpend: number;
  totalTokens: number;
  sessionSpend: number;
  cronSpend: number;
  perAgent: Array<{ agentId: string; cost: number; tokens: number; costPerSuccess: number }>;
  perModel: Array<{ model: string; cost: number; tokens: number; costPerToken: number }>;
  wastedSpend: number;
  wastedPct: number;
  wastedWarning: boolean;
  timestamp: string;
}

const POLL = 30_000;

export function useTokenEconomics(): TokenEconomicsResponse | null {
  const [data, setData] = useState<TokenEconomicsResponse | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/token-economics');
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
