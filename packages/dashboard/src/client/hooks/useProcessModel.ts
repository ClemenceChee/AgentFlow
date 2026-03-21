import { useCallback, useEffect, useState } from 'react';

export interface ProcessVariant {
  pathSignature: string;
  count: number;
  percentage: number;
}

export interface Bottleneck {
  nodeName: string;
  nodeType: string;
  p95: number;
}

export interface ProcessModelData {
  model: {
    transitions: { from: string; to: string; count: number }[];
    nodeTypes: Record<string, string>;
  };
  variants: ProcessVariant[];
  bottlenecks: Bottleneck[];
}

export function useProcessModel(agentId: string | null): {
  data: ProcessModelData | null;
  loading: boolean;
} {
  const [data, setData] = useState<ProcessModelData | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastAgent, setLastAgent] = useState<string | null>(null);

  const fetchModel = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/process-model/${encodeURIComponent(id)}`);
      if (res.ok) setData(await res.json());
      else setData(null);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!agentId) {
      setData(null);
      return;
    }
    if (agentId !== lastAgent) {
      setLastAgent(agentId);
      fetchModel(agentId);
    }
  }, [agentId, lastAgent, fetchModel]);

  return { data, loading };
}
