/**
 * Policy Exemption Indicators
 *
 * Component for displaying policy exemptions with reasons, expiration dates,
 * approval information, and exemption management capabilities including
 * renewal requests and exemption tracking.
 */

import React, { useState, useEffect, useMemo } from 'react';
import type { PolicyComplianceLevel } from '../../../types/organizational.js';

// Component props
interface PolicyExemptionIndicatorsProps {
  /** Team ID to show exemptions for (optional, shows all if not provided) */
  teamId?: string;

  /** Operator ID to show exemptions for (optional) */
  operatorId?: string;

  /** Policy ID to show exemptions for (optional) */
  policyId?: string;

  /** Whether to show only active exemptions */
  showActiveOnly?: boolean;

  /** Whether to show exemption details */
  showDetails?: boolean;

  /** Whether to show renewal options */
  showRenewalOptions?: boolean;

  /** Custom CSS class name */
  className?: string;

  /** Whether to show compact version */
  compact?: boolean;

  /** Callback when exemption is clicked */
  onExemptionClick?: (exemption: PolicyExemption) => void;

  /** Callback when renewal is requested */
  onRenewalRequest?: (exemptionId: string, requestedDuration: number) => void;

  /** Callback when exemption is revoked */
  onExemptionRevoke?: (exemptionId: string, reason: string) => void;
}

// Policy exemption interface
interface PolicyExemption {
  id: string;
  policyId: string;
  policyName: string;
  type: ExemptionType;
  scope: ExemptionScope;
  status: ExemptionStatus;
  reason: string;
  businessJustification: string;
  riskAssessment: RiskAssessment;
  grantedAt: number;
  expiresAt: number;
  grantedBy: string;
  grantedByName?: string;
  beneficiary: ExemptionBeneficiary;
  conditions: ExemptionCondition[];
  monitoring: ExemptionMonitoring;
  renewalHistory: ExemptionRenewal[];
  attachments?: ExemptionAttachment[];
  metadata: {
    requestId?: string;
    approvalWorkflowId?: string;
    category: string;
    tags: string[];
    priority: 'low' | 'medium' | 'high' | 'critical';
  };
}

interface RiskAssessment {
  level: 'low' | 'medium' | 'high' | 'critical';
  score: number; // 0-100
  factors: string[];
  mitigations: string[];
  residualRisk: string;
  assessedBy: string;
  assessedAt: number;
}

interface ExemptionBeneficiary {
  type: 'operator' | 'team' | 'resource' | 'global';
  id: string;
  name?: string;
}

interface ExemptionCondition {
  id: string;
  type: 'temporal' | 'contextual' | 'approval' | 'monitoring';
  description: string;
  parameters: Record<string, any>;
  satisfied: boolean;
}

interface ExemptionMonitoring {
  enabled: boolean;
  frequency: 'continuous' | 'daily' | 'weekly' | 'monthly';
  alerts: ExemptionAlert[];
  usage: ExemptionUsage[];
  lastChecked?: number;
}

interface ExemptionAlert {
  id: string;
  type: 'expiration' | 'usage' | 'violation' | 'condition';
  severity: 'info' | 'warning' | 'error';
  message: string;
  timestamp: number;
  acknowledged: boolean;
}

interface ExemptionUsage {
  timestamp: number;
  action: string;
  result: 'allowed' | 'blocked';
  context: Record<string, any>;
}

interface ExemptionRenewal {
  id: string;
  requestedAt: number;
  requestedBy: string;
  requestedDuration: number;
  status: 'pending' | 'approved' | 'rejected';
  reviewedBy?: string;
  reviewedAt?: number;
  reason?: string;
}

interface ExemptionAttachment {
  id: string;
  name: string;
  type: string;
  size: number;
  uploadedAt: number;
  uploadedBy: string;
}

// Exemption enums
type ExemptionType =
  | 'temporary'
  | 'conditional'
  | 'emergency'
  | 'permanent'
  | 'recurring';

type ExemptionScope =
  | 'specific_action'
  | 'policy_rule'
  | 'entire_policy'
  | 'category';

type ExemptionStatus =
  | 'active'
  | 'expired'
  | 'revoked'
  | 'suspended';

// Configuration
const EXEMPTION_TYPE_CONFIG: Record<ExemptionType, {
  label: string;
  icon: string;
  color: string;
  description: string;
}> = {
  temporary: {
    label: 'Temporary',
    icon: '⏰',
    color: 'var(--org-temporal)',
    description: 'Limited time exemption'
  },
  conditional: {
    label: 'Conditional',
    icon: '🔀',
    color: 'var(--org-conditional)',
    description: 'Exemption with specific conditions'
  },
  emergency: {
    label: 'Emergency',
    icon: '🚨',
    color: 'var(--fail)',
    description: 'Emergency override exemption'
  },
  permanent: {
    label: 'Permanent',
    icon: '♾️',
    color: 'var(--org-permanent)',
    description: 'Long-term exemption'
  },
  recurring: {
    label: 'Recurring',
    icon: '🔄',
    color: 'var(--org-recurring)',
    description: 'Regularly renewed exemption'
  }
};

const RISK_LEVEL_CONFIG = {
  low: { label: 'Low', color: 'var(--success)', icon: '🟢' },
  medium: { label: 'Medium', color: 'var(--warn)', icon: '🟡' },
  high: { label: 'High', color: 'var(--fail)', icon: '🟠' },
  critical: { label: 'Critical', color: 'var(--fail)', icon: '🔴' }
};

/**
 * Policy Exemption Indicators Component
 */
export function PolicyExemptionIndicators({
  teamId,
  operatorId,
  policyId,
  showActiveOnly = true,
  showDetails = true,
  showRenewalOptions = true,
  className = '',
  compact = false,
  onExemptionClick,
  onRenewalRequest,
  onExemptionRevoke
}: PolicyExemptionIndicatorsProps) {
  const [exemptions, setExemptions] = useState<PolicyExemption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedExemption, setSelectedExemption] = useState<string | null>(null);
  const [showRenewalDialog, setShowRenewalDialog] = useState<{
    exemptionId: string;
    currentDuration: number;
  } | null>(null);

  // Load exemptions
  useEffect(() => {
    const loadExemptions = async () => {
      try {
        setLoading(true);
        setError(null);

        const params = new URLSearchParams({
          ...(teamId && { teamId }),
          ...(operatorId && { operatorId }),
          ...(policyId && { policyId }),
          ...(showActiveOnly && { status: 'active' })
        });

        const response = await fetch(`/api/policy/exemptions?${params}`);
        if (!response.ok) {
          throw new Error(`Failed to load exemptions: ${response.statusText}`);
        }

        const data = await response.json();
        setExemptions(data.exemptions || []);

      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load exemptions');
        // Generate mock data for development
        const mockExemptions = generateMockExemptions();
        setExemptions(mockExemptions);
      } finally {
        setLoading(false);
      }
    };

    loadExemptions();
  }, [teamId, operatorId, policyId, showActiveOnly]);

  // Generate mock exemption data
  const generateMockExemptions = (): PolicyExemption[] => {
    const types: ExemptionType[] = ['temporary', 'conditional', 'emergency'];
    const statuses: ExemptionStatus[] = ['active', 'active', 'expired'];
    const riskLevels: ('low' | 'medium' | 'high' | 'critical')[] = ['low', 'medium', 'high'];

    return Array.from({ length: 4 }, (_, index) => {
      const type = types[index % types.length];
      const status = statuses[index % statuses.length];
      const riskLevel = riskLevels[index % riskLevels.length];
      const now = Date.now();
      const grantedAt = now - (index * 7 * 24 * 60 * 60 * 1000);
      const expiresAt = grantedAt + (30 * 24 * 60 * 60 * 1000); // 30 days

      return {
        id: `exemption-${index + 1}`,
        policyId: policyId || `policy-${index + 1}`,
        policyName: `Data Access Policy ${index + 1}`,
        type,
        scope: index === 0 ? 'specific_action' : 'policy_rule',
        status,
        reason: `${type} exemption for critical business operation`,
        businessJustification: `Required for urgent ${type} business requirements that cannot wait for standard policy compliance`,
        riskAssessment: {
          level: riskLevel,
          score: riskLevel === 'low' ? 25 : riskLevel === 'medium' ? 50 : riskLevel === 'high' ? 75 : 90,
          factors: [`${riskLevel} risk operation`, 'Limited scope', 'Temporary duration'],
          mitigations: ['Enhanced monitoring', 'Regular reviews', 'Approval workflow'],
          residualRisk: `${riskLevel} residual risk after mitigations`,
          assessedBy: 'risk-officer',
          assessedAt: grantedAt
        },
        grantedAt,
        expiresAt: status === 'active' ? expiresAt : grantedAt + (15 * 24 * 60 * 60 * 1000),
        grantedBy: 'policy-admin',
        grantedByName: 'Policy Administrator',
        beneficiary: {
          type: operatorId ? 'operator' : teamId ? 'team' : 'resource',
          id: operatorId || teamId || `resource-${index}`,
          name: operatorId ? 'Current User' : teamId ? `Team ${teamId.substring(0, 8)}` : `Resource ${index}`
        },
        conditions: [
          {
            id: `condition-${index}-1`,
            type: 'temporal',
            description: 'Valid only during business hours',
            parameters: { startHour: 9, endHour: 17 },
            satisfied: true
          },
          {
            id: `condition-${index}-2`,
            type: 'monitoring',
            description: 'All actions must be logged',
            parameters: { logLevel: 'detailed' },
            satisfied: true
          }
        ],
        monitoring: {
          enabled: true,
          frequency: 'continuous',
          alerts: status === 'active' && index === 0 ? [
            {
              id: 'alert-1',
              type: 'expiration',
              severity: 'warning',
              message: 'Exemption expires in 7 days',
              timestamp: now - (60 * 60 * 1000),
              acknowledged: false
            }
          ] : [],
          usage: [
            {
              timestamp: now - (2 * 60 * 60 * 1000),
              action: 'data_access',
              result: 'allowed',
              context: { resource: 'sensitive-data', reason: 'business-critical' }
            }
          ],
          lastChecked: now - (30 * 60 * 1000)
        },
        renewalHistory: index === 1 ? [
          {
            id: 'renewal-1',
            requestedAt: grantedAt - (10 * 24 * 60 * 60 * 1000),
            requestedBy: 'current-user',
            requestedDuration: 30 * 24 * 60 * 60 * 1000,
            status: 'approved',
            reviewedBy: 'policy-admin',
            reviewedAt: grantedAt - (9 * 24 * 60 * 60 * 1000),
            reason: 'Legitimate business need continues'
          }
        ] : [],
        metadata: {
          requestId: `request-${index + 1}`,
          category: 'data_access',
          tags: [type, riskLevel, 'business-critical'],
          priority: riskLevel === 'critical' ? 'critical' : riskLevel === 'high' ? 'high' : 'medium'
        }
      };
    });
  };

  // Filter and sort exemptions
  const sortedExemptions = useMemo(() => {
    let filtered = exemptions;

    if (showActiveOnly) {
      filtered = filtered.filter(exemption => exemption.status === 'active');
    }

    return filtered.sort((a, b) => {
      // Sort by expiration date (soonest first) for active exemptions
      if (a.status === 'active' && b.status === 'active') {
        return a.expiresAt - b.expiresAt;
      }
      // Active exemptions first
      if (a.status === 'active' && b.status !== 'active') return -1;
      if (a.status !== 'active' && b.status === 'active') return 1;
      // Then by granted date (newest first)
      return b.grantedAt - a.grantedAt;
    });
  }, [exemptions, showActiveOnly]);

  // Get exemptions expiring soon
  const expiringExemptions = useMemo(() => {
    const now = Date.now();
    const sevenDaysFromNow = now + (7 * 24 * 60 * 60 * 1000);

    return sortedExemptions.filter(exemption =>
      exemption.status === 'active' &&
      exemption.expiresAt <= sevenDaysFromNow
    );
  }, [sortedExemptions]);

  // Format time remaining
  const formatTimeRemaining = (expiresAt: number): string => {
    const now = Date.now();
    const remaining = expiresAt - now;

    if (remaining < 0) return 'Expired';

    const days = Math.floor(remaining / (24 * 60 * 60 * 1000));
    const hours = Math.floor((remaining % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));

    if (days > 0) return `${days}d ${hours}h remaining`;
    if (hours > 0) return `${hours}h remaining`;
    return 'Expires soon';
  };

  // Handle renewal request
  const handleRenewalRequest = (exemptionId: string, duration: number) => {
    if (onRenewalRequest) {
      onRenewalRequest(exemptionId, duration);
    }

    // Update local state to show pending renewal
    setExemptions(prev => prev.map(exemption =>
      exemption.id === exemptionId
        ? {
            ...exemption,
            renewalHistory: [
              ...exemption.renewalHistory,
              {
                id: `renewal-${Date.now()}`,
                requestedAt: Date.now(),
                requestedBy: 'current-user',
                requestedDuration: duration,
                status: 'pending'
              }
            ]
          }
        : exemption
    ));

    setShowRenewalDialog(null);
  };

  const containerClasses = [
    'org-card',
    'policy-exemption-indicators',
    compact ? 'compact' : '',
    className
  ].filter(Boolean).join(' ');

  // Loading state
  if (loading) {
    return (
      <div className={containerClasses}>
        <div className="org-card__header">
          <div className="org-card__title">
            <span className="policy-exemption-indicators__icon">🛡️</span>
            Policy Exemptions
          </div>
        </div>
        <div className="org-card__content">
          <div className="policy-exemption-loading">
            <div className="policy-exemption-loading-spinner" />
            <div className="policy-exemption-loading-text">
              Loading policy exemptions...
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error && sortedExemptions.length === 0) {
    return (
      <div className={containerClasses}>
        <div className="org-card__header">
          <div className="org-card__title">
            <span className="policy-exemption-indicators__icon">🛡️</span>
            Policy Exemptions
          </div>
        </div>
        <div className="org-card__content">
          <div className="policy-exemption-error">
            <div className="policy-exemption-error__icon">⚠️</div>
            <div className="policy-exemption-error__message">
              {error}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={containerClasses}>
      <div className="org-card__header">
        <div className="org-card__title">
          <span className="policy-exemption-indicators__icon">🛡️</span>
          Policy Exemptions
          {sortedExemptions.length > 0 && (
            <span className="policy-exemption-indicators__count">
              {sortedExemptions.length}
            </span>
          )}
        </div>
        {expiringExemptions.length > 0 && (
          <div className="org-card__subtitle">
            ⚠️ {expiringExemptions.length} expiring soon
          </div>
        )}
      </div>

      <div className="org-card__content">
        {/* Expiring Exemptions Alert */}
        {expiringExemptions.length > 0 && !compact && (
          <div className="policy-exemption-expiring-alert">
            <div className="policy-exemption-expiring-alert__header">
              <div className="policy-exemption-expiring-alert__icon">⚠️</div>
              <div className="policy-exemption-expiring-alert__title">
                Exemptions Expiring Soon
              </div>
            </div>
            <div className="policy-exemption-expiring-list">
              {expiringExemptions.slice(0, 3).map(exemption => {
                const typeConfig = EXEMPTION_TYPE_CONFIG[exemption.type];

                return (
                  <div key={exemption.id} className="policy-exemption-expiring-item">
                    <div className="policy-exemption-expiring-item__info">
                      <span
                        className="policy-exemption-expiring-item__icon"
                        style={{ color: typeConfig.color }}
                      >
                        {typeConfig.icon}
                      </span>
                      <span className="policy-exemption-expiring-item__name">
                        {exemption.policyName}
                      </span>
                      <span className="policy-exemption-expiring-item__time">
                        {formatTimeRemaining(exemption.expiresAt)}
                      </span>
                    </div>

                    {showRenewalOptions && (
                      <button
                        className="policy-exemption-expiring-item__renew"
                        onClick={() => setShowRenewalDialog({
                          exemptionId: exemption.id,
                          currentDuration: exemption.expiresAt - exemption.grantedAt
                        })}
                      >
                        Renew
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Exemptions List */}
        {sortedExemptions.length > 0 ? (
          <div className="policy-exemption-list">
            {sortedExemptions.slice(0, compact ? 3 : 8).map(exemption => {
              const typeConfig = EXEMPTION_TYPE_CONFIG[exemption.type];
              const riskConfig = RISK_LEVEL_CONFIG[exemption.riskAssessment.level];
              const isExpanded = selectedExemption === exemption.id;
              const isExpiring = exemption.status === 'active' && exemption.expiresAt <= Date.now() + (7 * 24 * 60 * 60 * 1000);

              return (
                <div
                  key={exemption.id}
                  className={`policy-exemption-item ${exemption.status} ${isExpiring ? 'expiring' : ''} ${isExpanded ? 'expanded' : ''}`}
                  style={{ borderColor: typeConfig.color }}
                >
                  <button
                    className="policy-exemption-item__header"
                    onClick={() => setSelectedExemption(isExpanded ? null : exemption.id)}
                  >
                    <div className="policy-exemption-item__main">
                      <div className="policy-exemption-item__type">
                        <span
                          className="policy-exemption-item__icon"
                          style={{ color: typeConfig.color }}
                        >
                          {typeConfig.icon}
                        </span>
                        <span className="policy-exemption-item__label">
                          {typeConfig.label}
                        </span>
                      </div>

                      <div className="policy-exemption-item__policy">
                        {exemption.policyName}
                      </div>

                      <div className="policy-exemption-item__beneficiary">
                        {exemption.beneficiary.name || exemption.beneficiary.id}
                      </div>
                    </div>

                    <div className="policy-exemption-item__status-row">
                      <div className={`policy-exemption-item__status ${exemption.status}`}>
                        {exemption.status}
                      </div>
                      <div
                        className="policy-exemption-item__risk"
                        style={{ color: riskConfig.color }}
                      >
                        {riskConfig.icon} {riskConfig.label}
                      </div>
                      <div className="policy-exemption-item__expiry">
                        {formatTimeRemaining(exemption.expiresAt)}
                      </div>
                    </div>

                    <div className="policy-exemption-item__arrow">
                      {isExpanded ? '▲' : '▼'}
                    </div>
                  </button>

                  {isExpanded && showDetails && (
                    <div className="policy-exemption-item__details">
                      {/* Reason and Justification */}
                      <div className="policy-exemption-detail-section">
                        <div className="policy-exemption-detail-section__title">
                          Exemption Details
                        </div>
                        <div className="policy-exemption-detail-section__content">
                          <div className="policy-exemption-detail-field">
                            <div className="policy-exemption-detail-field__label">Reason:</div>
                            <div className="policy-exemption-detail-field__value">
                              {exemption.reason}
                            </div>
                          </div>
                          <div className="policy-exemption-detail-field">
                            <div className="policy-exemption-detail-field__label">Business Justification:</div>
                            <div className="policy-exemption-detail-field__value">
                              {exemption.businessJustification}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Conditions */}
                      {exemption.conditions.length > 0 && (
                        <div className="policy-exemption-detail-section">
                          <div className="policy-exemption-detail-section__title">
                            Conditions ({exemption.conditions.length})
                          </div>
                          <div className="policy-exemption-conditions">
                            {exemption.conditions.map(condition => (
                              <div
                                key={condition.id}
                                className={`policy-exemption-condition ${condition.satisfied ? 'satisfied' : 'unsatisfied'}`}
                              >
                                <div className="policy-exemption-condition__status">
                                  {condition.satisfied ? '✅' : '❌'}
                                </div>
                                <div className="policy-exemption-condition__description">
                                  {condition.description}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Risk Assessment */}
                      <div className="policy-exemption-detail-section">
                        <div className="policy-exemption-detail-section__title">
                          Risk Assessment
                        </div>
                        <div className="policy-exemption-risk-assessment">
                          <div className="policy-exemption-risk-level">
                            <span
                              className="policy-exemption-risk-level__icon"
                              style={{ color: riskConfig.color }}
                            >
                              {riskConfig.icon}
                            </span>
                            <span className="policy-exemption-risk-level__label">
                              {riskConfig.label} Risk
                            </span>
                            <span className="policy-exemption-risk-level__score">
                              ({exemption.riskAssessment.score}/100)
                            </span>
                          </div>

                          <div className="policy-exemption-risk-factors">
                            <div className="policy-exemption-risk-factors__title">Risk Factors:</div>
                            <div className="policy-exemption-risk-factors__list">
                              {exemption.riskAssessment.factors.map((factor, index) => (
                                <div key={index} className="policy-exemption-risk-factor">
                                  • {factor}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Monitoring */}
                      {exemption.monitoring.alerts.length > 0 && (
                        <div className="policy-exemption-detail-section">
                          <div className="policy-exemption-detail-section__title">
                            Active Alerts
                          </div>
                          <div className="policy-exemption-alerts">
                            {exemption.monitoring.alerts.slice(0, 3).map(alert => (
                              <div
                                key={alert.id}
                                className={`policy-exemption-alert ${alert.severity}`}
                              >
                                <div className="policy-exemption-alert__severity">
                                  {alert.severity === 'error' && '❌'}
                                  {alert.severity === 'warning' && '⚠️'}
                                  {alert.severity === 'info' && 'ℹ️'}
                                </div>
                                <div className="policy-exemption-alert__message">
                                  {alert.message}
                                </div>
                                <div className="policy-exemption-alert__timestamp">
                                  {new Date(alert.timestamp).toLocaleString()}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="policy-exemption-item__actions">
                        {showRenewalOptions && exemption.status === 'active' && (
                          <button
                            className="policy-exemption-action policy-exemption-action--renew"
                            onClick={() => setShowRenewalDialog({
                              exemptionId: exemption.id,
                              currentDuration: exemption.expiresAt - exemption.grantedAt
                            })}
                          >
                            Request Renewal
                          </button>
                        )}

                        {onExemptionClick && (
                          <button
                            className="policy-exemption-action policy-exemption-action--details"
                            onClick={() => onExemptionClick(exemption)}
                          >
                            View Full Details
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {sortedExemptions.length > (compact ? 3 : 8) && (
              <div className="policy-exemption-more">
                +{sortedExemptions.length - (compact ? 3 : 8)} more exemption{sortedExemptions.length - (compact ? 3 : 8) !== 1 ? 's' : ''}
              </div>
            )}
          </div>
        ) : (
          <div className="policy-exemption-empty">
            <div className="policy-exemption-empty__icon">🛡️</div>
            <div className="policy-exemption-empty__message">
              No policy exemptions
            </div>
            <div className="policy-exemption-empty__description">
              Policy exemptions will appear here when granted for specific policies or operations.
            </div>
          </div>
        )}
      </div>

      {/* Renewal Dialog */}
      {showRenewalDialog && (
        <div className="policy-exemption-renewal-dialog-overlay">
          <div className="policy-exemption-renewal-dialog">
            <div className="policy-exemption-renewal-dialog__header">
              <div className="policy-exemption-renewal-dialog__title">
                Request Exemption Renewal
              </div>
              <button
                className="policy-exemption-renewal-dialog__close"
                onClick={() => setShowRenewalDialog(null)}
              >
                ×
              </button>
            </div>

            <div className="policy-exemption-renewal-dialog__content">
              <div className="policy-exemption-renewal-dialog__field">
                <label className="policy-exemption-renewal-dialog__label">
                  Renewal Duration:
                </label>
                <select className="policy-exemption-renewal-dialog__select">
                  <option value={7 * 24 * 60 * 60 * 1000}>7 days</option>
                  <option value={14 * 24 * 60 * 60 * 1000}>14 days</option>
                  <option value={30 * 24 * 60 * 60 * 1000}>30 days</option>
                  <option value={90 * 24 * 60 * 60 * 1000}>90 days</option>
                </select>
              </div>
            </div>

            <div className="policy-exemption-renewal-dialog__actions">
              <button
                className="policy-exemption-renewal-dialog__action policy-exemption-renewal-dialog__action--cancel"
                onClick={() => setShowRenewalDialog(null)}
              >
                Cancel
              </button>
              <button
                className="policy-exemption-renewal-dialog__action policy-exemption-renewal-dialog__action--submit"
                onClick={() => handleRenewalRequest(showRenewalDialog.exemptionId, 30 * 24 * 60 * 60 * 1000)}
              >
                Request Renewal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Export default for easy importing
export default PolicyExemptionIndicators;