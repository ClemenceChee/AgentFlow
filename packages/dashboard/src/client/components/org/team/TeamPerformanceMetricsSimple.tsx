/**
 * Team Performance Metrics - Simplified version using SOMA organizational intelligence
 */

import { useOrganizationalIntelligence, useOrganizationalTraces, useTeamPerformance } from '../../../hooks/useOrganizationalData.js';

interface TeamPerformanceMetricsSimpleProps {
  teamId?: string;
  timeframe?: 'hour' | 'day' | 'week';
}

export function TeamPerformanceMetricsSimple({ teamId, timeframe = 'day' }: TeamPerformanceMetricsSimpleProps): JSX.Element {
  const { intelligence, loading: intelligenceLoading } = useOrganizationalIntelligence();
  const { traces, loading: tracesLoading } = useOrganizationalTraces({
    teamFilter: teamId,
    limit: 50
  });
  const { metrics: teamMetrics, loading: metricsLoading } = useTeamPerformance({
    teamId,
    timeframe
  });

  if (intelligenceLoading || tracesLoading || metricsLoading) {
    return (
      <div className="team-performance-metrics loading">
        <div className="loading-spinner">Loading performance metrics...</div>
      </div>
    );
  }

  // Calculate basic performance metrics from traces
  const performance = {
    successRate: traces.length > 0
      ? (traces.filter(t => t.status === 'completed').length / traces.length) * 100
      : 0,
    totalTraces: traces.length,
    averageLatency: intelligence?.performanceInsights.organizationalQueryLatency || 0,
    cacheHitRate: intelligence?.performanceInsights.teamScopedCacheHitRate || 0,
    correlationAccuracy: intelligence?.performanceInsights.sessionCorrelationAccuracy || 0,
    complianceRate: intelligence?.performanceInsights.policyComplianceRate || 0
  };

  return (
    <div className="team-performance-metrics">
      <header className="performance-header">
        <h3>
          <span className="icon">⚡</span>
          Team Performance
          {teamId && (
            <span className="team-badge">Team: {teamId.substring(0, 8)}...</span>
          )}
        </h3>
        <div className="performance-period">
          {timeframe === 'hour' ? 'Last Hour' : timeframe === 'day' ? 'Last 24 Hours' : 'Last 7 Days'}
        </div>
      </header>

      <div className="performance-grid">
        {/* Success Rate */}
        <div className="performance-metric">
          <div className="metric-header">
            <span className="metric-icon">✅</span>
            <span className="metric-label">Success Rate</span>
          </div>
          <div className="metric-value">{Math.round(performance.successRate)}%</div>
          <div className="metric-detail">{traces.filter(t => t.status === 'completed').length}/{performance.totalTraces} completed</div>
        </div>

        {/* Average Latency */}
        <div className="performance-metric">
          <div className="metric-header">
            <span className="metric-icon">⏱️</span>
            <span className="metric-label">Avg Latency</span>
          </div>
          <div className="metric-value">{Math.round(performance.averageLatency)}ms</div>
          <div className="metric-detail">Query response time</div>
        </div>

        {/* Cache Hit Rate */}
        <div className="performance-metric">
          <div className="metric-header">
            <span className="metric-icon">💾</span>
            <span className="metric-label">Cache Hit Rate</span>
          </div>
          <div className="metric-value">{Math.round(performance.cacheHitRate * 100)}%</div>
          <div className="metric-detail">Team-scoped caching</div>
        </div>

        {/* Session Correlation */}
        <div className="performance-metric">
          <div className="metric-header">
            <span className="metric-icon">🔗</span>
            <span className="metric-label">Correlation</span>
          </div>
          <div className="metric-value">{Math.round(performance.correlationAccuracy * 100)}%</div>
          <div className="metric-detail">Session correlation accuracy</div>
        </div>

        {/* Policy Compliance */}
        <div className="performance-metric">
          <div className="metric-header">
            <span className="metric-icon">📋</span>
            <span className="metric-label">Compliance</span>
          </div>
          <div className="metric-value">{Math.round(performance.complianceRate * 100)}%</div>
          <div className="metric-detail">Policy compliance rate</div>
        </div>

        {/* Total Activity */}
        <div className="performance-metric">
          <div className="metric-header">
            <span className="metric-icon">📊</span>
            <span className="metric-label">Activity</span>
          </div>
          <div className="metric-value">{performance.totalTraces}</div>
          <div className="metric-detail">Traces in timeframe</div>
        </div>
      </div>

      {/* Performance Status */}
      {intelligence && (
        <div className="performance-status">
          <h4>Performance Insights</h4>
          <div className="status-indicators">
            <div className={`status-indicator ${performance.successRate > 95 ? 'good' : performance.successRate > 85 ? 'warning' : 'error'}`}>
              <span className="status-icon">
                {performance.successRate > 95 ? '🟢' : performance.successRate > 85 ? '🟡' : '🔴'}
              </span>
              <span className="status-text">
                Success rate {performance.successRate > 95 ? 'excellent' : performance.successRate > 85 ? 'good' : 'needs attention'}
              </span>
            </div>

            <div className={`status-indicator ${performance.averageLatency < 50 ? 'good' : performance.averageLatency < 100 ? 'warning' : 'error'}`}>
              <span className="status-icon">
                {performance.averageLatency < 50 ? '🟢' : performance.averageLatency < 100 ? '🟡' : '🔴'}
              </span>
              <span className="status-text">
                Latency {performance.averageLatency < 50 ? 'excellent' : performance.averageLatency < 100 ? 'acceptable' : 'high'}
              </span>
            </div>

            <div className={`status-indicator ${performance.cacheHitRate > 0.8 ? 'good' : performance.cacheHitRate > 0.6 ? 'warning' : 'error'}`}>
              <span className="status-icon">
                {performance.cacheHitRate > 0.8 ? '🟢' : performance.cacheHitRate > 0.6 ? '🟡' : '🔴'}
              </span>
              <span className="status-text">
                Caching {performance.cacheHitRate > 0.8 ? 'optimized' : performance.cacheHitRate > 0.6 ? 'moderate' : 'inefficient'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Team-specific metrics if available */}
      {teamMetrics && (
        <div className="team-specific-metrics">
          <h4>Team Metrics</h4>
          <p>Enhanced team-specific performance data would be displayed here when available from the API.</p>
        </div>
      )}
    </div>
  );
}