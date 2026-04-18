/**
 * Team Filter Dropdown
 *
 * Dropdown component for selecting team filters with search functionality,
 * team access control, and state management integration for dashboard filtering.
 */

import React, { useState, useEffect, useMemo, useRef, memo, useCallback } from 'react';
import { useOrganizationalContext } from '../../../../../contexts/OrganizationalContext';
import { useOrganizationalData } from '../../../hooks/organizational/index.js';
import { useHoverPrefetch } from '../../../hooks/usePrefetch.js';
import { useTeamData } from '../../../hooks/useOrganizationalCache.js';
import { useExpensiveMemo, useStableCallback, withDeepMemo } from '../../../utils/react-optimizations.js';
import type { TeamMembership, TeamAccessLevel } from '../../../types/organizational.js';

// Component props
interface TeamFilterDropdownProps {
  /** Current selected team ID */
  selectedTeamId?: string;

  /** Callback when team selection changes */
  onTeamChange: (teamId: string | null) => void;

  /** Whether dropdown is disabled */
  disabled?: boolean;

  /** Whether to show "All Teams" option */
  showAllTeamsOption?: boolean;

  /** Whether to show team member counts */
  showMemberCounts?: boolean;

  /** Whether to show team activity indicators */
  showActivityIndicators?: boolean;

  /** Custom CSS class name */
  className?: string;

  /** Placeholder text when no team selected */
  placeholder?: string;

  /** Maximum height of dropdown content */
  maxHeight?: string;

  /** Whether to show search input */
  enableSearch?: boolean;

  /** Custom filter function for teams */
  customFilter?: (team: TeamMembership, query: string) => boolean;
}

// Team option configuration
interface TeamOption {
  team: TeamMembership;
  accessLevel: TeamAccessLevel;
  memberCount: number;
  activeMembers: number;
  activityRatio: number;
}

// Optimized Team Option Item Component
const TeamOptionItem = memo<{
  option: TeamOption;
  isSelected: boolean;
  showMemberCounts: boolean;
  showActivityIndicators: boolean;
  onSelect: (teamId: string) => void;
  getActivityStatus: (ratio: number) => string;
  formatTeamName: (team: TeamMembership) => string;
  hoverHandlers: any;
}>(({
  option,
  isSelected,
  showMemberCounts,
  showActivityIndicators,
  onSelect,
  getActivityStatus,
  formatTeamName,
  hoverHandlers
}) => {
  const handleSelect = useStableCallback(() => {
    onSelect(option.team.teamId);
  }, [onSelect, option.team.teamId]);

  return (
    <button
      className={`team-filter-dropdown__option ${isSelected ? 'selected' : ''}`}
      onClick={handleSelect}
      role="option"
      aria-selected={isSelected}
      {...hoverHandlers}
    >
      <div className="team-filter-dropdown__option-content">
        <div className="team-filter-dropdown__option-icon">
          👥
        </div>

        <div className="team-filter-dropdown__option-text">
          <div className="team-filter-dropdown__option-name">
            {formatTeamName(option.team)}
            {option.accessLevel === 'admin' && (
              <span className="team-filter-access-badge admin" title="Admin access">
                👑
              </span>
            )}
            {option.accessLevel === 'maintainer' && (
              <span className="team-filter-access-badge maintainer" title="Maintainer access">
                🔧
              </span>
            )}
          </div>

          {(showMemberCounts || showActivityIndicators) && (
            <div className="team-filter-dropdown__option-meta">
              {showMemberCounts && (
                <span>
                  {option.memberCount} member{option.memberCount !== 1 ? 's' : ''}
                </span>
              )}
              {showActivityIndicators && option.activeMembers > 0 && (
                <span className="team-filter-activity-indicator">
                  <div className={`activity-dot ${getActivityStatus(option.activityRatio)}`} />
                  {option.activeMembers} active
                </span>
              )}
            </div>
          )}
        </div>

        <div className="team-filter-dropdown__option-id">
          <code>{option.team.teamId.substring(0, 6)}...</code>
        </div>
      </div>
    </button>
  );
}, (prevProps, nextProps) => {
  // Custom comparison for optimal performance
  return (
    prevProps.option === nextProps.option &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.showMemberCounts === nextProps.showMemberCounts &&
    prevProps.showActivityIndicators === nextProps.showActivityIndicators &&
    prevProps.onSelect === nextProps.onSelect
  );
});

/**
 * Team Filter Dropdown Component (Optimized)
 */
const TeamFilterDropdownComponent = function TeamFilterDropdown({
  selectedTeamId,
  onTeamChange,
  disabled = false,
  showAllTeamsOption = true,
  showMemberCounts = true,
  showActivityIndicators = true,
  className = '',
  placeholder = 'Select team...',
  maxHeight = '300px',
  enableSearch = true,
  customFilter
}: TeamFilterDropdownProps) {
  const { state } = useOrganizationalContext();
  const { useTeamMembership } = useOrganizationalData();
  const { createHoverHandlers } = useHoverPrefetch();

  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Load team data with caching
  const {
    data: teams,
    error,
    isLoading: loading,
    refetch: refreshTeams
  } = useTeamData(undefined, {
    refetchOnWindowFocus: false,
    refetchInterval: 5 * 60 * 1000, // Refresh every 5 minutes
    staleTime: 2 * 60 * 1000 // Consider stale after 2 minutes
  });

  // Process team options with access levels and activity (optimized)
  const teamOptions = useExpensiveMemo((): TeamOption[] => {
    if (!teams || !Array.isArray(teams)) return [];

    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const currentOperator = state.currentOperator;

    return teams.map(team => {
      // Calculate activity metrics
      const activeMembers = team.members.filter(
        m => m.lastActivity && new Date(m.lastActivity) > oneDayAgo
      ).length;

      // Get current user's access level to this team
      const membership = team.members.find(m => m.operatorId === currentOperator);
      const accessLevel = membership?.accessLevel || 'observer';

      return {
        team,
        accessLevel,
        memberCount: team.members.length,
        activeMembers,
        activityRatio: team.members.length > 0 ? activeMembers / team.members.length : 0
      };
    });
  }, [teams, state.currentOperator], 'TeamOptions Processing');

  // Filter teams based on search query (optimized)
  const filteredTeamOptions = useExpensiveMemo(() => {
    if (!searchQuery) return teamOptions;

    const query = searchQuery.toLowerCase().trim();

    return teamOptions.filter(option => {
      if (customFilter) {
        return customFilter(option.team, query);
      }

      // Default filtering logic
      const teamName = (option.team.teamName || '').toLowerCase();
      const teamId = option.team.teamId.toLowerCase();

      return teamName.includes(query) ||
             teamId.includes(query) ||
             teamId.substring(0, 8).includes(query);
    });
  }, [teamOptions, searchQuery, customFilter], 'Team Filtering');

  // Get selected team info
  const selectedTeam = useMemo(() => {
    return teamOptions.find(option => option.team.teamId === selectedTeamId);
  }, [teamOptions, selectedTeamId]);

  // Handle dropdown toggle (optimized)
  const handleToggle = useStableCallback(() => {
    if (disabled) return;
    setIsOpen(!isOpen);

    // Focus search input when opening
    if (!isOpen && enableSearch) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
    }
  }, [disabled, isOpen, enableSearch]);

  // Handle team selection (optimized)
  const handleTeamSelect = useStableCallback((teamId: string | null) => {
    onTeamChange(teamId);
    setIsOpen(false);
    setSearchQuery('');
  }, [onTeamChange]);

  // Handle outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchQuery('');
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Handle keyboard navigation (optimized)
  const handleKeyDown = useStableCallback((event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      setIsOpen(false);
      setSearchQuery('');
    }
    if (event.key === 'Enter' && !isOpen) {
      setIsOpen(true);
    }
  }, [isOpen]);

  // Get activity status for team
  const getActivityStatus = (activityRatio: number): string => {
    if (activityRatio >= 0.5) return 'high';
    if (activityRatio >= 0.2) return 'medium';
    return 'low';
  };

  // Format team display name
  const formatTeamName = (team: TeamMembership): string => {
    return team.teamName || team.teamId.substring(0, 8);
  };

  const dropdownClasses = [
    'team-filter-dropdown',
    isOpen ? 'open' : 'closed',
    disabled ? 'disabled' : '',
    error ? 'error' : '',
    loading ? 'loading' : '',
    className
  ].filter(Boolean).join(' ');

  return (
    <div className={dropdownClasses} ref={dropdownRef}>
      {/* Dropdown Button */}
      <button
        className="team-filter-dropdown__button"
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        title={selectedTeam ?
          `Team: ${formatTeamName(selectedTeam.team)} (${selectedTeam.memberCount} members)` :
          placeholder
        }
      >
        <div className="team-filter-dropdown__button-content">
          <div className="team-filter-dropdown__icon">
            👥
          </div>

          <div className="team-filter-dropdown__text">
            {selectedTeam ? (
              <>
                <div className="team-filter-dropdown__selected-name">
                  {formatTeamName(selectedTeam.team)}
                </div>
                {showMemberCounts && (
                  <div className="team-filter-dropdown__selected-meta">
                    {selectedTeam.memberCount} member{selectedTeam.memberCount !== 1 ? 's' : ''}
                    {showActivityIndicators && selectedTeam.activeMembers > 0 && (
                      <span className="team-filter-dropdown__activity-dot">
                        <div className={`activity-dot ${getActivityStatus(selectedTeam.activityRatio)}`} />
                        {selectedTeam.activeMembers} active
                      </span>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="team-filter-dropdown__placeholder">
                {placeholder}
              </div>
            )}
          </div>
        </div>

        <div className="team-filter-dropdown__arrow">
          {loading ? (
            <div className="team-filter-loading-spinner" />
          ) : (
            <span className={`team-filter-arrow ${isOpen ? 'up' : 'down'}`}>
              ▼
            </span>
          )}
        </div>
      </button>

      {/* Dropdown Content */}
      {isOpen && (
        <div className="team-filter-dropdown__content" style={{ maxHeight }}>
          {/* Search Input */}
          {enableSearch && (
            <div className="team-filter-dropdown__search">
              <input
                ref={searchInputRef}
                type="text"
                className="team-filter-dropdown__search-input"
                placeholder="Search teams..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <div className="team-filter-dropdown__search-icon">
                🔍
              </div>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="team-filter-dropdown__error">
              <div className="team-filter-dropdown__error-icon">⚠️</div>
              <div className="team-filter-dropdown__error-message">
                {error.message || String(error)}
              </div>
              <button
                className="team-filter-dropdown__retry"
                onClick={refreshTeams}
                type="button"
              >
                Retry
              </button>
            </div>
          )}

          {/* Loading State */}
          {loading && (
            <div className="team-filter-dropdown__loading">
              <div className="team-filter-loading-spinner" />
              <div className="team-filter-dropdown__loading-text">
                Loading teams...
              </div>
            </div>
          )}

          {/* Team Options */}
          {!loading && !error && (
            <div className="team-filter-dropdown__options" role="listbox">
              {/* All Teams Option */}
              {showAllTeamsOption && (
                <button
                  className={`team-filter-dropdown__option ${!selectedTeamId ? 'selected' : ''}`}
                  onClick={() => handleTeamSelect(null)}
                  role="option"
                  aria-selected={!selectedTeamId}
                >
                  <div className="team-filter-dropdown__option-content">
                    <div className="team-filter-dropdown__option-icon">
                      🌐
                    </div>
                    <div className="team-filter-dropdown__option-text">
                      <div className="team-filter-dropdown__option-name">
                        All Teams
                      </div>
                      <div className="team-filter-dropdown__option-meta">
                        View traces from all teams
                      </div>
                    </div>
                  </div>
                </button>
              )}

              {/* Individual Team Options */}
              {filteredTeamOptions.map((option) => {
                const hoverHandlers = createHoverHandlers(
                  option.team.teamId,
                  'team',
                  { priority: 'normal' }
                );

                return (
                  <button
                    key={option.team.teamId}
                    className={`team-filter-dropdown__option ${
                      selectedTeamId === option.team.teamId ? 'selected' : ''
                    }`}
                    onClick={() => handleTeamSelect(option.team.teamId)}
                    role="option"
                    aria-selected={selectedTeamId === option.team.teamId}
                    {...hoverHandlers}
                  >
                  <div className="team-filter-dropdown__option-content">
                    <div className="team-filter-dropdown__option-icon">
                      👥
                    </div>

                    <div className="team-filter-dropdown__option-text">
                      <div className="team-filter-dropdown__option-name">
                        {formatTeamName(option.team)}
                        {option.accessLevel === 'admin' && (
                          <span className="team-filter-access-badge admin" title="Admin access">
                            👑
                          </span>
                        )}
                        {option.accessLevel === 'maintainer' && (
                          <span className="team-filter-access-badge maintainer" title="Maintainer access">
                            🔧
                          </span>
                        )}
                      </div>

                      {(showMemberCounts || showActivityIndicators) && (
                        <div className="team-filter-dropdown__option-meta">
                          {showMemberCounts && (
                            <span>
                              {option.memberCount} member{option.memberCount !== 1 ? 's' : ''}
                            </span>
                          )}
                          {showActivityIndicators && option.activeMembers > 0 && (
                            <span className="team-filter-activity-indicator">
                              <div className={`activity-dot ${getActivityStatus(option.activityRatio)}`} />
                              {option.activeMembers} active
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="team-filter-dropdown__option-id">
                      <code>{option.team.teamId.substring(0, 6)}...</code>
                    </div>
                  </div>
                </button>
                );
              })}

              {/* No Results */}
              {filteredTeamOptions.length === 0 && searchQuery && (
                <div className="team-filter-dropdown__no-results">
                  <div className="team-filter-dropdown__no-results-icon">🔍</div>
                  <div className="team-filter-dropdown__no-results-message">
                    No teams found for "{searchQuery}"
                  </div>
                </div>
              )}

              {/* No Teams Available */}
              {(!teams || teams.length === 0) && !loading && !error && (
                <div className="team-filter-dropdown__empty">
                  <div className="team-filter-dropdown__empty-icon">👥</div>
                  <div className="team-filter-dropdown__empty-message">
                    No teams available
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Export optimized component with memo
export const TeamFilterDropdown = memo(TeamFilterDropdownComponent, (prevProps, nextProps) => {
  // Custom comparison for optimal performance
  return (
    prevProps.selectedTeamId === nextProps.selectedTeamId &&
    prevProps.disabled === nextProps.disabled &&
    prevProps.showAllTeamsOption === nextProps.showAllTeamsOption &&
    prevProps.showMemberCounts === nextProps.showMemberCounts &&
    prevProps.showActivityIndicators === nextProps.showActivityIndicators &&
    prevProps.placeholder === nextProps.placeholder &&
    prevProps.maxHeight === nextProps.maxHeight &&
    prevProps.enableSearch === nextProps.enableSearch &&
    prevProps.className === nextProps.className &&
    prevProps.onTeamChange === nextProps.onTeamChange &&
    prevProps.customFilter === nextProps.customFilter
  );
});

// Export default for easy importing
export default TeamFilterDropdown;