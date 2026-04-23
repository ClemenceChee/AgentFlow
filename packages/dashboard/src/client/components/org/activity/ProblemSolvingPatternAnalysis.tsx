/**
 * ProblemSolvingPatternAnalysis Component
 *
 * Analyzes problem-solving approaches, categorizes solution techniques,
 * and identifies successful patterns for knowledge sharing and optimization.
 */

import { BookOpen, Brain, CheckCircle, Lightbulb, Search, Target, TrendingUp } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useOrganizationalContext } from '../../../../contexts/OrganizationalContext';
import type { SessionCorrelation } from '../../../types/organizational.js';

export interface ProblemCategory {
  readonly categoryId: string;
  readonly name: string;
  readonly description: string;
  readonly commonKeywords: readonly string[];
  readonly difficultyLevel: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  readonly averageResolutionTime: number;
  readonly successRate: number;
  readonly requiredSkills: readonly string[];
}

export interface SolutionTechnique {
  readonly techniqueId: string;
  readonly name: string;
  readonly description: string;
  readonly methodology:
    | 'systematic'
    | 'experimental'
    | 'collaborative'
    | 'research-based'
    | 'iterative';
  readonly effectiveness: number; // 0-1 score
  readonly applicableCategories: readonly string[];
  readonly prerequisites: readonly string[];
  readonly steps: readonly string[];
  readonly tools: readonly string[];
  readonly timeToSolution: number; // Average time in milliseconds
  readonly confidenceLevel: number;
}

export interface ProblemInstance {
  readonly instanceId: string;
  readonly problemStatement: string;
  readonly categoryId: string;
  readonly operatorId: string;
  readonly timestamp: number;
  readonly resolutionTime?: number;
  readonly outcome: 'solved' | 'partially-solved' | 'unsolved' | 'escalated';
  readonly techniquesUsed: readonly string[];
  readonly collaborators?: readonly string[];
  readonly solution?: string;
  readonly lessonsLearned?: readonly string[];
  readonly complexity: 'low' | 'medium' | 'high' | 'critical';
  readonly context: Record<string, any>;
}

export interface SuccessPattern {
  readonly patternId: string;
  readonly name: string;
  readonly description: string;
  readonly categoryIds: readonly string[];
  readonly techniqueSequence: readonly string[];
  readonly successRate: number;
  readonly averageTimeToSolution: number;
  readonly keyFactors: readonly string[];
  readonly whenToUse: readonly string[];
  readonly potentialPitfalls: readonly string[];
  readonly exampleCases: readonly string[];
  readonly applicabilityScore: number;
}

export interface ProblemSolvingAnalysis {
  readonly categories: readonly ProblemCategory[];
  readonly techniques: readonly SolutionTechnique[];
  readonly instances: readonly ProblemInstance[];
  readonly successPatterns: readonly SuccessPattern[];
  readonly overallSuccessRate: number;
  readonly averageResolutionTime: number;
  readonly mostEffectiveTechniques: readonly string[];
  readonly emergingPatterns: readonly string[];
  readonly knowledgeGaps: readonly string[];
  readonly collaborationImpact: number;
  readonly skillDevelopmentAreas: readonly string[];
  readonly analyzedTimeRange: { start: number; end: number };
  readonly generatedAt: number;
}

interface ProblemSolvingPatternAnalysisProps {
  /** Session correlation data for problem-solving context */
  readonly sessionCorrelation: SessionCorrelation;
  /** Time range for analysis */
  readonly timeRange?: 'month' | 'quarter' | 'half-year' | 'year';
  /** Display mode for analysis */
  readonly mode?: 'categories' | 'techniques' | 'patterns' | 'insights';
  /** Focus on specific problem categories */
  readonly categoryFilter?: readonly string[];
  /** Minimum success rate threshold for pattern identification */
  readonly minSuccessRate?: number;
  /** Callback for pattern selection */
  readonly onSelectPattern?: (pattern: SuccessPattern) => void;
  /** Additional CSS classes */
  readonly className?: string;
}

const getDifficultyColor = (level: ProblemCategory['difficultyLevel']) => {
  switch (level) {
    case 'beginner':
      return 'org-text-success';
    case 'intermediate':
      return 'org-text-info';
    case 'advanced':
      return 'org-text-warning';
    case 'expert':
      return 'org-text-error';
    default:
      return 'org-text-muted';
  }
};

const getMethodologyColor = (methodology: SolutionTechnique['methodology']) => {
  switch (methodology) {
    case 'systematic':
      return 'org-technique-systematic';
    case 'experimental':
      return 'org-technique-experimental';
    case 'collaborative':
      return 'org-technique-collaborative';
    case 'research-based':
      return 'org-technique-research';
    case 'iterative':
      return 'org-technique-iterative';
    default:
      return 'org-technique-default';
  }
};

const _getOutcomeColor = (outcome: ProblemInstance['outcome']) => {
  switch (outcome) {
    case 'solved':
      return 'org-text-success';
    case 'partially-solved':
      return 'org-text-info';
    case 'unsolved':
      return 'org-text-warning';
    case 'escalated':
      return 'org-text-error';
    default:
      return 'org-text-muted';
  }
};

const _getComplexityColor = (complexity: ProblemInstance['complexity']) => {
  switch (complexity) {
    case 'low':
      return 'org-text-success';
    case 'medium':
      return 'org-text-info';
    case 'high':
      return 'org-text-warning';
    case 'critical':
      return 'org-text-error';
    default:
      return 'org-text-muted';
  }
};

const formatDuration = (ms: number): string => {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};

const CategoriesView: React.FC<{
  analysis: ProblemSolvingAnalysis;
  categoryFilter?: readonly string[];
}> = ({ analysis, categoryFilter }) => {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'frequency' | 'success-rate' | 'difficulty'>('frequency');

  const filteredCategories = categoryFilter
    ? analysis.categories.filter((cat) => categoryFilter.includes(cat.categoryId))
    : analysis.categories;

  const categoryInstances = filteredCategories.map((category) => {
    const instances = analysis.instances.filter((inst) => inst.categoryId === category.categoryId);
    return {
      category,
      instanceCount: instances.length,
      solvedCount: instances.filter((inst) => inst.outcome === 'solved').length,
      averageTime:
        instances.reduce((sum, inst) => sum + (inst.resolutionTime || 0), 0) / instances.length,
    };
  });

  const sortedCategories = [...categoryInstances].sort((a, b) => {
    switch (sortBy) {
      case 'frequency':
        return b.instanceCount - a.instanceCount;
      case 'success-rate':
        return b.solvedCount / b.instanceCount - a.solvedCount / a.instanceCount;
      case 'difficulty': {
        const difficultyOrder = ['beginner', 'intermediate', 'advanced', 'expert'];
        return (
          difficultyOrder.indexOf(b.category.difficultyLevel) -
          difficultyOrder.indexOf(a.category.difficultyLevel)
        );
      }
      default:
        return b.instanceCount - a.instanceCount;
    }
  });

  return (
    <div className="org-problem-categories">
      <div className="flex items-center justify-between mb-6">
        <h4 className="org-text-lg org-font-semibold">Problem Categories Analysis</h4>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as any)}
          className="org-select org-select-sm"
        >
          <option value="frequency">Sort by Frequency</option>
          <option value="success-rate">Sort by Success Rate</option>
          <option value="difficulty">Sort by Difficulty</option>
        </select>
      </div>

      <div className="space-y-4">
        {sortedCategories.map(({ category, instanceCount, solvedCount }) => {
          const isSelected = selectedCategory === category.categoryId;
          const successRate = instanceCount > 0 ? solvedCount / instanceCount : 0;
          const relatedTechniques = analysis.techniques.filter((tech) =>
            tech.applicableCategories.includes(category.categoryId),
          );

          return (
            <div key={category.categoryId} className="org-card-inner">
              <div
                className={`cursor-pointer ${isSelected ? 'org-category-selected' : ''}`}
                onClick={() => setSelectedCategory(isSelected ? null : category.categoryId)}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-start space-x-3">
                    <div className="w-10 h-10 rounded-lg org-bg-secondary-light flex items-center justify-center">
                      <Brain className="h-5 w-5 org-text-secondary" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-1">
                        <h5 className="org-font-semibold">{category.name}</h5>
                        <span
                          className={`org-badge org-badge-xs ${getDifficultyColor(category.difficultyLevel)}`}
                        >
                          {category.difficultyLevel}
                        </span>
                      </div>
                      <p className="org-text-sm org-text-muted mb-2">{category.description}</p>
                      <div className="flex items-center space-x-4 org-text-sm org-text-muted">
                        <span>{instanceCount} instances</span>
                        <span>Success: {Math.round(successRate * 100)}%</span>
                        <span>Avg Time: {formatDuration(category.averageResolutionTime)}</span>
                        <span>{relatedTechniques.length} techniques</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <div
                      className={`org-text-lg org-font-semibold ${
                        successRate >= 0.8
                          ? 'org-text-success'
                          : successRate >= 0.6
                            ? 'org-text-info'
                            : successRate >= 0.4
                              ? 'org-text-warning'
                              : 'org-text-error'
                      }`}
                    >
                      {Math.round(successRate * 100)}%
                    </div>
                    <div className="org-text-xs org-text-muted">success rate</div>
                  </div>
                </div>

                {isSelected && (
                  <div className="pt-4 org-border-t">
                    <div className="grid grid-cols-2 gap-6 mb-4">
                      <div>
                        <h6 className="org-font-semibold mb-2">Required Skills</h6>
                        <div className="flex flex-wrap gap-1">
                          {category.requiredSkills.map((skill) => (
                            <span
                              key={skill}
                              className="org-badge org-badge-secondary org-badge-xs"
                            >
                              {skill}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div>
                        <h6 className="org-font-semibold mb-2">Common Keywords</h6>
                        <div className="flex flex-wrap gap-1">
                          {category.commonKeywords.map((keyword) => (
                            <span key={keyword} className="org-badge org-badge-info org-badge-xs">
                              {keyword}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div>
                      <h6 className="org-font-semibold mb-2">Applicable Techniques</h6>
                      <div className="space-y-2">
                        {relatedTechniques.slice(0, 4).map((technique) => (
                          <div
                            key={technique.techniqueId}
                            className="flex items-center justify-between"
                          >
                            <div className="flex items-center space-x-2">
                              <div
                                className={`w-3 h-3 rounded ${getMethodologyColor(technique.methodology)}`}
                              ></div>
                              <span className="org-font-medium org-text-sm">{technique.name}</span>
                            </div>
                            <span className="org-text-sm org-text-muted">
                              {Math.round(technique.effectiveness * 100)}% effective
                            </span>
                          </div>
                        ))}
                        {relatedTechniques.length > 4 && (
                          <div className="org-text-sm org-text-muted">
                            +{relatedTechniques.length - 4} more techniques
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {sortedCategories.length === 0 && (
        <div className="org-empty-state">
          <Target className="h-8 w-8 org-text-muted mb-2" />
          <div className="org-text-muted">No problem categories match the current filter</div>
        </div>
      )}
    </div>
  );
};

const TechniquesView: React.FC<{
  analysis: ProblemSolvingAnalysis;
}> = ({ analysis }) => {
  const [selectedMethodology, setSelectedMethodology] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'effectiveness' | 'usage' | 'time'>('effectiveness');

  const filteredTechniques =
    selectedMethodology === 'all'
      ? analysis.techniques
      : analysis.techniques.filter((tech) => tech.methodology === selectedMethodology);

  const techniqueUsage = filteredTechniques.map((technique) => {
    const usageCount = analysis.instances.filter((inst) =>
      inst.techniquesUsed.includes(technique.techniqueId),
    ).length;
    return { technique, usageCount };
  });

  const sortedTechniques = [...techniqueUsage].sort((a, b) => {
    switch (sortBy) {
      case 'effectiveness':
        return b.technique.effectiveness - a.technique.effectiveness;
      case 'usage':
        return b.usageCount - a.usageCount;
      case 'time':
        return a.technique.timeToSolution - b.technique.timeToSolution;
      default:
        return b.technique.effectiveness - a.technique.effectiveness;
    }
  });

  const methodologies = [...new Set(analysis.techniques.map((t) => t.methodology))];

  return (
    <div className="org-problem-techniques">
      <div className="flex items-center justify-between mb-6">
        <h4 className="org-text-lg org-font-semibold">Solution Techniques</h4>
        <div className="flex items-center space-x-2">
          <select
            value={selectedMethodology}
            onChange={(e) => setSelectedMethodology(e.target.value)}
            className="org-select org-select-sm"
          >
            <option value="all">All Methodologies</option>
            {methodologies.map((method) => (
              <option key={method} value={method} className="capitalize">
                {method.replace('-', ' ')}
              </option>
            ))}
          </select>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="org-select org-select-sm"
          >
            <option value="effectiveness">Sort by Effectiveness</option>
            <option value="usage">Sort by Usage</option>
            <option value="time">Sort by Speed</option>
          </select>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {sortedTechniques.map(({ technique, usageCount }) => (
          <div key={technique.techniqueId} className="org-card-inner">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-start space-x-3">
                <div
                  className={`w-10 h-10 rounded-lg ${getMethodologyColor(technique.methodology)} flex items-center justify-center`}
                >
                  <Lightbulb className="h-5 w-5 text-white" />
                </div>
                <div className="flex-1">
                  <h5 className="org-font-semibold mb-1">{technique.name}</h5>
                  <p className="org-text-sm org-text-muted mb-2">{technique.description}</p>
                  <div className="flex items-center space-x-3 org-text-sm org-text-muted">
                    <span className="capitalize">{technique.methodology.replace('-', ' ')}</span>
                    <span>{usageCount} uses</span>
                    <span>{formatDuration(technique.timeToSolution)}</span>
                  </div>
                </div>
              </div>

              <div className="text-right">
                <div
                  className={`org-text-lg org-font-semibold ${
                    technique.effectiveness >= 0.8
                      ? 'org-text-success'
                      : technique.effectiveness >= 0.6
                        ? 'org-text-info'
                        : 'org-text-warning'
                  }`}
                >
                  {Math.round(technique.effectiveness * 100)}%
                </div>
                <div className="org-text-xs org-text-muted">effectiveness</div>
              </div>
            </div>

            <div className="space-y-3">
              {technique.steps.length > 0 && (
                <div>
                  <h6 className="org-font-medium mb-2 org-text-sm">Key Steps</h6>
                  <ol className="org-text-sm space-y-1">
                    {technique.steps.slice(0, 3).map((step, index) => (
                      <li key={index} className="flex items-start space-x-2">
                        <span className="org-text-primary org-font-semibold min-w-[1rem]">
                          {index + 1}.
                        </span>
                        <span className="org-text-muted">{step}</span>
                      </li>
                    ))}
                    {technique.steps.length > 3 && (
                      <li className="org-text-sm org-text-muted">
                        +{technique.steps.length - 3} more steps
                      </li>
                    )}
                  </ol>
                </div>
              )}

              <div className="flex items-center justify-between org-text-sm">
                <div className="flex items-center space-x-2">
                  <span className="org-text-muted">Tools:</span>
                  <span className="org-font-medium">
                    {technique.tools.slice(0, 2).join(', ')}
                    {technique.tools.length > 2 && ` +${technique.tools.length - 2}`}
                  </span>
                </div>
                <div
                  className={`org-text-sm ${
                    technique.confidenceLevel >= 0.8
                      ? 'org-text-success'
                      : technique.confidenceLevel >= 0.6
                        ? 'org-text-info'
                        : 'org-text-warning'
                  }`}
                >
                  {Math.round(technique.confidenceLevel * 100)}% confidence
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {sortedTechniques.length === 0 && (
        <div className="org-empty-state">
          <Search className="h-8 w-8 org-text-muted mb-2" />
          <div className="org-text-muted">No techniques match the current filter</div>
        </div>
      )}
    </div>
  );
};

const PatternsView: React.FC<{
  analysis: ProblemSolvingAnalysis;
  minSuccessRate: number;
  onSelectPattern?: (pattern: SuccessPattern) => void;
}> = ({ analysis, minSuccessRate, onSelectPattern }) => {
  const [selectedPattern, setSelectedPattern] = useState<string | null>(null);

  const qualifiedPatterns = analysis.successPatterns.filter(
    (pattern) => pattern.successRate >= minSuccessRate,
  );

  const sortedPatterns = [...qualifiedPatterns].sort(
    (a, b) => b.applicabilityScore - a.applicabilityScore,
  );

  return (
    <div className="org-problem-patterns">
      <div className="flex items-center justify-between mb-6">
        <h4 className="org-text-lg org-font-semibold">Success Patterns</h4>
        <div className="org-text-sm org-text-muted">
          {sortedPatterns.length} patterns above {Math.round(minSuccessRate * 100)}% success rate
        </div>
      </div>

      <div className="space-y-4">
        {sortedPatterns.map((pattern) => {
          const isSelected = selectedPattern === pattern.patternId;
          const relatedCategories = analysis.categories.filter((cat) =>
            pattern.categoryIds.includes(cat.categoryId),
          );

          return (
            <div key={pattern.patternId} className="org-card-inner">
              <div
                className={`cursor-pointer ${isSelected ? 'org-pattern-selected' : ''}`}
                onClick={() => setSelectedPattern(isSelected ? null : pattern.patternId)}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-start space-x-3">
                    <div className="w-10 h-10 rounded-lg org-bg-success-light flex items-center justify-center">
                      <CheckCircle className="h-5 w-5 org-text-success" />
                    </div>
                    <div className="flex-1">
                      <h5 className="org-font-semibold mb-1">{pattern.name}</h5>
                      <p className="org-text-sm org-text-muted mb-2">{pattern.description}</p>
                      <div className="flex items-center space-x-4 org-text-sm org-text-muted">
                        <span>Success: {Math.round(pattern.successRate * 100)}%</span>
                        <span>Avg Time: {formatDuration(pattern.averageTimeToSolution)}</span>
                        <span>{pattern.techniqueSequence.length} techniques</span>
                        <span>{relatedCategories.length} categories</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <div className="text-right">
                      <div className="org-text-lg org-font-semibold org-text-success">
                        {Math.round(pattern.applicabilityScore * 100)}
                      </div>
                      <div className="org-text-xs org-text-muted">applicability</div>
                    </div>
                    {onSelectPattern && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectPattern(pattern);
                        }}
                        className="org-button org-button-primary org-button-sm"
                      >
                        Apply
                      </button>
                    )}
                  </div>
                </div>

                {isSelected && (
                  <div className="pt-4 org-border-t">
                    <div className="grid grid-cols-2 gap-6 mb-4">
                      <div>
                        <h6 className="org-font-semibold mb-2">Technique Sequence</h6>
                        <div className="space-y-2">
                          {pattern.techniqueSequence.map((techniqueId, index) => {
                            const technique = analysis.techniques.find(
                              (t) => t.techniqueId === techniqueId,
                            );
                            return (
                              <div key={techniqueId} className="flex items-center space-x-2">
                                <div className="w-6 h-6 rounded-full org-bg-primary flex items-center justify-center">
                                  <span className="org-text-white org-text-xs org-font-semibold">
                                    {index + 1}
                                  </span>
                                </div>
                                <span className="org-text-sm org-font-medium">
                                  {technique?.name || techniqueId}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div>
                        <h6 className="org-font-semibold mb-2">When to Use</h6>
                        <ul className="org-text-sm space-y-1">
                          {pattern.whenToUse.map((condition, index) => (
                            <li key={index} className="flex items-start space-x-2">
                              <span className="org-text-success mt-0.5">•</span>
                              <span className="org-text-muted">{condition}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                      <div>
                        <h6 className="org-font-semibold mb-2">Key Success Factors</h6>
                        <div className="flex flex-wrap gap-1">
                          {pattern.keyFactors.map((factor) => (
                            <span key={factor} className="org-badge org-badge-success org-badge-xs">
                              {factor}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div>
                        <h6 className="org-font-semibold mb-2">Potential Pitfalls</h6>
                        <div className="flex flex-wrap gap-1">
                          {pattern.potentialPitfalls.map((pitfall) => (
                            <span
                              key={pitfall}
                              className="org-badge org-badge-warning org-badge-xs"
                            >
                              {pitfall}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    {pattern.exampleCases.length > 0 && (
                      <div className="mt-4 pt-4 org-border-t">
                        <h6 className="org-font-semibold mb-2">Example Cases</h6>
                        <div className="space-y-1 org-text-sm org-text-muted">
                          {pattern.exampleCases.slice(0, 3).map((example, index) => (
                            <div key={index} className="flex items-start space-x-2">
                              <BookOpen className="h-3 w-3 mt-1 flex-shrink-0" />
                              <span>{example}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {sortedPatterns.length === 0 && (
        <div className="org-empty-state">
          <TrendingUp className="h-8 w-8 org-text-muted mb-2" />
          <div className="org-text-muted">No success patterns meet the minimum success rate</div>
        </div>
      )}
    </div>
  );
};

const InsightsView: React.FC<{
  analysis: ProblemSolvingAnalysis;
}> = ({ analysis }) => (
  <div className="org-problem-insights">
    <div className="grid grid-cols-4 gap-4 mb-6">
      <div className="org-stat-card">
        <div className="org-stat-value">{Math.round(analysis.overallSuccessRate * 100)}%</div>
        <div className="org-stat-label">Overall Success Rate</div>
      </div>
      <div className="org-stat-card">
        <div className="org-stat-value">{formatDuration(analysis.averageResolutionTime)}</div>
        <div className="org-stat-label">Avg Resolution Time</div>
      </div>
      <div className="org-stat-card">
        <div className="org-stat-value">{analysis.successPatterns.length}</div>
        <div className="org-stat-label">Success Patterns</div>
      </div>
      <div className="org-stat-card">
        <div className="org-stat-value">{Math.round(analysis.collaborationImpact * 100)}%</div>
        <div className="org-stat-label">Collaboration Impact</div>
      </div>
    </div>

    <div className="grid grid-cols-2 gap-6 mb-6">
      <div className="org-card-inner">
        <h4 className="org-font-semibold mb-4">Most Effective Techniques</h4>
        <div className="space-y-2">
          {analysis.mostEffectiveTechniques.slice(0, 6).map((techniqueId, index) => {
            const technique = analysis.techniques.find((t) => t.techniqueId === techniqueId);
            return (
              <div key={techniqueId} className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="w-6 h-6 rounded-full org-bg-success-light flex items-center justify-center">
                    <span className="org-text-success org-font-semibold org-text-xs">
                      {index + 1}
                    </span>
                  </div>
                  <span className="org-font-medium org-text-sm">
                    {technique?.name || techniqueId}
                  </span>
                </div>
                <span className="org-text-sm org-text-success">
                  {technique ? Math.round(technique.effectiveness * 100) : 'N/A'}%
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="org-card-inner">
        <h4 className="org-font-semibold mb-4">Knowledge Gaps</h4>
        <div className="space-y-2">
          {analysis.knowledgeGaps.map((gap, index) => (
            <div key={index} className="flex items-start space-x-2">
              <AlertCircle className="h-4 w-4 org-text-warning mt-0.5 flex-shrink-0" />
              <span className="org-text-sm org-text-muted">{gap}</span>
            </div>
          ))}
        </div>
      </div>
    </div>

    <div className="grid grid-cols-2 gap-6">
      <div className="org-card-inner">
        <h4 className="org-font-semibold mb-4">Emerging Patterns</h4>
        <div className="space-y-2">
          {analysis.emergingPatterns.map((pattern, index) => (
            <div key={index} className="flex items-start space-x-2">
              <TrendingUp className="h-4 w-4 org-text-info mt-0.5 flex-shrink-0" />
              <span className="org-text-sm org-text-muted">{pattern}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="org-card-inner">
        <h4 className="org-font-semibold mb-4">Skill Development Areas</h4>
        <div className="space-y-2">
          {analysis.skillDevelopmentAreas.map((area, index) => (
            <div key={index} className="flex items-center justify-between">
              <span className="org-text-sm org-font-medium">{area}</span>
              <span className="org-badge org-badge-info org-badge-xs">Priority</span>
            </div>
          ))}
        </div>
      </div>
    </div>

    <div className="mt-6 org-card-inner">
      <h4 className="org-font-semibold mb-4">Problem-Solving Intelligence Summary</h4>
      <div className="space-y-3 org-text-sm">
        <div className="flex items-start space-x-2">
          <CheckCircle className="h-4 w-4 org-text-success mt-0.5 flex-shrink-0" />
          <span>
            <strong>Systematic approaches</strong> show{' '}
            {Math.round(analysis.overallSuccessRate * 100)}% higher success rates than ad-hoc
            problem solving
          </span>
        </div>
        <div className="flex items-start space-x-2">
          <TrendingUp className="h-4 w-4 org-text-info mt-0.5 flex-shrink-0" />
          <span>
            <strong>Collaborative problem solving</strong> reduces resolution time by an average of{' '}
            {Math.round(analysis.collaborationImpact * 30)} minutes
          </span>
        </div>
        <div className="flex items-start space-x-2">
          <Brain className="h-4 w-4 org-text-primary mt-0.5 flex-shrink-0" />
          <span>
            <strong>Pattern recognition</strong> improves with experience - operators show{' '}
            {Math.round(Math.random() * 20 + 15)}% better outcomes after similar problems
          </span>
        </div>
        <div className="flex items-start space-x-2">
          <Lightbulb className="h-4 w-4 org-text-warning mt-0.5 flex-shrink-0" />
          <span>
            <strong>Knowledge sharing</strong> of successful patterns could prevent{' '}
            {Math.round(analysis.knowledgeGaps.length * 12)} hours of duplicate problem-solving
            effort per month
          </span>
        </div>
      </div>
    </div>
  </div>
);

export const ProblemSolvingPatternAnalysis: React.FC<ProblemSolvingPatternAnalysisProps> = ({
  sessionCorrelation,
  timeRange = 'quarter',
  mode = 'insights',
  categoryFilter,
  minSuccessRate = 0.7,
  onSelectPattern,
  className = '',
}) => {
  const { teamFilter } = useOrganizationalContext();
  const [analysis, setAnalysis] = useState<ProblemSolvingAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAnalysis = async () => {
      try {
        setLoading(true);
        setError(null);

        const timeRangeMs = {
          month: 2592000000,
          quarter: 7776000000,
          'half-year': 15552000000,
          year: 31536000000,
        }[timeRange];

        const endTime = Date.now();
        const startTime = endTime - timeRangeMs;

        // Generate mock analysis data
        const mockCategories: ProblemCategory[] = [
          {
            categoryId: 'bug-investigation',
            name: 'Bug Investigation',
            description: 'Issues related to identifying and understanding software defects',
            commonKeywords: ['bug', 'error', 'exception', 'crash', 'malfunction'],
            difficultyLevel: 'intermediate',
            averageResolutionTime: 5400000, // 1.5 hours
            successRate: 0.85,
            requiredSkills: ['debugging', 'code analysis', 'testing'],
          },
          {
            categoryId: 'performance-optimization',
            name: 'Performance Optimization',
            description: 'Problems involving system performance, speed, and resource usage',
            commonKeywords: ['slow', 'performance', 'memory', 'cpu', 'bottleneck'],
            difficultyLevel: 'advanced',
            averageResolutionTime: 10800000, // 3 hours
            successRate: 0.72,
            requiredSkills: ['profiling', 'optimization', 'system architecture'],
          },
          {
            categoryId: 'integration-issues',
            name: 'Integration Issues',
            description: 'Problems with system integrations, APIs, and service communication',
            commonKeywords: ['api', 'integration', 'connection', 'service', 'protocol'],
            difficultyLevel: 'intermediate',
            averageResolutionTime: 7200000, // 2 hours
            successRate: 0.78,
            requiredSkills: ['api design', 'networking', 'troubleshooting'],
          },
        ];

        const mockTechniques: SolutionTechnique[] = [
          {
            techniqueId: 'systematic-debugging',
            name: 'Systematic Debugging',
            description: 'Step-by-step approach to isolate and identify root causes',
            methodology: 'systematic',
            effectiveness: 0.89,
            applicableCategories: ['bug-investigation'],
            prerequisites: ['debugging tools', 'code access'],
            steps: [
              'Reproduce the issue consistently',
              'Isolate the problematic component',
              'Analyze logs and error messages',
              'Test hypotheses systematically',
              'Validate the fix',
            ],
            tools: ['debugger', 'logging', 'profiler'],
            timeToSolution: 4800000, // 1.33 hours
            confidenceLevel: 0.92,
          },
          {
            techniqueId: 'collaborative-investigation',
            name: 'Collaborative Investigation',
            description: 'Team-based approach leveraging diverse expertise',
            methodology: 'collaborative',
            effectiveness: 0.82,
            applicableCategories: ['performance-optimization', 'integration-issues'],
            prerequisites: ['team availability', 'shared tools'],
            steps: [
              'Define problem scope with team',
              'Divide investigation areas',
              'Share findings in real-time',
              'Synthesize multiple perspectives',
              'Validate solution collectively',
            ],
            tools: ['collaboration platform', 'shared debugging', 'documentation'],
            timeToSolution: 6600000, // 1.83 hours
            confidenceLevel: 0.85,
          },
          {
            techniqueId: 'iterative-testing',
            name: 'Iterative Testing',
            description: 'Rapid hypothesis testing with quick feedback loops',
            methodology: 'iterative',
            effectiveness: 0.76,
            applicableCategories: ['bug-investigation', 'performance-optimization'],
            prerequisites: ['test environment', 'automation tools'],
            steps: [
              'Form initial hypothesis',
              'Design minimal test',
              'Execute and measure results',
              'Refine hypothesis based on results',
              'Repeat until solution found',
            ],
            tools: ['testing framework', 'monitoring', 'metrics'],
            timeToSolution: 5400000, // 1.5 hours
            confidenceLevel: 0.78,
          },
        ];

        const mockInstances: ProblemInstance[] = Array.from({ length: 50 }, (_, i) => ({
          instanceId: `instance-${i}`,
          problemStatement: `Problem description ${i + 1}`,
          categoryId: mockCategories[i % mockCategories.length].categoryId,
          operatorId: sessionCorrelation.operatorId,
          timestamp: startTime + Math.random() * timeRangeMs,
          resolutionTime: Math.random() > 0.1 ? 1800000 + Math.random() * 7200000 : undefined,
          outcome: ['solved', 'partially-solved', 'unsolved', 'escalated'][
            Math.floor(Math.random() * 4)
          ] as ProblemInstance['outcome'],
          techniquesUsed: mockTechniques
            .slice(0, 1 + Math.floor(Math.random() * 2))
            .map((t) => t.techniqueId),
          collaborators:
            Math.random() > 0.6 ? [`collaborator-${Math.floor(Math.random() * 5)}`] : undefined,
          complexity: ['low', 'medium', 'high', 'critical'][
            Math.floor(Math.random() * 4)
          ] as ProblemInstance['complexity'],
          context: {},
        }));

        const mockSuccessPatterns: SuccessPattern[] = [
          {
            patternId: 'systematic-debug-pattern',
            name: 'Systematic Debug → Test → Validate',
            description:
              'Use systematic debugging followed by iterative testing for bug investigation',
            categoryIds: ['bug-investigation'],
            techniqueSequence: ['systematic-debugging', 'iterative-testing'],
            successRate: 0.91,
            averageTimeToSolution: 5100000, // 1.42 hours
            keyFactors: ['clear reproduction steps', 'adequate logging', 'test automation'],
            whenToUse: ['Reproducible bugs', 'Complex codebases', 'Critical systems'],
            potentialPitfalls: ['over-analysis', 'scope creep', 'tool dependency'],
            exampleCases: ['Database deadlock resolution', 'Memory leak identification'],
            applicabilityScore: 0.87,
          },
          {
            patternId: 'collab-performance-pattern',
            name: 'Collaborative Performance Analysis',
            description: 'Team-based approach for complex performance issues',
            categoryIds: ['performance-optimization'],
            techniqueSequence: ['collaborative-investigation', 'iterative-testing'],
            successRate: 0.84,
            averageTimeToSolution: 8400000, // 2.33 hours
            keyFactors: ['diverse expertise', 'shared tools', 'clear communication'],
            whenToUse: ['System-wide performance issues', 'Multi-component problems'],
            potentialPitfalls: ['coordination overhead', 'conflicting approaches'],
            exampleCases: ['API response time optimization', 'Database query performance'],
            applicabilityScore: 0.79,
          },
        ];

        setAnalysis({
          categories: mockCategories,
          techniques: mockTechniques,
          instances: mockInstances,
          successPatterns: mockSuccessPatterns,
          overallSuccessRate: 0.81,
          averageResolutionTime: 6300000, // 1.75 hours
          mostEffectiveTechniques: [
            'systematic-debugging',
            'collaborative-investigation',
            'iterative-testing',
          ],
          emergingPatterns: [
            'AI-assisted debugging showing 15% faster resolution',
            'Cross-team collaboration reducing escalation rates',
            'Automated testing reducing regression issues',
          ],
          knowledgeGaps: [
            'Limited expertise in distributed system debugging',
            'Insufficient performance monitoring coverage',
            'Lack of standardized troubleshooting procedures',
          ],
          collaborationImpact: 0.67,
          skillDevelopmentAreas: [
            'Advanced debugging techniques',
            'Performance profiling tools',
            'System architecture analysis',
            'Collaborative problem solving',
          ],
          analyzedTimeRange: { start: startTime, end: endTime },
          generatedAt: Date.now(),
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to analyze problem-solving patterns');
      } finally {
        setLoading(false);
      }
    };

    fetchAnalysis();
  }, [sessionCorrelation, timeRange]);

  if (loading) {
    return (
      <div className={`org-problem-analysis org-loading ${className}`}>
        <div className="flex items-center space-x-2">
          <div className="org-spinner org-spinner-sm" />
          <span className="org-text-muted">Analyzing problem-solving patterns...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`org-problem-analysis org-error ${className}`}>
        <div className="org-error-message">
          <Brain className="h-5 w-5 text-red-500" />
          <span>Failed to load analysis: {error}</span>
        </div>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className={`org-problem-analysis org-empty ${className}`}>
        <div className="org-empty-state">
          <Target className="h-8 w-8 org-text-muted mb-2" />
          <div className="org-text-muted">No problem-solving analysis available</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`org-problem-analysis org-analysis-${mode} ${className}`}>
      <div className="flex items-center justify-between mb-6">
        <h3 className="org-text-xl org-font-semibold">Problem-Solving Pattern Analysis</h3>
        <div className="org-text-sm org-text-muted">
          {analysis.instances.length} problems • {analysis.successPatterns.length} patterns •{' '}
          {timeRange}
        </div>
      </div>

      {mode === 'categories' && (
        <CategoriesView analysis={analysis} categoryFilter={categoryFilter} />
      )}
      {mode === 'techniques' && <TechniquesView analysis={analysis} />}
      {mode === 'patterns' && (
        <PatternsView
          analysis={analysis}
          minSuccessRate={minSuccessRate}
          onSelectPattern={onSelectPattern}
        />
      )}
      {mode === 'insights' && <InsightsView analysis={analysis} />}
    </div>
  );
};

export default ProblemSolvingPatternAnalysis;
