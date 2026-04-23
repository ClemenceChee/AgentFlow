/**
 * TemporalSessionClustering Component
 *
 * Visualizes session clustering over time with pattern detection,
 * temporal analysis, and workload distribution insights.
 */

import {
  BarChart3,
  Calendar,
  Clock,
  Filter,
  Pause,
  Play,
  TrendingUp,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useOrganizationalContext } from '../../../../contexts/OrganizationalContext';
import type { SessionCorrelation } from '../../../types/organizational.js';

export interface TemporalCluster {
  readonly id: string;
  readonly startTime: number;
  readonly endTime: number;
  readonly sessions: readonly string[];
  readonly operatorIds: readonly string[];
  readonly teamIds: readonly string[];
  readonly clusterType:
    | 'burst'
    | 'steady-state'
    | 'collaborative'
    | 'maintenance'
    | 'crisis-response';
  readonly intensity: number; // Sessions per hour during the cluster
  readonly diversity: number; // How many different operators/teams involved
  readonly patterns: readonly string[];
  readonly peakTime: number;
  readonly confidence: number;
}

export interface TimeWindow {
  readonly start: number;
  readonly end: number;
  readonly granularity: 'hour' | 'day' | 'week' | 'month';
  readonly sessionCount: number;
  readonly operatorCount: number;
  readonly teamCount: number;
  readonly averageSessionDuration: number;
}

export interface TemporalPattern {
  readonly id: string;
  readonly patternType:
    | 'daily-peak'
    | 'weekly-cycle'
    | 'seasonal-burst'
    | 'crisis-response'
    | 'collaborative-session';
  readonly description: string;
  readonly frequency: 'high' | 'medium' | 'low';
  readonly predictability: number; // 0-1 score
  readonly timeRanges: readonly { start: number; end: number; days: readonly number[] }[];
  readonly associatedOperators: readonly string[];
  readonly historicalOccurrences: number;
  readonly confidence: number;
}

export interface ClusteringAnalysis {
  readonly timeRange: { start: number; end: number };
  readonly clusters: readonly TemporalCluster[];
  readonly patterns: readonly TemporalPattern[];
  readonly timeWindows: readonly TimeWindow[];
  readonly workloadDistribution: Record<string, number>; // operatorId -> session count
  readonly peakHours: readonly number[]; // Hours with highest activity
  readonly quietHours: readonly number[]; // Hours with lowest activity
  readonly clusteringScore: number; // How well sessions cluster (0-1)
  readonly totalSessions: number;
  readonly analyzedAt: number;
}

interface TemporalSessionClusteringProps {
  /** Session correlation data for temporal analysis */
  readonly sessionCorrelation: SessionCorrelation;
  /** Display mode for temporal clustering */
  readonly mode?: 'timeline' | 'heatmap' | 'patterns' | 'distribution';
  /** Time range for clustering analysis */
  readonly timeRange?: 'day' | 'week' | 'month' | 'quarter';
  /** Whether to show real-time updates */
  readonly realTime?: boolean;
  /** Callback for cluster selection */
  readonly onSelectCluster?: (clusterId: string) => void;
  /** Additional CSS classes */
  readonly className?: string;
}

const getClusterTypeColor = (type: TemporalCluster['clusterType']) => {
  switch (type) {
    case 'burst':
      return 'org-cluster-burst';
    case 'steady-state':
      return 'org-cluster-steady';
    case 'collaborative':
      return 'org-cluster-collaborative';
    case 'maintenance':
      return 'org-cluster-maintenance';
    case 'crisis-response':
      return 'org-cluster-crisis';
    default:
      return 'org-cluster-default';
  }
};

const getClusterTypeLabel = (type: TemporalCluster['clusterType']) => {
  switch (type) {
    case 'burst':
      return 'Activity Burst';
    case 'steady-state':
      return 'Steady State';
    case 'collaborative':
      return 'Collaborative';
    case 'maintenance':
      return 'Maintenance';
    case 'crisis-response':
      return 'Crisis Response';
    default:
      return 'Unknown';
  }
};

const getPatternIcon = (type: TemporalPattern['patternType']) => {
  switch (type) {
    case 'daily-peak':
      return <Clock className="h-4 w-4" />;
    case 'weekly-cycle':
      return <Calendar className="h-4 w-4" />;
    case 'seasonal-burst':
      return <TrendingUp className="h-4 w-4" />;
    case 'crisis-response':
      return <BarChart3 className="h-4 w-4" />;
    case 'collaborative-session':
      return <Filter className="h-4 w-4" />;
    default:
      return <Clock className="h-4 w-4" />;
  }
};

const getIntensityColor = (intensity: number) => {
  if (intensity >= 10) return 'org-intensity-very-high';
  if (intensity >= 5) return 'org-intensity-high';
  if (intensity >= 2) return 'org-intensity-medium';
  if (intensity >= 1) return 'org-intensity-low';
  return 'org-intensity-very-low';
};

const formatDuration = (ms: number): string => {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};

const TimelineView: React.FC<{
  analysis: ClusteringAnalysis;
  onSelectCluster?: (clusterId: string) => void;
}> = ({ analysis, onSelectCluster }) => {
  const [selectedCluster, setSelectedCluster] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);

  const timeSpan = analysis.timeRange.end - analysis.timeRange.start;
  const _pixelsPerMs = (800 * zoomLevel) / timeSpan; // Base width 800px

  return (
    <div className="org-temporal-timeline">
      <div className="flex items-center justify-between mb-4">
        <h4 className="org-text-lg org-font-semibold">Temporal Session Clusters</h4>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setZoomLevel((prev) => Math.min(prev * 2, 8))}
            className="org-button org-button-ghost org-button-sm"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <button
            onClick={() => setZoomLevel((prev) => Math.max(prev / 2, 0.25))}
            className="org-button org-button-ghost org-button-sm"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <span className="org-text-sm org-text-muted">{analysis.clusters.length} clusters</span>
        </div>
      </div>

      <div className="relative overflow-x-auto" style={{ maxWidth: '100%' }}>
        <div style={{ width: `${800 * zoomLevel}px`, minWidth: '800px' }}>
          {/* Time axis */}
          <div className="flex justify-between org-text-xs org-text-muted mb-2">
            <span>{new Date(analysis.timeRange.start).toLocaleDateString()}</span>
            <span>{new Date(analysis.timeRange.end).toLocaleDateString()}</span>
          </div>

          {/* Clusters visualization */}
          <div className="relative h-32 org-bg-surface rounded-lg mb-4">
            {analysis.clusters.map((cluster) => {
              const left = ((cluster.startTime - analysis.timeRange.start) / timeSpan) * 100;
              const width = ((cluster.endTime - cluster.startTime) / timeSpan) * 100;
              const height = Math.min(90, 20 + cluster.intensity * 8);
              const top = 90 - height;

              return (
                <div
                  key={cluster.id}
                  className={`absolute rounded ${getClusterTypeColor(cluster.clusterType)} ${
                    selectedCluster === cluster.id ? 'org-cluster-selected' : ''
                  } ${onSelectCluster ? 'cursor-pointer' : ''}`}
                  style={{
                    left: `${left}%`,
                    width: `${Math.max(width, 0.5)}%`,
                    height: `${height}px`,
                    top: `${top}px`,
                  }}
                  title={`${getClusterTypeLabel(cluster.clusterType)}: ${cluster.sessions.length} sessions`}
                  onClick={() => {
                    setSelectedCluster(cluster.id);
                    onSelectCluster?.(cluster.id);
                  }}
                >
                  <div className="p-1 org-text-xs org-font-medium text-white">
                    {cluster.sessions.length}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Activity intensity heatmap */}
          <div className="relative h-8 org-bg-surface rounded mb-4">
            {analysis.timeWindows.map((window, index) => {
              const left = ((window.start - analysis.timeRange.start) / timeSpan) * 100;
              const width = ((window.end - window.start) / timeSpan) * 100;
              const intensity = window.sessionCount / Math.max(window.end - window.start, 3600000); // sessions per hour

              return (
                <div
                  key={index}
                  className={`absolute h-full ${getIntensityColor(intensity)}`}
                  style={{
                    left: `${left}%`,
                    width: `${Math.max(width, 0.1)}%`,
                  }}
                  title={`${window.sessionCount} sessions in ${formatDuration(window.end - window.start)}`}
                />
              );
            })}
          </div>
        </div>
      </div>

      {selectedCluster && (
        <div className="mt-4 org-card-inner">
          <h5 className="org-font-semibold mb-2">Cluster Details</h5>
          {(() => {
            const cluster = analysis.clusters.find((c) => c.id === selectedCluster);
            if (!cluster) return null;

            return (
              <div className="grid grid-cols-2 gap-4 org-text-sm">
                <div>
                  <div className="org-text-muted">Type</div>
                  <div>{getClusterTypeLabel(cluster.clusterType)}</div>
                </div>
                <div>
                  <div className="org-text-muted">Duration</div>
                  <div>{formatDuration(cluster.endTime - cluster.startTime)}</div>
                </div>
                <div>
                  <div className="org-text-muted">Sessions</div>
                  <div>{cluster.sessions.length}</div>
                </div>
                <div>
                  <div className="org-text-muted">Intensity</div>
                  <div>{cluster.intensity.toFixed(1)} sessions/hour</div>
                </div>
                <div>
                  <div className="org-text-muted">Operators</div>
                  <div>{cluster.operatorIds.length}</div>
                </div>
                <div>
                  <div className="org-text-muted">Diversity Score</div>
                  <div>{Math.round(cluster.diversity * 100)}%</div>
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
};

const HeatmapView: React.FC<{
  analysis: ClusteringAnalysis;
  timeRange: string;
}> = ({ analysis, timeRange }) => {
  const [selectedHour, setSelectedHour] = useState<number | null>(null);

  // Generate hourly activity data
  const hourlyData = Array.from({ length: 24 }, (_, hour) => {
    const sessionsInHour = analysis.clusters
      .filter((cluster) => {
        const clusterHour = new Date(cluster.peakTime).getHours();
        return clusterHour === hour;
      })
      .reduce((sum, cluster) => sum + cluster.sessions.length, 0);

    return {
      hour,
      sessions: sessionsInHour,
      intensity: sessionsInHour / 60, // sessions per minute
    };
  });

  // Generate daily activity data for weekly/monthly views
  const dailyData = Array.from({ length: 7 }, (_, day) => {
    return Array.from({ length: 24 }, (_, hour) => {
      const sessionCount = Math.floor(Math.random() * 10); // Mock data
      return {
        day,
        hour,
        sessions: sessionCount,
        intensity: sessionCount / 60,
      };
    });
  }).flat();

  const maxIntensity = Math.max(...hourlyData.map((d) => d.intensity));
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="org-temporal-heatmap">
      <div className="flex items-center justify-between mb-4">
        <h4 className="org-text-lg org-font-semibold">Activity Heatmap</h4>
        <div className="org-text-sm org-text-muted">
          Peak hours: {analysis.peakHours.map((h) => `${h}:00`).join(', ')}
        </div>
      </div>

      {timeRange === 'day' ? (
        // Hourly heatmap for single day
        <div className="org-heatmap-grid grid grid-cols-24 gap-1 mb-4">
          {hourlyData.map((data) => (
            <div
              key={data.hour}
              className={`org-heatmap-cell h-8 rounded cursor-pointer transition-all ${
                selectedHour === data.hour ? 'ring-2 ring-primary' : ''
              }`}
              style={{
                backgroundColor:
                  data.intensity > 0
                    ? `rgba(59, 130, 246, ${0.2 + (data.intensity / maxIntensity) * 0.8})`
                    : 'rgba(156, 163, 175, 0.1)',
              }}
              title={`${data.hour}:00 - ${data.sessions} sessions`}
              onClick={() => setSelectedHour(data.hour === selectedHour ? null : data.hour)}
            />
          ))}
        </div>
      ) : (
        // Weekly heatmap
        <div className="org-heatmap-weekly mb-4">
          <div className="grid grid-cols-25 gap-1">
            <div></div>
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="org-text-xs org-text-muted text-center">
                {h}
              </div>
            ))}
            {days.map((day, dayIndex) => (
              <React.Fragment key={day}>
                <div className="org-text-xs org-text-muted flex items-center">{day}</div>
                {Array.from({ length: 24 }, (_, hourIndex) => {
                  const cellData = dailyData.find(
                    (d) => d.day === dayIndex && d.hour === hourIndex,
                  );
                  const intensity = cellData ? cellData.intensity : 0;
                  const maxDailyIntensity = Math.max(...dailyData.map((d) => d.intensity));

                  return (
                    <div
                      key={`${dayIndex}-${hourIndex}`}
                      className="org-heatmap-cell h-6 rounded cursor-pointer"
                      style={{
                        backgroundColor:
                          intensity > 0
                            ? `rgba(59, 130, 246, ${0.2 + (intensity / maxDailyIntensity) * 0.8})`
                            : 'rgba(156, 163, 175, 0.1)',
                      }}
                      title={`${day} ${hourIndex}:00 - ${cellData?.sessions || 0} sessions`}
                    />
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center space-x-4 org-text-sm">
        <span className="org-text-muted">Activity Level:</span>
        <div className="flex items-center space-x-1">
          <div
            className="w-4 h-4 rounded"
            style={{ backgroundColor: 'rgba(156, 163, 175, 0.1)' }}
          ></div>
          <span className="org-text-xs">None</span>
        </div>
        <div className="flex items-center space-x-1">
          <div
            className="w-4 h-4 rounded"
            style={{ backgroundColor: 'rgba(59, 130, 246, 0.4)' }}
          ></div>
          <span className="org-text-xs">Low</span>
        </div>
        <div className="flex items-center space-x-1">
          <div
            className="w-4 h-4 rounded"
            style={{ backgroundColor: 'rgba(59, 130, 246, 0.7)' }}
          ></div>
          <span className="org-text-xs">Medium</span>
        </div>
        <div className="flex items-center space-x-1">
          <div
            className="w-4 h-4 rounded"
            style={{ backgroundColor: 'rgba(59, 130, 246, 1)' }}
          ></div>
          <span className="org-text-xs">High</span>
        </div>
      </div>

      {selectedHour !== null && (
        <div className="mt-4 org-card-inner">
          <h5 className="org-font-semibold mb-2">{selectedHour}:00 Activity Details</h5>
          <div className="org-text-sm">
            <div>Sessions: {hourlyData[selectedHour].sessions}</div>
            <div>
              Average intensity: {hourlyData[selectedHour].intensity.toFixed(2)} sessions/min
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const PatternsView: React.FC<{
  patterns: readonly TemporalPattern[];
  clusteringScore: number;
}> = ({ patterns, clusteringScore }) => {
  const [selectedType, setSelectedType] = useState<string>('all');

  const filteredPatterns =
    selectedType === 'all' ? patterns : patterns.filter((p) => p.patternType === selectedType);

  const sortedPatterns = [...filteredPatterns].sort((a, b) => b.confidence - a.confidence);
  const patternTypes = [...new Set(patterns.map((p) => p.patternType))];

  return (
    <div className="org-temporal-patterns">
      <div className="flex items-center justify-between mb-4">
        <h4 className="org-text-lg org-font-semibold">Temporal Patterns</h4>
        <div className="flex items-center space-x-2">
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="org-select org-select-sm"
          >
            <option value="all">All Types</option>
            {patternTypes.map((type) => (
              <option key={type} value={type}>
                {type.replace('-', ' ')}
              </option>
            ))}
          </select>
          <div className="org-text-sm org-text-muted">
            Clustering: {Math.round(clusteringScore * 100)}%
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {sortedPatterns.map((pattern) => (
          <div key={pattern.id} className="org-card-inner">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-start space-x-3">
                <div className="org-text-primary">{getPatternIcon(pattern.patternType)}</div>
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-1">
                    <span className="org-font-semibold capitalize">
                      {pattern.patternType.replace('-', ' ')}
                    </span>
                    <span
                      className={`org-badge org-badge-xs ${
                        pattern.frequency === 'high'
                          ? 'org-badge-success'
                          : pattern.frequency === 'medium'
                            ? 'org-badge-info'
                            : 'org-badge-secondary'
                      }`}
                    >
                      {pattern.frequency} frequency
                    </span>
                  </div>
                  <div className="org-text-sm org-text-muted mb-2">{pattern.description}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="org-text-lg org-font-semibold org-text-primary">
                  {Math.round(pattern.confidence * 100)}%
                </div>
                <div className="org-text-xs org-text-muted">confidence</div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 org-text-sm mb-3">
              <div>
                <div className="org-text-muted">Predictability</div>
                <div>{Math.round(pattern.predictability * 100)}%</div>
              </div>
              <div>
                <div className="org-text-muted">Historical Occurrences</div>
                <div>{pattern.historicalOccurrences}</div>
              </div>
              <div>
                <div className="org-text-muted">Associated Operators</div>
                <div>{pattern.associatedOperators.length}</div>
              </div>
            </div>

            {pattern.timeRanges.length > 0 && (
              <div>
                <div className="org-text-sm org-font-medium mb-2">Typical Time Ranges</div>
                <div className="space-y-1">
                  {pattern.timeRanges.slice(0, 3).map((range, index) => (
                    <div key={index} className="org-text-sm org-text-muted">
                      {new Date(range.start).toLocaleTimeString()} -{' '}
                      {new Date(range.end).toLocaleTimeString()}
                      {range.days.length > 0 && (
                        <span className="ml-2">
                          (
                          {range.days
                            .map((d) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d])
                            .join(', ')}
                          )
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {sortedPatterns.length === 0 && (
        <div className="org-empty-state">
          <Clock className="h-8 w-8 org-text-muted mb-2" />
          <div className="org-text-muted">No temporal patterns match the current filter</div>
        </div>
      )}
    </div>
  );
};

const DistributionView: React.FC<{
  analysis: ClusteringAnalysis;
}> = ({ analysis }) => (
  <div className="org-temporal-distribution">
    <div className="grid grid-cols-4 gap-4 mb-6">
      <div className="org-stat-card">
        <div className="org-stat-value">{analysis.totalSessions}</div>
        <div className="org-stat-label">Total Sessions</div>
      </div>
      <div className="org-stat-card">
        <div className="org-stat-value">{analysis.clusters.length}</div>
        <div className="org-stat-label">Clusters Found</div>
      </div>
      <div className="org-stat-card">
        <div className="org-stat-value">{Math.round(analysis.clusteringScore * 100)}%</div>
        <div className="org-stat-label">Clustering Quality</div>
      </div>
      <div className="org-stat-card">
        <div className="org-stat-value">{analysis.patterns.length}</div>
        <div className="org-stat-label">Patterns</div>
      </div>
    </div>

    <div className="grid grid-cols-2 gap-6">
      <div className="org-card-inner">
        <h4 className="org-font-semibold mb-3">Workload Distribution</h4>
        <div className="space-y-2">
          {Object.entries(analysis.workloadDistribution)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 8)
            .map(([operatorId, sessionCount]) => {
              const maxSessions = Math.max(...Object.values(analysis.workloadDistribution));
              const percentage = (sessionCount / maxSessions) * 100;

              return (
                <div key={operatorId} className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 flex-1">
                    <span className="org-font-medium org-font-mono org-text-sm">
                      {operatorId.slice(-8)}
                    </span>
                    <div className="flex-1 h-2 org-bg-surface rounded-full mx-2">
                      <div
                        className="h-full org-bg-primary rounded-full"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                  <span className="org-text-sm org-text-muted">{sessionCount}</span>
                </div>
              );
            })}
        </div>
      </div>

      <div className="org-card-inner">
        <h4 className="org-font-semibold mb-3">Activity Periods</h4>
        <div className="space-y-3">
          <div>
            <div className="org-text-sm org-font-medium mb-1">Peak Hours</div>
            <div className="flex flex-wrap gap-1">
              {analysis.peakHours.map((hour) => (
                <span key={hour} className="org-badge org-badge-success org-badge-xs">
                  {hour}:00
                </span>
              ))}
            </div>
          </div>
          <div>
            <div className="org-text-sm org-font-medium mb-1">Quiet Hours</div>
            <div className="flex flex-wrap gap-1">
              {analysis.quietHours.map((hour) => (
                <span key={hour} className="org-badge org-badge-secondary org-badge-xs">
                  {hour}:00
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>

    <div className="mt-6 org-card-inner">
      <h4 className="org-font-semibold mb-3">Cluster Types Distribution</h4>
      <div className="grid grid-cols-5 gap-4 org-text-sm">
        {(
          ['burst', 'steady-state', 'collaborative', 'maintenance', 'crisis-response'] as const
        ).map((type) => {
          const count = analysis.clusters.filter((c) => c.clusterType === type).length;
          const percentage =
            analysis.clusters.length > 0 ? (count / analysis.clusters.length) * 100 : 0;

          return (
            <div key={type} className="text-center">
              <div
                className={`w-12 h-12 rounded-full mx-auto mb-2 flex items-center justify-center ${getClusterTypeColor(type)}`}
              >
                <span className="org-font-semibold text-white">{count}</span>
              </div>
              <div className="org-text-xs org-font-medium capitalize">{type.replace('-', ' ')}</div>
              <div className="org-text-xs org-text-muted">{Math.round(percentage)}%</div>
            </div>
          );
        })}
      </div>
    </div>
  </div>
);

export const TemporalSessionClustering: React.FC<TemporalSessionClusteringProps> = ({
  sessionCorrelation,
  mode = 'timeline',
  timeRange = 'week',
  realTime = false,
  onSelectCluster,
  className = '',
}) => {
  const { teamFilter } = useOrganizationalContext();
  const [analysis, setAnalysis] = useState<ClusteringAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(realTime);

  useEffect(() => {
    const fetchClusteringAnalysis = async () => {
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

        // Generate mock clustering analysis
        const clusters: TemporalCluster[] = Array.from({ length: 8 }, (_, i) => {
          const clusterStart =
            startTime + (i * timeRangeMs) / 8 + Math.random() * (timeRangeMs / 16);
          const duration = 1800000 + Math.random() * 7200000; // 30min - 2h
          const sessionCount = Math.floor(3 + Math.random() * 12);

          return {
            id: `cluster-${i}`,
            startTime: clusterStart,
            endTime: clusterStart + duration,
            sessions: Array.from({ length: sessionCount }, (_, j) => `session-${i}-${j}`),
            operatorIds: Array.from(
              { length: Math.floor(1 + Math.random() * 4) },
              () => `op-${Math.random().toString(36).slice(2, 8)}`,
            ),
            teamIds: [sessionCorrelation.teamId || 'default-team'],
            clusterType: [
              'burst',
              'steady-state',
              'collaborative',
              'maintenance',
              'crisis-response',
            ][i % 5] as TemporalCluster['clusterType'],
            intensity: sessionCount / (duration / 3600000), // sessions per hour
            diversity: Math.random(),
            patterns: ['frequent-updates', 'collaborative-review', 'debugging-session'].slice(
              0,
              1 + (i % 3),
            ),
            peakTime: clusterStart + duration / 2,
            confidence: 0.7 + Math.random() * 0.3,
          };
        });

        const patterns: TemporalPattern[] = [
          {
            id: 'pattern-1',
            patternType: 'daily-peak',
            description: 'Consistent peak activity between 9-11 AM across weekdays',
            frequency: 'high',
            predictability: 0.89,
            timeRanges: [
              { start: startTime + 32400000, end: startTime + 39600000, days: [1, 2, 3, 4, 5] },
            ],
            associatedOperators: clusters.flatMap((c) => c.operatorIds).slice(0, 5),
            historicalOccurrences: 23,
            confidence: 0.91,
          },
          {
            id: 'pattern-2',
            patternType: 'collaborative-session',
            description:
              'Team collaboration sessions typically occur on Tuesday and Thursday afternoons',
            frequency: 'medium',
            predictability: 0.73,
            timeRanges: [{ start: startTime + 50400000, end: startTime + 57600000, days: [2, 4] }],
            associatedOperators: clusters.flatMap((c) => c.operatorIds).slice(3, 8),
            historicalOccurrences: 12,
            confidence: 0.78,
          },
        ];

        const workloadDistribution = clusters.reduce(
          (acc, cluster) => {
            cluster.operatorIds.forEach((opId) => {
              acc[opId] = (acc[opId] || 0) + cluster.sessions.length;
            });
            return acc;
          },
          {} as Record<string, number>,
        );

        const timeWindows: TimeWindow[] = Array.from({ length: 24 }, (_, i) => {
          const windowStart = startTime + i * 3600000;
          const windowEnd = windowStart + 3600000;
          const sessionsInWindow = clusters
            .filter((c) => c.startTime >= windowStart && c.startTime < windowEnd)
            .reduce((sum, c) => sum + c.sessions.length, 0);

          return {
            start: windowStart,
            end: windowEnd,
            granularity: 'hour',
            sessionCount: sessionsInWindow,
            operatorCount: new Set(
              clusters
                .filter((c) => c.startTime >= windowStart && c.startTime < windowEnd)
                .flatMap((c) => c.operatorIds),
            ).size,
            teamCount: 1,
            averageSessionDuration: 1800000,
          };
        });

        setAnalysis({
          timeRange: { start: startTime, end: endTime },
          clusters,
          patterns,
          timeWindows,
          workloadDistribution,
          peakHours: [9, 10, 14, 15],
          quietHours: [0, 1, 2, 22, 23],
          clusteringScore: 0.82,
          totalSessions: clusters.reduce((sum, c) => sum + c.sessions.length, 0),
          analyzedAt: Date.now(),
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to analyze temporal clustering');
      } finally {
        setLoading(false);
      }
    };

    fetchClusteringAnalysis();
  }, [sessionCorrelation, timeRange]);

  // Real-time updates
  useEffect(() => {
    if (!isPlaying || !analysis) return;

    const interval = setInterval(() => {
      setAnalysis((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          analyzedAt: Date.now(),
        };
      });
    }, 5000); // Update every 5 seconds

    return () => clearInterval(interval);
  }, [isPlaying, analysis]);

  if (loading) {
    return (
      <div className={`org-temporal-clustering org-loading ${className}`}>
        <div className="flex items-center space-x-2">
          <div className="org-spinner org-spinner-sm" />
          <span className="org-text-muted">Analyzing temporal clusters...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`org-temporal-clustering org-error ${className}`}>
        <div className="org-error-message">
          <Clock className="h-5 w-5 text-red-500" />
          <span>Failed to load clustering analysis: {error}</span>
        </div>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className={`org-temporal-clustering org-empty ${className}`}>
        <div className="org-empty-state">
          <Calendar className="h-8 w-8 org-text-muted mb-2" />
          <div className="org-text-muted">No temporal clustering data available</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`org-temporal-clustering org-clustering-${mode} ${className}`}>
      {mode !== 'distribution' && (
        <div className="flex items-center justify-between mb-4">
          <h3 className="org-text-lg org-font-semibold">Temporal Session Clustering</h3>
          <div className="flex items-center space-x-2">
            {realTime && (
              <button
                onClick={() => setIsPlaying(!isPlaying)}
                className="org-button org-button-ghost org-button-sm"
              >
                {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </button>
            )}
            <div className="org-text-sm org-text-muted">
              {analysis.clusters.length} clusters, {Math.round(analysis.clusteringScore * 100)}%
              quality
            </div>
          </div>
        </div>
      )}

      {mode === 'timeline' && (
        <TimelineView analysis={analysis} onSelectCluster={onSelectCluster} />
      )}
      {mode === 'heatmap' && <HeatmapView analysis={analysis} timeRange={timeRange} />}
      {mode === 'patterns' && (
        <PatternsView patterns={analysis.patterns} clusteringScore={analysis.clusteringScore} />
      )}
      {mode === 'distribution' && <DistributionView analysis={analysis} />}
    </div>
  );
};

export default TemporalSessionClustering;
