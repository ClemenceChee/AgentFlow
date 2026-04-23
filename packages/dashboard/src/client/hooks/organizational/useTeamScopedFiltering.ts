/**
 * Team-Scoped Filtering Hook
 *
 * Custom hook for managing team-scoped trace filtering with URL state
 * persistence, access control validation, and filter synchronization.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import { useOrganizationalContext } from '../../contexts/OrganizationalContext.js';
import type { OrganizationalTrace, TeamFilterState } from '../../types/organizational.js';

// Filter configuration interface
interface TeamFilterConfig {
  /** Whether to persist filter state in URL */
  persistInUrl?: boolean;

  /** URL parameter name for team filter */
  urlParam?: string;

  /** Whether to validate team access permissions */
  enforceAccessControl?: boolean;

  /** Default team ID to select (null for "all teams") */
  defaultTeamId?: string | null;

  /** Callback when filter changes */
  onFilterChange?: (teamId: string | null, traces: OrganizationalTrace[]) => void;

  /** Custom trace filtering logic */
  customTraceFilter?: (trace: OrganizationalTrace, teamId: string) => boolean;
}

// Hook return interface
interface UseTeamScopedFilteringReturn {
  /** Current selected team ID (null = all teams) */
  selectedTeamId: string | null;

  /** Array of available team IDs user has access to */
  availableTeamIds: string[];

  /** Filtered traces based on current team selection */
  filteredTraces: OrganizationalTrace[];

  /** Loading state for filter operations */
  isLoading: boolean;

  /** Error state for filter operations */
  error: string | null;

  /** Whether current user can access the selected team */
  hasTeamAccess: boolean;

  /** Function to change team filter */
  setTeamFilter: (teamId: string | null) => void;

  /** Function to clear team filter (show all teams) */
  clearTeamFilter: () => void;

  /** Function to refresh team access and availability */
  refreshTeamAccess: () => Promise<void>;

  /** Current filter state for persistence */
  filterState: TeamFilterState;
}

/**
 * Custom hook for team-scoped filtering
 */
export function useTeamScopedFiltering(
  traces: OrganizationalTrace[],
  config: TeamFilterConfig = {}
): UseTeamScopedFilteringReturn {
  const {
    persistInUrl = true,
    urlParam = 'team',
    enforceAccessControl = true,
    defaultTeamId = null,
    onFilterChange,
    customTraceFilter
  } = config;

  const history = useHistory();
  const location = useLocation();
  const { state, actions } = useOrganizationalContext();

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availableTeamIds, setAvailableTeamIds] = useState<string[]>([]);

  // Get team filter from URL or organizational context
  const getInitialTeamId = useCallback((): string | null => {
    if (persistInUrl) {
      const urlParams = new URLSearchParams(location.search);
      const urlTeamId = urlParams.get(urlParam);
      if (urlTeamId) return urlTeamId;
    }

    // Fallback to organizational context or default
    return state.teamFilter?.selectedTeamId ?? defaultTeamId;
  }, [location.search, persistInUrl, urlParam, state.teamFilter, defaultTeamId]);

  const [selectedTeamId, setSelectedTeamIdState] = useState<string | null>(getInitialTeamId);

  // Update URL when team filter changes
  const updateUrlState = useCallback((teamId: string | null) => {
    if (!persistInUrl) return;

    const urlParams = new URLSearchParams(location.search);

    if (teamId) {
      urlParams.set(urlParam, teamId);
    } else {
      urlParams.delete(urlParam);
    }

    const newSearch = urlParams.toString();
    const newUrl = `${location.pathname}${newSearch ? `?${newSearch}` : ''}`;

    // Only update URL if it actually changed
    if (newUrl !== `${location.pathname}${location.search}`) {
      history.replace(newUrl);
    }
  }, [history, location, persistInUrl, urlParam]);

  // Update organizational context when team filter changes
  const updateOrganizationalContext = useCallback((teamId: string | null) => {
    const filterState: TeamFilterState = {
      selectedTeamId: teamId,
      availableTeams: state.availableTeams,
      lastUpdated: Date.now()
    };

    actions.setTeamFilter(filterState);
  }, [actions, state.availableTeams]);

  // Load available team IDs user has access to
  const loadAvailableTeamIds = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      if (!enforceAccessControl) {
        // If access control is disabled, extract all team IDs from traces
        const teamIds = Array.from(new Set(
          traces
            .map(trace => trace.operatorContext?.teamId)
            .filter(Boolean) as string[]
        ));
        setAvailableTeamIds(teamIds);
        return;
      }

      // Fetch user's accessible teams from API
      const response = await fetch('/api/teams/accessible');
      if (!response.ok) {
        throw new Error(`Failed to load accessible teams: ${response.statusText}`);
      }

      const data = await response.json();
      const teamIds = data.teams?.map((team: any) => team.teamId) || [];
      setAvailableTeamIds(teamIds);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load team access');
      console.error('Error loading available team IDs:', err);
    } finally {
      setIsLoading(false);
    }
  }, [traces, enforceAccessControl]);

  // Check if user has access to selected team
  const hasTeamAccess = useMemo(() => {
    if (!selectedTeamId) return true; // "All teams" is always accessible
    if (!enforceAccessControl) return true; // Access control disabled
    return availableTeamIds.includes(selectedTeamId);
  }, [selectedTeamId, availableTeamIds, enforceAccessControl]);

  // Filter traces based on selected team
  const filteredTraces = useMemo(() => {
    if (!selectedTeamId) {
      // No team filter - show all accessible traces
      if (!enforceAccessControl) return traces;

      // Filter to only show traces from accessible teams
      return traces.filter(trace => {
        const traceTeamId = trace.operatorContext?.teamId;
        return !traceTeamId || availableTeamIds.includes(traceTeamId);
      });
    }

    // Filter by specific team
    return traces.filter(trace => {
      const traceTeamId = trace.operatorContext?.teamId;

      // Use custom filter if provided
      if (customTraceFilter && traceTeamId) {
        return customTraceFilter(trace, selectedTeamId);
      }

      // Default filtering logic
      return traceTeamId === selectedTeamId;
    });
  }, [traces, selectedTeamId, availableTeamIds, enforceAccessControl, customTraceFilter]);

  // Main function to set team filter
  const setTeamFilter = useCallback((teamId: string | null) => {
    // Validate team access
    if (teamId && enforceAccessControl && !availableTeamIds.includes(teamId)) {
      setError(`Access denied to team: ${teamId}`);
      return;
    }

    setError(null);
    setSelectedTeamIdState(teamId);
    updateUrlState(teamId);
    updateOrganizationalContext(teamId);

    // Call change callback
    if (onFilterChange) {
      onFilterChange(teamId, filteredTraces);
    }
  }, [
    availableTeamIds,
    enforceAccessControl,
    updateUrlState,
    updateOrganizationalContext,
    onFilterChange,
    filteredTraces
  ]);

  // Clear team filter (show all teams)
  const clearTeamFilter = useCallback(() => {
    setTeamFilter(null);
  }, [setTeamFilter]);

  // Refresh team access and availability
  const refreshTeamAccess = useCallback(async () => {
    await loadAvailableTeamIds();
  }, [loadAvailableTeamIds]);

  // Load available teams on mount and when dependencies change
  useEffect(() => {
    loadAvailableTeamIds();
  }, [loadAvailableTeamIds]);

  // Sync with URL changes from external navigation
  useEffect(() => {
    const urlTeamId = getInitialTeamId();
    if (urlTeamId !== selectedTeamId) {
      setSelectedTeamIdState(urlTeamId);
      updateOrganizationalContext(urlTeamId);
    }
  }, [location.search, getInitialTeamId, selectedTeamId, updateOrganizationalContext]);

  // Validate selected team access on availability changes
  useEffect(() => {
    if (selectedTeamId && enforceAccessControl && availableTeamIds.length > 0) {
      if (!availableTeamIds.includes(selectedTeamId)) {
        setError(`Access denied to team: ${selectedTeamId}`);
        // Automatically clear invalid team filter
        setTeamFilter(null);
      }
    }
  }, [selectedTeamId, availableTeamIds, enforceAccessControl, setTeamFilter]);

  // Build current filter state
  const filterState: TeamFilterState = useMemo(() => ({
    selectedTeamId,
    availableTeams: state.availableTeams,
    lastUpdated: Date.now()
  }), [selectedTeamId, state.availableTeams]);

  return {
    selectedTeamId,
    availableTeamIds,
    filteredTraces,
    isLoading,
    error,
    hasTeamAccess,
    setTeamFilter,
    clearTeamFilter,
    refreshTeamAccess,
    filterState
  };
}

/**
 * Utility function to extract team filter from URL
 */
export function extractTeamFilterFromUrl(
  url: string,
  paramName: string = 'team'
): string | null {
  try {
    const urlObj = new URL(url, window.location.origin);
    return urlObj.searchParams.get(paramName);
  } catch {
    return null;
  }
}

/**
 * Utility function to build URL with team filter
 */
export function buildUrlWithTeamFilter(
  baseUrl: string,
  teamId: string | null,
  paramName: string = 'team'
): string {
  try {
    const url = new URL(baseUrl, window.location.origin);

    if (teamId) {
      url.searchParams.set(paramName, teamId);
    } else {
      url.searchParams.delete(paramName);
    }

    return url.pathname + url.search;
  } catch {
    return baseUrl;
  }
}

/**
 * Utility function to validate team access permissions
 */
export async function validateTeamAccess(
  teamId: string,
  operatorId?: string
): Promise<boolean> {
  try {
    const url = operatorId
      ? `/api/teams/${teamId}/access?operatorId=${operatorId}`
      : `/api/teams/${teamId}/access`;

    const response = await fetch(url);
    if (!response.ok) return false;

    const data = await response.json();
    return data.hasAccess === true;
  } catch {
    return false;
  }
}

// Export default for easy importing
export default useTeamScopedFiltering;