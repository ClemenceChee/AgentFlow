import React, { useState, useEffect, useMemo } from 'react';
import { useOrganizationalContext } from '../../../contexts/OrganizationalContext';

// Types for organizational intelligence metrics
interface BriefingMetrics {
  readonly briefingId: string;
  readonly teamId: string;
  readonly operatorId: string;
  readonly timestamp: number;
  readonly generationTime: number; // milliseconds
  readonly accuracy: number; // 0-1 score
  readonly completeness: number; // 0-1 score
  readonly relevance: number; // 0-1 score
  readonly actionableInsights: number; // count
  readonly contextSources: number; // number of sources used
  readonly tokenUsage: number;
  readonly confidenceScore: number; // 0-1
  readonly userFeedback?: 'positive' | 'neutral' | 'negative';
  readonly implementedRecommendations: number;
}

interface CorrelationMetrics {
  readonly correlationId: string;
  readonly sourceSessionId: string;
  readonly targetSessionId: string;
  readonly teamIds: string[];
  readonly timestamp: number;
  readonly correlationType: 'workflow_similarity' | 'problem_pattern' | 'knowledge_transfer' | 'solution_reuse';
  readonly confidenceScore: number; // 0-1
  readonly computationTime: number; // milliseconds
  readonly similarityScore: number; // 0-1
  readonly contextOverlap: number; // percentage
  readonly successful: boolean;
  readonly userValidation?: 'correct' | 'partially_correct' | 'incorrect';
  readonly subsequentCollaboration: boolean;
}

interface IntelligencePerformanceSummary {
  readonly timeWindow: string;
  readonly briefingMetrics: {
    readonly totalGenerated: number;
    readonly avgGenerationTime: number;
    readonly avgAccuracy: number;
    readonly avgRelevance: number;
    readonly implementationRate: number; // percentage of recommendations implemented
    readonly userSatisfaction: number; // 0-1 based on feedback
  };
  readonly correlationMetrics: {
    readonly totalCorrelations: number;
    readonly avgComputationTime: number;
    readonly avgConfidenceScore: number;
    readonly validationAccuracy: number; // percentage of correct correlations
    readonly collaborationSuccess: number; // percentage leading to collaboration
  };
  readonly resourceUtilization: {
    readonly avgTokensPerBriefing: number;
    readonly totalTokenUsage: number;
    readonly computeHours: number;
    readonly costEstimate: number; // dollars
  };
  readonly trends: {
    readonly briefingQuality: 'improving' | 'stable' | 'declining';
    readonly correlationAccuracy: 'improving' | 'stable' | 'declining';
    readonly responseTime: 'improving' | 'stable' | 'declining';
    readonly userAdoption: 'increasing' | 'stable' | 'decreasing';
  };
}

interface QualityAlert {
  readonly id: string;
  readonly type: 'low_briefing_accuracy' | 'slow_generation' | 'poor_correlation' | 'high_token_usage' | 'low_user_satisfaction';
  readonly severity: 'low' | 'medium' | 'high' | 'critical';
  readonly message: string;
  readonly threshold: number;
  readonly currentValue: number;
  readonly affectedTeams: string[];
  readonly recommendations: string[];
  readonly triggeredAt: number;
}

interface OptimizerRecommendation {
  readonly id: string;
  readonly category: 'model_tuning' | 'context_optimization' | 'caching_strategy' | 'workflow_improvement';
  readonly title: string;
  readonly description: string;
  readonly impact: {
    readonly qualityImprovement: number; // percentage
    readonly speedImprovement: number; // percentage
    readonly costReduction: number; // percentage
    readonly userSatisfaction: number; // percentage points
  };
  readonly implementation: {
    readonly effort: 'low' | 'medium' | 'high';
    readonly timeline: string;
    readonly requirements: string[];
  };
  readonly evidence: string[];
  readonly confidence: number; // 0-1
}

interface ModelPerformanceMetric {
  readonly modelName: string;
  readonly modelVersion: string;
  readonly usage: {
    readonly briefingRequests: number;
    readonly correlationRequests: number;
    readonly avgTokensPerRequest: number;
    readonly totalTokens: number;
  };
  readonly performance: {
    readonly avgResponseTime: number;
    readonly accuracyScore: number;
    readonly relevanceScore: number;
    readonly costPerRequest: number;
  };
  readonly comparison: {
    readonly vsBaseline: number; // percentage difference
    readonly rank: number; // ranking among models
  };
}

type MetricView = 'overview' | 'briefings' | 'correlations' | 'quality' | 'optimization' | 'models';
type TimeRange = '1h' | '24h' | '7d' | '30d';

interface Props {
  readonly className?: string;
  readonly teamId?: string;
  readonly showRealTime?: boolean;
  readonly onAlertTriggered?: (alert: QualityAlert) => void;
}

export const OrganizationalIntelligenceMetrics: React.FC<Props> = ({
  className = '',
  teamId,
  showRealTime = true,
  onAlertTriggered
}) => {
  const { selectedTeam, operatorContext } = useOrganizationalContext();
  const [metricView, setMetricView] = useState<MetricView>('overview');
  const [timeRange, setTimeRange] = useState<TimeRange>('24h');
  const [selectedMetric, setSelectedMetric] = useState<string | null>(null);
  const [showAlerts, setShowAlerts] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(showRealTime);
  const [compareMode, setCompareMode] = useState(false);

  const effectiveTeamId = teamId || selectedTeam;

  // Mock data - replace with actual API calls
  const mockBriefingMetrics: BriefingMetrics[] = useMemo(() => {
    const metrics: BriefingMetrics[] = [];
    const now = Date.now();

    for (let i = 0; i < 50; i++) {
      metrics.push({
        briefingId: `briefing-${i}`,
        teamId: effectiveTeamId || 'team-frontend',
        operatorId: `op-${Math.floor(Math.random() * 10)}`,
        timestamp: now - (i * 30 * 60 * 1000), // 30-minute intervals
        generationTime: Math.random() * 5000 + 1000, // 1-6 seconds
        accuracy: Math.random() * 0.3 + 0.7, // 70-100%
        completeness: Math.random() * 0.2 + 0.8, // 80-100%
        relevance: Math.random() * 0.25 + 0.75, // 75-100%
        actionableInsights: Math.floor(Math.random() * 8) + 2, // 2-10 insights
        contextSources: Math.floor(Math.random() * 15) + 5, // 5-20 sources
        tokenUsage: Math.floor(Math.random() * 2000) + 500, // 500-2500 tokens
        confidenceScore: Math.random() * 0.2 + 0.8, // 80-100%
        userFeedback: Math.random() > 0.7 ? ['positive', 'neutral', 'negative'][Math.floor(Math.random() * 3)] as any : undefined,
        implementedRecommendations: Math.floor(Math.random() * 5) // 0-5 recommendations
      });
    }

    return metrics;
  }, [effectiveTeamId]);

  const mockCorrelationMetrics: CorrelationMetrics[] = useMemo(() => {
    const metrics: CorrelationMetrics[] = [];
    const now = Date.now();

    for (let i = 0; i < 30; i++) {
      metrics.push({
        correlationId: `corr-${i}`,
        sourceSessionId: `session-${Math.floor(Math.random() * 100)}`,
        targetSessionId: `session-${Math.floor(Math.random() * 100)}`,
        teamIds: [effectiveTeamId || 'team-frontend'],
        timestamp: now - (i * 45 * 60 * 1000), // 45-minute intervals
        correlationType: ['workflow_similarity', 'problem_pattern', 'knowledge_transfer', 'solution_reuse'][Math.floor(Math.random() * 4)] as any,
        confidenceScore: Math.random() * 0.3 + 0.7, // 70-100%
        computationTime: Math.random() * 1000 + 200, // 200-1200ms
        similarityScore: Math.random() * 0.4 + 0.6, // 60-100%
        contextOverlap: Math.random() * 40 + 30, // 30-70%
        successful: Math.random() > 0.1, // 90% success rate
        userValidation: Math.random() > 0.6 ? ['correct', 'partially_correct', 'incorrect'][Math.floor(Math.random() * 3)] as any : undefined,
        subsequentCollaboration: Math.random() > 0.4 // 60% collaboration rate
      });
    }

    return metrics;
  }, [effectiveTeamId]);

  const mockSummary: IntelligencePerformanceSummary = useMemo(() => {
    const briefings = mockBriefingMetrics.filter(b => b.userFeedback);
    const correlations = mockCorrelationMetrics.filter(c => c.userValidation);

    return {
      timeWindow: timeRange,
      briefingMetrics: {
        totalGenerated: mockBriefingMetrics.length,
        avgGenerationTime: mockBriefingMetrics.reduce((sum, b) => sum + b.generationTime, 0) / mockBriefingMetrics.length,
        avgAccuracy: mockBriefingMetrics.reduce((sum, b) => sum + b.accuracy, 0) / mockBriefingMetrics.length,
        avgRelevance: mockBriefingMetrics.reduce((sum, b) => sum + b.relevance, 0) / mockBriefingMetrics.length,
        implementationRate: (mockBriefingMetrics.reduce((sum, b) => sum + b.implementedRecommendations, 0) /
                            mockBriefingMetrics.reduce((sum, b) => sum + b.actionableInsights, 0)) * 100,
        userSatisfaction: briefings.length > 0 ?
          briefings.filter(b => b.userFeedback === 'positive').length / briefings.length : 0.8
      },
      correlationMetrics: {
        totalCorrelations: mockCorrelationMetrics.length,
        avgComputationTime: mockCorrelationMetrics.reduce((sum, c) => sum + c.computationTime, 0) / mockCorrelationMetrics.length,
        avgConfidenceScore: mockCorrelationMetrics.reduce((sum, c) => sum + c.confidenceScore, 0) / mockCorrelationMetrics.length,
        validationAccuracy: correlations.length > 0 ?
          (correlations.filter(c => c.userValidation === 'correct').length +
           correlations.filter(c => c.userValidation === 'partially_correct').length * 0.5) / correlations.length : 0.85,
        collaborationSuccess: mockCorrelationMetrics.filter(c => c.subsequentCollaboration).length / mockCorrelationMetrics.length * 100
      },
      resourceUtilization: {
        avgTokensPerBriefing: mockBriefingMetrics.reduce((sum, b) => sum + b.tokenUsage, 0) / mockBriefingMetrics.length,
        totalTokenUsage: mockBriefingMetrics.reduce((sum, b) => sum + b.tokenUsage, 0),
        computeHours: 12.5,
        costEstimate: 89.50
      },
      trends: {
        briefingQuality: 'improving',
        correlationAccuracy: 'stable',
        responseTime: 'improving',
        userAdoption: 'increasing'
      }
    };
  }, [mockBriefingMetrics, mockCorrelationMetrics, timeRange]);

  const mockAlerts: QualityAlert[] = useMemo(() => [
    {
      id: 'alert-intel-001',
      type: 'slow_generation',
      severity: 'medium',
      message: 'Briefing generation time increased by 25% over baseline',
      threshold: 3000,
      currentValue: 3750,
      affectedTeams: [effectiveTeamId || 'team-frontend'],
      recommendations: [
        'Review context optimization strategies',
        'Consider model performance tuning',
        'Implement result caching for common patterns'
      ],
      triggeredAt: Date.now() - 900000 // 15 minutes ago
    },
    {
      id: 'alert-intel-002',
      type: 'low_user_satisfaction',
      severity: 'high',
      message: 'User satisfaction dropped below 70% threshold',
      threshold: 0.7,
      currentValue: 0.65,
      affectedTeams: [effectiveTeamId || 'team-frontend'],
      recommendations: [
        'Analyze negative feedback patterns',
        'Improve briefing relevance scoring',
        'Enhance contextual understanding'
      ],
      triggeredAt: Date.now() - 1800000 // 30 minutes ago
    }
  ], [effectiveTeamId]);

  const mockOptimizations: OptimizerRecommendation[] = useMemo(() => [
    {
      id: 'opt-intel-001',
      category: 'context_optimization',
      title: 'Implement Smart Context Pruning',
      description: 'Reduce context size by 30% while maintaining accuracy through intelligent source prioritization',
      impact: {
        qualityImprovement: 2,
        speedImprovement: 35,
        costReduction: 28,
        userSatisfaction: 5
      },
      implementation: {
        effort: 'medium',
        timeline: '3-4 weeks',
        requirements: ['Context scoring algorithm', 'A/B testing framework', 'Performance monitoring']
      },
      evidence: [
        'Context size shows 40% redundancy across sessions',
        'Speed improvements correlate strongly with user satisfaction',
        'Similar optimization showed 30% cost reduction in pilot'
      ],
      confidence: 0.85
    },
    {
      id: 'opt-intel-002',
      category: 'caching_strategy',
      title: 'Semantic Caching for Briefing Patterns',
      description: 'Cache semantically similar briefing requests to reduce generation time and improve consistency',
      impact: {
        qualityImprovement: 8,
        speedImprovement: 60,
        costReduction: 45,
        userSatisfaction: 12
      },
      implementation: {
        effort: 'high',
        timeline: '6-8 weeks',
        requirements: ['Semantic similarity service', 'Cache invalidation strategy', 'Quality assurance framework']
      },
      evidence: [
        '65% of briefings show high semantic similarity to previous requests',
        'Cached responses maintain 95% quality score',
        'Speed improvements directly correlate with user adoption'
      ],
      confidence: 0.78
    }
  ], []);

  const mockModelMetrics: ModelPerformanceMetric[] = useMemo(() => [
    {
      modelName: 'Claude Sonnet 3.5',
      modelVersion: '20241022',
      usage: {
        briefingRequests: 1247,
        correlationRequests: 856,
        avgTokensPerRequest: 1250,
        totalTokens: 2628750
      },
      performance: {
        avgResponseTime: 2800,
        accuracyScore: 0.89,
        relevanceScore: 0.92,
        costPerRequest: 0.045
      },
      comparison: {
        vsBaseline: 12,
        rank: 1
      }
    },
    {
      modelName: 'GPT-4 Turbo',
      modelVersion: '2024-04-09',
      usage: {
        briefingRequests: 734,
        correlationRequests: 512,
        avgTokensPerRequest: 1180,
        totalTokens: 1470280
      },
      performance: {
        avgResponseTime: 3200,
        accuracyScore: 0.85,
        relevanceScore: 0.88,
        costPerRequest: 0.052
      },
      comparison: {
        vsBaseline: -5,
        rank: 2
      }
    }
  ], []);

  // Auto-refresh effect
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      console.log('Refreshing intelligence metrics...');
      // Trigger data refresh
    }, 30000);

    return () => clearInterval(interval);
  }, [autoRefresh]);

  const formatDuration = (ms: number): string => {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const formatPercentage = (value: number): string => {
    return `${(value * 100).toFixed(1)}%`;
  };

  const getTrendColor = (trend: string): string => {
    if (trend.includes('improving') || trend.includes('increasing')) return 'var(--org-success)';
    if (trend.includes('declining') || trend.includes('decreasing')) return 'var(--org-alert-high)';
    return 'var(--org-info)';
  };

  const getQualityColor = (score: number): string => {
    if (score >= 0.9) return 'var(--org-success)';
    if (score >= 0.8) return 'var(--org-info)';
    if (score >= 0.7) return 'var(--org-warning)';
    return 'var(--org-alert-high)';
  };

  const renderOverview = () => (
    <div className="org-intelligence-overview">
      <div className="org-overview-stats">
        <div className="org-stat-card">
          <div className="org-stat-value">{mockSummary.briefingMetrics.totalGenerated}</div>
          <div className="org-stat-label">Briefings Generated</div>
          <div className="org-stat-trend org-trend-positive">
            +12% vs last period
          </div>
        </div>
        <div className="org-stat-card">
          <div className="org-stat-value">{formatPercentage(mockSummary.briefingMetrics.avgAccuracy)}</div>
          <div className="org-stat-label">Average Accuracy</div>
          <div className="org-stat-trend org-trend-positive">
            +3.2% vs baseline
          </div>
        </div>
        <div className="org-stat-card">
          <div className="org-stat-value">{mockSummary.correlationMetrics.totalCorrelations}</div>
          <div className="org-stat-label">Correlations Found</div>
          <div className="org-stat-trend org-trend-positive">
            +8% vs last period
          </div>
        </div>
        <div className="org-stat-card">
          <div className="org-stat-value">${mockSummary.resourceUtilization.costEstimate.toFixed(0)}</div>
          <div className="org-stat-label">Monthly Cost</div>
          <div className="org-stat-trend org-trend-negative">
            +15% vs last month
          </div>
        </div>
      </div>

      <div className="org-performance-summary">
        <div className="org-summary-section">
          <h4>Briefing Performance</h4>
          <div className="org-performance-metrics">
            <div className="org-metric-item">
              <span>Generation Time</span>
              <span>{formatDuration(mockSummary.briefingMetrics.avgGenerationTime)}</span>
              <div
                className="org-trend-indicator"
                style={{ color: getTrendColor(mockSummary.trends.responseTime) }}
              >
                {mockSummary.trends.responseTime}
              </div>
            </div>
            <div className="org-metric-item">
              <span>User Satisfaction</span>
              <span style={{ color: getQualityColor(mockSummary.briefingMetrics.userSatisfaction) }}>
                {formatPercentage(mockSummary.briefingMetrics.userSatisfaction)}
              </span>
              <div
                className="org-trend-indicator"
                style={{ color: getTrendColor(mockSummary.trends.userAdoption) }}
              >
                {mockSummary.trends.userAdoption}
              </div>
            </div>
            <div className="org-metric-item">
              <span>Implementation Rate</span>
              <span>{mockSummary.briefingMetrics.implementationRate.toFixed(1)}%</span>
            </div>
          </div>
        </div>

        <div className="org-summary-section">
          <h4>Correlation Performance</h4>
          <div className="org-performance-metrics">
            <div className="org-metric-item">
              <span>Computation Time</span>
              <span>{formatDuration(mockSummary.correlationMetrics.avgComputationTime)}</span>
            </div>
            <div className="org-metric-item">
              <span>Validation Accuracy</span>
              <span style={{ color: getQualityColor(mockSummary.correlationMetrics.validationAccuracy) }}>
                {formatPercentage(mockSummary.correlationMetrics.validationAccuracy)}
              </span>
              <div
                className="org-trend-indicator"
                style={{ color: getTrendColor(mockSummary.trends.correlationAccuracy) }}
              >
                {mockSummary.trends.correlationAccuracy}
              </div>
            </div>
            <div className="org-metric-item">
              <span>Collaboration Success</span>
              <span>{mockSummary.correlationMetrics.collaborationSuccess.toFixed(1)}%</span>
            </div>
          </div>
        </div>

        <div className="org-summary-section">
          <h4>Resource Utilization</h4>
          <div className="org-performance-metrics">
            <div className="org-metric-item">
              <span>Tokens per Briefing</span>
              <span>{mockSummary.resourceUtilization.avgTokensPerBriefing.toLocaleString()}</span>
            </div>
            <div className="org-metric-item">
              <span>Compute Hours</span>
              <span>{mockSummary.resourceUtilization.computeHours}</span>
            </div>
            <div className="org-metric-item">
              <span>Cost Efficiency</span>
              <span>${(mockSummary.resourceUtilization.costEstimate / mockSummary.briefingMetrics.totalGenerated).toFixed(3)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderBriefings = () => (
    <div className="org-briefing-metrics">
      <div className="org-section-header">
        <h3>Briefing Performance Analysis</h3>
      </div>

      <div className="org-briefing-charts">
        <div className="org-chart-container">
          <h4>Generation Time Distribution</h4>
          <div className="org-histogram">
            {[1000, 2000, 3000, 4000, 5000, 6000].map((threshold, index) => {
              const count = mockBriefingMetrics.filter(b =>
                b.generationTime >= threshold && b.generationTime < threshold + 1000
              ).length;
              const percentage = (count / mockBriefingMetrics.length) * 100;

              return (
                <div key={threshold} className="org-histogram-bar">
                  <div
                    className="org-histogram-fill"
                    style={{ height: `${percentage * 2}px` }}
                  />
                  <span className="org-histogram-label">{threshold / 1000}s</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="org-chart-container">
          <h4>Quality Scores</h4>
          <div className="org-quality-metrics">
            <div className="org-quality-item">
              <span>Accuracy</span>
              <div className="org-progress-bar">
                <div
                  className="org-progress-fill"
                  style={{
                    width: `${mockSummary.briefingMetrics.avgAccuracy * 100}%`,
                    backgroundColor: getQualityColor(mockSummary.briefingMetrics.avgAccuracy)
                  }}
                />
              </div>
              <span>{formatPercentage(mockSummary.briefingMetrics.avgAccuracy)}</span>
            </div>
            <div className="org-quality-item">
              <span>Relevance</span>
              <div className="org-progress-bar">
                <div
                  className="org-progress-fill"
                  style={{
                    width: `${mockSummary.briefingMetrics.avgRelevance * 100}%`,
                    backgroundColor: getQualityColor(mockSummary.briefingMetrics.avgRelevance)
                  }}
                />
              </div>
              <span>{formatPercentage(mockSummary.briefingMetrics.avgRelevance)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="org-briefing-insights">
        <div className="org-insight-card">
          <h5>Key Insights</h5>
          <ul>
            <li>85% of briefings are generated within 3 seconds</li>
            <li>Accuracy improved by 12% after context optimization</li>
            <li>User satisfaction correlates strongly with actionable insights count</li>
            <li>Peak generation times occur during 9-11 AM and 2-4 PM</li>
          </ul>
        </div>
      </div>
    </div>
  );

  const renderCorrelations = () => (
    <div className="org-correlation-metrics">
      <div className="org-section-header">
        <h3>Correlation Performance Analysis</h3>
      </div>

      <div className="org-correlation-breakdown">
        <div className="org-correlation-types">
          {['workflow_similarity', 'problem_pattern', 'knowledge_transfer', 'solution_reuse'].map((type) => {
            const correlations = mockCorrelationMetrics.filter(c => c.correlationType === type);
            const avgConfidence = correlations.reduce((sum, c) => sum + c.confidenceScore, 0) / correlations.length;
            const successRate = correlations.filter(c => c.successful).length / correlations.length;

            return (
              <div key={type} className="org-correlation-type-card">
                <h5>{type.replace('_', ' ')}</h5>
                <div className="org-correlation-stats">
                  <div className="org-stat-row">
                    <span>Count</span>
                    <span>{correlations.length}</span>
                  </div>
                  <div className="org-stat-row">
                    <span>Confidence</span>
                    <span style={{ color: getQualityColor(avgConfidence) }}>
                      {formatPercentage(avgConfidence)}
                    </span>
                  </div>
                  <div className="org-stat-row">
                    <span>Success Rate</span>
                    <span>{formatPercentage(successRate)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="org-correlation-timeline">
        <h4>Correlation Success Rate Over Time</h4>
        <div className="org-timeline-chart">
          <svg viewBox="0 0 600 200">
            {/* Simple line chart - replace with actual charting library */}
            {mockCorrelationMetrics.slice(-20).map((correlation, index) => {
              const x = 50 + (index / 19) * 500;
              const y = 150 - (correlation.confidenceScore * 100);
              const color = correlation.successful ? 'var(--org-success)' : 'var(--org-alert-high)';

              return (
                <circle
                  key={correlation.correlationId}
                  cx={x}
                  cy={y}
                  r="3"
                  fill={color}
                  opacity="0.8"
                />
              );
            })}
          </svg>
        </div>
      </div>
    </div>
  );

  const renderOptimization = () => (
    <div className="org-intelligence-optimization">
      <div className="org-section-header">
        <h3>Optimization Recommendations</h3>
        <div className="org-optimization-summary">
          Potential improvements identified: {mockOptimizations.length}
        </div>
      </div>

      <div className="org-optimizations-list">
        {mockOptimizations.map((optimization) => (
          <div key={optimization.id} className="org-optimization-card">
            <div className="org-optimization-header">
              <h4>{optimization.title}</h4>
              <div className="org-optimization-badges">
                <span className={`org-category-badge org-category-${optimization.category.replace('_', '-')}`}>
                  {optimization.category.replace('_', ' ')}
                </span>
                <span className="org-confidence-badge">
                  {Math.round(optimization.confidence * 100)}% confidence
                </span>
              </div>
            </div>

            <div className="org-optimization-description">
              {optimization.description}
            </div>

            <div className="org-impact-preview">
              <h5>Expected Impact</h5>
              <div className="org-impact-grid">
                <div className="org-impact-item">
                  <span>Quality</span>
                  <span className="org-positive">+{optimization.impact.qualityImprovement}%</span>
                </div>
                <div className="org-impact-item">
                  <span>Speed</span>
                  <span className="org-positive">+{optimization.impact.speedImprovement}%</span>
                </div>
                <div className="org-impact-item">
                  <span>Cost</span>
                  <span className="org-positive">-{optimization.impact.costReduction}%</span>
                </div>
                <div className="org-impact-item">
                  <span>Satisfaction</span>
                  <span className="org-positive">+{optimization.impact.userSatisfaction}pp</span>
                </div>
              </div>
            </div>

            <div className="org-implementation-preview">
              <div className="org-implementation-item">
                <span>Effort:</span>
                <span className={`org-effort-indicator org-effort-${optimization.implementation.effort}`}>
                  {optimization.implementation.effort}
                </span>
              </div>
              <div className="org-implementation-item">
                <span>Timeline:</span>
                <span>{optimization.implementation.timeline}</span>
              </div>
            </div>

            <div className="org-evidence">
              <h6>Supporting Evidence:</h6>
              <ul>
                {optimization.evidence.map((evidence, index) => (
                  <li key={index}>{evidence}</li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderModels = () => (
    <div className="org-model-performance">
      <div className="org-section-header">
        <h3>Model Performance Comparison</h3>
      </div>

      <div className="org-model-grid">
        {mockModelMetrics.map((model) => (
          <div key={model.modelName} className="org-model-card">
            <div className="org-model-header">
              <h4>{model.modelName}</h4>
              <div className="org-model-rank">
                Rank #{model.comparison.rank}
              </div>
            </div>

            <div className="org-model-usage">
              <h5>Usage Statistics</h5>
              <div className="org-usage-stats">
                <div className="org-usage-item">
                  <span>Briefing Requests</span>
                  <span>{model.usage.briefingRequests.toLocaleString()}</span>
                </div>
                <div className="org-usage-item">
                  <span>Correlation Requests</span>
                  <span>{model.usage.correlationRequests.toLocaleString()}</span>
                </div>
                <div className="org-usage-item">
                  <span>Avg Tokens/Request</span>
                  <span>{model.usage.avgTokensPerRequest.toLocaleString()}</span>
                </div>
              </div>
            </div>

            <div className="org-model-performance-metrics">
              <h5>Performance Metrics</h5>
              <div className="org-performance-stats">
                <div className="org-perf-item">
                  <span>Response Time</span>
                  <span>{formatDuration(model.performance.avgResponseTime)}</span>
                </div>
                <div className="org-perf-item">
                  <span>Accuracy</span>
                  <span style={{ color: getQualityColor(model.performance.accuracyScore) }}>
                    {formatPercentage(model.performance.accuracyScore)}
                  </span>
                </div>
                <div className="org-perf-item">
                  <span>Relevance</span>
                  <span style={{ color: getQualityColor(model.performance.relevanceScore) }}>
                    {formatPercentage(model.performance.relevanceScore)}
                  </span>
                </div>
                <div className="org-perf-item">
                  <span>Cost/Request</span>
                  <span>${model.performance.costPerRequest.toFixed(3)}</span>
                </div>
              </div>
            </div>

            <div className="org-model-comparison">
              <div className="org-comparison-item">
                <span>vs Baseline</span>
                <span className={model.comparison.vsBaseline > 0 ? 'org-positive' : 'org-negative'}>
                  {model.comparison.vsBaseline > 0 ? '+' : ''}{model.comparison.vsBaseline}%
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className={`org-organizational-intelligence-metrics ${className}`}>
      <div className="org-component-header">
        <h2>Organizational Intelligence Metrics</h2>
        <div className="org-header-controls">
          <div className="org-time-range-selector">
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value as TimeRange)}
            >
              <option value="1h">Last Hour</option>
              <option value="24h">Last 24 Hours</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
            </select>
          </div>
          <div className="org-view-controls">
            <label>
              <input
                type="checkbox"
                checked={showAlerts}
                onChange={(e) => setShowAlerts(e.target.checked)}
              />
              Show Alerts
            </label>
            <label>
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
              />
              Auto-refresh
            </label>
            <label>
              <input
                type="checkbox"
                checked={compareMode}
                onChange={(e) => setCompareMode(e.target.checked)}
              />
              Compare Mode
            </label>
          </div>
        </div>
      </div>

      <div className="org-metric-tabs">
        {[
          { key: 'overview', label: 'Overview' },
          { key: 'briefings', label: 'Briefings' },
          { key: 'correlations', label: 'Correlations' },
          { key: 'quality', label: 'Quality Analysis' },
          { key: 'optimization', label: `Optimizations (${mockOptimizations.length})` },
          { key: 'models', label: 'Model Comparison' }
        ].map((tab) => (
          <button
            key={tab.key}
            className={`org-tab-button ${metricView === tab.key ? 'org-active' : ''}`}
            onClick={() => setMetricView(tab.key as MetricView)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="org-metric-content">
        {metricView === 'overview' && renderOverview()}
        {metricView === 'briefings' && renderBriefings()}
        {metricView === 'correlations' && renderCorrelations()}
        {metricView === 'quality' && renderBriefings()} {/* Reuse briefings for quality */}
        {metricView === 'optimization' && renderOptimization()}
        {metricView === 'models' && renderModels()}
      </div>

      {showAlerts && mockAlerts.length > 0 && (
        <div className="org-intelligence-alerts">
          <h4>Quality Alerts</h4>
          {mockAlerts.map((alert) => (
            <div
              key={alert.id}
              className="org-alert-card"
              style={{ borderLeftColor: getSeverityColor(alert.severity) }}
            >
              <div className="org-alert-header">
                <span className="org-alert-type">{alert.type.replace('_', ' ')}</span>
                <span className="org-alert-severity">{alert.severity}</span>
                <span className="org-alert-time">
                  {Math.round((Date.now() - alert.triggeredAt) / 60000)}m ago
                </span>
              </div>
              <div className="org-alert-message">{alert.message}</div>
              <div className="org-alert-affected">
                Affected teams: {alert.affectedTeams.join(', ')}
              </div>
              <div className="org-alert-recommendations">
                <h6>Recommendations:</h6>
                <ul>
                  {alert.recommendations.map((rec, index) => (
                    <li key={index}>{rec}</li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      )}

      {effectiveTeamId && (
        <div className="org-context-info">
          <div className="org-context-badge">
            Intelligence metrics for: {effectiveTeamId}
          </div>
        </div>
      )}
    </div>
  );
};

export default OrganizationalIntelligenceMetrics;