import { useCallback, useEffect, useState } from 'react';

export interface CronJob {
  jobId: string;
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  successRate: number;
  avgDurationMs: number;
  totalTokens: number;
  lastRunAt: string | null;
  lastStatus: 'ok' | 'error';
  lastError: string | null;
  durationAnomaly: boolean;
}

export interface CronHealthResponse {
  totalJobs: number;
  totalRuns: number;
  overallSuccessRate: number;
  totalTokens: number;
  jobs: CronJob[];
  timestamp: string;
}

const POLL = 30_000;

export function useCronHealth(): CronHealthResponse | null {
  const [data, setData] = useState<CronHealthResponse | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/cron');
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
