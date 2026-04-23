import { useCallback, useEffect, useState } from 'react';

export interface BusinessPattern {
  id: string;
  type:
    | 'performance_cluster'
    | 'cost_trend'
    | 'failure_cascade'
    | 'efficiency_gap'
    | 'compliance_drift';
  title: string;
  description: string;
  affectedAgents: string[];
  businessImpact: {
    severity: 'critical' | 'high' | 'medium' | 'low';
    estimatedCostImpact: number;
    affectedOperations: string[];
    riskCategory: string;
  };
  confidence: number;
  detectedAt: string;
}

export interface PatternsResponse {
  patterns: BusinessPattern[];
  timestamp: string;
}

const POLL = 30_000;

export function useDecisionPatterns(): PatternsResponse | null {
  const [data, setData] = useState<PatternsResponse | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/decisions/patterns');
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
