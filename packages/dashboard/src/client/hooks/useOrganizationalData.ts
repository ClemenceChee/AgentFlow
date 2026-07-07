/**
 * React hooks for organizational data fetching.
 *
 * Provides custom hooks for fetching organizational intelligence,
 * traces, and metrics from SOMA-enriched data via AgentFlow dashboard APIs.
 */

import { useEffect, useState, useCallback } from 'react';
import type {
  OrganizationalTrace,
  OrganizationalIntelligence,
  TeamPerformanceMetrics,
} from '../types/organizational.js';

interface UseOrganizationalTracesOptions {
  teamFilter?: string;
  limit?: number;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

interface UseOrganizationalTracesResult {
  traces: OrganizationalTrace[];
  loading: boolean;
  error: string | null;
  total: number;
  refresh: () => void;
}

/**
 * Hook for fetching organizational traces with optional team filtering
 */
export function useOrganizationalTraces(
  options: UseOrganizationalTracesOptions = {}
): UseOrganizationalTracesResult {
  const {
    teamFilter,
    limit = 100,
    autoRefresh = false,
    refreshInterval = 30000 // 30 seconds
  } = options;

  const [traces, setTraces] = useState<OrganizationalTrace[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);

  const fetchTraces = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (teamFilter) params.append('team', teamFilter);
      if (limit) params.append('limit', limit.toString());

      const response = await fetch(`/api/organizational/traces?${params}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch organizational traces: ${response.statusText}`);
      }

      const data = await response.json();
      setTraces(data.traces || []);
      setTotal(data.total || 0);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch traces';
      setError(errorMessage);
      setTraces([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [teamFilter, limit]);

  // Initial fetch
  useEffect(() => {
    fetchTraces();
  }, [fetchTraces]);

  // Auto-refresh setup
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(fetchTraces, refreshInterval);
    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, fetchTraces]);

  return {
    traces,
    loading,
    error,
    total,
    refresh: fetchTraces
  };
}

interface UseOrganizationalIntelligenceResult {
  intelligence: OrganizationalIntelligence | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * Hook for fetching organizational intelligence summary
 */
export function useOrganizationalIntelligence(): UseOrganizationalIntelligenceResult {
  const [intelligence, setIntelligence] = useState<OrganizationalIntelligence | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchIntelligence = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/stats');
      if (!response.ok) {
        throw new Error(`Failed to fetch organizational intelligence: ${response.statusText}`);
      }

      const data = await response.json();
      setIntelligence(data.organizationalIntelligence || null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch intelligence';
      setError(errorMessage);
      setIntelligence(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchIntelligence();
  }, [fetchIntelligence]);

  return {
    intelligence,
    loading,
    error,
    refresh: fetchIntelligence
  };
}

interface UseTeamPerformanceOptions {
  teamId?: string;
  timeframe?: 'hour' | 'day' | 'week';
}

interface UseTeamPerformanceResult {
  metrics: TeamPerformanceMetrics | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * Hook for fetching team performance metrics
 */
export function useTeamPerformance(
  options: UseTeamPerformanceOptions = {}
): UseTeamPerformanceResult {
  const { teamId, timeframe = 'day' } = options;

  const [metrics, setMetrics] = useState<TeamPerformanceMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMetrics = useCallback(async () => {
    if (!teamId) {
      setMetrics(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ timeframe });
      const response = await fetch(`/api/teams/${teamId}/performance?${params}`);

      if (!response.ok) {
        throw new Error(`Failed to fetch team performance: ${response.statusText}`);
      }

      const data = await response.json();
      setMetrics(data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch team metrics';
      setError(errorMessage);
      setMetrics(null);
    } finally {
      setLoading(false);
    }
  }, [teamId, timeframe]);

  // Fetch when teamId or timeframe changes
  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  return {
    metrics,
    loading,
    error,
    refresh: fetchMetrics
  };
}

interface UseOperatorActivityOptions {
  operatorId: string;
  timeframe?: string;
  limit?: number;
}

interface OperatorActivity {
  timeline: Array<{
    timestamp: number;
    sessionId: string;
    activityType: string;
    description: string;
    relatedOperators?: string[];
  }>;
  patterns: Array<{
    patternType: string;
    description: string;
    frequency: number;
    confidence: number;
  }>;
}

interface UseOperatorActivityResult {
  activity: OperatorActivity | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * Hook for fetching operator activity patterns
 */
export function useOperatorActivity(
  options: UseOperatorActivityOptions
): UseOperatorActivityResult {
  const { operatorId, timeframe = '24h', limit = 100 } = options;

  const [activity, setActivity] = useState<OperatorActivity | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchActivity = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        timeframe,
        limit: limit.toString()
      });

      const response = await fetch(`/api/operators/${operatorId}/activity?${params}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch operator activity: ${response.statusText}`);
      }

      const data = await response.json();
      setActivity(data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch activity';
      setError(errorMessage);
      setActivity(null);
    } finally {
      setLoading(false);
    }
  }, [operatorId, timeframe, limit]);

  // Fetch when parameters change
  useEffect(() => {
    fetchActivity();
  }, [fetchActivity]);

  return {
    activity,
    loading,
    error,
    refresh: fetchActivity
  };
}

/**
 * Helper hook for polling data with configurable intervals
 */
export function usePolling(callback: () => void, interval: number, enabled: boolean = true) {
  useEffect(() => {
    if (!enabled) return;

    const id = setInterval(callback, interval);
    return () => clearInterval(id);
  }, [callback, interval, enabled]);
}