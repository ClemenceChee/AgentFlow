import React, { useState, useEffect, useMemo } from 'react';
import { useOrganizationalContext } from '../../../contexts/OrganizationalContext';

// Types for performance data
interface QueryPerformanceMetric {
  readonly timestamp: number;
  readonly teamId: string;
  readonly operatorId: string;
  readonly queryType: 'search' | 'trace' | 'analysis' | 'correlation' | 'briefing';
  readonly latency: number; // milliseconds
  readonly success: boolean;
  readonly throughput: number; // queries per second
  readonly complexity: 'low' | 'medium' | 'high' | 'very_high';
  readonly resourceUsage: {
    readonly cpu: number; // 0-100 percentage
    readonly memory: number; // MB
    readonly cache_hits: number;
    readonly cache_misses: number;
  };
}

interface PerformanceAggregates {
  readonly teamId: string;
  readonly timeWindow: string;
  readonly metrics: {
    readonly avgLatency: number;
    readonly p50Latency: number;
    readonly p95Latency: number;
    readonly p99Latency: number;
    readonly maxLatency: number;
    readonly minLatency: number;
    readonly totalQueries: number;
    readonly successRate: number;
    readonly avgThroughput: number;
    readonly peakThroughput: number;
    readonly errorRate: number;
  };
  readonly trends: {
    readonly latencyTrend: 'improving' | 'stable' | 'degrading';
    readonly throughputTrend: 'increasing' | 'stable' | 'decreasing';
    readonly errorTrend: 'improving' | 'stable' | 'worsening';
  };
}

interface PerformanceAlert {
  readonly id: string;
  readonly teamId: string;
  readonly type: 'latency_spike' | 'throughput_drop' | 'error_rate_high' | 'resource_exhaustion';
  readonly severity: 'low' | 'medium' | 'high' | 'critical';
  readonly message: string;
  readonly threshold: number;
  readonly currentValue: number;
  readonly triggeredAt: number;
  readonly recommendations: string[];
}

interface PerformanceBenchmark {
  readonly teamId: string;
  readonly queryType: string;
  readonly target: {
    readonly p95Latency: number; // ms
    readonly throughput: number; // qps
    readonly successRate: number; // percentage
  };
  readonly current: {
    readonly p95Latency: number;
    readonly throughput: number;
    readonly successRate: number;
  };
  readonly status: 'meeting' | 'below' | 'exceeding';
}

type ChartType = 'latency' | 'throughput' | 'errors' | 'resources' | 'trends';
type TimeRange = '1h' | '24h' | '7d' | '30d';
type Granularity = '1m' | '5m' | '1h' | '1d';

interface Props {
  readonly className?: string;
  readonly teamId?: string;
  readonly showRealTime?: boolean;
  readonly onAlertTriggered?: (alert: PerformanceAlert) => void;
}

export const TeamQueryPerformanceChart: React.FC<Props> = ({
  className = '',
  teamId,
  showRealTime = true,
  onAlertTriggered
}) => {
  const { selectedTeam, operatorContext } = useOrganizationalContext();
  const [chartType, setChartType] = useState<ChartType>('latency');
  const [timeRange, setTimeRange] = useState<TimeRange>('24h');
  const [granularity, setGranularity] = useState<Granularity>('5m');
  const [selectedMetric, setSelectedMetric] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(showRealTime);
  const [showBenchmarks, setShowBenchmarks] = useState(true);
  const [compareMode, setCompareMode] = useState(false);
  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);

  const effectiveTeamId = teamId || selectedTeam;

  // Mock performance data - replace with actual API calls
  const mockMetrics: QueryPerformanceMetric[] = useMemo(() => {
    const now = Date.now();
    const metrics: QueryPerformanceMetric[] = [];

    for (let i = 0; i < 100; i++) {
      const timestamp = now - (i * 5 * 60 * 1000); // 5-minute intervals
      metrics.push({
        timestamp,
        teamId: effectiveTeamId || 'team-frontend',
        operatorId: `op-${Math.floor(Math.random() * 10)}`,
        queryType: ['search', 'trace', 'analysis', 'correlation', 'briefing'][Math.floor(Math.random() * 5)] as any,
        latency: Math.max(50, Math.random() * 2000 + Math.sin(i / 10) * 500),
        success: Math.random() > 0.05, // 95% success rate
        throughput: Math.max(1, Math.random() * 50 + Math.sin(i / 5) * 20),
        complexity: ['low', 'medium', 'high', 'very_high'][Math.floor(Math.random() * 4)] as any,
        resourceUsage: {
          cpu: Math.max(10, Math.min(90, Math.random() * 60 + 30)),
          memory: Math.max(100, Math.random() * 2000 + 500),
          cache_hits: Math.floor(Math.random() * 100),
          cache_misses: Math.floor(Math.random() * 20)
        }
      });
    }

    return metrics.sort((a, b) => a.timestamp - b.timestamp);
  }, [effectiveTeamId]);

  const mockAggregates: PerformanceAggregates = useMemo(() => {
    const latencies = mockMetrics.map(m => m.latency);
    const successes = mockMetrics.filter(m => m.success).length;
    const throughputs = mockMetrics.map(m => m.throughput);

    latencies.sort((a, b) => a - b);

    return {
      teamId: effectiveTeamId || 'team-frontend',
      timeWindow: timeRange,
      metrics: {
        avgLatency: latencies.reduce((a, b) => a + b, 0) / latencies.length,
        p50Latency: latencies[Math.floor(latencies.length * 0.5)],
        p95Latency: latencies[Math.floor(latencies.length * 0.95)],
        p99Latency: latencies[Math.floor(latencies.length * 0.99)],
        maxLatency: Math.max(...latencies),
        minLatency: Math.min(...latencies),
        totalQueries: mockMetrics.length,
        successRate: (successes / mockMetrics.length) * 100,
        avgThroughput: throughputs.reduce((a, b) => a + b, 0) / throughputs.length,
        peakThroughput: Math.max(...throughputs),
        errorRate: ((mockMetrics.length - successes) / mockMetrics.length) * 100
      },
      trends: {
        latencyTrend: 'stable',
        throughputTrend: 'increasing',
        errorTrend: 'improving'
      }
    };
  }, [mockMetrics, effectiveTeamId, timeRange]);

  const mockAlerts: PerformanceAlert[] = useMemo(() => [
    {
      id: 'alert-001',
      teamId: effectiveTeamId || 'team-frontend',
      type: 'latency_spike',
      severity: 'high',
      message: 'P95 latency exceeded 1000ms threshold',
      threshold: 1000,
      currentValue: 1250,
      triggeredAt: Date.now() - 300000,
      recommendations: [
        'Check database query optimization',
        'Review cache hit rates',
        'Scale horizontally if sustained'
      ]
    },
    {
      id: 'alert-002',
      teamId: effectiveTeamId || 'team-frontend',
      type: 'throughput_drop',
      severity: 'medium',
      message: 'Throughput dropped below 20 QPS',
      threshold: 20,
      currentValue: 15.5,
      triggeredAt: Date.now() - 600000,
      recommendations: [
        'Check system resource utilization',
        'Review concurrent query limits',
        'Investigate potential bottlenecks'
      ]
    }
  ], [effectiveTeamId]);

  const mockBenchmarks: PerformanceBenchmark[] = useMemo(() => [
    {
      teamId: effectiveTeamId || 'team-frontend',
      queryType: 'search',
      target: { p95Latency: 500, throughput: 30, successRate: 99 },
      current: { p95Latency: mockAggregates.metrics.p95Latency, throughput: mockAggregates.metrics.avgThroughput, successRate: mockAggregates.metrics.successRate },
      status: mockAggregates.metrics.p95Latency <= 500 ? 'meeting' : 'below'
    },
    {
      teamId: effectiveTeamId || 'team-frontend',
      queryType: 'analysis',
      target: { p95Latency: 2000, throughput: 10, successRate: 97 },
      current: { p95Latency: mockAggregates.metrics.p95Latency, throughput: mockAggregates.metrics.avgThroughput, successRate: mockAggregates.metrics.successRate },
      status: 'meeting'
    }
  ], [effectiveTeamId, mockAggregates]);

  // Auto-refresh effect
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      console.log('Refreshing performance metrics...');
      // Trigger data refresh
    }, 30000);

    return () => clearInterval(interval);
  }, [autoRefresh]);

  // Alert monitoring effect
  useEffect(() => {
    mockAlerts.forEach(alert => {
      if (Date.now() - alert.triggeredAt < 60000) { // Recent alert
        onAlertTriggered?.(alert);
      }
    });
  }, [mockAlerts, onAlertTriggered]);

  const formatLatency = (ms: number): string => {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const formatThroughput = (qps: number): string => {
    return `${qps.toFixed(1)} QPS`;
  };

  const getSeverityColor = (severity: string): string => {
    switch (severity) {
      case 'critical': return 'var(--org-alert-critical)';
      case 'high': return 'var(--org-alert-high)';
      case 'medium': return 'var(--org-alert-medium)';
      case 'low': return 'var(--org-alert-low)';
      default: return 'var(--org-text-muted)';
    }
  };

  const getTrendColor = (trend: string): string => {
    if (trend.includes('improving') || trend.includes('increasing')) return 'var(--org-success)';
    if (trend.includes('degrading') || trend.includes('decreasing') || trend.includes('worsening')) return 'var(--org-alert-high)';
    return 'var(--org-info)';
  };

  const renderLatencyChart = () => {
    const chartData = mockMetrics.slice(-50); // Last 50 data points
    const maxLatency = Math.max(...chartData.map(d => d.latency));

    return (
      <div className="org-chart-container">
        <div className="org-chart-header">
          <h4>Query Latency Over Time</h4>
          <div className="org-latency-percentiles">
            <div className="org-percentile-item">
              <span className="org-percentile-label">P50</span>
              <span className="org-percentile-value">{formatLatency(mockAggregates.metrics.p50Latency)}</span>
            </div>
            <div className="org-percentile-item">
              <span className="org-percentile-label">P95</span>
              <span className="org-percentile-value">{formatLatency(mockAggregates.metrics.p95Latency)}</span>
            </div>
            <div className="org-percentile-item">
              <span className="org-percentile-label">P99</span>
              <span className="org-percentile-value">{formatLatency(mockAggregates.metrics.p99Latency)}</span>
            </div>
          </div>
        </div>

        <div className="org-chart-area">
          <svg className="org-performance-chart" viewBox="0 0 800 300">
            {/* Grid lines */}
            {[0, 1, 2, 3, 4].map(i => (
              <line
                key={`grid-${i}`}
                x1="50"
                y1={50 + i * 50}
                x2="750"
                y2={50 + i * 50}
                stroke="var(--org-border)"
                strokeDasharray="2,2"
                opacity="0.3"
              />
            ))}

            {/* Latency line */}
            <polyline
              fill="none"
              stroke="var(--org-primary)"
              strokeWidth="2"
              points={chartData.map((d, i) => {
                const x = 50 + (i / (chartData.length - 1)) * 700;
                const y = 250 - ((d.latency / maxLatency) * 200);
                return `${x},${y}`;
              }).join(' ')}
            />

            {/* Data points */}
            {chartData.map((d, i) => {
              const x = 50 + (i / (chartData.length - 1)) * 700;
              const y = 250 - ((d.latency / maxLatency) * 200);
              const color = d.success ? 'var(--org-success)' : 'var(--org-alert-high)';

              return (
                <circle
                  key={i}
                  cx={x}
                  cy={y}
                  r="3"
                  fill={color}
                  opacity="0.7"
                />
              );
            })}

            {/* Y-axis labels */}
            {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => (
              <text
                key={`y-label-${i}`}
                x="45"
                y={250 - ratio * 200}
                textAnchor="end"
                className="org-chart-label"
              >
                {formatLatency(maxLatency * ratio)}
              </text>
            ))}
          </svg>
        </div>

        {showBenchmarks && (
          <div className="org-benchmark-overlay">
            <div className="org-benchmark-line" style={{
              bottom: `${((mockBenchmarks[0]?.target.p95Latency || 500) / maxLatency) * 200}px`
            }}>
              <span className="org-benchmark-label">P95 Target</span>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderThroughputChart = () => {
    const chartData = mockMetrics.slice(-50);
    const maxThroughput = Math.max(...chartData.map(d => d.throughput));

    return (
      <div className="org-chart-container">
        <div className="org-chart-header">
          <h4>Query Throughput</h4>
          <div className="org-throughput-stats">
            <div className="org-stat-item">
              <span className="org-stat-label">Average</span>
              <span className="org-stat-value">{formatThroughput(mockAggregates.metrics.avgThroughput)}</span>
            </div>
            <div className="org-stat-item">
              <span className="org-stat-label">Peak</span>
              <span className="org-stat-value">{formatThroughput(mockAggregates.metrics.peakThroughput)}</span>
            </div>
          </div>
        </div>

        <div className="org-chart-area">
          <svg className="org-performance-chart" viewBox="0 0 800 300">
            {/* Bar chart for throughput */}
            {chartData.map((d, i) => {
              const x = 50 + (i / chartData.length) * 700;
              const barWidth = 700 / chartData.length * 0.8;
              const barHeight = (d.throughput / maxThroughput) * 200;
              const y = 250 - barHeight;

              return (
                <rect
                  key={i}
                  x={x}
                  y={y}
                  width={barWidth}
                  height={barHeight}
                  fill="var(--org-success)"
                  opacity="0.7"
                />
              );
            })}

            {/* Y-axis labels */}
            {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => (
              <text
                key={`y-label-${i}`}
                x="45"
                y={250 - ratio * 200}
                textAnchor="end"
                className="org-chart-label"
              >
                {formatThroughput(maxThroughput * ratio)}
              </text>
            ))}
          </svg>
        </div>
      </div>
    );
  };

  const renderErrorChart = () => (
    <div className="org-chart-container">
      <div className="org-chart-header">
        <h4>Error Rates</h4>
        <div className="org-error-stats">
          <div className="org-stat-item">
            <span className="org-stat-label">Success Rate</span>
            <span className="org-stat-value org-success">{mockAggregates.metrics.successRate.toFixed(1)}%</span>
          </div>
          <div className="org-stat-item">
            <span className="org-stat-label">Error Rate</span>
            <span className="org-stat-value org-alert-high">{mockAggregates.metrics.errorRate.toFixed(1)}%</span>
          </div>
        </div>
      </div>

      <div className="org-error-breakdown">
        <div className="org-error-type">
          <div className="org-error-type-header">
            <span>Timeout Errors</span>
            <span>2.1%</span>
          </div>
          <div className="org-progress-bar">
            <div className="org-progress-fill org-alert-high" style={{ width: '2.1%' }} />
          </div>
        </div>
        <div className="org-error-type">
          <div className="org-error-type-header">
            <span>Resource Errors</span>
            <span>1.8%</span>
          </div>
          <div className="org-progress-bar">
            <div className="org-progress-fill org-alert-medium" style={{ width: '1.8%' }} />
          </div>
        </div>
        <div className="org-error-type">
          <div className="org-error-type-header">
            <span>Query Errors</span>
            <span>1.1%</span>
          </div>
          <div className="org-progress-bar">
            <div className="org-progress-fill org-alert-low" style={{ width: '1.1%' }} />
          </div>
        </div>
      </div>
    </div>
  );

  const renderResourceChart = () => (
    <div className="org-chart-container">
      <div className="org-chart-header">
        <h4>Resource Utilization</h4>
      </div>

      <div className="org-resource-metrics">
        <div className="org-resource-metric">
          <div className="org-resource-header">
            <span>CPU Usage</span>
            <span>45.2%</span>
          </div>
          <div className="org-progress-bar">
            <div className="org-progress-fill org-info" style={{ width: '45.2%' }} />
          </div>
        </div>
        <div className="org-resource-metric">
          <div className="org-resource-header">
            <span>Memory Usage</span>
            <span>62.8%</span>
          </div>
          <div className="org-progress-bar">
            <div className="org-progress-fill org-warning" style={{ width: '62.8%' }} />
          </div>
        </div>
        <div className="org-resource-metric">
          <div className="org-resource-header">
            <span>Cache Hit Rate</span>
            <span>83.4%</span>
          </div>
          <div className="org-progress-bar">
            <div className="org-progress-fill org-success" style={{ width: '83.4%' }} />
          </div>
        </div>
      </div>

      <div className="org-cache-metrics">
        <div className="org-cache-stat">
          <span className="org-cache-label">Total Hits</span>
          <span className="org-cache-value">2,847</span>
        </div>
        <div className="org-cache-stat">
          <span className="org-cache-label">Total Misses</span>
          <span className="org-cache-value">567</span>
        </div>
        <div className="org-cache-stat">
          <span className="org-cache-label">Hit Ratio</span>
          <span className="org-cache-value">83.4%</span>
        </div>
      </div>
    </div>
  );

  const renderTrendsChart = () => (
    <div className="org-chart-container">
      <div className="org-chart-header">
        <h4>Performance Trends</h4>
      </div>

      <div className="org-trends-summary">
        <div className="org-trend-item">
          <div className="org-trend-header">
            <span>Latency</span>
            <span
              className="org-trend-indicator"
              style={{ color: getTrendColor(mockAggregates.trends.latencyTrend) }}
            >
              {mockAggregates.trends.latencyTrend}
            </span>
          </div>
          <div className="org-trend-description">
            P95 latency has remained stable over the last 24 hours
          </div>
        </div>
        <div className="org-trend-item">
          <div className="org-trend-header">
            <span>Throughput</span>
            <span
              className="org-trend-indicator"
              style={{ color: getTrendColor(mockAggregates.trends.throughputTrend) }}
            >
              {mockAggregates.trends.throughputTrend}
            </span>
          </div>
          <div className="org-trend-description">
            Query throughput increased by 12% due to optimization efforts
          </div>
        </div>
        <div className="org-trend-item">
          <div className="org-trend-header">
            <span>Error Rate</span>
            <span
              className="org-trend-indicator"
              style={{ color: getTrendColor(mockAggregates.trends.errorTrend) }}
            >
              {mockAggregates.trends.errorTrend}
            </span>
          </div>
          <div className="org-trend-description">
            Error rate decreased by 15% after timeout configuration updates
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className={`org-team-query-performance-chart ${className}`}>
      <div className="org-component-header">
        <h2>Team Query Performance</h2>
        <div className="org-header-controls">
          <div className="org-time-controls">
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value as TimeRange)}
            >
              <option value="1h">Last Hour</option>
              <option value="24h">Last 24 Hours</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
            </select>
            <select
              value={granularity}
              onChange={(e) => setGranularity(e.target.value as Granularity)}
            >
              <option value="1m">1 Minute</option>
              <option value="5m">5 Minutes</option>
              <option value="1h">1 Hour</option>
              <option value="1d">1 Day</option>
            </select>
          </div>
          <div className="org-view-controls">
            <label>
              <input
                type="checkbox"
                checked={showBenchmarks}
                onChange={(e) => setShowBenchmarks(e.target.checked)}
              />
              Show Benchmarks
            </label>
            <label>
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
              />
              Auto-refresh
            </label>
          </div>
        </div>
      </div>

      <div className="org-chart-tabs">
        {[
          { key: 'latency', label: 'Latency' },
          { key: 'throughput', label: 'Throughput' },
          { key: 'errors', label: 'Errors' },
          { key: 'resources', label: 'Resources' },
          { key: 'trends', label: 'Trends' }
        ].map((tab) => (
          <button
            key={tab.key}
            className={`org-tab-button ${chartType === tab.key ? 'org-active' : ''}`}
            onClick={() => setChartType(tab.key as ChartType)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="org-chart-content">
        {chartType === 'latency' && renderLatencyChart()}
        {chartType === 'throughput' && renderThroughputChart()}
        {chartType === 'errors' && renderErrorChart()}
        {chartType === 'resources' && renderResourceChart()}
        {chartType === 'trends' && renderTrendsChart()}
      </div>

      {mockAlerts.length > 0 && (
        <div className="org-performance-alerts">
          <h4>Active Alerts</h4>
          {mockAlerts.map((alert) => (
            <div
              key={alert.id}
              className="org-alert-card"
              style={{ borderLeftColor: getSeverityColor(alert.severity) }}
            >
              <div className="org-alert-header">
                <span className="org-alert-type">{alert.type.replace('_', ' ')}</span>
                <span className="org-alert-severity">{alert.severity}</span>
                <span className="org-alert-time">
                  {Math.round((Date.now() - alert.triggeredAt) / 60000)}m ago
                </span>
              </div>
              <div className="org-alert-message">{alert.message}</div>
              <div className="org-alert-recommendations">
                <h6>Recommendations:</h6>
                <ul>
                  {alert.recommendations.map((rec, index) => (
                    <li key={index}>{rec}</li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      )}

      {showBenchmarks && (
        <div className="org-performance-benchmarks">
          <h4>Performance Benchmarks</h4>
          <div className="org-benchmarks-grid">
            {mockBenchmarks.map((benchmark, index) => (
              <div key={index} className="org-benchmark-card">
                <div className="org-benchmark-header">
                  <span>{benchmark.queryType}</span>
                  <span className={`org-benchmark-status org-status-${benchmark.status}`}>
                    {benchmark.status}
                  </span>
                </div>
                <div className="org-benchmark-metrics">
                  <div className="org-benchmark-metric">
                    <span>P95 Latency</span>
                    <span>{formatLatency(benchmark.current.p95Latency)} / {formatLatency(benchmark.target.p95Latency)}</span>
                  </div>
                  <div className="org-benchmark-metric">
                    <span>Throughput</span>
                    <span>{formatThroughput(benchmark.current.throughput)} / {formatThroughput(benchmark.target.throughput)}</span>
                  </div>
                  <div className="org-benchmark-metric">
                    <span>Success Rate</span>
                    <span>{benchmark.current.successRate.toFixed(1)}% / {benchmark.target.successRate}%</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {effectiveTeamId && (
        <div className="org-context-info">
          <div className="org-context-badge">
            Performance data for: {effectiveTeamId}
          </div>
        </div>
      )}
    </div>
  );
};

export default TeamQueryPerformanceChart;