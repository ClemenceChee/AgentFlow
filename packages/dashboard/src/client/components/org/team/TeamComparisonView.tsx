/**
 * Team Comparison View
 *
 * Component providing side-by-side comparison of team performance,
 * activity metrics, and organizational intelligence with interactive
 * selection, filtering, and detailed comparative analytics.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { OrganizationalTrace, TeamMembership } from '../../../types/organizational.js';

// Component props
interface TeamComparisonViewProps {
  /** Array of team IDs to compare (max 4) */
  teamIds: string[];

  /** Array of traces for all teams */
  traces: OrganizationalTrace[];

  /** Time range for comparison */
  timeRange?: '24h' | '7d' | '30d' | '90d';

  /** Metrics to display in comparison */
  metrics?: ComparisonMetric[];

  /** Whether to show detailed breakdown */
  showDetailed?: boolean;

  /** Whether to allow adding/removing teams */
  allowTeamSelection?: boolean;

  /** Custom CSS class name */
  className?: string;

  /** Whether to show compact version */
  compact?: boolean;

  /** Callback when team selection changes */
  onTeamSelectionChange?: (teamIds: string[]) => void;

  /** Callback when metric is clicked for detailed view */
  onMetricClick?: (teamId: string, metric: string, value: number) => void;
}

// Comparison metric configuration
type ComparisonMetric =
  | 'success_rate'
  | 'response_time'
  | 'throughput'
  | 'error_rate'
  | 'collaboration'
  | 'tool_usage'
  | 'operator_count'
  | 'workload_distribution';

// Team comparison data structure
interface TeamComparisonData {
  teamId: string;
  teamName: string;
  memberCount: number;
  metrics: {
    successRate: number;
    averageResponseTime: number;
    throughput: number;
    errorRate: number;
    collaborationScore: number;
    toolUsageEfficiency: number;
    operatorCount: number;
    workloadDistribution: number; // Gini coefficient for workload distribution
  };
  trends: {
    successRate: 'up' | 'down' | 'stable';
    responseTime: 'up' | 'down' | 'stable';
    throughput: 'up' | 'down' | 'stable';
  };
  ranking: {
    successRate: number;
    responseTime: number;
    throughput: number;
    overall: number;
  };
  rawData: {
    totalTraces: number;
    activeOperators: number;
    timeRange: string;
  };
}

// Metric configuration for display
const METRIC_CONFIG: Record<
  ComparisonMetric,
  {
    label: string;
    icon: string;
    unit: string;
    format: (value: number) => string;
    higherIsBetter: boolean;
    description: string;
  }
> = {
  success_rate: {
    label: 'Success Rate',
    icon: '✅',
    unit: '%',
    format: (value) => `${(value * 100).toFixed(1)}%`,
    higherIsBetter: true,
    description: 'Percentage of successful trace executions',
  },
  response_time: {
    label: 'Response Time',
    icon: '⏱️',
    unit: 'ms',
    format: (value) => (value < 1000 ? `${value.toFixed(0)}ms` : `${(value / 1000).toFixed(1)}s`),
    higherIsBetter: false,
    description: 'Average response time for trace completion',
  },
  throughput: {
    label: 'Throughput',
    icon: '📈',
    unit: '/hr',
    format: (value) => `${value.toFixed(1)}/hr`,
    higherIsBetter: true,
    description: 'Number of traces processed per hour',
  },
  error_rate: {
    label: 'Error Rate',
    icon: '❌',
    unit: '%',
    format: (value) => `${(value * 100).toFixed(1)}%`,
    higherIsBetter: false,
    description: 'Percentage of traces that resulted in errors',
  },
  collaboration: {
    label: 'Collaboration',
    icon: '🤝',
    unit: '%',
    format: (value) => `${(value * 100).toFixed(0)}%`,
    higherIsBetter: true,
    description: 'Level of collaboration between team members',
  },
  tool_usage: {
    label: 'Tool Usage',
    icon: '🔧',
    unit: '%',
    format: (value) => `${(value * 100).toFixed(0)}%`,
    higherIsBetter: true,
    description: 'Efficiency of tool usage in traces',
  },
  operator_count: {
    label: 'Active Operators',
    icon: '👥',
    unit: '',
    format: (value) => value.toString(),
    higherIsBetter: true,
    description: 'Number of active operators in the team',
  },
  workload_distribution: {
    label: 'Load Balance',
    icon: '⚖️',
    unit: '',
    format: (value) => `${((1 - value) * 100).toFixed(0)}%`,
    higherIsBetter: false,
    description: 'How evenly workload is distributed across team members',
  },
};

// Default metrics to show
const DEFAULT_METRICS: ComparisonMetric[] = [
  'success_rate',
  'response_time',
  'throughput',
  'collaboration',
];

/**
 * Team Comparison View Component
 */
export function TeamComparisonView({
  teamIds,
  traces,
  timeRange = '24h',
  metrics = DEFAULT_METRICS,
  showDetailed = true,
  allowTeamSelection = false,
  className = '',
  compact = false,
  onTeamSelectionChange,
  onMetricClick,
}: TeamComparisonViewProps) {
  const [comparisonData, setComparisonData] = useState<TeamComparisonData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTeams, setSelectedTeams] = useState<Set<string>>(new Set(teamIds));
  const [availableTeams, setAvailableTeams] = useState<TeamMembership[]>([]);

  // Filter traces by time range
  const filteredTraces = useMemo(() => {
    const now = Date.now();
    const timeRangeMs = {
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000,
      '90d': 90 * 24 * 60 * 60 * 1000,
    }[timeRange];

    return traces.filter((trace) => trace.timestamp > now - timeRangeMs);
  }, [traces, timeRange]);

  // Calculate team comparison data
  const calculateTeamComparison = useCallback(
    async (teamId: string): Promise<TeamComparisonData> => {
      const teamTraces = filteredTraces.filter((trace) => trace.operatorContext?.teamId === teamId);

      if (teamTraces.length === 0) {
        throw new Error(`No traces found for team ${teamId} in the selected time range`);
      }

      // Fetch team information
      let teamName = teamId.substring(0, 8);
      let memberCount = 0;
      try {
        const response = await fetch(`/api/teams/${teamId}`);
        if (response.ok) {
          const teamData = await response.json();
          teamName = teamData.teamName || teamName;
          memberCount = teamData.members?.length || 0;
        }
      } catch {
        // Use defaults
      }

      // Calculate metrics
      const totalTraces = teamTraces.length;
      const successfulTraces = teamTraces.filter((t) => t.status === 'success').length;
      const errorTraces = teamTraces.filter((t) => t.status === 'error').length;

      const successRate = totalTraces > 0 ? successfulTraces / totalTraces : 0;
      const errorRate = totalTraces > 0 ? errorTraces / totalTraces : 0;

      // Response time calculation
      const responseTimes = teamTraces
        .filter((t) => t.endTime && t.startTime)
        .map((t) => t.endTime! - t.startTime);
      const averageResponseTime =
        responseTimes.length > 0
          ? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length
          : 0;

      // Throughput calculation
      const timeRangeHours = {
        '24h': 24,
        '7d': 168,
        '30d': 720,
        '90d': 2160,
      }[timeRange];
      const throughput = totalTraces / timeRangeHours;

      // Collaboration score (simplified)
      const operatorIds = Array.from(
        new Set(teamTraces.map((t) => t.operatorContext?.operatorId).filter(Boolean)),
      );
      const collaborativeTraces = teamTraces.filter(
        (trace) => trace.sessionCorrelation?.correlatedSessions.length > 0,
      );
      const collaborationScore = totalTraces > 0 ? collaborativeTraces.length / totalTraces : 0;

      // Tool usage efficiency
      const toolUsingTraces = teamTraces.filter((trace) =>
        trace.steps?.some((step) => step.toolCalls && step.toolCalls.length > 0),
      );
      const toolUsageEfficiency = totalTraces > 0 ? toolUsingTraces.length / totalTraces : 0;

      // Workload distribution (Gini coefficient)
      const operatorTraceCounts = new Map<string, number>();
      teamTraces.forEach((trace) => {
        const operatorId = trace.operatorContext?.operatorId;
        if (operatorId) {
          operatorTraceCounts.set(operatorId, (operatorTraceCounts.get(operatorId) || 0) + 1);
        }
      });

      const workloadCounts = Array.from(operatorTraceCounts.values()).sort((a, b) => a - b);
      let gini = 0;
      if (workloadCounts.length > 1) {
        const n = workloadCounts.length;
        const sum = workloadCounts.reduce((a, b) => a + b, 0);
        let numerator = 0;
        for (let i = 0; i < n; i++) {
          numerator += (2 * (i + 1) - n - 1) * workloadCounts[i];
        }
        gini = numerator / (n * sum);
      }

      // Calculate trends (simplified - compare first half vs second half)
      const midPoint = Math.floor(teamTraces.length / 2);
      const firstHalf = teamTraces.slice(0, midPoint);
      const secondHalf = teamTraces.slice(midPoint);

      const firstHalfSuccess =
        firstHalf.length > 0
          ? firstHalf.filter((t) => t.status === 'success').length / firstHalf.length
          : 0;
      const secondHalfSuccess =
        secondHalf.length > 0
          ? secondHalf.filter((t) => t.status === 'success').length / secondHalf.length
          : 0;

      const successRateTrend =
        secondHalfSuccess > firstHalfSuccess * 1.05
          ? 'up'
          : secondHalfSuccess < firstHalfSuccess * 0.95
            ? 'down'
            : 'stable';

      return {
        teamId,
        teamName,
        memberCount,
        metrics: {
          successRate,
          averageResponseTime,
          throughput,
          errorRate,
          collaborationScore,
          toolUsageEfficiency,
          operatorCount: operatorIds.length,
          workloadDistribution: gini,
        },
        trends: {
          successRate: successRateTrend,
          responseTime: 'stable', // Simplified
          throughput: 'stable', // Simplified
        },
        ranking: {
          successRate: 0, // Will be calculated after all teams
          responseTime: 0,
          throughput: 0,
          overall: 0,
        },
        rawData: {
          totalTraces,
          activeOperators: operatorIds.filter((operatorId) => {
            const operatorTraces = teamTraces.filter(
              (t) => t.operatorContext?.operatorId === operatorId,
            );
            const lastActivity = Math.max(...operatorTraces.map((t) => t.timestamp));
            return Date.now() - lastActivity < 30 * 60 * 1000; // Active in last 30 minutes
          }).length,
          timeRange,
        },
      };
    },
    [filteredTraces, timeRange],
  );

  // Load comparison data
  useEffect(() => {
    const loadComparisonData = async () => {
      try {
        setLoading(true);
        setError(null);

        const selectedTeamIds = Array.from(selectedTeams);
        if (selectedTeamIds.length === 0) {
          setComparisonData([]);
          return;
        }

        const comparisonPromises = selectedTeamIds.map(calculateTeamComparison);
        const results = await Promise.all(comparisonPromises);

        // Calculate rankings
        const rankedResults = results.map((team) => {
          const rankings = {
            successRate: 0,
            responseTime: 0,
            throughput: 0,
            overall: 0,
          };

          // Success rate ranking
          const betterSuccessRate = results.filter(
            (other) => other.metrics.successRate > team.metrics.successRate,
          ).length;
          rankings.successRate = results.length - betterSuccessRate;

          // Response time ranking (lower is better)
          const betterResponseTime = results.filter(
            (other) => other.metrics.averageResponseTime < team.metrics.averageResponseTime,
          ).length;
          rankings.responseTime = results.length - betterResponseTime;

          // Throughput ranking
          const betterThroughput = results.filter(
            (other) => other.metrics.throughput > team.metrics.throughput,
          ).length;
          rankings.throughput = results.length - betterThroughput;

          // Overall ranking (average of normalized rankings)
          rankings.overall =
            (rankings.successRate + rankings.responseTime + rankings.throughput) / 3;

          return {
            ...team,
            ranking: rankings,
          };
        });

        setComparisonData(rankedResults);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load comparison data');
      } finally {
        setLoading(false);
      }
    };

    loadComparisonData();
  }, [selectedTeams, calculateTeamComparison]);

  // Load available teams for selection
  useEffect(() => {
    if (!allowTeamSelection) return;

    const loadAvailableTeams = async () => {
      try {
        const response = await fetch('/api/teams');
        if (response.ok) {
          const teams = await response.json();
          setAvailableTeams(teams);
        }
      } catch {
        // Available teams is optional
      }
    };

    loadAvailableTeams();
  }, [allowTeamSelection]);

  // Handle team selection change
  const handleTeamToggle = useCallback(
    (teamId: string) => {
      const newSelectedTeams = new Set(selectedTeams);
      if (newSelectedTeams.has(teamId)) {
        newSelectedTeams.delete(teamId);
      } else if (newSelectedTeams.size < 4) {
        // Max 4 teams
        newSelectedTeams.add(teamId);
      }

      setSelectedTeams(newSelectedTeams);
      if (onTeamSelectionChange) {
        onTeamSelectionChange(Array.from(newSelectedTeams));
      }
    },
    [selectedTeams, onTeamSelectionChange],
  );

  // Get metric value from team data
  const getMetricValue = (team: TeamComparisonData, metric: ComparisonMetric): number => {
    switch (metric) {
      case 'success_rate':
        return team.metrics.successRate;
      case 'response_time':
        return team.metrics.averageResponseTime;
      case 'throughput':
        return team.metrics.throughput;
      case 'error_rate':
        return team.metrics.errorRate;
      case 'collaboration':
        return team.metrics.collaborationScore;
      case 'tool_usage':
        return team.metrics.toolUsageEfficiency;
      case 'operator_count':
        return team.metrics.operatorCount;
      case 'workload_distribution':
        return team.metrics.workloadDistribution;
      default:
        return 0;
    }
  };

  // Get best performing team for a metric
  const getBestPerformingTeam = (metric: ComparisonMetric): TeamComparisonData | null => {
    if (comparisonData.length === 0) return null;

    const config = METRIC_CONFIG[metric];
    return comparisonData.reduce((best, current) => {
      const currentValue = getMetricValue(current, metric);
      const bestValue = getMetricValue(best, metric);

      return config.higherIsBetter
        ? currentValue > bestValue
          ? current
          : best
        : currentValue < bestValue
          ? current
          : best;
    });
  };

  // Get performance comparison class
  const getPerformanceClass = (team: TeamComparisonData, metric: ComparisonMetric): string => {
    const value = getMetricValue(team, metric);
    const bestTeam = getBestPerformingTeam(metric);
    const bestValue = bestTeam ? getMetricValue(bestTeam, metric) : value;

    if (Math.abs(value - bestValue) < bestValue * 0.05) return 'best';
    if (Math.abs(value - bestValue) < bestValue * 0.2) return 'good';
    return 'average';
  };

  const containerClasses = ['team-comparison-view', compact ? 'compact' : '', className]
    .filter(Boolean)
    .join(' ');

  // Loading state
  if (loading) {
    return (
      <div className={containerClasses}>
        <div className="team-comparison-loading">
          <div className="team-comparison-loading-spinner" />
          <div className="team-comparison-loading-text">Loading team comparison data...</div>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={containerClasses}>
        <div className="team-comparison-error">
          <div className="team-comparison-error__icon">⚠️</div>
          <div className="team-comparison-error__message">{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className={containerClasses}>
      {/* Header */}
      <div className="team-comparison-header">
        <div className="team-comparison-title">
          <span className="team-comparison-title__icon">📊</span>
          Team Comparison
          <span className="team-comparison-title__count">
            {comparisonData.length} team{comparisonData.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="team-comparison-subtitle">{timeRange.toUpperCase()} comparison</div>
      </div>

      {/* Team Selection */}
      {allowTeamSelection && !compact && (
        <div className="team-comparison-selection">
          <div className="team-comparison-selection__label">Select teams to compare (max 4):</div>
          <div className="team-comparison-team-chips">
            {availableTeams.slice(0, 8).map((team) => (
              <button
                key={team.teamId}
                className={`team-comparison-team-chip ${
                  selectedTeams.has(team.teamId) ? 'selected' : ''
                } ${selectedTeams.size >= 4 && !selectedTeams.has(team.teamId) ? 'disabled' : ''}`}
                onClick={() => handleTeamToggle(team.teamId)}
                disabled={selectedTeams.size >= 4 && !selectedTeams.has(team.teamId)}
              >
                <span className="team-comparison-team-chip__icon">👥</span>
                <span className="team-comparison-team-chip__name">
                  {team.teamName || team.teamId.substring(0, 8)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Comparison Table */}
      {comparisonData.length > 0 && (
        <div className="team-comparison-table-container">
          <table className="team-comparison-table">
            <thead>
              <tr className="team-comparison-table-header">
                <th className="team-comparison-table-header-cell metric">
                  <span className="team-comparison-table-header-text">Metric</span>
                </th>
                {comparisonData.map((team) => (
                  <th key={team.teamId} className="team-comparison-table-header-cell team">
                    <div className="team-comparison-team-header">
                      <div className="team-comparison-team-name">{team.teamName}</div>
                      <div className="team-comparison-team-meta">
                        {team.memberCount} member{team.memberCount !== 1 ? 's' : ''} •{' '}
                        {team.rawData.totalTraces} trace{team.rawData.totalTraces !== 1 ? 's' : ''}
                      </div>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {metrics.map((metric) => {
                const config = METRIC_CONFIG[metric];
                const bestTeam = getBestPerformingTeam(metric);

                return (
                  <tr key={metric} className="team-comparison-table-row">
                    <td className="team-comparison-table-cell metric">
                      <div className="team-comparison-metric-info">
                        <span className="team-comparison-metric-icon">{config.icon}</span>
                        <div className="team-comparison-metric-text">
                          <div className="team-comparison-metric-label">{config.label}</div>
                          {!compact && (
                            <div className="team-comparison-metric-description">
                              {config.description}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    {comparisonData.map((team) => {
                      const value = getMetricValue(team, metric);
                      const performanceClass = getPerformanceClass(team, metric);
                      const isBest = bestTeam?.teamId === team.teamId;

                      return (
                        <td
                          key={team.teamId}
                          className={`team-comparison-table-cell value ${performanceClass}`}
                        >
                          <button
                            className="team-comparison-metric-value"
                            onClick={() => onMetricClick?.(team.teamId, metric, value)}
                            title={`Click for detailed ${config.label} analysis`}
                          >
                            <div className="team-comparison-metric-main">
                              {config.format(value)}
                              {isBest && <span className="team-comparison-metric-best">👑</span>}
                            </div>
                            {!compact && showDetailed && (
                              <div className="team-comparison-metric-trend">
                                {metric in team.trends && (
                                  <span
                                    className={`team-comparison-trend ${team.trends[metric as keyof typeof team.trends]}`}
                                  >
                                    {team.trends[metric as keyof typeof team.trends] === 'up' &&
                                      '📈'}
                                    {team.trends[metric as keyof typeof team.trends] === 'down' &&
                                      '📉'}
                                    {team.trends[metric as keyof typeof team.trends] === 'stable' &&
                                      '➡️'}
                                  </span>
                                )}
                              </div>
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* No teams selected */}
      {comparisonData.length === 0 && (
        <div className="team-comparison-empty">
          <div className="team-comparison-empty__icon">📊</div>
          <div className="team-comparison-empty__message">
            {allowTeamSelection
              ? 'Select teams to compare using the chips above'
              : 'No teams available for comparison'}
          </div>
        </div>
      )}
    </div>
  );
}

// Export default for easy importing
export default TeamComparisonView;
