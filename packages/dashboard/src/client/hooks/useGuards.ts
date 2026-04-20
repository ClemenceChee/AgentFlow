import { useCallback, useEffect, useState } from 'react';

export interface GuardDef {
  name: string;
  mode: 'WARN' | 'BLOCK' | 'ABORT';
  threshold: string;
  fires24h: number;
  violations24h: number;
  adaptive: boolean;
  status: 'ok' | 'warn' | 'fail';
}

export interface GuardFire {
  guardName: string;
  severity: 'info' | 'warn' | 'fail';
  agentId: string;
  note: string;
  firedAt: number;
}

export interface GuardStats {
  active: number;
  total: number;
  fires24h: number;
  violations24h: number;
  blocks24h: number;
  aborts24h: number;
  avgOverheadMs: number;
}

export interface GuardsData {
  guards: GuardDef[];
  fires: GuardFire[];
  stats: GuardStats;
  source: 'api' | 'fallback';
}

const FALLBACK: GuardsData = {
  guards: [
    {
      name: 'timeout',
      mode: 'WARN',
      threshold: 'p95 \u00D7 1.5',
      fires24h: 0,
      violations24h: 0,
      adaptive: true,
      status: 'ok',
    },
    {
      name: 'reasoning_loop',
      mode: 'BLOCK',
      threshold: '\u2265 5 same-type',
      fires24h: 0,
      violations24h: 0,
      adaptive: false,
      status: 'ok',
    },
    {
      name: 'spawn_explosion',
      mode: 'ABORT',
      threshold: 'depth > 12',
      fires24h: 0,
      violations24h: 0,
      adaptive: true,
      status: 'ok',
    },
    {
      name: 'high_failure_rate',
      mode: 'WARN',
      threshold: 'fail > 0.30',
      fires24h: 0,
      violations24h: 0,
      adaptive: true,
      status: 'ok',
    },
    {
      name: 'conformance_drift',
      mode: 'WARN',
      threshold: '< 0.70 match',
      fires24h: 0,
      violations24h: 0,
      adaptive: true,
      status: 'ok',
    },
    {
      name: 'known_bottleneck',
      mode: 'WARN',
      threshold: 'p95 \u00D7 2.0',
      fires24h: 0,
      violations24h: 0,
      adaptive: true,
      status: 'ok',
    },
    {
      name: 'block_external',
      mode: 'BLOCK',
      threshold: 'host \u2209 allowlist',
      fires24h: 0,
      violations24h: 0,
      adaptive: false,
      status: 'ok',
    },
    {
      name: 'pii_leak',
      mode: 'ABORT',
      threshold: 'regex + classifier',
      fires24h: 0,
      violations24h: 0,
      adaptive: false,
      status: 'ok',
    },
  ],
  fires: [],
  stats: {
    active: 8,
    total: 8,
    fires24h: 0,
    violations24h: 0,
    blocks24h: 0,
    aborts24h: 0,
    avgOverheadMs: 0,
  },
  source: 'fallback',
};

export function useGuards(): {
  data: GuardsData;
  loading: boolean;
  error: string | null;
} {
  const [data, setData] = useState<GuardsData>(FALLBACK);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchGuards = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/guards');
      if (res.ok) {
        const json = (await res.json()) as Partial<GuardsData>;
        setData({
          guards: json.guards ?? FALLBACK.guards,
          fires: json.fires ?? [],
          stats: json.stats ?? FALLBACK.stats,
          source: 'api',
        });
        setError(null);
      } else if (res.status === 404) {
        // Endpoint not wired — use fallback silently
        setData(FALLBACK);
      } else {
        setError(`Guards API failed: ${res.status}`);
      }
    } catch (e) {
      // Network error — keep fallback
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGuards();
  }, [fetchGuards]);

  return { data, loading, error };
}
