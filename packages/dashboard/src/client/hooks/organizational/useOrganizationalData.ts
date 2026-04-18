/**
 * Organizational Data Hooks
 *
 * Custom React hooks for accessing and managing organizational context data,
 * team filtering, operator activity, and session correlation information.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useOrganizationalContext } from '../../contexts/OrganizationalContext.js';
import type {
  OrganizationalTrace,
  TeamFilterState,
  OperatorActivityPattern,
  SessionCorrelation,
  TeamPerformanceMetrics
} from '../../types/organizational.js';

// Re-export the main organizational context hook
export { useOrganizationalContext } from '../../contexts/OrganizationalContext.js';

/**
 * Hook for team filtering functionality
 */
export function useTeamFilter() {
  const { state, setTeamFilter, clearTeamFilter, refreshTeams, getCurrentTeamContext, isTeamAccessible } = useOrganizationalContext();

  const teamFilter = useMemo(() => ({
    // Current filter state
    selectedTeamId: state.teamFilter.selectedTeamId,
    availableTeams: state.teamFilter.availableTeams,
    filterActive: state.teamFilter.filterActive,

    // Loading and error states
    loading: state.loading.teams,
    error: state.errors.teams,

    // Current team context
    currentTeam: getCurrentTeamContext(),

    // Actions
    setTeam: setTeamFilter,
    clearFilter: clearTeamFilter,
    refresh: refreshTeams,

    // Utility functions
    isAccessible: isTeamAccessible,

    // Get filtered team options (only accessible teams)
    accessibleTeams: state.teamFilter.availableTeams.filter(team =>
      team.isAccessible || isTeamAccessible(team.teamId)
    ),
  }), [
    state.teamFilter,
    state.loading.teams,
    state.errors.teams,
    getCurrentTeamContext,
    setTeamFilter,
    clearTeamFilter,
    refreshTeams,
    isTeamAccessible
  ]);

  return teamFilter;
}

/**
 * Hook for organizational intelligence data
 */
export function useOrganizationalIntelligence() {
  const { state, refreshIntelligence } = useOrganizationalContext();

  const intelligence = useMemo(() => ({
    data: state.intelligence,
    loading: state.loading.intelligence,
    error: state.errors.intelligence,
    refresh: refreshIntelligence,

    // Convenient access to specific insights
    operatorInsights: state.intelligence?.operatorInsights,
    teamInsights: state.intelligence?.teamInsights,
    performanceInsights: state.intelligence?.performanceInsights,
  }), [
    state.intelligence,
    state.loading.intelligence,
    state.errors.intelligence,
    refreshIntelligence
  ]);

  return intelligence;
}

/**
 * Hook for operator activity data
 */
export function useOperatorActivity(operatorId: string, timeframe: '1h' | '24h' | '7d' | '30d' = '24h') {
  const [data, setData] = useState<OperatorActivityPattern | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchActivity = useCallback(async () => {
    if (!operatorId) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/operators/${encodeURIComponent(operatorId)}/activity?timeframe=${timeframe}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch operator activity: ${response.statusText}`);
      }

      const activityData = await response.json();
      setData({
        timeline: activityData.timeline || [],
        patterns: activityData.patterns || [],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load operator activity');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [operatorId, timeframe]);

  useEffect(() => {
    fetchActivity();
  }, [fetchActivity]);

  return {
    data,
    loading,
    error,
    refresh: fetchActivity,
    summary: data ? {
      totalSessions: data.timeline.length,
      patternCount: data.patterns.length,
      timeframe
    } : null
  };
}

/**
 * Hook for session correlation data
 */
export function useSessionCorrelation(sessionId: string, limit: number = 20) {
  const [data, setData] = useState<SessionCorrelation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<number | null>(null);

  const fetchCorrelations = useCallback(async (cursor?: number) => {
    if (!sessionId) return;

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        limit: limit.toString(),
        ...(cursor && { cursor: cursor.toString() })
      });

      const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/correlations?${params}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch session correlations: ${response.statusText}`);
      }

      const correlationData = await response.json();
      setData({
        relatedSessions: correlationData.correlations || [],
        continuationChain: [], // TODO: Extract from correlations
        similaritySummary: correlationData.correlations[0]?.similarity
      });
      setNextCursor(correlationData.nextCursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load session correlations');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [sessionId, limit]);

  const loadMore = useCallback(() => {
    if (nextCursor && !loading) {
      fetchCorrelations(nextCursor);
    }
  }, [fetchCorrelations, nextCursor, loading]);

  useEffect(() => {
    fetchCorrelations();
  }, [fetchCorrelations]);

  return {
    data,
    loading,
    error,
    refresh: () => fetchCorrelations(),
    loadMore,
    hasMore: !!nextCursor,
    summary: data ? {
      totalCorrelations: data.relatedSessions.length,
      continuationCount: data.relatedSessions.filter(s => s.relationshipType === 'continuation').length,
      collaborationCount: data.relatedSessions.filter(s => s.relationshipType === 'collaboration').length,
    } : null
  };
}

/**
 * Hook for team performance metrics
 */
export function useTeamPerformance(teamId?: string) {
  const [data, setData] = useState<TeamPerformanceMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMetrics = useCallback(async () => {
    if (!teamId) return;

    setLoading(true);
    setError(null);

    try {
      // For now, we derive team metrics from the global stats
      // In a full implementation, this would be a dedicated endpoint
      const response = await fetch('/api/stats');
      if (!response.ok) {
        throw new Error(`Failed to fetch team metrics: ${response.statusText}`);
      }

      const stats = await response.json();
      const intelligence = stats.organizationalIntelligence;

      if (intelligence) {
        // Create mock team performance data based on global metrics
        setData({
          teamId,
          metrics: {
            successRate: stats.globalSuccessRate / 100,
            averageExecutionTime: 5000, // Placeholder
            totalExecutions: Math.floor(stats.totalExecutions / Math.max(intelligence.teamInsights.totalTeams, 1)),
            activeOperators: Math.floor(intelligence.operatorInsights.activeOperators / Math.max(intelligence.teamInsights.totalTeams, 1)),
            collaborationScore: 0.75 // Placeholder
          },
          queryPerformance: {
            averageLatency: intelligence.performanceInsights.organizationalQueryLatency,
            cacheHitRate: intelligence.performanceInsights.teamScopedCacheHitRate,
            throughput: 150 // Placeholder
          },
          trends: {
            timeframe: 'day',
            dataPoints: [] // Placeholder - would come from historical data
          }
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load team performance metrics');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  return {
    data,
    loading,
    error,
    refresh: fetchMetrics
  };
}

/**
 * Hook for organizational trace filtering based on current context
 */
export function useOrganizationalTraceFilter() {
  const { state } = useOrganizationalContext();

  const filterTrace = useCallback((trace: OrganizationalTrace): boolean => {
    // If no team filter is active, show all traces
    if (!state.teamFilter.filterActive || !state.teamFilter.selectedTeamId) {
      return true;
    }

    // Check if trace has organizational context
    if (!trace.operatorContext) {
      return true; // Show traces without organizational context for backward compatibility
    }

    // Filter by team
    return trace.operatorContext.teamId === state.teamFilter.selectedTeamId;
  }, [state.teamFilter]);

  const getFilterSummary = useCallback(() => ({
    active: state.teamFilter.filterActive,
    teamId: state.teamFilter.selectedTeamId,
    teamName: state.teamFilter.availableTeams.find(
      t => t.teamId === state.teamFilter.selectedTeamId
    )?.teamName,
  }), [state.teamFilter]);

  return {
    filterTrace,
    getFilterSummary,
    isFiltered: state.teamFilter.filterActive
  };
}

/**
 * Main organizational data hook - combines all organizational functionality
 */
export function useOrganizationalData() {
  const context = useOrganizationalContext();
  const teamFilter = useTeamFilter();
  const intelligence = useOrganizationalIntelligence();
  const traceFilter = useOrganizationalTraceFilter();

  return {
    // Context access
    context,

    // Team filtering
    teamFilter,

    // Organizational intelligence
    intelligence,

    // Trace filtering
    traceFilter,

    // Utility hooks (available for specific use cases)
    hooks: {
      useOperatorActivity,
      useSessionCorrelation,
      useTeamPerformance
    }
  };
}