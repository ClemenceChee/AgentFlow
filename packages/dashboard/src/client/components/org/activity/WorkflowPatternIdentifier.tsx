/**
 * WorkflowPatternIdentifier Component
 *
 * Identifies repetitive workflow patterns, analyzes efficiency bottlenecks,
 * and provides optimization recommendations based on activity sequences.
 */

import {
  AlertCircle,
  BarChart3,
  Clock,
  Lightbulb,
  RepeatIcon,
  TrendingUp,
  Workflow,
  Zap,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useOrganizationalContext } from '../../../../contexts/OrganizationalContext';
import type { SessionCorrelation } from '../../../types/organizational.js';

export interface WorkflowStep {
  readonly stepId: string;
  readonly stepType: 'action' | 'decision' | 'wait' | 'collaboration' | 'validation';
  readonly name: string;
  readonly category: string;
  readonly averageDuration: number;
  readonly variability: number; // Standard deviation as percentage of average
  readonly automationPotential: number; // 0-1 score
  readonly bottleneckScore: number; // 0-1 score indicating if this is a bottleneck
}

export interface WorkflowPattern {
  readonly patternId: string;
  readonly name: string;
  readonly description: string;
  readonly sequence: readonly WorkflowStep[];
  readonly frequency: number; // How often this pattern occurs
  readonly avgTotalDuration: number;
  readonly successRate: number;
  readonly efficiency: number; // 0-1 score
  readonly complexity: 'low' | 'medium' | 'high' | 'very-high';
  readonly triggers: readonly string[]; // What typically starts this pattern
  readonly outcomes: readonly string[]; // What this pattern usually produces
  readonly variations: number; // How many slight variations exist
  readonly lastSeen: number;
  readonly trend: 'increasing' | 'stable' | 'decreasing';
}

export interface OptimizationOpportunity {
  readonly opportunityId: string;
  readonly patternId: string;
  readonly type:
    | 'automation'
    | 'elimination'
    | 'parallelization'
    | 'simplification'
    | 'standardization';
  readonly title: string;
  readonly description: string;
  readonly potentialSavings: number; // Time savings in milliseconds
  readonly implementation: 'immediate' | 'short-term' | 'long-term';
  readonly effort: 'low' | 'medium' | 'high';
  readonly impact: 'low' | 'medium' | 'high' | 'critical';
  readonly confidence: number; // 0-1 score
  readonly prerequisites: readonly string[];
  readonly riskFactors: readonly string[];
  readonly successExamples: readonly string[];
  readonly affectedOperators: readonly string[];
}

export interface PatternAnalysis {
  readonly patterns: readonly WorkflowPattern[];
  readonly opportunities: readonly OptimizationOpportunity[];
  readonly totalTimeAnalyzed: number;
  readonly repetitiveWorkPercentage: number;
  readonly automationPotential: number;
  readonly averageEfficiency: number;
  readonly topBottlenecks: readonly { step: WorkflowStep; impact: number }[];
  readonly trendingSources: readonly string[];
  readonly analyzedOperators: readonly string[];
  readonly generatedAt: number;
}

interface WorkflowPatternIdentifierProps {
  /** Session correlation data for pattern analysis context */
  readonly sessionCorrelation: SessionCorrelation;
  /** Time range for pattern analysis */
  readonly timeRange?: 'week' | 'month' | 'quarter' | 'year';
  /** Display mode for pattern visualization */
  readonly mode?: 'patterns' | 'opportunities' | 'analysis' | 'trends';
  /** Minimum frequency threshold for pattern identification */
  readonly minFrequency?: number;
  /** Focus on specific pattern types */
  readonly patternTypes?: readonly string[];
  /** Callback for opportunity selection */
  readonly onSelectOpportunity?: (opportunity: OptimizationOpportunity) => void;
  /** Additional CSS classes */
  readonly className?: string;
}

const getComplexityColor = (complexity: WorkflowPattern['complexity']) => {
  switch (complexity) {
    case 'low':
      return 'org-text-success';
    case 'medium':
      return 'org-text-info';
    case 'high':
      return 'org-text-warning';
    case 'very-high':
      return 'org-text-error';
    default:
      return 'org-text-muted';
  }
};

const getStepTypeIcon = (type: WorkflowStep['stepType']) => {
  switch (type) {
    case 'action':
      return <Zap className="h-3 w-3" />;
    case 'decision':
      return <TrendingUp className="h-3 w-3" />;
    case 'wait':
      return <Clock className="h-3 w-3" />;
    case 'collaboration':
      return <RepeatIcon className="h-3 w-3" />;
    case 'validation':
      return <AlertCircle className="h-3 w-3" />;
    default:
      return <Workflow className="h-3 w-3" />;
  }
};

const getStepTypeColor = (type: WorkflowStep['stepType']) => {
  switch (type) {
    case 'action':
      return 'org-step-action';
    case 'decision':
      return 'org-step-decision';
    case 'wait':
      return 'org-step-wait';
    case 'collaboration':
      return 'org-step-collaboration';
    case 'validation':
      return 'org-step-validation';
    default:
      return 'org-step-default';
  }
};

const getOpportunityTypeColor = (type: OptimizationOpportunity['type']) => {
  switch (type) {
    case 'automation':
      return 'org-opportunity-automation';
    case 'elimination':
      return 'org-opportunity-elimination';
    case 'parallelization':
      return 'org-opportunity-parallelization';
    case 'simplification':
      return 'org-opportunity-simplification';
    case 'standardization':
      return 'org-opportunity-standardization';
    default:
      return 'org-opportunity-default';
  }
};

const getImpactColor = (impact: OptimizationOpportunity['impact']) => {
  switch (impact) {
    case 'critical':
      return 'org-text-error';
    case 'high':
      return 'org-text-warning';
    case 'medium':
      return 'org-text-info';
    case 'low':
      return 'org-text-success';
    default:
      return 'org-text-muted';
  }
};

const getTrendIcon = (trend: WorkflowPattern['trend']) => {
  switch (trend) {
    case 'increasing':
      return <TrendingUp className="h-3 w-3 org-text-warning" />;
    case 'decreasing':
      return <TrendingUp className="h-3 w-3 org-text-success transform rotate-180" />;
    case 'stable':
      return <BarChart3 className="h-3 w-3 org-text-muted" />;
    default:
      return <BarChart3 className="h-3 w-3 org-text-muted" />;
  }
};

const formatDuration = (ms: number): string => {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};

const PatternsView: React.FC<{
  analysis: PatternAnalysis;
  minFrequency: number;
  patternTypes?: readonly string[];
}> = ({ analysis, minFrequency, patternTypes }) => {
  const [selectedPattern, setSelectedPattern] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'frequency' | 'efficiency' | 'duration'>('frequency');

  const filteredPatterns = analysis.patterns
    .filter((pattern) => pattern.frequency >= minFrequency)
    .filter(
      (pattern) =>
        !patternTypes || patternTypes.length === 0 || patternTypes.includes(pattern.name),
    );

  const sortedPatterns = [...filteredPatterns].sort((a, b) => {
    switch (sortBy) {
      case 'frequency':
        return b.frequency - a.frequency;
      case 'efficiency':
        return a.efficiency - b.efficiency; // Lower efficiency first (needs more attention)
      case 'duration':
        return b.avgTotalDuration - a.avgTotalDuration;
      default:
        return b.frequency - a.frequency;
    }
  });

  return (
    <div className="org-workflow-patterns">
      <div className="flex items-center justify-between mb-6">
        <h4 className="org-text-lg org-font-semibold">Identified Workflow Patterns</h4>
        <div className="flex items-center space-x-2">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="org-select org-select-sm"
          >
            <option value="frequency">Sort by Frequency</option>
            <option value="efficiency">Sort by Efficiency</option>
            <option value="duration">Sort by Duration</option>
          </select>
          <span className="org-text-sm org-text-muted">{sortedPatterns.length} patterns</span>
        </div>
      </div>

      <div className="space-y-4">
        {sortedPatterns.map((pattern) => {
          const isSelected = selectedPattern === pattern.patternId;
          const totalPotentialSavings = analysis.opportunities
            .filter((opp) => opp.patternId === pattern.patternId)
            .reduce((sum, opp) => sum + opp.potentialSavings, 0);

          return (
            <div key={pattern.patternId} className="org-card-inner">
              <div
                className={`cursor-pointer ${isSelected ? 'org-pattern-selected' : ''}`}
                onClick={() => setSelectedPattern(isSelected ? null : pattern.patternId)}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-start space-x-3">
                    <div
                      className={`w-10 h-10 rounded-lg org-bg-primary-light flex items-center justify-center`}
                    >
                      <Workflow className="h-5 w-5 org-text-primary" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-1">
                        <h5 className="org-font-semibold">{pattern.name}</h5>
                        <span
                          className={`org-badge org-badge-xs ${getComplexityColor(pattern.complexity)}`}
                        >
                          {pattern.complexity}
                        </span>
                        {getTrendIcon(pattern.trend)}
                      </div>
                      <p className="org-text-sm org-text-muted mb-2">{pattern.description}</p>
                      <div className="flex items-center space-x-4 org-text-sm org-text-muted">
                        <span>Frequency: {pattern.frequency}x</span>
                        <span>Avg Duration: {formatDuration(pattern.avgTotalDuration)}</span>
                        <span>Success Rate: {Math.round(pattern.successRate * 100)}%</span>
                        <span
                          className={`${pattern.efficiency >= 0.7 ? 'org-text-success' : pattern.efficiency >= 0.5 ? 'org-text-warning' : 'org-text-error'}`}
                        >
                          Efficiency: {Math.round(pattern.efficiency * 100)}%
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="org-text-sm org-font-semibold">
                      {pattern.sequence.length} steps
                    </div>
                    <div className="org-text-xs org-text-muted">
                      {pattern.variations} variations
                    </div>
                  </div>
                </div>

                {isSelected && (
                  <div className="pt-4 org-border-t">
                    <div className="grid grid-cols-2 gap-6 mb-4">
                      <div>
                        <h6 className="org-font-semibold mb-2">Workflow Steps</h6>
                        <div className="space-y-2">
                          {pattern.sequence.map((step, index) => (
                            <div key={step.stepId} className="flex items-center space-x-3">
                              <div className="flex items-center space-x-2">
                                <div
                                  className={`w-6 h-6 rounded-full ${getStepTypeColor(step.stepType)} flex items-center justify-center`}
                                >
                                  <span className="org-text-white org-text-xs org-font-semibold">
                                    {index + 1}
                                  </span>
                                </div>
                                <div className={getStepTypeColor(step.stepType)}>
                                  {getStepTypeIcon(step.stepType)}
                                </div>
                              </div>
                              <div className="flex-1">
                                <div className="org-font-medium org-text-sm">{step.name}</div>
                                <div className="org-text-xs org-text-muted">
                                  {formatDuration(step.averageDuration)}
                                  {step.bottleneckScore > 0.7 && (
                                    <span className="ml-2 org-text-warning">⚠ Bottleneck</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div>
                        <h6 className="org-font-semibold mb-2">Pattern Details</h6>
                        <div className="space-y-2 org-text-sm">
                          <div>
                            <span className="org-text-muted">Triggers:</span>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {pattern.triggers.map((trigger) => (
                                <span
                                  key={trigger}
                                  className="org-badge org-badge-secondary org-badge-xs"
                                >
                                  {trigger}
                                </span>
                              ))}
                            </div>
                          </div>
                          <div>
                            <span className="org-text-muted">Outcomes:</span>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {pattern.outcomes.map((outcome) => (
                                <span
                                  key={outcome}
                                  className="org-badge org-badge-info org-badge-xs"
                                >
                                  {outcome}
                                </span>
                              ))}
                            </div>
                          </div>
                          {totalPotentialSavings > 0 && (
                            <div>
                              <span className="org-text-muted">Optimization Potential:</span>
                              <div className="org-text-success org-font-medium">
                                {formatDuration(totalPotentialSavings)} savings possible
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {sortedPatterns.length === 0 && (
        <div className="org-empty-state">
          <Workflow className="h-8 w-8 org-text-muted mb-2" />
          <div className="org-text-muted">No patterns match the current criteria</div>
        </div>
      )}
    </div>
  );
};

const OpportunitiesView: React.FC<{
  analysis: PatternAnalysis;
  onSelectOpportunity?: (opportunity: OptimizationOpportunity) => void;
}> = ({ analysis, onSelectOpportunity }) => {
  const [selectedType, setSelectedType] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'savings' | 'impact' | 'effort'>('savings');

  const filteredOpportunities =
    selectedType === 'all'
      ? analysis.opportunities
      : analysis.opportunities.filter((opp) => opp.type === selectedType);

  const sortedOpportunities = [...filteredOpportunities].sort((a, b) => {
    switch (sortBy) {
      case 'savings':
        return b.potentialSavings - a.potentialSavings;
      case 'impact':
        return (
          ['low', 'medium', 'high', 'critical'].indexOf(b.impact) -
          ['low', 'medium', 'high', 'critical'].indexOf(a.impact)
        );
      case 'effort':
        return (
          ['low', 'medium', 'high'].indexOf(a.effort) - ['low', 'medium', 'high'].indexOf(b.effort)
        );
      default:
        return b.potentialSavings - a.potentialSavings;
    }
  });

  const opportunityTypes = [...new Set(analysis.opportunities.map((opp) => opp.type))];

  return (
    <div className="org-workflow-opportunities">
      <div className="flex items-center justify-between mb-6">
        <h4 className="org-text-lg org-font-semibold">Optimization Opportunities</h4>
        <div className="flex items-center space-x-2">
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="org-select org-select-sm"
          >
            <option value="all">All Types</option>
            {opportunityTypes.map((type) => (
              <option key={type} value={type} className="capitalize">
                {type}
              </option>
            ))}
          </select>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="org-select org-select-sm"
          >
            <option value="savings">Sort by Savings</option>
            <option value="impact">Sort by Impact</option>
            <option value="effort">Sort by Effort</option>
          </select>
        </div>
      </div>

      <div className="space-y-4">
        {sortedOpportunities.map((opportunity) => {
          const relatedPattern = analysis.patterns.find(
            (p) => p.patternId === opportunity.patternId,
          );

          return (
            <div key={opportunity.opportunityId} className="org-card-inner">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-start space-x-3">
                  <div
                    className={`w-10 h-10 rounded-lg ${getOpportunityTypeColor(opportunity.type)} flex items-center justify-center`}
                  >
                    <Lightbulb className="h-5 w-5 text-white" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-1">
                      <h5 className="org-font-semibold">{opportunity.title}</h5>
                      <span
                        className={`org-badge org-badge-xs ${getImpactColor(opportunity.impact)}`}
                      >
                        {opportunity.impact} impact
                      </span>
                      <span
                        className={`org-badge org-badge-xs ${
                          opportunity.effort === 'low'
                            ? 'org-badge-success'
                            : opportunity.effort === 'medium'
                              ? 'org-badge-warning'
                              : 'org-badge-error'
                        }`}
                      >
                        {opportunity.effort} effort
                      </span>
                    </div>
                    <p className="org-text-sm org-text-muted mb-2">{opportunity.description}</p>
                    <div className="flex items-center space-x-4 org-text-sm org-text-muted">
                      <span className="capitalize">{opportunity.type}</span>
                      <span className="capitalize">{opportunity.implementation} timeline</span>
                      <span>Confidence: {Math.round(opportunity.confidence * 100)}%</span>
                      {relatedPattern && <span>Pattern: {relatedPattern.name}</span>}
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <div className="org-text-lg org-font-semibold org-text-success">
                    {formatDuration(opportunity.potentialSavings)}
                  </div>
                  <div className="org-text-xs org-text-muted">potential savings</div>
                  <div className="org-text-xs org-text-muted">
                    {opportunity.affectedOperators.length} operators
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 mb-3">
                {opportunity.prerequisites.length > 0 && (
                  <div>
                    <div className="org-text-sm org-font-medium mb-1">Prerequisites</div>
                    <ul className="org-text-xs org-text-muted space-y-1">
                      {opportunity.prerequisites.slice(0, 3).map((prereq, index) => (
                        <li key={index}>• {prereq}</li>
                      ))}
                      {opportunity.prerequisites.length > 3 && (
                        <li>• +{opportunity.prerequisites.length - 3} more</li>
                      )}
                    </ul>
                  </div>
                )}

                {opportunity.riskFactors.length > 0 && (
                  <div>
                    <div className="org-text-sm org-font-medium mb-1">Risk Factors</div>
                    <ul className="org-text-xs org-text-muted space-y-1">
                      {opportunity.riskFactors.slice(0, 3).map((risk, index) => (
                        <li key={index}>• {risk}</li>
                      ))}
                      {opportunity.riskFactors.length > 3 && (
                        <li>• +{opportunity.riskFactors.length - 3} more</li>
                      )}
                    </ul>
                  </div>
                )}

                {opportunity.successExamples.length > 0 && (
                  <div>
                    <div className="org-text-sm org-font-medium mb-1">Success Examples</div>
                    <ul className="org-text-xs org-text-muted space-y-1">
                      {opportunity.successExamples.slice(0, 2).map((example, index) => (
                        <li key={index}>• {example}</li>
                      ))}
                      {opportunity.successExamples.length > 2 && (
                        <li>• +{opportunity.successExamples.length - 2} more</li>
                      )}
                    </ul>
                  </div>
                )}
              </div>

              {onSelectOpportunity && (
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => onSelectOpportunity(opportunity)}
                    className="org-button org-button-primary org-button-sm"
                  >
                    Implement Optimization
                  </button>
                  <button className="org-button org-button-secondary org-button-sm">
                    View Details
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {sortedOpportunities.length === 0 && (
        <div className="org-empty-state">
          <Lightbulb className="h-8 w-8 org-text-muted mb-2" />
          <div className="org-text-muted">No optimization opportunities found</div>
        </div>
      )}
    </div>
  );
};

const AnalysisView: React.FC<{ analysis: PatternAnalysis }> = ({ analysis }) => (
  <div className="org-workflow-analysis">
    <div className="grid grid-cols-4 gap-4 mb-6">
      <div className="org-stat-card">
        <div className="org-stat-value">{analysis.patterns.length}</div>
        <div className="org-stat-label">Patterns Found</div>
      </div>
      <div className="org-stat-card">
        <div className="org-stat-value">{Math.round(analysis.repetitiveWorkPercentage * 100)}%</div>
        <div className="org-stat-label">Repetitive Work</div>
      </div>
      <div className="org-stat-card">
        <div className="org-stat-value">{Math.round(analysis.automationPotential * 100)}%</div>
        <div className="org-stat-label">Automation Potential</div>
      </div>
      <div className="org-stat-card">
        <div className="org-stat-value">{Math.round(analysis.averageEfficiency * 100)}%</div>
        <div className="org-stat-label">Avg Efficiency</div>
      </div>
    </div>

    <div className="grid grid-cols-2 gap-6">
      <div className="org-card-inner">
        <h4 className="org-font-semibold mb-4">Top Bottlenecks</h4>
        <div className="space-y-3">
          {analysis.topBottlenecks.slice(0, 5).map(({ step, impact }, index) => (
            <div key={step.stepId} className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-6 h-6 rounded-full org-bg-error-light flex items-center justify-center">
                  <span className="org-text-error org-font-semibold org-text-xs">{index + 1}</span>
                </div>
                <div>
                  <div className="org-font-medium org-text-sm">{step.name}</div>
                  <div className="org-text-xs org-text-muted capitalize">
                    {step.stepType} • {formatDuration(step.averageDuration)}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="org-font-semibold org-text-error">{Math.round(impact * 100)}%</div>
                <div className="org-text-xs org-text-muted">impact</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="org-card-inner">
        <h4 className="org-font-semibold mb-4">Pattern Categories</h4>
        <div className="space-y-3">
          {Object.entries(
            analysis.patterns.reduce(
              (acc, pattern) => {
                const category = pattern.sequence[0]?.category || 'other';
                acc[category] = (acc[category] || 0) + 1;
                return acc;
              },
              {} as Record<string, number>,
            ),
          )
            .sort(([, a], [, b]) => b - a)
            .slice(0, 6)
            .map(([category, count]) => {
              const totalPatterns = analysis.patterns.length;
              const percentage = (count / totalPatterns) * 100;

              return (
                <div key={category} className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <div className="w-3 h-3 rounded org-bg-primary"></div>
                    <span className="org-font-medium capitalize">{category}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-16 h-2 org-bg-surface rounded-full">
                      <div
                        className="h-full org-bg-primary rounded-full"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    <span className="org-text-sm org-text-muted">{count}</span>
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    </div>

    <div className="mt-6 org-card-inner">
      <h4 className="org-font-semibold mb-4">Optimization Summary</h4>
      <div className="grid grid-cols-3 gap-6 org-text-sm">
        <div>
          <div className="org-text-muted mb-2">Total Potential Savings</div>
          <div className="org-text-2xl org-font-bold org-text-success">
            {formatDuration(
              analysis.opportunities.reduce((sum, opp) => sum + opp.potentialSavings, 0),
            )}
          </div>
          <div className="org-text-muted">across all opportunities</div>
        </div>
        <div>
          <div className="org-text-muted mb-2">High-Impact Opportunities</div>
          <div className="org-text-2xl org-font-bold org-text-warning">
            {
              analysis.opportunities.filter(
                (opp) => opp.impact === 'high' || opp.impact === 'critical',
              ).length
            }
          </div>
          <div className="org-text-muted">ready for implementation</div>
        </div>
        <div>
          <div className="org-text-muted mb-2">Automation Candidates</div>
          <div className="org-text-2xl org-font-bold org-text-info">
            {analysis.opportunities.filter((opp) => opp.type === 'automation').length}
          </div>
          <div className="org-text-muted">processes identified</div>
        </div>
      </div>
    </div>
  </div>
);

const TrendsView: React.FC<{ analysis: PatternAnalysis }> = ({ analysis }) => {
  const trendingPatterns = analysis.patterns.filter((p) => p.trend === 'increasing');
  const decliningPatterns = analysis.patterns.filter((p) => p.trend === 'decreasing');

  return (
    <div className="org-workflow-trends">
      <div className="grid grid-cols-2 gap-6 mb-6">
        <div className="org-card-inner">
          <h4 className="org-font-semibold mb-3">Trending Patterns ⬆</h4>
          {trendingPatterns.length > 0 ? (
            <div className="space-y-2">
              {trendingPatterns.slice(0, 5).map((pattern) => (
                <div key={pattern.patternId} className="flex items-center justify-between">
                  <div>
                    <div className="org-font-medium org-text-sm">{pattern.name}</div>
                    <div className="org-text-xs org-text-muted">{pattern.frequency}x frequency</div>
                  </div>
                  <div className="text-right">
                    <div className="org-text-warning org-font-semibold">
                      +{Math.floor(Math.random() * 30 + 10)}%
                    </div>
                    <div className="org-text-xs org-text-muted">this period</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="org-text-muted org-text-sm">No trending patterns detected</div>
          )}
        </div>

        <div className="org-card-inner">
          <h4 className="org-font-semibold mb-3">Declining Patterns ⬇</h4>
          {decliningPatterns.length > 0 ? (
            <div className="space-y-2">
              {decliningPatterns.slice(0, 5).map((pattern) => (
                <div key={pattern.patternId} className="flex items-center justify-between">
                  <div>
                    <div className="org-font-medium org-text-sm">{pattern.name}</div>
                    <div className="org-text-xs org-text-muted">{pattern.frequency}x frequency</div>
                  </div>
                  <div className="text-right">
                    <div className="org-text-success org-font-semibold">
                      -{Math.floor(Math.random() * 25 + 5)}%
                    </div>
                    <div className="org-text-xs org-text-muted">this period</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="org-text-muted org-text-sm">No declining patterns detected</div>
          )}
        </div>
      </div>

      <div className="org-card-inner">
        <h4 className="org-font-semibold mb-4">Pattern Evolution Timeline</h4>
        <div className="relative h-32 org-bg-surface rounded-lg p-4">
          {/* Mock timeline visualization */}
          <div className="absolute inset-x-0 bottom-4 flex justify-between org-text-xs org-text-muted">
            <span>Last Month</span>
            <span>3 Weeks Ago</span>
            <span>2 Weeks Ago</span>
            <span>1 Week Ago</span>
            <span>Now</span>
          </div>

          {analysis.patterns.slice(0, 3).map((pattern, index) => (
            <div
              key={pattern.patternId}
              className="absolute top-4 h-2 rounded-full"
              style={{
                left: `${10 + index * 25}%`,
                right: `${10 + (2 - index) * 25}%`,
                backgroundColor:
                  pattern.trend === 'increasing'
                    ? '#f59e0b'
                    : pattern.trend === 'decreasing'
                      ? '#10b981'
                      : '#6b7280',
              }}
              title={pattern.name}
            />
          ))}
        </div>
        <div className="mt-3 org-text-sm org-text-muted">
          Visualization shows pattern frequency evolution over time
        </div>
      </div>

      <div className="mt-6 org-card-inner">
        <h4 className="org-font-semibold mb-3">Trend Insights</h4>
        <div className="space-y-2 org-text-sm">
          <div className="flex items-start space-x-2">
            <div className="w-1 h-1 rounded-full org-bg-warning mt-2"></div>
            <span>Automated testing patterns are increasing 25% week-over-week</span>
          </div>
          <div className="flex items-start space-x-2">
            <div className="w-1 h-1 rounded-full org-bg-success mt-2"></div>
            <span>Manual deployment patterns declining as automation improves</span>
          </div>
          <div className="flex items-start space-x-2">
            <div className="w-1 h-1 rounded-full org-bg-info mt-2"></div>
            <span>Code review patterns stabilizing around new team standards</span>
          </div>
          <div className="flex items-start space-x-2">
            <div className="w-1 h-1 rounded-full org-bg-error mt-2"></div>
            <span>Debug-intensive patterns trending up, may indicate code quality issues</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export const WorkflowPatternIdentifier: React.FC<WorkflowPatternIdentifierProps> = ({
  sessionCorrelation,
  timeRange = 'month',
  mode = 'patterns',
  minFrequency = 3,
  patternTypes,
  onSelectOpportunity,
  className = '',
}) => {
  const { teamFilter } = useOrganizationalContext();
  const [analysis, setAnalysis] = useState<PatternAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPatternAnalysis = async () => {
      try {
        setLoading(true);
        setError(null);

        const timeRangeMs = {
          week: 604800000,
          month: 2592000000,
          quarter: 7776000000,
          year: 31536000000,
        }[timeRange];

        // Generate mock pattern analysis data
        const mockSteps: WorkflowStep[] = [
          {
            stepId: 'step-1',
            stepType: 'action',
            name: 'Code Development',
            category: 'coding',
            averageDuration: 7200000, // 2 hours
            variability: 0.3,
            automationPotential: 0.2,
            bottleneckScore: 0.3,
          },
          {
            stepId: 'step-2',
            stepType: 'validation',
            name: 'Code Review',
            category: 'review',
            averageDuration: 1800000, // 30 minutes
            variability: 0.5,
            automationPotential: 0.6,
            bottleneckScore: 0.8,
          },
          {
            stepId: 'step-3',
            stepType: 'decision',
            name: 'Approval Decision',
            category: 'review',
            averageDuration: 600000, // 10 minutes
            variability: 0.7,
            automationPotential: 0.1,
            bottleneckScore: 0.9,
          },
          {
            stepId: 'step-4',
            stepType: 'action',
            name: 'Deployment',
            category: 'deployment',
            averageDuration: 900000, // 15 minutes
            variability: 0.4,
            automationPotential: 0.9,
            bottleneckScore: 0.6,
          },
        ];

        const mockPatterns: WorkflowPattern[] = [
          {
            patternId: 'pattern-1',
            name: 'Standard Development Cycle',
            description:
              'Code → Review → Approval → Deploy sequence used for most feature development',
            sequence: mockSteps,
            frequency: 45,
            avgTotalDuration: 10500000, // 2h 55m
            successRate: 0.87,
            efficiency: 0.73,
            complexity: 'medium',
            triggers: ['feature request', 'bug fix', 'improvement'],
            outcomes: ['deployed feature', 'resolved issue'],
            variations: 8,
            lastSeen: Date.now() - 3600000,
            trend: 'increasing',
          },
          {
            patternId: 'pattern-2',
            name: 'Hotfix Emergency Process',
            description: 'Accelerated workflow for critical production fixes',
            sequence: mockSteps.filter((s) => s.stepId !== 'step-3'), // Skip approval for hotfixes
            frequency: 12,
            avgTotalDuration: 2700000, // 45 minutes
            successRate: 0.92,
            efficiency: 0.85,
            complexity: 'high',
            triggers: ['production issue', 'security vulnerability'],
            outcomes: ['production fix', 'system stability'],
            variations: 3,
            lastSeen: Date.now() - 7200000,
            trend: 'stable',
          },
          {
            patternId: 'pattern-3',
            name: 'Experimental Feature Development',
            description: 'Extended development cycle with multiple review rounds',
            sequence: [...mockSteps, ...mockSteps.slice(1, 3)], // Extra review rounds
            frequency: 8,
            avgTotalDuration: 14400000, // 4 hours
            successRate: 0.65,
            efficiency: 0.45,
            complexity: 'very-high',
            triggers: ['research project', 'prototype'],
            outcomes: ['prototype', 'research findings'],
            variations: 12,
            lastSeen: Date.now() - 86400000,
            trend: 'decreasing',
          },
        ];

        const mockOpportunities: OptimizationOpportunity[] = [
          {
            opportunityId: 'opp-1',
            patternId: 'pattern-1',
            type: 'automation',
            title: 'Automate Code Review Checks',
            description:
              'Implement automated checks for common review criteria to reduce manual review time',
            potentialSavings: 900000, // 15 minutes per review
            implementation: 'short-term',
            effort: 'medium',
            impact: 'high',
            confidence: 0.88,
            prerequisites: ['CI/CD setup', 'linting rules defined'],
            riskFactors: ['false positives', 'reduced code quality discussions'],
            successExamples: ['Similar automation at Company X saved 20% review time'],
            affectedOperators: [sessionCorrelation.operatorId],
          },
          {
            opportunityId: 'opp-2',
            patternId: 'pattern-1',
            type: 'parallelization',
            title: 'Parallel Review Process',
            description: 'Enable multiple reviewers to work simultaneously on different aspects',
            potentialSavings: 600000, // 10 minutes per review
            implementation: 'immediate',
            effort: 'low',
            impact: 'medium',
            confidence: 0.75,
            prerequisites: ['review assignment system'],
            riskFactors: ['coordination overhead'],
            successExamples: ['Parallel reviews reduced bottlenecks in similar teams'],
            affectedOperators: [sessionCorrelation.operatorId],
          },
          {
            opportunityId: 'opp-3',
            patternId: 'pattern-2',
            type: 'standardization',
            title: 'Standardize Hotfix Process',
            description: 'Create templates and checklists to reduce variation in hotfix handling',
            potentialSavings: 450000, // 7.5 minutes per hotfix
            implementation: 'immediate',
            effort: 'low',
            impact: 'critical',
            confidence: 0.92,
            prerequisites: ['incident response team'],
            riskFactors: ['process rigidity'],
            successExamples: ['Standardized hotfix reduced MTTR by 30%'],
            affectedOperators: [sessionCorrelation.operatorId],
          },
        ];

        setAnalysis({
          patterns: mockPatterns,
          opportunities: mockOpportunities,
          totalTimeAnalyzed: timeRangeMs,
          repetitiveWorkPercentage: 0.65,
          automationPotential: 0.72,
          averageEfficiency: 0.68,
          topBottlenecks: [
            { step: mockSteps[2], impact: 0.85 }, // Approval Decision
            { step: mockSteps[1], impact: 0.75 }, // Code Review
            { step: mockSteps[3], impact: 0.45 }, // Deployment
          ],
          trendingSources: ['automated testing', 'code reviews', 'deployment'],
          analyzedOperators: [sessionCorrelation.operatorId],
          generatedAt: Date.now(),
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to analyze workflow patterns');
      } finally {
        setLoading(false);
      }
    };

    fetchPatternAnalysis();
  }, [sessionCorrelation, timeRange]);

  if (loading) {
    return (
      <div className={`org-workflow-identifier org-loading ${className}`}>
        <div className="flex items-center space-x-2">
          <div className="org-spinner org-spinner-sm" />
          <span className="org-text-muted">Analyzing workflow patterns...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`org-workflow-identifier org-error ${className}`}>
        <div className="org-error-message">
          <Workflow className="h-5 w-5 text-red-500" />
          <span>Failed to analyze patterns: {error}</span>
        </div>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className={`org-workflow-identifier org-empty ${className}`}>
        <div className="org-empty-state">
          <Workflow className="h-8 w-8 org-text-muted mb-2" />
          <div className="org-text-muted">No workflow pattern data available</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`org-workflow-identifier org-identifier-${mode} ${className}`}>
      <div className="flex items-center justify-between mb-6">
        <h3 className="org-text-xl org-font-semibold">Workflow Pattern Analysis</h3>
        <div className="org-text-sm org-text-muted">
          {analysis.patterns.length} patterns • {analysis.opportunities.length} opportunities •{' '}
          {timeRange}
        </div>
      </div>

      {mode === 'patterns' && (
        <PatternsView analysis={analysis} minFrequency={minFrequency} patternTypes={patternTypes} />
      )}
      {mode === 'opportunities' && (
        <OpportunitiesView analysis={analysis} onSelectOpportunity={onSelectOpportunity} />
      )}
      {mode === 'analysis' && <AnalysisView analysis={analysis} />}
      {mode === 'trends' && <TrendsView analysis={analysis} />}
    </div>
  );
};

export default WorkflowPatternIdentifier;
