import { useCallback, useEffect, useState } from 'react';

export interface PreflightWarning {
  rule: string;
  threshold?: number;
  actual?: number;
  message: string;
  source: string;
  sourceAgents?: string[];
}

export interface PreflightRecommendation {
  insight: string;
  sourceAgents: string[];
  confidence: number;
}

export interface PreflightResponse {
  proceed: boolean;
  warnings: PreflightWarning[];
  recommendations: PreflightRecommendation[];
  available: boolean;
  _meta: { durationMs: number };
}

export function useAicpPreflight(agentId: string | null) {
  const [data, setData] = useState<PreflightResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPreflight = useCallback(async () => {
    if (!agentId) {
      setData(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/aicp/preflight?agentId=${encodeURIComponent(agentId)}`);
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
    fetchPreflight();
  }, [fetchPreflight]);

  return { data, loading, error, refetch: fetchPreflight };
}
