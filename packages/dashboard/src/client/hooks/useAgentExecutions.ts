import { useCallback, useEffect, useRef, useState } from 'react';

export interface AgentExecution {
  id: string;
  name: string;
  agentId: string;
  status: string;
  duration: number;
  startTime: number;
  body?: string;
}

export function useAgentExecutions(agentId: string | null, limit = 5) {
  const [data, setData] = useState<AgentExecution[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cache = useRef<Record<string, AgentExecution[]>>({});

  const fetch_ = useCallback(async () => {
    if (!agentId) {
      setData([]);
      return;
    }
    if (cache.current[agentId]) {
      setData(cache.current[agentId]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      // Use timeline endpoint for agent-specific executions
      const res = await fetch(`/api/agents/${encodeURIComponent(agentId)}/timeline?limit=${limit}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = await res.json();
      const items = (raw.timeline ?? raw.executions ?? raw.data ?? raw) as Record<
        string,
        unknown
      >[];
      const executions: AgentExecution[] = (Array.isArray(items) ? items : [])
        .slice(0, limit)
        .map((e) => ({
          id: (e.id ?? e.filename ?? '') as string,
          name: (e.name ?? '') as string,
          agentId: (e.agentId ?? agentId) as string,
          status: (e.status ?? 'unknown') as string,
          duration: (e.duration ??
            (e.endTime && e.startTime
              ? (e.endTime as number) - (e.startTime as number)
              : 0)) as number,
          startTime: (e.startTime ?? 0) as number,
          body: (e.body ?? '') as string,
        }));
      cache.current[agentId] = executions;
      setData(executions);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [agentId, limit]);

  useEffect(() => {
    fetch_();
  }, [fetch_]);

  return { data, loading, error };
}
