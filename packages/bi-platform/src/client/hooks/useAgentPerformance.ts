import { useCallback, useState } from 'react';

export interface AgentPerformanceHistory {
  date: string;
  executions: number;
  successful: number;
  avgDurationMs: number;
  errorRate: number;
}

export interface AgentPerformanceResponse {
  agentId: string;
  agentName: string;
  current: {
    totalExecutions: number;
    successRate: number;
    failureRate: number;
    avgResponseTimeMs: number;
    costPerExecution?: number;
    tokenUsage?: number;
  };
  compliance: {
    drifted: boolean;
    driftScore: number;
    alerts: string[];
  };
  history: AgentPerformanceHistory[];
  timestamp: string;
}

export function useAgentPerformance() {
  const [data, setData] = useState<AgentPerformanceResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchAgent = useCallback(async (agentId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/agents/${encodeURIComponent(agentId)}/performance`);
      if (res.ok) setData(await res.json());
    } catch {
      /* ignore */
    }
    setLoading(false);
  }, []);

  const clear = useCallback(() => setData(null), []);

  return { data, loading, fetchAgent, clear };
}
