/**
 * Intelligent prefetching hook for organizational data
 *
 * Provides smart prefetching capabilities for team-scoped data to improve
 * perceived performance by loading data before user interaction.
 */

import { useCallback, useRef, useMemo } from 'react';

interface PrefetchOptions {
  delay?: number; // Delay before prefetch in ms (default: 300ms)
  cache?: boolean; // Whether to cache prefetched data (default: true)
  maxCacheSize?: number; // Maximum cache entries (default: 50)
  priority?: 'low' | 'normal' | 'high'; // Prefetch priority
}

interface PrefetchCache {
  [key: string]: {
    data: any;
    timestamp: number;
    expiry: number;
  };
}

interface PrefetchState {
  cache: PrefetchCache;
  pending: Set<string>;
  timers: Map<string, NodeJS.Timeout>;
}

// Cache expiry times by data type
const CACHE_EXPIRY_MS = {
  team: 5 * 60 * 1000,        // 5 minutes for team data
  operator: 3 * 60 * 1000,    // 3 minutes for operator data
  session: 2 * 60 * 1000,     // 2 minutes for session data
  performance: 1 * 60 * 1000, // 1 minute for performance data
  default: 5 * 60 * 1000      // Default 5 minutes
} as const;

export function usePrefetch() {
  const state = useRef<PrefetchState>({
    cache: {},
    pending: new Set(),
    timers: new Map()
  });

  // Clean up expired cache entries
  const cleanupCache = useCallback(() => {
    const now = Date.now();
    const cache = state.current.cache;

    Object.keys(cache).forEach(key => {
      if (cache[key].expiry < now) {
        delete cache[key];
      }
    });
  }, []);

  // Generic prefetch function
  const prefetch = useCallback(async <T>(
    key: string,
    fetchFn: () => Promise<T>,
    options: PrefetchOptions = {}
  ): Promise<T | null> => {
    const {
      delay = 300,
      cache = true,
      maxCacheSize = 50,
      priority = 'normal'
    } = options;

    // Check if already pending
    if (state.current.pending.has(key)) {
      return null;
    }

    // Check cache first
    if (cache && state.current.cache[key]) {
      const cached = state.current.cache[key];
      if (cached.expiry > Date.now()) {
        return cached.data;
      }
      delete state.current.cache[key];
    }

    // Clear any existing timer for this key
    const existingTimer = state.current.timers.get(key);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    return new Promise((resolve) => {
      const timer = setTimeout(async () => {
        try {
          state.current.pending.add(key);

          // Use request priority if supported
          const controller = new AbortController();

          // Determine cache expiry based on data type
          const dataType = key.split(':')[0] as keyof typeof CACHE_EXPIRY_MS;
          const expiryTime = CACHE_EXPIRY_MS[dataType] || CACHE_EXPIRY_MS.default;

          const data = await fetchFn();

          if (cache) {
            // Clean up cache if at capacity
            if (Object.keys(state.current.cache).length >= maxCacheSize) {
              cleanupCache();
            }

            // Cache the result
            state.current.cache[key] = {
              data,
              timestamp: Date.now(),
              expiry: Date.now() + expiryTime
            };
          }

          resolve(data);
        } catch (error) {
          console.debug(`Prefetch failed for ${key}:`, error);
          resolve(null);
        } finally {
          state.current.pending.delete(key);
          state.current.timers.delete(key);
        }
      }, delay);

      state.current.timers.set(key, timer);
    });
  }, [cleanupCache]);

  // Specific prefetch functions for different data types
  const prefetchTeamData = useCallback(async (teamId: string, options?: PrefetchOptions) => {
    const key = `team:${teamId}`;
    return prefetch(key, async () => {
      const response = await fetch(`/api/teams/${teamId}`);
      if (!response.ok) throw new Error(`Failed to fetch team ${teamId}`);
      return response.json();
    }, { ...options, priority: 'high' });
  }, [prefetch]);

  const prefetchTeamPerformance = useCallback(async (teamId: string, options?: PrefetchOptions) => {
    const key = `performance:team:${teamId}`;
    return prefetch(key, async () => {
      const response = await fetch(`/api/teams/${teamId}/performance`);
      if (!response.ok) throw new Error(`Failed to fetch team performance ${teamId}`);
      return response.json();
    }, options);
  }, [prefetch]);

  const prefetchTeamActivity = useCallback(async (teamId: string, options?: PrefetchOptions) => {
    const key = `activity:team:${teamId}`;
    return prefetch(key, async () => {
      const response = await fetch(`/api/teams/${teamId}/activity`);
      if (!response.ok) throw new Error(`Failed to fetch team activity ${teamId}`);
      return response.json();
    }, options);
  }, [prefetch]);

  const prefetchOperatorData = useCallback(async (operatorId: string, options?: PrefetchOptions) => {
    const key = `operator:${operatorId}`;
    return prefetch(key, async () => {
      const response = await fetch(`/api/operators/${operatorId}`);
      if (!response.ok) throw new Error(`Failed to fetch operator ${operatorId}`);
      return response.json();
    }, options);
  }, [prefetch]);

  const prefetchOperatorActivity = useCallback(async (operatorId: string, options?: PrefetchOptions) => {
    const key = `activity:operator:${operatorId}`;
    return prefetch(key, async () => {
      const response = await fetch(`/api/operators/${operatorId}/activity`);
      if (!response.ok) throw new Error(`Failed to fetch operator activity ${operatorId}`);
      return response.json();
    }, options);
  }, [prefetch]);

  const prefetchSessionCorrelations = useCallback(async (sessionId: string, options?: PrefetchOptions) => {
    const key = `session:correlations:${sessionId}`;
    return prefetch(key, async () => {
      const response = await fetch(`/api/sessions/${sessionId}/correlations`);
      if (!response.ok) throw new Error(`Failed to fetch session correlations ${sessionId}`);
      return response.json();
    }, options);
  }, [prefetch]);

  // Cancel prefetch for specific key
  const cancelPrefetch = useCallback((key: string) => {
    const timer = state.current.timers.get(key);
    if (timer) {
      clearTimeout(timer);
      state.current.timers.delete(key);
    }
    state.current.pending.delete(key);
  }, []);

  // Cancel all pending prefetches
  const cancelAllPrefetches = useCallback(() => {
    state.current.timers.forEach(timer => clearTimeout(timer));
    state.current.timers.clear();
    state.current.pending.clear();
  }, []);

  // Get cached data without prefetching
  const getCached = useCallback(<T>(key: string): T | null => {
    const cached = state.current.cache[key];
    if (cached && cached.expiry > Date.now()) {
      return cached.data;
    }
    return null;
  }, []);

  // Clear cache manually
  const clearCache = useCallback((keyPattern?: string) => {
    if (keyPattern) {
      Object.keys(state.current.cache).forEach(key => {
        if (key.includes(keyPattern)) {
          delete state.current.cache[key];
        }
      });
    } else {
      state.current.cache = {};
    }
  }, []);

  // Get cache stats for debugging
  const getCacheStats = useCallback(() => {
    const cache = state.current.cache;
    const now = Date.now();
    const entries = Object.keys(cache);
    const expired = entries.filter(key => cache[key].expiry < now);

    return {
      totalEntries: entries.length,
      expiredEntries: expired.length,
      activeEntries: entries.length - expired.length,
      pendingPrefetches: state.current.pending.size,
      activePrefetches: state.current.timers.size
    };
  }, []);

  return useMemo(() => ({
    // Specific prefetch functions
    prefetchTeamData,
    prefetchTeamPerformance,
    prefetchTeamActivity,
    prefetchOperatorData,
    prefetchOperatorActivity,
    prefetchSessionCorrelations,

    // General utilities
    prefetch,
    cancelPrefetch,
    cancelAllPrefetches,
    getCached,
    clearCache,
    getCacheStats
  }), [
    prefetchTeamData,
    prefetchTeamPerformance,
    prefetchTeamActivity,
    prefetchOperatorData,
    prefetchOperatorActivity,
    prefetchSessionCorrelations,
    prefetch,
    cancelPrefetch,
    cancelAllPrefetches,
    getCached,
    clearCache,
    getCacheStats
  ]);
}

// Hook for hover-based prefetching
export function useHoverPrefetch() {
  const { prefetchTeamData, prefetchOperatorData, cancelPrefetch } = usePrefetch();

  const createHoverHandlers = useCallback((
    id: string,
    type: 'team' | 'operator',
    options?: PrefetchOptions
  ) => {
    const prefetchFn = type === 'team' ? prefetchTeamData : prefetchOperatorData;

    return {
      onMouseEnter: () => {
        prefetchFn(id, { delay: 200, ...options });
      },
      onMouseLeave: () => {
        // Don't cancel immediately - user might hover back
        setTimeout(() => cancelPrefetch(`${type}:${id}`), 100);
      },
      onFocus: () => {
        // Immediate prefetch on focus for accessibility
        prefetchFn(id, { delay: 0, ...options });
      }
    };
  }, [prefetchTeamData, prefetchOperatorData, cancelPrefetch]);

  return { createHoverHandlers };
}