/**
 * Operator Context Card
 *
 * Displays operator identity information including operator ID,
 * team membership, session details, and instance information
 * in a structured card format.
 */

import React from 'react';
import type { OperatorContext } from '../../../types/organizational.js';

// Component props
interface OperatorContextCardProps {
  /** The operator context data to display */
  operatorContext: OperatorContext;

  /** Whether to show a compact version of the card */
  compact?: boolean;

  /** Custom CSS class name */
  className?: string;

  /** Whether to show detailed technical information */
  showTechnicalDetails?: boolean;

  /** Callback when operator is clicked (for navigation/drill-down) */
  onOperatorClick?: (operatorId: string) => void;

  /** Callback when team is clicked (for team filtering) */
  onTeamClick?: (teamId: string) => void;
}

/**
 * Operator Context Card Component
 */
export function OperatorContextCard({
  operatorContext,
  compact = false,
  className = '',
  showTechnicalDetails = false,
  onOperatorClick,
  onTeamClick
}: OperatorContextCardProps) {
  const {
    operatorId,
    sessionId,
    teamId,
    instanceId,
    timestamp,
    userAgent
  } = operatorContext;

  // Format timestamp for display
  const formatTimestamp = (timestamp?: number): string => {
    if (!timestamp) return 'Unknown time';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  // Extract client type from user agent
  const getClientType = (userAgent?: string): string => {
    if (!userAgent) return 'Unknown';

    const ua = userAgent.toLowerCase();
    if (ua.includes('claude-code-cli')) return 'CLI';
    if (ua.includes('claude-code-desktop')) return 'Desktop';
    if (ua.includes('claude-code-vscode')) return 'VS Code';
    if (ua.includes('claude-code-web')) return 'Web';
    if (ua.includes('electron')) return 'Desktop App';
    return 'Web Browser';
  };

  // Truncate IDs for display
  const truncateId = (id: string, length: number = 8): string => {
    return id.length > length ? `${id.substring(0, length)}...` : id;
  };

  const cardClasses = [
    'org-card',
    'operator-context-card',
    compact ? 'compact' : '',
    className
  ].filter(Boolean).join(' ');

  return (
    <div className={cardClasses}>
      <div className="org-card__header">
        <div className="org-card__title">
          <span className="operator-context-card__icon">👤</span>
          Operator Context
        </div>
        {timestamp && (
          <div className="org-card__timestamp">
            {formatTimestamp(timestamp)}
          </div>
        )}
      </div>

      <div className="org-card__content">
        {/* Operator Identity Section */}
        <div className="operator-context-section">
          <div className="operator-context-section__header">
            <div className="operator-context-section__label">Identity</div>
          </div>
          <div className="operator-context-section__content">
            <div className="operator-context-field">
              <div className="operator-context-field__label">Operator ID</div>
              <div
                className={`operator-context-field__value ${onOperatorClick ? 'clickable' : ''}`}
                onClick={() => onOperatorClick?.(operatorId)}
                title={operatorId}
              >
                <code>{truncateId(operatorId, compact ? 6 : 8)}</code>
              </div>
            </div>

            <div className="operator-context-field">
              <div className="operator-context-field__label">Session</div>
              <div className="operator-context-field__value" title={sessionId}>
                <code>{truncateId(sessionId, compact ? 6 : 8)}</code>
              </div>
            </div>
          </div>
        </div>

        {/* Team Membership Section */}
        {teamId && (
          <div className="operator-context-section">
            <div className="operator-context-section__header">
              <div className="operator-context-section__label">Team</div>
            </div>
            <div className="operator-context-section__content">
              <div className="operator-context-field">
                <div className="operator-context-field__label">Team ID</div>
                <div
                  className={`operator-context-field__value team-badge ${onTeamClick ? 'clickable' : ''}`}
                  onClick={() => onTeamClick?.(teamId)}
                  title={`Click to filter by team: ${teamId}`}
                >
                  <span className="team-badge__icon">👥</span>
                  <code>{truncateId(teamId, compact ? 6 : 8)}</code>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Instance Information Section */}
        <div className="operator-context-section">
          <div className="operator-context-section__header">
            <div className="operator-context-section__label">Instance</div>
          </div>
          <div className="operator-context-section__content">
            <div className="operator-context-field">
              <div className="operator-context-field__label">Client</div>
              <div className="operator-context-field__value">
                <span className="client-type-badge">
                  <span className="client-type-badge__icon">
                    {getClientType(userAgent) === 'CLI' && '💻'}
                    {getClientType(userAgent) === 'Desktop' && '🖥️'}
                    {getClientType(userAgent) === 'VS Code' && '📝'}
                    {getClientType(userAgent) === 'Web' && '🌐'}
                    {!['CLI', 'Desktop', 'VS Code', 'Web'].includes(getClientType(userAgent)) && '🔧'}
                  </span>
                  {getClientType(userAgent)}
                </span>
              </div>
            </div>

            {instanceId && (
              <div className="operator-context-field">
                <div className="operator-context-field__label">Instance ID</div>
                <div className="operator-context-field__value" title={instanceId}>
                  <code>{truncateId(instanceId, compact ? 6 : 8)}</code>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Technical Details Section (Development/Debug) */}
        {showTechnicalDetails && (userAgent || timestamp) && (
          <div className="operator-context-section">
            <div className="operator-context-section__header">
              <div className="operator-context-section__label">Technical</div>
            </div>
            <div className="operator-context-section__content">
              {userAgent && (
                <div className="operator-context-field">
                  <div className="operator-context-field__label">User Agent</div>
                  <div
                    className="operator-context-field__value technical"
                    title={userAgent}
                  >
                    <code>{compact ? truncateId(userAgent, 20) : userAgent}</code>
                  </div>
                </div>
              )}

              {timestamp && (
                <div className="operator-context-field">
                  <div className="operator-context-field__label">Timestamp</div>
                  <div className="operator-context-field__value technical">
                    <code>{new Date(timestamp).toISOString()}</code>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Session Correlation Indicator */}
        {sessionId && (
          <div className="operator-context-actions">
            <button
              className="operator-context-action"
              onClick={() => {/* TODO: Navigate to session correlation view */}}
              title="View related sessions"
            >
              <span className="operator-context-action__icon">🔗</span>
              <span className="operator-context-action__label">
                {compact ? 'Related' : 'View Related Sessions'}
              </span>
            </button>
          </div>
        )}
      </div>

      {/* Compact Mode Summary */}
      {compact && (
        <div className="operator-context-card__summary">
          <div className="operator-context-summary-item">
            <span className="operator-context-summary-item__icon">👤</span>
            <span className="operator-context-summary-item__text">
              {truncateId(operatorId, 6)}
            </span>
          </div>

          {teamId && (
            <div className="operator-context-summary-item">
              <span className="operator-context-summary-item__icon">👥</span>
              <span className="operator-context-summary-item__text">
                {truncateId(teamId, 6)}
              </span>
            </div>
          )}

          <div className="operator-context-summary-item">
            <span className="operator-context-summary-item__icon">
              {getClientType(userAgent) === 'CLI' && '💻'}
              {getClientType(userAgent) === 'Desktop' && '🖥️'}
              {getClientType(userAgent) === 'VS Code' && '📝'}
              {getClientType(userAgent) === 'Web' && '🌐'}
              {!['CLI', 'Desktop', 'VS Code', 'Web'].includes(getClientType(userAgent)) && '🔧'}
            </span>
            <span className="operator-context-summary-item__text">
              {getClientType(userAgent)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// Export default for easy importing
export default OperatorContextCard;