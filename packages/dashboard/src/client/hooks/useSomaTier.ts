import { useCallback, useEffect, useState } from 'react';

export interface SomaTier {
  tier: 'teaser' | 'free' | 'pro';
  somaVault: boolean;
  governanceAvailable: boolean;
}

export function useSomaTier(): SomaTier {
  const [tier, setTier] = useState<SomaTier>({ tier: 'teaser', somaVault: false, governanceAvailable: false });

  const fetchTier = useCallback(async () => {
    try {
      const res = await fetch('/api/soma/tier');
      if (res.ok) setTier(await res.json());
    } catch { /* default to teaser */ }
  }, []);

  useEffect(() => {
    fetchTier();
  }, [fetchTier]);

  return tier;
}
