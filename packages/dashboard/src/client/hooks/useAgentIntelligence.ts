import { useCallback, useEffect, useRef, useState } from 'react';

export interface IntelligenceEntity {
  type: string;
  id: string;
  name: string;
  claim?: string;
  confidence?: string;
  evidence?: string[];
  sourceIds?: string[];
}

export interface GroupedIntelligence {
  decisions: IntelligenceEntity[];
  insights: IntelligenceEntity[];
  constraints: IntelligenceEntity[];
  policies: IntelligenceEntity[];
  contradictions: IntelligenceEntity[];
}

const EMPTY: GroupedIntelligence = {
  decisions: [],
  insights: [],
  constraints: [],
  policies: [],
  contradictions: [],
};
const INTEL_TYPES = new Set(['decision', 'insight', 'constraint', 'policy', 'contradiction']);

export function useAgentIntelligence(agentId: string | null) {
  const [data, setData] = useState<GroupedIntelligence>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cache = useRef<Record<string, GroupedIntelligence>>({});

  const fetch_ = useCallback(async () => {
    if (!agentId) {
      setData(EMPTY);
      return;
    }
    if (cache.current[agentId]) {
      setData(cache.current[agentId]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/soma/vault/entities?q=${encodeURIComponent(agentId)}&limit=200`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = await res.json();
      const entities: IntelligenceEntity[] = (raw.entities ?? [])
        .filter((e: Record<string, unknown>) => {
          if (!INTEL_TYPES.has(e.type as string)) return false;
          // Exact sourceIds match (server does text search, we verify)
          const sids = (e.sourceIds ?? e.source_ids ?? []) as string[];
          return sids.some(
            (id: string) => id === agentId || id === agentId.replace('openclaw:', ''),
          );
        })
        .map((e: Record<string, unknown>) => ({
          type: e.type as string,
          id: e.id as string,
          name: (e.name ?? e.title ?? '') as string,
          claim: e.claim as string | undefined,
          confidence: e.confidence as string | undefined,
          evidence: e.evidence as string[] | undefined,
          sourceIds: (e.sourceIds ?? e.source_ids) as string[] | undefined,
        }));

      const grouped: GroupedIntelligence = {
        decisions: entities.filter((e) => e.type === 'decision'),
        insights: entities.filter((e) => e.type === 'insight'),
        constraints: entities.filter((e) => e.type === 'constraint'),
        policies: entities.filter((e) => e.type === 'policy'),
        contradictions: entities.filter((e) => e.type === 'contradiction'),
      };
      cache.current[agentId] = grouped;
      setData(grouped);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    fetch_();
  }, [fetch_]);

  return { data, loading, error };
}
