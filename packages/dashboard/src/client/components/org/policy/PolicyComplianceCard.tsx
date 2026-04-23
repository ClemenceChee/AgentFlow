/**
 * Policy Compliance Card
 *
 * Detailed card component for displaying policy evaluation results,
 * compliance warnings, violation details, and actionable recommendations
 * with comprehensive policy analysis and remediation guidance.
 */

import { useMemo, useState } from 'react';
import type { PolicyStatus, PolicyViolation } from '../../../types/organizational.js';
import { PolicyStatusIndicator } from './PolicyStatusIndicator.js';

// Component props
interface PolicyComplianceCardProps {
  /** Policy status data to display */
  policyStatus: PolicyStatus;

  /** Whether to show detailed violation information */
  showViolationDetails?: boolean;

  /** Whether to show remediation guidance */
  showRemediation?: boolean;

  /** Whether to show policy history */
  showHistory?: boolean;

  /** Whether to allow expanding/collapsing sections */
  expandable?: boolean;

  /** Custom CSS class name */
  className?: string;

  /** Whether to show compact version */
  compact?: boolean;

  /** Callback when violation is clicked */
  onViolationClick?: (violation: PolicyViolation) => void;

  /** Callback when recommendation is clicked */
  onRecommendationClick?: (recommendation: string, index: number) => void;

  /** Callback when remediation action is requested */
  onRemediationAction?: (action: string, violation: PolicyViolation) => void;
}

// Violation severity configuration
const VIOLATION_SEVERITY_CONFIG = {
  critical: {
    label: 'Critical',
    color: 'var(--fail)',
    bgColor: 'rgba(239, 68, 68, 0.1)',
    icon: '🚨',
    priority: 4,
  },
  high: {
    label: 'High',
    color: 'var(--warn)',
    bgColor: 'rgba(251, 191, 36, 0.1)',
    icon: '⚠️',
    priority: 3,
  },
  medium: {
    label: 'Medium',
    color: 'var(--org-primary)',
    bgColor: 'rgba(59, 130, 246, 0.1)',
    icon: 'ℹ️',
    priority: 2,
  },
  low: {
    label: 'Low',
    color: 'var(--t3)',
    bgColor: 'rgba(156, 163, 175, 0.1)',
    icon: '📝',
    priority: 1,
  },
};

// Policy category icons
const POLICY_CATEGORY_ICONS: Record<string, string> = {
  data_governance: '🗂️',
  access_control: '🔐',
  privacy: '🛡️',
  security: '🔒',
  compliance: '📋',
  operational: '⚙️',
  financial: '💰',
  legal: '⚖️',
  technical: '🔧',
};

/**
 * Policy Compliance Card Component
 */
export function PolicyComplianceCard({
  policyStatus,
  showViolationDetails = true,
  showRemediation = true,
  showHistory = false,
  expandable = true,
  className = '',
  compact = false,
  onViolationClick,
  onRecommendationClick,
  onRemediationAction,
}: PolicyComplianceCardProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(compact ? [] : ['overview']),
  );

  // Sort violations by severity
  const sortedViolations = useMemo(() => {
    if (!policyStatus.violations) return [];

    return [...policyStatus.violations].sort((a, b) => {
      const aSeverity = VIOLATION_SEVERITY_CONFIG[a.severity]?.priority || 0;
      const bSeverity = VIOLATION_SEVERITY_CONFIG[b.severity]?.priority || 0;
      return bSeverity - aSeverity; // Higher priority first
    });
  }, [policyStatus.violations]);

  // Group violations by category
  const violationsByCategory = useMemo(() => {
    const grouped: Record<string, PolicyViolation[]> = {};

    sortedViolations.forEach((violation) => {
      const category = violation.category || 'operational';
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(violation);
    });

    return grouped;
  }, [sortedViolations]);

  // Calculate compliance metrics
  const complianceMetrics = useMemo(() => {
    const totalChecks = policyStatus.checkedPolicies?.length || 0;
    const violationCount = sortedViolations.length;
    const recommendationCount = policyStatus.recommendations.length;

    // Calculate severity breakdown
    const severityBreakdown = sortedViolations.reduce(
      (acc, violation) => {
        acc[violation.severity] = (acc[violation.severity] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    return {
      totalChecks,
      violationCount,
      recommendationCount,
      severityBreakdown,
      compliancePercentage: policyStatus.score ? Math.round(policyStatus.score * 100) : null,
    };
  }, [policyStatus, sortedViolations]);

  // Toggle section expansion
  const toggleSection = (sectionId: string) => {
    if (!expandable) return;

    setExpandedSections((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(sectionId)) {
        newSet.delete(sectionId);
      } else {
        newSet.add(sectionId);
      }
      return newSet;
    });
  };

  // Format timestamp
  const formatTimestamp = (timestamp: number): string => {
    return new Date(timestamp).toLocaleString();
  };

  // Get remediation actions for a violation
  const getRemediationActions = (violation: PolicyViolation): string[] => {
    // This would typically come from the policy engine
    // For now, we'll generate some common actions based on category
    const actions: Record<string, string[]> = {
      data_governance: [
        'Review data classification',
        'Update data retention policy',
        'Configure data access controls',
      ],
      access_control: [
        'Review user permissions',
        'Update access policies',
        'Enable additional authentication',
      ],
      privacy: ['Update privacy settings', 'Review data sharing agreements', 'Enable data masking'],
      security: [
        'Apply security patches',
        'Update security configurations',
        'Enable security monitoring',
      ],
      compliance: [
        'Review compliance requirements',
        'Update documentation',
        'Schedule compliance audit',
      ],
      operational: [
        'Review operational procedures',
        'Update configuration',
        'Schedule maintenance',
      ],
    };

    return (
      actions[violation.category || 'operational'] || [
        'Review violation details',
        'Contact administrator',
      ]
    );
  };

  const cardClasses = [
    'org-card',
    'policy-compliance-card',
    `policy-compliance-card--${policyStatus.compliance}`,
    compact ? 'compact' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={cardClasses}>
      {/* Card Header */}
      <div className="org-card__header">
        <div className="org-card__title">
          <PolicyStatusIndicator policyStatus={policyStatus} asBadge={true} compact={compact} />
          <span className="policy-compliance-card__title">Policy Compliance</span>
        </div>
        <div className="org-card__subtitle">
          {policyStatus.evaluatedAt && (
            <span>Evaluated {formatTimestamp(policyStatus.evaluatedAt)}</span>
          )}
        </div>
      </div>

      <div className="org-card__content">
        {/* Compliance Overview */}
        <div className="policy-compliance-section">
          <button
            className={`policy-compliance-section__header ${expandable ? 'expandable' : ''}`}
            onClick={() => toggleSection('overview')}
            disabled={!expandable}
          >
            <div className="policy-compliance-section__title">
              <span className="policy-compliance-section__icon">📊</span>
              Compliance Overview
            </div>
            {expandable && (
              <span
                className={`policy-compliance-section__arrow ${
                  expandedSections.has('overview') ? 'expanded' : 'collapsed'
                }`}
              >
                ▼
              </span>
            )}
          </button>

          {(!expandable || expandedSections.has('overview')) && (
            <div className="policy-compliance-section__content">
              <div className="policy-compliance-metrics">
                {complianceMetrics.compliancePercentage !== null && (
                  <div className="policy-compliance-metric">
                    <div className="policy-compliance-metric__value">
                      {complianceMetrics.compliancePercentage}%
                    </div>
                    <div className="policy-compliance-metric__label">Compliant</div>
                  </div>
                )}

                <div className="policy-compliance-metric">
                  <div className="policy-compliance-metric__value">
                    {complianceMetrics.violationCount}
                  </div>
                  <div className="policy-compliance-metric__label">
                    Violation{complianceMetrics.violationCount !== 1 ? 's' : ''}
                  </div>
                </div>

                <div className="policy-compliance-metric">
                  <div className="policy-compliance-metric__value">
                    {complianceMetrics.recommendationCount}
                  </div>
                  <div className="policy-compliance-metric__label">
                    Recommendation{complianceMetrics.recommendationCount !== 1 ? 's' : ''}
                  </div>
                </div>

                {complianceMetrics.totalChecks > 0 && (
                  <div className="policy-compliance-metric">
                    <div className="policy-compliance-metric__value">
                      {complianceMetrics.totalChecks}
                    </div>
                    <div className="policy-compliance-metric__label">Total Checks</div>
                  </div>
                )}
              </div>

              {/* Severity Breakdown */}
              {Object.keys(complianceMetrics.severityBreakdown).length > 0 && (
                <div className="policy-compliance-severity-breakdown">
                  <div className="policy-compliance-severity-breakdown__title">
                    Violations by Severity
                  </div>
                  <div className="policy-compliance-severity-bars">
                    {Object.entries(complianceMetrics.severityBreakdown).map(
                      ([severity, count]) => {
                        const config =
                          VIOLATION_SEVERITY_CONFIG[
                            severity as keyof typeof VIOLATION_SEVERITY_CONFIG
                          ];
                        if (!config) return null;

                        const percentage = (count / complianceMetrics.violationCount) * 100;

                        return (
                          <div key={severity} className="policy-compliance-severity-bar">
                            <div className="policy-compliance-severity-bar__info">
                              <span className="policy-compliance-severity-bar__label">
                                {config.icon} {config.label}
                              </span>
                              <span className="policy-compliance-severity-bar__count">{count}</span>
                            </div>
                            <div className="policy-compliance-severity-bar__progress">
                              <div
                                className="policy-compliance-severity-bar__fill"
                                style={{
                                  width: `${percentage}%`,
                                  backgroundColor: config.color,
                                }}
                              />
                            </div>
                          </div>
                        );
                      },
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Violations Details */}
        {showViolationDetails && sortedViolations.length > 0 && (
          <div className="policy-compliance-section">
            <button
              className={`policy-compliance-section__header ${expandable ? 'expandable' : ''}`}
              onClick={() => toggleSection('violations')}
              disabled={!expandable}
            >
              <div className="policy-compliance-section__title">
                <span className="policy-compliance-section__icon">❌</span>
                Policy Violations ({sortedViolations.length})
              </div>
              {expandable && (
                <span
                  className={`policy-compliance-section__arrow ${
                    expandedSections.has('violations') ? 'expanded' : 'collapsed'
                  }`}
                >
                  ▼
                </span>
              )}
            </button>

            {(!expandable || expandedSections.has('violations')) && (
              <div className="policy-compliance-section__content">
                <div className="policy-compliance-violations">
                  {Object.entries(violationsByCategory).map(([category, violations]) => (
                    <div key={category} className="policy-compliance-violation-category">
                      <div className="policy-compliance-violation-category__header">
                        <span className="policy-compliance-violation-category__icon">
                          {POLICY_CATEGORY_ICONS[category] || '📋'}
                        </span>
                        <span className="policy-compliance-violation-category__name">
                          {category.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                        </span>
                        <span className="policy-compliance-violation-category__count">
                          {violations.length}
                        </span>
                      </div>

                      <div className="policy-compliance-violation-list">
                        {violations.slice(0, compact ? 2 : 5).map((violation, index) => {
                          const severityConfig = VIOLATION_SEVERITY_CONFIG[violation.severity];

                          return (
                            <div
                              key={index}
                              className="policy-compliance-violation"
                              style={{ borderColor: severityConfig?.color }}
                            >
                              <div className="policy-compliance-violation__header">
                                <div className="policy-compliance-violation__severity">
                                  <span
                                    className="policy-compliance-violation__severity-icon"
                                    style={{ color: severityConfig?.color }}
                                  >
                                    {severityConfig?.icon}
                                  </span>
                                  <span className="policy-compliance-violation__severity-label">
                                    {severityConfig?.label}
                                  </span>
                                </div>
                                <div className="policy-compliance-violation__rule">
                                  {violation.rule}
                                </div>
                              </div>

                              {violation.message && (
                                <div className="policy-compliance-violation__message">
                                  {violation.message}
                                </div>
                              )}

                              {violation.details && !compact && (
                                <div className="policy-compliance-violation__details">
                                  <details>
                                    <summary>View Details</summary>
                                    <div className="policy-compliance-violation__details-content">
                                      {typeof violation.details === 'string'
                                        ? violation.details
                                        : JSON.stringify(violation.details, null, 2)}
                                    </div>
                                  </details>
                                </div>
                              )}

                              {/* Remediation Actions */}
                              {showRemediation && !compact && (
                                <div className="policy-compliance-violation__actions">
                                  <div className="policy-compliance-violation__actions-label">
                                    Remediation Actions:
                                  </div>
                                  <div className="policy-compliance-violation__actions-list">
                                    {getRemediationActions(violation)
                                      .slice(0, 2)
                                      .map((action, actionIndex) => (
                                        <button
                                          key={actionIndex}
                                          className="policy-compliance-violation__action"
                                          onClick={() => onRemediationAction?.(action, violation)}
                                        >
                                          {action}
                                        </button>
                                      ))}
                                  </div>
                                </div>
                              )}

                              {onViolationClick && (
                                <button
                                  className="policy-compliance-violation__view-more"
                                  onClick={() => onViolationClick(violation)}
                                >
                                  View Full Details →
                                </button>
                              )}
                            </div>
                          );
                        })}

                        {violations.length > (compact ? 2 : 5) && (
                          <div className="policy-compliance-violation-more">
                            +{violations.length - (compact ? 2 : 5)} more {category} violation
                            {violations.length - (compact ? 2 : 5) !== 1 ? 's' : ''}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Recommendations */}
        {policyStatus.recommendations.length > 0 && (
          <div className="policy-compliance-section">
            <button
              className={`policy-compliance-section__header ${expandable ? 'expandable' : ''}`}
              onClick={() => toggleSection('recommendations')}
              disabled={!expandable}
            >
              <div className="policy-compliance-section__title">
                <span className="policy-compliance-section__icon">💡</span>
                Recommendations ({policyStatus.recommendations.length})
              </div>
              {expandable && (
                <span
                  className={`policy-compliance-section__arrow ${
                    expandedSections.has('recommendations') ? 'expanded' : 'collapsed'
                  }`}
                >
                  ▼
                </span>
              )}
            </button>

            {(!expandable || expandedSections.has('recommendations')) && (
              <div className="policy-compliance-section__content">
                <div className="policy-compliance-recommendations">
                  {policyStatus.recommendations
                    .slice(0, compact ? 3 : 8)
                    .map((recommendation, index) => (
                      <div key={index} className="policy-compliance-recommendation">
                        <button
                          className="policy-compliance-recommendation__content"
                          onClick={() => onRecommendationClick?.(recommendation, index)}
                        >
                          <span className="policy-compliance-recommendation__bullet">💡</span>
                          <span className="policy-compliance-recommendation__text">
                            {recommendation}
                          </span>
                        </button>
                      </div>
                    ))}

                  {policyStatus.recommendations.length > (compact ? 3 : 8) && (
                    <div className="policy-compliance-recommendations-more">
                      +{policyStatus.recommendations.length - (compact ? 3 : 8)} more recommendation
                      {policyStatus.recommendations.length - (compact ? 3 : 8) !== 1 ? 's' : ''}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Policy History */}
        {showHistory && policyStatus.previousEvaluations && (
          <div className="policy-compliance-section">
            <button
              className={`policy-compliance-section__header ${expandable ? 'expandable' : ''}`}
              onClick={() => toggleSection('history')}
              disabled={!expandable}
            >
              <div className="policy-compliance-section__title">
                <span className="policy-compliance-section__icon">📈</span>
                Compliance History
              </div>
              {expandable && (
                <span
                  className={`policy-compliance-section__arrow ${
                    expandedSections.has('history') ? 'expanded' : 'collapsed'
                  }`}
                >
                  ▼
                </span>
              )}
            </button>

            {(!expandable || expandedSections.has('history')) && (
              <div className="policy-compliance-section__content">
                <div className="policy-compliance-history">
                  {policyStatus.previousEvaluations.slice(0, 5).map((evaluation, index) => (
                    <div key={index} className="policy-compliance-history-item">
                      <div className="policy-compliance-history-item__date">
                        {formatTimestamp(evaluation.timestamp)}
                      </div>
                      <div className="policy-compliance-history-item__status">
                        <PolicyStatusIndicator
                          policyStatus={evaluation}
                          asBadge={true}
                          compact={true}
                        />
                      </div>
                      {evaluation.score && (
                        <div className="policy-compliance-history-item__score">
                          {Math.round(evaluation.score * 100)}%
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Export default for easy importing
export default PolicyComplianceCard;
