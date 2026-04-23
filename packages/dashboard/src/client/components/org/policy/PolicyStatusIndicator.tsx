/**
 * Policy Status Indicator
 *
 * Component for displaying policy compliance status with visual indicators,
 * status icons, severity levels, and quick status overview for traces
 * and organizational activities.
 */

import React from 'react';
import type { PolicyComplianceLevel, PolicyStatus } from '../../../types/organizational.js';

// Component props
interface PolicyStatusIndicatorProps {
  /** Policy status data to display */
  policyStatus: PolicyStatus;

  /** Whether to show compact version */
  compact?: boolean;

  /** Whether to show detailed status information */
  showDetails?: boolean;

  /** Whether to show recommendation count */
  showRecommendationCount?: boolean;

  /** Whether to show violation details */
  showViolationDetails?: boolean;

  /** Custom CSS class name */
  className?: string;

  /** Whether the indicator should be clickable */
  clickable?: boolean;

  /** Callback when indicator is clicked */
  onClick?: (policyStatus: PolicyStatus) => void;

  /** Whether to show as badge style */
  asBadge?: boolean;

  /** Size variant */
  size?: 'small' | 'medium' | 'large';
}

// Policy compliance level configuration
const COMPLIANCE_LEVEL_CONFIG: Record<
  PolicyComplianceLevel,
  {
    label: string;
    icon: string;
    color: string;
    bgColor: string;
    description: string;
    priority: number;
  }
> = {
  compliant: {
    label: 'Compliant',
    icon: '✅',
    color: 'var(--success)',
    bgColor: 'rgba(34, 197, 94, 0.1)',
    description: 'Meets all policy requirements',
    priority: 4,
  },
  warning: {
    label: 'Warning',
    icon: '⚠️',
    color: 'var(--warn)',
    bgColor: 'rgba(251, 191, 36, 0.1)',
    description: 'Some policy concerns detected',
    priority: 2,
  },
  violation: {
    label: 'Violation',
    icon: '❌',
    color: 'var(--fail)',
    bgColor: 'rgba(239, 68, 68, 0.1)',
    description: 'Policy violation detected',
    priority: 1,
  },
  pending: {
    label: 'Pending',
    icon: '⏳',
    color: 'var(--t3)',
    bgColor: 'rgba(156, 163, 175, 0.1)',
    description: 'Policy evaluation in progress',
    priority: 3,
  },
};

// Policy category configuration
const POLICY_CATEGORY_CONFIG: Record<
  string,
  {
    label: string;
    icon: string;
    color: string;
  }
> = {
  data_governance: {
    label: 'Data Governance',
    icon: '🗂️',
    color: 'var(--org-primary)',
  },
  access_control: {
    label: 'Access Control',
    icon: '🔐',
    color: 'var(--org-secondary)',
  },
  privacy: {
    label: 'Privacy',
    icon: '🛡️',
    color: 'var(--org-privacy)',
  },
  security: {
    label: 'Security',
    icon: '🔒',
    color: 'var(--org-security)',
  },
  compliance: {
    label: 'Compliance',
    icon: '📋',
    color: 'var(--org-compliance)',
  },
  operational: {
    label: 'Operational',
    icon: '⚙️',
    color: 'var(--org-operational)',
  },
};

/**
 * Policy Status Indicator Component
 */
export function PolicyStatusIndicator({
  policyStatus,
  compact = false,
  showDetails = false,
  showRecommendationCount = true,
  showViolationDetails = false,
  className = '',
  clickable = false,
  onClick,
  asBadge = false,
  size = 'medium',
}: PolicyStatusIndicatorProps) {
  const config = COMPLIANCE_LEVEL_CONFIG[policyStatus.compliance];

  // Get policy violations by category
  const violationsByCategory = React.useMemo(() => {
    if (!policyStatus.violations?.length) return {};

    return policyStatus.violations.reduce(
      (acc, violation) => {
        const category = violation.category || 'operational';
        if (!acc[category]) {
          acc[category] = [];
        }
        acc[category].push(violation);
        return acc;
      },
      {} as Record<string, typeof policyStatus.violations>,
    );
  }, [policyStatus.violations]);

  // Get highest severity violation
  const highestSeverityViolation = React.useMemo(() => {
    if (!policyStatus.violations?.length) return null;

    const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
    return policyStatus.violations.reduce((highest, current) => {
      const currentSeverity = severityOrder[current.severity] || 0;
      const highestSeverity = severityOrder[highest.severity] || 0;
      return currentSeverity > highestSeverity ? current : highest;
    });
  }, [policyStatus.violations]);

  // Handle click
  const handleClick = () => {
    if (clickable && onClick) {
      onClick(policyStatus);
    }
  };

  const containerClasses = [
    'policy-status-indicator',
    `policy-status-indicator--${policyStatus.compliance}`,
    `policy-status-indicator--${size}`,
    asBadge ? 'policy-status-badge' : '',
    compact ? 'compact' : '',
    clickable ? 'clickable' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  // Badge style (minimal)
  if (asBadge) {
    return (
      <div
        className={containerClasses}
        style={{
          backgroundColor: config.bgColor,
          color: config.color,
          border: `1px solid ${config.color}`,
        }}
        onClick={handleClick}
        title={`Policy Status: ${config.label} - ${config.description}`}
      >
        <span className="policy-status-badge__icon">{config.icon}</span>
        {!compact && <span className="policy-status-badge__label">{config.label}</span>}
        {showRecommendationCount && policyStatus.recommendations.length > 0 && (
          <span className="policy-status-badge__count">{policyStatus.recommendations.length}</span>
        )}
      </div>
    );
  }

  // Full indicator display
  return (
    <div className={containerClasses} onClick={handleClick}>
      {/* Main Status Display */}
      <div className="policy-status-indicator__main">
        <div className="policy-status-indicator__header">
          <div className="policy-status-indicator__icon" style={{ color: config.color }}>
            {config.icon}
          </div>

          <div className="policy-status-indicator__content">
            <div className="policy-status-indicator__label">{config.label}</div>
            {!compact && (
              <div className="policy-status-indicator__description">{config.description}</div>
            )}
          </div>

          {/* Status Timestamp */}
          {policyStatus.evaluatedAt && !compact && (
            <div className="policy-status-indicator__timestamp">
              {new Date(policyStatus.evaluatedAt).toLocaleString()}
            </div>
          )}
        </div>

        {/* Status Metrics */}
        {!compact && (
          <div className="policy-status-indicator__metrics">
            {policyStatus.violations && policyStatus.violations.length > 0 && (
              <div className="policy-status-metric">
                <span className="policy-status-metric__icon">❌</span>
                <span className="policy-status-metric__value">
                  {policyStatus.violations.length}
                </span>
                <span className="policy-status-metric__label">
                  violation{policyStatus.violations.length !== 1 ? 's' : ''}
                </span>
              </div>
            )}

            {policyStatus.recommendations.length > 0 && showRecommendationCount && (
              <div className="policy-status-metric">
                <span className="policy-status-metric__icon">💡</span>
                <span className="policy-status-metric__value">
                  {policyStatus.recommendations.length}
                </span>
                <span className="policy-status-metric__label">
                  recommendation{policyStatus.recommendations.length !== 1 ? 's' : ''}
                </span>
              </div>
            )}

            {policyStatus.score && (
              <div className="policy-status-metric">
                <span className="policy-status-metric__icon">📊</span>
                <span className="policy-status-metric__value">
                  {Math.round(policyStatus.score * 100)}%
                </span>
                <span className="policy-status-metric__label">score</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Detailed Information */}
      {showDetails && !compact && (
        <div className="policy-status-indicator__details">
          {/* Policy Categories */}
          {Object.keys(violationsByCategory).length > 0 && (
            <div className="policy-status-details-section">
              <div className="policy-status-details-section__header">Policy Areas</div>
              <div className="policy-status-categories">
                {Object.entries(violationsByCategory).map(([category, violations]) => {
                  const categoryConfig = POLICY_CATEGORY_CONFIG[category] || {
                    label: category,
                    icon: '📋',
                    color: 'var(--t2)',
                  };

                  return (
                    <div
                      key={category}
                      className="policy-status-category"
                      style={{ borderColor: categoryConfig.color }}
                    >
                      <span
                        className="policy-status-category__icon"
                        style={{ color: categoryConfig.color }}
                      >
                        {categoryConfig.icon}
                      </span>
                      <span className="policy-status-category__label">{categoryConfig.label}</span>
                      <span className="policy-status-category__count">{violations.length}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Highest Severity Violation */}
          {showViolationDetails && highestSeverityViolation && (
            <div className="policy-status-details-section">
              <div className="policy-status-details-section__header">Primary Concern</div>
              <div className="policy-status-violation">
                <div className="policy-status-violation__header">
                  <div
                    className="policy-status-violation__severity"
                    style={{
                      color:
                        highestSeverityViolation.severity === 'critical'
                          ? 'var(--fail)'
                          : highestSeverityViolation.severity === 'high'
                            ? 'var(--warn)'
                            : 'var(--t2)',
                    }}
                  >
                    {highestSeverityViolation.severity.toUpperCase()}
                  </div>
                  <div className="policy-status-violation__rule">
                    {highestSeverityViolation.rule}
                  </div>
                </div>
                {highestSeverityViolation.message && (
                  <div className="policy-status-violation__message">
                    {highestSeverityViolation.message}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Top Recommendations */}
          {policyStatus.recommendations.length > 0 && (
            <div className="policy-status-details-section">
              <div className="policy-status-details-section__header">Recommendations</div>
              <div className="policy-status-recommendations">
                {policyStatus.recommendations
                  .slice(0, compact ? 1 : 3)
                  .map((recommendation, index) => (
                    <div key={index} className="policy-status-recommendation">
                      <span className="policy-status-recommendation__bullet">•</span>
                      <span className="policy-status-recommendation__text">{recommendation}</span>
                    </div>
                  ))}
                {policyStatus.recommendations.length > 3 && !compact && (
                  <div className="policy-status-recommendations-more">
                    +{policyStatus.recommendations.length - 3} more recommendation
                    {policyStatus.recommendations.length - 3 !== 1 ? 's' : ''}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Compliance Progress Bar */}
      {policyStatus.score !== undefined && !compact && !asBadge && (
        <div className="policy-status-indicator__progress">
          <div className="policy-status-progress-bar">
            <div
              className="policy-status-progress-bar__fill"
              style={{
                width: `${policyStatus.score * 100}%`,
                backgroundColor: config.color,
              }}
            />
          </div>
          <div className="policy-status-progress-text">
            {Math.round(policyStatus.score * 100)}% compliant
          </div>
        </div>
      )}

      {/* Click Indicator */}
      {clickable && <div className="policy-status-indicator__click-hint">Click for details →</div>}
    </div>
  );
}

/**
 * Policy Status Summary Component
 *
 * Shows aggregated status for multiple policies
 */
interface PolicyStatusSummaryProps {
  /** Array of policy statuses to summarize */
  policyStatuses: PolicyStatus[];

  /** Custom CSS class name */
  className?: string;

  /** Whether to show compact version */
  compact?: boolean;

  /** Callback when status is clicked */
  onStatusClick?: (compliance: PolicyComplianceLevel, count: number) => void;
}

export function PolicyStatusSummary({
  policyStatuses,
  className = '',
  compact = false,
  onStatusClick,
}: PolicyStatusSummaryProps) {
  // Calculate summary statistics
  const summary = React.useMemo(() => {
    const counts = {
      compliant: 0,
      warning: 0,
      violation: 0,
      pending: 0,
    };

    let totalRecommendations = 0;
    let totalViolations = 0;
    let averageScore = 0;
    let scoredPolicies = 0;

    policyStatuses.forEach((policy) => {
      counts[policy.compliance]++;
      totalRecommendations += policy.recommendations.length;
      totalViolations += policy.violations?.length || 0;

      if (policy.score !== undefined) {
        averageScore += policy.score;
        scoredPolicies++;
      }
    });

    if (scoredPolicies > 0) {
      averageScore /= scoredPolicies;
    }

    return {
      counts,
      totalRecommendations,
      totalViolations,
      averageScore,
      totalPolicies: policyStatuses.length,
    };
  }, [policyStatuses]);

  // Determine overall status
  const overallStatus: PolicyComplianceLevel =
    summary.counts.violation > 0
      ? 'violation'
      : summary.counts.warning > 0
        ? 'warning'
        : summary.counts.pending > 0
          ? 'pending'
          : 'compliant';

  const containerClasses = [
    'policy-status-summary',
    `policy-status-summary--${overallStatus}`,
    compact ? 'compact' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  if (policyStatuses.length === 0) {
    return (
      <div className={containerClasses}>
        <div className="policy-status-summary__empty">
          <div className="policy-status-summary__empty-icon">📋</div>
          <div className="policy-status-summary__empty-text">No policy evaluations available</div>
        </div>
      </div>
    );
  }

  return (
    <div className={containerClasses}>
      <div className="policy-status-summary__header">
        <div className="policy-status-summary__title">Policy Compliance Overview</div>
        <div className="policy-status-summary__meta">
          {summary.totalPolicies} polic{summary.totalPolicies !== 1 ? 'ies' : 'y'} evaluated
        </div>
      </div>

      <div className="policy-status-summary__content">
        {/* Status Breakdown */}
        <div className="policy-status-summary__breakdown">
          {Object.entries(summary.counts).map(([level, count]) => {
            if (count === 0 && compact) return null;

            const config = COMPLIANCE_LEVEL_CONFIG[level as PolicyComplianceLevel];

            return (
              <button
                key={level}
                className={`policy-status-summary__item ${count === 0 ? 'zero' : ''}`}
                onClick={() => onStatusClick?.(level as PolicyComplianceLevel, count)}
                disabled={count === 0}
                style={{ borderColor: config.color }}
              >
                <div className="policy-status-summary__item-icon" style={{ color: config.color }}>
                  {config.icon}
                </div>
                <div className="policy-status-summary__item-content">
                  <div className="policy-status-summary__item-count">{count}</div>
                  {!compact && (
                    <div className="policy-status-summary__item-label">{config.label}</div>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Summary Stats */}
        {!compact && (
          <div className="policy-status-summary__stats">
            {summary.totalViolations > 0 && (
              <div className="policy-status-summary__stat">
                <span className="policy-status-summary__stat-value">{summary.totalViolations}</span>
                <span className="policy-status-summary__stat-label">
                  total violation{summary.totalViolations !== 1 ? 's' : ''}
                </span>
              </div>
            )}

            {summary.totalRecommendations > 0 && (
              <div className="policy-status-summary__stat">
                <span className="policy-status-summary__stat-value">
                  {summary.totalRecommendations}
                </span>
                <span className="policy-status-summary__stat-label">
                  recommendation{summary.totalRecommendations !== 1 ? 's' : ''}
                </span>
              </div>
            )}

            {summary.averageScore > 0 && (
              <div className="policy-status-summary__stat">
                <span className="policy-status-summary__stat-value">
                  {Math.round(summary.averageScore * 100)}%
                </span>
                <span className="policy-status-summary__stat-label">avg compliance</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Export default for easy importing
export default PolicyStatusIndicator;
