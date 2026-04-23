/**
 * OperatorTimelineView Component
 *
 * Displays chronological activity timeline for operators with task progression,
 * problem-solving sequences, and productivity patterns visualization.
 */

import {
  AlertCircle,
  ArrowRight,
  CheckCircle,
  Clock,
  Pause,
  Play,
  TrendingUp,
  User,
  XCircle,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useOrganizationalContext } from '../../../../contexts/OrganizationalContext';
import type { SessionCorrelation } from '../../../types/organizational.js';

export interface ActivityEvent {
  readonly id: string;
  readonly operatorId: string;
  readonly timestamp: number;
  readonly eventType:
    | 'task-start'
    | 'task-complete'
    | 'task-failed'
    | 'collaboration'
    | 'break'
    | 'context-switch'
    | 'problem-solving'
    | 'review';
  readonly title: string;
  readonly description?: string;
  readonly duration?: number; // For events with duration
  readonly outcome?: 'success' | 'failure' | 'partial' | 'cancelled';
  readonly category:
    | 'coding'
    | 'debugging'
    | 'review'
    | 'research'
    | 'meeting'
    | 'planning'
    | 'documentation';
  readonly difficulty?: 'low' | 'medium' | 'high' | 'complex';
  readonly tools?: readonly string[]; // Tools/technologies used
  readonly collaborators?: readonly string[]; // Other operators involved
  readonly sessionId?: string;
  readonly metadata?: Record<string, any>;
}

export interface ProductivityMetric {
  readonly metric:
    | 'tasks-completed'
    | 'avg-task-duration'
    | 'success-rate'
    | 'context-switches'
    | 'collaboration-ratio'
    | 'problem-solving-efficiency';
  readonly value: number;
  readonly trend: 'up' | 'down' | 'stable';
  readonly period: 'hour' | 'day' | 'week';
}

export interface OperatorTimeline {
  readonly operatorId: string;
  readonly teamId?: string;
  readonly timeRange: { start: number; end: number };
  readonly events: readonly ActivityEvent[];
  readonly productivityMetrics: readonly ProductivityMetric[];
  readonly workingSessions: number;
  readonly totalActiveTime: number;
  readonly avgSessionDuration: number;
  readonly peakProductivityHours: readonly number[];
  readonly patternScore: number; // How consistent their patterns are
  readonly generatedAt: number;
}

interface OperatorTimelineViewProps {
  /** Session correlation data for timeline context */
  readonly sessionCorrelation: SessionCorrelation;
  /** Specific operator to show timeline for, if not provided shows current operator */
  readonly operatorId?: string;
  /** Time range for the timeline */
  readonly timeRange?: 'day' | 'week' | 'month' | 'quarter';
  /** Display mode for timeline visualization */
  readonly mode?: 'chronological' | 'categorized' | 'productivity' | 'detailed';
  /** Whether to show real-time updates */
  readonly realTime?: boolean;
  /** Event types to filter by */
  readonly eventFilter?: readonly ActivityEvent['eventType'][];
  /** Callback for event selection */
  readonly onSelectEvent?: (event: ActivityEvent) => void;
  /** Additional CSS classes */
  readonly className?: string;
}

const getEventTypeIcon = (type: ActivityEvent['eventType']) => {
  switch (type) {
    case 'task-start':
      return <Play className="h-4 w-4" />;
    case 'task-complete':
      return <CheckCircle className="h-4 w-4" />;
    case 'task-failed':
      return <XCircle className="h-4 w-4" />;
    case 'collaboration':
      return <User className="h-4 w-4" />;
    case 'break':
      return <Pause className="h-4 w-4" />;
    case 'context-switch':
      return <ArrowRight className="h-4 w-4" />;
    case 'problem-solving':
      return <AlertCircle className="h-4 w-4" />;
    case 'review':
      return <TrendingUp className="h-4 w-4" />;
    default:
      return <Clock className="h-4 w-4" />;
  }
};

const getEventTypeColor = (type: ActivityEvent['eventType']) => {
  switch (type) {
    case 'task-start':
      return 'org-text-info';
    case 'task-complete':
      return 'org-text-success';
    case 'task-failed':
      return 'org-text-error';
    case 'collaboration':
      return 'org-text-primary';
    case 'break':
      return 'org-text-muted';
    case 'context-switch':
      return 'org-text-warning';
    case 'problem-solving':
      return 'org-text-info';
    case 'review':
      return 'org-text-secondary';
    default:
      return 'org-text-muted';
  }
};

const getCategoryColor = (category: ActivityEvent['category']) => {
  switch (category) {
    case 'coding':
      return 'org-bg-blue-100';
    case 'debugging':
      return 'org-bg-red-100';
    case 'review':
      return 'org-bg-purple-100';
    case 'research':
      return 'org-bg-green-100';
    case 'meeting':
      return 'org-bg-orange-100';
    case 'planning':
      return 'org-bg-indigo-100';
    case 'documentation':
      return 'org-bg-gray-100';
    default:
      return 'org-bg-surface';
  }
};

const getDifficultyColor = (difficulty?: ActivityEvent['difficulty']) => {
  switch (difficulty) {
    case 'low':
      return 'org-text-success';
    case 'medium':
      return 'org-text-info';
    case 'high':
      return 'org-text-warning';
    case 'complex':
      return 'org-text-error';
    default:
      return 'org-text-muted';
  }
};

const getTrendIcon = (trend: ProductivityMetric['trend']) => {
  switch (trend) {
    case 'up':
      return <TrendingUp className="h-3 w-3 org-text-success" />;
    case 'down':
      return <TrendingUp className="h-3 w-3 org-text-error transform rotate-180" />;
    case 'stable':
      return <ArrowRight className="h-3 w-3 org-text-muted" />;
    default:
      return <ArrowRight className="h-3 w-3 org-text-muted" />;
  }
};

const formatDuration = (ms?: number): string => {
  if (!ms) return '—';
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};

const _formatTimeRange = (start: number, end: number): string => {
  const startTime = new Date(start);
  const endTime = new Date(end);

  if (startTime.toDateString() === endTime.toDateString()) {
    return `${startTime.toLocaleTimeString()} - ${endTime.toLocaleTimeString()}`;
  }

  return `${startTime.toLocaleString()} - ${endTime.toLocaleString()}`;
};

const ChronologicalView: React.FC<{
  timeline: OperatorTimeline;
  onSelectEvent?: (event: ActivityEvent) => void;
  eventFilter?: readonly ActivityEvent['eventType'][];
}> = ({ timeline, onSelectEvent, eventFilter }) => {
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);

  const filteredEvents =
    eventFilter && eventFilter.length > 0
      ? timeline.events.filter((event) => eventFilter.includes(event.eventType))
      : timeline.events;

  const sortedEvents = [...filteredEvents].sort((a, b) => b.timestamp - a.timestamp);

  return (
    <div className="org-timeline-chronological">
      <div className="relative">
        <div className="absolute left-8 top-0 bottom-0 w-px org-border-muted"></div>

        <div className="space-y-4">
          {sortedEvents.map((event, index) => {
            const isSelected = selectedEvent === event.id;
            const isLast = index === sortedEvents.length - 1;

            return (
              <div key={event.id} className="relative flex items-start">
                <div
                  className={`flex-shrink-0 w-16 h-8 flex items-center justify-center z-10 ${getCategoryColor(event.category)} rounded-full`}
                >
                  <div className={getEventTypeColor(event.eventType)}>
                    {getEventTypeIcon(event.eventType)}
                  </div>
                </div>

                <div className="flex-1 ml-4">
                  <div
                    className={`org-timeline-event ${isSelected ? 'org-event-selected' : ''} ${
                      onSelectEvent ? 'cursor-pointer' : ''
                    }`}
                    onClick={() => {
                      const newSelected = isSelected ? null : event.id;
                      setSelectedEvent(newSelected);
                      if (onSelectEvent && !isSelected) {
                        onSelectEvent(event);
                      }
                    }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="org-font-semibold">{event.title}</div>
                      <div className="org-text-sm org-text-muted">
                        {new Date(event.timestamp).toLocaleTimeString()}
                      </div>
                    </div>

                    <div className="flex items-center space-x-4 org-text-sm org-text-muted mb-2">
                      <span className="capitalize">{event.category}</span>
                      <span className="capitalize">{event.eventType.replace('-', ' ')}</span>
                      {event.duration && <span>Duration: {formatDuration(event.duration)}</span>}
                      {event.difficulty && (
                        <span className={getDifficultyColor(event.difficulty)}>
                          {event.difficulty} difficulty
                        </span>
                      )}
                    </div>

                    {event.description && (
                      <div className="org-text-sm org-text-muted mb-2">{event.description}</div>
                    )}

                    {event.outcome && (
                      <div
                        className={`inline-flex items-center space-x-1 org-badge org-badge-xs ${
                          event.outcome === 'success'
                            ? 'org-badge-success'
                            : event.outcome === 'failure'
                              ? 'org-badge-error'
                              : event.outcome === 'partial'
                                ? 'org-badge-warning'
                                : 'org-badge-secondary'
                        }`}
                      >
                        <span>{event.outcome}</span>
                      </div>
                    )}

                    {isSelected && (
                      <div className="mt-3 pt-3 org-border-t">
                        <div className="grid grid-cols-2 gap-4 org-text-sm">
                          {event.tools && event.tools.length > 0 && (
                            <div>
                              <div className="org-font-medium mb-1">Tools Used</div>
                              <div className="flex flex-wrap gap-1">
                                {event.tools.map((tool) => (
                                  <span
                                    key={tool}
                                    className="org-badge org-badge-secondary org-badge-xs"
                                  >
                                    {tool}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {event.collaborators && event.collaborators.length > 0 && (
                            <div>
                              <div className="org-font-medium mb-1">Collaborators</div>
                              <div className="flex flex-wrap gap-1">
                                {event.collaborators.map((collaborator) => (
                                  <span
                                    key={collaborator}
                                    className="org-badge org-badge-info org-badge-xs"
                                  >
                                    {collaborator.slice(-6)}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {event.sessionId && (
                            <div className="col-span-2">
                              <div className="org-font-medium mb-1">Session</div>
                              <div className="org-text-xs org-text-muted org-font-mono">
                                {event.sessionId}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {!isLast && event.duration && (
                  <div
                    className="absolute left-8 top-8"
                    style={{ height: `${Math.min(event.duration / 60000, 120)}px` }}
                  >
                    <div className="w-px org-bg-primary h-full"></div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {sortedEvents.length === 0 && (
        <div className="org-empty-state">
          <Clock className="h-8 w-8 org-text-muted mb-2" />
          <div className="org-text-muted">No events match the current filter</div>
        </div>
      )}
    </div>
  );
};

const CategorizedView: React.FC<{
  timeline: OperatorTimeline;
  onSelectEvent?: (event: ActivityEvent) => void;
}> = ({ timeline, onSelectEvent }) => {
  const eventsByCategory = timeline.events.reduce(
    (acc, event) => {
      if (!acc[event.category]) acc[event.category] = [];
      acc[event.category].push(event);
      return acc;
    },
    {} as Record<string, ActivityEvent[]>,
  );

  const categories = Object.keys(eventsByCategory).sort();

  return (
    <div className="org-timeline-categorized">
      <div className="space-y-6">
        {categories.map((category) => {
          const categoryEvents = eventsByCategory[category].sort(
            (a, b) => b.timestamp - a.timestamp,
          );
          const totalDuration = categoryEvents.reduce(
            (sum, event) => sum + (event.duration || 0),
            0,
          );
          const successRate =
            categoryEvents.filter((e) => e.outcome === 'success').length / categoryEvents.length;

          return (
            <div key={category} className="org-category-section">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className={`w-4 h-4 rounded ${getCategoryColor(category)}`}></div>
                  <h4 className="org-text-lg org-font-semibold capitalize">{category}</h4>
                </div>
                <div className="org-text-sm org-text-muted">
                  {categoryEvents.length} events, {formatDuration(totalDuration)}
                  {successRate > 0 && (
                    <span
                      className={`ml-2 ${successRate >= 0.8 ? 'org-text-success' : successRate >= 0.6 ? 'org-text-info' : 'org-text-warning'}`}
                    >
                      ({Math.round(successRate * 100)}% success)
                    </span>
                  )}
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {categoryEvents.slice(0, 6).map((event) => (
                  <div
                    key={event.id}
                    className={`org-card-inner org-card-sm ${getCategoryColor(event.category)} ${
                      onSelectEvent ? 'cursor-pointer hover:shadow-md transition-shadow' : ''
                    }`}
                    onClick={() => onSelectEvent?.(event)}
                  >
                    <div className="flex items-center space-x-2 mb-2">
                      <div className={getEventTypeColor(event.eventType)}>
                        {getEventTypeIcon(event.eventType)}
                      </div>
                      <span className="org-font-medium truncate">{event.title}</span>
                      {event.outcome && (
                        <div
                          className={`w-2 h-2 rounded-full ${
                            event.outcome === 'success'
                              ? 'org-bg-success'
                              : event.outcome === 'failure'
                                ? 'org-bg-error'
                                : event.outcome === 'partial'
                                  ? 'org-bg-warning'
                                  : 'org-bg-muted'
                          }`}
                        ></div>
                      )}
                    </div>

                    <div className="flex items-center space-x-4 org-text-xs org-text-muted">
                      <span>{new Date(event.timestamp).toLocaleTimeString()}</span>
                      {event.duration && <span>{formatDuration(event.duration)}</span>}
                      {event.collaborators && event.collaborators.length > 0 && (
                        <span>{event.collaborators.length} collaborators</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {categoryEvents.length > 6 && (
                <div className="mt-3 org-text-sm org-text-muted">
                  +{categoryEvents.length - 6} more {category} events
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const ProductivityView: React.FC<{
  timeline: OperatorTimeline;
}> = ({ timeline }) => (
  <div className="org-timeline-productivity">
    <div className="grid grid-cols-4 gap-4 mb-6">
      <div className="org-stat-card">
        <div className="org-stat-value">{timeline.workingSessions}</div>
        <div className="org-stat-label">Working Sessions</div>
      </div>
      <div className="org-stat-card">
        <div className="org-stat-value">{formatDuration(timeline.totalActiveTime)}</div>
        <div className="org-stat-label">Total Active Time</div>
      </div>
      <div className="org-stat-card">
        <div className="org-stat-value">{formatDuration(timeline.avgSessionDuration)}</div>
        <div className="org-stat-label">Avg Session</div>
      </div>
      <div className="org-stat-card">
        <div className="org-stat-value">{Math.round(timeline.patternScore * 100)}%</div>
        <div className="org-stat-label">Pattern Consistency</div>
      </div>
    </div>

    <div className="grid grid-cols-2 gap-6">
      <div className="org-card-inner">
        <h4 className="org-font-semibold mb-3">Productivity Metrics</h4>
        <div className="space-y-3">
          {timeline.productivityMetrics.map((metric, index) => (
            <div key={index} className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                {getTrendIcon(metric.trend)}
                <span className="org-font-medium capitalize">
                  {metric.metric.replace('-', ' ')}
                </span>
              </div>
              <div className="text-right">
                <div className="org-font-semibold">
                  {metric.metric.includes('rate') || metric.metric.includes('ratio')
                    ? `${Math.round(metric.value * 100)}%`
                    : metric.value}
                </div>
                <div className="org-text-xs org-text-muted">per {metric.period}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="org-card-inner">
        <h4 className="org-font-semibold mb-3">Peak Productivity Hours</h4>
        <div className="space-y-2">
          {timeline.peakProductivityHours.map((hour) => (
            <div key={hour} className="flex items-center justify-between">
              <span className="org-font-medium">
                {hour}:00 - {hour + 1}:00
              </span>
              <div className="w-24 h-2 org-bg-surface rounded-full">
                <div
                  className="h-full org-bg-success rounded-full"
                  style={{ width: `${Math.random() * 60 + 40}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 pt-4 org-border-t">
          <h5 className="org-font-medium mb-2">Activity Distribution</h5>
          <div className="space-y-1">
            {Object.entries(
              timeline.events.reduce(
                (acc, event) => {
                  acc[event.category] = (acc[event.category] || 0) + 1;
                  return acc;
                },
                {} as Record<string, number>,
              ),
            )
              .sort(([, a], [, b]) => b - a)
              .slice(0, 5)
              .map(([category, count]) => {
                const percentage = (count / timeline.events.length) * 100;
                return (
                  <div key={category} className="flex items-center justify-between org-text-sm">
                    <span className="capitalize">{category}</span>
                    <span className="org-text-muted">{Math.round(percentage)}%</span>
                  </div>
                );
              })}
          </div>
        </div>
      </div>
    </div>

    <div className="mt-6 org-card-inner">
      <h4 className="org-font-semibold mb-3">Task Completion Patterns</h4>
      <div className="grid grid-cols-3 gap-4 org-text-sm">
        {['morning', 'afternoon', 'evening'].map((period) => {
          const periodEvents = timeline.events.filter((event) => {
            const hour = new Date(event.timestamp).getHours();
            return (
              (period === 'morning' && hour >= 6 && hour < 12) ||
              (period === 'afternoon' && hour >= 12 && hour < 18) ||
              (period === 'evening' && hour >= 18 && hour < 24)
            );
          });

          const completedTasks = periodEvents.filter((e) => e.outcome === 'success').length;
          const totalTasks = periodEvents.length;
          const successRate = totalTasks > 0 ? completedTasks / totalTasks : 0;

          return (
            <div key={period} className="text-center">
              <div className="org-text-muted mb-1 capitalize">{period}</div>
              <div className="org-font-semibold">
                {completedTasks}/{totalTasks}
              </div>
              <div
                className={`org-text-sm ${
                  successRate >= 0.8
                    ? 'org-text-success'
                    : successRate >= 0.6
                      ? 'org-text-info'
                      : 'org-text-warning'
                }`}
              >
                {Math.round(successRate * 100)}% success
              </div>
            </div>
          );
        })}
      </div>
    </div>
  </div>
);

const DetailedView: React.FC<{
  timeline: OperatorTimeline;
  onSelectEvent?: (event: ActivityEvent) => void;
}> = ({ timeline, onSelectEvent }) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedPeriod, setSelectedPeriod] = useState<'day' | 'week' | 'month'>('day');

  const categories = [...new Set(timeline.events.map((e) => e.category))];
  const filteredEvents =
    selectedCategory === 'all'
      ? timeline.events
      : timeline.events.filter((e) => e.category === selectedCategory);

  const sortedEvents = [...filteredEvents].sort((a, b) => b.timestamp - a.timestamp);

  return (
    <div className="org-timeline-detailed">
      <div className="flex items-center space-x-4 mb-6">
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

        <select
          value={selectedPeriod}
          onChange={(e) => setSelectedPeriod(e.target.value as any)}
          className="org-select"
        >
          <option value="day">Today</option>
          <option value="week">This Week</option>
          <option value="month">This Month</option>
        </select>

        <div className="org-text-sm org-text-muted">{sortedEvents.length} events</div>
      </div>

      <div className="space-y-3">
        {sortedEvents.slice(0, 20).map((event) => (
          <div
            key={event.id}
            className={`org-card-inner hover:shadow-md transition-shadow ${
              onSelectEvent ? 'cursor-pointer' : ''
            }`}
            onClick={() => onSelectEvent?.(event)}
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-start space-x-3">
                <div
                  className={`w-10 h-10 rounded-lg ${getCategoryColor(event.category)} flex items-center justify-center`}
                >
                  <div className={getEventTypeColor(event.eventType)}>
                    {getEventTypeIcon(event.eventType)}
                  </div>
                </div>
                <div className="flex-1">
                  <h5 className="org-font-semibold mb-1">{event.title}</h5>
                  {event.description && (
                    <p className="org-text-sm org-text-muted mb-2">{event.description}</p>
                  )}
                  <div className="flex items-center space-x-4 org-text-sm org-text-muted">
                    <span>{new Date(event.timestamp).toLocaleString()}</span>
                    <span className="capitalize">{event.category}</span>
                    {event.duration && <span>{formatDuration(event.duration)}</span>}
                    {event.difficulty && (
                      <span className={getDifficultyColor(event.difficulty)}>
                        {event.difficulty}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {event.outcome && (
                <div
                  className={`org-badge ${
                    event.outcome === 'success'
                      ? 'org-badge-success'
                      : event.outcome === 'failure'
                        ? 'org-badge-error'
                        : event.outcome === 'partial'
                          ? 'org-badge-warning'
                          : 'org-badge-secondary'
                  }`}
                >
                  {event.outcome}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4 org-text-xs org-text-muted">
                {event.tools && event.tools.length > 0 && <span>{event.tools.length} tools</span>}
                {event.collaborators && event.collaborators.length > 0 && (
                  <span>{event.collaborators.length} collaborators</span>
                )}
                {event.sessionId && <span>Session: {event.sessionId.slice(-8)}</span>}
              </div>

              <div className="flex items-center space-x-2">
                <span className="org-text-xs org-text-muted capitalize">
                  {event.eventType.replace('-', ' ')}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {sortedEvents.length > 20 && (
        <div className="mt-4 text-center">
          <div className="org-text-sm org-text-muted">
            Showing 20 of {sortedEvents.length} events
          </div>
        </div>
      )}
    </div>
  );
};

export const OperatorTimelineView: React.FC<OperatorTimelineViewProps> = ({
  sessionCorrelation,
  operatorId,
  timeRange = 'day',
  mode = 'chronological',
  realTime = false,
  eventFilter,
  onSelectEvent,
  className = '',
}) => {
  const { teamFilter } = useOrganizationalContext();
  const [timeline, setTimeline] = useState<OperatorTimeline | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [_currentTime, setCurrentTime] = useState(Date.now());

  const targetOperatorId = operatorId || sessionCorrelation.operatorId;

  useEffect(() => {
    const fetchOperatorTimeline = async () => {
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

        // Generate mock timeline data
        const events: ActivityEvent[] = Array.from({ length: 25 }, (_, i) => {
          const timestamp = startTime + Math.random() * timeRangeMs;
          const eventType: ActivityEvent['eventType'] = [
            'task-start',
            'task-complete',
            'task-failed',
            'collaboration',
            'break',
            'context-switch',
            'problem-solving',
            'review',
          ][Math.floor(Math.random() * 8)] as ActivityEvent['eventType'];

          const category: ActivityEvent['category'] = [
            'coding',
            'debugging',
            'review',
            'research',
            'meeting',
            'planning',
            'documentation',
          ][Math.floor(Math.random() * 7)] as ActivityEvent['category'];

          return {
            id: `event-${i}`,
            operatorId: targetOperatorId,
            timestamp,
            eventType,
            title: `${eventType.replace('-', ' ')} - ${category} task ${i + 1}`,
            description:
              Math.random() > 0.5
                ? `Detailed description for event ${i + 1} involving ${category} work`
                : undefined,
            duration: Math.random() > 0.3 ? 300000 + Math.random() * 7200000 : undefined, // 5min - 2h
            outcome:
              Math.random() > 0.2
                ? (['success', 'failure', 'partial', 'cancelled'][
                    Math.floor(Math.random() * 4)
                  ] as ActivityEvent['outcome'])
                : undefined,
            category,
            difficulty:
              Math.random() > 0.4
                ? (['low', 'medium', 'high', 'complex'][
                    Math.floor(Math.random() * 4)
                  ] as ActivityEvent['difficulty'])
                : undefined,
            tools:
              Math.random() > 0.6
                ? ['VS Code', 'Git', 'Docker', 'npm', 'TypeScript'].slice(
                    0,
                    Math.floor(Math.random() * 3) + 1,
                  )
                : undefined,
            collaborators:
              Math.random() > 0.7
                ? Array.from(
                    { length: Math.floor(Math.random() * 3) + 1 },
                    () => `op-${Math.random().toString(36).slice(2, 8)}`,
                  )
                : undefined,
            sessionId: Math.random() > 0.3 ? sessionCorrelation.sessionId : undefined,
          };
        });

        const metrics: ProductivityMetric[] = [
          { metric: 'tasks-completed', value: 12, trend: 'up', period: 'day' },
          { metric: 'avg-task-duration', value: 45, trend: 'stable', period: 'day' },
          { metric: 'success-rate', value: 0.85, trend: 'up', period: 'day' },
          { metric: 'context-switches', value: 8, trend: 'down', period: 'day' },
          { metric: 'collaboration-ratio', value: 0.35, trend: 'up', period: 'day' },
          { metric: 'problem-solving-efficiency', value: 0.78, trend: 'stable', period: 'day' },
        ];

        const totalActiveTime = events.reduce((sum, event) => sum + (event.duration || 0), 0);
        const workingSessions = Math.floor(totalActiveTime / 3600000); // Rough estimate

        setTimeline({
          operatorId: targetOperatorId,
          teamId: sessionCorrelation.teamId,
          timeRange: { start: startTime, end: endTime },
          events,
          productivityMetrics: metrics,
          workingSessions: Math.max(workingSessions, 1),
          totalActiveTime,
          avgSessionDuration: totalActiveTime / Math.max(workingSessions, 1),
          peakProductivityHours: [9, 10, 14, 15],
          patternScore: 0.73,
          generatedAt: Date.now(),
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load operator timeline');
      } finally {
        setLoading(false);
      }
    };

    fetchOperatorTimeline();
  }, [sessionCorrelation, targetOperatorId, timeRange]);

  // Real-time updates
  useEffect(() => {
    if (!realTime) return;

    const interval = setInterval(() => {
      setCurrentTime(Date.now());
      // Potentially add new events or update existing ones
      if (timeline) {
        setTimeline((prev) => (prev ? { ...prev, generatedAt: Date.now() } : prev));
      }
    }, 30000); // Update every 30 seconds

    return () => clearInterval(interval);
  }, [realTime, timeline]);

  if (loading) {
    return (
      <div className={`org-timeline-view org-loading ${className}`}>
        <div className="flex items-center space-x-2">
          <div className="org-spinner org-spinner-sm" />
          <span className="org-text-muted">Loading operator timeline...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`org-timeline-view org-error ${className}`}>
        <div className="org-error-message">
          <Clock className="h-5 w-5 text-red-500" />
          <span>Failed to load timeline: {error}</span>
        </div>
      </div>
    );
  }

  if (!timeline) {
    return (
      <div className={`org-timeline-view org-empty ${className}`}>
        <div className="org-empty-state">
          <User className="h-8 w-8 org-text-muted mb-2" />
          <div className="org-text-muted">No timeline data available</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`org-timeline-view org-timeline-${mode} ${className}`}>
      {mode !== 'productivity' && (
        <div className="flex items-center justify-between mb-4">
          <h3 className="org-text-lg org-font-semibold">
            Operator Activity Timeline
            {targetOperatorId !== sessionCorrelation.operatorId && (
              <span className="org-text-sm org-font-normal org-text-muted ml-2">
                ({targetOperatorId.slice(-8)})
              </span>
            )}
          </h3>
          <div className="flex items-center space-x-2">
            {realTime && (
              <div className="flex items-center space-x-1 org-text-xs org-text-muted">
                <div className="w-2 h-2 rounded-full org-bg-success animate-pulse"></div>
                <span>Live</span>
              </div>
            )}
            <div className="org-text-sm org-text-muted">
              {timeline.events.length} events, {formatDuration(timeline.totalActiveTime)}
            </div>
          </div>
        </div>
      )}

      {mode === 'chronological' && (
        <ChronologicalView
          timeline={timeline}
          onSelectEvent={onSelectEvent}
          eventFilter={eventFilter}
        />
      )}
      {mode === 'categorized' && (
        <CategorizedView timeline={timeline} onSelectEvent={onSelectEvent} />
      )}
      {mode === 'productivity' && <ProductivityView timeline={timeline} />}
      {mode === 'detailed' && <DetailedView timeline={timeline} onSelectEvent={onSelectEvent} />}
    </div>
  );
};

export default OperatorTimelineView;
