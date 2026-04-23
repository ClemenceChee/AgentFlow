import type React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useOrganizationalContext } from '../../../contexts/OrganizationalContext';

// Types for real-time performance monitoring
interface RealTimeMetric {
  readonly metricId: string;
  readonly name: string;
  readonly category: 'performance' | 'resource' | 'quality' | 'business';
  readonly value: number;
  readonly unit: string;
  readonly timestamp: number;
  readonly trend: Array<{
    readonly timestamp: number;
    readonly value: number;
  }>;
  readonly status: 'healthy' | 'warning' | 'critical' | 'unknown';
  readonly threshold: {
    readonly warning: number;
    readonly critical: number;
    readonly target: number;
  };
}

interface AlertRule {
  readonly ruleId: string;
  readonly name: string;
  readonly metricId: string;
  readonly condition: 'above' | 'below' | 'equals' | 'change_rate';
  readonly threshold: number;
  readonly severity: 'low' | 'medium' | 'high' | 'critical';
  readonly duration: number; // seconds before triggering
  readonly enabled: boolean;
  readonly actions: Array<{
    readonly type: 'notification' | 'auto_scale' | 'circuit_breaker' | 'escalation';
    readonly target: string;
    readonly config: Record<string, any>;
  }>;
  readonly suppressionWindow: number; // seconds to suppress duplicate alerts
}

interface ActiveAlert {
  readonly alertId: string;
  readonly ruleId: string;
  readonly metricId: string;
  readonly severity: 'low' | 'medium' | 'high' | 'critical';
  readonly message: string;
  readonly triggeredAt: number;
  readonly acknowledgedAt?: number;
  readonly resolvedAt?: number;
  readonly currentValue: number;
  readonly thresholdValue: number;
  readonly affectedResources: string[];
  readonly escalationLevel: number;
  readonly actionsTaken: Array<{
    readonly action: string;
    readonly timestamp: number;
    readonly result: 'success' | 'failure';
    readonly details: string;
  }>;
}

interface PerformanceDashboard {
  readonly dashboardId: string;
  readonly name: string;
  readonly description: string;
  readonly metrics: string[]; // metric IDs
  readonly layout: Array<{
    readonly metricId: string;
    readonly position: { x: number; y: number; width: number; height: number };
    readonly visualization: 'line_chart' | 'gauge' | 'number' | 'heatmap' | 'histogram';
  }>;
  readonly refreshInterval: number; // milliseconds
  readonly timeRange: string;
}

interface SystemHealth {
  readonly overall: 'healthy' | 'degraded' | 'critical' | 'maintenance';
  readonly score: number; // 0-100
  readonly components: Array<{
    readonly name: string;
    readonly status: 'healthy' | 'warning' | 'critical' | 'maintenance';
    readonly metrics: string[];
    readonly lastCheck: number;
  }>;
  readonly incidents: Array<{
    readonly id: string;
    readonly title: string;
    readonly status: 'investigating' | 'identified' | 'monitoring' | 'resolved';
    readonly severity: 'minor' | 'major' | 'critical';
    readonly startTime: number;
    readonly estimatedResolution?: number;
  }>;
}

interface NotificationChannel {
  readonly channelId: string;
  readonly name: string;
  readonly type: 'email' | 'slack' | 'webhook' | 'sms' | 'pagerduty';
  readonly config: Record<string, any>;
  readonly enabled: boolean;
  readonly filters: Array<{
    readonly condition: string;
    readonly value: any;
  }>;
}

type MonitorView = 'dashboard' | 'metrics' | 'alerts' | 'health' | 'settings';
type TimeRange = '5m' | '15m' | '1h' | '6h' | '24h';

interface Props {
  readonly className?: string;
  readonly dashboardId?: string;
  readonly autoRefresh?: boolean;
  readonly refreshInterval?: number;
  readonly onAlertAcknowledge?: (alertId: string) => void;
  readonly onMetricThresholdUpdate?: (metricId: string, thresholds: any) => void;
}

export const RealTimePerformanceMonitor: React.FC<Props> = ({
  className = '',
  dashboardId,
  autoRefresh = true,
  refreshInterval = 5000,
  onAlertAcknowledge,
  onMetricThresholdUpdate,
}) => {
  const { selectedTeam, operatorContext } = useOrganizationalContext();
  const [monitorView, setMonitorView] = useState<MonitorView>('dashboard');
  const [timeRange, setTimeRange] = useState<TimeRange>('1h');
  const [selectedMetric, setSelectedMetric] = useState<string | null>(null);
  const [alertsFilter, setAlertsFilter] = useState<'all' | 'active' | 'acknowledged' | 'resolved'>(
    'active',
  );
  const [isConnected, setIsConnected] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(Date.now());
  const [pauseUpdates, setPauseUpdates] = useState(false);

  // Mock real-time data - replace with actual WebSocket/SSE connection
  const mockRealTimeMetrics: RealTimeMetric[] = useMemo(() => {
    const generateTrend = (baseValue: number, points: number = 50) => {
      const trend = [];
      for (let i = 0; i < points; i++) {
        const timestamp = Date.now() - (points - i) * 5000;
        const variation = (Math.random() - 0.5) * baseValue * 0.2;
        const value = Math.max(0, baseValue + variation + Math.sin(i / 10) * baseValue * 0.1);
        trend.push({ timestamp, value });
      }
      return trend;
    };

    return [
      {
        metricId: 'query_latency_p95',
        name: 'Query Latency (P95)',
        category: 'performance',
        value: 1250 + Math.random() * 200 - 100,
        unit: 'ms',
        timestamp: Date.now(),
        trend: generateTrend(1250),
        status: 'warning',
        threshold: { warning: 1000, critical: 2000, target: 500 },
      },
      {
        metricId: 'throughput_qps',
        name: 'Query Throughput',
        category: 'performance',
        value: 145 + Math.random() * 20 - 10,
        unit: 'QPS',
        timestamp: Date.now(),
        trend: generateTrend(145),
        status: 'healthy',
        threshold: { warning: 100, critical: 50, target: 200 },
      },
      {
        metricId: 'error_rate',
        name: 'Error Rate',
        category: 'quality',
        value: 2.3 + Math.random() * 0.5 - 0.25,
        unit: '%',
        timestamp: Date.now(),
        trend: generateTrend(2.3),
        status: 'healthy',
        threshold: { warning: 5, critical: 10, target: 1 },
      },
      {
        metricId: 'cpu_utilization',
        name: 'CPU Utilization',
        category: 'resource',
        value: 67.5 + Math.random() * 10 - 5,
        unit: '%',
        timestamp: Date.now(),
        trend: generateTrend(67.5),
        status: 'healthy',
        threshold: { warning: 80, critical: 95, target: 70 },
      },
      {
        metricId: 'memory_utilization',
        name: 'Memory Utilization',
        category: 'resource',
        value: 78.2 + Math.random() * 8 - 4,
        unit: '%',
        timestamp: Date.now(),
        trend: generateTrend(78.2),
        status: 'warning',
        threshold: { warning: 75, critical: 90, target: 60 },
      },
      {
        metricId: 'cache_hit_rate',
        name: 'Cache Hit Rate',
        category: 'performance',
        value: 83.7 + Math.random() * 5 - 2.5,
        unit: '%',
        timestamp: Date.now(),
        trend: generateTrend(83.7),
        status: 'healthy',
        threshold: { warning: 80, critical: 70, target: 90 },
      },
      {
        metricId: 'active_users',
        name: 'Active Users',
        category: 'business',
        value: 42 + Math.floor(Math.random() * 10 - 5),
        unit: 'users',
        timestamp: Date.now(),
        trend: generateTrend(42),
        status: 'healthy',
        threshold: { warning: 20, critical: 10, target: 50 },
      },
      {
        metricId: 'session_duration',
        name: 'Avg Session Duration',
        category: 'business',
        value: 18.5 + Math.random() * 4 - 2,
        unit: 'min',
        timestamp: Date.now(),
        trend: generateTrend(18.5),
        status: 'healthy',
        threshold: { warning: 10, critical: 5, target: 25 },
      },
    ];
  }, []); // Regenerate on update

  const mockActiveAlerts: ActiveAlert[] = useMemo(
    () => [
      {
        alertId: 'alert-001',
        ruleId: 'rule-latency-high',
        metricId: 'query_latency_p95',
        severity: 'high',
        message: 'Query latency P95 exceeded 1000ms threshold for 5 minutes',
        triggeredAt: Date.now() - 300000,
        currentValue: 1250,
        thresholdValue: 1000,
        affectedResources: ['compute-pool-1', 'cache-cluster-1'],
        escalationLevel: 1,
        actionsTaken: [
          {
            action: 'Auto-scale compute pool',
            timestamp: Date.now() - 240000,
            result: 'success',
            details: 'Added 2 additional instances to compute pool',
          },
        ],
      },
      {
        alertId: 'alert-002',
        ruleId: 'rule-memory-warning',
        metricId: 'memory_utilization',
        severity: 'medium',
        message: 'Memory utilization above 75% threshold',
        triggeredAt: Date.now() - 180000,
        currentValue: 78.2,
        thresholdValue: 75,
        affectedResources: ['app-cluster-1'],
        escalationLevel: 0,
        actionsTaken: [],
      },
    ],
    [],
  );

  const mockSystemHealth: SystemHealth = useMemo(
    () => ({
      overall: 'degraded',
      score: 78,
      components: [
        {
          name: 'Query Engine',
          status: 'warning',
          metrics: ['query_latency_p95', 'throughput_qps'],
          lastCheck: Date.now() - 30000,
        },
        {
          name: 'Cache Layer',
          status: 'healthy',
          metrics: ['cache_hit_rate'],
          lastCheck: Date.now() - 15000,
        },
        {
          name: 'Resource Pool',
          status: 'warning',
          metrics: ['cpu_utilization', 'memory_utilization'],
          lastCheck: Date.now() - 10000,
        },
        {
          name: 'User Experience',
          status: 'healthy',
          metrics: ['active_users', 'session_duration'],
          lastCheck: Date.now() - 5000,
        },
      ],
      incidents: [
        {
          id: 'incident-001',
          title: 'Elevated query latency in us-east region',
          status: 'monitoring',
          severity: 'major',
          startTime: Date.now() - 1800000,
          estimatedResolution: Date.now() + 600000,
        },
      ],
    }),
    [],
  );

  // Auto-refresh effect
  useEffect(() => {
    if (!autoRefresh || pauseUpdates) return;

    const interval = setInterval(() => {
      setLastUpdate(Date.now());
      // Simulate connection status
      setIsConnected(Math.random() > 0.05); // 95% uptime
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, pauseUpdates]);

  // WebSocket connection simulation
  useEffect(() => {
    // Simulate WebSocket connection
    console.log('Connecting to performance monitoring WebSocket...');
    setIsConnected(true);

    return () => {
      console.log('Disconnecting from performance monitoring WebSocket...');
    };
  }, []);

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'healthy':
        return 'var(--org-success)';
      case 'warning':
        return 'var(--org-warning)';
      case 'critical':
        return 'var(--org-alert-critical)';
      case 'maintenance':
        return 'var(--org-info)';
      case 'unknown':
        return 'var(--org-text-muted)';
      default:
        return 'var(--org-text-muted)';
    }
  };

  const getSeverityColor = (severity: string): string => {
    switch (severity) {
      case 'critical':
        return 'var(--org-alert-critical)';
      case 'high':
        return 'var(--org-alert-high)';
      case 'medium':
        return 'var(--org-alert-medium)';
      case 'low':
        return 'var(--org-alert-low)';
      default:
        return 'var(--org-text-muted)';
    }
  };

  const formatValue = (value: number, unit: string): string => {
    if (unit === '%') return `${value.toFixed(1)}%`;
    if (unit === 'ms') return `${value.toFixed(0)}ms`;
    if (unit === 'QPS') return `${value.toFixed(1)} QPS`;
    if (unit === 'min') return `${value.toFixed(1)}min`;
    if (unit === 'users') return `${Math.round(value)} users`;
    return `${value.toFixed(1)} ${unit}`;
  };

  const handleAlertAcknowledge = useCallback(
    (alertId: string) => {
      onAlertAcknowledge?.(alertId);
      // Update alert status locally
      console.log(`Acknowledged alert: ${alertId}`);
    },
    [onAlertAcknowledge],
  );

  const renderDashboard = () => (
    <div className="org-performance-dashboard">
      <div className="org-dashboard-header">
        <div className="org-connection-status">
          <div
            className={`org-status-indicator ${isConnected ? 'org-connected' : 'org-disconnected'}`}
          >
            {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
          </div>
          <div className="org-last-update">
            Last update: {new Date(lastUpdate).toLocaleTimeString()}
          </div>
        </div>
        <div className="org-dashboard-controls">
          <button
            className={`org-button ${pauseUpdates ? 'org-button-primary' : 'org-button-secondary'}`}
            onClick={() => setPauseUpdates(!pauseUpdates)}
          >
            {pauseUpdates ? 'Resume' : 'Pause'} Updates
          </button>
          <button
            className="org-button org-button-tertiary"
            onClick={() => setLastUpdate(Date.now())}
          >
            Refresh Now
          </button>
        </div>
      </div>

      <div className="org-metrics-grid">
        {mockRealTimeMetrics.map((metric) => (
          <div
            key={metric.metricId}
            className={`org-metric-card ${selectedMetric === metric.metricId ? 'org-selected' : ''}`}
            onClick={() =>
              setSelectedMetric(selectedMetric === metric.metricId ? null : metric.metricId)
            }
          >
            <div className="org-metric-header">
              <h4>{metric.name}</h4>
              <div
                className="org-status-badge"
                style={{ backgroundColor: getStatusColor(metric.status) }}
              >
                {metric.status}
              </div>
            </div>

            <div className="org-metric-value">
              <span className="org-current-value">{formatValue(metric.value, metric.unit)}</span>
              <span className="org-target-value">
                Target: {formatValue(metric.threshold.target, metric.unit)}
              </span>
            </div>

            <div className="org-metric-chart">
              <svg viewBox="0 0 200 60" className="org-mini-chart">
                <polyline
                  fill="none"
                  stroke={getStatusColor(metric.status)}
                  strokeWidth="1.5"
                  points={metric.trend
                    .map((point, index) => {
                      const x = (index / (metric.trend.length - 1)) * 200;
                      const maxValue = Math.max(...metric.trend.map((p) => p.value));
                      const y = 50 - (point.value / maxValue) * 40;
                      return `${x},${y}`;
                    })
                    .join(' ')}
                />
                {/* Threshold lines */}
                <line
                  x1="0"
                  y1={
                    50 -
                    (metric.threshold.warning / Math.max(...metric.trend.map((p) => p.value))) * 40
                  }
                  x2="200"
                  y2={
                    50 -
                    (metric.threshold.warning / Math.max(...metric.trend.map((p) => p.value))) * 40
                  }
                  stroke="var(--org-warning)"
                  strokeWidth="0.5"
                  strokeDasharray="2,2"
                />
                <line
                  x1="0"
                  y1={
                    50 -
                    (metric.threshold.critical / Math.max(...metric.trend.map((p) => p.value))) * 40
                  }
                  x2="200"
                  y2={
                    50 -
                    (metric.threshold.critical / Math.max(...metric.trend.map((p) => p.value))) * 40
                  }
                  stroke="var(--org-alert-critical)"
                  strokeWidth="0.5"
                  strokeDasharray="2,2"
                />
              </svg>
            </div>

            <div className="org-thresholds">
              <div className="org-threshold-item">
                <span>Warning:</span>
                <span>{formatValue(metric.threshold.warning, metric.unit)}</span>
              </div>
              <div className="org-threshold-item">
                <span>Critical:</span>
                <span>{formatValue(metric.threshold.critical, metric.unit)}</span>
              </div>
            </div>

            {selectedMetric === metric.metricId && (
              <div className="org-metric-details">
                <div className="org-detailed-chart">
                  <h5>24-Hour Trend</h5>
                  <svg viewBox="0 0 600 200" className="org-detailed-trend">
                    {/* Grid lines */}
                    {[0, 25, 50, 75, 100].map((y) => (
                      <line
                        key={y}
                        x1="50"
                        y1={20 + y * 1.6}
                        x2="550"
                        y2={20 + y * 1.6}
                        stroke="var(--org-border)"
                        strokeDasharray="1,1"
                        opacity="0.3"
                      />
                    ))}

                    {/* Trend line */}
                    <polyline
                      fill="none"
                      stroke={getStatusColor(metric.status)}
                      strokeWidth="2"
                      points={metric.trend
                        .map((point, index) => {
                          const x = 50 + (index / (metric.trend.length - 1)) * 500;
                          const maxValue = Math.max(...metric.trend.map((p) => p.value));
                          const y = 180 - (point.value / maxValue) * 160;
                          return `${x},${y}`;
                        })
                        .join(' ')}
                    />

                    {/* Current value indicator */}
                    <circle
                      cx="550"
                      cy={
                        180 - (metric.value / Math.max(...metric.trend.map((p) => p.value))) * 160
                      }
                      r="4"
                      fill={getStatusColor(metric.status)}
                    />

                    {/* Y-axis labels */}
                    <text x="45" y="25" textAnchor="end" className="org-chart-label">
                      {Math.max(...metric.trend.map((p) => p.value)).toFixed(0)}
                    </text>
                    <text x="45" y="185" textAnchor="end" className="org-chart-label">
                      0
                    </text>
                  </svg>
                </div>

                <div className="org-threshold-controls">
                  <h6>Threshold Configuration</h6>
                  <div className="org-threshold-inputs">
                    <div className="org-threshold-input">
                      <label>Warning:</label>
                      <input
                        type="number"
                        value={metric.threshold.warning}
                        onChange={(e) =>
                          onMetricThresholdUpdate?.(metric.metricId, {
                            ...metric.threshold,
                            warning: parseFloat(e.target.value),
                          })
                        }
                      />
                    </div>
                    <div className="org-threshold-input">
                      <label>Critical:</label>
                      <input
                        type="number"
                        value={metric.threshold.critical}
                        onChange={(e) =>
                          onMetricThresholdUpdate?.(metric.metricId, {
                            ...metric.threshold,
                            critical: parseFloat(e.target.value),
                          })
                        }
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  const renderAlerts = () => (
    <div className="org-alerts-monitor">
      <div className="org-alerts-header">
        <h3>Active Alerts</h3>
        <div className="org-alerts-controls">
          <select value={alertsFilter} onChange={(e) => setAlertsFilter(e.target.value as any)}>
            <option value="all">All Alerts</option>
            <option value="active">Active Alerts</option>
            <option value="acknowledged">Acknowledged</option>
            <option value="resolved">Resolved</option>
          </select>
        </div>
      </div>

      <div className="org-alerts-summary">
        <div className="org-alert-counts">
          <div className="org-alert-count org-critical">
            <span className="org-count">
              {mockActiveAlerts.filter((a) => a.severity === 'critical').length}
            </span>
            <span className="org-label">Critical</span>
          </div>
          <div className="org-alert-count org-high">
            <span className="org-count">
              {mockActiveAlerts.filter((a) => a.severity === 'high').length}
            </span>
            <span className="org-label">High</span>
          </div>
          <div className="org-alert-count org-medium">
            <span className="org-count">
              {mockActiveAlerts.filter((a) => a.severity === 'medium').length}
            </span>
            <span className="org-label">Medium</span>
          </div>
          <div className="org-alert-count org-low">
            <span className="org-count">
              {mockActiveAlerts.filter((a) => a.severity === 'low').length}
            </span>
            <span className="org-label">Low</span>
          </div>
        </div>
      </div>

      <div className="org-alerts-list">
        {mockActiveAlerts.map((alert) => (
          <div
            key={alert.alertId}
            className="org-alert-card"
            style={{ borderLeftColor: getSeverityColor(alert.severity) }}
          >
            <div className="org-alert-header">
              <div className="org-alert-title">
                <span className={`org-severity-badge org-severity-${alert.severity}`}>
                  {alert.severity.toUpperCase()}
                </span>
                <span className="org-alert-message">{alert.message}</span>
              </div>
              <div className="org-alert-time">
                {Math.round((Date.now() - alert.triggeredAt) / 60000)}m ago
              </div>
            </div>

            <div className="org-alert-details">
              <div className="org-alert-metrics">
                <div className="org-alert-metric">
                  <span>Current Value:</span>
                  <span className="org-current">{alert.currentValue}</span>
                </div>
                <div className="org-alert-metric">
                  <span>Threshold:</span>
                  <span className="org-threshold">{alert.thresholdValue}</span>
                </div>
                <div className="org-alert-metric">
                  <span>Escalation Level:</span>
                  <span>{alert.escalationLevel}</span>
                </div>
              </div>

              <div className="org-affected-resources">
                <h6>Affected Resources:</h6>
                <div className="org-resources-list">
                  {alert.affectedResources.map((resource) => (
                    <span key={resource} className="org-resource-tag">
                      {resource}
                    </span>
                  ))}
                </div>
              </div>

              {alert.actionsTaken.length > 0 && (
                <div className="org-actions-taken">
                  <h6>Actions Taken:</h6>
                  <div className="org-actions-list">
                    {alert.actionsTaken.map((action, index) => (
                      <div key={index} className="org-action-item">
                        <div className="org-action-header">
                          <span className="org-action-name">{action.action}</span>
                          <span className={`org-action-result org-${action.result}`}>
                            {action.result}
                          </span>
                          <span className="org-action-time">
                            {Math.round((Date.now() - action.timestamp) / 60000)}m ago
                          </span>
                        </div>
                        <div className="org-action-details">{action.details}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="org-alert-actions">
              <button
                className="org-button org-button-primary"
                onClick={() => handleAlertAcknowledge(alert.alertId)}
                disabled={!!alert.acknowledgedAt}
              >
                {alert.acknowledgedAt ? 'Acknowledged' : 'Acknowledge'}
              </button>
              <button className="org-button org-button-secondary">View Details</button>
              <button className="org-button org-button-tertiary">Escalate</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderHealth = () => (
    <div className="org-system-health">
      <div className="org-health-header">
        <h3>System Health Overview</h3>
        <div className="org-health-score">
          <div
            className="org-health-gauge"
            style={{
              background: `conic-gradient(${getStatusColor(mockSystemHealth.overall)} ${mockSystemHealth.score}%, var(--org-border) 0)`,
            }}
          >
            <div className="org-health-score-value">{mockSystemHealth.score}</div>
          </div>
          <div className="org-health-status">
            <span className={`org-status org-${mockSystemHealth.overall}`}>
              {mockSystemHealth.overall.toUpperCase()}
            </span>
          </div>
        </div>
      </div>

      <div className="org-components-health">
        <h4>Component Status</h4>
        <div className="org-components-grid">
          {mockSystemHealth.components.map((component) => (
            <div key={component.name} className="org-component-card">
              <div className="org-component-header">
                <h5>{component.name}</h5>
                <div
                  className="org-component-status"
                  style={{ backgroundColor: getStatusColor(component.status) }}
                >
                  {component.status}
                </div>
              </div>
              <div className="org-component-metrics">
                <span>{component.metrics.length} metrics monitored</span>
                <span>
                  Last check: {Math.round((Date.now() - component.lastCheck) / 1000)}s ago
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="org-incidents">
        <h4>Active Incidents</h4>
        {mockSystemHealth.incidents.length === 0 ? (
          <div className="org-no-incidents">
            <span>🎉 No active incidents</span>
          </div>
        ) : (
          <div className="org-incidents-list">
            {mockSystemHealth.incidents.map((incident) => (
              <div key={incident.id} className="org-incident-card">
                <div className="org-incident-header">
                  <h5>{incident.title}</h5>
                  <div className="org-incident-badges">
                    <span className={`org-status-badge org-${incident.status}`}>
                      {incident.status}
                    </span>
                    <span className={`org-severity-badge org-${incident.severity}`}>
                      {incident.severity}
                    </span>
                  </div>
                </div>
                <div className="org-incident-timeline">
                  <div className="org-incident-time">
                    Started: {Math.round((Date.now() - incident.startTime) / 60000)}m ago
                  </div>
                  {incident.estimatedResolution && (
                    <div className="org-incident-eta">
                      ETA: {Math.round((incident.estimatedResolution - Date.now()) / 60000)}m
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className={`org-real-time-performance-monitor ${className}`}>
      <div className="org-component-header">
        <h2>Real-Time Performance Monitor</h2>
        <div className="org-header-controls">
          <div className="org-time-range-selector">
            <select value={timeRange} onChange={(e) => setTimeRange(e.target.value as TimeRange)}>
              <option value="5m">Last 5 Minutes</option>
              <option value="15m">Last 15 Minutes</option>
              <option value="1h">Last Hour</option>
              <option value="6h">Last 6 Hours</option>
              <option value="24h">Last 24 Hours</option>
            </select>
          </div>
          <div className="org-monitor-status">
            <div
              className={`org-connection-indicator ${isConnected ? 'org-connected' : 'org-disconnected'}`}
            >
              {isConnected ? '🟢' : '🔴'}
            </div>
            <span className="org-refresh-interval">Refresh: {refreshInterval / 1000}s</span>
          </div>
        </div>
      </div>

      <div className="org-monitor-tabs">
        {[
          { key: 'dashboard', label: 'Dashboard', count: mockRealTimeMetrics.length },
          { key: 'metrics', label: 'Metrics', count: mockRealTimeMetrics.length },
          { key: 'alerts', label: 'Alerts', count: mockActiveAlerts.length },
          { key: 'health', label: 'System Health', count: mockSystemHealth.components.length },
          { key: 'settings', label: 'Settings' },
        ].map((tab) => (
          <button
            key={tab.key}
            className={`org-tab-button ${monitorView === tab.key ? 'org-active' : ''}`}
            onClick={() => setMonitorView(tab.key as MonitorView)}
          >
            {tab.label}
            {tab.count !== undefined && <span className="org-tab-count">({tab.count})</span>}
          </button>
        ))}
      </div>

      <div className="org-monitor-content">
        {monitorView === 'dashboard' && renderDashboard()}
        {monitorView === 'metrics' && renderDashboard()} {/* Reuse dashboard for metrics */}
        {monitorView === 'alerts' && renderAlerts()}
        {monitorView === 'health' && renderHealth()}
        {monitorView === 'settings' && (
          <div className="org-settings-placeholder">
            <h3>Monitor Settings</h3>
            <p>
              Configuration panel for alert rules, notification channels, and dashboard
              customization.
            </p>
          </div>
        )}
      </div>

      {selectedTeam && (
        <div className="org-context-info">
          <div className="org-context-badge">Real-time monitoring for: {selectedTeam}</div>
        </div>
      )}
    </div>
  );
};

export default RealTimePerformanceMonitor;
