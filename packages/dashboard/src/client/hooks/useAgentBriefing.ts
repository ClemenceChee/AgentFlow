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
        const raw = await res.json();
        // Normalize intelligence: API may return { total, byType } object or flat array
        let intel: { type: string; name: string; claim: string }[] = [];
        if (Array.isArray(raw.intelligence)) {
          intel = raw.intelligence;
        } else if (raw.intelligence?.byType) {
          for (const [type, items] of Object.entries(raw.intelligence.byType)) {
            for (const item of items as { name: string; claim: string }[]) {
              intel.push({ type, name: item.name, claim: item.claim ?? '' });
            }
          }
        }
        // Normalize peers: API may return { name, successRate, runs } or { name, failureRate, totalExecutions }
        const peers = (raw.peers ?? []).map((p: Record<string, unknown>) => ({
          name: p.name as string,
          failureRate: (p.failureRate as number) ?? (1 - ((p.successRate as number) ?? 1)),
          totalExecutions: (p.totalExecutions as number) ?? (p.runs as number) ?? 0,
          successRate: (p.successRate as number) ?? (1 - ((p.failureRate as number) ?? 0)),
        }));
        setData({ ...raw, intelligence: intel, peers });
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
