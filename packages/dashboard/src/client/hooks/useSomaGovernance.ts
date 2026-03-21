import { useCallback, useEffect, useState } from 'react';

export interface GovernanceData {
  available: boolean;
  layers: { archive: number; working: number; emerging: number; canon: number };
  governance: { pending: number; promoted: number; rejected: number };
  insights: Array<{
    type: string;
    title: string;
    claim: string;
    confidence: string;
    layer?: string;
    confidence_score?: number;
    proposal_status?: string;
  }>;
  canon: Array<{
    type: string;
    title: string;
    claim: string;
    ratified_by?: string;
    ratified_at?: string;
  }>;
  generatedAt?: string;
  message?: string;
}

export function useSomaGovernance() {
  const [data, setData] = useState<GovernanceData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/soma/governance');
      if (res.ok) setData(await res.json());
    } catch {
      /* retry on next interval */
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 30_000);
    return () => clearInterval(id);
  }, [fetchData]);

  const promote = useCallback(
    async (entryId: string) => {
      try {
        const res = await fetch('/api/soma/governance/promote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entryId, reviewerId: 'dashboard-user' }),
        });
        if (res.ok) {
          await fetchData();
          return true;
        }
        const err = await res.json();
        console.error('Promote failed:', err.error);
        return false;
      } catch {
        return false;
      }
    },
    [fetchData],
  );

  const reject = useCallback(
    async (entryId: string, reason: string) => {
      try {
        const res = await fetch('/api/soma/governance/reject', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entryId, reviewerId: 'dashboard-user', reason }),
        });
        if (res.ok) {
          await fetchData();
          return true;
        }
        const err = await res.json();
        console.error('Reject failed:', err.error);
        return false;
      } catch {
        return false;
      }
    },
    [fetchData],
  );

  return { data, loading, refresh: fetchData, promote, reject };
}
