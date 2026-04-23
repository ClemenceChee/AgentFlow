/**
 * Team Membership Display
 *
 * Shows team membership information including team badges,
 * access levels, member counts, and team-related indicators
 * for organizational context visualization.
 */

import { useEffect, useState } from 'react';
import { useOrganizationalData } from '../../../hooks/organizational/index.js';
import type { TeamAccessLevel, TeamMembership } from '../../../types/organizational.js';

// Component props
interface TeamMembershipDisplayProps {
  /** Team ID to display membership for */
  teamId: string;

  /** Current operator ID for access level context */
  operatorId?: string;

  /** Whether to show compact version */
  compact?: boolean;

  /** Custom CSS class name */
  className?: string;

  /** Whether to show member count and activity indicators */
  showActivity?: boolean;

  /** Whether to show access level details */
  showAccessLevel?: boolean;

  /** Callback when team is clicked for filtering */
  onTeamClick?: (teamId: string) => void;

  /** Callback when member list is requested */
  onViewMembers?: (teamId: string) => void;
}

// Access level configuration
const ACCESS_LEVEL_CONFIG: Record<
  TeamAccessLevel,
  {
    label: string;
    icon: string;
    description: string;
    color: string;
    priority: number;
  }
> = {
  admin: {
    label: 'Admin',
    icon: '👑',
    description: 'Full team administration rights',
    color: 'var(--fail)',
    priority: 4,
  },
  maintainer: {
    label: 'Maintainer',
    icon: '🔧',
    description: 'Can manage team settings and members',
    color: 'var(--warn)',
    priority: 3,
  },
  member: {
    label: 'Member',
    icon: '👤',
    description: 'Standard team member',
    color: 'var(--org-primary)',
    priority: 2,
  },
  observer: {
    label: 'Observer',
    icon: '👁️',
    description: 'Read-only access to team resources',
    color: 'var(--t3)',
    priority: 1,
  },
};

/**
 * Team Membership Display Component
 */
export function TeamMembershipDisplay({
  teamId,
  operatorId,
  compact = false,
  className = '',
  showActivity = true,
  showAccessLevel = true,
  onTeamClick,
  onViewMembers,
}: TeamMembershipDisplayProps) {
  const { useTeamMembership } = useOrganizationalData();
  const [membership, setMembership] = useState<TeamMembership | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch team membership data
  useEffect(() => {
    let mounted = true;

    const fetchMembership = async () => {
      try {
        setLoading(true);
        setError(null);

        // Simulate API call - replace with actual hook or API call
        const response = await fetch(`/api/teams/${teamId}/membership`);
        if (!response.ok) {
          throw new Error(`Failed to fetch team membership: ${response.statusText}`);
        }

        const membershipData = await response.json();

        if (mounted) {
          setMembership(membershipData);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Failed to load team membership');
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    fetchMembership();

    return () => {
      mounted = false;
    };
  }, [teamId]);

  // Get current operator's access level
  const getCurrentOperatorAccess = (): TeamAccessLevel | null => {
    if (!membership || !operatorId) return null;
    const member = membership.members.find((m) => m.operatorId === operatorId);
    return member?.accessLevel || null;
  };

  // Format member count for display
  const formatMemberCount = (count: number): string => {
    if (count === 0) return 'No members';
    if (count === 1) return '1 member';
    return `${count} members`;
  };

  // Get team activity status
  const getTeamActivityStatus = () => {
    if (!membership || !showActivity) return null;

    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const activeMembers = membership.members.filter(
      (m) => m.lastActivity && new Date(m.lastActivity) > oneDayAgo,
    ).length;

    return {
      activeMembers,
      totalMembers: membership.members.length,
      activityRatio: membership.members.length > 0 ? activeMembers / membership.members.length : 0,
    };
  };

  const cardClasses = ['org-card', 'team-membership-display', compact ? 'compact' : '', className]
    .filter(Boolean)
    .join(' ');

  // Loading state
  if (loading) {
    return (
      <div className={cardClasses}>
        <div className="org-card__header">
          <div className="org-card__title">
            <span className="team-membership-display__icon">👥</span>
            Team Membership
          </div>
        </div>
        <div className="org-card__content">
          <div className="team-membership-loading">
            <div className="team-membership-loading__spinner" />
            <div className="team-membership-loading__text">Loading team information...</div>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={cardClasses}>
        <div className="org-card__header">
          <div className="org-card__title">
            <span className="team-membership-display__icon">👥</span>
            Team Membership
          </div>
        </div>
        <div className="org-card__content">
          <div className="team-membership-error">
            <div className="team-membership-error__icon">⚠️</div>
            <div className="team-membership-error__message">Failed to load team membership</div>
            <div className="team-membership-error__details">{error}</div>
          </div>
        </div>
      </div>
    );
  }

  // No membership data
  if (!membership) {
    return (
      <div className={cardClasses}>
        <div className="org-card__header">
          <div className="org-card__title">
            <span className="team-membership-display__icon">👥</span>
            Team Membership
          </div>
        </div>
        <div className="org-card__content">
          <div className="team-membership-empty">
            <div className="team-membership-empty__icon">🔍</div>
            <div className="team-membership-empty__message">No team information available</div>
          </div>
        </div>
      </div>
    );
  }

  const currentAccess = getCurrentOperatorAccess();
  const activity = getTeamActivityStatus();

  return (
    <div className={cardClasses}>
      <div className="org-card__header">
        <div className="org-card__title">
          <span className="team-membership-display__icon">👥</span>
          Team Membership
        </div>
        {activity && !compact && (
          <div className="team-membership-activity-indicator">
            <div
              className={`team-membership-activity-dot ${
                activity.activityRatio > 0.5
                  ? 'high'
                  : activity.activityRatio > 0.2
                    ? 'medium'
                    : 'low'
              }`}
            />
            <span className="team-membership-activity-text">{activity.activeMembers} active</span>
          </div>
        )}
      </div>

      <div className="org-card__content">
        {/* Team Badge */}
        <div className="team-membership-section">
          <div className="team-membership-team-badge">
            <button
              className={`team-badge ${onTeamClick ? 'clickable' : ''}`}
              onClick={() => onTeamClick?.(teamId)}
              title={onTeamClick ? `Filter by team: ${membership.teamName || teamId}` : undefined}
            >
              <div className="team-badge__header">
                <span className="team-badge__icon">👥</span>
                <span className="team-badge__name">{membership.teamName || teamId}</span>
              </div>
              <div className="team-badge__id">
                <code>{teamId.substring(0, 8)}...</code>
              </div>
            </button>
          </div>
        </div>

        {/* Current Operator Access Level */}
        {currentAccess && showAccessLevel && (
          <div className="team-membership-section">
            <div className="team-membership-section__header">
              <div className="team-membership-section__label">Your Access</div>
            </div>
            <div className="team-membership-section__content">
              <div
                className="team-membership-access-badge"
                style={{ borderColor: ACCESS_LEVEL_CONFIG[currentAccess].color }}
              >
                <span
                  className="team-membership-access-badge__icon"
                  style={{ color: ACCESS_LEVEL_CONFIG[currentAccess].color }}
                >
                  {ACCESS_LEVEL_CONFIG[currentAccess].icon}
                </span>
                <span className="team-membership-access-badge__label">
                  {ACCESS_LEVEL_CONFIG[currentAccess].label}
                </span>
              </div>
              {!compact && (
                <div className="team-membership-access-description">
                  {ACCESS_LEVEL_CONFIG[currentAccess].description}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Team Statistics */}
        <div className="team-membership-section">
          <div className="team-membership-section__header">
            <div className="team-membership-section__label">Team Info</div>
          </div>
          <div className="team-membership-section__content">
            <div className="team-membership-stats">
              <div className="team-membership-stat">
                <div className="team-membership-stat__icon">👤</div>
                <div className="team-membership-stat__value">
                  {formatMemberCount(membership.members.length)}
                </div>
              </div>

              {activity && showActivity && (
                <div className="team-membership-stat">
                  <div className="team-membership-stat__icon">📈</div>
                  <div className="team-membership-stat__value">
                    {activity.activeMembers}/{activity.totalMembers} active
                  </div>
                </div>
              )}

              {membership.createdAt && (
                <div className="team-membership-stat">
                  <div className="team-membership-stat__icon">📅</div>
                  <div className="team-membership-stat__value">
                    Created {new Date(membership.createdAt).toLocaleDateString()}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Access Levels Summary */}
        {!compact && membership.members.length > 0 && (
          <div className="team-membership-section">
            <div className="team-membership-section__header">
              <div className="team-membership-section__label">Access Levels</div>
            </div>
            <div className="team-membership-section__content">
              <div className="team-membership-access-distribution">
                {Object.entries(
                  membership.members.reduce(
                    (acc, member) => {
                      acc[member.accessLevel] = (acc[member.accessLevel] || 0) + 1;
                      return acc;
                    },
                    {} as Record<TeamAccessLevel, number>,
                  ),
                )
                  .sort(([, countA], [, countB]) => countB - countA)
                  .map(([level, count]) => {
                    const config = ACCESS_LEVEL_CONFIG[level as TeamAccessLevel];
                    return (
                      <div
                        key={level}
                        className="team-membership-access-group"
                        style={{ borderColor: config.color }}
                      >
                        <span
                          className="team-membership-access-group__icon"
                          style={{ color: config.color }}
                        >
                          {config.icon}
                        </span>
                        <span className="team-membership-access-group__label">{config.label}</span>
                        <span className="team-membership-access-group__count">{count}</span>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        {onViewMembers && !compact && (
          <div className="team-membership-actions">
            <button className="team-membership-action" onClick={() => onViewMembers(teamId)}>
              <span className="team-membership-action__icon">👥</span>
              <span className="team-membership-action__label">View All Members</span>
            </button>
          </div>
        )}

        {/* Compact Mode Summary */}
        {compact && (
          <div className="team-membership-compact-summary">
            <div className="team-membership-compact-item">
              <span className="team-membership-compact-icon">👤</span>
              <span className="team-membership-compact-text">{membership.members.length}</span>
            </div>

            {currentAccess && (
              <div className="team-membership-compact-item">
                <span
                  className="team-membership-compact-icon"
                  style={{ color: ACCESS_LEVEL_CONFIG[currentAccess].color }}
                >
                  {ACCESS_LEVEL_CONFIG[currentAccess].icon}
                </span>
                <span className="team-membership-compact-text">
                  {ACCESS_LEVEL_CONFIG[currentAccess].label}
                </span>
              </div>
            )}

            {activity && activity.activeMembers > 0 && (
              <div className="team-membership-compact-item">
                <span className="team-membership-compact-icon">📈</span>
                <span className="team-membership-compact-text">
                  {activity.activeMembers} active
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Export default for easy importing
export default TeamMembershipDisplay;
