import React, { useState, useEffect, useMemo } from 'react';
import { useOrganizationalContext } from '../../../contexts/OrganizationalContext';

// Types for operator performance comparison
interface OperatorPerformanceSnapshot {
  readonly operatorId: string;
  readonly operatorName: string;
  readonly teamId: string;
  readonly timestamp: number;
  readonly sessionCount: number;
  readonly activeHours: number;
  readonly productivity: {
    readonly tasksCompleted: number;
    readonly avgTaskDuration: number; // minutes
    readonly codeChanges: number;
    readonly problemsSolved: number;
    readonly collaborationEvents: number;
  };
  readonly efficiency: {
    readonly querySuccessRate: number; // percentage
    readonly avgQueryTime: number; // milliseconds
    readonly cacheHitRate: number; // percentage
    readonly errorRate: number; // percentage
    readonly retryRate: number; // percentage
  };
  readonly resourceUsage: {
    readonly cpuTime: number; // seconds
    readonly memoryPeak: number; // MB
    readonly networkRequests: number;
    readonly tokenConsumption: number;
    readonly costEstimate: number; // dollars
  };
  readonly qualityMetrics: {
    readonly codeQualityScore: number; // 0-100
    readonly reviewScore: number; // 0-100
    readonly testCoverage: number; // percentage
    readonly bugIntroduction: number; // count
    readonly knowledgeSharing: number; // score 0-100
  };
  readonly collaborationScore: number; // 0-100
  readonly learningVelocity: number; // skills gained per week
}

interface ComparisonMetric {
  readonly metricName: string;
  readonly category: 'productivity' | 'efficiency' | 'resource' | 'quality' | 'collaboration';
  readonly unit: string;
  readonly higherIsBetter: boolean;
  readonly operators: Array<{
    readonly operatorId: string;
    readonly value: number;
    readonly rank: number;
    readonly percentile: number;
    readonly trend: 'improving' | 'stable' | 'declining';
  }>;
  readonly benchmark: {
    readonly median: number;
    readonly p75: number;
    readonly p90: number;
    readonly target: number;
  };
}

interface PerformanceAlert {
  readonly id: string;
  readonly operatorId: string;
  readonly type: 'performance_drop' | 'resource_spike' | 'efficiency_decline' | 'quality_issue';
  readonly severity: 'low' | 'medium' | 'high' | 'critical';
  readonly message: string;
  readonly currentValue: number;
  readonly threshold: number;
  readonly recommendations: string[];
  readonly triggeredAt: number;
}

interface TeamPerformanceComparison {
  readonly teamId: string;
  readonly teamName: string;
  readonly operatorCount: number;
  readonly avgMetrics: {
    readonly productivity: number;
    readonly efficiency: number;
    readonly resourceOptimization: number;
    readonly quality: number;
    readonly collaboration: number;
  };
  readonly topPerformers: string[]; // operator IDs
  readonly improvementOpportunities: string[]; // operator IDs
}

interface PerformanceCorrelation {
  readonly metric1: string;
  readonly metric2: string;
  readonly correlation: number; // -1 to 1
  readonly significance: number; // p-value
  readonly insight: string;
}

type ComparisonView = 'overview' | 'detailed' | 'rankings' | 'trends' | 'correlations' | 'teams';
type TimeRange = '1d' | '7d' | '30d' | '90d';
type MetricCategory = 'all' | 'productivity' | 'efficiency' | 'resource' | 'quality' | 'collaboration';

interface Props {
  readonly className?: string;
  readonly selectedOperators?: string[];
  readonly teamId?: string;
  readonly showBenchmarks?: boolean;
  readonly onOperatorSelect?: (operatorId: string) => void;
}

export const MultiOperatorPerformanceComparison: React.FC<Props> = ({
  className = '',
  selectedOperators = [],
  teamId,
  showBenchmarks = true,
  onOperatorSelect
}) => {
  const { selectedTeam, operatorContext } = useOrganizationalContext();
  const [comparisonView, setComparisonView] = useState<ComparisonView>('overview');
  const [timeRange, setTimeRange] = useState<TimeRange>('7d');
  const [metricCategory, setMetricCategory] = useState<MetricCategory>('all');
  const [selectedMetric, setSelectedMetric] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<string>('overall_performance');
  const [showOutliers, setShowOutliers] = useState(true);
  const [normalizeScores, setNormalizeScores] = useState(true);

  const effectiveTeamId = teamId || selectedTeam;

  // Mock data - replace with actual API calls
  const mockOperatorSnapshots: OperatorPerformanceSnapshot[] = useMemo(() => [
    {
      operatorId: 'op-001',
      operatorName: 'Alice Frontend',
      teamId: effectiveTeamId || 'team-frontend',
      timestamp: Date.now(),
      sessionCount: 42,
      activeHours: 35.5,
      productivity: {
        tasksCompleted: 28,
        avgTaskDuration: 45,
        codeChanges: 156,
        problemsSolved: 12,
        collaborationEvents: 18
      },
      efficiency: {
        querySuccessRate: 94.2,
        avgQueryTime: 850,
        cacheHitRate: 89.3,
        errorRate: 2.1,
        retryRate: 4.5
      },
      resourceUsage: {
        cpuTime: 1240,
        memoryPeak: 2048,
        networkRequests: 3847,
        tokenConsumption: 45678,
        costEstimate: 23.45
      },
      qualityMetrics: {
        codeQualityScore: 87,
        reviewScore: 92,
        testCoverage: 78,
        bugIntroduction: 2,
        knowledgeSharing: 85
      },
      collaborationScore: 88,
      learningVelocity: 2.3
    },
    {
      operatorId: 'op-002',
      operatorName: 'Bob Backend',
      teamId: effectiveTeamId || 'team-backend',
      timestamp: Date.now(),
      sessionCount: 38,
      activeHours: 32.0,
      productivity: {
        tasksCompleted: 31,
        avgTaskDuration: 52,
        codeChanges: 203,
        problemsSolved: 15,
        collaborationEvents: 22
      },
      efficiency: {
        querySuccessRate: 96.8,
        avgQueryTime: 720,
        cacheHitRate: 91.7,
        errorRate: 1.4,
        retryRate: 2.8
      },
      resourceUsage: {
        cpuTime: 1180,
        memoryPeak: 3072,
        networkRequests: 4235,
        tokenConsumption: 52341,
        costEstimate: 28.90
      },
      qualityMetrics: {
        codeQualityScore: 92,
        reviewScore: 89,
        testCoverage: 85,
        bugIntroduction: 1,
        knowledgeSharing: 79
      },
      collaborationScore: 82,
      learningVelocity: 1.8
    },
    {
      operatorId: 'op-003',
      operatorName: 'Carol Design',
      teamId: 'team-design',
      timestamp: Date.now(),
      sessionCount: 25,
      activeHours: 28.5,
      productivity: {
        tasksCompleted: 18,
        avgTaskDuration: 65,
        codeChanges: 89,
        problemsSolved: 8,
        collaborationEvents: 25
      },
      efficiency: {
        querySuccessRate: 91.5,
        avgQueryTime: 950,
        cacheHitRate: 82.1,
        errorRate: 3.2,
        retryRate: 6.1
      },
      resourceUsage: {
        cpuTime: 890,
        memoryPeak: 1536,
        networkRequests: 2156,
        tokenConsumption: 32567,
        costEstimate: 18.75
      },
      qualityMetrics: {
        codeQualityScore: 78,
        reviewScore: 94,
        testCoverage: 65,
        bugIntroduction: 0,
        knowledgeSharing: 92
      },
      collaborationScore: 95,
      learningVelocity: 2.7
    },
    {
      operatorId: 'op-004',
      operatorName: 'David Infra',
      teamId: 'team-infra',
      timestamp: Date.now(),
      sessionCount: 33,
      activeHours: 39.0,
      productivity: {
        tasksCompleted: 24,
        avgTaskDuration: 78,
        codeChanges: 134,
        problemsSolved: 18,
        collaborationEvents: 15
      },
      efficiency: {
        querySuccessRate: 93.7,
        avgQueryTime: 1120,
        cacheHitRate: 86.4,
        errorRate: 2.8,
        retryRate: 5.2
      },
      resourceUsage: {
        cpuTime: 1560,
        memoryPeak: 4096,
        networkRequests: 3245,
        tokenConsumption: 38924,
        costEstimate: 25.60
      },
      qualityMetrics: {
        codeQualityScore: 89,
        reviewScore: 86,
        testCoverage: 92,
        bugIntroduction: 1,
        knowledgeSharing: 73
      },
      collaborationScore: 76,
      learningVelocity: 1.5
    }
  ], [effectiveTeamId]);

  const mockComparisonMetrics: ComparisonMetric[] = useMemo(() => {
    const calculateStats = (values: number[]) => {
      const sorted = [...values].sort((a, b) => a - b);
      return {
        median: sorted[Math.floor(sorted.length / 2)],
        p75: sorted[Math.floor(sorted.length * 0.75)],
        p90: sorted[Math.floor(sorted.length * 0.9)],
        target: Math.max(...sorted) * 1.1
      };
    };

    return [
      {
        metricName: 'Tasks Completed',
        category: 'productivity',
        unit: 'tasks',
        higherIsBetter: true,
        operators: mockOperatorSnapshots.map((op, index) => ({
          operatorId: op.operatorId,
          value: op.productivity.tasksCompleted,
          rank: index + 1,
          percentile: 90 - index * 15,
          trend: ['improving', 'stable', 'declining'][index % 3] as any
        })),
        benchmark: calculateStats(mockOperatorSnapshots.map(op => op.productivity.tasksCompleted))
      },
      {
        metricName: 'Query Success Rate',
        category: 'efficiency',
        unit: '%',
        higherIsBetter: true,
        operators: mockOperatorSnapshots.map((op, index) => ({
          operatorId: op.operatorId,
          value: op.efficiency.querySuccessRate,
          rank: index + 1,
          percentile: 95 - index * 5,
          trend: ['stable', 'improving', 'stable', 'declining'][index] as any
        })),
        benchmark: calculateStats(mockOperatorSnapshots.map(op => op.efficiency.querySuccessRate))
      },
      {
        metricName: 'Resource Efficiency',
        category: 'resource',
        unit: 'score',
        higherIsBetter: true,
        operators: mockOperatorSnapshots.map((op, index) => {
          const efficiency = (op.productivity.tasksCompleted / op.resourceUsage.costEstimate) * 10;
          return {
            operatorId: op.operatorId,
            value: efficiency,
            rank: index + 1,
            percentile: 85 - index * 10,
            trend: ['improving', 'stable', 'improving', 'declining'][index] as any
          };
        }),
        benchmark: calculateStats(mockOperatorSnapshots.map(op =>
          (op.productivity.tasksCompleted / op.resourceUsage.costEstimate) * 10
        ))
      },
      {
        metricName: 'Code Quality Score',
        category: 'quality',
        unit: 'score',
        higherIsBetter: true,
        operators: mockOperatorSnapshots.map((op, index) => ({
          operatorId: op.operatorId,
          value: op.qualityMetrics.codeQualityScore,
          rank: index + 1,
          percentile: 90 - index * 8,
          trend: ['stable', 'improving', 'declining', 'stable'][index] as any
        })),
        benchmark: calculateStats(mockOperatorSnapshots.map(op => op.qualityMetrics.codeQualityScore))
      },
      {
        metricName: 'Collaboration Score',
        category: 'collaboration',
        unit: 'score',
        higherIsBetter: true,
        operators: mockOperatorSnapshots.map((op, index) => ({
          operatorId: op.operatorId,
          value: op.collaborationScore,
          rank: index + 1,
          percentile: 95 - index * 12,
          trend: ['improving', 'stable', 'improving', 'declining'][index] as any
        })),
        benchmark: calculateStats(mockOperatorSnapshots.map(op => op.collaborationScore))
      }
    ];
  }, [mockOperatorSnapshots]);

  const mockAlerts: PerformanceAlert[] = useMemo(() => [
    {
      id: 'alert-perf-001',
      operatorId: 'op-004',
      type: 'efficiency_decline',
      severity: 'medium',
      message: 'Query efficiency dropped 15% below personal average',
      currentValue: 93.7,
      threshold: 95.0,
      recommendations: [
        'Review recent query patterns for optimization opportunities',
        'Consider cache warming for frequently accessed data',
        'Analyze error patterns for systematic issues'
      ],
      triggeredAt: Date.now() - 1200000
    },
    {
      id: 'alert-perf-002',
      operatorId: 'op-003',
      type: 'resource_spike',
      severity: 'low',
      message: 'Token consumption increased significantly',
      currentValue: 32567,
      threshold: 30000,
      recommendations: [
        'Review query complexity and context size',
        'Consider implementing result caching',
        'Optimize prompt engineering for efficiency'
      ],
      triggeredAt: Date.now() - 900000
    }
  ], []);

  const mockTeamComparisons: TeamPerformanceComparison[] = useMemo(() => [
    {
      teamId: 'team-frontend',
      teamName: 'Frontend Team',
      operatorCount: 1,
      avgMetrics: {
        productivity: 85,
        efficiency: 89,
        resourceOptimization: 78,
        quality: 87,
        collaboration: 88
      },
      topPerformers: ['op-001'],
      improvementOpportunities: []
    },
    {
      teamId: 'team-backend',
      teamName: 'Backend Team',
      operatorCount: 1,
      avgMetrics: {
        productivity: 92,
        efficiency: 95,
        resourceOptimization: 82,
        quality: 89,
        collaboration: 82
      },
      topPerformers: ['op-002'],
      improvementOpportunities: []
    }
  ], []);

  const mockCorrelations: PerformanceCorrelation[] = useMemo(() => [
    {
      metric1: 'collaboration_score',
      metric2: 'knowledge_sharing',
      correlation: 0.87,
      significance: 0.002,
      insight: 'Higher collaboration strongly correlates with knowledge sharing activities'
    },
    {
      metric1: 'query_success_rate',
      metric2: 'resource_efficiency',
      correlation: 0.73,
      significance: 0.012,
      insight: 'Efficient queries reduce overall resource consumption'
    },
    {
      metric1: 'code_quality_score',
      metric2: 'bug_introduction',
      correlation: -0.65,
      significance: 0.025,
      insight: 'Higher code quality significantly reduces bug introduction rates'
    }
  ], []);

  const getOperatorName = (operatorId: string): string => {
    return mockOperatorSnapshots.find(op => op.operatorId === operatorId)?.operatorName || operatorId;
  };

  const getTrendColor = (trend: string): string => {
    switch (trend) {
      case 'improving': return 'var(--org-success)';
      case 'declining': return 'var(--org-alert-high)';
      default: return 'var(--org-info)';
    }
  };

  const getPerformanceColor = (value: number, benchmark: { median: number; p75: number; p90: number }): string => {
    if (value >= benchmark.p90) return 'var(--org-success)';
    if (value >= benchmark.p75) return 'var(--org-info)';
    if (value >= benchmark.median) return 'var(--org-warning)';
    return 'var(--org-alert-high)';
  };

  const renderOverview = () => (
    <div className="org-performance-overview">
      <div className="org-overview-stats">
        <div className="org-stat-card">
          <div className="org-stat-value">{mockOperatorSnapshots.length}</div>
          <div className="org-stat-label">Operators Analyzed</div>
        </div>
        <div className="org-stat-card">
          <div className="org-stat-value">
            {(mockOperatorSnapshots.reduce((sum, op) => sum + op.productivity.tasksCompleted, 0) /
              mockOperatorSnapshots.length).toFixed(1)}
          </div>
          <div className="org-stat-label">Avg Tasks/Week</div>
        </div>
        <div className="org-stat-card">
          <div className="org-stat-value">
            {(mockOperatorSnapshots.reduce((sum, op) => sum + op.efficiency.querySuccessRate, 0) /
              mockOperatorSnapshots.length).toFixed(1)}%
          </div>
          <div className="org-stat-label">Avg Success Rate</div>
        </div>
        <div className="org-stat-card">
          <div className="org-stat-value">
            ${mockOperatorSnapshots.reduce((sum, op) => sum + op.resourceUsage.costEstimate, 0).toFixed(0)}
          </div>
          <div className="org-stat-label">Total Weekly Cost</div>
        </div>
      </div>

      <div className="org-performance-matrix">
        <h4>Performance Matrix</h4>
        <div className="org-matrix-grid">
          {mockOperatorSnapshots.map((operator) => (
            <div
              key={operator.operatorId}
              className="org-operator-card"
              onClick={() => onOperatorSelect?.(operator.operatorId)}
            >
              <div className="org-operator-header">
                <h5>{operator.operatorName}</h5>
                <div className="org-team-badge">{operator.teamId}</div>
              </div>

              <div className="org-performance-scores">
                <div className="org-score-item">
                  <span>Productivity</span>
                  <div className="org-score-bar">
                    <div
                      className="org-score-fill"
                      style={{
                        width: `${(operator.productivity.tasksCompleted / 35) * 100}%`,
                        backgroundColor: getPerformanceColor(operator.productivity.tasksCompleted, {
                          median: 25, p75: 30, p90: 32
                        })
                      }}
                    />
                  </div>
                  <span>{operator.productivity.tasksCompleted}</span>
                </div>

                <div className="org-score-item">
                  <span>Efficiency</span>
                  <div className="org-score-bar">
                    <div
                      className="org-score-fill"
                      style={{
                        width: `${operator.efficiency.querySuccessRate}%`,
                        backgroundColor: getPerformanceColor(operator.efficiency.querySuccessRate, {
                          median: 92, p75: 95, p90: 97
                        })
                      }}
                    />
                  </div>
                  <span>{operator.efficiency.querySuccessRate.toFixed(1)}%</span>
                </div>

                <div className="org-score-item">
                  <span>Quality</span>
                  <div className="org-score-bar">
                    <div
                      className="org-score-fill"
                      style={{
                        width: `${operator.qualityMetrics.codeQualityScore}%`,
                        backgroundColor: getPerformanceColor(operator.qualityMetrics.codeQualityScore, {
                          median: 85, p75: 90, p90: 95
                        })
                      }}
                    />
                  </div>
                  <span>{operator.qualityMetrics.codeQualityScore}</span>
                </div>

                <div className="org-score-item">
                  <span>Collaboration</span>
                  <div className="org-score-bar">
                    <div
                      className="org-score-fill"
                      style={{
                        width: `${operator.collaborationScore}%`,
                        backgroundColor: getPerformanceColor(operator.collaborationScore, {
                          median: 80, p75: 85, p90: 90
                        })
                      }}
                    />
                  </div>
                  <span>{operator.collaborationScore}</span>
                </div>
              </div>

              <div className="org-operator-highlights">
                <div className="org-highlight-item">
                  <span>Active Hours:</span>
                  <span>{operator.activeHours.toFixed(1)}h</span>
                </div>
                <div className="org-highlight-item">
                  <span>Cost:</span>
                  <span>${operator.resourceUsage.costEstimate.toFixed(2)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderRankings = () => {
    const filteredMetrics = metricCategory === 'all' ?
      mockComparisonMetrics :
      mockComparisonMetrics.filter(m => m.category === metricCategory);

    return (
      <div className="org-performance-rankings">
        <div className="org-section-header">
          <h3>Performance Rankings</h3>
          <div className="org-ranking-controls">
            <select
              value={metricCategory}
              onChange={(e) => setMetricCategory(e.target.value as MetricCategory)}
            >
              <option value="all">All Categories</option>
              <option value="productivity">Productivity</option>
              <option value="efficiency">Efficiency</option>
              <option value="resource">Resource Usage</option>
              <option value="quality">Quality</option>
              <option value="collaboration">Collaboration</option>
            </select>
          </div>
        </div>

        <div className="org-rankings-grid">
          {filteredMetrics.map((metric) => (
            <div key={metric.metricName} className="org-ranking-card">
              <div className="org-ranking-header">
                <h4>{metric.metricName}</h4>
                <div className="org-metric-info">
                  <span className="org-metric-unit">{metric.unit}</span>
                  <span className={`org-metric-category org-category-${metric.category}`}>
                    {metric.category}
                  </span>
                </div>
              </div>

              <div className="org-ranking-list">
                {metric.operators
                  .sort((a, b) => metric.higherIsBetter ? b.value - a.value : a.value - b.value)
                  .map((operator, index) => (
                    <div key={operator.operatorId} className="org-ranking-item">
                      <div className="org-rank-position">#{index + 1}</div>
                      <div className="org-operator-info">
                        <span className="org-operator-name">
                          {getOperatorName(operator.operatorId)}
                        </span>
                        <span className="org-operator-value">
                          {typeof operator.value === 'number' ? operator.value.toFixed(1) : operator.value}{metric.unit}
                        </span>
                      </div>
                      <div className="org-percentile-info">
                        <span className="org-percentile">{operator.percentile}th</span>
                        <span
                          className="org-trend"
                          style={{ color: getTrendColor(operator.trend) }}
                        >
                          {operator.trend}
                        </span>
                      </div>
                    </div>
                  ))}
              </div>

              {showBenchmarks && (
                <div className="org-benchmark-info">
                  <div className="org-benchmark-item">
                    <span>Median:</span>
                    <span>{metric.benchmark.median.toFixed(1)}{metric.unit}</span>
                  </div>
                  <div className="org-benchmark-item">
                    <span>75th percentile:</span>
                    <span>{metric.benchmark.p75.toFixed(1)}{metric.unit}</span>
                  </div>
                  <div className="org-benchmark-item">
                    <span>90th percentile:</span>
                    <span>{metric.benchmark.p90.toFixed(1)}{metric.unit}</span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderCorrelations = () => (
    <div className="org-performance-correlations">
      <div className="org-section-header">
        <h3>Performance Correlations</h3>
        <div className="org-correlation-summary">
          {mockCorrelations.length} significant correlations identified
        </div>
      </div>

      <div className="org-correlations-list">
        {mockCorrelations.map((correlation, index) => (
          <div key={index} className="org-correlation-card">
            <div className="org-correlation-header">
              <div className="org-correlation-metrics">
                <span className="org-metric-name">{correlation.metric1.replace('_', ' ')}</span>
                <span className="org-correlation-symbol">↔</span>
                <span className="org-metric-name">{correlation.metric2.replace('_', ' ')}</span>
              </div>
              <div className="org-correlation-strength">
                <div
                  className="org-correlation-bar"
                  style={{
                    width: `${Math.abs(correlation.correlation) * 100}%`,
                    backgroundColor: correlation.correlation > 0 ? 'var(--org-success)' : 'var(--org-alert-high)'
                  }}
                />
                <span className="org-correlation-value">
                  r = {correlation.correlation.toFixed(2)}
                </span>
              </div>
            </div>

            <div className="org-correlation-details">
              <div className="org-significance">
                <span>Significance: p = {correlation.significance.toFixed(3)}</span>
                <span className={correlation.significance < 0.05 ? 'org-significant' : 'org-not-significant'}>
                  {correlation.significance < 0.05 ? 'Significant' : 'Not Significant'}
                </span>
              </div>
              <div className="org-correlation-insight">
                {correlation.insight}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="org-correlation-matrix">
        <h4>Correlation Heatmap</h4>
        <div className="org-heatmap-placeholder">
          <p>Interactive correlation heatmap would be rendered here with actual charting library</p>
          <div className="org-heatmap-legend">
            <div className="org-legend-item">
              <div className="org-legend-color" style={{ backgroundColor: 'var(--org-success)' }}></div>
              <span>Positive Correlation</span>
            </div>
            <div className="org-legend-item">
              <div className="org-legend-color" style={{ backgroundColor: 'var(--org-alert-high)' }}></div>
              <span>Negative Correlation</span>
            </div>
            <div className="org-legend-item">
              <div className="org-legend-color" style={{ backgroundColor: 'var(--org-text-muted)' }}></div>
              <span>No Correlation</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderTeams = () => (
    <div className="org-team-comparison">
      <div className="org-section-header">
        <h3>Team Performance Comparison</h3>
      </div>

      <div className="org-team-grid">
        {mockTeamComparisons.map((team) => (
          <div key={team.teamId} className="org-team-card">
            <div className="org-team-header">
              <h4>{team.teamName}</h4>
              <div className="org-team-info">
                <span>{team.operatorCount} operators</span>
              </div>
            </div>

            <div className="org-team-metrics">
              {Object.entries(team.avgMetrics).map(([metric, value]) => (
                <div key={metric} className="org-team-metric">
                  <span className="org-metric-label">{metric}</span>
                  <div className="org-metric-bar">
                    <div
                      className="org-metric-fill"
                      style={{
                        width: `${value}%`,
                        backgroundColor: getPerformanceColor(value, { median: 75, p75: 85, p90: 90 })
                      }}
                    />
                  </div>
                  <span className="org-metric-value">{value}</span>
                </div>
              ))}
            </div>

            {team.topPerformers.length > 0 && (
              <div className="org-team-performers">
                <h6>Top Performers:</h6>
                <div className="org-performer-list">
                  {team.topPerformers.map((operatorId) => (
                    <span key={operatorId} className="org-performer-tag">
                      {getOperatorName(operatorId)}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {team.improvementOpportunities.length > 0 && (
              <div className="org-team-opportunities">
                <h6>Improvement Opportunities:</h6>
                <div className="org-opportunity-list">
                  {team.improvementOpportunities.map((operatorId) => (
                    <span key={operatorId} className="org-opportunity-tag">
                      {getOperatorName(operatorId)}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className={`org-multi-operator-performance-comparison ${className}`}>
      <div className="org-component-header">
        <h2>Multi-Operator Performance Comparison</h2>
        <div className="org-header-controls">
          <div className="org-time-range-selector">
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value as TimeRange)}
            >
              <option value="1d">Last Day</option>
              <option value="7d">Last Week</option>
              <option value="30d">Last Month</option>
              <option value="90d">Last Quarter</option>
            </select>
          </div>
          <div className="org-view-controls">
            <label>
              <input
                type="checkbox"
                checked={showBenchmarks}
                onChange={(e) => setShowBenchmarks(e.target.checked)}
              />
              Show Benchmarks
            </label>
            <label>
              <input
                type="checkbox"
                checked={showOutliers}
                onChange={(e) => setShowOutliers(e.target.checked)}
              />
              Show Outliers
            </label>
            <label>
              <input
                type="checkbox"
                checked={normalizeScores}
                onChange={(e) => setNormalizeScores(e.target.checked)}
              />
              Normalize Scores
            </label>
          </div>
        </div>
      </div>

      <div className="org-comparison-tabs">
        {[
          { key: 'overview', label: 'Overview' },
          { key: 'detailed', label: 'Detailed View' },
          { key: 'rankings', label: 'Rankings' },
          { key: 'trends', label: 'Trends' },
          { key: 'correlations', label: 'Correlations' },
          { key: 'teams', label: 'Team Comparison' }
        ].map((tab) => (
          <button
            key={tab.key}
            className={`org-tab-button ${comparisonView === tab.key ? 'org-active' : ''}`}
            onClick={() => setComparisonView(tab.key as ComparisonView)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="org-comparison-content">
        {comparisonView === 'overview' && renderOverview()}
        {comparisonView === 'detailed' && renderOverview()} {/* Same as overview for now */}
        {comparisonView === 'rankings' && renderRankings()}
        {comparisonView === 'trends' && renderRankings()} {/* Reuse rankings for trends */}
        {comparisonView === 'correlations' && renderCorrelations()}
        {comparisonView === 'teams' && renderTeams()}
      </div>

      {mockAlerts.length > 0 && (
        <div className="org-performance-alerts">
          <h4>Performance Alerts</h4>
          {mockAlerts.map((alert) => (
            <div key={alert.id} className="org-alert-card">
              <div className="org-alert-header">
                <span className="org-operator-name">{getOperatorName(alert.operatorId)}</span>
                <span className={`org-alert-severity org-severity-${alert.severity}`}>
                  {alert.severity}
                </span>
                <span className="org-alert-time">
                  {Math.round((Date.now() - alert.triggeredAt) / 60000)}m ago
                </span>
              </div>
              <div className="org-alert-message">{alert.message}</div>
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
            Performance comparison for: {effectiveTeamId}
          </div>
        </div>
      )}
    </div>
  );
};

export default MultiOperatorPerformanceComparison;