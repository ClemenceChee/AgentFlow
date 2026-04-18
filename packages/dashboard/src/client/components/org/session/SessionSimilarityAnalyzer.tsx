/**
 * SessionSimilarityAnalyzer Component
 *
 * Analyzes session similarities, identifies reusable patterns, and suggests
 * solution reuse opportunities based on historical session data.
 */

import { useState, useEffect } from 'react';
import { Search, Copy, BookOpen, TrendingUp, Lightbulb, Filter, ExternalLink, CheckCircle } from 'lucide-react';
import { useOrganizationalContext } from '../../../../contexts/OrganizationalContext';
import type { SessionCorrelation } from '../../../types/organizational.js';

export interface PatternMatch {
  readonly id: string;
  readonly type: 'workflow' | 'problem-solving' | 'code-pattern' | 'decision-making' | 'collaboration';
  readonly pattern: string;
  readonly confidence: number;
  readonly frequency: number;
  readonly lastSeen: number;
  readonly outcomes: readonly string[];
  readonly successRate: number;
  readonly averageDuration: number;
}

export interface SimilarSession {
  readonly sessionId: string;
  readonly operatorId: string;
  readonly teamId?: string;
  readonly timestamp: number;
  readonly duration: number;
  readonly title: string;
  readonly summary: string;
  readonly similarity: number;
  readonly commonPatterns: readonly PatternMatch[];
  readonly outcomes: readonly string[];
  readonly solutions: readonly string[];
  readonly reusabilityScore: number;
}

export interface SolutionSuggestion {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly source: 'similar-session' | 'pattern-analysis' | 'team-knowledge' | 'historical-success';
  readonly confidence: number;
  readonly applicability: number;
  readonly estimatedTimesSaving: number; // in minutes
  readonly prerequisites: readonly string[];
  readonly steps: readonly string[];
  readonly successExamples: readonly string[];
  readonly relatedSessions: readonly string[];
}

export interface SimilarityAnalysis {
  readonly currentSessionId: string;
  readonly similarSessions: readonly SimilarSession[];
  readonly identifiedPatterns: readonly PatternMatch[];
  readonly solutionSuggestions: readonly SolutionSuggestion[];
  readonly overallReusabilityScore: number;
  readonly potentialTimeSavings: number;
  readonly analyzedAt: number;
}

interface SessionSimilarityAnalyzerProps {
  /** Session correlation data for similarity analysis */
  readonly sessionCorrelation: SessionCorrelation;
  /** Display mode for similarity analysis */
  readonly mode?: 'patterns' | 'sessions' | 'solutions' | 'summary';
  /** Minimum similarity threshold for displaying results */
  readonly similarityThreshold?: number;
  /** Whether to show solution implementation guidance */
  readonly showImplementationSteps?: boolean;
  /** Callback for applying a suggested solution */
  readonly onApplySolution?: (solutionId: string) => Promise<void>;
  /** Callback for navigating to a similar session */
  readonly onNavigateToSession?: (sessionId: string) => void;
  /** Additional CSS classes */
  readonly className?: string;
}

const getPatternTypeIcon = (type: PatternMatch['type']) => {
  switch (type) {
    case 'workflow': return <TrendingUp className="h-4 w-4" />;
    case 'problem-solving': return <Lightbulb className="h-4 w-4" />;
    case 'code-pattern': return <Copy className="h-4 w-4" />;
    case 'decision-making': return <Search className="h-4 w-4" />;
    case 'collaboration': return <BookOpen className="h-4 w-4" />;
    default: return <Search className="h-4 w-4" />;
  }
};

const getPatternTypeColor = (type: PatternMatch['type']) => {
  switch (type) {
    case 'workflow': return 'org-text-info';
    case 'problem-solving': return 'org-text-warning';
    case 'code-pattern': return 'org-text-success';
    case 'decision-making': return 'org-text-primary';
    case 'collaboration': return 'org-text-secondary';
    default: return 'org-text-muted';
  }
};

const getConfidenceColor = (confidence: number) => {
  if (confidence >= 0.9) return 'org-text-success';
  if (confidence >= 0.7) return 'org-text-info';
  if (confidence >= 0.5) return 'org-text-warning';
  return 'org-text-error';
};

const getSimilarityColor = (similarity: number) => {
  if (similarity >= 0.8) return 'org-bg-success-light';
  if (similarity >= 0.6) return 'org-bg-info-light';
  if (similarity >= 0.4) return 'org-bg-warning-light';
  return 'org-bg-surface';
};

const PatternsView: React.FC<{
  analysis: SimilarityAnalysis;
  similarityThreshold: number;
}> = ({ analysis, similarityThreshold }) => {
  const [selectedType, setSelectedType] = useState<string>('all');

  const filteredPatterns = selectedType === 'all' ?
    analysis.identifiedPatterns :
    analysis.identifiedPatterns.filter(p => p.type === selectedType);

  const sortedPatterns = [...filteredPatterns].sort((a, b) => b.confidence - a.confidence);
  const patternTypes = [...new Set(analysis.identifiedPatterns.map(p => p.type))];

  return (
    <div className="org-similarity-patterns">
      <div className="flex items-center justify-between mb-4">
        <h4 className="org-text-lg org-font-semibold">Identified Patterns</h4>
        <select
          value={selectedType}
          onChange={(e) => setSelectedType(e.target.value)}
          className="org-select org-select-sm"
        >
          <option value="all">All Types</option>
          {patternTypes.map(type => (
            <option key={type} value={type}>
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-3">
        {sortedPatterns.map((pattern) => (
          <div key={pattern.id} className="org-card-inner">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-start space-x-3">
                <div className={getPatternTypeColor(pattern.type)}>
                  {getPatternTypeIcon(pattern.type)}
                </div>
                <div className="flex-1">
                  <div className="org-font-semibold mb-1">{pattern.pattern}</div>
                  <div className="org-text-sm org-text-muted mb-2">
                    {pattern.type.charAt(0).toUpperCase() + pattern.type.slice(1)} pattern
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className={`org-text-sm org-font-medium ${getConfidenceColor(pattern.confidence)}`}>
                  {Math.round(pattern.confidence * 100)}%
                </div>
                <div className="org-text-xs org-text-muted">confidence</div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 org-text-sm mb-3">
              <div>
                <div className="org-text-muted">Frequency</div>
                <div>{pattern.frequency} times</div>
              </div>
              <div>
                <div className="org-text-muted">Success Rate</div>
                <div className={getConfidenceColor(pattern.successRate)}>
                  {Math.round(pattern.successRate * 100)}%
                </div>
              </div>
              <div>
                <div className="org-text-muted">Avg Duration</div>
                <div>{Math.round(pattern.averageDuration / 60000)}m</div>
              </div>
            </div>

            {pattern.outcomes.length > 0 && (
              <div>
                <div className="org-text-sm org-font-medium mb-1">Typical Outcomes</div>
                <div className="flex flex-wrap gap-1">
                  {pattern.outcomes.map((outcome, index) => (
                    <span key={index} className="org-badge org-badge-secondary org-badge-xs">
                      {outcome}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {sortedPatterns.length === 0 && (
        <div className="org-empty-state">
          <Search className="h-8 w-8 org-text-muted mb-2" />
          <div className="org-text-muted">No patterns match the current filter</div>
        </div>
      )}
    </div>
  );
};

const SessionsView: React.FC<{
  analysis: SimilarityAnalysis;
  similarityThreshold: number;
  onNavigateToSession?: (sessionId: string) => void;
}> = ({ analysis, similarityThreshold, onNavigateToSession }) => {
  const filteredSessions = analysis.similarSessions.filter(s => s.similarity >= similarityThreshold);
  const sortedSessions = [...filteredSessions].sort((a, b) => b.similarity - a.similarity);

  return (
    <div className="org-similarity-sessions">
      <div className="flex items-center justify-between mb-4">
        <h4 className="org-text-lg org-font-semibold">Similar Sessions</h4>
        <div className="org-text-sm org-text-muted">
          {sortedSessions.length} sessions above {Math.round(similarityThreshold * 100)}% similarity
        </div>
      </div>

      <div className="space-y-3">
        {sortedSessions.map((session) => (
          <div
            key={session.sessionId}
            className={`org-card-inner ${getSimilarityColor(session.similarity)} ${
              onNavigateToSession ? 'cursor-pointer hover:shadow-md transition-shadow' : ''
            }`}
            onClick={() => onNavigateToSession?.(session.sessionId)}
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1">
                <div className="flex items-center space-x-2 mb-1">
                  <span className="org-font-semibold">{session.title}</span>
                  {onNavigateToSession && (
                    <ExternalLink className="h-4 w-4 org-text-muted" />
                  )}
                </div>
                <div className="org-text-sm org-text-muted mb-2">{session.summary}</div>
                <div className="flex items-center space-x-4 org-text-xs org-text-muted">
                  <span>Operator: {session.operatorId.slice(-8)}</span>
                  {session.teamId && <span>Team: {session.teamId}</span>}
                  <span>{new Date(session.timestamp).toLocaleDateString()}</span>
                  <span>Duration: {Math.round(session.duration / 60000)}m</span>
                </div>
              </div>
              <div className="text-right ml-4">
                <div className="org-text-lg org-font-semibold org-text-primary">
                  {Math.round(session.similarity * 100)}%
                </div>
                <div className="org-text-xs org-text-muted">similarity</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-3">
              <div>
                <div className="org-text-sm org-font-medium mb-1">Common Patterns</div>
                <div className="space-y-1">
                  {session.commonPatterns.slice(0, 2).map((pattern) => (
                    <div key={pattern.id} className="flex items-center space-x-2 org-text-xs">
                      <div className={getPatternTypeColor(pattern.type)}>
                        {getPatternTypeIcon(pattern.type)}
                      </div>
                      <span className="truncate">{pattern.pattern}</span>
                    </div>
                  ))}
                  {session.commonPatterns.length > 2 && (
                    <div className="org-text-xs org-text-muted">
                      +{session.commonPatterns.length - 2} more patterns
                    </div>
                  )}
                </div>
              </div>
              <div>
                <div className="org-text-sm org-font-medium mb-1">Reusability Score</div>
                <div className={`org-text-sm ${getConfidenceColor(session.reusabilityScore)}`}>
                  {Math.round(session.reusabilityScore * 100)}% reusable
                </div>
              </div>
            </div>

            {session.solutions.length > 0 && (
              <div>
                <div className="org-text-sm org-font-medium mb-1">Available Solutions</div>
                <div className="flex flex-wrap gap-1">
                  {session.solutions.slice(0, 3).map((solution, index) => (
                    <span key={index} className="org-badge org-badge-success org-badge-xs">
                      {solution}
                    </span>
                  ))}
                  {session.solutions.length > 3 && (
                    <span className="org-text-xs org-text-muted">
                      +{session.solutions.length - 3} more
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {sortedSessions.length === 0 && (
        <div className="org-empty-state">
          <Search className="h-8 w-8 org-text-muted mb-2" />
          <div className="org-text-muted">
            No sessions meet the {Math.round(similarityThreshold * 100)}% similarity threshold
          </div>
        </div>
      )}
    </div>
  );
};

const SolutionsView: React.FC<{
  analysis: SimilarityAnalysis;
  showImplementationSteps: boolean;
  onApplySolution?: (solutionId: string) => Promise<void>;
}> = ({ analysis, showImplementationSteps, onApplySolution }) => {
  const [applyingSolutions, setApplyingSolutions] = useState<Set<string>>(new Set());
  const [expandedSolutions, setExpandedSolutions] = useState<Set<string>>(new Set());

  const handleApplySolution = async (solutionId: string) => {
    if (!onApplySolution) return;

    setApplyingSolutions(prev => new Set([...prev, solutionId]));
    try {
      await onApplySolution(solutionId);
    } finally {
      setApplyingSolutions(prev => {
        const next = new Set(prev);
        next.delete(solutionId);
        return next;
      });
    }
  };

  const toggleSolutionDetails = (solutionId: string) => {
    setExpandedSolutions(prev => {
      const next = new Set(prev);
      if (next.has(solutionId)) {
        next.delete(solutionId);
      } else {
        next.add(solutionId);
      }
      return next;
    });
  };

  const sortedSolutions = [...analysis.solutionSuggestions].sort((a, b) =>
    b.confidence * b.applicability - a.confidence * a.applicability
  );

  return (
    <div className="org-similarity-solutions">
      <div className="flex items-center justify-between mb-4">
        <h4 className="org-text-lg org-font-semibold">Solution Suggestions</h4>
        <div className="org-text-sm org-text-muted">
          Potential savings: {analysis.potentialTimeSavings}min
        </div>
      </div>

      <div className="space-y-4">
        {sortedSolutions.map((solution) => {
          const isExpanded = expandedSolutions.has(solution.id);
          const isApplying = applyingSolutions.has(solution.id);
          const score = solution.confidence * solution.applicability;

          return (
            <div key={solution.id} className="org-card-inner">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-1">
                    <h5 className="org-font-semibold">{solution.title}</h5>
                    <span className={`org-badge org-badge-xs ${
                      solution.source === 'similar-session' ? 'org-badge-info' :
                      solution.source === 'pattern-analysis' ? 'org-badge-warning' :
                      solution.source === 'team-knowledge' ? 'org-badge-success' :
                      'org-badge-secondary'
                    }`}>
                      {solution.source.replace('-', ' ')}
                    </span>
                  </div>
                  <p className="org-text-sm org-text-muted mb-2">{solution.description}</p>
                  <div className="flex items-center space-x-4 org-text-xs org-text-muted">
                    <span>Confidence: {Math.round(solution.confidence * 100)}%</span>
                    <span>Applicability: {Math.round(solution.applicability * 100)}%</span>
                    <span>Time savings: {solution.estimatedTimesSaving}min</span>
                  </div>
                </div>
                <div className="text-right ml-4">
                  <div className={`org-text-lg org-font-semibold ${getConfidenceColor(score)}`}>
                    {Math.round(score * 100)}
                  </div>
                  <div className="org-text-xs org-text-muted">score</div>
                </div>
              </div>

              <div className="flex items-center space-x-2 mb-3">
                <button
                  onClick={() => toggleSolutionDetails(solution.id)}
                  className="org-button org-button-ghost org-button-sm"
                >
                  {isExpanded ? 'Hide Details' : 'Show Details'}
                </button>
                {onApplySolution && (
                  <button
                    onClick={() => handleApplySolution(solution.id)}
                    disabled={isApplying}
                    className="org-button org-button-primary org-button-sm"
                  >
                    {isApplying ? 'Applying...' : 'Apply Solution'}
                  </button>
                )}
              </div>

              {isExpanded && (
                <div className="pt-3 org-border-t space-y-3">
                  {solution.prerequisites.length > 0 && (
                    <div>
                      <div className="org-text-sm org-font-medium mb-1">Prerequisites</div>
                      <ul className="org-text-sm org-text-muted list-disc list-inside space-y-1">
                        {solution.prerequisites.map((prereq, index) => (
                          <li key={index}>{prereq}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {showImplementationSteps && solution.steps.length > 0 && (
                    <div>
                      <div className="org-text-sm org-font-medium mb-2">Implementation Steps</div>
                      <ol className="org-text-sm space-y-1">
                        {solution.steps.map((step, index) => (
                          <li key={index} className="flex items-start space-x-2">
                            <span className="org-text-primary org-font-semibold min-w-[1.5rem]">
                              {index + 1}.
                            </span>
                            <span className="org-text-muted">{step}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}

                  {solution.successExamples.length > 0 && (
                    <div>
                      <div className="org-text-sm org-font-medium mb-1">Success Examples</div>
                      <div className="space-y-1">
                        {solution.successExamples.map((example, index) => (
                          <div key={index} className="flex items-start space-x-2 org-text-sm">
                            <CheckCircle className="h-4 w-4 org-text-success flex-shrink-0 mt-0.5" />
                            <span className="org-text-muted">{example}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {solution.relatedSessions.length > 0 && (
                    <div>
                      <div className="org-text-sm org-font-medium mb-1">Related Sessions</div>
                      <div className="flex flex-wrap gap-1">
                        {solution.relatedSessions.map(sessionId => (
                          <span key={sessionId} className="org-badge org-badge-secondary org-badge-xs">
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

      {sortedSolutions.length === 0 && (
        <div className="org-empty-state">
          <Lightbulb className="h-8 w-8 org-text-muted mb-2" />
          <div className="org-text-muted">No solution suggestions available</div>
        </div>
      )}
    </div>
  );
};

const SummaryView: React.FC<{ analysis: SimilarityAnalysis }> = ({ analysis }) => (
  <div className="org-similarity-summary">
    <div className="grid grid-cols-4 gap-4 mb-6">
      <div className="org-stat-card">
        <div className="org-stat-value">{analysis.similarSessions.length}</div>
        <div className="org-stat-label">Similar Sessions</div>
      </div>
      <div className="org-stat-card">
        <div className="org-stat-value">{analysis.identifiedPatterns.length}</div>
        <div className="org-stat-label">Patterns Found</div>
      </div>
      <div className="org-stat-card">
        <div className="org-stat-value">{analysis.solutionSuggestions.length}</div>
        <div className="org-stat-label">Solutions</div>
      </div>
      <div className="org-stat-card">
        <div className={`org-stat-value ${getConfidenceColor(analysis.overallReusabilityScore)}`}>
          {Math.round(analysis.overallReusabilityScore * 100)}%
        </div>
        <div className="org-stat-label">Reusability</div>
      </div>
    </div>

    <div className="grid grid-cols-2 gap-6">
      <div className="org-card-inner">
        <h4 className="org-font-semibold mb-3">Top Pattern Types</h4>
        <div className="space-y-2">
          {Object.entries(
            analysis.identifiedPatterns.reduce((acc, pattern) => {
              acc[pattern.type] = (acc[pattern.type] || 0) + 1;
              return acc;
            }, {} as Record<string, number>)
          )
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5)
            .map(([type, count]) => (
              <div key={type} className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className={getPatternTypeColor(type as PatternMatch['type'])}>
                    {getPatternTypeIcon(type as PatternMatch['type'])}
                  </div>
                  <span className="org-font-medium capitalize">{type}</span>
                </div>
                <span className="org-text-muted">{count}</span>
              </div>
            ))
          }
        </div>
      </div>

      <div className="org-card-inner">
        <h4 className="org-font-semibold mb-3">Solution Sources</h4>
        <div className="space-y-2">
          {Object.entries(
            analysis.solutionSuggestions.reduce((acc, solution) => {
              acc[solution.source] = (acc[solution.source] || 0) + 1;
              return acc;
            }, {} as Record<string, number>)
          )
            .sort(([, a], [, b]) => b - a)
            .map(([source, count]) => (
              <div key={source} className="flex items-center justify-between">
                <span className="org-font-medium capitalize">{source.replace('-', ' ')}</span>
                <span className="org-text-muted">{count}</span>
              </div>
            ))
          }
        </div>
      </div>
    </div>

    <div className="mt-6 org-card-inner">
      <h4 className="org-font-semibold mb-3">Potential Impact</h4>
      <div className="grid grid-cols-3 gap-4 org-text-sm">
        <div>
          <div className="org-text-muted">Time Savings</div>
          <div className="org-font-semibold">{analysis.potentialTimeSavings} minutes</div>
        </div>
        <div>
          <div className="org-text-muted">High-Confidence Solutions</div>
          <div className="org-font-semibold">
            {analysis.solutionSuggestions.filter(s => s.confidence >= 0.8).length}
          </div>
        </div>
        <div>
          <div className="org-text-muted">Reusable Patterns</div>
          <div className="org-font-semibold">
            {analysis.identifiedPatterns.filter(p => p.successRate >= 0.7).length}
          </div>
        </div>
      </div>
    </div>
  </div>
);

export const SessionSimilarityAnalyzer: React.FC<SessionSimilarityAnalyzerProps> = ({
  sessionCorrelation,
  mode = 'summary',
  similarityThreshold = 0.6,
  showImplementationSteps = true,
  onApplySolution,
  onNavigateToSession,
  className = ''
}) => {
  const { teamFilter } = useOrganizationalContext();
  const [analysis, setAnalysis] = useState<SimilarityAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSimilarityAnalysis = async () => {
      try {
        setLoading(true);
        setError(null);

        // Generate mock similarity analysis data
        const patterns: PatternMatch[] = [
          {
            id: 'pattern-1',
            type: 'workflow',
            pattern: 'Debug → Test → Deploy sequence',
            confidence: 0.92,
            frequency: 15,
            lastSeen: Date.now() - 3600000,
            outcomes: ['Bug fixed', 'Feature deployed', 'Tests passed'],
            successRate: 0.87,
            averageDuration: 2700000 // 45 minutes
          },
          {
            id: 'pattern-2',
            type: 'problem-solving',
            pattern: 'Research similar issues → Apply known solution → Validate',
            confidence: 0.85,
            frequency: 8,
            lastSeen: Date.now() - 7200000,
            outcomes: ['Problem resolved', 'Knowledge gained'],
            successRate: 0.94,
            averageDuration: 1800000 // 30 minutes
          },
          {
            id: 'pattern-3',
            type: 'collaboration',
            pattern: 'Code review → Discussion → Iteration',
            confidence: 0.78,
            frequency: 12,
            lastSeen: Date.now() - 1800000,
            outcomes: ['Code improved', 'Knowledge shared'],
            successRate: 0.91,
            averageDuration: 1200000 // 20 minutes
          }
        ];

        const similarSessions: SimilarSession[] = sessionCorrelation.relatedSessions.slice(0, 4).map((sessionId, index) => ({
          sessionId,
          operatorId: `op-${sessionId.slice(-8)}`,
          teamId: sessionCorrelation.teamId,
          timestamp: sessionCorrelation.timestamp - (index + 1) * 86400000,
          duration: 1800000 + Math.random() * 3600000,
          title: `Similar Problem Resolution ${index + 1}`,
          summary: `Session focused on similar debugging and deployment patterns with ${Math.round(0.6 + index * 0.1)}% similarity.`,
          similarity: 0.9 - index * 0.15,
          commonPatterns: patterns.slice(0, 2 - index % 2),
          outcomes: ['Bug fixed', 'Tests improved', 'Documentation updated'].slice(0, 2 + index % 2),
          solutions: ['Configuration fix', 'Test improvement', 'Process optimization'].slice(0, 2 + index % 2),
          reusabilityScore: 0.8 - index * 0.1
        }));

        const solutions: SolutionSuggestion[] = [
          {
            id: 'solution-1',
            title: 'Apply debugging workflow pattern',
            description: 'Use the proven debug → test → deploy sequence that has shown 87% success rate',
            source: 'pattern-analysis',
            confidence: 0.92,
            applicability: 0.85,
            estimatedTimesSaving: 15,
            prerequisites: ['Access to test environment', 'Deployment permissions'],
            steps: [
              'Identify the specific bug or issue',
              'Write or update relevant tests',
              'Apply the fix with confidence',
              'Run comprehensive test suite',
              'Deploy to staging for validation',
              'Deploy to production with monitoring'
            ],
            successExamples: [
              'Fixed authentication bug using this pattern in 45 minutes',
              'Resolved API performance issue with minimal downtime'
            ],
            relatedSessions: sessionCorrelation.relatedSessions.slice(0, 2)
          },
          {
            id: 'solution-2',
            title: 'Leverage team knowledge base',
            description: 'Similar issue was solved by teammate with documented solution approach',
            source: 'team-knowledge',
            confidence: 0.88,
            applicability: 0.92,
            estimatedTimesSaving: 25,
            prerequisites: ['Access to team documentation', 'Collaboration tool access'],
            steps: [
              'Review team knowledge base for similar issues',
              'Adapt the documented solution to current context',
              'Validate the approach with original solver',
              'Apply the solution with monitoring',
              'Update documentation with any refinements'
            ],
            successExamples: [
              'Reused configuration pattern from similar project',
              'Applied team debugging checklist with success'
            ],
            relatedSessions: sessionCorrelation.relatedSessions.slice(1, 3)
          }
        ];

        setAnalysis({
          currentSessionId: sessionCorrelation.sessionId,
          similarSessions,
          identifiedPatterns: patterns,
          solutionSuggestions: solutions,
          overallReusabilityScore: 0.83,
          potentialTimeSavings: solutions.reduce((sum, s) => sum + s.estimatedTimesSaving, 0),
          analyzedAt: Date.now()
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to analyze session similarity');
      } finally {
        setLoading(false);
      }
    };

    fetchSimilarityAnalysis();
  }, [sessionCorrelation]);

  if (loading) {
    return (
      <div className={`org-similarity-analyzer org-loading ${className}`}>
        <div className="flex items-center space-x-2">
          <div className="org-spinner org-spinner-sm" />
          <span className="org-text-muted">Analyzing session similarities...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`org-similarity-analyzer org-error ${className}`}>
        <div className="org-error-message">
          <Search className="h-5 w-5 text-red-500" />
          <span>Failed to analyze similarities: {error}</span>
        </div>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className={`org-similarity-analyzer org-empty ${className}`}>
        <div className="org-empty-state">
          <Search className="h-8 w-8 org-text-muted mb-2" />
          <div className="org-text-muted">No similarity analysis available</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`org-similarity-analyzer org-analyzer-${mode} ${className}`}>
      {mode !== 'summary' && (
        <div className="flex items-center justify-between mb-4">
          <h3 className="org-text-lg org-font-semibold">Session Similarity Analysis</h3>
          <div className="org-text-sm org-text-muted">
            {Math.round(analysis.overallReusabilityScore * 100)}% reusability score
          </div>
        </div>
      )}

      {mode === 'patterns' && (
        <PatternsView analysis={analysis} similarityThreshold={similarityThreshold} />
      )}
      {mode === 'sessions' && (
        <SessionsView
          analysis={analysis}
          similarityThreshold={similarityThreshold}
          onNavigateToSession={onNavigateToSession}
        />
      )}
      {mode === 'solutions' && (
        <SolutionsView
          analysis={analysis}
          showImplementationSteps={showImplementationSteps}
          onApplySolution={onApplySolution}
        />
      )}
      {mode === 'summary' && <SummaryView analysis={analysis} />}
    </div>
  );
};

export default SessionSimilarityAnalyzer;