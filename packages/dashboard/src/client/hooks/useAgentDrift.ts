import { useCallback, useEffect, useState } from 'react';

export interface DriftData {
  drift: {
    status: string;
    slope: number;
    r2: number;
    windowSize: number;
    dataPoints: number;
  };
  points: { agentId: string; timestamp: number; score: number; runId: string }[];
}

export function useAgentDrift(agentId: string | null) {
  const [data, setData] = useState<DriftData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDrift = useCallback(async () => {
    if (!agentId) {
      setData(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/soma/drift?agentId=${encodeURIComponent(agentId)}`);
      if (res.ok) {
        setData(await res.json());
      } else {
        setError(`Failed: ${res.status}`);
      }
    } catch (err) {
      setError((err as Error).message);
    }
    setLoading(false);
  }, [agentId]);

  useEffect(() => {
    fetchDrift();
  }, [fetchDrift]);

  return { data, loading, error };
}
