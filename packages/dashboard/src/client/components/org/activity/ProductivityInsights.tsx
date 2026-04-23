/**
 * ProductivityInsights Component
 *
 * Provides comprehensive productivity analysis with metrics, trends,
 * actionable recommendations, and comparative benchmarking.
 */

import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  BarChart3,
  CheckCircle,
  Target,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useOrganizationalContext } from '../../../../contexts/OrganizationalContext';
import type { SessionCorrelation } from '../../../types/organizational.js';

export interface ProductivityMetric {
  readonly metricId: string;
  readonly name: string;
  readonly category: 'output' | 'efficiency' | 'quality' | 'collaboration' | 'learning';
  readonly value: number;
  readonly unit: 'count' | 'percentage' | 'hours' | 'score' | 'ratio';
  readonly trend: 'increasing' | 'decreasing' | 'stable';
  readonly trendPercentage: number;
  readonly benchmark?: number; // Industry/team benchmark
  readonly target?: number; // Personal/team target
  readonly description: string;
  readonly calculationPeriod: 'daily' | 'weekly' | 'monthly';
}

export interface ProductivityInsight {
  readonly insightId: string;
  readonly type: 'opportunity' | 'strength' | 'concern' | 'trend';
  readonly title: string;
  readonly description: string;
  readonly impact: 'low' | 'medium' | 'high' | 'critical';
  readonly confidence: number; // 0-1 score
  readonly relatedMetrics: readonly string[];
  readonly evidenceData: readonly string[];
  readonly actionable: boolean;
}

export interface ProductivityRecommendation {
  readonly recommendationId: string;
  readonly title: string;
  readonly description: string;
  readonly category:
    | 'time-management'
    | 'tool-optimization'
    | 'workflow-improvement'
    | 'skill-development'
    | 'collaboration';
  readonly priority: 'low' | 'medium' | 'high' | 'urgent';
  readonly effort: 'minimal' | 'low' | 'medium' | 'high';
  readonly timeline: 'immediate' | 'short-term' | 'medium-term' | 'long-term';
  readonly expectedImpact: string;
  readonly specificActions: readonly string[];
  readonly successMetrics: readonly string[];
  readonly dependencies?: readonly string[];
  readonly estimatedTimeInvestment: number; // Hours
  readonly potentialProductivityGain: number; // Percentage
}

export interface BenchmarkComparison {
  readonly comparisonType:
    | 'team-average'
    | 'industry-standard'
    | 'top-performer'
    | 'historical-self';
  readonly metrics: Record<
    string,
    {
      userValue: number;
      benchmarkValue: number;
      percentile: number;
      gap: number;
    }
  >;
  readonly overallScore: number;
  readonly strengths: readonly string[];
  readonly improvementAreas: readonly string[];
}

export interface ProductivityAnalysis {
  readonly operatorId: string;
  readonly teamId?: string;
  readonly analysisTimeRange: { start: number; end: number };
  readonly metrics: readonly ProductivityMetric[];
  readonly insights: readonly ProductivityInsight[];
  readonly recommendations: readonly ProductivityRecommendation[];
  readonly benchmarkComparisons: readonly BenchmarkComparison[];
  readonly overallProductivityScore: number;
  readonly productivityTrend: 'improving' | 'stable' | 'declining';
  readonly focusAreas: readonly string[];
  readonly strengths: readonly string[];
  readonly nextReviewDate: number;
  readonly generatedAt: number;
}

interface ProductivityInsightsProps {
  /** Session correlation data for productivity context */
  readonly sessionCorrelation: SessionCorrelation;
  /** Time range for productivity analysis */
  readonly timeRange?: 'week' | 'month' | 'quarter' | 'half-year';
  /** Display mode for insights */
  readonly mode?: 'overview' | 'metrics' | 'recommendations' | 'benchmarks';
  /** Focus on specific categories */
  readonly categoryFilter?: readonly string[];
  /** Include benchmarking data */
  readonly showBenchmarks?: boolean;
  /** Callback for recommendation action */
  readonly onActionRecommendation?: (recommendationId: string) => void;
  /** Additional CSS classes */
  readonly className?: string;
}

const getMetricTrendIcon = (trend: ProductivityMetric['trend'], trendPercentage: number) => {
  if (trend === 'increasing') {
    return (
      <ArrowUp
        className={`h-3 w-3 ${trendPercentage > 10 ? 'org-text-success' : 'org-text-info'}`}
      />
    );
  }
  if (trend === 'decreasing') {
    return (
      <ArrowDown
        className={`h-3 w-3 ${Math.abs(trendPercentage) > 10 ? 'org-text-error' : 'org-text-warning'}`}
      />
    );
  }
  return <div className="w-3 h-3 rounded-full org-bg-muted" />;
};

const getInsightTypeIcon = (type: ProductivityInsight['type']) => {
  switch (type) {
    case 'opportunity':
      return <Target className="h-4 w-4" />;
    case 'strength':
      return <CheckCircle className="h-4 w-4" />;
    case 'concern':
      return <AlertCircle className="h-4 w-4" />;
    case 'trend':
      return <TrendingUp className="h-4 w-4" />;
    default:
      return <BarChart3 className="h-4 w-4" />;
  }
};

const getInsightTypeColor = (type: ProductivityInsight['type']) => {
  switch (type) {
    case 'opportunity':
      return 'org-text-warning';
    case 'strength':
      return 'org-text-success';
    case 'concern':
      return 'org-text-error';
    case 'trend':
      return 'org-text-info';
    default:
      return 'org-text-muted';
  }
};

const getPriorityColor = (priority: ProductivityRecommendation['priority']) => {
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
      return 'org-badge-muted';
  }
};

const getEffortColor = (effort: ProductivityRecommendation['effort']) => {
  switch (effort) {
    case 'minimal':
      return 'org-text-success';
    case 'low':
      return 'org-text-info';
    case 'medium':
      return 'org-text-warning';
    case 'high':
      return 'org-text-error';
    default:
      return 'org-text-muted';
  }
};

const formatMetricValue = (value: number, unit: ProductivityMetric['unit']): string => {
  switch (unit) {
    case 'percentage':
      return `${Math.round(value * 100)}%`;
    case 'hours':
      return `${value.toFixed(1)}h`;
    case 'count':
      return Math.round(value).toString();
    case 'score':
      return `${Math.round(value * 100)}/100`;
    case 'ratio':
      return `${value.toFixed(2)}:1`;
    default:
      return value.toString();
  }
};

const OverviewView: React.FC<{
  analysis: ProductivityAnalysis;
}> = ({ analysis }) => {
  const keyMetrics = analysis.metrics
    .filter((m) => ['output', 'efficiency', 'quality'].includes(m.category))
    .slice(0, 6);

  const criticalInsights = analysis.insights
    .filter((i) => i.impact === 'high' || i.impact === 'critical')
    .slice(0, 4);

  const topRecommendations = analysis.recommendations
    .filter((r) => r.priority === 'high' || r.priority === 'urgent')
    .slice(0, 3);

  return (
    <div className="org-productivity-overview">
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="org-stat-card">
          <div
            className={`org-stat-value ${
              analysis.overallProductivityScore >= 80
                ? 'org-text-success'
                : analysis.overallProductivityScore >= 60
                  ? 'org-text-info'
                  : 'org-text-warning'
            }`}
          >
            {Math.round(analysis.overallProductivityScore)}
          </div>
          <div className="org-stat-label">Productivity Score</div>
          <div
            className={`org-text-xs ${
              analysis.productivityTrend === 'improving'
                ? 'org-text-success'
                : analysis.productivityTrend === 'declining'
                  ? 'org-text-error'
                  : 'org-text-muted'
            }`}
          >
            {analysis.productivityTrend}
          </div>
        </div>
        <div className="org-stat-card">
          <div className="org-stat-value">{analysis.insights.length}</div>
          <div className="org-stat-label">Insights Generated</div>
          <div className="org-text-xs org-text-muted">{criticalInsights.length} high impact</div>
        </div>
        <div className="org-stat-card">
          <div className="org-stat-value">{analysis.recommendations.length}</div>
          <div className="org-stat-label">Recommendations</div>
          <div className="org-text-xs org-text-muted">{topRecommendations.length} priority</div>
        </div>
        <div className="org-stat-card">
          <div className="org-stat-value">{analysis.focusAreas.length}</div>
          <div className="org-stat-label">Focus Areas</div>
          <div className="org-text-xs org-text-muted">for improvement</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 mb-6">
        <div className="org-card-inner">
          <h4 className="org-font-semibold mb-4">Key Metrics</h4>
          <div className="space-y-3">
            {keyMetrics.map((metric) => (
              <div key={metric.metricId} className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="flex items-center space-x-1">
                    {getMetricTrendIcon(metric.trend, metric.trendPercentage)}
                    <span className="org-font-medium org-text-sm">{metric.name}</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="org-font-semibold">
                    {formatMetricValue(metric.value, metric.unit)}
                  </div>
                  {metric.benchmark && (
                    <div
                      className={`org-text-xs ${
                        metric.value >= metric.benchmark ? 'org-text-success' : 'org-text-warning'
                      }`}
                    >
                      vs {formatMetricValue(metric.benchmark, metric.unit)} benchmark
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="org-card-inner">
          <h4 className="org-font-semibold mb-4">Strengths & Focus Areas</h4>
          <div className="space-y-4">
            <div>
              <h6 className="org-font-medium mb-2 org-text-success">Top Strengths</h6>
              <div className="space-y-1">
                {analysis.strengths.slice(0, 3).map((strength, index) => (
                  <div key={index} className="flex items-start space-x-2 org-text-sm">
                    <CheckCircle className="h-3 w-3 org-text-success mt-0.5 flex-shrink-0" />
                    <span className="org-text-muted">{strength}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h6 className="org-font-medium mb-2 org-text-warning">Focus Areas</h6>
              <div className="space-y-1">
                {analysis.focusAreas.slice(0, 3).map((area, index) => (
                  <div key={index} className="flex items-start space-x-2 org-text-sm">
                    <Target className="h-3 w-3 org-text-warning mt-0.5 flex-shrink-0" />
                    <span className="org-text-muted">{area}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="org-card-inner">
          <h4 className="org-font-semibold mb-4">Critical Insights</h4>
          <div className="space-y-3">
            {criticalInsights.map((insight) => (
              <div key={insight.insightId} className="flex items-start space-x-3">
                <div className={getInsightTypeColor(insight.type)}>
                  {getInsightTypeIcon(insight.type)}
                </div>
                <div className="flex-1">
                  <div className="org-font-medium org-text-sm mb-1">{insight.title}</div>
                  <p className="org-text-sm org-text-muted">{insight.description}</p>
                  <div className="flex items-center space-x-2 mt-1">
                    <span
                      className={`org-badge org-badge-xs ${
                        insight.impact === 'critical'
                          ? 'org-badge-error'
                          : insight.impact === 'high'
                            ? 'org-badge-warning'
                            : 'org-badge-info'
                      }`}
                    >
                      {insight.impact} impact
                    </span>
                    <span className="org-text-xs org-text-muted">
                      {Math.round(insight.confidence * 100)}% confidence
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="org-card-inner">
          <h4 className="org-font-semibold mb-4">Priority Recommendations</h4>
          <div className="space-y-3">
            {topRecommendations.map((recommendation) => (
              <div key={recommendation.recommendationId} className="org-card-inner org-card-sm">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-1">
                      <span className="org-font-medium org-text-sm">{recommendation.title}</span>
                      <span
                        className={`org-badge org-badge-xs ${getPriorityColor(recommendation.priority)}`}
                      >
                        {recommendation.priority}
                      </span>
                    </div>
                    <p className="org-text-sm org-text-muted">{recommendation.description}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between org-text-xs">
                  <span className={getEffortColor(recommendation.effort)}>
                    {recommendation.effort} effort
                  </span>
                  <span className="org-text-success">
                    +{recommendation.potentialProductivityGain}% potential gain
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const MetricsView: React.FC<{
  analysis: ProductivityAnalysis;
  categoryFilter?: readonly string[];
}> = ({ analysis, categoryFilter }) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const filteredMetrics =
    selectedCategory === 'all'
      ? analysis.metrics
      : analysis.metrics.filter((m) => m.category === selectedCategory);

  const displayMetrics = categoryFilter
    ? filteredMetrics.filter((m) => categoryFilter.includes(m.category))
    : filteredMetrics;

  const categories = [...new Set(analysis.metrics.map((m) => m.category))];
  const metricsByCategory = displayMetrics.reduce(
    (acc, metric) => {
      if (!acc[metric.category]) acc[metric.category] = [];
      acc[metric.category].push(metric);
      return acc;
    },
    {} as Record<string, ProductivityMetric[]>,
  );

  return (
    <div className="org-productivity-metrics">
      <div className="flex items-center justify-between mb-6">
        <h4 className="org-text-lg org-font-semibold">Productivity Metrics</h4>
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="org-select org-select-sm"
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
        {Object.entries(metricsByCategory).map(([category, metrics]) => (
          <div key={category} className="org-card-inner">
            <h5 className="org-text-lg org-font-semibold mb-4 capitalize">{category} Metrics</h5>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {metrics.map((metric) => (
                <div key={metric.metricId} className="org-metric-card">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-1">
                        <h6 className="org-font-semibold">{metric.name}</h6>
                        {getMetricTrendIcon(metric.trend, metric.trendPercentage)}
                      </div>
                      <p className="org-text-sm org-text-muted mb-2">{metric.description}</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-baseline space-x-1">
                      <span className="org-text-2xl org-font-bold">
                        {formatMetricValue(metric.value, metric.unit)}
                      </span>
                      <span
                        className={`org-text-sm ${
                          metric.trend === 'increasing'
                            ? 'org-text-success'
                            : metric.trend === 'decreasing'
                              ? 'org-text-error'
                              : 'org-text-muted'
                        }`}
                      >
                        {metric.trendPercentage > 0 ? '+' : ''}
                        {metric.trendPercentage.toFixed(1)}%
                      </span>
                    </div>

                    {metric.benchmark && (
                      <div className="flex items-center justify-between org-text-sm">
                        <span className="org-text-muted">Benchmark:</span>
                        <span
                          className={
                            metric.value >= metric.benchmark
                              ? 'org-text-success'
                              : 'org-text-warning'
                          }
                        >
                          {formatMetricValue(metric.benchmark, metric.unit)}
                        </span>
                      </div>
                    )}

                    {metric.target && (
                      <div className="flex items-center justify-between org-text-sm">
                        <span className="org-text-muted">Target:</span>
                        <span
                          className={
                            metric.value >= metric.target ? 'org-text-success' : 'org-text-info'
                          }
                        >
                          {formatMetricValue(metric.target, metric.unit)}
                        </span>
                      </div>
                    )}

                    <div className="w-full org-bg-surface rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${
                          metric.value >= (metric.target || metric.benchmark || metric.value)
                            ? 'org-bg-success'
                            : metric.value >=
                                (metric.benchmark || metric.target || metric.value) * 0.8
                              ? 'org-bg-info'
                              : 'org-bg-warning'
                        }`}
                        style={{
                          width: `${Math.min(
                            (metric.value /
                              (metric.target || metric.benchmark || metric.value * 1.2)) *
                              100,
                            100,
                          )}%`,
                        }}
                      />
                    </div>

                    <div className="org-text-xs org-text-muted">
                      Updated {metric.calculationPeriod}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {Object.keys(metricsByCategory).length === 0 && (
        <div className="org-empty-state">
          <BarChart3 className="h-8 w-8 org-text-muted mb-2" />
          <div className="org-text-muted">No metrics match the current filter</div>
        </div>
      )}
    </div>
  );
};

const RecommendationsView: React.FC<{
  analysis: ProductivityAnalysis;
  onActionRecommendation?: (recommendationId: string) => void;
}> = ({ analysis, onActionRecommendation }) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'priority' | 'impact' | 'effort'>('priority');

  const filteredRecommendations =
    selectedCategory === 'all'
      ? analysis.recommendations
      : analysis.recommendations.filter((r) => r.category === selectedCategory);

  const sortedRecommendations = [...filteredRecommendations].sort((a, b) => {
    switch (sortBy) {
      case 'priority': {
        const priorityOrder = ['urgent', 'high', 'medium', 'low'];
        return priorityOrder.indexOf(a.priority) - priorityOrder.indexOf(b.priority);
      }
      case 'impact':
        return b.potentialProductivityGain - a.potentialProductivityGain;
      case 'effort': {
        const effortOrder = ['minimal', 'low', 'medium', 'high'];
        return effortOrder.indexOf(a.effort) - effortOrder.indexOf(b.effort);
      }
      default:
        return 0;
    }
  });

  const categories = [...new Set(analysis.recommendations.map((r) => r.category))];

  return (
    <div className="org-productivity-recommendations">
      <div className="flex items-center justify-between mb-6">
        <h4 className="org-text-lg org-font-semibold">Productivity Recommendations</h4>
        <div className="flex items-center space-x-2">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="org-select org-select-sm"
          >
            <option value="all">All Categories</option>
            {categories.map((cat) => (
              <option key={cat} value={cat} className="capitalize">
                {cat.replace('-', ' ')}
              </option>
            ))}
          </select>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="org-select org-select-sm"
          >
            <option value="priority">Sort by Priority</option>
            <option value="impact">Sort by Impact</option>
            <option value="effort">Sort by Effort</option>
          </select>
        </div>
      </div>

      <div className="space-y-4">
        {sortedRecommendations.map((recommendation) => (
          <div key={recommendation.recommendationId} className="org-card-inner">
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <div className="flex items-center space-x-2 mb-2">
                  <h5 className="org-font-semibold">{recommendation.title}</h5>
                  <span
                    className={`org-badge org-badge-sm ${getPriorityColor(recommendation.priority)}`}
                  >
                    {recommendation.priority} priority
                  </span>
                  <span className="org-badge org-badge-secondary org-badge-sm capitalize">
                    {recommendation.category.replace('-', ' ')}
                  </span>
                </div>
                <p className="org-text-muted mb-3">{recommendation.description}</p>
                <div className="flex items-center space-x-6 org-text-sm org-text-muted">
                  <span className={getEffortColor(recommendation.effort)}>
                    {recommendation.effort} effort
                  </span>
                  <span>{recommendation.timeline} timeline</span>
                  <span>{recommendation.estimatedTimeInvestment}h investment</span>
                </div>
              </div>
              <div className="text-right ml-4">
                <div className="org-text-lg org-font-semibold org-text-success">
                  +{recommendation.potentialProductivityGain}%
                </div>
                <div className="org-text-xs org-text-muted">potential gain</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6 mb-4">
              <div>
                <h6 className="org-font-medium mb-2 org-text-sm">Specific Actions</h6>
                <ul className="space-y-1">
                  {recommendation.specificActions.slice(0, 4).map((action, index) => (
                    <li
                      key={index}
                      className="org-text-sm org-text-muted flex items-start space-x-2"
                    >
                      <span className="org-text-primary mt-0.5">•</span>
                      <span>{action}</span>
                    </li>
                  ))}
                  {recommendation.specificActions.length > 4 && (
                    <li className="org-text-sm org-text-muted">
                      +{recommendation.specificActions.length - 4} more actions
                    </li>
                  )}
                </ul>
              </div>

              <div>
                <h6 className="org-font-medium mb-2 org-text-sm">Success Metrics</h6>
                <div className="space-y-1">
                  {recommendation.successMetrics.map((metric, index) => (
                    <div key={index} className="flex items-center space-x-2 org-text-sm">
                      <Target className="h-3 w-3 org-text-info" />
                      <span className="org-text-muted">{metric}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="org-text-sm">
                <span className="org-font-medium">Expected Impact:</span>
                <span className="org-text-muted ml-2">{recommendation.expectedImpact}</span>
              </div>
              {onActionRecommendation && (
                <button
                  onClick={() => onActionRecommendation(recommendation.recommendationId)}
                  className="org-button org-button-primary org-button-sm"
                >
                  Implement
                </button>
              )}
            </div>

            {recommendation.dependencies && recommendation.dependencies.length > 0 && (
              <div className="mt-3 pt-3 org-border-t">
                <h6 className="org-font-medium mb-2 org-text-sm">Dependencies</h6>
                <div className="flex flex-wrap gap-1">
                  {recommendation.dependencies.map((dependency) => (
                    <span key={dependency} className="org-badge org-badge-warning org-badge-xs">
                      {dependency}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {sortedRecommendations.length === 0 && (
        <div className="org-empty-state">
          <Zap className="h-8 w-8 org-text-muted mb-2" />
          <div className="org-text-muted">No recommendations match the current filter</div>
        </div>
      )}
    </div>
  );
};

const BenchmarksView: React.FC<{
  analysis: ProductivityAnalysis;
}> = ({ analysis }) => (
  <div className="org-productivity-benchmarks">
    <div className="flex items-center justify-between mb-6">
      <h4 className="org-text-lg org-font-semibold">Benchmark Comparisons</h4>
      <div className="org-text-sm org-text-muted">
        {analysis.benchmarkComparisons.length} comparisons
      </div>
    </div>

    <div className="space-y-6">
      {analysis.benchmarkComparisons.map((benchmark, index) => (
        <div key={index} className="org-card-inner">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h5 className="org-font-semibold capitalize">
                {benchmark.comparisonType.replace('-', ' ')} Comparison
              </h5>
              <div className="org-text-sm org-text-muted">
                Overall performance: {Math.round(benchmark.overallScore * 100)}%
              </div>
            </div>
            <div
              className={`org-text-2xl org-font-bold ${
                benchmark.overallScore >= 0.8
                  ? 'org-text-success'
                  : benchmark.overallScore >= 0.6
                    ? 'org-text-info'
                    : 'org-text-warning'
              }`}
            >
              {Math.round(benchmark.overallScore * 100)}%
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6 mb-4">
            <div>
              <h6 className="org-font-medium mb-3">Metric Comparisons</h6>
              <div className="space-y-3">
                {Object.entries(benchmark.metrics)
                  .slice(0, 5)
                  .map(([metricName, data]) => (
                    <div key={metricName} className="flex items-center justify-between">
                      <span className="org-text-sm org-font-medium">{metricName}</span>
                      <div className="text-right">
                        <div
                          className={`org-text-sm org-font-semibold ${
                            data.userValue >= data.benchmarkValue
                              ? 'org-text-success'
                              : 'org-text-warning'
                          }`}
                        >
                          {data.userValue.toFixed(1)} vs {data.benchmarkValue.toFixed(1)}
                        </div>
                        <div className="org-text-xs org-text-muted">
                          {data.percentile}th percentile
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            <div>
              <h6 className="org-font-medium mb-3">Performance Analysis</h6>
              <div className="space-y-3">
                <div>
                  <div className="org-text-sm org-font-medium mb-1 org-text-success">Strengths</div>
                  <div className="space-y-1">
                    {benchmark.strengths.slice(0, 3).map((strength, strengthIndex) => (
                      <div key={strengthIndex} className="flex items-start space-x-2 org-text-sm">
                        <CheckCircle className="h-3 w-3 org-text-success mt-0.5 flex-shrink-0" />
                        <span className="org-text-muted">{strength}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="org-text-sm org-font-medium mb-1 org-text-warning">
                    Improvement Areas
                  </div>
                  <div className="space-y-1">
                    {benchmark.improvementAreas.slice(0, 3).map((area, areaIndex) => (
                      <div key={areaIndex} className="flex items-start space-x-2 org-text-sm">
                        <Target className="h-3 w-3 org-text-warning mt-0.5 flex-shrink-0" />
                        <span className="org-text-muted">{area}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="org-bg-surface p-4 rounded-lg">
            <div className="org-text-sm">
              <span className="org-font-medium">Performance Summary:</span>
              <span className="org-text-muted ml-2">
                You're performing{' '}
                {benchmark.overallScore >= 0.8
                  ? 'above average'
                  : benchmark.overallScore >= 0.6
                    ? 'at average level'
                    : 'below average'}{' '}
                compared to {benchmark.comparisonType.replace('-', ' ')}.
                {benchmark.overallScore < 0.8 && (
                  <>
                    {' '}
                    Focus on {benchmark.improvementAreas.slice(0, 2).join(' and ')} to improve your
                    ranking.
                  </>
                )}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  </div>
);

export const ProductivityInsights: React.FC<ProductivityInsightsProps> = ({
  sessionCorrelation,
  timeRange = 'month',
  mode = 'overview',
  categoryFilter,
  showBenchmarks = true,
  onActionRecommendation,
  className = '',
}) => {
  const { teamFilter } = useOrganizationalContext();
  const [analysis, setAnalysis] = useState<ProductivityAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchProductivityAnalysis = async () => {
      try {
        setLoading(true);
        setError(null);

        const timeRangeMs = {
          week: 604800000,
          month: 2592000000,
          quarter: 7776000000,
          'half-year': 15552000000,
        }[timeRange];

        const endTime = Date.now();
        const startTime = endTime - timeRangeMs;

        // Generate mock productivity analysis
        const mockMetrics: ProductivityMetric[] = [
          {
            metricId: 'tasks-completed',
            name: 'Tasks Completed',
            category: 'output',
            value: 42,
            unit: 'count',
            trend: 'increasing',
            trendPercentage: 15.2,
            benchmark: 38,
            target: 45,
            description: 'Number of tasks successfully completed',
            calculationPeriod: 'weekly',
          },
          {
            metricId: 'code-quality',
            name: 'Code Quality Score',
            category: 'quality',
            value: 0.87,
            unit: 'percentage',
            trend: 'stable',
            trendPercentage: 2.1,
            benchmark: 0.82,
            target: 0.9,
            description: 'Automated code quality assessment score',
            calculationPeriod: 'daily',
          },
          {
            metricId: 'collaboration-ratio',
            name: 'Collaboration Ratio',
            category: 'collaboration',
            value: 0.35,
            unit: 'percentage',
            trend: 'increasing',
            trendPercentage: 8.7,
            benchmark: 0.3,
            description: 'Percentage of time spent in collaborative activities',
            calculationPeriod: 'weekly',
          },
          {
            metricId: 'focus-time',
            name: 'Deep Focus Time',
            category: 'efficiency',
            value: 4.2,
            unit: 'hours',
            trend: 'decreasing',
            trendPercentage: -12.5,
            benchmark: 5.0,
            target: 5.5,
            description: 'Hours per day in uninterrupted focus work',
            calculationPeriod: 'daily',
          },
          {
            metricId: 'learning-rate',
            name: 'Learning Velocity',
            category: 'learning',
            value: 2.3,
            unit: 'score',
            trend: 'increasing',
            trendPercentage: 18.9,
            benchmark: 2.0,
            description: 'Rate of skill and knowledge acquisition',
            calculationPeriod: 'monthly',
          },
        ];

        const mockInsights: ProductivityInsight[] = [
          {
            insightId: 'insight-1',
            type: 'concern',
            title: 'Declining Focus Time',
            description:
              'Deep focus time has decreased by 12.5% over the past month, impacting complex task completion',
            impact: 'high',
            confidence: 0.89,
            relatedMetrics: ['focus-time', 'tasks-completed'],
            evidenceData: [
              'Increased interruptions',
              'More context switching',
              'Longer task completion times',
            ],
            actionable: true,
          },
          {
            insightId: 'insight-2',
            type: 'strength',
            title: 'Strong Collaboration Growth',
            description:
              'Collaboration activities have increased significantly while maintaining quality standards',
            impact: 'medium',
            confidence: 0.92,
            relatedMetrics: ['collaboration-ratio', 'code-quality'],
            evidenceData: [
              'More pair programming',
              'Increased code reviews',
              'Knowledge sharing sessions',
            ],
            actionable: false,
          },
          {
            insightId: 'insight-3',
            type: 'opportunity',
            title: 'Learning Momentum',
            description:
              'Rapid learning velocity indicates readiness for more challenging assignments',
            impact: 'medium',
            confidence: 0.85,
            relatedMetrics: ['learning-rate'],
            evidenceData: [
              'Completed advanced courses',
              'Applied new techniques',
              'Mentored colleagues',
            ],
            actionable: true,
          },
        ];

        const mockRecommendations: ProductivityRecommendation[] = [
          {
            recommendationId: 'rec-1',
            title: 'Implement Focus Time Blocks',
            description:
              'Schedule dedicated 2-hour blocks for deep work to restore focus time levels',
            category: 'time-management',
            priority: 'high',
            effort: 'low',
            timeline: 'immediate',
            expectedImpact:
              'Restore focus time to 5+ hours daily, improve task completion rate by 20%',
            specificActions: [
              'Block 9-11 AM for deep work daily',
              'Turn off non-critical notifications',
              'Use focus mode on devices',
              'Communicate focus schedule to team',
            ],
            successMetrics: [
              'Daily focus time > 5 hours',
              'Fewer context switches',
              'Faster task completion',
            ],
            estimatedTimeInvestment: 2,
            potentialProductivityGain: 25,
          },
          {
            recommendationId: 'rec-2',
            title: 'Leverage Learning for Advanced Projects',
            description: 'Take on more complex projects to capitalize on high learning velocity',
            category: 'skill-development',
            priority: 'medium',
            effort: 'medium',
            timeline: 'short-term',
            expectedImpact:
              'Accelerate career growth, increase project impact, maintain learning momentum',
            specificActions: [
              'Request assignment to architecture projects',
              'Lead technical initiatives',
              'Mentor junior developers',
              'Propose innovative solutions',
            ],
            successMetrics: [
              'Project complexity level',
              'Technical leadership opportunities',
              'Knowledge sharing frequency',
            ],
            dependencies: ['Manager approval', 'Available challenging projects'],
            estimatedTimeInvestment: 10,
            potentialProductivityGain: 15,
          },
          {
            recommendationId: 'rec-3',
            title: 'Optimize Collaboration Workflows',
            description:
              'Streamline collaborative processes to maintain quality while improving efficiency',
            category: 'workflow-improvement',
            priority: 'medium',
            effort: 'medium',
            timeline: 'medium-term',
            expectedImpact:
              'Reduce collaboration overhead, maintain quality standards, increase throughput',
            specificActions: [
              'Implement async code reviews',
              'Use collaborative editing tools',
              'Establish communication protocols',
              'Automate routine collaborative tasks',
            ],
            successMetrics: [
              'Collaboration efficiency ratio',
              'Quality metrics maintained',
              'Time to completion',
            ],
            estimatedTimeInvestment: 8,
            potentialProductivityGain: 18,
          },
        ];

        const mockBenchmarks: BenchmarkComparison[] = showBenchmarks
          ? [
              {
                comparisonType: 'team-average',
                metrics: {
                  'Tasks Completed': { userValue: 42, benchmarkValue: 38, percentile: 75, gap: 4 },
                  'Code Quality': {
                    userValue: 0.87,
                    benchmarkValue: 0.82,
                    percentile: 80,
                    gap: 0.05,
                  },
                  'Focus Time': { userValue: 4.2, benchmarkValue: 5.0, percentile: 40, gap: -0.8 },
                  Collaboration: {
                    userValue: 0.35,
                    benchmarkValue: 0.3,
                    percentile: 70,
                    gap: 0.05,
                  },
                },
                overallScore: 0.73,
                strengths: [
                  'Task completion rate',
                  'Code quality maintenance',
                  'Collaborative engagement',
                ],
                improvementAreas: [
                  'Focus time management',
                  'Interruption handling',
                  'Time blocking discipline',
                ],
              },
              {
                comparisonType: 'industry-standard',
                metrics: {
                  'Tasks Completed': { userValue: 42, benchmarkValue: 35, percentile: 85, gap: 7 },
                  'Code Quality': {
                    userValue: 0.87,
                    benchmarkValue: 0.85,
                    percentile: 65,
                    gap: 0.02,
                  },
                  'Focus Time': { userValue: 4.2, benchmarkValue: 4.8, percentile: 45, gap: -0.6 },
                },
                overallScore: 0.78,
                strengths: [
                  'Above-average output',
                  'Solid quality standards',
                  'Industry-competitive performance',
                ],
                improvementAreas: ['Focus time optimization', 'Distraction management'],
              },
            ]
          : [];

        setAnalysis({
          operatorId: sessionCorrelation.operatorId,
          teamId: sessionCorrelation.teamId,
          analysisTimeRange: { start: startTime, end: endTime },
          metrics: mockMetrics,
          insights: mockInsights,
          recommendations: mockRecommendations,
          benchmarkComparisons: mockBenchmarks,
          overallProductivityScore: 73,
          productivityTrend: 'stable',
          focusAreas: [
            'Focus time management',
            'Distraction reduction',
            'Time blocking implementation',
          ],
          strengths: [
            'High task completion rate',
            'Strong code quality',
            'Effective collaboration',
            'Rapid learning ability',
          ],
          nextReviewDate: endTime + 604800000, // 1 week from now
          generatedAt: Date.now(),
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to generate productivity analysis');
      } finally {
        setLoading(false);
      }
    };

    fetchProductivityAnalysis();
  }, [sessionCorrelation, timeRange, showBenchmarks]);

  if (loading) {
    return (
      <div className={`org-productivity-insights org-loading ${className}`}>
        <div className="flex items-center space-x-2">
          <div className="org-spinner org-spinner-sm" />
          <span className="org-text-muted">Analyzing productivity data...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`org-productivity-insights org-error ${className}`}>
        <div className="org-error-message">
          <BarChart3 className="h-5 w-5 text-red-500" />
          <span>Failed to load productivity insights: {error}</span>
        </div>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className={`org-productivity-insights org-empty ${className}`}>
        <div className="org-empty-state">
          <TrendingUp className="h-8 w-8 org-text-muted mb-2" />
          <div className="org-text-muted">No productivity data available</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`org-productivity-insights org-insights-${mode} ${className}`}>
      <div className="flex items-center justify-between mb-6">
        <h3 className="org-text-xl org-font-semibold">Productivity Insights</h3>
        <div className="org-text-sm org-text-muted">
          Analysis for {timeRange} • Next review:{' '}
          {new Date(analysis.nextReviewDate).toLocaleDateString()}
        </div>
      </div>

      {mode === 'overview' && <OverviewView analysis={analysis} />}
      {mode === 'metrics' && <MetricsView analysis={analysis} categoryFilter={categoryFilter} />}
      {mode === 'recommendations' && (
        <RecommendationsView analysis={analysis} onActionRecommendation={onActionRecommendation} />
      )}
      {mode === 'benchmarks' && <BenchmarksView analysis={analysis} />}
    </div>
  );
};

export default ProductivityInsights;
