import { useCallback, useEffect, useState } from 'react';

export interface DelegationRoiResponse {
  analysis: {
    period: string;
    totalDelegations: number;
    successfulDelegations: number;
    delegationSuccessRate: number;
    costPerDelegation: number;
    estimatedTimeSavedHours: number;
    roiMultiplier: number;
    topPerformingAgents: Array<{
      agentId: string;
      agentName: string;
      delegations: number;
      successRate: number;
      costEfficiency: number;
    }>;
    recommendations: string[];
  };
  timestamp: string;
}

const POLL = 30_000;

export function useDecisionRoi(): DelegationRoiResponse | null {
  const [data, setData] = useState<DelegationRoiResponse | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/decisions/roi-analysis');
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
