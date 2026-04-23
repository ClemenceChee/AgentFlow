/**
 * Policy Configuration View
 *
 * Component for displaying and managing active policy rules, enforcement levels,
 * configuration settings, and policy management controls with real-time
 * status updates and administrative capabilities.
 */

import { useEffect, useMemo, useState } from 'react';
import type { TeamAccessLevel } from '../../../types/organizational.js';

// Component props
interface PolicyConfigurationViewProps {
  /** Team ID to show configuration for (optional, shows global if not provided) */
  teamId?: string;

  /** Whether to show only active policies */
  showActiveOnly?: boolean;

  /** Whether to show enforcement controls */
  showEnforcementControls?: boolean;

  /** Whether to show policy editing capabilities */
  showEditing?: boolean;

  /** Whether to show policy testing features */
  showTesting?: boolean;

  /** Current user's access level */
  userAccessLevel?: TeamAccessLevel;

  /** Custom CSS class name */
  className?: string;

  /** Whether to show compact version */
  compact?: boolean;

  /** Callback when policy is toggled */
  onPolicyToggle?: (policyId: string, enabled: boolean) => void;

  /** Callback when enforcement level is changed */
  onEnforcementChange?: (policyId: string, level: PolicyEnforcementLevel) => void;

  /** Callback when policy configuration is updated */
  onConfigurationUpdate?: (policyId: string, configuration: PolicyConfiguration) => void;
}

// Policy configuration interfaces
interface PolicyConfiguration {
  id: string;
  name: string;
  description: string;
  category: PolicyCategory;
  version: string;
  status: PolicyStatus;
  enforcementLevel: PolicyEnforcementLevel;
  scope: PolicyScope;
  rules: PolicyRule[];
  conditions: PolicyCondition[];
  actions: PolicyAction[];
  metadata: {
    createdAt: number;
    updatedAt: number;
    createdBy: string;
    lastModifiedBy: string;
    tags: string[];
    priority: number;
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
  };
  deployment: {
    environment: 'development' | 'staging' | 'production';
    rolloutPercentage: number;
    targetTeams?: string[];
    excludedTeams?: string[];
  };
  monitoring: {
    enabled: boolean;
    alerting: boolean;
    metrics: PolicyMetrics;
  };
  testing: {
    testCases: PolicyTestCase[];
    lastTested?: number;
    testResults?: PolicyTestResult[];
  };
}

interface PolicyRule {
  id: string;
  name: string;
  description: string;
  type: PolicyRuleType;
  condition: string; // JSONLogic or similar expression
  enabled: boolean;
  severity: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  parameters: Record<string, any>;
}

interface PolicyCondition {
  id: string;
  type: 'time' | 'user' | 'team' | 'resource' | 'context';
  operator: 'equals' | 'not_equals' | 'contains' | 'matches' | 'greater_than' | 'less_than';
  field: string;
  value: any;
  enabled: boolean;
}

interface PolicyAction {
  id: string;
  type: PolicyActionType;
  parameters: Record<string, any>;
  enabled: boolean;
  order: number;
}

interface PolicyMetrics {
  evaluationCount: number;
  violationCount: number;
  complianceRate: number;
  lastEvaluation?: number;
  averageEvaluationTime: number;
}

interface PolicyTestCase {
  id: string;
  name: string;
  description: string;
  input: Record<string, any>;
  expectedOutput: {
    compliant: boolean;
    violations?: string[];
    actions?: string[];
  };
}

interface PolicyTestResult {
  testCaseId: string;
  passed: boolean;
  actualOutput: any;
  executionTime: number;
  timestamp: number;
}

// Enums
type PolicyCategory =
  | 'data_governance'
  | 'access_control'
  | 'security'
  | 'compliance'
  | 'operational'
  | 'privacy';

type PolicyStatus = 'draft' | 'active' | 'deprecated' | 'disabled';

type PolicyEnforcementLevel = 'monitor' | 'warn' | 'block' | 'audit';

type PolicyScope = 'global' | 'team' | 'operator' | 'resource';

type PolicyRuleType = 'validation' | 'restriction' | 'requirement' | 'guideline';

type PolicyActionType = 'log' | 'alert' | 'block' | 'redirect' | 'approve' | 'audit';

// Configuration
const ENFORCEMENT_LEVEL_CONFIG: Record<
  PolicyEnforcementLevel,
  {
    label: string;
    icon: string;
    color: string;
    description: string;
  }
> = {
  monitor: {
    label: 'Monitor',
    icon: '👁️',
    color: 'var(--org-monitor)',
    description: 'Track violations but do not prevent actions',
  },
  warn: {
    label: 'Warn',
    icon: '⚠️',
    color: 'var(--warn)',
    description: 'Show warnings but allow actions to proceed',
  },
  block: {
    label: 'Block',
    icon: '🚫',
    color: 'var(--fail)',
    description: 'Prevent actions that violate policy',
  },
  audit: {
    label: 'Audit',
    icon: '📋',
    color: 'var(--org-audit)',
    description: 'Log all actions for compliance review',
  },
};

const CATEGORY_CONFIG: Record<
  PolicyCategory,
  {
    label: string;
    icon: string;
    color: string;
  }
> = {
  data_governance: { label: 'Data Governance', icon: '🗂️', color: 'var(--org-data)' },
  access_control: { label: 'Access Control', icon: '🔐', color: 'var(--org-access)' },
  security: { label: 'Security', icon: '🔒', color: 'var(--org-security)' },
  compliance: { label: 'Compliance', icon: '📋', color: 'var(--org-compliance)' },
  operational: { label: 'Operational', icon: '⚙️', color: 'var(--org-operational)' },
  privacy: { label: 'Privacy', icon: '🛡️', color: 'var(--org-privacy)' },
};

/**
 * Policy Configuration View Component
 */
export function PolicyConfigurationView({
  teamId,
  showActiveOnly = false,
  showEnforcementControls = true,
  showEditing = false,
  showTesting = false,
  userAccessLevel = 'member',
  className = '',
  compact = false,
  onPolicyToggle,
  onEnforcementChange,
  onConfigurationUpdate,
}: PolicyConfigurationViewProps) {
  const [policies, setPolicies] = useState<PolicyConfiguration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPolicy, setSelectedPolicy] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<PolicyCategory | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Load policy configurations
  useEffect(() => {
    const loadPolicies = async () => {
      try {
        setLoading(true);
        setError(null);

        const params = new URLSearchParams({
          ...(teamId && { teamId }),
          ...(showActiveOnly && { status: 'active' }),
        });

        const response = await fetch(`/api/policies/configuration?${params}`);
        if (!response.ok) {
          throw new Error(`Failed to load policy configuration: ${response.statusText}`);
        }

        const data = await response.json();
        setPolicies(data.policies || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load policy configuration');
        // Generate mock data for development
        const mockPolicies = generateMockPolicies();
        setPolicies(mockPolicies);
      } finally {
        setLoading(false);
      }
    };

    loadPolicies();
  }, [teamId, showActiveOnly, generateMockPolicies]);

  // Generate mock policy data
  const generateMockPolicies = (): PolicyConfiguration[] => {
    const categories: PolicyCategory[] = ['data_governance', 'access_control', 'security'];
    const enforcementLevels: PolicyEnforcementLevel[] = ['monitor', 'warn', 'block', 'audit'];
    const statuses: PolicyStatus[] = ['active', 'draft', 'active', 'active'];

    return Array.from({ length: 6 }, (_, index) => {
      const category = categories[index % categories.length];
      const status = statuses[index % statuses.length];
      const enforcementLevel = enforcementLevels[index % enforcementLevels.length];
      const now = Date.now();

      return {
        id: `policy-${index + 1}`,
        name: `${CATEGORY_CONFIG[category].label} Policy ${index + 1}`,
        description: `Comprehensive ${category.replace('_', ' ')} policy with automated enforcement`,
        category,
        version: `v1.${index}`,
        status,
        enforcementLevel,
        scope: index === 0 ? 'global' : 'team',
        rules: [
          {
            id: `rule-${index}-1`,
            name: `${category} validation rule`,
            description: 'Primary validation rule for policy compliance',
            type: 'validation',
            condition: `{"and": [{"var": "category"}, {"==": [{"var": "category"}, "${category}"]}]}`,
            enabled: true,
            severity: index === 0 ? 'critical' : index === 1 ? 'error' : 'warning',
            message: `${category} validation failed`,
            parameters: { threshold: 0.8, timeout: 30 },
          },
        ],
        conditions: [
          {
            id: `condition-${index}-1`,
            type: 'team',
            operator: 'equals',
            field: 'teamId',
            value: teamId || 'any',
            enabled: true,
          },
        ],
        actions: [
          {
            id: `action-${index}-1`,
            type:
              enforcementLevel === 'block'
                ? 'block'
                : enforcementLevel === 'warn'
                  ? 'alert'
                  : 'log',
            parameters: { message: 'Policy violation detected', severity: 'medium' },
            enabled: true,
            order: 1,
          },
        ],
        metadata: {
          createdAt: now - index * 30 * 24 * 60 * 60 * 1000,
          updatedAt: now - index * 7 * 24 * 60 * 60 * 1000,
          createdBy: 'policy-admin',
          lastModifiedBy: 'policy-admin',
          tags: [category, 'automated', status],
          priority: index === 0 ? 10 : index < 3 ? 7 : 5,
          riskLevel: index === 0 ? 'critical' : index === 1 ? 'high' : 'medium',
        },
        deployment: {
          environment: 'production',
          rolloutPercentage: status === 'active' ? 100 : 0,
          targetTeams: teamId ? [teamId] : undefined,
        },
        monitoring: {
          enabled: true,
          alerting: enforcementLevel !== 'monitor',
          metrics: {
            evaluationCount: Math.floor(Math.random() * 1000) + 100,
            violationCount: Math.floor(Math.random() * 50),
            complianceRate: 0.85 + Math.random() * 0.1,
            lastEvaluation: now - Math.floor(Math.random() * 60 * 60 * 1000),
            averageEvaluationTime: Math.floor(Math.random() * 100) + 20,
          },
        },
        testing: {
          testCases: [
            {
              id: `test-${index}-1`,
              name: 'Basic compliance test',
              description: 'Test basic policy compliance scenarios',
              input: { category, teamId: teamId || 'test-team', operatorId: 'test-operator' },
              expectedOutput: { compliant: true },
            },
          ],
          lastTested: now - 2 * 24 * 60 * 60 * 1000,
          testResults: [
            {
              testCaseId: `test-${index}-1`,
              passed: Math.random() > 0.2,
              actualOutput: { compliant: true },
              executionTime: Math.floor(Math.random() * 100) + 10,
              timestamp: now - 2 * 24 * 60 * 60 * 1000,
            },
          ],
        },
      };
    });
  };

  // Filter policies based on category and search
  const filteredPolicies = useMemo(() => {
    let filtered = policies;

    // Filter by category
    if (filterCategory !== 'all') {
      filtered = filtered.filter((policy) => policy.category === filterCategory);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (policy) =>
          policy.name.toLowerCase().includes(query) ||
          policy.description.toLowerCase().includes(query) ||
          policy.category.toLowerCase().includes(query),
      );
    }

    // Filter by active status if requested
    if (showActiveOnly) {
      filtered = filtered.filter((policy) => policy.status === 'active');
    }

    return filtered.sort((a, b) => b.metadata.priority - a.metadata.priority);
  }, [policies, filterCategory, searchQuery, showActiveOnly]);

  // Check if user can modify policies
  const canModifyPolicies = userAccessLevel === 'admin' || userAccessLevel === 'maintainer';

  // Handle policy toggle
  const handlePolicyToggle = (policyId: string, enabled: boolean) => {
    if (!canModifyPolicies) return;

    setPolicies((prev) =>
      prev.map((policy) =>
        policy.id === policyId ? { ...policy, status: enabled ? 'active' : 'disabled' } : policy,
      ),
    );

    if (onPolicyToggle) {
      onPolicyToggle(policyId, enabled);
    }
  };

  // Handle enforcement level change
  const handleEnforcementChange = (policyId: string, level: PolicyEnforcementLevel) => {
    if (!canModifyPolicies) return;

    setPolicies((prev) =>
      prev.map((policy) =>
        policy.id === policyId ? { ...policy, enforcementLevel: level } : policy,
      ),
    );

    if (onEnforcementChange) {
      onEnforcementChange(policyId, level);
    }
  };

  const containerClasses = [
    'org-card',
    'policy-configuration-view',
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
            <span className="policy-configuration-view__icon">⚙️</span>
            Policy Configuration
          </div>
        </div>
        <div className="org-card__content">
          <div className="policy-configuration-loading">
            <div className="policy-configuration-loading-spinner" />
            <div className="policy-configuration-loading-text">Loading policy configuration...</div>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error && filteredPolicies.length === 0) {
    return (
      <div className={containerClasses}>
        <div className="org-card__header">
          <div className="org-card__title">
            <span className="policy-configuration-view__icon">⚙️</span>
            Policy Configuration
          </div>
        </div>
        <div className="org-card__content">
          <div className="policy-configuration-error">
            <div className="policy-configuration-error__icon">⚠️</div>
            <div className="policy-configuration-error__message">{error}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={containerClasses}>
      <div className="org-card__header">
        <div className="org-card__title">
          <span className="policy-configuration-view__icon">⚙️</span>
          Policy Configuration
          {teamId && (
            <span className="policy-configuration-view__scope">
              • Team {teamId.substring(0, 8)}
            </span>
          )}
        </div>
        <div className="org-card__subtitle">
          {filteredPolicies.length} polic{filteredPolicies.length !== 1 ? 'ies' : 'y'} configured
        </div>
      </div>

      <div className="org-card__content">
        {/* Filters and Search */}
        {!compact && (
          <div className="policy-configuration-filters">
            <div className="policy-configuration-search">
              <input
                type="text"
                className="policy-configuration-search__input"
                placeholder="Search policies..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <span className="policy-configuration-search__icon">🔍</span>
            </div>

            <div className="policy-configuration-category-filter">
              <button
                className={`policy-category-filter ${filterCategory === 'all' ? 'active' : ''}`}
                onClick={() => setFilterCategory('all')}
              >
                All ({policies.length})
              </button>
              {Object.entries(CATEGORY_CONFIG).map(([category, config]) => {
                const count = policies.filter((p) => p.category === category).length;
                if (count === 0) return null;

                return (
                  <button
                    key={category}
                    className={`policy-category-filter ${filterCategory === category ? 'active' : ''}`}
                    onClick={() => setFilterCategory(category as PolicyCategory)}
                    style={{ borderColor: config.color }}
                  >
                    <span className="policy-category-filter__icon">{config.icon}</span>
                    <span className="policy-category-filter__label">{config.label}</span>
                    <span className="policy-category-filter__count">{count}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Policy List */}
        {filteredPolicies.length > 0 ? (
          <div className="policy-configuration-list">
            {filteredPolicies.slice(0, compact ? 5 : 10).map((policy) => {
              const categoryConfig = CATEGORY_CONFIG[policy.category];
              const enforcementConfig = ENFORCEMENT_LEVEL_CONFIG[policy.enforcementLevel];
              const isExpanded = selectedPolicy === policy.id;

              return (
                <div
                  key={policy.id}
                  className={`policy-configuration-item ${policy.status} ${isExpanded ? 'expanded' : ''}`}
                  style={{ borderColor: categoryConfig.color }}
                >
                  <div className="policy-configuration-item__header">
                    <button
                      className="policy-configuration-item__toggle"
                      onClick={() => setSelectedPolicy(isExpanded ? null : policy.id)}
                    >
                      <div className="policy-configuration-item__main">
                        <div className="policy-configuration-item__category">
                          <span
                            className="policy-configuration-item__category-icon"
                            style={{ color: categoryConfig.color }}
                          >
                            {categoryConfig.icon}
                          </span>
                          <span className="policy-configuration-item__category-label">
                            {categoryConfig.label}
                          </span>
                        </div>

                        <div className="policy-configuration-item__name">{policy.name}</div>

                        <div className="policy-configuration-item__version">{policy.version}</div>
                      </div>

                      <div className="policy-configuration-item__status-row">
                        <div className={`policy-configuration-item__status ${policy.status}`}>
                          {policy.status}
                        </div>
                        <div
                          className="policy-configuration-item__enforcement"
                          style={{ color: enforcementConfig.color }}
                        >
                          {enforcementConfig.icon} {enforcementConfig.label}
                        </div>
                        <div className="policy-configuration-item__compliance">
                          {Math.round(policy.monitoring.metrics.complianceRate * 100)}%
                        </div>
                      </div>

                      <div className="policy-configuration-item__arrow">
                        {isExpanded ? '▲' : '▼'}
                      </div>
                    </button>

                    {/* Quick Controls */}
                    {canModifyPolicies && showEnforcementControls && (
                      <div className="policy-configuration-item__controls">
                        <button
                          className={`policy-configuration-toggle ${policy.status === 'active' ? 'enabled' : 'disabled'}`}
                          onClick={() => handlePolicyToggle(policy.id, policy.status !== 'active')}
                          title={policy.status === 'active' ? 'Disable policy' : 'Enable policy'}
                        >
                          {policy.status === 'active' ? '🟢' : '🔴'}
                        </button>

                        <select
                          className="policy-configuration-enforcement-select"
                          value={policy.enforcementLevel}
                          onChange={(e) =>
                            handleEnforcementChange(
                              policy.id,
                              e.target.value as PolicyEnforcementLevel,
                            )
                          }
                          title="Change enforcement level"
                        >
                          {Object.entries(ENFORCEMENT_LEVEL_CONFIG).map(([level, config]) => (
                            <option key={level} value={level}>
                              {config.icon} {config.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  {isExpanded && (
                    <div className="policy-configuration-item__details">
                      <div className="policy-configuration-item__description">
                        {policy.description}
                      </div>

                      {/* Policy Rules */}
                      <div className="policy-configuration-detail-section">
                        <div className="policy-configuration-detail-section__title">
                          Rules ({policy.rules.length})
                        </div>
                        <div className="policy-configuration-rules">
                          {policy.rules.map((rule) => (
                            <div
                              key={rule.id}
                              className={`policy-configuration-rule ${rule.enabled ? 'enabled' : 'disabled'}`}
                            >
                              <div className="policy-configuration-rule__header">
                                <div className="policy-configuration-rule__name">{rule.name}</div>
                                <div
                                  className={`policy-configuration-rule__severity ${rule.severity}`}
                                >
                                  {rule.severity}
                                </div>
                                <div
                                  className={`policy-configuration-rule__status ${rule.enabled ? 'enabled' : 'disabled'}`}
                                >
                                  {rule.enabled ? '✓' : '✗'}
                                </div>
                              </div>
                              <div className="policy-configuration-rule__description">
                                {rule.description}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Monitoring Metrics */}
                      <div className="policy-configuration-detail-section">
                        <div className="policy-configuration-detail-section__title">Monitoring</div>
                        <div className="policy-configuration-metrics">
                          <div className="policy-configuration-metric">
                            <div className="policy-configuration-metric__label">Evaluations</div>
                            <div className="policy-configuration-metric__value">
                              {policy.monitoring.metrics.evaluationCount.toLocaleString()}
                            </div>
                          </div>
                          <div className="policy-configuration-metric">
                            <div className="policy-configuration-metric__label">Violations</div>
                            <div className="policy-configuration-metric__value">
                              {policy.monitoring.metrics.violationCount.toLocaleString()}
                            </div>
                          </div>
                          <div className="policy-configuration-metric">
                            <div className="policy-configuration-metric__label">Compliance</div>
                            <div className="policy-configuration-metric__value">
                              {Math.round(policy.monitoring.metrics.complianceRate * 100)}%
                            </div>
                          </div>
                          <div className="policy-configuration-metric">
                            <div className="policy-configuration-metric__label">Avg Time</div>
                            <div className="policy-configuration-metric__value">
                              {policy.monitoring.metrics.averageEvaluationTime}ms
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Test Results */}
                      {showTesting &&
                        policy.testing.testResults &&
                        policy.testing.testResults.length > 0 && (
                          <div className="policy-configuration-detail-section">
                            <div className="policy-configuration-detail-section__title">
                              Test Results
                            </div>
                            <div className="policy-configuration-test-results">
                              {policy.testing.testResults.slice(0, 3).map((result, index) => (
                                <div
                                  key={index}
                                  className={`policy-configuration-test-result ${result.passed ? 'passed' : 'failed'}`}
                                >
                                  <div className="policy-configuration-test-result__status">
                                    {result.passed ? '✅' : '❌'}
                                  </div>
                                  <div className="policy-configuration-test-result__info">
                                    <div className="policy-configuration-test-result__name">
                                      Test case {result.testCaseId}
                                    </div>
                                    <div className="policy-configuration-test-result__time">
                                      {result.executionTime}ms
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                    </div>
                  )}
                </div>
              );
            })}

            {filteredPolicies.length > (compact ? 5 : 10) && (
              <div className="policy-configuration-more">
                +{filteredPolicies.length - (compact ? 5 : 10)} more polic
                {filteredPolicies.length - (compact ? 5 : 10) !== 1 ? 'ies' : 'y'}
              </div>
            )}
          </div>
        ) : (
          <div className="policy-configuration-empty">
            <div className="policy-configuration-empty__icon">⚙️</div>
            <div className="policy-configuration-empty__message">No policies configured</div>
            <div className="policy-configuration-empty__description">
              Policy configurations will appear here once they are created and deployed.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Export default for easy importing
export default PolicyConfigurationView;
