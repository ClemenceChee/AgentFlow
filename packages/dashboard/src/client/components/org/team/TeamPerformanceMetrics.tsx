/**
 * Team Performance Metrics
 *
 * Component displaying comprehensive team performance metrics including
 * success rates, response times, throughput, and comparative analytics
 * with trend analysis and performance optimization insights.
 */

import React, { useState, useEffect, useMemo } from 'react';
import type { OrganizationalTrace, TeamMembership } from '../../../types/organizational.js';

// Component props
interface TeamPerformanceMetricsProps {
  /** Team ID to show metrics for */
  teamId: string;

  /** Array of traces to analyze */
  traces: OrganizationalTrace[];

  /** Time range for metrics calculation */
  timeRange?: '24h' | '7d' | '30d' | '90d';

  /** Whether to show detailed breakdown */
  showDetailed?: boolean;

  /** Whether to show comparative metrics */
  showComparative?: boolean;

  /** Whether to show trend indicators */
  showTrends?: boolean;

  /** Custom CSS class name */
  className?: string;

  /** Whether to show compact version */
  compact?: boolean;

  /** Callback when performance issue is detected */
  onPerformanceAlert?: (alert: PerformanceAlert) => void;
}

// Performance metrics data structure
interface TeamPerformanceData {
  // Success metrics
  successRate: number;
  errorRate: number;
  completionRate: number;

  // Timing metrics
  averageResponseTime: number;
  medianResponseTime: number;
  p95ResponseTime: number;

  // Throughput metrics
  tracesPerHour: number;
  tracesPerDay: number;
  peakHourThroughput: number;

  // Quality metrics
  averageTraceLength: number;
  toolUsageEfficiency: number;
  errorRecoveryRate: number;

  // Trend data
  trends: {
    successRate: 'improving' | 'declining' | 'stable';
    responseTime: 'improving' | 'declining' | 'stable';
    throughput: 'improving' | 'declining' | 'stable';
  };

  // Comparative data
  comparative: {
    successRatePercentile: number;
    responseTimePercentile: number;
    throughputPercentile: number;
  };

  // Raw data for detailed analysis
  rawMetrics: {
    totalTraces: number;
    successfulTraces: number;
    errorTraces: number;
    timeRange: string;
    dataPoints: MetricDataPoint[];
  };
}

// Performance alert interface
interface PerformanceAlert {
  type: 'success_rate' | 'response_time' | 'throughput' | 'error_rate';
  severity: 'low' | 'medium' | 'high';
  message: string;
  value: number;
  threshold: number;
  suggestion: string;
}

// Data point for trends
interface MetricDataPoint {
  timestamp: number;
  successRate: number;
  responseTime: number;
  throughput: number;
  errorCount: number;
}

/**
 * Team Performance Metrics Component
 */
export function TeamPerformanceMetrics({
  teamId,
  traces,
  timeRange = '24h',
  showDetailed = true,
  showComparative = true,
  showTrends = true,
  className = '',
  compact = false,
  onPerformanceAlert
}: TeamPerformanceMetricsProps) {
  const [performanceData, setPerformanceData] = useState<TeamPerformanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [teamInfo, setTeamInfo] = useState<TeamMembership | null>(null);

  // Filter traces for the specific team and time range
  const teamTraces = useMemo(() => {
    const now = Date.now();
    const timeRangeMs = {
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000,
      '90d': 90 * 24 * 60 * 60 * 1000
    }[timeRange];

    return traces.filter(trace =>
      trace.operatorContext?.teamId === teamId &&
      trace.timestamp > (now - timeRangeMs)
    );
  }, [traces, teamId, timeRange]);

  // Calculate performance metrics
  const calculatePerformanceMetrics = useCallback(async (): Promise<TeamPerformanceData> => {
    const totalTraces = teamTraces.length;
    if (totalTraces === 0) {
      throw new Error('No traces found for the specified team and time range');
    }

    // Calculate success metrics
    const successfulTraces = teamTraces.filter(trace => trace.status === 'success').length;
    const errorTraces = teamTraces.filter(trace => trace.status === 'error').length;
    const completedTraces = teamTraces.filter(trace => trace.status !== 'running').length;

    const successRate = totalTraces > 0 ? successfulTraces / totalTraces : 0;
    const errorRate = totalTraces > 0 ? errorTraces / totalTraces : 0;
    const completionRate = totalTraces > 0 ? completedTraces / totalTraces : 0;

    // Calculate timing metrics
    const responseTimes = teamTraces
      .filter(trace => trace.endTime && trace.startTime)
      .map(trace => trace.endTime! - trace.startTime);

    const averageResponseTime = responseTimes.length > 0 ?
      responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length : 0;

    const sortedResponseTimes = responseTimes.sort((a, b) => a - b);
    const medianResponseTime = sortedResponseTimes.length > 0 ?
      sortedResponseTimes[Math.floor(sortedResponseTimes.length / 2)] : 0;

    const p95ResponseTime = sortedResponseTimes.length > 0 ?
      sortedResponseTimes[Math.floor(sortedResponseTimes.length * 0.95)] : 0;

    // Calculate throughput metrics
    const timeRangeHours = {
      '24h': 24,
      '7d': 168,
      '30d': 720,
      '90d': 2160
    }[timeRange];

    const tracesPerHour = totalTraces / timeRangeHours;
    const tracesPerDay = tracesPerHour * 24;

    // Calculate peak hour throughput
    const hourlyBuckets = new Map<number, number>();
    teamTraces.forEach(trace => {
      const hour = Math.floor(trace.timestamp / (1000 * 60 * 60));
      hourlyBuckets.set(hour, (hourlyBuckets.get(hour) || 0) + 1);
    });
    const peakHourThroughput = Math.max(...hourlyBuckets.values(), 0);

    // Calculate quality metrics
    const averageTraceLength = teamTraces.length > 0 ?
      teamTraces.reduce((sum, trace) => sum + (trace.steps?.length || 0), 0) / teamTraces.length : 0;

    const toolUsageTraces = teamTraces.filter(trace =>
      trace.steps?.some(step => step.toolCalls && step.toolCalls.length > 0)
    );
    const toolUsageEfficiency = totalTraces > 0 ? toolUsageTraces.length / totalTraces : 0;

    const recoveredErrorTraces = teamTraces.filter(trace =>
      trace.status === 'success' &&
      trace.steps?.some(step => step.type === 'error')
    );
    const errorRecoveryRate = errorTraces > 0 ? recoveredErrorTraces.length / errorTraces : 0;

    // Calculate trends (simplified - compare first half vs second half of period)
    const midPoint = Math.floor(teamTraces.length / 2);
    const firstHalf = teamTraces.slice(0, midPoint);
    const secondHalf = teamTraces.slice(midPoint);

    const firstHalfSuccessRate = firstHalf.length > 0 ?
      firstHalf.filter(t => t.status === 'success').length / firstHalf.length : 0;
    const secondHalfSuccessRate = secondHalf.length > 0 ?
      secondHalf.filter(t => t.status === 'success').length / secondHalf.length : 0;

    const successRateTrend = secondHalfSuccessRate > firstHalfSuccessRate * 1.05 ? 'improving' :
                           secondHalfSuccessRate < firstHalfSuccessRate * 0.95 ? 'declining' : 'stable';

    // Similar calculations for response time and throughput trends
    const responseTimeTrend = 'stable'; // Simplified
    const throughputTrend = 'stable';   // Simplified

    // Fetch comparative data from API
    let comparative = {
      successRatePercentile: 50,
      responseTimePercentile: 50,
      throughputPercentile: 50
    };

    try {
      const response = await fetch(`/api/teams/${teamId}/comparative-metrics?timeRange=${timeRange}`);
      if (response.ok) {
        const comparativeData = await response.json();
        comparative = comparativeData;
      }
    } catch {
      // Use default values
    }

    // Build data points for detailed analysis
    const dataPoints: MetricDataPoint[] = teamTraces
      .sort((a, b) => a.timestamp - b.timestamp)
      .reduce((points, trace, index) => {
        if (index % Math.max(1, Math.floor(teamTraces.length / 20)) === 0) {
          const recentTraces = teamTraces.slice(Math.max(0, index - 10), index + 1);
          points.push({
            timestamp: trace.timestamp,
            successRate: recentTraces.filter(t => t.status === 'success').length / recentTraces.length,
            responseTime: recentTraces
              .filter(t => t.endTime && t.startTime)
              .reduce((sum, t) => sum + (t.endTime! - t.startTime), 0) / recentTraces.length,
            throughput: recentTraces.length,
            errorCount: recentTraces.filter(t => t.status === 'error').length
          });
        }
        return points;
      }, [] as MetricDataPoint[]);

    return {
      successRate,
      errorRate,
      completionRate,
      averageResponseTime,
      medianResponseTime,
      p95ResponseTime,
      tracesPerHour,
      tracesPerDay,
      peakHourThroughput,
      averageTraceLength,
      toolUsageEfficiency,
      errorRecoveryRate,
      trends: {
        successRate: successRateTrend,
        responseTime: responseTimeTrend,
        throughput: throughputTrend
      },
      comparative,
      rawMetrics: {
        totalTraces,
        successfulTraces,
        errorTraces,
        timeRange,
        dataPoints
      }
    };
  }, [teamTraces, timeRange, teamId]);

  // Load performance data
  useEffect(() => {
    const loadPerformanceData = async () => {
      try {
        setLoading(true);
        setError(null);

        const data = await calculatePerformanceMetrics();
        setPerformanceData(data);

        // Check for performance alerts
        const alerts: PerformanceAlert[] = [];

        if (data.successRate < 0.8) {
          alerts.push({
            type: 'success_rate',
            severity: data.successRate < 0.6 ? 'high' : 'medium',
            message: `Success rate is ${(data.successRate * 100).toFixed(1)}%`,
            value: data.successRate,
            threshold: 0.8,
            suggestion: 'Review error patterns and improve error handling'
          });
        }

        if (data.averageResponseTime > 30000) { // 30 seconds
          alerts.push({
            type: 'response_time',
            severity: data.averageResponseTime > 60000 ? 'high' : 'medium',
            message: `Average response time is ${(data.averageResponseTime / 1000).toFixed(1)}s`,
            value: data.averageResponseTime,
            threshold: 30000,
            suggestion: 'Optimize tool usage and reduce complexity'
          });
        }

        // Notify about alerts
        alerts.forEach(alert => {
          if (onPerformanceAlert) {
            onPerformanceAlert(alert);
          }
        });

      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to calculate performance metrics');
      } finally {
        setLoading(false);
      }
    };

    loadPerformanceData();
  }, [calculatePerformanceMetrics, onPerformanceAlert]);

  // Load team information
  useEffect(() => {
    const loadTeamInfo = async () => {
      try {
        const response = await fetch(`/api/teams/${teamId}`);
        if (response.ok) {
          const teamData = await response.json();
          setTeamInfo(teamData);
        }
      } catch {
        // Team info is optional
      }
    };

    loadTeamInfo();
  }, [teamId]);

  // Format time duration
  const formatDuration = (ms: number): string => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  // Format percentage
  const formatPercentage = (value: number): string => {
    return `${(value * 100).toFixed(1)}%`;
  };

  // Get trend indicator
  const getTrendIndicator = (trend: 'improving' | 'declining' | 'stable'): string => {
    switch (trend) {
      case 'improving': return '📈';
      case 'declining': return '📉';
      case 'stable': return '➡️';
    }
  };

  // Get performance level color
  const getPerformanceColor = (value: number, thresholds: { good: number; warning: number }): string => {
    if (value >= thresholds.good) return 'var(--success)';
    if (value >= thresholds.warning) return 'var(--warn)';
    return 'var(--fail)';
  };

  const cardClasses = [
    'org-card',
    'team-performance-metrics',
    compact ? 'compact' : '',
    className
  ].filter(Boolean).join(' ');

  // Loading state
  if (loading) {
    return (
      <div className={cardClasses}>
        <div className="org-card__header">
          <div className="org-card__title">
            <span className="team-performance-metrics__icon">📊</span>
            Team Performance
          </div>
        </div>
        <div className="org-card__content">
          <div className="team-performance-loading">
            <div className="team-performance-loading-spinner" />
            <div className="team-performance-loading-text">
              Calculating performance metrics...
            </div>
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
            <span className="team-performance-metrics__icon">📊</span>
            Team Performance
          </div>
        </div>
        <div className="org-card__content">
          <div className="team-performance-error">
            <div className="team-performance-error__icon">⚠️</div>
            <div className="team-performance-error__message">
              {error}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!performanceData) return null;

  return (
    <div className={cardClasses}>
      <div className="org-card__header">
        <div className="org-card__title">
          <span className="team-performance-metrics__icon">📊</span>
          Team Performance
          {teamInfo && !compact && (
            <span className="team-performance-metrics__team-name">
              {teamInfo.teamName || teamId.substring(0, 8)}
            </span>
          )}
        </div>
        <div className="org-card__subtitle">
          {timeRange.toUpperCase()} • {performanceData.rawMetrics.totalTraces} traces
        </div>
      </div>

      <div className="org-card__content">
        {/* Core Metrics */}
        <div className="team-performance-section">
          <div className="team-performance-metrics-grid">
            <div className="team-performance-metric">
              <div className="team-performance-metric__header">
                <div className="team-performance-metric__label">Success Rate</div>
                {showTrends && (
                  <div className="team-performance-metric__trend">
                    {getTrendIndicator(performanceData.trends.successRate)}
                  </div>
                )}
              </div>
              <div
                className="team-performance-metric__value"
                style={{ color: getPerformanceColor(performanceData.successRate, { good: 0.9, warning: 0.7 }) }}
              >
                {formatPercentage(performanceData.successRate)}
              </div>
              {showComparative && (
                <div className="team-performance-metric__comparative">
                  {performanceData.comparative.successRatePercentile}th percentile
                </div>
              )}
            </div>

            <div className="team-performance-metric">
              <div className="team-performance-metric__header">
                <div className="team-performance-metric__label">Avg Response</div>
                {showTrends && (
                  <div className="team-performance-metric__trend">
                    {getTrendIndicator(performanceData.trends.responseTime)}
                  </div>
                )}
              </div>
              <div
                className="team-performance-metric__value"
                style={{ color: getPerformanceColor(30000 - performanceData.averageResponseTime, { good: 20000, warning: 10000 }) }}
              >
                {formatDuration(performanceData.averageResponseTime)}
              </div>
              {showComparative && (
                <div className="team-performance-metric__comparative">
                  {performanceData.comparative.responseTimePercentile}th percentile
                </div>
              )}
            </div>

            <div className="team-performance-metric">
              <div className="team-performance-metric__header">
                <div className="team-performance-metric__label">Throughput</div>
                {showTrends && (
                  <div className="team-performance-metric__trend">
                    {getTrendIndicator(performanceData.trends.throughput)}
                  </div>
                )}
              </div>
              <div className="team-performance-metric__value">
                {performanceData.tracesPerHour.toFixed(1)}/hr
              </div>
              {showComparative && (
                <div className="team-performance-metric__comparative">
                  {performanceData.comparative.throughputPercentile}th percentile
                </div>
              )}
            </div>

            {!compact && (
              <div className="team-performance-metric">
                <div className="team-performance-metric__header">
                  <div className="team-performance-metric__label">Error Rate</div>
                </div>
                <div
                  className="team-performance-metric__value"
                  style={{ color: getPerformanceColor(1 - performanceData.errorRate, { good: 0.95, warning: 0.8 }) }}
                >
                  {formatPercentage(performanceData.errorRate)}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Detailed Metrics */}
        {showDetailed && !compact && (
          <div className="team-performance-section">
            <div className="team-performance-section__header">
              <div className="team-performance-section__title">Detailed Metrics</div>
            </div>
            <div className="team-performance-detailed-grid">
              <div className="team-performance-detailed-metric">
                <div className="team-performance-detailed-metric__label">Median Response</div>
                <div className="team-performance-detailed-metric__value">
                  {formatDuration(performanceData.medianResponseTime)}
                </div>
              </div>
              <div className="team-performance-detailed-metric">
                <div className="team-performance-detailed-metric__label">95th Percentile</div>
                <div className="team-performance-detailed-metric__value">
                  {formatDuration(performanceData.p95ResponseTime)}
                </div>
              </div>
              <div className="team-performance-detailed-metric">
                <div className="team-performance-detailed-metric__label">Peak Hour</div>
                <div className="team-performance-detailed-metric__value">
                  {performanceData.peakHourThroughput} traces
                </div>
              </div>
              <div className="team-performance-detailed-metric">
                <div className="team-performance-detailed-metric__label">Avg Trace Length</div>
                <div className="team-performance-detailed-metric__value">
                  {performanceData.averageTraceLength.toFixed(1)} steps
                </div>
              </div>
              <div className="team-performance-detailed-metric">
                <div className="team-performance-detailed-metric__label">Tool Usage</div>
                <div className="team-performance-detailed-metric__value">
                  {formatPercentage(performanceData.toolUsageEfficiency)}
                </div>
              </div>
              <div className="team-performance-detailed-metric">
                <div className="team-performance-detailed-metric__label">Error Recovery</div>
                <div className="team-performance-detailed-metric__value">
                  {formatPercentage(performanceData.errorRecoveryRate)}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Export default for easy importing
export default TeamPerformanceMetrics;