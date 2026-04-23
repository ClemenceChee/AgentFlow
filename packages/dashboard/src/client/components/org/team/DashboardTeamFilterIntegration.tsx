/**
 * Dashboard Team Filter Integration
 *
 * Integration component that adds team filtering capabilities to the
 * main dashboard header with state synchronization, quick filters,
 * and organizational context awareness.
 */

import React, { useState, useCallback, useEffect } from 'react';
import { TeamFilterDropdown } from './TeamFilterDropdown.js';
import { useTeamScopedFiltering } from '../../../hooks/organizational/useTeamScopedFiltering.js';
import { useOrganizationalContext } from '../../../../../contexts/OrganizationalContext';
import type { OrganizationalTrace } from '../../../types/organizational.js';

// Component props
interface DashboardTeamFilterIntegrationProps {
  /** Current traces being displayed */
  traces: OrganizationalTrace[];

  /** Callback when filtered traces change */
  onFilteredTracesChange?: (traces: OrganizationalTrace[], teamId: string | null) => void;

  /** Whether to show quick filter buttons */
  showQuickFilters?: boolean;

  /** Whether to show team statistics */
  showTeamStats?: boolean;

  /** Whether to show organizational context toggle */
  showOrgContextToggle?: boolean;

  /** Custom CSS class name */
  className?: string;

  /** Position in header ('left' | 'center' | 'right') */
  position?: 'left' | 'center' | 'right';

  /** Whether to show compact version */
  compact?: boolean;
}

// Quick filter team IDs (most commonly accessed teams)
interface QuickFilterTeam {
  teamId: string;
  name: string;
  memberCount: number;
  isActive: boolean;
}

/**
 * Dashboard Team Filter Integration Component
 */
export function DashboardTeamFilterIntegration({
  traces,
  onFilteredTracesChange,
  showQuickFilters = true,
  showTeamStats = true,
  showOrgContextToggle = true,
  className = '',
  position = 'right',
  compact = false
}: DashboardTeamFilterIntegrationProps) {
  const { state, actions } = useOrganizationalContext();
  const [quickFilterTeams, setQuickFilterTeams] = useState<QuickFilterTeam[]>([]);

  // Use team-scoped filtering hook
  const {
    selectedTeamId,
    availableTeamIds,
    filteredTraces,
    isLoading,
    error,
    hasTeamAccess,
    setTeamFilter,
    clearTeamFilter,
    refreshTeamAccess
  } = useTeamScopedFiltering(traces, {
    persistInUrl: true,
    enforceAccessControl: true,
    onFilterChange: onFilteredTracesChange
  });

  // Load quick filter teams (most active or recently used teams)
  useEffect(() => {
    const loadQuickFilterTeams = async () => {
      try {
        if (!showQuickFilters || availableTeamIds.length === 0) return;

        // Calculate team activity from current traces
        const teamStats = new Map<string, { count: number; lastActivity: number; name?: string }>();

        traces.forEach(trace => {
          const teamId = trace.operatorContext?.teamId;
          if (!teamId || !availableTeamIds.includes(teamId)) return;

          const stats = teamStats.get(teamId) || { count: 0, lastActivity: 0 };
          stats.count++;

          if (trace.timestamp > stats.lastActivity) {
            stats.lastActivity = trace.timestamp;
          }

          teamStats.set(teamId, stats);
        });

        // Get top 3-4 most active teams for quick filters
        const sortedTeams = Array.from(teamStats.entries())
          .sort((a, b) => {
            // Sort by activity count first, then by recency
            if (b[1].count !== a[1].count) {
              return b[1].count - a[1].count;
            }
            return b[1].lastActivity - a[1].lastActivity;
          })
          .slice(0, compact ? 2 : 4);

        const quickTeams: QuickFilterTeam[] = await Promise.all(
          sortedTeams.map(async ([teamId, stats]) => {
            // Try to get team name from API (with fallback)
            let teamName = teamId.substring(0, 8);
            try {
              const response = await fetch(`/api/teams/${teamId}/info`);
              if (response.ok) {
                const teamInfo = await response.json();
                teamName = teamInfo.name || teamName;
              }
            } catch {
              // Use fallback name
            }

            return {
              teamId,
              name: teamName,
              memberCount: stats.count,
              isActive: stats.lastActivity > Date.now() - 24 * 60 * 60 * 1000 // Active in last 24h
            };
          })
        );

        setQuickFilterTeams(quickTeams);
      } catch (err) {
        console.error('Error loading quick filter teams:', err);
      }
    };

    loadQuickFilterTeams();
  }, [traces, availableTeamIds, showQuickFilters, compact]);

  // Handle team filter change
  const handleTeamChange = useCallback((teamId: string | null) => {
    setTeamFilter(teamId);
  }, [setTeamFilter]);

  // Handle organizational context toggle
  const handleOrgContextToggle = useCallback(() => {
    const newExpanded = !state.orgContextExpanded;
    actions.setOrgContextExpanded(newExpanded);
  }, [state.orgContextExpanded, actions]);

  // Calculate team statistics
  const teamStats = React.useMemo(() => {
    if (!showTeamStats) return null;

    const totalTraces = filteredTraces.length;
    const teamsInTraces = new Set(
      filteredTraces
        .map(trace => trace.operatorContext?.teamId)
        .filter(Boolean)
    ).size;

    return {
      totalTraces,
      teamsInTraces,
      selectedTeamName: selectedTeamId ? (
        quickFilterTeams.find(t => t.teamId === selectedTeamId)?.name ||
        selectedTeamId.substring(0, 8)
      ) : null
    };
  }, [filteredTraces, selectedTeamId, quickFilterTeams, showTeamStats]);

  const containerClasses = [
    'dashboard-team-filter-integration',
    `position-${position}`,
    compact ? 'compact' : '',
    error ? 'error' : '',
    className
  ].filter(Boolean).join(' ');

  return (
    <div className={containerClasses}>
      {/* Error Display */}
      {error && !compact && (
        <div className="dashboard-team-filter-error">
          <span className="dashboard-team-filter-error__icon">⚠️</span>
          <span className="dashboard-team-filter-error__message">
            {error}
          </span>
          <button
            className="dashboard-team-filter-error__retry"
            onClick={refreshTeamAccess}
            title="Retry loading teams"
          >
            🔄
          </button>
        </div>
      )}

      {/* Quick Filter Buttons */}
      {showQuickFilters && quickFilterTeams.length > 0 && !compact && (
        <div className="dashboard-team-filter-quick">
          <div className="dashboard-team-filter-quick__label">
            Quick filters:
          </div>
          <div className="dashboard-team-filter-quick__buttons">
            {quickFilterTeams.map((team) => (
              <button
                key={team.teamId}
                className={`dashboard-team-filter-quick-button ${
                  selectedTeamId === team.teamId ? 'active' : ''
                }`}
                onClick={() => handleTeamChange(team.teamId)}
                title={`Filter by team: ${team.name} (${team.memberCount} traces)`}
              >
                <span className="dashboard-team-filter-quick-button__icon">
                  👥
                </span>
                <span className="dashboard-team-filter-quick-button__name">
                  {team.name}
                </span>
                {team.isActive && (
                  <span className="dashboard-team-filter-quick-button__activity-dot" />
                )}
              </button>
            ))}

            {selectedTeamId && (
              <button
                className="dashboard-team-filter-quick-button clear"
                onClick={clearTeamFilter}
                title="Clear team filter (show all teams)"
              >
                <span className="dashboard-team-filter-quick-button__icon">
                  🌐
                </span>
                <span className="dashboard-team-filter-quick-button__name">
                  All
                </span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Main Team Filter Dropdown */}
      <div className="dashboard-team-filter-main">
        <TeamFilterDropdown
          selectedTeamId={selectedTeamId}
          onTeamChange={handleTeamChange}
          disabled={isLoading}
          showAllTeamsOption={true}
          showMemberCounts={!compact}
          showActivityIndicators={!compact}
          enableSearch={!compact}
          placeholder={compact ? "Team..." : "Filter by team..."}
          className="dashboard-team-filter-dropdown"
        />

        {/* Team Stats Display */}
        {teamStats && showTeamStats && (
          <div className="dashboard-team-filter-stats">
            {selectedTeamId ? (
              <div className="dashboard-team-filter-stats__filtered">
                <span className="dashboard-team-filter-stats__icon">👥</span>
                <span className="dashboard-team-filter-stats__text">
                  {compact ? (
                    `${teamStats.totalTraces}`
                  ) : (
                    `${teamStats.totalTraces} trace${teamStats.totalTraces !== 1 ? 's' : ''} from ${teamStats.selectedTeamName}`
                  )}
                </span>
              </div>
            ) : (
              <div className="dashboard-team-filter-stats__all">
                <span className="dashboard-team-filter-stats__icon">🌐</span>
                <span className="dashboard-team-filter-stats__text">
                  {compact ? (
                    `${teamStats.totalTraces} (${teamStats.teamsInTraces})`
                  ) : (
                    `${teamStats.totalTraces} trace${teamStats.totalTraces !== 1 ? 's' : ''} from ${teamStats.teamsInTraces} team${teamStats.teamsInTraces !== 1 ? 's' : ''}`
                  )}
                </span>
              </div>
            )}

            {!hasTeamAccess && selectedTeamId && (
              <div className="dashboard-team-filter-stats__access-warning">
                <span className="dashboard-team-filter-stats__warning-icon">🔒</span>
                <span className="dashboard-team-filter-stats__warning-text">
                  Limited access
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Organizational Context Toggle */}
      {showOrgContextToggle && (
        <div className="dashboard-team-filter-context-toggle">
          <button
            className={`dashboard-team-filter-context-button ${
              state.orgContextExpanded ? 'expanded' : 'collapsed'
            }`}
            onClick={handleOrgContextToggle}
            title={`${state.orgContextExpanded ? 'Hide' : 'Show'} organizational context panel`}
          >
            <span className="dashboard-team-filter-context-button__icon">
              📋
            </span>
            {!compact && (
              <span className="dashboard-team-filter-context-button__text">
                {state.orgContextExpanded ? 'Hide' : 'Show'} Context
              </span>
            )}
            <span className={`dashboard-team-filter-context-button__arrow ${
              state.orgContextExpanded ? 'up' : 'down'
            }`}>
              ▼
            </span>
          </button>
        </div>
      )}

      {/* Loading Indicator */}
      {isLoading && (
        <div className="dashboard-team-filter-loading">
          <div className="dashboard-team-filter-loading-spinner" />
          {!compact && (
            <span className="dashboard-team-filter-loading-text">
              Loading teams...
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// Export default for easy importing
export default DashboardTeamFilterIntegration;