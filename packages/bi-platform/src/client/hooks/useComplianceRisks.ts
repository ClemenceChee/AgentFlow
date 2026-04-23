import { useCallback, useEffect, useState } from 'react';

export interface ComplianceRisk {
  id: string;
  riskLevel: 'critical' | 'high' | 'medium' | 'low';
  regulation: string;
  description: string;
  affectedAgents: string[];
  currentScore: number;
  trendDirection: 'improving' | 'degrading' | 'stable';
  requiredActions: string[];
}

export interface ComplianceRisksResponse {
  risks: ComplianceRisk[];
  timestamp: string;
}

const POLL = 30_000;

export function useComplianceRisks(): ComplianceRisksResponse | null {
  const [data, setData] = useState<ComplianceRisksResponse | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/decisions/compliance-risks');
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
