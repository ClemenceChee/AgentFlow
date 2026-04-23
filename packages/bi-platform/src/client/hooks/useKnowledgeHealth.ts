import { useCallback, useEffect, useState } from 'react';

export interface KnowledgeHealthResponse {
  layers: Array<{ name: string; count: number }>;
  totalEntities: number;
  canonToArchiveRatio: number;
  synthesisRate: number;
  zerInsightWarning: boolean;
  governance: { pending: number; promoted: number; rejected: number };
  policyCount: number;
  policiesPerAgent: number;
  totalInsights: number;
  totalExecutions: number;
  timestamp: string;
}

const POLL = 30_000;

export function useKnowledgeHealth(): KnowledgeHealthResponse | null {
  const [data, setData] = useState<KnowledgeHealthResponse | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/knowledge-health');
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
