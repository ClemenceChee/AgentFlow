import { useState, useEffect, useCallback } from 'react';

export interface AgentSummary {
  agentId: string;
  agentName: string;
  status: 'healthy' | 'warning' | 'critical';
  totalExecutions: number;
  successRate: number;
  avgResponseTimeMs: number;
}

export interface AgentsResponse {
  agents: AgentSummary[];
  totalAgents: number;
  timestamp: string;
}

const POLL = 15_000;

export function useAgents(): AgentsResponse | null {
  const [data, setData] = useState<AgentsResponse | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/agents');
      if (res.ok) setData(await res.json());
    } catch { /* retry */ }
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, POLL);
    return () => clearInterval(id);
  }, [fetchData]);

  return data;
}
