/**
 * MultiOperatorComparison Component
 *
 * Compares multiple operators side-by-side with parallel timeline visualization,
 * productivity metrics comparison, and collaborative pattern analysis.
 */

import { ArrowUpDown, BarChart3, Compare, TrendingUp, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useOrganizationalContext } from '../../../../contexts/OrganizationalContext';
import type { SessionCorrelation } from '../../../types/organizational.js';
import type { ActivityEvent, OperatorTimeline } from './OperatorTimelineView.js';

export interface OperatorComparison {
  readonly operatorId: string;
  readonly teamId?: string;
  readonly displayName?: string;
  readonly timeline: OperatorTimeline;
  readonly performanceScore: number;
  readonly rank: number;
  readonly strengthAreas: readonly string[];
  readonly improvementAreas: readonly string[];
  readonly collaborationIndex: number;
}

export interface ComparisonMetric {
  readonly metricName: string;
  readonly unit: string;
  readonly values: readonly {
    operatorId: string;
    value: number;
    trend: 'up' | 'down' | 'stable';
  }[];
  readonly ranking: readonly string[]; // operatorIds in rank order
  readonly benchmark: number; // Team average or target
  readonly category: 'productivity' | 'quality' | 'collaboration' | 'efficiency';
}

export interface ComparisonAnalysis {
  readonly operators: readonly OperatorComparison[];
  readonly metrics: readonly ComparisonMetric[];
  readonly timeRange: { start: number; end: number };
  readonly totalEvents: number;
  readonly teamAverages: Record<string, number>;
  readonly insights: readonly string[];
  readonly recommendations: readonly string[];
  readonly analyzedAt: number;
}

interface MultiOperatorComparisonProps {
  /** Session correlation data for comparison context */
  readonly sessionCorrelation: SessionCorrelation;
  /** List of operator IDs to compare */
  readonly operatorIds: readonly string[];
  /** Time range for comparison */
  readonly timeRange?: 'day' | 'week' | 'month' | 'quarter';
  /** Display mode for comparison */
  readonly mode?: 'timelines' | 'metrics' | 'performance' | 'collaboration';
  /** Metrics to focus on in comparison */
  readonly focusMetrics?: readonly string[];
  /** Whether to show real-time updates */
  readonly realTime?: boolean;
  /** Callback for operator selection */
  readonly onSelectOperator?: (operatorId: string) => void;
  /** Additional CSS classes */
  readonly className?: string;
}

const getMetricCategoryColor = (category: ComparisonMetric['category']) => {
  switch (category) {
    case 'productivity':
      return 'org-metric-productivity';
    case 'quality':
      return 'org-metric-quality';
    case 'collaboration':
      return 'org-metric-collaboration';
    case 'efficiency':
      return 'org-metric-efficiency';
    default:
      return 'org-metric-default';
  }
};

const getPerformanceColor = (score: number) => {
  if (score >= 0.9) return 'org-text-success';
  if (score >= 0.7) return 'org-text-info';
  if (score >= 0.5) return 'org-text-warning';
  return 'org-text-error';
};

const getTrendIcon = (trend: 'up' | 'down' | 'stable') => {
  switch (trend) {
    case 'up':
      return <TrendingUp className="h-3 w-3 org-text-success" />;
    case 'down':
      return <TrendingUp className="h-3 w-3 org-text-error transform rotate-180" />;
    case 'stable':
      return <ArrowUpDown className="h-3 w-3 org-text-muted" />;
    default:
      return <ArrowUpDown className="h-3 w-3 org-text-muted" />;
  }
};

const formatMetricValue = (value: number, unit: string): string => {
  if (unit === '%') return `${Math.round(value * 100)}%`;
  if (unit === 'hours') return `${(value / 3600000).toFixed(1)}h`;
  if (unit === 'minutes') return `${Math.round(value / 60000)}m`;
  return value.toString();
};

const TimelinesView: React.FC<{
  analysis: ComparisonAnalysis;
  onSelectOperator?: (operatorId: string) => void;
}> = ({ analysis, onSelectOperator }) => {
  const [selectedOperator, setSelectedOperator] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);

  const timeSpan = analysis.timeRange.end - analysis.timeRange.start;
  const _pixelsPerMs = (1000 * zoomLevel) / timeSpan;

  return (
    <div className="org-multi-timelines">
      <div className="flex items-center justify-between mb-4">
        <h4 className="org-text-lg org-font-semibold">Parallel Activity Timelines</h4>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setZoomLevel((prev) => Math.min(prev * 1.5, 4))}
            className="org-button org-button-ghost org-button-sm"
          >
            Zoom In
          </button>
          <button
            onClick={() => setZoomLevel((prev) => Math.max(prev / 1.5, 0.5))}
            className="org-button org-button-ghost org-button-sm"
          >
            Zoom Out
          </button>
        </div>
      </div>

      <div className="space-y-6">
        {analysis.operators.map((operator, operatorIndex) => {
          const isSelected = selectedOperator === operator.operatorId;

          return (
            <div key={operator.operatorId} className="org-timeline-row">
              <div className="flex items-center justify-between mb-3">
                <div
                  className={`flex items-center space-x-3 ${onSelectOperator ? 'cursor-pointer' : ''}`}
                  onClick={() => {
                    setSelectedOperator(operator.operatorId);
                    onSelectOperator?.(operator.operatorId);
                  }}
                >
                  <div
                    className={`w-8 h-8 rounded-full org-bg-primary-light flex items-center justify-center ${
                      isSelected ? 'ring-2 ring-primary' : ''
                    }`}
                  >
                    <span className="org-text-primary org-font-semibold org-text-sm">
                      {operator.rank}
                    </span>
                  </div>
                  <div>
                    <div className="org-font-semibold">
                      {operator.displayName || operator.operatorId.slice(-8)}
                    </div>
                    <div className="org-text-sm org-text-muted">
                      Score: {Math.round(operator.performanceScore * 100)}%
                      <span className="ml-2">{operator.timeline.events.length} events</span>
                    </div>
                  </div>
                </div>
                <div className="org-text-sm org-text-muted">
                  {Math.round(operator.timeline.totalActiveTime / 3600000)}h active
                </div>
              </div>

              <div className="relative overflow-x-auto">
                <div
                  style={{ width: `${1000 * zoomLevel}px`, minWidth: '1000px' }}
                  className="relative h-16 org-bg-surface rounded-lg"
                >
                  {/* Time grid */}
                  <div className="absolute inset-0 flex">
                    {Array.from({ length: 24 }, (_, hour) => (
                      <div
                        key={hour}
                        className="flex-1 org-border-l org-border-muted"
                        style={{ minWidth: `${(1000 * zoomLevel) / 24}px` }}
                      >
                        {operatorIndex === 0 && (
                          <div className="org-text-xs org-text-muted absolute -top-6">
                            {hour}:00
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Activity events */}
                  {operator.timeline.events.map((event) => {
                    const eventTime = new Date(event.timestamp);
                    const eventHour = eventTime.getHours();
                    const eventMinute = eventTime.getMinutes();
                    const hourProgress = eventMinute / 60;
                    const left = ((eventHour + hourProgress) / 24) * 100;

                    const duration = event.duration || 1800000; // Default 30min
                    const width = Math.max((duration / timeSpan) * 100, 0.5);

                    const eventColor =
                      event.category === 'coding'
                        ? 'org-bg-blue-500'
                        : event.category === 'debugging'
                          ? 'org-bg-red-500'
                          : event.category === 'review'
                            ? 'org-bg-purple-500'
                            : event.category === 'meeting'
                              ? 'org-bg-orange-500'
                              : event.category === 'research'
                                ? 'org-bg-green-500'
                                : 'org-bg-gray-500';

                    return (
                      <div
                        key={event.id}
                        className={`absolute rounded ${eventColor} opacity-70 hover:opacity-100 transition-opacity`}
                        style={{
                          left: `${left}%`,
                          width: `${width}%`,
                          height: '32px',
                          top: '16px',
                        }}
                        title={`${event.title} - ${event.category} (${Math.round(duration / 60000)}m)`}
                      >
                        <div className="h-full flex items-center px-1">
                          <span className="org-text-xs text-white truncate">{event.title}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {isSelected && (
                <div className="mt-3 p-3 org-bg-surface-light rounded">
                  <div className="grid grid-cols-4 gap-4 org-text-sm">
                    <div>
                      <div className="org-text-muted">Performance Rank</div>
                      <div className="org-font-semibold">#{operator.rank}</div>
                    </div>
                    <div>
                      <div className="org-text-muted">Collaboration Index</div>
                      <div className="org-font-semibold">
                        {Math.round(operator.collaborationIndex * 100)}
                      </div>
                    </div>
                    <div>
                      <div className="org-text-muted">Strengths</div>
                      <div className="org-font-semibold">
                        {operator.strengthAreas.slice(0, 2).join(', ')}
                      </div>
                    </div>
                    <div>
                      <div className="org-text-muted">Focus Areas</div>
                      <div className="org-font-semibold">
                        {operator.improvementAreas.slice(0, 2).join(', ')}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-6 p-4 org-bg-surface rounded-lg">
        <h5 className="org-font-semibold mb-2">Activity Types</h5>
        <div className="flex flex-wrap gap-4 org-text-sm">
          {[
            { category: 'coding', color: 'org-bg-blue-500', label: 'Coding' },
            { category: 'debugging', color: 'org-bg-red-500', label: 'Debugging' },
            { category: 'review', color: 'org-bg-purple-500', label: 'Code Review' },
            { category: 'meeting', color: 'org-bg-orange-500', label: 'Meetings' },
            { category: 'research', color: 'org-bg-green-500', label: 'Research' },
            { category: 'other', color: 'org-bg-gray-500', label: 'Other' },
          ].map(({ category, color, label }) => (
            <div key={category} className="flex items-center space-x-2">
              <div className={`w-4 h-4 rounded ${color}`}></div>
              <span>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const MetricsView: React.FC<{
  analysis: ComparisonAnalysis;
  focusMetrics?: readonly string[];
}> = ({ analysis, focusMetrics }) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const filteredMetrics =
    selectedCategory === 'all'
      ? analysis.metrics
      : analysis.metrics.filter((m) => m.category === selectedCategory);

  const displayMetrics = focusMetrics
    ? filteredMetrics.filter((m) => focusMetrics.includes(m.metricName))
    : filteredMetrics;

  const categories = [...new Set(analysis.metrics.map((m) => m.category))];

  return (
    <div className="org-multi-metrics">
      <div className="flex items-center justify-between mb-6">
        <h4 className="org-text-lg org-font-semibold">Performance Metrics Comparison</h4>
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="org-select"
        >
          <option value="all">All Categories</option>
          {categories.map((cat) => (
            <option key={cat} value={cat} className="capitalize">
              {cat}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-6">
        {displayMetrics.map((metric) => (
          <div key={metric.metricName} className="org-card-inner">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h5 className="org-font-semibold capitalize">
                  {metric.metricName.replace('-', ' ')}
                </h5>
                <div className={`org-text-sm ${getMetricCategoryColor(metric.category)}`}>
                  {metric.category}
                </div>
              </div>
              <div className="text-right">
                <div className="org-text-sm org-text-muted">Team Average</div>
                <div className="org-font-semibold">
                  {formatMetricValue(metric.benchmark, metric.unit)}
                </div>
              </div>
            </div>

            <div className="space-y-3">
              {metric.values
                .sort((a, b) => b.value - a.value)
                .map((operatorValue, index) => {
                  const operator = analysis.operators.find(
                    (op) => op.operatorId === operatorValue.operatorId,
                  );
                  const maxValue = Math.max(...metric.values.map((v) => v.value));
                  const percentage = maxValue > 0 ? (operatorValue.value / maxValue) * 100 : 0;
                  const isAboveBenchmark = operatorValue.value > metric.benchmark;

                  return (
                    <div
                      key={operatorValue.operatorId}
                      className="flex items-center justify-between"
                    >
                      <div className="flex items-center space-x-3 flex-1">
                        <div className="w-6 h-6 rounded-full org-bg-primary-light flex items-center justify-center">
                          <span className="org-text-primary org-font-semibold org-text-xs">
                            {index + 1}
                          </span>
                        </div>
                        <div className="flex-1">
                          <div className="org-font-medium">
                            {operator?.displayName || operatorValue.operatorId.slice(-8)}
                          </div>
                          <div className="flex items-center space-x-2 mt-1">
                            <div className="flex-1 h-2 org-bg-surface rounded-full">
                              <div
                                className={`h-full rounded-full ${
                                  isAboveBenchmark ? 'org-bg-success' : 'org-bg-warning'
                                }`}
                                style={{ width: `${percentage}%` }}
                              />
                            </div>
                            <div className="flex items-center space-x-1">
                              {getTrendIcon(operatorValue.trend)}
                              <span
                                className={`org-text-sm ${
                                  isAboveBenchmark ? 'org-text-success' : 'org-text-warning'
                                }`}
                              >
                                {formatMetricValue(operatorValue.value, metric.unit)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        ))}
      </div>

      {displayMetrics.length === 0 && (
        <div className="org-empty-state">
          <BarChart3 className="h-8 w-8 org-text-muted mb-2" />
          <div className="org-text-muted">No metrics match the current filter</div>
        </div>
      )}
    </div>
  );
};

const PerformanceView: React.FC<{
  analysis: ComparisonAnalysis;
}> = ({ analysis }) => {
  const sortedOperators = [...analysis.operators].sort(
    (a, b) => b.performanceScore - a.performanceScore,
  );

  return (
    <div className="org-multi-performance">
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="org-stat-card">
          <div className="org-stat-value">{analysis.operators.length}</div>
          <div className="org-stat-label">Operators</div>
        </div>
        <div className="org-stat-card">
          <div className="org-stat-value">{analysis.totalEvents}</div>
          <div className="org-stat-label">Total Events</div>
        </div>
        <div className="org-stat-card">
          <div className="org-stat-value">
            {Math.round(
              (analysis.operators.reduce((sum, op) => sum + op.performanceScore, 0) /
                analysis.operators.length) *
                100,
            )}
            %
          </div>
          <div className="org-stat-label">Avg Performance</div>
        </div>
        <div className="org-stat-card">
          <div className="org-stat-value">
            {Math.round(
              (analysis.operators.reduce((sum, op) => sum + op.collaborationIndex, 0) /
                analysis.operators.length) *
                100,
            )}
          </div>
          <div className="org-stat-label">Avg Collaboration</div>
        </div>
      </div>

      <div className="space-y-4">
        {sortedOperators.map((operator) => (
          <div key={operator.operatorId} className="org-card-inner">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-start space-x-4">
                <div className="w-12 h-12 rounded-lg org-bg-primary-light flex items-center justify-center">
                  <span className="org-text-primary org-font-bold">{operator.rank}</span>
                </div>
                <div className="flex-1">
                  <h5 className="org-text-lg org-font-semibold mb-1">
                    {operator.displayName || operator.operatorId.slice(-8)}
                  </h5>
                  <div className="flex items-center space-x-4 org-text-sm org-text-muted mb-2">
                    <span>Team: {operator.teamId || 'N/A'}</span>
                    <span>Events: {operator.timeline.events.length}</span>
                    <span>Active: {Math.round(operator.timeline.totalActiveTime / 3600000)}h</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-32 h-2 org-bg-surface rounded-full">
                      <div
                        className={`h-full rounded-full ${getPerformanceColor(operator.performanceScore).replace('org-text', 'org-bg')}`}
                        style={{ width: `${operator.performanceScore * 100}%` }}
                      />
                    </div>
                    <span
                      className={`org-font-semibold ${getPerformanceColor(operator.performanceScore)}`}
                    >
                      {Math.round(operator.performanceScore * 100)}%
                    </span>
                  </div>
                </div>
              </div>

              <div className="text-right">
                <div className="org-text-sm org-text-muted">Collaboration Index</div>
                <div className="org-font-semibold">
                  {Math.round(operator.collaborationIndex * 100)}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div>
                <h6 className="org-font-semibold mb-2 org-text-success">Strengths</h6>
                <ul className="space-y-1">
                  {operator.strengthAreas.map((area) => (
                    <li key={area} className="org-text-sm org-text-muted capitalize">
                      • {area.replace('-', ' ')}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h6 className="org-font-semibold mb-2 org-text-warning">Improvement Areas</h6>
                <ul className="space-y-1">
                  {operator.improvementAreas.map((area) => (
                    <li key={area} className="org-text-sm org-text-muted capitalize">
                      • {area.replace('-', ' ')}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const CollaborationView: React.FC<{
  analysis: ComparisonAnalysis;
}> = ({ analysis }) => {
  const collaborativeEvents = analysis.operators.flatMap((op) =>
    op.timeline.events.filter(
      (event) =>
        event.eventType === 'collaboration' ||
        (event.collaborators && event.collaborators.length > 0),
    ),
  );

  const collaborationMatrix = analysis.operators.reduce(
    (matrix, sourceOp) => {
      matrix[sourceOp.operatorId] = analysis.operators.reduce(
        (row, targetOp) => {
          if (sourceOp.operatorId === targetOp.operatorId) {
            row[targetOp.operatorId] = 0;
          } else {
            // Count collaborative events between operators
            const collaborations = sourceOp.timeline.events.filter((event) =>
              event.collaborators?.includes(targetOp.operatorId),
            ).length;
            row[targetOp.operatorId] = collaborations;
          }
          return row;
        },
        {} as Record<string, number>,
      );
      return matrix;
    },
    {} as Record<string, Record<string, number>>,
  );

  return (
    <div className="org-multi-collaboration">
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="org-stat-card">
          <div className="org-stat-value">{collaborativeEvents.length}</div>
          <div className="org-stat-label">Collaborative Events</div>
        </div>
        <div className="org-stat-card">
          <div className="org-stat-value">
            {Math.round(
              (analysis.operators.reduce((sum, op) => sum + op.collaborationIndex, 0) /
                analysis.operators.length) *
                100,
            )}
            %
          </div>
          <div className="org-stat-label">Avg Collaboration</div>
        </div>
        <div className="org-stat-card">
          <div className="org-stat-value">
            {new Set(collaborativeEvents.flatMap((e) => e.collaborators || [])).size}
          </div>
          <div className="org-stat-label">Active Pairs</div>
        </div>
      </div>

      <div className="mb-6">
        <h4 className="org-text-lg org-font-semibold mb-4">Collaboration Matrix</h4>
        <div className="overflow-x-auto">
          <table className="org-table">
            <thead>
              <tr>
                <th className="org-text-left"></th>
                {analysis.operators.map((op) => (
                  <th key={op.operatorId} className="org-text-center org-text-xs">
                    {op.operatorId.slice(-6)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {analysis.operators.map((sourceOp) => (
                <tr key={sourceOp.operatorId}>
                  <td className="org-font-medium org-text-sm">{sourceOp.operatorId.slice(-6)}</td>
                  {analysis.operators.map((targetOp) => {
                    const count = collaborationMatrix[sourceOp.operatorId][targetOp.operatorId];
                    const maxCount = Math.max(
                      ...Object.values(collaborationMatrix).flatMap((row) => Object.values(row)),
                    );
                    const intensity = maxCount > 0 ? count / maxCount : 0;

                    return (
                      <td
                        key={targetOp.operatorId}
                        className="org-text-center"
                        style={{
                          backgroundColor:
                            count > 0
                              ? `rgba(59, 130, 246, ${0.2 + intensity * 0.6})`
                              : 'transparent',
                        }}
                      >
                        <span
                          className={`org-text-xs ${count > 0 ? 'org-text-primary-dark' : 'org-text-muted'}`}
                        >
                          {count}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-4">
        <h4 className="org-text-lg org-font-semibold">Top Collaborators</h4>
        {analysis.operators
          .sort((a, b) => b.collaborationIndex - a.collaborationIndex)
          .slice(0, 5)
          .map((operator, index) => {
            const operatorCollaborations = operator.timeline.events.filter(
              (e) =>
                e.eventType === 'collaboration' || (e.collaborators && e.collaborators.length > 0),
            );

            return (
              <div key={operator.operatorId} className="org-card-inner org-card-sm">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 rounded-full org-bg-primary-light flex items-center justify-center">
                      <span className="org-text-primary org-font-semibold org-text-sm">
                        {index + 1}
                      </span>
                    </div>
                    <div>
                      <div className="org-font-medium">
                        {operator.displayName || operator.operatorId.slice(-8)}
                      </div>
                      <div className="org-text-sm org-text-muted">
                        {operatorCollaborations.length} collaborative events
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="org-font-semibold org-text-primary">
                      {Math.round(operator.collaborationIndex * 100)}
                    </div>
                    <div className="org-text-xs org-text-muted">index</div>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <span className="org-text-sm org-text-muted">Most active with:</span>
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(collaborationMatrix[operator.operatorId])
                      .filter(([, count]) => count > 0)
                      .sort(([, a], [, b]) => b - a)
                      .slice(0, 3)
                      .map(([collaboratorId]) => (
                        <span
                          key={collaboratorId}
                          className="org-badge org-badge-info org-badge-xs"
                        >
                          {collaboratorId.slice(-6)}
                        </span>
                      ))}
                  </div>
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
};

export const MultiOperatorComparison: React.FC<MultiOperatorComparisonProps> = ({
  sessionCorrelation,
  operatorIds,
  timeRange = 'week',
  mode = 'timelines',
  focusMetrics,
  realTime = false,
  onSelectOperator,
  className = '',
}) => {
  const { teamFilter } = useOrganizationalContext();
  const [analysis, setAnalysis] = useState<ComparisonAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchComparisonAnalysis = async () => {
      try {
        setLoading(true);
        setError(null);

        const timeRangeMs = {
          day: 86400000,
          week: 604800000,
          month: 2592000000,
          quarter: 7776000000,
        }[timeRange];

        const endTime = Date.now();
        const startTime = endTime - timeRangeMs;

        // Generate mock comparison data
        const operators: OperatorComparison[] = operatorIds.map((operatorId, index) => {
          // Generate mock timeline for each operator
          const events: ActivityEvent[] = Array.from(
            { length: 15 + Math.random() * 20 },
            (_, i) => ({
              id: `${operatorId}-event-${i}`,
              operatorId,
              timestamp: startTime + Math.random() * timeRangeMs,
              eventType: [
                'task-start',
                'task-complete',
                'collaboration',
                'problem-solving',
                'review',
              ][Math.floor(Math.random() * 5)] as ActivityEvent['eventType'],
              title: `Task ${i + 1}`,
              duration: 300000 + Math.random() * 3600000,
              outcome: Math.random() > 0.2 ? 'success' : 'failure',
              category: ['coding', 'debugging', 'review', 'research', 'meeting'][
                Math.floor(Math.random() * 5)
              ] as ActivityEvent['category'],
              collaborators:
                Math.random() > 0.7
                  ? operatorIds
                      .filter((id) => id !== operatorId)
                      .slice(0, Math.floor(Math.random() * 2) + 1)
                  : undefined,
            }),
          );

          const totalActiveTime = events.reduce((sum, e) => sum + (e.duration || 0), 0);
          const performanceScore = 0.4 + Math.random() * 0.6;

          const timeline: OperatorTimeline = {
            operatorId,
            teamId: sessionCorrelation.teamId,
            timeRange: { start: startTime, end: endTime },
            events,
            productivityMetrics: [],
            workingSessions: Math.floor(totalActiveTime / 3600000) + 1,
            totalActiveTime,
            avgSessionDuration:
              totalActiveTime / Math.max(Math.floor(totalActiveTime / 3600000), 1),
            peakProductivityHours: [9, 10, 14, 15],
            patternScore: Math.random(),
            generatedAt: Date.now(),
          };

          return {
            operatorId,
            teamId: sessionCorrelation.teamId,
            displayName: `Operator ${operatorId.slice(-4)}`,
            timeline,
            performanceScore,
            rank: index + 1, // Will be recalculated below
            strengthAreas: [
              'productivity',
              'collaboration',
              'code-quality',
              'problem-solving',
            ].slice(0, 2 + (index % 3)),
            improvementAreas: [
              'time-management',
              'documentation',
              'testing',
              'communication',
            ].slice(0, 1 + (index % 2)),
            collaborationIndex: 0.3 + Math.random() * 0.7,
          };
        });

        // Recalculate ranks based on performance scores
        const sortedByPerformance = [...operators].sort(
          (a, b) => b.performanceScore - a.performanceScore,
        );
        sortedByPerformance.forEach((op, index) => {
          const operatorIndex = operators.findIndex((o) => o.operatorId === op.operatorId);
          if (operatorIndex >= 0) {
            operators[operatorIndex] = { ...operators[operatorIndex], rank: index + 1 };
          }
        });

        const metrics: ComparisonMetric[] = [
          {
            metricName: 'tasks-completed',
            unit: 'count',
            values: operators.map((op) => ({
              operatorId: op.operatorId,
              value: op.timeline.events.filter((e) => e.outcome === 'success').length,
              trend: 'up',
            })),
            ranking: operators
              .sort(
                (a, b) =>
                  b.timeline.events.filter((e) => e.outcome === 'success').length -
                  a.timeline.events.filter((e) => e.outcome === 'success').length,
              )
              .map((op) => op.operatorId),
            benchmark: 8,
            category: 'productivity',
          },
          {
            metricName: 'success-rate',
            unit: '%',
            values: operators.map((op) => {
              const successful = op.timeline.events.filter((e) => e.outcome === 'success').length;
              const total = op.timeline.events.length;
              return {
                operatorId: op.operatorId,
                value: total > 0 ? successful / total : 0,
                trend: Math.random() > 0.5 ? 'up' : 'stable',
              };
            }),
            ranking: [],
            benchmark: 0.75,
            category: 'quality',
          },
          {
            metricName: 'collaboration-events',
            unit: 'count',
            values: operators.map((op) => ({
              operatorId: op.operatorId,
              value: op.timeline.events.filter(
                (e) =>
                  e.eventType === 'collaboration' ||
                  (e.collaborators && e.collaborators.length > 0),
              ).length,
              trend: 'stable',
            })),
            ranking: [],
            benchmark: 5,
            category: 'collaboration',
          },
        ];

        const totalEvents = operators.reduce((sum, op) => sum + op.timeline.events.length, 0);

        setAnalysis({
          operators,
          metrics,
          timeRange: { start: startTime, end: endTime },
          totalEvents,
          teamAverages: {
            performanceScore:
              operators.reduce((sum, op) => sum + op.performanceScore, 0) / operators.length,
            collaborationIndex:
              operators.reduce((sum, op) => sum + op.collaborationIndex, 0) / operators.length,
          },
          insights: [
            `${operators[0].displayName} leads in overall performance`,
            `Collaboration is strongest between operators ${operators[0].operatorId.slice(-4)} and ${operators[1].operatorId.slice(-4)}`,
            'Peak productivity hours are consistently 9-11 AM across all operators',
          ],
          recommendations: [
            'Consider pairing high-performers with those needing improvement',
            'Schedule collaborative sessions during peak hours',
            'Implement knowledge sharing sessions for best practices',
          ],
          analyzedAt: Date.now(),
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load comparison analysis');
      } finally {
        setLoading(false);
      }
    };

    fetchComparisonAnalysis();
  }, [operatorIds, sessionCorrelation, timeRange]);

  // Real-time updates
  useEffect(() => {
    if (!realTime || !analysis) return;

    const interval = setInterval(() => {
      setAnalysis((prev) => (prev ? { ...prev, analyzedAt: Date.now() } : prev));
    }, 30000); // Update every 30 seconds

    return () => clearInterval(interval);
  }, [realTime, analysis]);

  if (loading) {
    return (
      <div className={`org-multi-comparison org-loading ${className}`}>
        <div className="flex items-center space-x-2">
          <div className="org-spinner org-spinner-sm" />
          <span className="org-text-muted">Loading operator comparison...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`org-multi-comparison org-error ${className}`}>
        <div className="org-error-message">
          <Compare className="h-5 w-5 text-red-500" />
          <span>Failed to load comparison: {error}</span>
        </div>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className={`org-multi-comparison org-empty ${className}`}>
        <div className="org-empty-state">
          <Users className="h-8 w-8 org-text-muted mb-2" />
          <div className="org-text-muted">No comparison data available</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`org-multi-comparison org-comparison-${mode} ${className}`}>
      <div className="flex items-center justify-between mb-6">
        <h3 className="org-text-xl org-font-semibold">Multi-Operator Comparison</h3>
        <div className="flex items-center space-x-4 org-text-sm org-text-muted">
          {realTime && (
            <div className="flex items-center space-x-1">
              <div className="w-2 h-2 rounded-full org-bg-success animate-pulse"></div>
              <span>Live</span>
            </div>
          )}
          <span>{analysis.operators.length} operators</span>
          <span>{analysis.totalEvents} events</span>
          <span>{timeRange}</span>
        </div>
      </div>

      {mode === 'timelines' && (
        <TimelinesView analysis={analysis} onSelectOperator={onSelectOperator} />
      )}
      {mode === 'metrics' && <MetricsView analysis={analysis} focusMetrics={focusMetrics} />}
      {mode === 'performance' && <PerformanceView analysis={analysis} />}
      {mode === 'collaboration' && <CollaborationView analysis={analysis} />}

      {/* Insights and Recommendations */}
      {mode !== 'timelines' && (
        <div className="mt-8 grid grid-cols-2 gap-6">
          <div className="org-card-inner">
            <h4 className="org-font-semibold mb-3">Key Insights</h4>
            <ul className="space-y-2">
              {analysis.insights.map((insight, index) => (
                <li key={index} className="org-text-sm org-text-muted flex items-start space-x-2">
                  <div className="w-1 h-1 rounded-full org-bg-primary mt-2 flex-shrink-0"></div>
                  <span>{insight}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="org-card-inner">
            <h4 className="org-font-semibold mb-3">Recommendations</h4>
            <ul className="space-y-2">
              {analysis.recommendations.map((recommendation, index) => (
                <li key={index} className="org-text-sm org-text-muted flex items-start space-x-2">
                  <div className="w-1 h-1 rounded-full org-bg-success mt-2 flex-shrink-0"></div>
                  <span>{recommendation}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};

export default MultiOperatorComparison;
