/**
 * Session Correlation View
 *
 * Displays related sessions and their confidence scores,
 * showing how sessions are connected through organizational context,
 * similar operators, problem domains, or solution patterns.
 */

import React, { useState, useMemo } from 'react';
import type { SessionCorrelation, CorrelationType } from '../../../types/organizational.js';

// Component props
interface SessionCorrelationViewProps {
  /** Current session ID being displayed */
  currentSessionId: string;

  /** Array of session correlations */
  correlations: SessionCorrelation[];

  /** Whether to show compact version */
  compact?: boolean;

  /** Custom CSS class name */
  className?: string;

  /** Maximum number of correlations to show initially */
  initialLimit?: number;

  /** Whether to group correlations by type */
  groupByType?: boolean;

  /** Callback when a correlated session is clicked */
  onSessionClick?: (sessionId: string, correlationType: CorrelationType) => void;

  /** Callback when correlation details are requested */
  onViewDetails?: (correlation: SessionCorrelation) => void;

  /** Whether to show confidence threshold filter */
  showConfidenceFilter?: boolean;
}

// Correlation type display configuration
const CORRELATION_TYPE_CONFIG: Record<CorrelationType, {
  label: string;
  icon: string;
  description: string;
  color: string;
}> = {
  operator_continuity: {
    label: 'Same Operator',
    icon: '👤',
    description: 'Sessions by the same operator',
    color: 'var(--org-operator)'
  },
  team_context: {
    label: 'Team Context',
    icon: '👥',
    description: 'Sessions within the same team',
    color: 'var(--org-team)'
  },
  problem_similarity: {
    label: 'Similar Problem',
    icon: '🎯',
    description: 'Sessions addressing similar problems',
    color: 'var(--org-problem)'
  },
  solution_pattern: {
    label: 'Solution Pattern',
    icon: '💡',
    description: 'Sessions using similar solution approaches',
    color: 'var(--org-solution)'
  },
  temporal_proximity: {
    label: 'Temporal Context',
    icon: '⏰',
    description: 'Sessions occurring around the same time',
    color: 'var(--org-temporal)'
  },
  cross_instance: {
    label: 'Cross-Instance',
    icon: '🔄',
    description: 'Sessions spanning multiple Claude Code instances',
    color: 'var(--org-cross-instance)'
  }
};

/**
 * Session Correlation View Component
 */
export function SessionCorrelationView({
  currentSessionId,
  correlations,
  compact = false,
  className = '',
  initialLimit = 5,
  groupByType = true,
  onSessionClick,
  onViewDetails,
  showConfidenceFilter = true
}: SessionCorrelationViewProps) {
  const [showAll, setShowAll] = useState(false);
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.3);
  const [selectedTypes, setSelectedTypes] = useState<Set<CorrelationType>>(
    new Set(Object.keys(CORRELATION_TYPE_CONFIG) as CorrelationType[])
  );

  // Filter and sort correlations
  const filteredCorrelations = useMemo(() => {
    return correlations
      .filter(correlation =>
        correlation.confidence >= confidenceThreshold &&
        selectedTypes.has(correlation.type) &&
        correlation.correlatedSessionId !== currentSessionId
      )
      .sort((a, b) => b.confidence - a.confidence);
  }, [correlations, confidenceThreshold, selectedTypes, currentSessionId]);

  // Group correlations by type if requested
  const groupedCorrelations = useMemo(() => {
    if (!groupByType) {
      return { all: filteredCorrelations };
    }

    const groups: Record<string, SessionCorrelation[]> = {};
    filteredCorrelations.forEach(correlation => {
      const type = correlation.type;
      if (!groups[type]) {
        groups[type] = [];
      }
      groups[type].push(correlation);
    });

    return groups;
  }, [filteredCorrelations, groupByType]);

  // Format confidence score for display
  const formatConfidence = (confidence: number): string => {
    return `${Math.round(confidence * 100)}%`;
  };

  // Format timestamp for display
  const formatTimestamp = (timestamp: number): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  // Get confidence level classification
  const getConfidenceLevel = (confidence: number): string => {
    if (confidence >= 0.8) return 'high';
    if (confidence >= 0.5) return 'medium';
    return 'low';
  };

  // Handle type filter toggle
  const toggleType = (type: CorrelationType) => {
    const newSelectedTypes = new Set(selectedTypes);
    if (newSelectedTypes.has(type)) {
      newSelectedTypes.delete(type);
    } else {
      newSelectedTypes.add(type);
    }
    setSelectedTypes(newSelectedTypes);
  };

  // Render individual correlation item
  const renderCorrelation = (correlation: SessionCorrelation) => {
    const config = CORRELATION_TYPE_CONFIG[correlation.type];
    const confidenceLevel = getConfidenceLevel(correlation.confidence);

    return (
      <div
        key={correlation.correlatedSessionId}
        className={`session-correlation-item ${compact ? 'compact' : ''}`}
      >
        <div className="session-correlation-item__header">
          <div className="session-correlation-item__type">
            <span className="session-correlation-type-icon" style={{ color: config.color }}>
              {config.icon}
            </span>
            {!compact && (
              <span className="session-correlation-type-label">
                {config.label}
              </span>
            )}
          </div>

          <div className={`session-correlation-confidence confidence-${confidenceLevel}`}>
            <div
              className="session-correlation-confidence__bar"
              style={{
                width: `${correlation.confidence * 100}%`,
                backgroundColor: config.color
              }}
            />
            <div className="session-correlation-confidence__text">
              {formatConfidence(correlation.confidence)}
            </div>
          </div>
        </div>

        <div className="session-correlation-item__content">
          <div className="session-correlation-item__session">
            <button
              className="session-correlation-session-link"
              onClick={() => onSessionClick?.(correlation.correlatedSessionId, correlation.type)}
              title={`View session: ${correlation.correlatedSessionId}`}
            >
              <span className="session-correlation-session-icon">🔗</span>
              <code>{correlation.correlatedSessionId.substring(0, 8)}...</code>
            </button>
          </div>

          {correlation.metadata?.description && !compact && (
            <div className="session-correlation-item__description">
              {correlation.metadata.description}
            </div>
          )}

          <div className="session-correlation-item__metadata">
            {correlation.metadata?.timestamp && (
              <span className="session-correlation-metadata-item">
                <span className="session-correlation-metadata-icon">⏰</span>
                {formatTimestamp(correlation.metadata.timestamp)}
              </span>
            )}

            {correlation.metadata?.operator && (
              <span className="session-correlation-metadata-item">
                <span className="session-correlation-metadata-icon">👤</span>
                <code>{correlation.metadata.operator.substring(0, 6)}...</code>
              </span>
            )}

            {correlation.metadata?.teamId && (
              <span className="session-correlation-metadata-item">
                <span className="session-correlation-metadata-icon">👥</span>
                <code>{correlation.metadata.teamId.substring(0, 6)}...</code>
              </span>
            )}
          </div>

          {onViewDetails && !compact && (
            <button
              className="session-correlation-details-button"
              onClick={() => onViewDetails(correlation)}
            >
              View Details
            </button>
          )}
        </div>
      </div>
    );
  };

  const cardClasses = [
    'org-card',
    'session-correlation-view',
    compact ? 'compact' : '',
    className
  ].filter(Boolean).join(' ');

  const displayedCorrelations = showAll ? filteredCorrelations : filteredCorrelations.slice(0, initialLimit);

  // No correlations available
  if (correlations.length === 0) {
    return (
      <div className={cardClasses}>
        <div className="org-card__header">
          <div className="org-card__title">
            <span className="session-correlation-view__icon">🔗</span>
            Session Correlations
          </div>
        </div>
        <div className="org-card__content">
          <div className="session-correlation-empty">
            <div className="session-correlation-empty__icon">🔍</div>
            <div className="session-correlation-empty__message">
              No session correlations found
            </div>
            <div className="session-correlation-empty__description">
              This session doesn't appear to be related to other sessions yet.
            </div>
          </div>
        </div>
      </div>
    );
  }

  // No correlations after filtering
  if (filteredCorrelations.length === 0) {
    return (
      <div className={cardClasses}>
        <div className="org-card__header">
          <div className="org-card__title">
            <span className="session-correlation-view__icon">🔗</span>
            Session Correlations
          </div>
        </div>
        <div className="org-card__content">
          <div className="session-correlation-empty">
            <div className="session-correlation-empty__icon">🔍</div>
            <div className="session-correlation-empty__message">
              No correlations match current filters
            </div>
            <div className="session-correlation-empty__description">
              Try adjusting the confidence threshold or correlation types.
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cardClasses}>
      <div className="org-card__header">
        <div className="org-card__title">
          <span className="session-correlation-view__icon">🔗</span>
          Session Correlations
          <span className="session-correlation-count">
            {filteredCorrelations.length}
          </span>
        </div>
      </div>

      <div className="org-card__content">
        {/* Filters */}
        {!compact && showConfidenceFilter && (
          <div className="session-correlation-filters">
            <div className="session-correlation-filter">
              <label className="session-correlation-filter__label">
                Confidence Threshold: {formatConfidence(confidenceThreshold)}
              </label>
              <input
                type="range"
                className="session-correlation-filter__slider"
                min="0"
                max="1"
                step="0.1"
                value={confidenceThreshold}
                onChange={(e) => setConfidenceThreshold(parseFloat(e.target.value))}
              />
            </div>

            <div className="session-correlation-type-filters">
              {Object.entries(CORRELATION_TYPE_CONFIG).map(([type, config]) => (
                <button
                  key={type}
                  className={`session-correlation-type-filter ${
                    selectedTypes.has(type as CorrelationType) ? 'active' : 'inactive'
                  }`}
                  style={{ borderColor: config.color }}
                  onClick={() => toggleType(type as CorrelationType)}
                  title={config.description}
                >
                  <span className="session-correlation-type-filter__icon">
                    {config.icon}
                  </span>
                  <span className="session-correlation-type-filter__label">
                    {config.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Correlations */}
        <div className="session-correlation-list">
          {groupByType ? (
            Object.entries(groupedCorrelations).map(([type, typeCorrelations]) => (
              <div key={type} className="session-correlation-group">
                <div className="session-correlation-group__header">
                  <span className="session-correlation-group__icon">
                    {CORRELATION_TYPE_CONFIG[type as CorrelationType]?.icon}
                  </span>
                  <span className="session-correlation-group__title">
                    {CORRELATION_TYPE_CONFIG[type as CorrelationType]?.label}
                  </span>
                  <span className="session-correlation-group__count">
                    {typeCorrelations.length}
                  </span>
                </div>
                <div className="session-correlation-group__items">
                  {(showAll ? typeCorrelations : typeCorrelations.slice(0, Math.ceil(initialLimit / Object.keys(groupedCorrelations).length)))
                    .map(renderCorrelation)}
                </div>
              </div>
            ))
          ) : (
            displayedCorrelations.map(renderCorrelation)
          )}
        </div>

        {/* Show More/Less */}
        {filteredCorrelations.length > initialLimit && (
          <div className="session-correlation-actions">
            <button
              className="session-correlation-toggle"
              onClick={() => setShowAll(!showAll)}
            >
              {showAll
                ? `Show Less (${initialLimit})`
                : `Show All (${filteredCorrelations.length})`
              }
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Export default for easy importing
export default SessionCorrelationView;