/**
 * React Hook for Organizational Data Caching
 *
 * Provides React integration for the organizational cache system,
 * including SWR-style data fetching with background updates.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CacheOptions } from '../utils/organizational-cache.js';
import { organizationalCache } from '../utils/organizational-cache.js';

interface UseOrganizationalCacheOptions extends CacheOptions {
  /** Whether to fetch on mount */
  enabled?: boolean;
  /** Whether to refetch when the window regains focus */
  refetchOnWindowFocus?: boolean;
  /** Whether to refetch when reconnecting to the internet */
  refetchOnReconnect?: boolean;
  /** Interval for background refetching (in ms) */
  refetchInterval?: number;
  /** Stale time - how long data is considered fresh (in ms) */
  staleTime?: number;
  /** Whether to return cached data while fetching fresh data */
  keepPreviousData?: boolean;
}

interface CachedDataState<T> {
  data: T | null;
  error: Error | null;
  isLoading: boolean;
  isValidating: boolean;
  isStale: boolean;
  lastUpdated: number | null;
}

interface CachedDataActions {
  refetch: () => Promise<void>;
  mutate: (data: any) => void;
  invalidate: () => void;
}

type UseOrganizationalCacheReturn<T> = CachedDataState<T> & CachedDataActions;

/**
 * Hook for cached organizational data fetching
 */
export function useOrganizationalCache<T = any>(
  key: string,
  fetcher: () => Promise<T>,
  options: UseOrganizationalCacheOptions = {},
): UseOrganizationalCacheReturn<T> {
  const {
    enabled = true,
    refetchOnWindowFocus = true,
    refetchOnReconnect = true,
    refetchInterval,
    staleTime = 30000, // 30 seconds
    keepPreviousData = true,
    ...cacheOptions
  } = options;

  const [state, setState] = useState<CachedDataState<T>>(() => {
    const cached = organizationalCache.get<T>(key);
    return {
      data: cached,
      error: null,
      isLoading: !cached && enabled,
      isValidating: false,
      isStale: false,
      lastUpdated: cached ? Date.now() : null,
    };
  });

  const fetchingRef = useRef<Promise<T> | null>(null);
  const refetchIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Check if data is stale
  const isDataStale = useCallback(() => {
    if (!state.lastUpdated) return true;
    return Date.now() - state.lastUpdated > staleTime;
  }, [state.lastUpdated, staleTime]);

  // Fetch data function
  const fetchData = useCallback(
    async (isBackground = false): Promise<T | null> => {
      if (!enabled) return null;

      // Prevent concurrent fetches
      if (fetchingRef.current && !isBackground) {
        try {
          return await fetchingRef.current;
        } catch {
          return null;
        }
      }

      // Cancel previous request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      abortControllerRef.current = new AbortController();

      const fetchPromise = (async (): Promise<T> => {
        try {
          setState((prev) => ({
            ...prev,
            isLoading: !prev.data || !keepPreviousData,
            isValidating: true,
            error: null,
          }));

          const result = await fetcher();

          // Cache the result
          organizationalCache.set(key, result, cacheOptions);

          setState((prev) => ({
            ...prev,
            data: result,
            error: null,
            isLoading: false,
            isValidating: false,
            isStale: false,
            lastUpdated: Date.now(),
          }));

          return result;
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));

          setState((prev) => ({
            ...prev,
            error: err,
            isLoading: false,
            isValidating: false,
          }));

          throw err;
        }
      })();

      fetchingRef.current = fetchPromise;

      try {
        const result = await fetchPromise;
        return result;
      } finally {
        if (fetchingRef.current === fetchPromise) {
          fetchingRef.current = null;
        }
      }
    },
    [key, fetcher, enabled, cacheOptions, keepPreviousData],
  );

  // Refetch function
  const refetch = useCallback(async (): Promise<void> => {
    await fetchData(false);
  }, [fetchData]);

  // Mutate function (optimistic updates)
  const mutate = useCallback(
    (newData: T) => {
      organizationalCache.set(key, newData, cacheOptions);
      setState((prev) => ({
        ...prev,
        data: newData,
        lastUpdated: Date.now(),
        isStale: false,
      }));
    },
    [key, cacheOptions],
  );

  // Invalidate function
  const invalidate = useCallback(() => {
    organizationalCache.delete(key);
    setState((prev) => ({
      ...prev,
      data: null,
      lastUpdated: null,
      isStale: true,
    }));
  }, [key]);

  // Background refresh
  const backgroundRefresh = useCallback(async () => {
    if (isDataStale() || state.isStale) {
      await fetchData(true);
    }
  }, [fetchData, isDataStale, state.isStale]);

  // Initial data fetch
  useEffect(() => {
    if (enabled && !state.data) {
      fetchData(false);
    }
  }, [enabled, state.data, fetchData]);

  // Setup refetch interval
  useEffect(() => {
    if (refetchInterval && refetchInterval > 0) {
      refetchIntervalRef.current = setInterval(() => {
        backgroundRefresh();
      }, refetchInterval);

      return () => {
        if (refetchIntervalRef.current) {
          clearInterval(refetchIntervalRef.current);
        }
      };
    }
  }, [refetchInterval, backgroundRefresh]);

  // Window focus refetch
  useEffect(() => {
    if (refetchOnWindowFocus) {
      const handleFocus = () => {
        if (document.visibilityState === 'visible') {
          backgroundRefresh();
        }
      };

      document.addEventListener('visibilitychange', handleFocus);
      window.addEventListener('focus', handleFocus);

      return () => {
        document.removeEventListener('visibilitychange', handleFocus);
        window.removeEventListener('focus', handleFocus);
      };
    }
  }, [refetchOnWindowFocus, backgroundRefresh]);

  // Reconnect refetch
  useEffect(() => {
    if (refetchOnReconnect) {
      const handleOnline = () => {
        backgroundRefresh();
      };

      window.addEventListener('online', handleOnline);

      return () => {
        window.removeEventListener('online', handleOnline);
      };
    }
  }, [refetchOnReconnect, backgroundRefresh]);

  // Update stale state
  useEffect(() => {
    const checkStale = () => {
      const stale = isDataStale();
      if (stale !== state.isStale) {
        setState((prev) => ({
          ...prev,
          isStale: stale,
        }));
      }
    };

    const interval = setInterval(checkStale, 5000); // Check every 5 seconds
    return () => clearInterval(interval);
  }, [isDataStale, state.isStale]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (refetchIntervalRef.current) {
        clearInterval(refetchIntervalRef.current);
      }
    };
  }, []);

  return {
    ...state,
    refetch,
    mutate,
    invalidate,
  };
}

/**
 * Specialized hooks for common organizational data patterns
 */

export function useTeamData(teamId?: string, options?: UseOrganizationalCacheOptions) {
  const key = teamId ? `team:${teamId}` : 'teams:list';
  const fetcher = useCallback(() => {
    const url = teamId ? `/api/teams/${teamId}` : '/api/teams';
    return fetch(url).then((r) => {
      if (!r.ok) throw new Error(`Failed to fetch team data: ${r.statusText}`);
      return r.json();
    });
  }, [teamId]);

  return useOrganizationalCache(key, fetcher, {
    ttl: 10 * 60 * 1000, // 10 minutes
    priority: 'high',
    ...options,
  });
}

export function useOperatorData(operatorId?: string, options?: UseOrganizationalCacheOptions) {
  const key = operatorId ? `operator:${operatorId}` : 'operators:list';
  const fetcher = useCallback(() => {
    const url = operatorId ? `/api/operators/${operatorId}` : '/api/operators';
    return fetch(url).then((r) => {
      if (!r.ok) throw new Error(`Failed to fetch operator data: ${r.statusText}`);
      return r.json();
    });
  }, [operatorId]);

  return useOrganizationalCache(key, fetcher, {
    ttl: 5 * 60 * 1000, // 5 minutes
    priority: 'normal',
    ...options,
  });
}

export function usePerformanceData(
  type: string = 'overview',
  options?: UseOrganizationalCacheOptions,
) {
  const key = `performance:${type}`;
  const fetcher = useCallback(() => {
    return fetch(`/api/performance/${type}`).then((r) => {
      if (!r.ok) throw new Error(`Failed to fetch performance data: ${r.statusText}`);
      return r.json();
    });
  }, [type]);

  return useOrganizationalCache(key, fetcher, {
    ttl: 1 * 60 * 1000, // 1 minute
    priority: 'normal',
    refetchInterval: 30000, // Refresh every 30 seconds
    ...options,
  });
}

export function useActivityData(
  type: string = 'overview',
  options?: UseOrganizationalCacheOptions,
) {
  const key = `activity:${type}`;
  const fetcher = useCallback(() => {
    return fetch(`/api/activity/${type}`).then((r) => {
      if (!r.ok) throw new Error(`Failed to fetch activity data: ${r.statusText}`);
      return r.json();
    });
  }, [type]);

  return useOrganizationalCache(key, fetcher, {
    ttl: 2 * 60 * 1000, // 2 minutes
    priority: 'normal',
    ...options,
  });
}

export function usePolicyData(options?: UseOrganizationalCacheOptions) {
  const key = 'policy:status';
  const fetcher = useCallback(() => {
    return fetch('/api/policy/status').then((r) => {
      if (!r.ok) throw new Error(`Failed to fetch policy data: ${r.statusText}`);
      return r.json();
    });
  }, []);

  return useOrganizationalCache(key, fetcher, {
    ttl: 15 * 60 * 1000, // 15 minutes
    priority: 'normal',
    ...options,
  });
}

export function useSessionData(sessionId?: string, options?: UseOrganizationalCacheOptions) {
  const key = sessionId ? `session:${sessionId}` : 'sessions:recent';
  const fetcher = useCallback(() => {
    const url = sessionId ? `/api/sessions/${sessionId}` : '/api/sessions?recent=true';
    return fetch(url).then((r) => {
      if (!r.ok) throw new Error(`Failed to fetch session data: ${r.statusText}`);
      return r.json();
    });
  }, [sessionId]);

  return useOrganizationalCache(key, fetcher, {
    ttl: 3 * 60 * 1000, // 3 minutes
    priority: 'normal',
    ...options,
  });
}
