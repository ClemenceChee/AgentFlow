import { useCallback, useEffect, useState } from 'react';

export interface AgentBriefing {
  agentId: string;
  status: string;
  failureRate: number;
  failureCount: number;
  totalExecutions: number;
  intelligence: { type: string; name: string; claim: string }[];
  peers: { name: string; failureRate: number; totalExecutions: number; successRate?: number }[];
}

export function useAgentBriefing(agentId: string | null) {
  const [data, setData] = useState<AgentBriefing | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBriefing = useCallback(async () => {
    if (!agentId) {
      setData(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/agents/${encodeURIComponent(agentId)}/health-briefing`);
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
    fetchBriefing();
  }, [fetchBriefing]);

  return { data, loading, error };
}
