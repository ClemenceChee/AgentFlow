/**
 * Team Activity Overview
 *
 * Component showing comprehensive team activity overview including
 * active operators, workload distribution, activity patterns, and
 * real-time team dynamics with collaboration indicators.
 */

import React, { useState, useEffect, useMemo } from 'react';
import type { OrganizationalTrace, OperatorContext, TeamMembership } from '../../../types/organizational.js';

// Component props
interface TeamActivityOverviewProps {
  /** Team ID to show activity for */
  teamId: string;

  /** Array of traces to analyze */
  traces: OrganizationalTrace[];

  /** Time range for activity analysis */
  timeRange?: '1h' | '6h' | '24h' | '7d';

  /** Whether to show real-time updates */
  realTimeUpdates?: boolean;

  /** Whether to show workload distribution */
  showWorkloadDistribution?: boolean;

  /** Whether to show activity timeline */
  showActivityTimeline?: boolean;

  /** Whether to show operator collaboration */
  showCollaboration?: boolean;

  /** Custom CSS class name */
  className?: string;

  /** Whether to show compact version */
  compact?: boolean;

  /** Callback when operator is clicked */
  onOperatorClick?: (operatorId: string) => void;

  /** Callback when activity pattern is detected */
  onActivityPattern?: (pattern: ActivityPattern) => void;
}

// Operator activity data
interface OperatorActivity {
  operatorId: string;
  name?: string;
  tracesCount: number;
  lastActivity: number;
  isActive: boolean;
  workloadPercentage: number;
  averageResponseTime: number;
  successRate: number;
  activityPattern: 'active' | 'moderate' | 'light' | 'inactive';
  collaborationScore: number;
  recentTraces: OrganizationalTrace[];
}

// Activity pattern interface
interface ActivityPattern {
  type: 'peak_activity' | 'low_activity' | 'uneven_distribution' | 'collaboration_spike';
  description: string;
  severity: 'info' | 'warning' | 'critical';
  operators: string[];
  suggestion: string;
}

// Time bucket for activity timeline
interface ActivityTimeBucket {
  timestamp: number;
  operatorActivities: Map<string, number>;
  totalActivity: number;
}

/**
 * Team Activity Overview Component
 */
export function TeamActivityOverview({
  teamId,
  traces,
  timeRange = '24h',
  realTimeUpdates = false,
  showWorkloadDistribution = true,
  showActivityTimeline = true,
  showCollaboration = true,
  className = '',
  compact = false,
  onOperatorClick,
  onActivityPattern
}: TeamActivityOverviewProps) {
  const [operatorActivities, setOperatorActivities] = useState<OperatorActivity[]>([]);
  const [activityTimeline, setActivityTimeline] = useState<ActivityTimeBucket[]>([]);
  const [teamInfo, setTeamInfo] = useState<TeamMembership | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState(Date.now());

  // Filter traces for team and time range
  const teamTraces = useMemo(() => {
    const now = Date.now();
    const timeRangeMs = {
      '1h': 60 * 60 * 1000,
      '6h': 6 * 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000
    }[timeRange];

    return traces.filter(trace =>
      trace.operatorContext?.teamId === teamId &&
      trace.timestamp > (now - timeRangeMs)
    );
  }, [traces, teamId, timeRange]);

  // Calculate operator activities
  const calculateOperatorActivities = useCallback(async (): Promise<OperatorActivity[]> => {
    const operatorMap = new Map<string, OrganizationalTrace[]>();

    // Group traces by operator
    teamTraces.forEach(trace => {
      const operatorId = trace.operatorContext?.operatorId;
      if (!operatorId) return;

      if (!operatorMap.has(operatorId)) {
        operatorMap.set(operatorId, []);
      }
      operatorMap.get(operatorId)!.push(trace);
    });

    const totalTraces = teamTraces.length;
    const now = Date.now();
    const activities: OperatorActivity[] = [];

    // Fetch operator names in parallel
    const operatorNames = new Map<string, string>();
    await Promise.all(
      Array.from(operatorMap.keys()).map(async (operatorId) => {
        try {
          const response = await fetch(`/api/operators/${operatorId}/info`);
          if (response.ok) {
            const info = await response.json();
            operatorNames.set(operatorId, info.name || operatorId.substring(0, 8));
          }
        } catch {
          operatorNames.set(operatorId, operatorId.substring(0, 8));
        }
      })
    );

    for (const [operatorId, operatorTraces] of operatorMap.entries()) {
      const tracesCount = operatorTraces.length;
      const lastActivity = Math.max(...operatorTraces.map(t => t.timestamp));
      const isActive = (now - lastActivity) < 30 * 60 * 1000; // Active in last 30 minutes

      // Calculate workload percentage
      const workloadPercentage = totalTraces > 0 ? (tracesCount / totalTraces) * 100 : 0;

      // Calculate success rate
      const successfulTraces = operatorTraces.filter(t => t.status === 'success').length;
      const successRate = tracesCount > 0 ? successfulTraces / tracesCount : 0;

      // Calculate average response time
      const responseTimes = operatorTraces
        .filter(t => t.endTime && t.startTime)
        .map(t => t.endTime! - t.startTime);
      const averageResponseTime = responseTimes.length > 0 ?
        responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length : 0;

      // Determine activity pattern
      const activityPattern = isActive ? 'active' :
        workloadPercentage > 20 ? 'moderate' :
        workloadPercentage > 5 ? 'light' : 'inactive';

      // Calculate collaboration score (simplified - based on trace overlap patterns)
      const collaborationScore = operatorTraces.filter(trace =>
        teamTraces.some(otherTrace =>
          otherTrace.operatorContext?.operatorId !== operatorId &&
          Math.abs(otherTrace.timestamp - trace.timestamp) < 60 * 60 * 1000 && // Within 1 hour
          (otherTrace.sessionCorrelation?.correlatedSessions.includes(trace.id) ||
           trace.sessionCorrelation?.correlatedSessions.includes(otherTrace.id))
        )
      ).length / tracesCount;

      activities.push({
        operatorId,
        name: operatorNames.get(operatorId),
        tracesCount,
        lastActivity,
        isActive,
        workloadPercentage,
        averageResponseTime,
        successRate,
        activityPattern,
        collaborationScore,
        recentTraces: operatorTraces.slice(-5) // Last 5 traces
      });
    }

    // Sort by workload percentage (most active first)
    return activities.sort((a, b) => b.workloadPercentage - a.workloadPercentage);
  }, [teamTraces]);

  // Calculate activity timeline
  const calculateActivityTimeline = useCallback((): ActivityTimeBucket[] => {
    if (!showActivityTimeline) return [];

    const bucketSize = {
      '1h': 5 * 60 * 1000,      // 5-minute buckets
      '6h': 30 * 60 * 1000,     // 30-minute buckets
      '24h': 2 * 60 * 60 * 1000, // 2-hour buckets
      '7d': 6 * 60 * 60 * 1000   // 6-hour buckets
    }[timeRange];

    const buckets = new Map<number, ActivityTimeBucket>();

    teamTraces.forEach(trace => {
      const operatorId = trace.operatorContext?.operatorId;
      if (!operatorId) return;

      const bucketTime = Math.floor(trace.timestamp / bucketSize) * bucketSize;

      if (!buckets.has(bucketTime)) {
        buckets.set(bucketTime, {
          timestamp: bucketTime,
          operatorActivities: new Map(),
          totalActivity: 0
        });
      }

      const bucket = buckets.get(bucketTime)!;
      bucket.operatorActivities.set(operatorId, (bucket.operatorActivities.get(operatorId) || 0) + 1);
      bucket.totalActivity++;
    });

    return Array.from(buckets.values())
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-20); // Last 20 time buckets
  }, [teamTraces, showActivityTimeline, timeRange]);

  // Detect activity patterns
  const detectActivityPatterns = useCallback((activities: OperatorActivity[]): ActivityPattern[] => {
    const patterns: ActivityPattern[] = [];

    // Check for uneven workload distribution
    const totalWorkload = activities.reduce((sum, op) => sum + op.workloadPercentage, 0);
    const averageWorkload = totalWorkload / activities.length;
    const unevenOperators = activities.filter(op =>
      Math.abs(op.workloadPercentage - averageWorkload) > averageWorkload * 0.5
    );

    if (unevenOperators.length > 0) {
      patterns.push({
        type: 'uneven_distribution',
        description: `Workload distribution is uneven across ${unevenOperators.length} operators`,
        severity: unevenOperators.length > activities.length / 2 ? 'warning' : 'info',
        operators: unevenOperators.map(op => op.operatorId),
        suggestion: 'Consider redistributing work or providing additional support'
      });
    }

    // Check for peak activity
    const activeOperators = activities.filter(op => op.isActive).length;
    const totalOperators = activities.length;
    if (activeOperators > totalOperators * 0.8) {
      patterns.push({
        type: 'peak_activity',
        description: `High activity: ${activeOperators}/${totalOperators} operators currently active`,
        severity: 'info',
        operators: activities.filter(op => op.isActive).map(op => op.operatorId),
        suggestion: 'Monitor for potential resource constraints'
      });
    }

    // Check for low activity
    if (activeOperators < totalOperators * 0.3 && totalOperators > 2) {
      patterns.push({
        type: 'low_activity',
        description: `Low activity: Only ${activeOperators}/${totalOperators} operators active`,
        severity: 'warning',
        operators: activities.filter(op => !op.isActive).map(op => op.operatorId),
        suggestion: 'Check if additional operators need to be engaged'
      });
    }

    // Check for collaboration spike
    const highCollabOperators = activities.filter(op => op.collaborationScore > 0.3);
    if (highCollabOperators.length > totalOperators * 0.6) {
      patterns.push({
        type: 'collaboration_spike',
        description: `High collaboration: ${highCollabOperators.length} operators working closely together`,
        severity: 'info',
        operators: highCollabOperators.map(op => op.operatorId),
        suggestion: 'Consider if knowledge sharing opportunities can be captured'
      });
    }

    return patterns;
  }, []);

  // Load activity data
  useEffect(() => {
    const loadActivityData = async () => {
      try {
        setLoading(true);
        setError(null);

        const [activities, timeline] = await Promise.all([
          calculateOperatorActivities(),
          Promise.resolve(calculateActivityTimeline())
        ]);

        setOperatorActivities(activities);
        setActivityTimeline(timeline);

        // Detect and report activity patterns
        const patterns = detectActivityPatterns(activities);
        patterns.forEach(pattern => {
          if (onActivityPattern) {
            onActivityPattern(pattern);
          }
        });

        setLastUpdate(Date.now());

      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load activity data');
      } finally {
        setLoading(false);
      }
    };

    loadActivityData();
  }, [calculateOperatorActivities, calculateActivityTimeline, detectActivityPatterns, onActivityPattern]);

  // Load team information
  useEffect(() => {
    const loadTeamInfo = async () => {
      try {
        const response = await fetch(`/api/teams/${teamId}`);
        if (response.ok) {
          const data = await response.json();
          setTeamInfo(data);
        }
      } catch {
        // Team info is optional
      }
    };

    loadTeamInfo();
  }, [teamId]);

  // Real-time updates
  useEffect(() => {
    if (!realTimeUpdates) return;

    const interval = setInterval(() => {
      setLastUpdate(Date.now());
      // Trigger re-calculation by updating a state dependency
    }, 30000); // Update every 30 seconds

    return () => clearInterval(interval);
  }, [realTimeUpdates]);

  // Format time ago
  const formatTimeAgo = (timestamp: number): string => {
    const diffMs = Date.now() - timestamp;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMins / 60);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${Math.floor(diffHours / 24)}d ago`;
  };

  // Get activity level color
  const getActivityLevelColor = (pattern: string): string => {
    switch (pattern) {
      case 'active': return 'var(--success)';
      case 'moderate': return 'var(--org-primary)';
      case 'light': return 'var(--warn)';
      case 'inactive': return 'var(--t3)';
      default: return 'var(--t2)';
    }
  };

  const cardClasses = [
    'org-card',
    'team-activity-overview',
    compact ? 'compact' : '',
    className
  ].filter(Boolean).join(' ');

  // Loading state
  if (loading) {
    return (
      <div className={cardClasses}>
        <div className="org-card__header">
          <div className="org-card__title">
            <span className="team-activity-overview__icon">📊</span>
            Team Activity
          </div>
        </div>
        <div className="org-card__content">
          <div className="team-activity-loading">
            <div className="team-activity-loading-spinner" />
            <div className="team-activity-loading-text">
              Loading team activity data...
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
            <span className="team-activity-overview__icon">📊</span>
            Team Activity
          </div>
        </div>
        <div className="org-card__content">
          <div className="team-activity-error">
            <div className="team-activity-error__icon">⚠️</div>
            <div className="team-activity-error__message">
              {error}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cardClasses}>
      <div className="org-card__header">
        <div className="org-card__title">
          <span className="team-activity-overview__icon">📊</span>
          Team Activity
          {teamInfo && !compact && (
            <span className="team-activity-overview__team-name">
              {teamInfo.teamName || teamId.substring(0, 8)}
            </span>
          )}
        </div>
        <div className="org-card__subtitle">
          {timeRange.toUpperCase()} • {operatorActivities.length} operator{operatorActivities.length !== 1 ? 's' : ''}
          {realTimeUpdates && (
            <span className="team-activity-overview__last-update">
              • Updated {formatTimeAgo(lastUpdate)}
            </span>
          )}
        </div>
      </div>

      <div className="org-card__content">
        {/* Activity Summary */}
        <div className="team-activity-summary">
          <div className="team-activity-summary-stat">
            <div className="team-activity-summary-stat__icon">👥</div>
            <div className="team-activity-summary-stat__value">
              {operatorActivities.filter(op => op.isActive).length}
            </div>
            <div className="team-activity-summary-stat__label">
              Active Now
            </div>
          </div>

          <div className="team-activity-summary-stat">
            <div className="team-activity-summary-stat__icon">📈</div>
            <div className="team-activity-summary-stat__value">
              {teamTraces.length}
            </div>
            <div className="team-activity-summary-stat__label">
              {compact ? 'Traces' : 'Total Traces'}
            </div>
          </div>

          {showCollaboration && (
            <div className="team-activity-summary-stat">
              <div className="team-activity-summary-stat__icon">🤝</div>
              <div className="team-activity-summary-stat__value">
                {(operatorActivities.reduce((sum, op) => sum + op.collaborationScore, 0) / operatorActivities.length * 100).toFixed(0)}%
              </div>
              <div className="team-activity-summary-stat__label">
                {compact ? 'Collab' : 'Collaboration'}
              </div>
            </div>
          )}
        </div>

        {/* Operator Activities */}
        <div className="team-activity-operators">
          <div className="team-activity-section__header">
            <div className="team-activity-section__title">Operator Activity</div>
          </div>
          <div className="team-activity-operators-list">
            {operatorActivities.slice(0, compact ? 3 : 8).map((operator) => (
              <div
                key={operator.operatorId}
                className={`team-activity-operator ${operator.isActive ? 'active' : 'inactive'}`}
              >
                <div className="team-activity-operator__header">
                  <button
                    className="team-activity-operator__name"
                    onClick={() => onOperatorClick?.(operator.operatorId)}
                    title={`View details for ${operator.name || operator.operatorId}`}
                  >
                    <span className="team-activity-operator__avatar">
                      {operator.name ? operator.name.charAt(0).toUpperCase() : '👤'}
                    </span>
                    <span className="team-activity-operator__display-name">
                      {operator.name || operator.operatorId.substring(0, 8)}
                    </span>
                  </button>

                  <div className="team-activity-operator__status">
                    <div
                      className="team-activity-operator__activity-dot"
                      style={{ backgroundColor: getActivityLevelColor(operator.activityPattern) }}
                    />
                    <div className="team-activity-operator__last-activity">
                      {formatTimeAgo(operator.lastActivity)}
                    </div>
                  </div>
                </div>

                {!compact && showWorkloadDistribution && (
                  <div className="team-activity-operator__workload">
                    <div className="team-activity-operator__workload-bar">
                      <div
                        className="team-activity-operator__workload-fill"
                        style={{
                          width: `${operator.workloadPercentage}%`,
                          backgroundColor: getActivityLevelColor(operator.activityPattern)
                        }}
                      />
                    </div>
                    <div className="team-activity-operator__workload-stats">
                      <span className="team-activity-operator__traces">
                        {operator.tracesCount} trace{operator.tracesCount !== 1 ? 's' : ''}
                      </span>
                      <span className="team-activity-operator__percentage">
                        {operator.workloadPercentage.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                )}

                {!compact && (
                  <div className="team-activity-operator__metrics">
                    <div className="team-activity-operator-metric">
                      <span className="team-activity-operator-metric__label">Success</span>
                      <span className="team-activity-operator-metric__value">
                        {(operator.successRate * 100).toFixed(0)}%
                      </span>
                    </div>
                    {showCollaboration && (
                      <div className="team-activity-operator-metric">
                        <span className="team-activity-operator-metric__label">Collab</span>
                        <span className="team-activity-operator-metric__value">
                          {(operator.collaborationScore * 100).toFixed(0)}%
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            {operatorActivities.length > (compact ? 3 : 8) && (
              <div className="team-activity-operators-overflow">
                +{operatorActivities.length - (compact ? 3 : 8)} more operator{operatorActivities.length - (compact ? 3 : 8) !== 1 ? 's' : ''}
              </div>
            )}
          </div>
        </div>

        {/* Activity Timeline */}
        {showActivityTimeline && !compact && activityTimeline.length > 0 && (
          <div className="team-activity-timeline">
            <div className="team-activity-section__header">
              <div className="team-activity-section__title">Activity Timeline</div>
            </div>
            <div className="team-activity-timeline-chart">
              {activityTimeline.map((bucket, index) => (
                <div
                  key={bucket.timestamp}
                  className="team-activity-timeline-bar"
                  style={{
                    height: `${Math.min(bucket.totalActivity * 20, 100)}px`
                  }}
                  title={`${bucket.totalActivity} activities at ${new Date(bucket.timestamp).toLocaleTimeString()}`}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Export default for easy importing
export default TeamActivityOverview;