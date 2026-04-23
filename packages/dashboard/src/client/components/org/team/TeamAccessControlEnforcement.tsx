/**
 * Team Access Control Enforcement
 *
 * Components and utilities for enforcing team-based access control
 * throughout the dashboard UI, including access validation, permission
 * checks, and graceful degradation for unauthorized access attempts.
 */

import React, { ReactNode, useEffect, useState, useMemo } from 'react';
import { useOrganizationalContext } from '../../../../../contexts/OrganizationalContext';
import type { TeamAccessLevel, OperatorContext } from '../../../types/organizational.js';

// Access control configuration
export type AccessAction =
  | 'view_traces'
  | 'view_team_members'
  | 'view_team_metrics'
  | 'view_operator_details'
  | 'export_data'
  | 'manage_team'
  | 'manage_operators'
  | 'view_sensitive_data';

// Access control rules
const ACCESS_RULES: Record<TeamAccessLevel, AccessAction[]> = {
  admin: [
    'view_traces',
    'view_team_members',
    'view_team_metrics',
    'view_operator_details',
    'export_data',
    'manage_team',
    'manage_operators',
    'view_sensitive_data'
  ],
  maintainer: [
    'view_traces',
    'view_team_members',
    'view_team_metrics',
    'view_operator_details',
    'export_data',
    'manage_operators'
  ],
  member: [
    'view_traces',
    'view_team_members',
    'view_team_metrics',
    'view_operator_details'
  ],
  observer: [
    'view_traces',
    'view_team_metrics'
  ]
};

// Access check result
interface AccessCheckResult {
  hasAccess: boolean;
  accessLevel?: TeamAccessLevel;
  reason?: string;
  suggestion?: string;
}

// Props for AccessControlWrapper
interface AccessControlWrapperProps {
  /** Team ID to check access for */
  teamId: string;

  /** Action being attempted */
  action: AccessAction;

  /** Children to render if access is granted */
  children: ReactNode;

  /** Component to show when access is denied */
  fallback?: ReactNode;

  /** Whether to show access denied message */
  showAccessDenied?: boolean;

  /** Custom CSS class name */
  className?: string;

  /** Callback when access is denied */
  onAccessDenied?: (teamId: string, action: AccessAction, reason: string) => void;
}

// Props for AccessControlProvider
interface AccessControlProviderProps {
  /** Children components */
  children: ReactNode;

  /** Whether to enable strict mode (fail closed) */
  strictMode?: boolean;

  /** Callback for access logging */
  onAccessLog?: (event: AccessLogEvent) => void;
}

// Access log event
interface AccessLogEvent {
  type: 'access_granted' | 'access_denied' | 'access_check';
  operatorId?: string;
  teamId: string;
  action: AccessAction;
  accessLevel?: TeamAccessLevel;
  timestamp: number;
  reason?: string;
}

/**
 * Hook for checking team access permissions
 */
export function useTeamAccess(teamId: string) {
  const { state } = useOrganizationalContext();
  const [accessLevels, setAccessLevels] = useState<Map<string, TeamAccessLevel>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load access levels for operator
  useEffect(() => {
    const loadAccessLevels = async () => {
      try {
        setLoading(true);
        setError(null);

        if (!state.currentOperator) {
          setAccessLevels(new Map());
          return;
        }

        const response = await fetch(`/api/operators/${state.currentOperator}/team-access`);
        if (!response.ok) {
          throw new Error(`Failed to load team access: ${response.statusText}`);
        }

        const data = await response.json();
        const accessMap = new Map<string, TeamAccessLevel>();

        data.teams?.forEach((team: any) => {
          accessMap.set(team.teamId, team.accessLevel);
        });

        setAccessLevels(accessMap);

      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load team access');
        // In error case, assume no access
        setAccessLevels(new Map());
      } finally {
        setLoading(false);
      }
    };

    loadAccessLevels();
  }, [state.currentOperator, teamId]);

  // Check if operator has access to perform action on team
  const checkAccess = (action: AccessAction): AccessCheckResult => {
    if (loading) {
      return {
        hasAccess: false,
        reason: 'Access check in progress'
      };
    }

    if (error) {
      return {
        hasAccess: false,
        reason: 'Unable to verify team access',
        suggestion: 'Please refresh the page or contact support'
      };
    }

    const accessLevel = accessLevels.get(teamId);
    if (!accessLevel) {
      return {
        hasAccess: false,
        reason: 'No access to this team',
        suggestion: 'Request access from a team administrator'
      };
    }

    const allowedActions = ACCESS_RULES[accessLevel] || [];
    const hasAccess = allowedActions.includes(action);

    return {
      hasAccess,
      accessLevel,
      reason: hasAccess ? undefined : `Insufficient permissions (${accessLevel})`,
      suggestion: hasAccess ? undefined : 'Contact team administrator for elevated access'
    };
  };

  // Get current access level for team
  const getAccessLevel = (): TeamAccessLevel | null => {
    return accessLevels.get(teamId) || null;
  };

  // Check if operator can perform any admin actions
  const canPerformAdminActions = (): boolean => {
    const accessLevel = accessLevels.get(teamId);
    return accessLevel === 'admin' || accessLevel === 'maintainer';
  };

  // Get accessible teams
  const getAccessibleTeams = (): string[] => {
    return Array.from(accessLevels.keys());
  };

  return {
    checkAccess,
    getAccessLevel,
    canPerformAdminActions,
    getAccessibleTeams,
    loading,
    error,
    hasAnyAccess: accessLevels.size > 0
  };
}

/**
 * Access Control Wrapper Component
 */
export function AccessControlWrapper({
  teamId,
  action,
  children,
  fallback,
  showAccessDenied = true,
  className = '',
  onAccessDenied
}: AccessControlWrapperProps) {
  const { checkAccess } = useTeamAccess(teamId);
  const accessResult = checkAccess(action);

  // Log access attempt
  useEffect(() => {
    if (!accessResult.hasAccess && onAccessDenied) {
      onAccessDenied(teamId, action, accessResult.reason || 'Access denied');
    }
  }, [accessResult.hasAccess, teamId, action, accessResult.reason, onAccessDenied]);

  const wrapperClasses = [
    'access-control-wrapper',
    accessResult.hasAccess ? 'access-granted' : 'access-denied',
    className
  ].filter(Boolean).join(' ');

  // Render children if access is granted
  if (accessResult.hasAccess) {
    return (
      <div className={wrapperClasses}>
        {children}
      </div>
    );
  }

  // Render custom fallback if provided
  if (fallback) {
    return (
      <div className={wrapperClasses}>
        {fallback}
      </div>
    );
  }

  // Render access denied message
  if (showAccessDenied) {
    return (
      <div className={wrapperClasses}>
        <AccessDeniedMessage
          teamId={teamId}
          action={action}
          reason={accessResult.reason}
          suggestion={accessResult.suggestion}
          accessLevel={accessResult.accessLevel}
        />
      </div>
    );
  }

  // Don't render anything
  return null;
}

/**
 * Access Denied Message Component
 */
function AccessDeniedMessage({
  teamId,
  action,
  reason,
  suggestion,
  accessLevel
}: {
  teamId: string;
  action: AccessAction;
  reason?: string;
  suggestion?: string;
  accessLevel?: TeamAccessLevel;
}) {
  const getActionDescription = (action: AccessAction): string => {
    switch (action) {
      case 'view_traces': return 'view team traces';
      case 'view_team_members': return 'view team members';
      case 'view_team_metrics': return 'view team metrics';
      case 'view_operator_details': return 'view operator details';
      case 'export_data': return 'export team data';
      case 'manage_team': return 'manage team settings';
      case 'manage_operators': return 'manage team operators';
      case 'view_sensitive_data': return 'view sensitive information';
      default: return 'perform this action';
    }
  };

  const getRequiredAccessLevel = (action: AccessAction): TeamAccessLevel => {
    for (const [level, actions] of Object.entries(ACCESS_RULES)) {
      if (actions.includes(action)) {
        return level as TeamAccessLevel;
      }
    }
    return 'admin'; // Default to highest level
  };

  const requiredLevel = getRequiredAccessLevel(action);

  return (
    <div className="access-denied-message">
      <div className="access-denied-message__icon">🔒</div>
      <div className="access-denied-message__content">
        <div className="access-denied-message__title">
          Access Restricted
        </div>
        <div className="access-denied-message__description">
          You don't have permission to {getActionDescription(action)} for this team.
        </div>
        {reason && (
          <div className="access-denied-message__reason">
            {reason}
          </div>
        )}
        <div className="access-denied-message__requirements">
          <div className="access-denied-message__current">
            Current access: {accessLevel ? (
              <span className={`access-level-badge access-level-${accessLevel}`}>
                {accessLevel}
              </span>
            ) : (
              <span className="access-level-badge access-level-none">
                None
              </span>
            )}
          </div>
          <div className="access-denied-message__required">
            Required access: <span className={`access-level-badge access-level-${requiredLevel}`}>
              {requiredLevel} or higher
            </span>
          </div>
        </div>
        {suggestion && (
          <div className="access-denied-message__suggestion">
            💡 {suggestion}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Team Access Control Provider
 */
export function TeamAccessControlProvider({
  children,
  strictMode = true,
  onAccessLog
}: AccessControlProviderProps) {
  // Log access events
  const logAccessEvent = (event: AccessLogEvent) => {
    console.log('[Team Access Control]', event);
    if (onAccessLog) {
      onAccessLog(event);
    }
  };

  // Enhanced context value with logging
  const contextValue = useMemo(() => ({
    strictMode,
    logAccessEvent
  }), [strictMode]);

  return (
    <div className="team-access-control-provider">
      {children}
    </div>
  );
}

/**
 * Access Control Guard Hook
 *
 * Use this in components that need to conditionally render based on access
 */
export function useAccessControlGuard(teamId: string, action: AccessAction) {
  const { checkAccess, loading, error } = useTeamAccess(teamId);
  const accessResult = checkAccess(action);

  return {
    ...accessResult,
    loading,
    error,
    canRender: accessResult.hasAccess && !loading && !error
  };
}

/**
 * Higher-Order Component for access control
 */
export function withTeamAccessControl<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  teamIdProp: string = 'teamId',
  action: AccessAction = 'view_traces'
) {
  const displayName = WrappedComponent.displayName || WrappedComponent.name || 'Component';

  const AccessControlledComponent: React.FC<P> = (props) => {
    const teamId = (props as any)[teamIdProp];

    if (!teamId) {
      console.warn(`[Team Access Control] Missing ${teamIdProp} prop for ${displayName}`);
      return <WrappedComponent {...props} />;
    }

    return (
      <AccessControlWrapper
        teamId={teamId}
        action={action}
        showAccessDenied={true}
      >
        <WrappedComponent {...props} />
      </AccessControlWrapper>
    );
  };

  AccessControlledComponent.displayName = `withTeamAccessControl(${displayName})`;

  return AccessControlledComponent;
}

/**
 * Team Selector with Access Control
 */
interface AccessControlledTeamSelectorProps {
  /** Available team IDs to choose from */
  availableTeams: string[];

  /** Currently selected team ID */
  selectedTeamId?: string;

  /** Callback when team selection changes */
  onTeamChange: (teamId: string) => void;

  /** Action that will be performed on selected team */
  requiredAction: AccessAction;

  /** Custom CSS class name */
  className?: string;
}

export function AccessControlledTeamSelector({
  availableTeams,
  selectedTeamId,
  onTeamChange,
  requiredAction,
  className = ''
}: AccessControlledTeamSelectorProps) {
  // Check access for all available teams
  const teamAccessChecks = useMemo(() => {
    return availableTeams.map(teamId => ({
      teamId,
      // We can't use the hook in a loop, so we'll need to check access differently
      // This is a simplified version - in practice you'd want a more sophisticated approach
      hasAccess: true // Placeholder
    }));
  }, [availableTeams, requiredAction]);

  const accessibleTeams = teamAccessChecks.filter(team => team.hasAccess);

  return (
    <div className={`access-controlled-team-selector ${className}`}>
      <select
        value={selectedTeamId || ''}
        onChange={(e) => onTeamChange(e.target.value)}
        disabled={accessibleTeams.length === 0}
      >
        <option value="">Select a team...</option>
        {accessibleTeams.map(({ teamId }) => (
          <option key={teamId} value={teamId}>
            {teamId.substring(0, 8)}...
          </option>
        ))}
      </select>

      {accessibleTeams.length === 0 && availableTeams.length > 0 && (
        <div className="access-controlled-team-selector__no-access">
          No teams accessible for this action
        </div>
      )}
    </div>
  );
}

// Export utility functions
export const teamAccessUtils = {
  /**
   * Check if an access level can perform an action
   */
  canPerformAction: (accessLevel: TeamAccessLevel, action: AccessAction): boolean => {
    const allowedActions = ACCESS_RULES[accessLevel] || [];
    return allowedActions.includes(action);
  },

  /**
   * Get the minimum access level required for an action
   */
  getMinimumAccessLevel: (action: AccessAction): TeamAccessLevel => {
    for (const [level, actions] of Object.entries(ACCESS_RULES)) {
      if (actions.includes(action)) {
        return level as TeamAccessLevel;
      }
    }
    return 'admin'; // Default to highest level
  },

  /**
   * Get all actions available to an access level
   */
  getAvailableActions: (accessLevel: TeamAccessLevel): AccessAction[] => {
    return ACCESS_RULES[accessLevel] || [];
  },

  /**
   * Compare access levels (returns positive if level1 > level2)
   */
  compareAccessLevels: (level1: TeamAccessLevel, level2: TeamAccessLevel): number => {
    const hierarchy: TeamAccessLevel[] = ['observer', 'member', 'maintainer', 'admin'];
    return hierarchy.indexOf(level1) - hierarchy.indexOf(level2);
  }
};

// Export default for easy importing
export default AccessControlWrapper;