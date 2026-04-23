/**
 * Governance Recommendations
 *
 * Component providing actionable governance recommendations based on
 * organizational analysis, policy compliance status, and operational
 * patterns with prioritized suggestions and implementation guidance.
 */

import { useEffect, useMemo, useState } from 'react';
import type {
  OrganizationalTrace,
  PolicyStatus,
  TeamMembership,
} from '../../../types/organizational.js';

// Component props
interface GovernanceRecommendationsProps {
  /** Array of policy statuses to analyze */
  policyStatuses?: PolicyStatus[];

  /** Array of traces for pattern analysis */
  traces?: OrganizationalTrace[];

  /** Array of team memberships for governance analysis */
  teamMemberships?: TeamMembership[];

  /** Whether to show implementation steps */
  showImplementationSteps?: boolean;

  /** Whether to show priority indicators */
  showPriorities?: boolean;

  /** Whether to show impact estimates */
  showImpactEstimates?: boolean;

  /** Maximum number of recommendations to show initially */
  initialLimit?: number;

  /** Custom CSS class name */
  className?: string;

  /** Whether to show compact version */
  compact?: boolean;

  /** Callback when recommendation is accepted/implemented */
  onRecommendationAction?: (
    recommendation: GovernanceRecommendation,
    action: RecommendationAction,
  ) => void;

  /** Callback when recommendation details are requested */
  onViewDetails?: (recommendation: GovernanceRecommendation) => void;
}

// Governance recommendation interface
interface GovernanceRecommendation {
  id: string;
  title: string;
  description: string;
  category: GovernanceCategory;
  priority: RecommendationPriority;
  impact: RecommendationImpact;
  effort: RecommendationEffort;
  confidence: number; // 0-1
  implementationSteps: string[];
  benefits: string[];
  risks: string[];
  timeframe: string;
  resources: string[];
  status: 'pending' | 'in_progress' | 'implemented' | 'dismissed';
  evidence: string[]; // Supporting evidence for the recommendation
  relatedPolicies: string[];
  affectedTeams: string[];
  metrics?: {
    expectedImprovement: number; // Percentage improvement expected
    affectedTraces: number;
    riskReduction: number;
  };
}

// Recommendation enums
type GovernanceCategory =
  | 'access_control'
  | 'data_governance'
  | 'policy_enforcement'
  | 'operational_efficiency'
  | 'security_enhancement'
  | 'compliance_improvement'
  | 'team_collaboration'
  | 'process_optimization';

type RecommendationPriority = 'critical' | 'high' | 'medium' | 'low';
type RecommendationImpact = 'high' | 'medium' | 'low';
type RecommendationEffort = 'high' | 'medium' | 'low';
type RecommendationAction = 'accept' | 'dismiss' | 'schedule' | 'view_details';

// Configuration for categories
const CATEGORY_CONFIG: Record<
  GovernanceCategory,
  {
    label: string;
    icon: string;
    color: string;
    description: string;
  }
> = {
  access_control: {
    label: 'Access Control',
    icon: '🔐',
    color: 'var(--org-security)',
    description: 'User permissions and access management improvements',
  },
  data_governance: {
    label: 'Data Governance',
    icon: '🗂️',
    color: 'var(--org-data)',
    description: 'Data management and governance enhancements',
  },
  policy_enforcement: {
    label: 'Policy Enforcement',
    icon: '🛡️',
    color: 'var(--org-policy)',
    description: 'Policy compliance and enforcement improvements',
  },
  operational_efficiency: {
    label: 'Operational Efficiency',
    icon: '⚡',
    color: 'var(--org-efficiency)',
    description: 'Operational process and efficiency optimizations',
  },
  security_enhancement: {
    label: 'Security Enhancement',
    icon: '🔒',
    color: 'var(--org-security)',
    description: 'Security posture and protection improvements',
  },
  compliance_improvement: {
    label: 'Compliance',
    icon: '📋',
    color: 'var(--org-compliance)',
    description: 'Regulatory and compliance adherence enhancements',
  },
  team_collaboration: {
    label: 'Team Collaboration',
    icon: '🤝',
    color: 'var(--org-collaboration)',
    description: 'Team coordination and collaboration improvements',
  },
  process_optimization: {
    label: 'Process Optimization',
    icon: '🔧',
    color: 'var(--org-process)',
    description: 'Workflow and process optimization recommendations',
  },
};

// Priority configuration
const PRIORITY_CONFIG: Record<
  RecommendationPriority,
  {
    label: string;
    color: string;
    weight: number;
  }
> = {
  critical: { label: 'Critical', color: 'var(--fail)', weight: 4 },
  high: { label: 'High', color: 'var(--warn)', weight: 3 },
  medium: { label: 'Medium', color: 'var(--org-primary)', weight: 2 },
  low: { label: 'Low', color: 'var(--t3)', weight: 1 },
};

/**
 * Governance Recommendations Component
 */
export function GovernanceRecommendations({
  policyStatuses = [],
  traces = [],
  teamMemberships = [],
  showImplementationSteps = true,
  showPriorities = true,
  showImpactEstimates = true,
  initialLimit = 5,
  className = '',
  compact = false,
  onRecommendationAction,
  onViewDetails,
}: GovernanceRecommendationsProps) {
  const [recommendations, setRecommendations] = useState<GovernanceRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<GovernanceCategory | 'all'>('all');
  const [expandedRecommendations, setExpandedRecommendations] = useState<Set<string>>(new Set());

  // Generate governance recommendations based on analysis
  useEffect(() => {
    const generateRecommendations = async () => {
      try {
        setLoading(true);
        setError(null);

        const generatedRecommendations: GovernanceRecommendation[] = [];

        // Analyze policy violations for recommendations
        policyStatuses.forEach((policyStatus) => {
          if (policyStatus.violations && policyStatus.violations.length > 0) {
            // Group violations by category
            const violationsByCategory = policyStatus.violations.reduce(
              (acc, violation) => {
                const category = violation.category || 'operational';
                if (!acc[category]) acc[category] = [];
                acc[category].push(violation);
                return acc;
              },
              {} as Record<string, typeof policyStatus.violations>,
            );

            // Generate recommendations for each category
            Object.entries(violationsByCategory).forEach(([category, violations]) => {
              if (violations.length >= 2) {
                // Only recommend if there are multiple violations
                generatedRecommendations.push({
                  id: `policy-${category}-${Date.now()}`,
                  title: `Address ${category.replace(/_/g, ' ')} Policy Violations`,
                  description: `Multiple ${category.replace(/_/g, ' ')} violations detected. Implementing systematic controls could prevent future issues.`,
                  category: category as GovernanceCategory,
                  priority: violations.some((v) => v.severity === 'critical')
                    ? 'critical'
                    : violations.some((v) => v.severity === 'high')
                      ? 'high'
                      : 'medium',
                  impact: violations.length > 5 ? 'high' : violations.length > 2 ? 'medium' : 'low',
                  effort: 'medium',
                  confidence: 0.8,
                  implementationSteps: [
                    `Review all ${violations.length} ${category} violations`,
                    'Identify root cause patterns',
                    'Implement preventive controls',
                    'Update policy documentation',
                    'Train relevant team members',
                  ],
                  benefits: [
                    'Reduced policy violations',
                    'Improved compliance posture',
                    'Better risk management',
                    'Enhanced operational consistency',
                  ],
                  risks: [
                    'Implementation complexity',
                    'Potential workflow disruption',
                    'Training overhead',
                  ],
                  timeframe: '2-4 weeks',
                  resources: ['Policy team', 'Technical team', 'Training resources'],
                  status: 'pending',
                  evidence: [
                    `${violations.length} violations in ${category}`,
                    `Severity levels: ${violations.map((v) => v.severity).join(', ')}`,
                  ],
                  relatedPolicies: violations.map((v) => v.rule),
                  affectedTeams: [],
                  metrics: {
                    expectedImprovement: Math.min(violations.length * 10, 80),
                    affectedTraces: traces.filter((t) =>
                      t.policyStatus?.violations?.some((v) => v.category === category),
                    ).length,
                    riskReduction: violations.length * 15,
                  },
                });
              }
            });
          }
        });

        // Analyze trace patterns for operational recommendations
        if (traces.length > 0) {
          const operatorCounts = new Map<string, number>();
          const teamCounts = new Map<string, number>();
          const errorTraces = traces.filter((t) => t.status === 'error');

          traces.forEach((trace) => {
            const operatorId = trace.operatorContext?.operatorId;
            const teamId = trace.operatorContext?.teamId;

            if (operatorId) {
              operatorCounts.set(operatorId, (operatorCounts.get(operatorId) || 0) + 1);
            }
            if (teamId) {
              teamCounts.set(teamId, (teamCounts.get(teamId) || 0) + 1);
            }
          });

          // Workload distribution recommendation
          if (operatorCounts.size > 1) {
            const workloads = Array.from(operatorCounts.values());
            const maxWorkload = Math.max(...workloads);
            const minWorkload = Math.min(...workloads);
            const workloadImbalance = (maxWorkload - minWorkload) / maxWorkload;

            if (workloadImbalance > 0.5) {
              generatedRecommendations.push({
                id: `workload-distribution-${Date.now()}`,
                title: 'Improve Workload Distribution',
                description:
                  'Significant workload imbalance detected among operators. Redistribution could improve efficiency and reduce burnout.',
                category: 'operational_efficiency',
                priority: 'medium',
                impact: 'medium',
                effort: 'low',
                confidence: 0.7,
                implementationSteps: [
                  'Analyze current workload patterns',
                  'Identify bottlenecks and overloaded operators',
                  'Implement workload balancing strategies',
                  'Monitor and adjust distribution',
                  'Provide additional training if needed',
                ],
                benefits: [
                  'More balanced operator workloads',
                  'Improved operator satisfaction',
                  'Better resource utilization',
                  'Reduced risk of burnout',
                ],
                risks: [
                  'Temporary workflow disruption',
                  'Resistance to change',
                  'Learning curve for new assignments',
                ],
                timeframe: '1-2 weeks',
                resources: ['Team leads', 'HR support', 'Workflow tools'],
                status: 'pending',
                evidence: [
                  `Workload imbalance: ${(workloadImbalance * 100).toFixed(1)}%`,
                  `Max workload: ${maxWorkload}, Min workload: ${minWorkload}`,
                ],
                relatedPolicies: [],
                affectedTeams: Array.from(teamCounts.keys()),
                metrics: {
                  expectedImprovement: Math.round(workloadImbalance * 50),
                  affectedTraces: traces.length,
                  riskReduction: 25,
                },
              });
            }
          }

          // Error rate recommendation
          if (errorTraces.length > traces.length * 0.1) {
            generatedRecommendations.push({
              id: `error-reduction-${Date.now()}`,
              title: 'Reduce Error Rates',
              description: `High error rate detected (${((errorTraces.length / traces.length) * 100).toFixed(1)}%). Implementing error prevention measures could significantly improve reliability.`,
              category: 'operational_efficiency',
              priority: 'high',
              impact: 'high',
              effort: 'medium',
              confidence: 0.9,
              implementationSteps: [
                'Analyze error patterns and root causes',
                'Implement error prevention measures',
                'Enhance error handling and recovery',
                'Add monitoring and alerting',
                'Create error response procedures',
              ],
              benefits: [
                'Reduced error rates',
                'Improved system reliability',
                'Better user experience',
                'Lower operational overhead',
              ],
              risks: [
                'Implementation complexity',
                'Potential performance impact',
                'Training requirements',
              ],
              timeframe: '3-6 weeks',
              resources: ['Development team', 'Operations team', 'Monitoring tools'],
              status: 'pending',
              evidence: [
                `Error rate: ${((errorTraces.length / traces.length) * 100).toFixed(1)}%`,
                `Total errors: ${errorTraces.length} out of ${traces.length} traces`,
              ],
              relatedPolicies: [],
              affectedTeams: Array.from(teamCounts.keys()),
              metrics: {
                expectedImprovement: 60,
                affectedTraces: errorTraces.length,
                riskReduction: 40,
              },
            });
          }
        }

        // Team collaboration recommendations
        if (teamMemberships.length > 1) {
          const smallTeams = teamMemberships.filter((team) => team.members.length < 3);
          if (smallTeams.length > 1) {
            generatedRecommendations.push({
              id: `team-consolidation-${Date.now()}`,
              title: 'Consider Team Consolidation',
              description: `Multiple small teams (${smallTeams.length} teams with <3 members) detected. Consolidation could improve collaboration and resource sharing.`,
              category: 'team_collaboration',
              priority: 'medium',
              impact: 'medium',
              effort: 'high',
              confidence: 0.6,
              implementationSteps: [
                'Analyze team interactions and dependencies',
                'Identify consolidation opportunities',
                'Plan team restructuring',
                'Communicate changes to stakeholders',
                'Implement gradual team consolidation',
                'Monitor collaboration metrics',
              ],
              benefits: [
                'Improved team collaboration',
                'Better resource sharing',
                'Reduced coordination overhead',
                'Enhanced knowledge transfer',
              ],
              risks: [
                'Cultural integration challenges',
                'Temporary productivity decrease',
                'Resistance to organizational change',
                'Loss of team identity',
              ],
              timeframe: '6-12 weeks',
              resources: ['HR team', 'Team leads', 'Change management'],
              status: 'pending',
              evidence: [
                `${smallTeams.length} teams with fewer than 3 members`,
                `Average team size: ${(teamMemberships.reduce((sum, team) => sum + team.members.length, 0) / teamMemberships.length).toFixed(1)}`,
              ],
              relatedPolicies: [],
              affectedTeams: smallTeams.map((team) => team.teamId),
              metrics: {
                expectedImprovement: 30,
                affectedTraces: traces.filter((t) =>
                  smallTeams.some((team) => team.teamId === t.operatorContext?.teamId),
                ).length,
                riskReduction: 20,
              },
            });
          }
        }

        // Sort recommendations by priority and confidence
        const sortedRecommendations = generatedRecommendations.sort((a, b) => {
          const priorityDiff =
            PRIORITY_CONFIG[b.priority].weight - PRIORITY_CONFIG[a.priority].weight;
          if (priorityDiff !== 0) return priorityDiff;
          return b.confidence - a.confidence;
        });

        setRecommendations(sortedRecommendations);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to generate recommendations');
      } finally {
        setLoading(false);
      }
    };

    generateRecommendations();
  }, [policyStatuses, traces, teamMemberships]);

  // Filter recommendations by category
  const filteredRecommendations = useMemo(() => {
    if (selectedCategory === 'all') return recommendations;
    return recommendations.filter((rec) => rec.category === selectedCategory);
  }, [recommendations, selectedCategory]);

  // Get displayed recommendations (with limit)
  const displayedRecommendations = useMemo(() => {
    const limit = showAll ? filteredRecommendations.length : initialLimit;
    return filteredRecommendations.slice(0, limit);
  }, [filteredRecommendations, showAll, initialLimit]);

  // Handle recommendation actions
  const handleRecommendationAction = (
    recommendation: GovernanceRecommendation,
    action: RecommendationAction,
  ) => {
    if (onRecommendationAction) {
      onRecommendationAction(recommendation, action);
    }

    // Update local state
    if (action === 'accept' || action === 'dismiss') {
      setRecommendations((prev) =>
        prev.map((rec) =>
          rec.id === recommendation.id
            ? { ...rec, status: action === 'accept' ? 'in_progress' : 'dismissed' }
            : rec,
        ),
      );
    }
  };

  // Toggle recommendation expansion
  const toggleRecommendation = (recommendationId: string) => {
    setExpandedRecommendations((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(recommendationId)) {
        newSet.delete(recommendationId);
      } else {
        newSet.add(recommendationId);
      }
      return newSet;
    });
  };

  const containerClasses = [
    'org-card',
    'governance-recommendations',
    compact ? 'compact' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  // Loading state
  if (loading) {
    return (
      <div className={containerClasses}>
        <div className="org-card__header">
          <div className="org-card__title">
            <span className="governance-recommendations__icon">💡</span>
            Governance Recommendations
          </div>
        </div>
        <div className="org-card__content">
          <div className="governance-recommendations-loading">
            <div className="governance-recommendations-loading-spinner" />
            <div className="governance-recommendations-loading-text">
              Analyzing organizational patterns...
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={containerClasses}>
        <div className="org-card__header">
          <div className="org-card__title">
            <span className="governance-recommendations__icon">💡</span>
            Governance Recommendations
          </div>
        </div>
        <div className="org-card__content">
          <div className="governance-recommendations-error">
            <div className="governance-recommendations-error__icon">⚠️</div>
            <div className="governance-recommendations-error__message">{error}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={containerClasses}>
      <div className="org-card__header">
        <div className="org-card__title">
          <span className="governance-recommendations__icon">💡</span>
          Governance Recommendations
          {filteredRecommendations.length > 0 && (
            <span className="governance-recommendations__count">
              {filteredRecommendations.length}
            </span>
          )}
        </div>
        {!compact && (
          <div className="org-card__subtitle">
            AI-powered suggestions based on organizational analysis
          </div>
        )}
      </div>

      <div className="org-card__content">
        {/* Category Filter */}
        {!compact && recommendations.length > 0 && (
          <div className="governance-recommendations-filters">
            <div className="governance-recommendations-category-filter">
              <button
                className={`governance-category-filter ${selectedCategory === 'all' ? 'active' : ''}`}
                onClick={() => setSelectedCategory('all')}
              >
                All ({recommendations.length})
              </button>
              {Object.entries(CATEGORY_CONFIG).map(([category, config]) => {
                const count = recommendations.filter((rec) => rec.category === category).length;
                if (count === 0) return null;

                return (
                  <button
                    key={category}
                    className={`governance-category-filter ${selectedCategory === category ? 'active' : ''}`}
                    onClick={() => setSelectedCategory(category as GovernanceCategory)}
                    style={{ borderColor: config.color }}
                  >
                    <span className="governance-category-filter__icon">{config.icon}</span>
                    <span className="governance-category-filter__label">{config.label}</span>
                    <span className="governance-category-filter__count">{count}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Recommendations List */}
        {displayedRecommendations.length > 0 ? (
          <div className="governance-recommendations-list">
            {displayedRecommendations.map((recommendation) => {
              const categoryConfig = CATEGORY_CONFIG[recommendation.category];
              const priorityConfig = PRIORITY_CONFIG[recommendation.priority];
              const isExpanded = expandedRecommendations.has(recommendation.id);

              return (
                <div
                  key={recommendation.id}
                  className={`governance-recommendation ${recommendation.status}`}
                  style={{ borderColor: categoryConfig.color }}
                >
                  <div className="governance-recommendation__header">
                    <button
                      className="governance-recommendation__toggle"
                      onClick={() => toggleRecommendation(recommendation.id)}
                    >
                      <div className="governance-recommendation__main">
                        <div className="governance-recommendation__category">
                          <span
                            className="governance-recommendation__category-icon"
                            style={{ color: categoryConfig.color }}
                          >
                            {categoryConfig.icon}
                          </span>
                          <span className="governance-recommendation__category-label">
                            {categoryConfig.label}
                          </span>
                        </div>

                        {showPriorities && (
                          <div
                            className="governance-recommendation__priority"
                            style={{ color: priorityConfig.color }}
                          >
                            {priorityConfig.label}
                          </div>
                        )}

                        <div className="governance-recommendation__confidence">
                          {Math.round(recommendation.confidence * 100)}% confidence
                        </div>
                      </div>

                      <div className="governance-recommendation__title">{recommendation.title}</div>

                      <div className="governance-recommendation__description">
                        {recommendation.description}
                      </div>

                      <div className="governance-recommendation__arrow">
                        {isExpanded ? '▲' : '▼'}
                      </div>
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="governance-recommendation__details">
                      {/* Benefits and Impact */}
                      {showImpactEstimates && (
                        <div className="governance-recommendation__section">
                          <div className="governance-recommendation__section-title">
                            Expected Benefits
                          </div>
                          <div className="governance-recommendation__benefits">
                            {recommendation.benefits.map((benefit, index) => (
                              <div key={index} className="governance-recommendation__benefit">
                                <span className="governance-recommendation__benefit-bullet">✓</span>
                                {benefit}
                              </div>
                            ))}
                          </div>

                          {recommendation.metrics && (
                            <div className="governance-recommendation__metrics">
                              <div className="governance-recommendation__metric">
                                <span className="governance-recommendation__metric-label">
                                  Expected Improvement:
                                </span>
                                <span className="governance-recommendation__metric-value">
                                  {recommendation.metrics.expectedImprovement}%
                                </span>
                              </div>
                              <div className="governance-recommendation__metric">
                                <span className="governance-recommendation__metric-label">
                                  Risk Reduction:
                                </span>
                                <span className="governance-recommendation__metric-value">
                                  {recommendation.metrics.riskReduction}%
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Implementation Steps */}
                      {showImplementationSteps && (
                        <div className="governance-recommendation__section">
                          <div className="governance-recommendation__section-title">
                            Implementation Steps
                          </div>
                          <div className="governance-recommendation__steps">
                            {recommendation.implementationSteps.map((step, index) => (
                              <div key={index} className="governance-recommendation__step">
                                <span className="governance-recommendation__step-number">
                                  {index + 1}
                                </span>
                                <span className="governance-recommendation__step-text">{step}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Resources and Timeframe */}
                      <div className="governance-recommendation__section">
                        <div className="governance-recommendation__section-title">
                          Implementation Details
                        </div>
                        <div className="governance-recommendation__implementation-details">
                          <div className="governance-recommendation__detail">
                            <span className="governance-recommendation__detail-label">
                              Timeframe:
                            </span>
                            <span className="governance-recommendation__detail-value">
                              {recommendation.timeframe}
                            </span>
                          </div>
                          <div className="governance-recommendation__detail">
                            <span className="governance-recommendation__detail-label">Effort:</span>
                            <span className="governance-recommendation__detail-value">
                              {recommendation.effort}
                            </span>
                          </div>
                          <div className="governance-recommendation__detail">
                            <span className="governance-recommendation__detail-label">
                              Resources:
                            </span>
                            <span className="governance-recommendation__detail-value">
                              {recommendation.resources.join(', ')}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="governance-recommendation__actions">
                        <button
                          className="governance-recommendation__action governance-recommendation__action--accept"
                          onClick={() => handleRecommendationAction(recommendation, 'accept')}
                          disabled={recommendation.status !== 'pending'}
                        >
                          Accept Recommendation
                        </button>
                        <button
                          className="governance-recommendation__action governance-recommendation__action--dismiss"
                          onClick={() => handleRecommendationAction(recommendation, 'dismiss')}
                          disabled={recommendation.status !== 'pending'}
                        >
                          Dismiss
                        </button>
                        {onViewDetails && (
                          <button
                            className="governance-recommendation__action governance-recommendation__action--details"
                            onClick={() => onViewDetails(recommendation)}
                          >
                            View Details
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Show More/Less */}
            {filteredRecommendations.length > initialLimit && (
              <div className="governance-recommendations-actions">
                <button
                  className="governance-recommendations-toggle"
                  onClick={() => setShowAll(!showAll)}
                >
                  {showAll
                    ? `Show Less (${initialLimit})`
                    : `Show All (${filteredRecommendations.length})`}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="governance-recommendations-empty">
            <div className="governance-recommendations-empty__icon">✅</div>
            <div className="governance-recommendations-empty__message">
              No governance recommendations at this time
            </div>
            <div className="governance-recommendations-empty__description">
              Your organizational patterns look good! Recommendations will appear here when analysis
              identifies improvement opportunities.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Export default for easy importing
export default GovernanceRecommendations;
