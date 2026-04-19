// packages/dashboard/src/client/hooks/useGuards.ts
//
// Fetches runtime guard definitions + recent fires. Mirrors the shape of
// other hooks in this folder (useAgents, useTraces, useSomaGovernance).
//
// Expected API: GET /api/guards → { guards: GuardDef[], fires: GuardFire[], stats: GuardStats }
// If the endpoint is unavailable, the hook returns `null` data so callers can
// render an empty-state — matches useSomaReport / useSomaTier behaviour.

import { useCallback, useEffect, useState } from 'react';

export type GuardMode = 'WARN' | 'BLOCK' | 'ABORT';
export type GuardStatus = 'ok' | 'warn' | 'fail';

export interface GuardDef {
  name: string;
  mode: GuardMode;
  threshold: string;
  fires24h: number;
  violations24h: number;
  adaptive: boolean;
  status: GuardStatus;
  description?: string;
}

export interface GuardFire {
  id: string;
  guardName: string;
  agentId: string;
  severity: 'info' | 'warn' | 'fail';
  note: string;
  firedAt: string; // ISO
}

export interface GuardStats {
  active: number;
  total: number;
  fires24h: number;
  violations24h: number;
  blocks24h: number;
  aborts24h: number;
  avgOverheadMs: number;
  deltaViolations: number;
}

export interface GuardsData {
  guards: GuardDef[];
  fires: GuardFire[];
  stats: GuardStats;
}

export function useGuards() {
  const [data, setData] = useState<GuardsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchGuards = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/guards');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'unknown');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGuards();
  }, [fetchGuards]);

  return { data, loading, error, refetch: fetchGuards };
}
