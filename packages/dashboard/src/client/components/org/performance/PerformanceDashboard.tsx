/**
 * Performance Dashboard Component
 *
 * Displays real-time performance metrics and monitoring data
 * for organizational dashboard components.
 */

import React, { useState, useEffect, memo } from 'react';
import { organizationalPerformanceMonitor } from '../../../utils/performance-monitor.js';
import type { PerformanceReport, ComponentMetrics, APIMetrics } from '../../../utils/performance-monitor.js';

interface PerformanceDashboardProps {
  autoRefresh?: boolean;
  refreshInterval?: number;
  className?: string;
}

const PerformanceMetricCard = memo<{
  title: string;
  value: string | number;
  unit?: string;
  trend?: 'up' | 'down' | 'stable';
  severity?: 'good' | 'warning' | 'critical';
  description?: string;
}>(({ title, value, unit, trend, severity = 'good', description }) => {
  const getSeverityClass = () => {
    switch (severity) {
      case 'warning': return 'bg-yellow-50 border-yellow-200 text-yellow-800';
      case 'critical': return 'bg-red-50 border-red-200 text-red-800';
      default: return 'bg-green-50 border-green-200 text-green-800';
    }
  };

  const getTrendIcon = () => {
    switch (trend) {
      case 'up': return '↗️';
      case 'down': return '↘️';
      default: return '➡️';
    }
  };

  return (
    <div className={`p-4 rounded-lg border ${getSeverityClass()}`}>
      <div className="flex items-center justify-between mb-2">
        <h4 className="font-medium text-sm">{title}</h4>
        {trend && <span className="text-lg">{getTrendIcon()}</span>}
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-bold">
          {typeof value === 'number' ? value.toFixed(2) : value}
        </span>
        {unit && <span className="text-sm opacity-75">{unit}</span>}
      </div>
      {description && <p className="text-xs mt-2 opacity-75">{description}</p>}
    </div>
  );
});

const ComponentPerformanceTable = memo<{ components: ComponentMetrics[] }>(({ components }) => (
  <div className="overflow-x-auto">
    <table className="min-w-full divide-y divide-gray-200">
      <thead className="bg-gray-50">
        <tr>
          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Component</th>
          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Renders</th>
          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Avg Time</th>
          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Last Time</th>
          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Props Changes</th>
        </tr>
      </thead>
      <tbody className="bg-white divide-y divide-gray-200">
        {components.map((component) => (
          <tr key={component.componentName}>
            <td className="px-3 py-2 text-sm font-medium text-gray-900">{component.componentName}</td>
            <td className="px-3 py-2 text-sm text-gray-500">{component.renderCount}</td>
            <td className={`px-3 py-2 text-sm ${
              component.averageRenderTime > 16 ? 'text-red-600 font-medium' : 'text-gray-500'
            }`}>
              {component.averageRenderTime.toFixed(2)}ms
            </td>
            <td className={`px-3 py-2 text-sm ${
              component.lastRenderTime > 16 ? 'text-orange-600' : 'text-gray-500'
            }`}>
              {component.lastRenderTime.toFixed(2)}ms
            </td>
            <td className="px-3 py-2 text-sm text-gray-500">{component.propsChangeCount}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
));

const APIPerformanceTable = memo<{ apis: APIMetrics[] }>(({ apis }) => (
  <div className="overflow-x-auto">
    <table className="min-w-full divide-y divide-gray-200">
      <thead className="bg-gray-50">
        <tr>
          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Endpoint</th>
          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Method</th>
          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Avg Time</th>
          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Requests</th>
          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Error Rate</th>
          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Cache Hit</th>
        </tr>
      </thead>
      <tbody className="bg-white divide-y divide-gray-200">
        {apis.map((api) => (
          <tr key={`${api.method}:${api.endpoint}`}>
            <td className="px-3 py-2 text-sm font-medium text-gray-900">{api.endpoint}</td>
            <td className="px-3 py-2 text-sm text-gray-500">{api.method}</td>
            <td className={`px-3 py-2 text-sm ${
              api.averageResponseTime > 1000 ? 'text-red-600 font-medium' :
              api.averageResponseTime > 500 ? 'text-orange-600' : 'text-gray-500'
            }`}>
              {api.averageResponseTime.toFixed(0)}ms
            </td>
            <td className="px-3 py-2 text-sm text-gray-500">{api.requestCount}</td>
            <td className={`px-3 py-2 text-sm ${
              api.errorCount / api.requestCount > 0.1 ? 'text-red-600 font-medium' : 'text-gray-500'
            }`}>
              {((api.errorCount / api.requestCount) * 100).toFixed(1)}%
            </td>
            <td className={`px-3 py-2 text-sm ${
              api.cacheHitRate < 0.5 ? 'text-orange-600' : 'text-green-600'
            }`}>
              {(api.cacheHitRate * 100).toFixed(1)}%
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
));

const PerformanceWarnings = memo<{ warnings: PerformanceReport['warnings'] }>(({ warnings }) => (
  <div className="space-y-3">
    {warnings.map((warning, index) => {
      const getSeverityClass = () => {
        switch (warning.severity) {
          case 'high': return 'bg-red-50 border-red-200 text-red-800';
          case 'medium': return 'bg-yellow-50 border-yellow-200 text-yellow-800';
          default: return 'bg-blue-50 border-blue-200 text-blue-800';
        }
      };

      const getIcon = () => {
        switch (warning.type) {
          case 'slow-render': return '🐌';
          case 'memory-leak': return '🔍';
          case 'cache-miss': return '💨';
          case 'api-error': return '🚨';
          case 'user-friction': return '😤';
          default: return '⚠️';
        }
      };

      return (
        <div key={index} className={`p-3 rounded-lg border ${getSeverityClass()}`}>
          <div className="flex items-start gap-3">
            <span className="text-lg">{getIcon()}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <h4 className="font-medium text-sm capitalize">{warning.type.replace('-', ' ')}</h4>
                <span className="text-xs px-2 py-1 bg-white bg-opacity-50 rounded">
                  {warning.severity}
                </span>
              </div>
              <p className="text-sm mb-2">{warning.message}</p>
              {warning.recommendation && (
                <p className="text-xs italic">💡 {warning.recommendation}</p>
              )}
            </div>
          </div>
        </div>
      );
    })}
  </div>
));

export const PerformanceDashboard: React.FC<PerformanceDashboardProps> = memo(({
  autoRefresh = true,
  refreshInterval = 5000,
  className = ''
}) => {
  const [report, setReport] = useState<PerformanceReport | null>(null);
  const [isEnabled, setIsEnabled] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'components' | 'apis' | 'warnings'>('overview');

  // Check if monitoring is enabled
  useEffect(() => {
    setIsEnabled(process.env.NODE_ENV === 'development' || localStorage.getItem('org-perf-monitor') === 'true');
  }, []);

  // Auto refresh data
  useEffect(() => {
    if (!autoRefresh || !isEnabled) return;

    const fetchReport = () => {
      try {
        const newReport = organizationalPerformanceMonitor.getPerformanceReport();
        setReport(newReport);
      } catch (error) {
        console.error('Failed to fetch performance report:', error);
      }
    };

    fetchReport();
    const interval = setInterval(fetchReport, refreshInterval);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, isEnabled]);

  const toggleMonitoring = () => {
    const newEnabled = !isEnabled;
    setIsEnabled(newEnabled);
    organizationalPerformanceMonitor.setEnabled(newEnabled);
  };

  const exportReport = () => {
    if (!report) return;

    const dataStr = organizationalPerformanceMonitor.exportMetrics();
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `performance-report-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const clearMetrics = () => {
    organizationalPerformanceMonitor.clearMetrics();
    setReport(organizationalPerformanceMonitor.getPerformanceReport());
  };

  if (process.env.NODE_ENV === 'production' && !localStorage.getItem('org-perf-monitor')) {
    return (
      <div className="p-6 text-center">
        <h3 className="text-lg font-medium text-gray-900 mb-2">Performance Monitoring</h3>
        <p className="text-gray-500 mb-4">
          Performance monitoring is not available in production mode.
        </p>
        <button
          onClick={() => {
            localStorage.setItem('org-perf-monitor', 'true');
            setIsEnabled(true);
          }}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Enable Monitoring
        </button>
      </div>
    );
  }

  return (
    <div className={`performance-dashboard ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-medium text-gray-900">Performance Dashboard</h3>
          <p className="text-sm text-gray-500">
            Real-time monitoring of organizational dashboard performance
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={toggleMonitoring}
            className={`px-3 py-1 rounded text-sm font-medium ${
              isEnabled
                ? 'bg-green-100 text-green-800'
                : 'bg-gray-100 text-gray-800'
            }`}
          >
            {isEnabled ? 'Monitoring On' : 'Monitoring Off'}
          </button>

          {report && (
            <>
              <button
                onClick={exportReport}
                className="px-3 py-1 bg-blue-100 text-blue-800 rounded text-sm font-medium hover:bg-blue-200"
              >
                Export
              </button>
              <button
                onClick={clearMetrics}
                className="px-3 py-1 bg-red-100 text-red-800 rounded text-sm font-medium hover:bg-red-200"
              >
                Clear
              </button>
            </>
          )}
        </div>
      </div>

      {!isEnabled ? (
        <div className="text-center p-6">
          <p className="text-gray-500">Performance monitoring is disabled.</p>
        </div>
      ) : !report ? (
        <div className="text-center p-6">
          <p className="text-gray-500">Loading performance data...</p>
        </div>
      ) : (
        <>
          {/* Navigation Tabs */}
          <div className="border-b border-gray-200 mb-6">
            <nav className="flex space-x-8">
              {[
                { id: 'overview', label: 'Overview', count: report.warnings.length },
                { id: 'components', label: 'Components', count: report.components.length },
                { id: 'apis', label: 'APIs', count: report.apis.length },
                { id: 'warnings', label: 'Warnings', count: report.warnings.length }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`py-2 px-1 border-b-2 font-medium text-sm ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {tab.label}
                  {tab.count > 0 && (
                    <span className="ml-2 bg-gray-100 text-gray-900 py-0.5 px-2 rounded-full text-xs">
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
            </nav>
          </div>

          {/* Content */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* System Metrics */}
              <div>
                <h4 className="text-md font-medium text-gray-900 mb-3">System Metrics</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <PerformanceMetricCard
                    title="Memory Usage"
                    value={Math.round(report.system.memoryUsage / 1024 / 1024)}
                    unit="MB"
                    severity={report.system.memoryUsage > 50 * 1024 * 1024 ? 'warning' : 'good'}
                  />
                  <PerformanceMetricCard
                    title="Frame Rate"
                    value={report.system.frameRate}
                    unit="fps"
                    severity={report.system.frameRate < 30 ? 'critical' : 'good'}
                  />
                  <PerformanceMetricCard
                    title="Cache Hit Rate"
                    value={Math.round(report.cache.hitRate * 100)}
                    unit="%"
                    severity={report.cache.hitRate < 0.5 ? 'warning' : 'good'}
                  />
                  <PerformanceMetricCard
                    title="API Avg Response"
                    value={Math.round(report.system.networkLatency || 0)}
                    unit="ms"
                    severity={(report.system.networkLatency || 0) > 1000 ? 'critical' : 'good'}
                  />
                </div>
              </div>

              {/* Quick Stats */}
              <div>
                <h4 className="text-md font-medium text-gray-900 mb-3">Quick Stats</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <PerformanceMetricCard
                    title="Components Tracked"
                    value={report.components.length}
                    description="Active components with performance data"
                  />
                  <PerformanceMetricCard
                    title="API Endpoints"
                    value={report.apis.length}
                    description="Monitored API endpoints"
                  />
                  <PerformanceMetricCard
                    title="Cache Entries"
                    value={report.cache.entryCount}
                    description="Cached data entries"
                  />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'components' && (
            <div>
              <h4 className="text-md font-medium text-gray-900 mb-3">Component Performance</h4>
              <ComponentPerformanceTable components={report.components} />
            </div>
          )}

          {activeTab === 'apis' && (
            <div>
              <h4 className="text-md font-medium text-gray-900 mb-3">API Performance</h4>
              <APIPerformanceTable apis={report.apis} />
            </div>
          )}

          {activeTab === 'warnings' && (
            <div>
              <h4 className="text-md font-medium text-gray-900 mb-3">Performance Warnings</h4>
              {report.warnings.length === 0 ? (
                <div className="text-center p-6">
                  <span className="text-4xl mb-2 block">🎉</span>
                  <p className="text-gray-500">No performance issues detected!</p>
                </div>
              ) : (
                <PerformanceWarnings warnings={report.warnings} />
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
});

export default PerformanceDashboard;