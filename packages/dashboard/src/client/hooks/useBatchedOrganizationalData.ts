/**
 * React Hook for Batched Organizational Data
 *
 * Combines request batching with caching for optimal performance
 * when loading organizational data across multiple components.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { organizationalAPI } from '../utils/request-batcher.js';
import { organizationalCache } from '../utils/organizational-cache.js';
import type { CacheOptions } from '../utils/organizational-cache.js';

interface BatchedDataOptions extends CacheOptions {
  /** Whether to enable request batching */
  enableBatching?: boolean;
  /** Request priority for batching */
  priority?: 'low' | 'normal' | 'high';
  /** Whether to use cached data while fetching fresh data */
  staleWhileRevalidate?: boolean;
  /** How long to consider data fresh (in ms) */
  staleTime?: number;
}

interface BatchedDataState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  stale: boolean;
}

interface BatchedDataActions<T> {
  refetch: () => Promise<void>;
  invalidate: () => void;
  mutate: (data: T) => void;
}

type BatchedDataResult<T> = BatchedDataState<T> & BatchedDataActions<T>;

/**
 * Hook for loading organizational data with batching and caching
 */
export function useBatchedOrganizationalData<T = any>(
  key: string,
  fetcher: () => Promise<T>,
  options: BatchedDataOptions = {}
): BatchedDataResult<T> {
  const {
    enableBatching = true,
    priority = 'normal',
    staleWhileRevalidate = true,
    staleTime = 30000, // 30 seconds
    ...cacheOptions
  } = options;

  const [state, setState] = useState<BatchedDataState<T>>(() => {
    const cached = organizationalCache.get<T>(key);
    return {
      data: cached,
      loading: !cached,
      error: null,
      stale: false
    };
  });

  const fetchingRef = useRef<Promise<T> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Check if data is stale
  const isStale = useCallback(() => {
    const metadata = organizationalCache.getMetadata(key);
    if (!metadata) return true;

    return Date.now() - metadata.timestamp > staleTime;
  }, [key, staleTime]);

  // Fetch data with batching
  const fetchData = useCallback(async (background = false): Promise<T | null> => {
    // Check cache first for immediate response
    const cached = organizationalCache.get<T>(key);
    if (cached && staleWhileRevalidate && !background) {
      setState(prev => ({ ...prev, data: cached, loading: false }));

      // If data is not stale, return cached data
      if (!isStale()) {
        return cached;
      }
    }

    // Prevent concurrent fetches
    if (fetchingRef.current && !background) {
      return fetchingRef.current;
    }

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();

    const fetchPromise = (async (): Promise<T> => {
      setState(prev => ({
        ...prev,
        loading: !prev.data || !staleWhileRevalidate,
        error: null
      }));

      try {
        const result = await fetcher();

        // Cache the result
        organizationalCache.set(key, result, {
          ...cacheOptions,
          priority
        });

        setState(prev => ({
          ...prev,
          data: result,
          loading: false,
          error: null,
          stale: false
        }));

        return result;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));

        setState(prev => ({
          ...prev,
          loading: false,
          error: err
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
  }, [key, fetcher, cacheOptions, priority, staleWhileRevalidate, isStale]);

  // Refetch data
  const refetch = useCallback(async (): Promise<void> => {
    await fetchData(false);
  }, [fetchData]);

  // Invalidate cached data
  const invalidate = useCallback(() => {
    organizationalCache.delete(key);
    setState(prev => ({
      ...prev,
      data: null,
      stale: true
    }));
  }, [key]);

  // Optimistically update data
  const mutate = useCallback((data: T) => {
    organizationalCache.set(key, data, cacheOptions);
    setState(prev => ({
      ...prev,
      data,
      stale: false
    }));
  }, [key, cacheOptions]);

  // Initial fetch
  useEffect(() => {
    fetchData(false);
  }, [fetchData]);

  // Check for stale data periodically
  useEffect(() => {
    const checkStale = () => {
      if (state.data && isStale()) {
        setState(prev => ({ ...prev, stale: true }));

        // Fetch fresh data in background if stale-while-revalidate is enabled
        if (staleWhileRevalidate) {
          fetchData(true);
        }
      }
    };

    const interval = setInterval(checkStale, 10000); // Check every 10 seconds
    return () => clearInterval(interval);
  }, [state.data, isStale, staleWhileRevalidate, fetchData]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return useMemo(() => ({
    ...state,
    refetch,
    invalidate,
    mutate
  }), [state, refetch, invalidate, mutate]);
}

/**
 * Specialized hooks for common organizational data patterns with batching
 */

export function useBatchedTeamData(teamId?: string, options?: BatchedDataOptions) {
  const fetcher = useCallback(async () => {
    if (teamId) {
      return organizationalAPI.getTeam(teamId, { priority: options?.priority });
    } else {
      return organizationalAPI.getTeams(undefined, { priority: options?.priority });
    }
  }, [teamId, options?.priority]);

  return useBatchedOrganizationalData(
    teamId ? `team:${teamId}` : 'teams:list',
    fetcher,
    {
      ttl: 10 * 60 * 1000, // 10 minutes
      priority: 'high',
      ...options
    }
  );
}

export function useBatchedOperatorData(operatorId?: string, options?: BatchedDataOptions) {
  const fetcher = useCallback(async () => {
    if (operatorId) {
      return organizationalAPI.getOperator(operatorId, { priority: options?.priority });
    } else {
      return organizationalAPI.getOperators(undefined, { priority: options?.priority });
    }
  }, [operatorId, options?.priority]);

  return useBatchedOrganizationalData(
    operatorId ? `operator:${operatorId}` : 'operators:list',
    fetcher,
    {
      ttl: 5 * 60 * 1000, // 5 minutes
      priority: 'normal',
      ...options
    }
  );
}

export function useBatchedPerformanceData(type: string = 'overview', params?: Record<string, any>, options?: BatchedDataOptions) {
  const fetcher = useCallback(async () => {
    return organizationalAPI.getPerformanceData(type, params, { priority: options?.priority });
  }, [type, params, options?.priority]);

  const key = `performance:${type}${params ? ':' + JSON.stringify(params) : ''}`;

  return useBatchedOrganizationalData(
    key,
    fetcher,
    {
      ttl: 1 * 60 * 1000, // 1 minute
      priority: 'normal',
      staleTime: 15000, // 15 seconds
      ...options
    }
  );
}

export function useBatchedActivityData(type: string = 'overview', params?: Record<string, any>, options?: BatchedDataOptions) {
  const fetcher = useCallback(async () => {
    return organizationalAPI.getActivityData(type, params, { priority: options?.priority });
  }, [type, params, options?.priority]);

  const key = `activity:${type}${params ? ':' + JSON.stringify(params) : ''}`;

  return useBatchedOrganizationalData(
    key,
    fetcher,
    {
      ttl: 2 * 60 * 1000, // 2 minutes
      priority: 'normal',
      ...options
    }
  );
}

export function useBatchedSessionData(sessionId?: string, params?: Record<string, any>, options?: BatchedDataOptions) {
  const fetcher = useCallback(async () => {
    return organizationalAPI.getSessionData(sessionId, params, { priority: options?.priority });
  }, [sessionId, params, options?.priority]);

  const key = sessionId ? `session:${sessionId}` : `sessions:list${params ? ':' + JSON.stringify(params) : ''}`;

  return useBatchedOrganizationalData(
    key,
    fetcher,
    {
      ttl: 3 * 60 * 1000, // 3 minutes
      priority: 'normal',
      ...options
    }
  );
}

/**
 * Hook for loading multiple related data sets in a single batch
 */
export function useBatchedOrganizationalDataSet<T extends Record<string, any>>(
  requests: Array<{
    key: string;
    endpoint: string;
    params?: Record<string, any>;
    priority?: 'low' | 'normal' | 'high';
    cacheOptions?: CacheOptions;
  }>,
  options: BatchedDataOptions = {}
): BatchedDataResult<T> {
  const [state, setState] = useState<BatchedDataState<T>>(() => {
    // Try to get all data from cache
    const cachedData = {} as T;
    let hasAllData = true;

    requests.forEach(({ key }) => {
      const cached = organizationalCache.get(key);
      if (cached) {
        cachedData[key as keyof T] = cached;
      } else {
        hasAllData = false;
      }
    });

    return {
      data: hasAllData ? cachedData : null,
      loading: !hasAllData,
      error: null,
      stale: false
    };
  });

  const fetchingRef = useRef<Promise<T> | null>(null);

  const fetchData = useCallback(async (): Promise<T | null> => {
    if (fetchingRef.current) {
      return fetchingRef.current;
    }

    const fetchPromise = (async (): Promise<T> => {
      setState(prev => ({ ...prev, loading: true, error: null }));

      try {
        const result = await organizationalAPI.batchRequests<T>(requests);

        // Cache individual results
        requests.forEach(({ key, cacheOptions = {} }) => {
          const data = result[key as keyof T];
          if (data) {
            organizationalCache.set(key, data, cacheOptions);
          }
        });

        setState(prev => ({
          ...prev,
          data: result,
          loading: false,
          error: null,
          stale: false
        }));

        return result;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        setState(prev => ({
          ...prev,
          loading: false,
          error: err
        }));
        throw err;
      }
    })();

    fetchingRef.current = fetchPromise;

    try {
      const result = await fetchPromise;
      return result;
    } finally {
      fetchingRef.current = null;
    }
  }, [requests]);

  const refetch = useCallback(async (): Promise<void> => {
    await fetchData();
  }, [fetchData]);

  const invalidate = useCallback(() => {
    requests.forEach(({ key }) => {
      organizationalCache.delete(key);
    });
    setState(prev => ({ ...prev, data: null, stale: true }));
  }, [requests]);

  const mutate = useCallback((data: T) => {
    requests.forEach(({ key }) => {
      const keyData = data[key as keyof T];
      if (keyData) {
        organizationalCache.set(key, keyData);
      }
    });
    setState(prev => ({ ...prev, data, stale: false }));
  }, [requests]);

  // Initial fetch
  useEffect(() => {
    if (!state.data) {
      fetchData();
    }
  }, [state.data, fetchData]);

  return useMemo(() => ({
    ...state,
    refetch,
    invalidate,
    mutate
  }), [state, refetch, invalidate, mutate]);
}