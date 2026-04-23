/**
 * Organizational Data Formatters
 *
 * Utility functions for formatting and displaying organizational context data
 * in a user-friendly manner across the dashboard.
 */

import type {
  OperatorActivityPattern,
  OperatorContext,
  PolicyStatus,
  SessionCorrelation,
  TeamPerformanceMetrics,
} from '../../types/organizational.js';

/**
 * Format operator ID for display (shorten long UUIDs)
 */
export function formatOperatorId(operatorId: string): string {
  if (operatorId.length > 12) {
    return `${operatorId.slice(0, 8)}...${operatorId.slice(-4)}`;
  }
  return operatorId;
}

/**
 * Format team ID to human-readable team name
 */
export function formatTeamName(teamId: string): string {
  return teamId.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
}

/**
 * Format session ID for display
 */
export function formatSessionId(sessionId: string): string {
  if (sessionId.length > 16) {
    return `${sessionId.slice(0, 8)}...${sessionId.slice(-8)}`;
  }
  return sessionId;
}

/**
 * Format instance ID to display friendly client type
 */
export function formatInstanceType(instanceId?: string, userAgent?: string): string {
  if (instanceId?.includes('cli')) return 'CLI';
  if (instanceId?.includes('desktop')) return 'Desktop';
  if (instanceId?.includes('web')) return 'Web';
  if (instanceId?.includes('vscode')) return 'VS Code';

  // Try to infer from user agent
  if (userAgent) {
    if (userAgent.includes('CLI')) return 'CLI';
    if (userAgent.includes('desktop')) return 'Desktop';
    if (userAgent.includes('vscode')) return 'VS Code';
    if (userAgent.includes('Mozilla')) return 'Web';
  }

  return instanceId || 'Unknown';
}

/**
 * Format timestamp for relative display (e.g., "2 hours ago")
 */
export function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  return 'Just now';
}

/**
 * Format policy compliance status for display
 */
export function formatPolicyStatus(status: PolicyStatus['compliance']): {
  text: string;
  color: string;
  icon: string;
} {
  switch (status) {
    case 'compliant':
      return { text: 'Compliant', color: 'green', icon: '✓' };
    case 'warning':
      return { text: 'Warning', color: 'orange', icon: '⚠️' };
    case 'violation':
      return { text: 'Violation', color: 'red', icon: '✗' };
    case 'pending':
      return { text: 'Pending', color: 'blue', icon: '⏳' };
    default:
      return { text: 'Unknown', color: 'gray', icon: '?' };
  }
}

/**
 * Format session correlation confidence as percentage
 */
export function formatConfidence(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

/**
 * Format relationship type for display
 */
export function formatRelationshipType(
  type: SessionCorrelation['relatedSessions'][0]['relationshipType'],
): {
  text: string;
  description: string;
  color: string;
} {
  switch (type) {
    case 'continuation':
      return {
        text: 'Continuation',
        description: 'Same operator continuing work',
        color: 'blue',
      };
    case 'collaboration':
      return {
        text: 'Collaboration',
        description: 'Team member collaboration',
        color: 'purple',
      };
    case 'handoff':
      return {
        text: 'Handoff',
        description: 'Work passed between operators',
        color: 'orange',
      };
    case 'similar-problem':
      return {
        text: 'Similar Problem',
        description: 'Similar issues or solutions',
        color: 'green',
      };
    default:
      return {
        text: 'Related',
        description: 'Related session',
        color: 'gray',
      };
  }
}

/**
 * Format duration in milliseconds to human readable
 */
export function formatDuration(durationMs: number): string {
  if (durationMs < 1000) return `${durationMs}ms`;

  const seconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  }

  if (minutes > 0) {
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  }

  return `${seconds}s`;
}

/**
 * Format performance metrics for display
 */
export function formatPerformanceMetric(
  value: number,
  type: 'percentage' | 'latency' | 'rate' | 'count',
): string {
  switch (type) {
    case 'percentage':
      return `${Math.round(value * 100)}%`;
    case 'latency':
      if (value < 1) return `${Math.round(value * 1000)}μs`;
      if (value < 1000) return `${Math.round(value)}ms`;
      return `${Math.round(value / 1000)}s`;
    case 'rate':
      return `${Math.round(value * 100) / 100}/s`;
    case 'count':
      if (value >= 1000000) return `${Math.round(value / 100000) / 10}M`;
      if (value >= 1000) return `${Math.round(value / 100) / 10}K`;
      return value.toString();
    default:
      return value.toString();
  }
}

/**
 * Format operator activity pattern for display
 */
export function formatActivityPattern(pattern: OperatorActivityPattern['patterns'][0]): {
  title: string;
  description: string;
  confidence: string;
  color: string;
} {
  const confidence = formatConfidence(pattern.confidence);

  switch (pattern.patternType) {
    case 'workflow':
      return {
        title: 'Workflow Pattern',
        description: pattern.description,
        confidence,
        color: 'blue',
      };
    case 'problem-solving':
      return {
        title: 'Problem-Solving Pattern',
        description: pattern.description,
        confidence,
        color: 'green',
      };
    case 'collaboration':
      return {
        title: 'Collaboration Pattern',
        description: pattern.description,
        confidence,
        color: 'purple',
      };
    default:
      return {
        title: 'Activity Pattern',
        description: pattern.description,
        confidence,
        color: 'gray',
      };
  }
}

/**
 * Get operator context display summary
 */
export function getOperatorContextSummary(operatorContext: OperatorContext): {
  operator: string;
  team?: string;
  session: string;
  instance: string;
  timestamp: string;
} {
  return {
    operator: formatOperatorId(operatorContext.operatorId),
    team: operatorContext.teamId ? formatTeamName(operatorContext.teamId) : undefined,
    session: formatSessionId(operatorContext.sessionId),
    instance: formatInstanceType(operatorContext.instanceId, operatorContext.userAgent),
    timestamp: operatorContext.timestamp
      ? formatRelativeTime(operatorContext.timestamp)
      : 'Unknown',
  };
}

/**
 * Get team performance summary
 */
export function getTeamPerformanceSummary(metrics: TeamPerformanceMetrics): {
  successRate: string;
  avgExecutionTime: string;
  totalExecutions: string;
  activeOperators: string;
  queryLatency: string;
  cacheHitRate: string;
} {
  return {
    successRate: formatPerformanceMetric(metrics.metrics.successRate, 'percentage'),
    avgExecutionTime: formatDuration(metrics.metrics.averageExecutionTime),
    totalExecutions: formatPerformanceMetric(metrics.metrics.totalExecutions, 'count'),
    activeOperators: formatPerformanceMetric(metrics.metrics.activeOperators, 'count'),
    queryLatency: formatPerformanceMetric(metrics.queryPerformance.averageLatency, 'latency'),
    cacheHitRate: formatPerformanceMetric(metrics.queryPerformance.cacheHitRate, 'percentage'),
  };
}
