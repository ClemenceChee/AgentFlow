/**
 * Session Navigation Links
 *
 * Navigation component that provides links between correlated sessions
 * while preserving application state, filter settings, and user context.
 * Enables seamless jumping between related organizational sessions.
 */

import { useCallback, useMemo, useState } from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import type { CorrelationType, SessionCorrelation } from '../../../types/organizational.js';

// Component props
interface SessionNavigationLinksProps {
  /** Current session ID */
  currentSessionId: string;

  /** Array of session correlations for navigation */
  correlations: SessionCorrelation[];

  /** Whether to show compact navigation */
  compact?: boolean;

  /** Custom CSS class name */
  className?: string;

  /** Maximum number of navigation links to show */
  maxLinks?: number;

  /** Whether to preserve current filters when navigating */
  preserveFilters?: boolean;

  /** Whether to preserve search state */
  preserveSearch?: boolean;

  /** Whether to preserve organizational context state */
  preserveOrgContext?: boolean;

  /** Callback when navigation is about to occur */
  onNavigate?: (
    sessionId: string,
    correlationType: CorrelationType,
    preserved: NavigationState,
  ) => void;

  /** Custom navigation handler (overrides default routing) */
  customNavigationHandler?: (sessionId: string, state: NavigationState) => void;
}

// Navigation state that can be preserved
interface NavigationState {
  teamFilter?: string;
  searchQuery?: string;
  timeRange?: string;
  sortOrder?: string;
  viewMode?: string;
  orgContextExpanded?: boolean;
  correlationFilters?: string[];
  confidenceThreshold?: number;
}

// Navigation link configuration
const NAVIGATION_CONFIG: Record<
  CorrelationType,
  {
    priority: number;
    shortLabel: string;
    fullLabel: string;
    description: string;
    icon: string;
    color: string;
  }
> = {
  operator_continuity: {
    priority: 5,
    shortLabel: 'Same Op',
    fullLabel: 'Same Operator',
    description: 'Continue session with same operator',
    icon: '👤',
    color: 'var(--org-operator)',
  },
  solution_pattern: {
    priority: 4,
    shortLabel: 'Solution',
    fullLabel: 'Similar Solution',
    description: 'Session with similar solution approach',
    icon: '💡',
    color: 'var(--org-solution)',
  },
  problem_similarity: {
    priority: 3,
    shortLabel: 'Problem',
    fullLabel: 'Similar Problem',
    description: 'Session addressing similar problem',
    icon: '🎯',
    color: 'var(--org-problem)',
  },
  team_context: {
    priority: 2,
    shortLabel: 'Team',
    fullLabel: 'Team Context',
    description: 'Related session within team',
    icon: '👥',
    color: 'var(--org-team)',
  },
  cross_instance: {
    priority: 2,
    shortLabel: 'Cross',
    fullLabel: 'Cross Instance',
    description: 'Session from different Claude Code instance',
    icon: '🔄',
    color: 'var(--org-cross-instance)',
  },
  temporal_proximity: {
    priority: 1,
    shortLabel: 'Recent',
    fullLabel: 'Recent Session',
    description: 'Session from around the same time',
    icon: '⏰',
    color: 'var(--org-temporal)',
  },
};

/**
 * Session Navigation Links Component
 */
export function SessionNavigationLinks({
  currentSessionId,
  correlations,
  compact = false,
  className = '',
  maxLinks = 6,
  preserveFilters = true,
  preserveSearch = true,
  preserveOrgContext = true,
  onNavigate,
  customNavigationHandler,
}: SessionNavigationLinksProps) {
  const history = useHistory();
  const location = useLocation();
  const [isNavigating, setIsNavigating] = useState<string | null>(null);

  // Extract current navigation state from URL and app state
  const getCurrentNavigationState = useCallback((): NavigationState => {
    const urlParams = new URLSearchParams(location.search);

    return {
      teamFilter: preserveFilters ? urlParams.get('team') || undefined : undefined,
      searchQuery: preserveSearch ? urlParams.get('q') || undefined : undefined,
      timeRange: preserveFilters ? urlParams.get('timeRange') || undefined : undefined,
      sortOrder: preserveFilters ? urlParams.get('sort') || undefined : undefined,
      viewMode: preserveFilters ? urlParams.get('view') || undefined : undefined,
      orgContextExpanded: preserveOrgContext
        ? urlParams.get('orgExpanded') === 'true' || undefined
        : undefined,
      correlationFilters: preserveFilters
        ? urlParams.get('correlationTypes')?.split(',') || undefined
        : undefined,
      confidenceThreshold: preserveFilters
        ? parseFloat(urlParams.get('confidence') || '0.3') || undefined
        : undefined,
    };
  }, [location.search, preserveFilters, preserveSearch, preserveOrgContext]);

  // Build navigation URL with preserved state
  const buildNavigationUrl = useCallback(
    (sessionId: string, state: NavigationState): string => {
      const baseUrl = `/traces/${sessionId}`;
      const params = new URLSearchParams();

      // Add preserved state parameters
      if (state.teamFilter) params.set('team', state.teamFilter);
      if (state.searchQuery) params.set('q', state.searchQuery);
      if (state.timeRange) params.set('timeRange', state.timeRange);
      if (state.sortOrder) params.set('sort', state.sortOrder);
      if (state.viewMode) params.set('view', state.viewMode);
      if (state.orgContextExpanded) params.set('orgExpanded', 'true');
      if (state.correlationFilters?.length) {
        params.set('correlationTypes', state.correlationFilters.join(','));
      }
      if (state.confidenceThreshold !== undefined && state.confidenceThreshold !== 0.3) {
        params.set('confidence', state.confidenceThreshold.toString());
      }

      // Add navigation context
      params.set('from', currentSessionId);
      params.set('navType', 'correlation');

      const queryString = params.toString();
      return queryString ? `${baseUrl}?${queryString}` : baseUrl;
    },
    [currentSessionId],
  );

  // Handle navigation to correlated session
  const handleNavigate = useCallback(
    async (correlation: SessionCorrelation) => {
      const sessionId = correlation.correlatedSessionId;
      setIsNavigating(sessionId);

      try {
        const preservedState = getCurrentNavigationState();

        // Call onNavigate callback if provided
        if (onNavigate) {
          onNavigate(sessionId, correlation.type, preservedState);
        }

        // Use custom navigation handler if provided
        if (customNavigationHandler) {
          customNavigationHandler(sessionId, preservedState);
          return;
        }

        // Default navigation using React Router
        const navigationUrl = buildNavigationUrl(sessionId, preservedState);
        history.push(navigationUrl);
      } catch (error) {
        console.error('Navigation error:', error);
        // Fallback to simple navigation
        history.push(`/traces/${sessionId}`);
      } finally {
        setIsNavigating(null);
      }
    },
    [getCurrentNavigationState, onNavigate, customNavigationHandler, buildNavigationUrl, history],
  );

  // Sort and filter correlations for navigation
  const navigationCorrelations = useMemo(() => {
    return correlations
      .filter(
        (correlation) =>
          correlation.correlatedSessionId !== currentSessionId && correlation.confidence >= 0.3, // Minimum confidence for navigation
      )
      .sort((a, b) => {
        // Sort by priority first, then confidence
        const priorityDiff =
          NAVIGATION_CONFIG[b.type].priority - NAVIGATION_CONFIG[a.type].priority;
        if (priorityDiff !== 0) return priorityDiff;
        return b.confidence - a.confidence;
      })
      .slice(0, maxLinks);
  }, [correlations, currentSessionId, maxLinks]);

  // Format session ID for display
  const formatSessionId = (sessionId: string): string => {
    return sessionId.substring(0, compact ? 6 : 8);
  };

  const containerClasses = ['session-navigation-links', compact ? 'compact' : '', className]
    .filter(Boolean)
    .join(' ');

  // No correlations available for navigation
  if (navigationCorrelations.length === 0) {
    return (
      <div className={containerClasses}>
        <div className="session-navigation-empty">
          <div className="session-navigation-empty__icon">🔗</div>
          <div className="session-navigation-empty__text">No related sessions</div>
        </div>
      </div>
    );
  }

  return (
    <div className={containerClasses}>
      <div className="session-navigation-header">
        <div className="session-navigation-title">
          <span className="session-navigation-title__icon">🔗</span>
          <span className="session-navigation-title__text">
            {compact ? 'Related' : 'Related Sessions'}
          </span>
          <span className="session-navigation-count">{navigationCorrelations.length}</span>
        </div>
      </div>

      <div className="session-navigation-list">
        {navigationCorrelations.map((correlation) => {
          const config = NAVIGATION_CONFIG[correlation.type];
          const sessionId = correlation.correlatedSessionId;
          const isCurrentlyNavigating = isNavigating === sessionId;

          return (
            <button
              key={sessionId}
              className={`session-navigation-link ${isCurrentlyNavigating ? 'navigating' : ''}`}
              onClick={() => handleNavigate(correlation)}
              disabled={isCurrentlyNavigating}
              title={`${config.description} (${Math.round(correlation.confidence * 100)}% confidence)`}
              style={{ borderColor: config.color }}
            >
              {/* Navigation Link Icon */}
              <div className="session-navigation-link__icon-container">
                {isCurrentlyNavigating ? (
                  <div className="session-navigation-loading-spinner" />
                ) : (
                  <span className="session-navigation-link__icon" style={{ color: config.color }}>
                    {config.icon}
                  </span>
                )}
              </div>

              {/* Navigation Link Content */}
              <div className="session-navigation-link__content">
                <div className="session-navigation-link__header">
                  <div className="session-navigation-link__type">
                    {compact ? config.shortLabel : config.fullLabel}
                  </div>
                  <div className="session-navigation-link__confidence">
                    {Math.round(correlation.confidence * 100)}%
                  </div>
                </div>

                <div className="session-navigation-link__session-info">
                  <code className="session-navigation-link__session-id">
                    {formatSessionId(sessionId)}
                  </code>

                  {correlation.metadata?.timestamp && !compact && (
                    <div className="session-navigation-link__timestamp">
                      {new Date(correlation.metadata.timestamp).toLocaleDateString()}
                    </div>
                  )}
                </div>
              </div>

              {/* Navigation Arrow */}
              <div className="session-navigation-link__arrow">→</div>
            </button>
          );
        })}
      </div>

      {/* State Preservation Indicator */}
      {(preserveFilters || preserveSearch || preserveOrgContext) && !compact && (
        <div className="session-navigation-footer">
          <div className="session-navigation-preservation-info">
            <span className="session-navigation-preservation-icon">💾</span>
            <span className="session-navigation-preservation-text">
              Navigation preserves
              {[
                preserveFilters && 'filters',
                preserveSearch && 'search',
                preserveOrgContext && 'context',
              ]
                .filter(Boolean)
                .join(', ')}
            </span>
          </div>
        </div>
      )}

      {/* Compact Navigation Summary */}
      {compact && navigationCorrelations.length > 3 && (
        <div className="session-navigation-overflow">
          <div className="session-navigation-overflow__indicator">
            +{navigationCorrelations.length - 3} more
          </div>
        </div>
      )}
    </div>
  );
}

// Export utility functions for external use
export const sessionNavigationUtils = {
  buildNavigationUrl: (
    sessionId: string,
    currentUrl: string,
    preserveState: boolean = true,
  ): string => {
    if (!preserveState) {
      return `/traces/${sessionId}`;
    }

    const url = new URL(currentUrl, window.location.origin);
    const params = new URLSearchParams(url.search);

    // Add navigation context
    params.set('from', url.pathname.split('/').pop() || '');
    params.set('navType', 'correlation');

    return `/traces/${sessionId}?${params.toString()}`;
  },

  extractNavigationContext: (
    url: string,
  ): {
    from?: string;
    navType?: string;
  } => {
    const urlObj = new URL(url, window.location.origin);
    const params = new URLSearchParams(urlObj.search);

    return {
      from: params.get('from') || undefined,
      navType: params.get('navType') || undefined,
    };
  },
};

// Export default for easy importing
export default SessionNavigationLinks;
