/**
 * OrganizationalBriefingDisplay Component
 *
 * Displays SOMA briefing content, organizational intelligence insights,
 * and actionable recommendations for operators and teams.
 */

import {
  AlertTriangle,
  Brain,
  ChevronDown,
  ChevronRight,
  Lightbulb,
  TrendingUp,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useOrganizationalContext } from '../../../../contexts/OrganizationalContext';
import type { SessionCorrelation } from '../../../types/organizational.js';

export interface BriefingInsight {
  readonly id: string;
  readonly type: 'pattern' | 'anomaly' | 'opportunity' | 'risk' | 'knowledge';
  readonly title: string;
  readonly description: string;
  readonly confidence: number;
  readonly impact: 'low' | 'medium' | 'high' | 'critical';
  readonly category: 'performance' | 'collaboration' | 'governance' | 'efficiency' | 'security';
  readonly timestamp: number;
  readonly evidenceCount: number;
  readonly relatedSessions?: readonly string[];
}

export interface BriefingRecommendation {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly actionType: 'immediate' | 'planned' | 'monitoring' | 'investigation';
  readonly priority: 'low' | 'medium' | 'high' | 'urgent';
  readonly estimatedEffort: 'minutes' | 'hours' | 'days' | 'weeks';
  readonly potentialImpact: string;
  readonly prerequisites?: readonly string[];
  readonly relatedInsights: readonly string[];
  readonly assignedTeam?: string;
}

export interface OrganizationalBriefing {
  readonly sessionId: string;
  readonly operatorId: string;
  readonly teamId?: string;
  readonly timestamp: number;
  readonly summary: string;
  readonly insights: readonly BriefingInsight[];
  readonly recommendations: readonly BriefingRecommendation[];
  readonly correlatedSessions: readonly string[];
  readonly confidenceScore: number;
  readonly lastUpdated: number;
}

interface OrganizationalBriefingDisplayProps {
  /** Session correlation data for briefing context */
  readonly sessionCorrelation: SessionCorrelation;
  /** Display mode for briefing content */
  readonly mode?: 'summary' | 'detailed' | 'recommendations';
  /** Whether to show real-time updates */
  readonly realTime?: boolean;
  /** Callback for recommendation actions */
  readonly onActionRecommendation?: (recommendationId: string, action: string) => Promise<void>;
  /** Additional CSS classes */
  readonly className?: string;
}

const getInsightIcon = (type: BriefingInsight['type']) => {
  switch (type) {
    case 'pattern':
      return <TrendingUp className="h-4 w-4" />;
    case 'anomaly':
      return <AlertTriangle className="h-4 w-4" />;
    case 'opportunity':
      return <Lightbulb className="h-4 w-4" />;
    case 'risk':
      return <AlertTriangle className="h-4 w-4" />;
    case 'knowledge':
      return <Brain className="h-4 w-4" />;
    default:
      return <Brain className="h-4 w-4" />;
  }
};

const getInsightColor = (type: BriefingInsight['type']) => {
  switch (type) {
    case 'pattern':
      return 'org-text-info';
    case 'anomaly':
      return 'org-text-warning';
    case 'opportunity':
      return 'org-text-success';
    case 'risk':
      return 'org-text-error';
    case 'knowledge':
      return 'org-text-primary';
    default:
      return 'org-text-muted';
  }
};

const getImpactColor = (impact: BriefingInsight['impact']) => {
  switch (impact) {
    case 'critical':
      return 'org-badge-error';
    case 'high':
      return 'org-badge-warning';
    case 'medium':
      return 'org-badge-info';
    case 'low':
      return 'org-badge-secondary';
    default:
      return 'org-badge-secondary';
  }
};

const getPriorityColor = (priority: BriefingRecommendation['priority']) => {
  switch (priority) {
    case 'urgent':
      return 'org-badge-error';
    case 'high':
      return 'org-badge-warning';
    case 'medium':
      return 'org-badge-info';
    case 'low':
      return 'org-badge-secondary';
    default:
      return 'org-badge-secondary';
  }
};

const BriefingSummaryView: React.FC<{ briefing: OrganizationalBriefing }> = ({ briefing }) => (
  <div className="org-briefing-summary">
    <div className="flex items-start space-x-3 mb-4">
      <div className="flex-shrink-0 w-10 h-10 org-bg-primary-light rounded-lg flex items-center justify-center">
        <Brain className="h-5 w-5 org-text-primary" />
      </div>
      <div className="flex-1">
        <h3 className="org-text-lg org-font-semibold mb-1">Organizational Intelligence Brief</h3>
        <p className="org-text-muted mb-2">{briefing.summary}</p>
        <div className="flex items-center space-x-4 org-text-sm org-text-muted">
          <span>{briefing.insights.length} insights</span>
          <span>{briefing.recommendations.length} recommendations</span>
          <span>Confidence: {Math.round(briefing.confidenceScore * 100)}%</span>
        </div>
      </div>
    </div>

    {briefing.insights.length > 0 && (
      <div className="space-y-2">
        <h4 className="org-text-sm org-font-semibold">Key Insights</h4>
        {briefing.insights.slice(0, 3).map((insight) => (
          <div key={insight.id} className="flex items-center space-x-2 org-text-sm">
            <div className={getInsightColor(insight.type)}>{getInsightIcon(insight.type)}</div>
            <span className="flex-1 truncate">{insight.title}</span>
            <span className={`org-badge org-badge-xs ${getImpactColor(insight.impact)}`}>
              {insight.impact}
            </span>
          </div>
        ))}
        {briefing.insights.length > 3 && (
          <div className="org-text-xs org-text-muted">
            +{briefing.insights.length - 3} more insights
          </div>
        )}
      </div>
    )}
  </div>
);

const DetailedBriefingView: React.FC<{ briefing: OrganizationalBriefing }> = ({ briefing }) => {
  const [expandedInsights, setExpandedInsights] = useState<Set<string>>(new Set());
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const toggleInsight = (insightId: string) => {
    setExpandedInsights((prev) => {
      const next = new Set(prev);
      if (next.has(insightId)) {
        next.delete(insightId);
      } else {
        next.add(insightId);
      }
      return next;
    });
  };

  const filteredInsights =
    selectedCategory === 'all'
      ? briefing.insights
      : briefing.insights.filter((insight) => insight.category === selectedCategory);

  const categories = [...new Set(briefing.insights.map((i) => i.category))];

  return (
    <div className="org-briefing-detailed">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="org-text-xl org-font-semibold">Organizational Intelligence Analysis</h3>
          <div className="org-text-sm org-text-muted">
            Updated {new Date(briefing.lastUpdated).toLocaleString()}
          </div>
        </div>
        <p className="org-text-muted mb-4">{briefing.summary}</p>

        <div className="grid grid-cols-4 gap-4 org-text-sm">
          <div className="org-stat-card">
            <div className="org-stat-value">{briefing.insights.length}</div>
            <div className="org-stat-label">Insights</div>
          </div>
          <div className="org-stat-card">
            <div className="org-stat-value">{briefing.recommendations.length}</div>
            <div className="org-stat-label">Recommendations</div>
          </div>
          <div className="org-stat-card">
            <div className="org-stat-value">{briefing.correlatedSessions.length}</div>
            <div className="org-stat-label">Correlated Sessions</div>
          </div>
          <div className="org-stat-card">
            <div className="org-stat-value">{Math.round(briefing.confidenceScore * 100)}%</div>
            <div className="org-stat-label">Confidence</div>
          </div>
        </div>
      </div>

      <div className="mb-6">
        <div className="flex items-center space-x-2 mb-4">
          <h4 className="org-text-lg org-font-semibold">Insights & Analysis</h4>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="org-select org-select-sm"
          >
            <option value="all">All Categories</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat.charAt(0).toUpperCase() + cat.slice(1)}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-3">
          {filteredInsights.map((insight) => {
            const isExpanded = expandedInsights.has(insight.id);
            return (
              <div key={insight.id} className="org-card-inner">
                <div
                  className="flex items-center justify-between cursor-pointer"
                  onClick={() => toggleInsight(insight.id)}
                >
                  <div className="flex items-center space-x-3">
                    <div className={getInsightColor(insight.type)}>
                      {getInsightIcon(insight.type)}
                    </div>
                    <div>
                      <div className="org-font-medium">{insight.title}</div>
                      <div className="flex items-center space-x-2 mt-1">
                        <span
                          className={`org-badge org-badge-xs ${getImpactColor(insight.impact)}`}
                        >
                          {insight.impact} impact
                        </span>
                        <span className="org-text-xs org-text-muted">
                          {insight.evidenceCount} evidence points
                        </span>
                        <span className="org-text-xs org-text-muted">
                          {Math.round(insight.confidence * 100)}% confidence
                        </span>
                      </div>
                    </div>
                  </div>
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 org-text-muted" />
                  ) : (
                    <ChevronRight className="h-4 w-4 org-text-muted" />
                  )}
                </div>

                {isExpanded && (
                  <div className="mt-3 pt-3 org-border-t">
                    <p className="org-text-muted mb-3">{insight.description}</p>
                    {insight.relatedSessions && insight.relatedSessions.length > 0 && (
                      <div>
                        <div className="org-text-sm org-font-medium mb-2">Related Sessions</div>
                        <div className="flex flex-wrap gap-1">
                          {insight.relatedSessions.map((sessionId) => (
                            <span
                              key={sessionId}
                              className="org-badge org-badge-secondary org-badge-xs"
                            >
                              {sessionId.slice(-8)}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const RecommendationsView: React.FC<{
  briefing: OrganizationalBriefing;
  onActionRecommendation?: (recommendationId: string, action: string) => Promise<void>;
}> = ({ briefing, onActionRecommendation }) => {
  const [actingRecommendations, setActingRecommendations] = useState<Set<string>>(new Set());
  const [filterPriority, setFilterPriority] = useState<string>('all');

  const handleAction = async (recommendationId: string, action: string) => {
    if (!onActionRecommendation) return;

    setActingRecommendations((prev) => new Set([...prev, recommendationId]));
    try {
      await onActionRecommendation(recommendationId, action);
    } finally {
      setActingRecommendations((prev) => {
        const next = new Set(prev);
        next.delete(recommendationId);
        return next;
      });
    }
  };

  const filteredRecommendations =
    filterPriority === 'all'
      ? briefing.recommendations
      : briefing.recommendations.filter((rec) => rec.priority === filterPriority);

  const priorityOrder = ['urgent', 'high', 'medium', 'low'];
  const sortedRecommendations = filteredRecommendations.sort(
    (a, b) => priorityOrder.indexOf(a.priority) - priorityOrder.indexOf(b.priority),
  );

  return (
    <div className="org-briefing-recommendations">
      <div className="flex items-center justify-between mb-4">
        <h4 className="org-text-lg org-font-semibold">Actionable Recommendations</h4>
        <select
          value={filterPriority}
          onChange={(e) => setFilterPriority(e.target.value)}
          className="org-select org-select-sm"
        >
          <option value="all">All Priorities</option>
          <option value="urgent">Urgent</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>

      <div className="space-y-4">
        {sortedRecommendations.map((recommendation) => {
          const isActing = actingRecommendations.has(recommendation.id);
          return (
            <div key={recommendation.id} className="org-card-inner">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-1">
                    <h5 className="org-font-semibold">{recommendation.title}</h5>
                    <span
                      className={`org-badge org-badge-xs ${getPriorityColor(recommendation.priority)}`}
                    >
                      {recommendation.priority}
                    </span>
                  </div>
                  <p className="org-text-muted org-text-sm mb-2">{recommendation.description}</p>
                  <div className="flex items-center space-x-4 org-text-xs org-text-muted">
                    <span>Effort: {recommendation.estimatedEffort}</span>
                    <span>Type: {recommendation.actionType}</span>
                    {recommendation.assignedTeam && (
                      <span>Team: {recommendation.assignedTeam}</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="org-bg-surface p-3 rounded-md mb-3">
                <div className="org-text-sm org-font-medium mb-1">Expected Impact</div>
                <div className="org-text-sm org-text-muted">{recommendation.potentialImpact}</div>
              </div>

              {recommendation.prerequisites && recommendation.prerequisites.length > 0 && (
                <div className="mb-3">
                  <div className="org-text-sm org-font-medium mb-1">Prerequisites</div>
                  <ul className="org-text-sm org-text-muted list-disc list-inside">
                    {recommendation.prerequisites.map((prereq, index) => (
                      <li key={index}>{prereq}</li>
                    ))}
                  </ul>
                </div>
              )}

              {onActionRecommendation && (
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => handleAction(recommendation.id, 'accept')}
                    disabled={isActing}
                    className="org-button org-button-primary org-button-sm"
                  >
                    {isActing ? 'Processing...' : 'Accept & Execute'}
                  </button>
                  <button
                    onClick={() => handleAction(recommendation.id, 'defer')}
                    disabled={isActing}
                    className="org-button org-button-secondary org-button-sm"
                  >
                    Defer
                  </button>
                  <button
                    onClick={() => handleAction(recommendation.id, 'dismiss')}
                    disabled={isActing}
                    className="org-button org-button-ghost org-button-sm"
                  >
                    Dismiss
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {sortedRecommendations.length === 0 && (
        <div className="org-empty-state">
          <Lightbulb className="h-8 w-8 org-text-muted mb-2" />
          <div className="org-text-muted">No recommendations match the current filter</div>
        </div>
      )}
    </div>
  );
};

export const OrganizationalBriefingDisplay: React.FC<OrganizationalBriefingDisplayProps> = ({
  sessionCorrelation,
  mode = 'detailed',
  realTime = false,
  onActionRecommendation,
  className = '',
}) => {
  const { teamFilter } = useOrganizationalContext();
  const [briefing, setBriefing] = useState<OrganizationalBriefing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchBriefing = async () => {
      try {
        setLoading(true);
        setError(null);

        // Generate mock briefing data based on session correlation
        const mockBriefing: OrganizationalBriefing = {
          sessionId: sessionCorrelation.sessionId,
          operatorId: sessionCorrelation.operatorId,
          teamId: sessionCorrelation.teamId,
          timestamp: sessionCorrelation.timestamp,
          summary: `Based on analysis of ${sessionCorrelation.relatedSessions.length} correlated sessions, this briefing identifies key patterns in team collaboration and system utilization.`,
          insights: [
            {
              id: 'insight-1',
              type: 'pattern',
              title: 'Recurring collaboration pattern detected',
              description:
                'Team members frequently collaborate on similar technical challenges, indicating opportunity for knowledge sharing automation.',
              confidence: 0.85,
              impact: 'medium',
              category: 'collaboration',
              timestamp: Date.now() - 3600000,
              evidenceCount: 12,
              relatedSessions: sessionCorrelation.relatedSessions.slice(0, 3),
            },
            {
              id: 'insight-2',
              type: 'opportunity',
              title: 'Performance optimization potential',
              description:
                'Analysis reveals consistent performance bottlenecks that could be addressed through configuration tuning.',
              confidence: 0.78,
              impact: 'high',
              category: 'performance',
              timestamp: Date.now() - 7200000,
              evidenceCount: 8,
              relatedSessions: sessionCorrelation.relatedSessions.slice(1, 4),
            },
          ],
          recommendations: [
            {
              id: 'rec-1',
              title: 'Implement automated knowledge sharing',
              description:
                'Deploy SOMA briefing automation to share successful solution patterns across team members.',
              actionType: 'planned',
              priority: 'medium',
              estimatedEffort: 'days',
              potentialImpact: 'Reduce problem resolution time by 25-30% through pattern reuse',
              prerequisites: ['Team lead approval', 'SOMA configuration access'],
              relatedInsights: ['insight-1'],
              assignedTeam: sessionCorrelation.teamId,
            },
            {
              id: 'rec-2',
              title: 'Optimize system configuration',
              description:
                'Apply performance tuning recommendations based on identified bottleneck patterns.',
              actionType: 'immediate',
              priority: 'high',
              estimatedEffort: 'hours',
              potentialImpact: 'Improve system response times by 15-20%',
              relatedInsights: ['insight-2'],
            },
          ],
          correlatedSessions: sessionCorrelation.relatedSessions,
          confidenceScore: sessionCorrelation.confidence,
          lastUpdated: Date.now(),
        };

        setBriefing(mockBriefing);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load briefing');
      } finally {
        setLoading(false);
      }
    };

    fetchBriefing();
  }, [sessionCorrelation]);

  // Real-time updates
  useEffect(() => {
    if (!realTime || !briefing) return;

    const interval = setInterval(() => {
      setBriefing((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          lastUpdated: Date.now(),
          confidenceScore: Math.min(prev.confidenceScore + 0.01, 1.0),
        };
      });
    }, 30000); // Update every 30 seconds

    return () => clearInterval(interval);
  }, [realTime, briefing]);

  if (loading) {
    return (
      <div className={`org-briefing-display org-loading ${className}`}>
        <div className="flex items-center space-x-2">
          <div className="org-spinner org-spinner-sm" />
          <span className="org-text-muted">Generating organizational briefing...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`org-briefing-display org-error ${className}`}>
        <div className="org-error-message">
          <AlertTriangle className="h-5 w-5 text-red-500" />
          <span>Failed to load briefing: {error}</span>
        </div>
      </div>
    );
  }

  if (!briefing) {
    return (
      <div className={`org-briefing-display org-empty ${className}`}>
        <div className="org-empty-state">
          <Brain className="h-8 w-8 org-text-muted mb-2" />
          <div className="org-text-muted">No briefing data available</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`org-briefing-display org-briefing-${mode} ${className}`}>
      {mode === 'summary' && <BriefingSummaryView briefing={briefing} />}
      {mode === 'detailed' && <DetailedBriefingView briefing={briefing} />}
      {mode === 'recommendations' && (
        <RecommendationsView briefing={briefing} onActionRecommendation={onActionRecommendation} />
      )}
    </div>
  );
};

export default OrganizationalBriefingDisplay;
