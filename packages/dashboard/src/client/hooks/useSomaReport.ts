import { useCallback, useEffect, useState } from 'react';

export interface SomaReport {
  available: boolean;
  teaser?: boolean;
  message?: string;
  generatedAt?: string;
  agents?: Array<{
    name: string;
    totalRuns: number;
    failures: number;
    failureRate: number;
    status: 'healthy' | 'warning' | 'critical';
  }>;
  insights?: Array<{
    type: string;
    title: string;
    claim: string;
    confidence: string;
  }>;
  policies?: Array<{
    name: string;
    enforcement: string;
    scope: string;
    conditions: string;
  }>;
  guardRecommendations?: Array<{
    agent: string;
    action: 'allow' | 'block';
    reason: string;
  }>;
  totals?: {
    agents: number;
    executions: number;
    insights: number;
    policies: number;
    archetypes: number;
  };
}

const POLL_INTERVAL = 30_000;

export function useSomaReport(): { report: SomaReport | null; loading: boolean } {
  const [report, setReport] = useState<SomaReport | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchReport = useCallback(async () => {
    try {
      const res = await fetch('/api/soma/report');
      if (res.ok) {
        setReport(await res.json());
      }
    } catch { /* retry on next interval */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchReport();
    const id = setInterval(fetchReport, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [fetchReport]);

  return { report, loading };
}
