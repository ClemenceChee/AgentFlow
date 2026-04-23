/**
 * Organizational Helper Utilities
 *
 * Additional utility functions for organizational data processing,
 * analysis, and transformation.
 */

import type {
  OperatorActivityPattern,
  OrganizationalIntelligence,
  OrganizationalTrace,
  SessionCorrelation,
  TeamPerformanceMetrics,
} from '../../types/organizational.js';

/**
 * Calculate similarity score between two sessions
 */
export function calculateSessionSimilarity(
  session1: OrganizationalTrace,
  session2: OrganizationalTrace,
): number {
  let score = 0;

  // Same agent usage (30%)
  if (session1.agentId === session2.agentId) {
    score += 0.3;
  }

  // Same operator (40%)
  if (session1.operatorContext?.operatorId === session2.operatorContext?.operatorId) {
    score += 0.4;
  }

  // Same team (20%)
  if (session1.operatorContext?.teamId === session2.operatorContext?.teamId) {
    score += 0.2;
  }

  // Name similarity (10%)
  const name1Words = session1.name.toLowerCase().split(/\s+/);
  const name2Words = session2.name.toLowerCase().split(/\s+/);
  const commonWords = name1Words.filter((word) => name2Words.includes(word));
  if (commonWords.length > 0) {
    score += Math.min(0.1, commonWords.length * 0.02);
  }

  return Math.min(score, 1.0);
}

/**
 * Extract activity patterns from operator timeline
 */
export function extractOperatorPatterns(
  timeline: OperatorActivityPattern['timeline'],
): OperatorActivityPattern['patterns'] {
  const patterns: OperatorActivityPattern['patterns'] = [];

  if (timeline.length < 2) return patterns;

  // Analyze agent usage patterns
  const agentUsage = timeline.reduce(
    (acc, item) => {
      const key = 'agentId' in item ? item.agentId : 'unknown';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const sortedAgents = Object.entries(agentUsage).sort(([, a], [, b]) => b - a);

  // Identify frequent agent usage patterns
  const totalSessions = timeline.length;
  for (const [agentId, count] of sortedAgents) {
    const frequency = count / totalSessions;
    if (frequency > 0.3) {
      // 30% threshold for pattern
      patterns.push({
        patternType: 'workflow',
        description: `Frequently uses ${agentId} (${Math.round(frequency * 100)}% of sessions)`,
        frequency: count,
        confidence: Math.min(frequency * 2, 0.95),
        recommendations: [`Consider creating shortcuts for common ${agentId} operations`],
      });
    }
  }

  // Analyze collaboration patterns
  const collaborationEvents = timeline.filter(
    (item) =>
      item.activityType === 'collaboration' ||
      (item.relatedOperators && item.relatedOperators.length > 0),
  );

  if (collaborationEvents.length > totalSessions * 0.2) {
    patterns.push({
      patternType: 'collaboration',
      description: `High collaboration activity (${collaborationEvents.length} events)`,
      frequency: collaborationEvents.length,
      confidence: Math.min(collaborationEvents.length / totalSessions, 0.95),
      recommendations: [
        'Consider team knowledge sharing sessions',
        'Document collaborative workflows',
      ],
    });
  }

  return patterns;
}

/**
 * Build session correlation chain
 */
export function buildCorrelationChain(
  correlations: SessionCorrelation['relatedSessions'],
): string[] {
  // Find continuation relationships and build chain
  const continuations = correlations
    .filter((c) => c.relationshipType === 'continuation')
    .sort((a, b) => a.timestamp - b.timestamp);

  return continuations.map((c) => c.sessionId);
}

/**
 * Categorize activity type based on session data
 */
export function categorizeActivity(trace: OrganizationalTrace): {
  category: 'development' | 'debugging' | 'analysis' | 'collaboration' | 'maintenance' | 'other';
  confidence: number;
  indicators: string[];
} {
  const name = trace.name.toLowerCase();
  const agentId = trace.agentId.toLowerCase();
  const indicators: string[] = [];

  // Development indicators
  const devKeywords = ['build', 'deploy', 'code', 'implement', 'create', 'develop'];
  const devScore = devKeywords.filter(
    (keyword) => name.includes(keyword) || agentId.includes(keyword),
  );

  // Debugging indicators
  const debugKeywords = ['debug', 'fix', 'error', 'issue', 'bug', 'troubleshoot'];
  const debugScore = debugKeywords.filter(
    (keyword) => name.includes(keyword) || agentId.includes(keyword),
  );

  // Analysis indicators
  const analysisKeywords = ['analyze', 'review', 'inspect', 'examine', 'report'];
  const analysisScore = analysisKeywords.filter(
    (keyword) => name.includes(keyword) || agentId.includes(keyword),
  );

  // Collaboration indicators
  const hasTeamContext = !!trace.operatorContext?.teamId;
  const collaborationScore = hasTeamContext ? 1 : 0;

  // Determine category with highest score
  const scores = {
    development: devScore.length,
    debugging: debugScore.length,
    analysis: analysisScore.length,
    collaboration: collaborationScore,
    maintenance: 0,
    other: 0,
  };

  if (trace.status === 'failed') {
    scores.debugging += 1;
    indicators.push('Failed execution suggests debugging');
  }

  const maxScore = Math.max(...Object.values(scores));
  const category =
    (Object.entries(scores).find(([, score]) => score === maxScore)?.[0] as any) || 'other';

  indicators.push(...devScore.map((k) => `Development keyword: ${k}`));
  indicators.push(...debugScore.map((k) => `Debugging keyword: ${k}`));
  indicators.push(...analysisScore.map((k) => `Analysis keyword: ${k}`));

  if (hasTeamContext) {
    indicators.push('Team context indicates collaboration');
  }

  return {
    category,
    confidence: Math.min(maxScore / 3, 0.95), // Normalize to 0-1 scale
    indicators,
  };
}

/**
 * Calculate team metrics from traces
 */
export function calculateTeamMetrics(
  traces: OrganizationalTrace[],
  teamId: string,
): Partial<TeamPerformanceMetrics> {
  const teamTraces = traces.filter((trace) => trace.operatorContext?.teamId === teamId);

  if (teamTraces.length === 0) {
    return {
      teamId,
      metrics: {
        successRate: 0,
        averageExecutionTime: 0,
        totalExecutions: 0,
        activeOperators: 0,
        collaborationScore: 0,
      },
    };
  }

  const successfulTraces = teamTraces.filter((trace) => trace.status === 'completed');
  const successRate = successfulTraces.length / teamTraces.length;

  const totalExecutionTime = teamTraces.reduce(
    (sum, trace) => sum + (trace.endTime - trace.startTime),
    0,
  );
  const averageExecutionTime = totalExecutionTime / teamTraces.length;

  const uniqueOperators = new Set(
    teamTraces.map((trace) => trace.operatorContext?.operatorId).filter(Boolean),
  );

  // Simple collaboration score based on unique operators
  const collaborationScore = Math.min(
    uniqueOperators.size / Math.max(teamTraces.length * 0.5, 1),
    1,
  );

  return {
    teamId,
    metrics: {
      successRate,
      averageExecutionTime,
      totalExecutions: teamTraces.length,
      activeOperators: uniqueOperators.size,
      collaborationScore,
    },
  };
}

/**
 * Generate insights from organizational intelligence
 */
export function generateInsights(intelligence: OrganizationalIntelligence): Array<{
  type: 'success' | 'warning' | 'info' | 'error';
  title: string;
  description: string;
  actionable: boolean;
  priority: 'high' | 'medium' | 'low';
}> {
  const insights = [];

  // Performance insights
  if (intelligence.performanceInsights.organizationalQueryLatency > 50) {
    insights.push({
      type: 'warning' as const,
      title: 'High Query Latency',
      description: `Organizational queries averaging ${intelligence.performanceInsights.organizationalQueryLatency}ms`,
      actionable: true,
      priority: 'high' as const,
    });
  }

  if (intelligence.performanceInsights.teamScopedCacheHitRate < 0.8) {
    insights.push({
      type: 'warning' as const,
      title: 'Low Cache Hit Rate',
      description: `Team-scoped cache only ${Math.round(intelligence.performanceInsights.teamScopedCacheHitRate * 100)}% effective`,
      actionable: true,
      priority: 'medium' as const,
    });
  }

  // Collaboration insights
  const collaborationRate =
    intelligence.operatorInsights.collaborationEvents /
    Math.max(intelligence.operatorInsights.totalOperators, 1);

  if (collaborationRate < 0.5) {
    insights.push({
      type: 'info' as const,
      title: 'Low Collaboration Activity',
      description: 'Consider promoting more cross-operator knowledge sharing',
      actionable: true,
      priority: 'low' as const,
    });
  }

  // Team size insights
  if (intelligence.teamInsights.averageTeamSize > 10) {
    insights.push({
      type: 'info' as const,
      title: 'Large Team Sizes',
      description: 'Large teams may benefit from subdivision for better coordination',
      actionable: true,
      priority: 'medium' as const,
    });
  }

  return insights;
}

/**
 * Sort traces by organizational relevance
 */
export function sortByRelevance(
  traces: OrganizationalTrace[],
  currentOperator?: string,
  currentTeam?: string,
): OrganizationalTrace[] {
  return traces.sort((a, b) => {
    let scoreA = 0;
    let scoreB = 0;

    // Same operator gets highest priority
    if (currentOperator) {
      if (a.operatorContext?.operatorId === currentOperator) scoreA += 100;
      if (b.operatorContext?.operatorId === currentOperator) scoreB += 100;
    }

    // Same team gets high priority
    if (currentTeam) {
      if (a.operatorContext?.teamId === currentTeam) scoreA += 50;
      if (b.operatorContext?.teamId === currentTeam) scoreB += 50;
    }

    // Recent traces get higher priority
    const timeWeight = 10;
    scoreA += (a.startTime / 1000) * timeWeight;
    scoreB += (b.startTime / 1000) * timeWeight;

    return scoreB - scoreA;
  });
}

/**
 * Filter traces by access level
 */
export function filterByAccessLevel(
  traces: OrganizationalTrace[],
  operatorId: string,
  allowedTeams: string[] = [],
  isSuperUser: boolean = false,
): OrganizationalTrace[] {
  if (isSuperUser) return traces;

  return traces.filter((trace) => {
    // Own traces always visible
    if (trace.operatorContext?.operatorId === operatorId) return true;

    // Team traces visible if in allowed teams
    if (trace.operatorContext?.teamId) {
      return allowedTeams.includes(trace.operatorContext.teamId);
    }

    // Traces without operator context are visible (backward compatibility)
    return true;
  });
}

/**
 * Create display summary for organizational data
 */
export function createDisplaySummary(traces: OrganizationalTrace[]): {
  totalTraces: number;
  withOperatorContext: number;
  withTeamContext: number;
  withPolicyStatus: number;
  uniqueOperators: number;
  uniqueTeams: number;
  timespan: { start: number; end: number };
  topAgents: Array<{ agentId: string; count: number }>;
} {
  const withOperatorContext = traces.filter((t) => t.operatorContext).length;
  const withTeamContext = traces.filter((t) => t.operatorContext?.teamId).length;
  const withPolicyStatus = traces.filter((t) => t.policyStatus).length;

  const uniqueOperators = new Set(traces.map((t) => t.operatorContext?.operatorId).filter(Boolean))
    .size;

  const uniqueTeams = new Set(traces.map((t) => t.operatorContext?.teamId).filter(Boolean)).size;

  const timestamps = traces.map((t) => t.startTime);
  const timespan = {
    start: Math.min(...timestamps),
    end: Math.max(...timestamps),
  };

  const agentCounts = traces.reduce(
    (acc, trace) => {
      acc[trace.agentId] = (acc[trace.agentId] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const topAgents = Object.entries(agentCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([agentId, count]) => ({ agentId, count }));

  return {
    totalTraces: traces.length,
    withOperatorContext,
    withTeamContext,
    withPolicyStatus,
    uniqueOperators,
    uniqueTeams,
    timespan,
    topAgents,
  };
}
