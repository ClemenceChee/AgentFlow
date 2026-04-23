/**
 * Policy History View
 *
 * Component displaying historical policy compliance trends, violation patterns,
 * and temporal analysis of organizational governance with interactive timeline,
 * trend visualization, and pattern detection capabilities.
 */

import { useEffect, useMemo, useState } from 'react';
import type { PolicyComplianceLevel, PolicyViolation } from '../../../types/organizational.js';

// Component props
interface PolicyHistoryViewProps {
  /** Team ID to show policy history for (optional, shows all if not provided) */
  teamId?: string;

  /** Time range for history analysis */
  timeRange?: '7d' | '30d' | '90d' | '6m' | '1y';

  /** Whether to show violation patterns */
  showViolationPatterns?: boolean;

  /** Whether to show trend analysis */
  showTrendAnalysis?: boolean;

  /** Whether to show compliance score evolution */
  showComplianceEvolution?: boolean;

  /** Whether to show policy category breakdown */
  showCategoryBreakdown?: boolean;

  /** Custom CSS class name */
  className?: string;

  /** Whether to show compact version */
  compact?: boolean;

  /** Callback when time period is clicked */
  onTimeRangeChange?: (range: string) => void;

  /** Callback when violation pattern is clicked */
  onPatternClick?: (pattern: ViolationPattern) => void;
}

// Historical policy data interface
interface PolicyHistoryData {
  timestamp: number;
  compliance: PolicyComplianceLevel;
  score: number;
  violationCount: number;
  violations: PolicyViolation[];
  recommendations: string[];
  affectedTeams: string[];
  categories: Record<string, number>; // Category to violation count
}

// Violation pattern interface
interface ViolationPattern {
  id: string;
  type: PatternType;
  description: string;
  frequency: number;
  severity: 'high' | 'medium' | 'low';
  category: string;
  firstSeen: number;
  lastSeen: number;
  affectedTeams: string[];
  trendDirection: 'increasing' | 'decreasing' | 'stable';
  confidence: number;
}

// Pattern types
type PatternType =
  | 'recurring_violation'
  | 'degradation_trend'
  | 'category_spike'
  | 'team_specific'
  | 'temporal_pattern'
  | 'cascade_failure';

// Time bucket configuration
const TIME_BUCKET_CONFIG = {
  '7d': { bucketSize: 2 * 60 * 60 * 1000, label: 'Last 7 Days', buckets: 84 }, // 2-hour buckets
  '30d': { bucketSize: 6 * 60 * 60 * 1000, label: 'Last 30 Days', buckets: 120 }, // 6-hour buckets
  '90d': { bucketSize: 24 * 60 * 60 * 1000, label: 'Last 90 Days', buckets: 90 }, // Daily buckets
  '6m': { bucketSize: 7 * 24 * 60 * 60 * 1000, label: 'Last 6 Months', buckets: 26 }, // Weekly buckets
  '1y': { bucketSize: 30 * 24 * 60 * 60 * 1000, label: 'Last Year', buckets: 12 }, // Monthly buckets
};

// Pattern type configuration
const PATTERN_TYPE_CONFIG: Record<
  PatternType,
  {
    label: string;
    icon: string;
    color: string;
    description: string;
  }
> = {
  recurring_violation: {
    label: 'Recurring Violation',
    icon: '🔄',
    color: 'var(--warn)',
    description: 'Same violation type occurring repeatedly',
  },
  degradation_trend: {
    label: 'Degradation Trend',
    icon: '📉',
    color: 'var(--fail)',
    description: 'Compliance score declining over time',
  },
  category_spike: {
    label: 'Category Spike',
    icon: '📈',
    color: 'var(--org-primary)',
    description: 'Sudden increase in violations for specific category',
  },
  team_specific: {
    label: 'Team-Specific Pattern',
    icon: '👥',
    color: 'var(--org-team)',
    description: 'Pattern isolated to specific team(s)',
  },
  temporal_pattern: {
    label: 'Temporal Pattern',
    icon: '⏰',
    color: 'var(--org-temporal)',
    description: 'Violations occurring at specific times or intervals',
  },
  cascade_failure: {
    label: 'Cascade Failure',
    icon: '⛓️',
    color: 'var(--fail)',
    description: 'One violation leading to multiple downstream violations',
  },
};

/**
 * Policy History View Component
 */
export function PolicyHistoryView({
  teamId,
  timeRange = '30d',
  showViolationPatterns = true,
  showTrendAnalysis = true,
  showComplianceEvolution = true,
  showCategoryBreakdown = true,
  className = '',
  compact = false,
  onTimeRangeChange,
  onPatternClick,
}: PolicyHistoryViewProps) {
  const [historyData, setHistoryData] = useState<PolicyHistoryData[]>([]);
  const [violationPatterns, setViolationPatterns] = useState<ViolationPattern[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPattern, setSelectedPattern] = useState<string | null>(null);

  // Load historical policy data
  useEffect(() => {
    const loadHistoryData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Construct API URL
        const params = new URLSearchParams({
          timeRange,
          ...(teamId && { teamId }),
        });

        const response = await fetch(`/api/policy/history?${params}`);
        if (!response.ok) {
          throw new Error(`Failed to load policy history: ${response.statusText}`);
        }

        const data = await response.json();
        setHistoryData(data.history || []);

        // Generate violation patterns from historical data
        const patterns = detectViolationPatterns(data.history || []);
        setViolationPatterns(patterns);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load policy history');
        // Generate mock data for development
        const mockData = generateMockHistoryData(timeRange);
        setHistoryData(mockData);
        setViolationPatterns(detectViolationPatterns(mockData));
      } finally {
        setLoading(false);
      }
    };

    loadHistoryData();
  }, [timeRange, teamId, detectViolationPatterns, generateMockHistoryData]);

  // Generate mock historical data (for development)
  const generateMockHistoryData = (range: string): PolicyHistoryData[] => {
    const config = TIME_BUCKET_CONFIG[range as keyof typeof TIME_BUCKET_CONFIG];
    const data: PolicyHistoryData[] = [];
    const now = Date.now();

    for (let i = config.buckets - 1; i >= 0; i--) {
      const timestamp = now - i * config.bucketSize;
      const violationCount = Math.floor(Math.random() * 10);
      const score = Math.max(0.3, 1 - violationCount * 0.1 + Math.random() * 0.2);

      data.push({
        timestamp,
        compliance:
          score > 0.8
            ? 'compliant'
            : score > 0.6
              ? 'warning'
              : score > 0.4
                ? 'violation'
                : 'pending',
        score,
        violationCount,
        violations: [], // Simplified for mock data
        recommendations: [],
        affectedTeams: teamId ? [teamId] : [],
        categories: {
          access_control: Math.floor(violationCount * 0.3),
          data_governance: Math.floor(violationCount * 0.4),
          security: Math.floor(violationCount * 0.3),
        },
      });
    }

    return data;
  };

  // Detect violation patterns from historical data
  const detectViolationPatterns = (data: PolicyHistoryData[]): ViolationPattern[] => {
    const patterns: ViolationPattern[] = [];

    if (data.length < 5) return patterns;

    // Detect degradation trend
    const recentScores = data.slice(-10).map((d) => d.score);
    if (recentScores.length >= 5) {
      const trendSlope = calculateTrendSlope(recentScores);
      if (trendSlope < -0.05) {
        patterns.push({
          id: 'degradation-trend',
          type: 'degradation_trend',
          description: `Compliance score declining by ${Math.abs(trendSlope * 100).toFixed(1)}% over recent period`,
          frequency: recentScores.length,
          severity: trendSlope < -0.1 ? 'high' : 'medium',
          category: 'overall',
          firstSeen: data[data.length - 10]?.timestamp || data[0].timestamp,
          lastSeen: data[data.length - 1].timestamp,
          affectedTeams: teamId ? [teamId] : [],
          trendDirection: 'increasing',
          confidence: Math.min(0.9, Math.abs(trendSlope) * 10),
        });
      }
    }

    // Detect recurring violations by category
    const categoryViolationCounts = new Map<string, number[]>();
    data.forEach((item, index) => {
      Object.entries(item.categories).forEach(([category, count]) => {
        if (count > 0) {
          if (!categoryViolationCounts.has(category)) {
            categoryViolationCounts.set(category, []);
          }
          categoryViolationCounts.get(category)?.push(index);
        }
      });
    });

    categoryViolationCounts.forEach((occurrences, category) => {
      if (occurrences.length >= 3) {
        const frequency = occurrences.length / data.length;
        patterns.push({
          id: `recurring-${category}`,
          type: 'recurring_violation',
          description: `${category.replace(/_/g, ' ')} violations recurring in ${(frequency * 100).toFixed(1)}% of evaluations`,
          frequency: occurrences.length,
          severity: frequency > 0.5 ? 'high' : frequency > 0.3 ? 'medium' : 'low',
          category,
          firstSeen: data[occurrences[0]].timestamp,
          lastSeen: data[occurrences[occurrences.length - 1]].timestamp,
          affectedTeams: teamId ? [teamId] : [],
          trendDirection: 'stable',
          confidence: Math.min(0.9, frequency * 2),
        });
      }
    });

    // Detect temporal patterns
    const hourlyViolations = new Map<number, number>();
    data.forEach((item) => {
      const hour = new Date(item.timestamp).getHours();
      hourlyViolations.set(hour, (hourlyViolations.get(hour) || 0) + item.violationCount);
    });

    const maxHourlyViolations = Math.max(...Array.from(hourlyViolations.values()));
    const avgHourlyViolations =
      Array.from(hourlyViolations.values()).reduce((sum, count) => sum + count, 0) / 24;

    if (maxHourlyViolations > avgHourlyViolations * 2) {
      const peakHour = Array.from(hourlyViolations.entries()).find(
        ([, count]) => count === maxHourlyViolations,
      )?.[0];
      patterns.push({
        id: 'temporal-pattern',
        type: 'temporal_pattern',
        description: `Violations peak around ${peakHour}:00 (${maxHourlyViolations} vs ${avgHourlyViolations.toFixed(1)} average)`,
        frequency: maxHourlyViolations,
        severity: 'medium',
        category: 'temporal',
        firstSeen: data[0].timestamp,
        lastSeen: data[data.length - 1].timestamp,
        affectedTeams: teamId ? [teamId] : [],
        trendDirection: 'stable',
        confidence: 0.7,
      });
    }

    return patterns.sort((a, b) => b.confidence - a.confidence);
  };

  // Calculate trend slope using linear regression
  const calculateTrendSlope = (values: number[]): number => {
    const n = values.length;
    if (n < 2) return 0;

    const sumX = (n * (n - 1)) / 2; // Sum of indices 0,1,2...n-1
    const sumY = values.reduce((sum, val) => sum + val, 0);
    const sumXY = values.reduce((sum, val, index) => sum + index * val, 0);
    const sumX2 = values.reduce((sum, _, index) => sum + index * index, 0);

    return (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  };

  // Calculate compliance metrics
  const complianceMetrics = useMemo(() => {
    if (historyData.length === 0) return null;

    const currentScore = historyData[historyData.length - 1]?.score || 0;
    const previousScore =
      historyData.length > 1 ? historyData[historyData.length - 2]?.score || 0 : currentScore;
    const scoreChange = currentScore - previousScore;

    const totalViolations = historyData.reduce((sum, item) => sum + item.violationCount, 0);
    const avgViolationsPerPeriod = totalViolations / historyData.length;
    const avgComplianceScore =
      historyData.reduce((sum, item) => sum + item.score, 0) / historyData.length;

    // Calculate category breakdown
    const categoryTotals = historyData.reduce(
      (acc, item) => {
        Object.entries(item.categories).forEach(([category, count]) => {
          acc[category] = (acc[category] || 0) + count;
        });
        return acc;
      },
      {} as Record<string, number>,
    );

    return {
      currentScore: Math.round(currentScore * 100),
      scoreChange: Math.round(scoreChange * 100),
      totalViolations,
      avgViolationsPerPeriod: Math.round(avgViolationsPerPeriod * 10) / 10,
      avgComplianceScore: Math.round(avgComplianceScore * 100),
      categoryTotals,
      trendDirection:
        scoreChange > 0.02 ? 'improving' : scoreChange < -0.02 ? 'declining' : 'stable',
    };
  }, [historyData]);

  // Handle time range change
  const handleTimeRangeChange = (newRange: string) => {
    if (onTimeRangeChange) {
      onTimeRangeChange(newRange);
    }
  };

  // Handle pattern click
  const handlePatternClick = (pattern: ViolationPattern) => {
    setSelectedPattern(pattern.id);
    if (onPatternClick) {
      onPatternClick(pattern);
    }
  };

  const containerClasses = ['org-card', 'policy-history-view', compact ? 'compact' : '', className]
    .filter(Boolean)
    .join(' ');

  // Loading state
  if (loading) {
    return (
      <div className={containerClasses}>
        <div className="org-card__header">
          <div className="org-card__title">
            <span className="policy-history-view__icon">📊</span>
            Policy History
          </div>
        </div>
        <div className="org-card__content">
          <div className="policy-history-loading">
            <div className="policy-history-loading-spinner" />
            <div className="policy-history-loading-text">Loading policy compliance history...</div>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error && historyData.length === 0) {
    return (
      <div className={containerClasses}>
        <div className="org-card__header">
          <div className="org-card__title">
            <span className="policy-history-view__icon">📊</span>
            Policy History
          </div>
        </div>
        <div className="org-card__content">
          <div className="policy-history-error">
            <div className="policy-history-error__icon">⚠️</div>
            <div className="policy-history-error__message">{error}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={containerClasses}>
      <div className="org-card__header">
        <div className="org-card__title">
          <span className="policy-history-view__icon">📊</span>
          Policy Compliance History
          {teamId && (
            <span className="policy-history-view__team">• Team {teamId.substring(0, 8)}</span>
          )}
        </div>
        <div className="org-card__subtitle">{TIME_BUCKET_CONFIG[timeRange].label}</div>
      </div>

      <div className="org-card__content">
        {/* Time Range Selector */}
        {!compact && (
          <div className="policy-history-time-selector">
            {Object.entries(TIME_BUCKET_CONFIG).map(([range, config]) => (
              <button
                key={range}
                className={`policy-history-time-button ${timeRange === range ? 'active' : ''}`}
                onClick={() => handleTimeRangeChange(range)}
              >
                {config.label}
              </button>
            ))}
          </div>
        )}

        {/* Compliance Metrics Summary */}
        {complianceMetrics && (
          <div className="policy-history-summary">
            <div className="policy-history-metric">
              <div className="policy-history-metric__value">{complianceMetrics.currentScore}%</div>
              <div className="policy-history-metric__label">Current Score</div>
              {complianceMetrics.scoreChange !== 0 && (
                <div
                  className={`policy-history-metric__change ${complianceMetrics.trendDirection}`}
                >
                  {complianceMetrics.scoreChange > 0 ? '+' : ''}
                  {complianceMetrics.scoreChange}%
                </div>
              )}
            </div>

            <div className="policy-history-metric">
              <div className="policy-history-metric__value">
                {complianceMetrics.totalViolations}
              </div>
              <div className="policy-history-metric__label">Total Violations</div>
              <div className="policy-history-metric__detail">
                {complianceMetrics.avgViolationsPerPeriod} avg/period
              </div>
            </div>

            <div className="policy-history-metric">
              <div className="policy-history-metric__value">
                {complianceMetrics.avgComplianceScore}%
              </div>
              <div className="policy-history-metric__label">Average Score</div>
            </div>

            <div className="policy-history-metric">
              <div className="policy-history-metric__value">{violationPatterns.length}</div>
              <div className="policy-history-metric__label">Patterns Detected</div>
            </div>
          </div>
        )}

        {/* Compliance Evolution Chart */}
        {showComplianceEvolution && historyData.length > 0 && (
          <div className="policy-history-chart">
            <div className="policy-history-chart__header">
              <div className="policy-history-chart__title">Compliance Score Evolution</div>
            </div>
            <div className="policy-history-chart__container">
              <div className="policy-history-chart__timeline">
                {historyData.map((item, index) => {
                  const height = Math.max(item.score * 100, 10);
                  const color =
                    item.compliance === 'compliant'
                      ? 'var(--success)'
                      : item.compliance === 'warning'
                        ? 'var(--warn)'
                        : item.compliance === 'violation'
                          ? 'var(--fail)'
                          : 'var(--t3)';

                  return (
                    <div
                      key={index}
                      className="policy-history-chart__bar"
                      style={{
                        height: `${height}%`,
                        backgroundColor: color,
                      }}
                      title={`${new Date(item.timestamp).toLocaleDateString()}: ${Math.round(item.score * 100)}%`}
                    />
                  );
                })}
              </div>
              <div className="policy-history-chart__axis">
                <span className="policy-history-chart__axis-label">0%</span>
                <span className="policy-history-chart__axis-label">50%</span>
                <span className="policy-history-chart__axis-label">100%</span>
              </div>
            </div>
          </div>
        )}

        {/* Violation Patterns */}
        {showViolationPatterns && violationPatterns.length > 0 && (
          <div className="policy-history-patterns">
            <div className="policy-history-section__header">
              <div className="policy-history-section__title">
                Detected Patterns ({violationPatterns.length})
              </div>
            </div>
            <div className="policy-history-patterns-list">
              {violationPatterns.slice(0, compact ? 3 : 6).map((pattern) => {
                const config = PATTERN_TYPE_CONFIG[pattern.type];
                const isSelected = selectedPattern === pattern.id;

                return (
                  <button
                    key={pattern.id}
                    className={`policy-history-pattern ${isSelected ? 'selected' : ''}`}
                    onClick={() => handlePatternClick(pattern)}
                    style={{ borderColor: config.color }}
                  >
                    <div className="policy-history-pattern__header">
                      <div className="policy-history-pattern__type">
                        <span
                          className="policy-history-pattern__icon"
                          style={{ color: config.color }}
                        >
                          {config.icon}
                        </span>
                        <span className="policy-history-pattern__label">{config.label}</span>
                      </div>
                      <div className={`policy-history-pattern__severity ${pattern.severity}`}>
                        {pattern.severity}
                      </div>
                      <div className="policy-history-pattern__confidence">
                        {Math.round(pattern.confidence * 100)}%
                      </div>
                    </div>

                    <div className="policy-history-pattern__description">{pattern.description}</div>

                    <div className="policy-history-pattern__meta">
                      <span className="policy-history-pattern__frequency">
                        {pattern.frequency} occurrences
                      </span>
                      <span className="policy-history-pattern__trend">
                        {pattern.trendDirection === 'increasing' && '📈'}
                        {pattern.trendDirection === 'decreasing' && '📉'}
                        {pattern.trendDirection === 'stable' && '➡️'}
                        {pattern.trendDirection}
                      </span>
                    </div>
                  </button>
                );
              })}

              {violationPatterns.length > (compact ? 3 : 6) && (
                <div className="policy-history-patterns-more">
                  +{violationPatterns.length - (compact ? 3 : 6)} more pattern
                  {violationPatterns.length - (compact ? 3 : 6) !== 1 ? 's' : ''}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Category Breakdown */}
        {showCategoryBreakdown && complianceMetrics?.categoryTotals && (
          <div className="policy-history-categories">
            <div className="policy-history-section__header">
              <div className="policy-history-section__title">Violations by Category</div>
            </div>
            <div className="policy-history-category-bars">
              {Object.entries(complianceMetrics.categoryTotals)
                .sort((a, b) => b[1] - a[1])
                .slice(0, compact ? 3 : 6)
                .map(([category, count]) => {
                  const percentage =
                    complianceMetrics.totalViolations > 0
                      ? (count / complianceMetrics.totalViolations) * 100
                      : 0;

                  return (
                    <div key={category} className="policy-history-category-bar">
                      <div className="policy-history-category-bar__info">
                        <span className="policy-history-category-bar__label">
                          {category.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                        </span>
                        <span className="policy-history-category-bar__count">{count}</span>
                      </div>
                      <div className="policy-history-category-bar__progress">
                        <div
                          className="policy-history-category-bar__fill"
                          style={{
                            width: `${percentage}%`,
                            backgroundColor: 'var(--org-primary)',
                          }}
                        />
                      </div>
                      <div className="policy-history-category-bar__percentage">
                        {percentage.toFixed(1)}%
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* No Data State */}
        {historyData.length === 0 && (
          <div className="policy-history-empty">
            <div className="policy-history-empty__icon">📊</div>
            <div className="policy-history-empty__message">No policy history data available</div>
            <div className="policy-history-empty__description">
              Policy compliance history will appear here once evaluations have been performed.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Export default for easy importing
export default PolicyHistoryView;
