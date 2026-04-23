import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useOrganizationalContext } from '../../../contexts/OrganizationalContext';

// Types for performance optimization recommendations
interface OptimizationRecommendation {
  readonly id: string;
  readonly title: string;
  readonly category:
    | 'performance'
    | 'resource'
    | 'quality'
    | 'collaboration'
    | 'workflow'
    | 'infrastructure';
  readonly priority: 'low' | 'medium' | 'high' | 'critical';
  readonly confidence: number; // 0-1
  readonly description: string;
  readonly problem: {
    readonly summary: string;
    readonly symptoms: string[];
    readonly affectedMetrics: string[];
    readonly impactScore: number; // 0-100
  };
  readonly solution: {
    readonly approach: string;
    readonly implementation: string[];
    readonly requirements: string[];
    readonly risks: string[];
    readonly alternatives: string[];
  };
  readonly impact: {
    readonly performanceGain: number; // percentage
    readonly costReduction: number; // percentage
    readonly qualityImprovement: number; // percentage
    readonly userSatisfaction: number; // percentage points
    readonly timeToValue: string;
  };
  readonly effort: {
    readonly complexity: 'simple' | 'moderate' | 'complex' | 'enterprise';
    readonly estimatedHours: number;
    readonly skillsRequired: string[];
    readonly teamInvolvement: string[];
  };
  readonly cost: {
    readonly implementation: number; // dollars
    readonly ongoing: number; // dollars per month
    readonly roi: {
      readonly breakeven: string;
      readonly yearOneValue: number; // dollars
      readonly confidenceInterval: [number, number]; // min, max
    };
  };
  readonly evidence: {
    readonly dataPoints: string[];
    readonly benchmarks: string[];
    readonly similarCases: string[];
  };
  readonly timeline: {
    readonly phases: Array<{
      readonly name: string;
      readonly duration: string;
      readonly deliverables: string[];
    }>;
    readonly milestones: Array<{
      readonly name: string;
      readonly date: string;
      readonly success_criteria: string[];
    }>;
  };
  readonly monitoring: {
    readonly kpis: string[];
    readonly checkpoints: string[];
    readonly rollbackPlan: string;
  };
}

interface RecommendationGroup {
  readonly groupId: string;
  readonly name: string;
  readonly description: string;
  readonly recommendations: string[]; // recommendation IDs
  readonly combinedImpact: {
    readonly totalGain: number;
    readonly synergies: string[];
    readonly conflicts: string[];
  };
  readonly implementationOrder: string[];
}

interface OptimizationAlert {
  readonly id: string;
  readonly type: 'urgent_optimization' | 'cost_spike' | 'performance_regression' | 'resource_waste';
  readonly severity: 'low' | 'medium' | 'high' | 'critical';
  readonly message: string;
  readonly affectedAreas: string[];
  readonly recommendationIds: string[];
  readonly triggeredAt: number;
}

interface ImplementationPlan {
  readonly planId: string;
  readonly name: string;
  readonly selectedRecommendations: string[];
  readonly phases: Array<{
    readonly phase: number;
    readonly name: string;
    readonly duration: string;
    readonly recommendations: string[];
    readonly dependencies: string[];
  }>;
  readonly totalCost: number;
  readonly totalValue: number;
  readonly riskAssessment: string[];
}

type ViewMode = 'recommendations' | 'groups' | 'implementation' | 'impact' | 'monitoring';
type FilterBy = 'all' | 'high_impact' | 'quick_wins' | 'strategic' | 'technical';
type SortBy = 'priority' | 'impact' | 'effort' | 'roi' | 'confidence';

interface Props {
  readonly className?: string;
  readonly teamId?: string;
  readonly autoGenerate?: boolean;
  readonly onRecommendationSelect?: (recommendation: OptimizationRecommendation) => void;
  readonly onPlanCreate?: (plan: ImplementationPlan) => void;
}

export const PerformanceOptimizationRecommendations: React.FC<Props> = ({
  className = '',
  teamId,
  autoGenerate = true,
  onRecommendationSelect,
  onPlanCreate,
}) => {
  const { selectedTeam, operatorContext } = useOrganizationalContext();
  const [viewMode, setViewMode] = useState<ViewMode>('recommendations');
  const [filterBy, setFilterBy] = useState<FilterBy>('all');
  const [sortBy, setSortBy] = useState<SortBy>('priority');
  const [selectedRecommendations, _setSelectedRecommendations] = useState<Set<string>>(new Set());
  const [selectedRecommendation, setSelectedRecommendation] = useState<string | null>(null);
  const [showImplemented, setShowImplemented] = useState(false);
  const [generateInProgress, setGenerateInProgress] = useState(false);

  const effectiveTeamId = teamId || selectedTeam;

  // Mock recommendations data - replace with actual AI-generated recommendations
  const mockRecommendations: OptimizationRecommendation[] = useMemo(
    () => [
      {
        id: 'rec-001',
        title: 'Implement Semantic Query Caching',
        category: 'performance',
        priority: 'high',
        confidence: 0.87,
        description:
          'Deploy semantic similarity-based caching to reduce redundant query processing and improve response times',
        problem: {
          summary: '35% of queries show high semantic similarity but bypass existing cache',
          symptoms: [
            'Cache hit rate below optimal (68% vs 85% target)',
            'Redundant processing of similar queries',
            'Increased token consumption for similar requests',
          ],
          affectedMetrics: ['cache_hit_rate', 'query_latency', 'token_usage'],
          impactScore: 85,
        },
        solution: {
          approach: 'Implement vector-based semantic similarity matching for query caching',
          implementation: [
            'Deploy embedding service for query vectorization',
            'Implement similarity threshold-based cache lookup',
            'Add cache warming for high-frequency query patterns',
            'Configure automatic cache invalidation policies',
          ],
          requirements: [
            'Vector database (e.g., Pinecone, Weaviate)',
            'Embedding model deployment',
            'Cache infrastructure scaling',
            'Monitoring and alerting setup',
          ],
          risks: [
            'Initial performance overhead during index building',
            'Similarity threshold tuning required',
            'Increased infrastructure complexity',
          ],
          alternatives: [
            'Traditional key-based caching with improved key normalization',
            'Hybrid approach with both semantic and syntactic matching',
          ],
        },
        impact: {
          performanceGain: 40,
          costReduction: 25,
          qualityImprovement: 15,
          userSatisfaction: 30,
          timeToValue: '6-8 weeks',
        },
        effort: {
          complexity: 'moderate',
          estimatedHours: 120,
          skillsRequired: ['Machine Learning', 'Vector Databases', 'Cache Architecture'],
          teamInvolvement: ['Backend Team', 'ML Team', 'DevOps'],
        },
        cost: {
          implementation: 15000,
          ongoing: 800,
          roi: {
            breakeven: '4 months',
            yearOneValue: 45000,
            confidenceInterval: [35000, 60000],
          },
        },
        evidence: {
          dataPoints: [
            '35% query similarity overlap identified',
            'Current cache miss penalty: 2.3s average',
            'Token waste: $1,200/month on duplicate processing',
          ],
          benchmarks: [
            'Industry standard: 85% cache hit rate',
            'Similar implementation: 45% performance improvement',
            'Vector caching ROI: 300% within 12 months',
          ],
          similarCases: [
            'Company X: 60% latency reduction with semantic caching',
            'Platform Y: 40% cost savings with vector-based cache',
          ],
        },
        timeline: {
          phases: [
            {
              name: 'Research & Design',
              duration: '2 weeks',
              deliverables: ['Architecture design', 'Technology selection', 'Performance modeling'],
            },
            {
              name: 'Implementation',
              duration: '4 weeks',
              deliverables: ['Vector service deployment', 'Cache integration', 'Testing framework'],
            },
            {
              name: 'Optimization & Rollout',
              duration: '2 weeks',
              deliverables: ['Performance tuning', 'Production deployment', 'Monitoring setup'],
            },
          ],
          milestones: [
            {
              name: 'Proof of Concept',
              date: '2 weeks',
              success_criteria: ['10% cache hit improvement', 'No performance degradation'],
            },
            {
              name: 'Beta Deployment',
              date: '6 weeks',
              success_criteria: ['25% cache hit improvement', 'User acceptance testing passed'],
            },
          ],
        },
        monitoring: {
          kpis: ['Cache hit rate', 'Query latency P95', 'Token consumption', 'User satisfaction'],
          checkpoints: ['Weekly performance reviews', 'Monthly ROI assessment'],
          rollbackPlan: 'Immediate fallback to existing cache with 5-minute switchover',
        },
      },
      {
        id: 'rec-002',
        title: 'Operator Workflow Optimization',
        category: 'workflow',
        priority: 'medium',
        confidence: 0.73,
        description:
          'Streamline repetitive operator workflows through intelligent automation and pattern recognition',
        problem: {
          summary: 'Analysis shows 25% of operator time spent on repetitive, automatable tasks',
          symptoms: [
            'High frequency of similar session patterns',
            'Manual context switching overhead',
            'Repetitive query formulation',
          ],
          affectedMetrics: ['operator_efficiency', 'task_completion_time', 'user_satisfaction'],
          impactScore: 70,
        },
        solution: {
          approach: 'Deploy workflow automation with smart suggestions and context preservation',
          implementation: [
            'Pattern recognition for common workflows',
            'Automated context switching and state preservation',
            'Intelligent query suggestions based on session history',
            'Custom workflow templates for frequent patterns',
          ],
          requirements: [
            'Workflow analysis engine',
            'Pattern matching algorithms',
            'User interface enhancements',
            'Training data collection',
          ],
          risks: [
            'User adoption resistance',
            'Over-automation reducing flexibility',
            'Pattern recognition accuracy concerns',
          ],
          alternatives: [
            'Manual workflow documentation and training',
            'Simple macro-based automation',
          ],
        },
        impact: {
          performanceGain: 25,
          costReduction: 15,
          qualityImprovement: 20,
          userSatisfaction: 35,
          timeToValue: '4-6 weeks',
        },
        effort: {
          complexity: 'moderate',
          estimatedHours: 80,
          skillsRequired: ['UI/UX Design', 'Workflow Analysis', 'Pattern Recognition'],
          teamInvolvement: ['Frontend Team', 'UX Team', 'Product Team'],
        },
        cost: {
          implementation: 12000,
          ongoing: 500,
          roi: {
            breakeven: '3 months',
            yearOneValue: 32000,
            confidenceInterval: [25000, 42000],
          },
        },
        evidence: {
          dataPoints: [
            '25% time spent on repetitive tasks',
            'Average 3.2 context switches per session',
            '18 common workflow patterns identified',
          ],
          benchmarks: [
            'Workflow automation: 30% efficiency gain typical',
            'Context switching cost: 23 minutes lost per switch',
          ],
          similarCases: [
            'Team A: 40% productivity increase with workflow automation',
            'Organization B: 50% reduction in task completion time',
          ],
        },
        timeline: {
          phases: [
            {
              name: 'Analysis & Design',
              duration: '1 week',
              deliverables: ['Workflow analysis report', 'Automation opportunities', 'UI mockups'],
            },
            {
              name: 'Development',
              duration: '3 weeks',
              deliverables: [
                'Pattern recognition engine',
                'UI enhancements',
                'Automation framework',
              ],
            },
            {
              name: 'Testing & Rollout',
              duration: '2 weeks',
              deliverables: ['User testing', 'Feedback integration', 'Production deployment'],
            },
          ],
          milestones: [
            {
              name: 'Pattern Analysis Complete',
              date: '1 week',
              success_criteria: ['18+ patterns identified', 'Automation opportunities prioritized'],
            },
            {
              name: 'Beta Testing',
              date: '4 weeks',
              success_criteria: ['10+ users testing', '20% efficiency improvement measured'],
            },
          ],
        },
        monitoring: {
          kpis: ['Task completion time', 'Context switch frequency', 'User satisfaction score'],
          checkpoints: ['Bi-weekly user feedback sessions', 'Monthly efficiency metrics'],
          rollbackPlan: 'Feature flags allow instant disable with no impact on core functionality',
        },
      },
      {
        id: 'rec-003',
        title: 'Resource Allocation Optimization',
        category: 'resource',
        priority: 'critical',
        confidence: 0.91,
        description:
          'Optimize resource allocation based on team workload patterns and performance analytics',
        problem: {
          summary: 'Resource utilization imbalance causing 40% efficiency loss in peak hours',
          symptoms: [
            'Peak hour bottlenecks with 200% over-capacity',
            'Off-peak resource underutilization (30% capacity)',
            'Team-specific resource contention patterns',
          ],
          affectedMetrics: ['resource_utilization', 'query_latency', 'cost_efficiency'],
          impactScore: 92,
        },
        solution: {
          approach: 'Implement dynamic resource allocation with predictive scaling',
          implementation: [
            'Workload pattern analysis and prediction',
            'Auto-scaling policies based on team activity',
            'Resource pool optimization for different query types',
            'Load balancing improvements for peak distribution',
          ],
          requirements: [
            'Predictive analytics platform',
            'Auto-scaling infrastructure',
            'Monitoring and alerting enhancements',
            'Resource pool management system',
          ],
          risks: [
            'Scaling latency during sudden spikes',
            'Cost implications of over-provisioning',
            'Complexity in multi-team resource sharing',
          ],
          alternatives: [
            'Manual capacity planning with scheduled scaling',
            'Fixed resource pools with overflow handling',
          ],
        },
        impact: {
          performanceGain: 60,
          costReduction: 35,
          qualityImprovement: 25,
          userSatisfaction: 45,
          timeToValue: '3-4 weeks',
        },
        effort: {
          complexity: 'complex',
          estimatedHours: 160,
          skillsRequired: [
            'Infrastructure Architecture',
            'Predictive Analytics',
            'Performance Optimization',
          ],
          teamInvolvement: ['Infrastructure Team', 'Data Science Team', 'All User Teams'],
        },
        cost: {
          implementation: 25000,
          ongoing: 1200,
          roi: {
            breakeven: '2 months',
            yearOneValue: 85000,
            confidenceInterval: [70000, 105000],
          },
        },
        evidence: {
          dataPoints: [
            '200% over-capacity during peak hours (9-11 AM, 2-4 PM)',
            '30% utilization during off-peak hours',
            '$3,200/month waste due to poor allocation',
          ],
          benchmarks: [
            'Industry optimal: 75-85% average utilization',
            'Auto-scaling improvement: 50% efficiency gain typical',
          ],
          similarCases: [
            'Enterprise C: 70% cost reduction with predictive scaling',
            'Platform D: 80% performance improvement with dynamic allocation',
          ],
        },
        timeline: {
          phases: [
            {
              name: 'Analysis & Planning',
              duration: '1 week',
              deliverables: ['Workload analysis', 'Scaling strategy', 'Cost modeling'],
            },
            {
              name: 'Infrastructure Setup',
              duration: '2 weeks',
              deliverables: ['Auto-scaling deployment', 'Monitoring setup', 'Resource pools'],
            },
            {
              name: 'Optimization & Fine-tuning',
              duration: '1 week',
              deliverables: ['Performance tuning', 'Policy optimization', 'Validation testing'],
            },
          ],
          milestones: [
            {
              name: 'Predictive Model Ready',
              date: '1 week',
              success_criteria: ['85%+ prediction accuracy', 'Real-time scaling decisions'],
            },
            {
              name: 'Production Validation',
              date: '3 weeks',
              success_criteria: ['30% cost reduction achieved', 'No performance degradation'],
            },
          ],
        },
        monitoring: {
          kpis: [
            'Resource utilization %',
            'Peak hour latency',
            'Cost per query',
            'Scaling accuracy',
          ],
          checkpoints: ['Daily scaling performance review', 'Weekly cost optimization assessment'],
          rollbackPlan: 'Automated failover to fixed scaling with 2-minute transition',
        },
      },
    ],
    [],
  );

  const mockGroups: RecommendationGroup[] = useMemo(
    () => [
      {
        groupId: 'group-performance',
        name: 'Performance Enhancement Suite',
        description:
          'Comprehensive performance improvements targeting latency, throughput, and user experience',
        recommendations: ['rec-001', 'rec-003'],
        combinedImpact: {
          totalGain: 75,
          synergies: [
            'Semantic caching reduces load on optimized resource pools',
            'Resource allocation improvements enhance cache performance',
          ],
          conflicts: [],
        },
        implementationOrder: ['rec-003', 'rec-001'],
      },
      {
        groupId: 'group-efficiency',
        name: 'Operational Efficiency Package',
        description: 'Workflow and resource optimizations for maximum operational efficiency',
        recommendations: ['rec-002', 'rec-003'],
        combinedImpact: {
          totalGain: 65,
          synergies: [
            'Automated workflows reduce resource contention',
            'Resource optimization enables better workflow performance',
          ],
          conflicts: [],
        },
        implementationOrder: ['rec-002', 'rec-003'],
      },
    ],
    [],
  );

  const mockAlerts: OptimizationAlert[] = useMemo(
    () => [
      {
        id: 'alert-opt-001',
        type: 'cost_spike',
        severity: 'high',
        message: 'Resource costs increased 45% due to inefficient allocation patterns',
        affectedAreas: ['Infrastructure', 'Query Processing'],
        recommendationIds: ['rec-003'],
        triggeredAt: Date.now() - 1800000,
      },
      {
        id: 'alert-opt-002',
        type: 'performance_regression',
        severity: 'medium',
        message: 'Cache hit rate declined 12% over the past week',
        affectedAreas: ['Caching', 'Query Performance'],
        recommendationIds: ['rec-001'],
        triggeredAt: Date.now() - 3600000,
      },
    ],
    [],
  );

  // Generate recommendations effect
  useEffect(() => {
    if (autoGenerate && generateInProgress) {
      const timer = setTimeout(() => {
        setGenerateInProgress(false);
        console.log('AI recommendations generated');
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [autoGenerate, generateInProgress]);

  const triggerRecommendationGeneration = () => {
    setGenerateInProgress(true);
    // In real implementation, this would call the AI recommendation service
    console.log('Triggering AI recommendation generation...');
  };

  const filteredRecommendations = useMemo(() => {
    let filtered = mockRecommendations;

    // Apply filters
    if (filterBy === 'high_impact') {
      filtered = filtered.filter((rec) => rec.problem.impactScore >= 80);
    } else if (filterBy === 'quick_wins') {
      filtered = filtered.filter(
        (rec) => rec.effort.complexity === 'simple' && rec.impact.performanceGain >= 20,
      );
    } else if (filterBy === 'strategic') {
      filtered = filtered.filter((rec) => rec.priority === 'high' || rec.priority === 'critical');
    } else if (filterBy === 'technical') {
      filtered = filtered.filter((rec) => ['performance', 'infrastructure'].includes(rec.category));
    }

    // Apply sorting
    return filtered.sort((a, b) => {
      switch (sortBy) {
        case 'priority': {
          const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
          return priorityOrder[b.priority] - priorityOrder[a.priority];
        }
        case 'impact':
          return b.problem.impactScore - a.problem.impactScore;
        case 'effort': {
          const effortOrder = { simple: 1, moderate: 2, complex: 3, enterprise: 4 };
          return effortOrder[a.effort.complexity] - effortOrder[b.effort.complexity];
        }
        case 'roi':
          return b.cost.roi.yearOneValue - a.cost.roi.yearOneValue;
        case 'confidence':
          return b.confidence - a.confidence;
        default:
          return 0;
      }
    });
  }, [filterBy, sortBy, mockRecommendations]);

  const getPriorityColor = (priority: string): string => {
    switch (priority) {
      case 'critical':
        return 'var(--org-alert-critical)';
      case 'high':
        return 'var(--org-alert-high)';
      case 'medium':
        return 'var(--org-alert-medium)';
      case 'low':
        return 'var(--org-alert-low)';
      default:
        return 'var(--org-text-muted)';
    }
  };

  const getCategoryIcon = (category: string): string => {
    switch (category) {
      case 'performance':
        return '⚡';
      case 'resource':
        return '💰';
      case 'quality':
        return '✨';
      case 'collaboration':
        return '👥';
      case 'workflow':
        return '🔄';
      case 'infrastructure':
        return '🏗️';
      default:
        return '📊';
    }
  };

  const renderRecommendations = () => (
    <div className="org-recommendations-list">
      <div className="org-recommendations-header">
        <div className="org-filter-controls">
          <select value={filterBy} onChange={(e) => setFilterBy(e.target.value as FilterBy)}>
            <option value="all">All Recommendations</option>
            <option value="high_impact">High Impact</option>
            <option value="quick_wins">Quick Wins</option>
            <option value="strategic">Strategic</option>
            <option value="technical">Technical</option>
          </select>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortBy)}>
            <option value="priority">Sort by Priority</option>
            <option value="impact">Sort by Impact</option>
            <option value="effort">Sort by Effort</option>
            <option value="roi">Sort by ROI</option>
            <option value="confidence">Sort by Confidence</option>
          </select>
        </div>
        <div className="org-generation-controls">
          <button
            className="org-button org-button-primary"
            onClick={triggerRecommendationGeneration}
            disabled={generateInProgress}
          >
            {generateInProgress ? 'Generating...' : 'Generate New Recommendations'}
          </button>
        </div>
      </div>

      <div className="org-recommendations-grid">
        {filteredRecommendations.map((recommendation) => (
          <div
            key={recommendation.id}
            className={`org-recommendation-card ${selectedRecommendation === recommendation.id ? 'org-selected' : ''}`}
            onClick={() =>
              setSelectedRecommendation(
                selectedRecommendation === recommendation.id ? null : recommendation.id,
              )
            }
          >
            <div className="org-recommendation-header">
              <div className="org-recommendation-title">
                <span className="org-category-icon">
                  {getCategoryIcon(recommendation.category)}
                </span>
                <h4>{recommendation.title}</h4>
              </div>
              <div className="org-recommendation-badges">
                <span
                  className="org-priority-badge"
                  style={{ backgroundColor: getPriorityColor(recommendation.priority) }}
                >
                  {recommendation.priority}
                </span>
                <span className="org-confidence-badge">
                  {Math.round(recommendation.confidence * 100)}% confidence
                </span>
              </div>
            </div>

            <div className="org-recommendation-summary">
              <p>{recommendation.description}</p>
              <div className="org-problem-summary">
                <strong>Problem:</strong> {recommendation.problem.summary}
              </div>
            </div>

            <div className="org-impact-preview">
              <div className="org-impact-metrics">
                <div className="org-impact-item">
                  <span>Performance</span>
                  <span className="org-positive">+{recommendation.impact.performanceGain}%</span>
                </div>
                <div className="org-impact-item">
                  <span>Cost</span>
                  <span className="org-positive">-{recommendation.impact.costReduction}%</span>
                </div>
                <div className="org-impact-item">
                  <span>Quality</span>
                  <span className="org-positive">+{recommendation.impact.qualityImprovement}%</span>
                </div>
                <div className="org-impact-item">
                  <span>Satisfaction</span>
                  <span className="org-positive">+{recommendation.impact.userSatisfaction}pp</span>
                </div>
              </div>
              <div className="org-effort-info">
                <span
                  className={`org-complexity-indicator org-complexity-${recommendation.effort.complexity}`}
                >
                  {recommendation.effort.complexity}
                </span>
                <span className="org-timeline">{recommendation.impact.timeToValue}</span>
                <span className="org-roi">
                  ${recommendation.cost.roi.yearOneValue.toLocaleString()} ROI
                </span>
              </div>
            </div>

            {selectedRecommendation === recommendation.id && (
              <div className="org-recommendation-details">
                <div className="org-solution-details">
                  <h5>Solution Approach</h5>
                  <p>{recommendation.solution.approach}</p>
                  <div className="org-implementation-steps">
                    <h6>Implementation Steps:</h6>
                    <ol>
                      {recommendation.solution.implementation.map((step, index) => (
                        <li key={index}>{step}</li>
                      ))}
                    </ol>
                  </div>
                </div>

                <div className="org-cost-benefit">
                  <div className="org-cost-breakdown">
                    <h6>Cost Analysis</h6>
                    <div className="org-cost-items">
                      <div className="org-cost-item">
                        <span>Implementation:</span>
                        <span>${recommendation.cost.implementation.toLocaleString()}</span>
                      </div>
                      <div className="org-cost-item">
                        <span>Ongoing (monthly):</span>
                        <span>${recommendation.cost.ongoing.toLocaleString()}</span>
                      </div>
                      <div className="org-cost-item">
                        <span>Breakeven:</span>
                        <span>{recommendation.cost.roi.breakeven}</span>
                      </div>
                    </div>
                  </div>

                  <div className="org-risk-assessment">
                    <h6>Risks & Mitigation</h6>
                    <ul>
                      {recommendation.solution.risks.map((risk, index) => (
                        <li key={index}>{risk}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="org-timeline-preview">
                  <h6>Implementation Timeline</h6>
                  <div className="org-phases">
                    {recommendation.timeline.phases.map((phase, index) => (
                      <div key={index} className="org-phase">
                        <div className="org-phase-header">
                          <span className="org-phase-name">{phase.name}</span>
                          <span className="org-phase-duration">{phase.duration}</span>
                        </div>
                        <div className="org-phase-deliverables">
                          {phase.deliverables.join(' • ')}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="org-recommendation-actions">
                  <button
                    className="org-button org-button-primary"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRecommendationSelect?.(recommendation);
                    }}
                  >
                    Select for Implementation
                  </button>
                  <button className="org-button org-button-secondary">Add to Plan</button>
                  <button className="org-button org-button-tertiary">View Evidence</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  const renderGroups = () => (
    <div className="org-recommendation-groups">
      <div className="org-section-header">
        <h3>Recommendation Groups</h3>
        <div className="org-groups-summary">
          {mockGroups.length} optimization packages identified
        </div>
      </div>

      <div className="org-groups-list">
        {mockGroups.map((group) => (
          <div key={group.groupId} className="org-group-card">
            <div className="org-group-header">
              <h4>{group.name}</h4>
              <div className="org-combined-impact">
                Total Impact: +{group.combinedImpact.totalGain}%
              </div>
            </div>

            <div className="org-group-description">{group.description}</div>

            <div className="org-group-recommendations">
              <h5>Included Recommendations:</h5>
              <div className="org-rec-list">
                {group.recommendations.map((recId) => {
                  const rec = mockRecommendations.find((r) => r.id === recId);
                  return rec ? (
                    <div key={recId} className="org-rec-item">
                      <span className="org-rec-title">{rec.title}</span>
                      <span className={`org-rec-priority org-priority-${rec.priority}`}>
                        {rec.priority}
                      </span>
                    </div>
                  ) : null;
                })}
              </div>
            </div>

            <div className="org-synergies">
              <h6>Synergies:</h6>
              <ul>
                {group.combinedImpact.synergies.map((synergy, index) => (
                  <li key={index}>{synergy}</li>
                ))}
              </ul>
            </div>

            <div className="org-implementation-order">
              <h6>Recommended Implementation Order:</h6>
              <ol>
                {group.implementationOrder.map((recId, index) => {
                  const rec = mockRecommendations.find((r) => r.id === recId);
                  return rec ? <li key={index}>{rec.title}</li> : null;
                })}
              </ol>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderImpact = () => (
    <div className="org-impact-analysis">
      <div className="org-section-header">
        <h3>Impact Analysis</h3>
      </div>

      <div className="org-impact-summary">
        <div className="org-impact-totals">
          <div className="org-impact-card">
            <div className="org-impact-value">
              +{mockRecommendations.reduce((sum, rec) => sum + rec.impact.performanceGain, 0)}%
            </div>
            <div className="org-impact-label">Total Performance Gain</div>
          </div>
          <div className="org-impact-card">
            <div className="org-impact-value">
              $
              {mockRecommendations
                .reduce((sum, rec) => sum + rec.cost.roi.yearOneValue, 0)
                .toLocaleString()}
            </div>
            <div className="org-impact-label">Total Year One Value</div>
          </div>
          <div className="org-impact-card">
            <div className="org-impact-value">
              {Math.round(
                mockRecommendations.reduce((sum, rec) => sum + rec.effort.estimatedHours, 0) / 40,
              )}
            </div>
            <div className="org-impact-label">Weeks to Implement All</div>
          </div>
        </div>
      </div>

      <div className="org-impact-visualization">
        <h4>Impact vs Effort Matrix</h4>
        <div className="org-matrix-chart">
          <svg viewBox="0 0 400 300">
            {/* Grid */}
            <defs>
              <pattern id="grid" width="40" height="30" patternUnits="userSpaceOnUse">
                <path
                  d="M 40 0 L 0 0 0 30"
                  fill="none"
                  stroke="var(--org-border)"
                  strokeWidth="1"
                  opacity="0.3"
                />
              </pattern>
            </defs>
            <rect width="400" height="300" fill="url(#grid)" />

            {/* Quadrant labels */}
            <text x="100" y="50" textAnchor="middle" className="org-quadrant-label">
              High Impact, Low Effort
            </text>
            <text x="300" y="50" textAnchor="middle" className="org-quadrant-label">
              High Impact, High Effort
            </text>
            <text x="100" y="250" textAnchor="middle" className="org-quadrant-label">
              Low Impact, Low Effort
            </text>
            <text x="300" y="250" textAnchor="middle" className="org-quadrant-label">
              Low Impact, High Effort
            </text>

            {/* Plot recommendations */}
            {mockRecommendations.map((rec, _index) => {
              const effortMap = { simple: 25, moderate: 75, complex: 125, enterprise: 175 };
              const x = 50 + effortMap[rec.effort.complexity];
              const y = 250 - rec.problem.impactScore * 2;

              return (
                <circle
                  key={rec.id}
                  cx={x}
                  cy={y}
                  r="8"
                  fill={getPriorityColor(rec.priority)}
                  opacity="0.7"
                  title={rec.title}
                />
              );
            })}
          </svg>
        </div>
      </div>
    </div>
  );

  return (
    <div className={`org-performance-optimization-recommendations ${className}`}>
      <div className="org-component-header">
        <h2>Performance Optimization Recommendations</h2>
        <div className="org-header-controls">
          <div className="org-recommendation-stats">
            <span>{filteredRecommendations.length} recommendations</span>
            <span>{selectedRecommendations.size} selected</span>
          </div>
          <div className="org-view-controls">
            <label>
              <input
                type="checkbox"
                checked={showImplemented}
                onChange={(e) => setShowImplemented(e.target.checked)}
              />
              Show Implemented
            </label>
          </div>
        </div>
      </div>

      <div className="org-optimization-tabs">
        {[
          { key: 'recommendations', label: `Recommendations (${filteredRecommendations.length})` },
          { key: 'groups', label: `Groups (${mockGroups.length})` },
          { key: 'implementation', label: 'Implementation' },
          { key: 'impact', label: 'Impact Analysis' },
          { key: 'monitoring', label: 'Monitoring' },
        ].map((tab) => (
          <button
            key={tab.key}
            className={`org-tab-button ${viewMode === tab.key ? 'org-active' : ''}`}
            onClick={() => setViewMode(tab.key as ViewMode)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="org-optimization-content">
        {viewMode === 'recommendations' && renderRecommendations()}
        {viewMode === 'groups' && renderGroups()}
        {viewMode === 'implementation' && renderRecommendations()} {/* Reuse for now */}
        {viewMode === 'impact' && renderImpact()}
        {viewMode === 'monitoring' && renderImpact()} {/* Reuse for now */}
      </div>

      {mockAlerts.length > 0 && (
        <div className="org-optimization-alerts">
          <h4>Optimization Alerts</h4>
          {mockAlerts.map((alert) => (
            <div key={alert.id} className="org-alert-card">
              <div className="org-alert-header">
                <span className="org-alert-type">{alert.type.replace('_', ' ')}</span>
                <span className={`org-alert-severity org-severity-${alert.severity}`}>
                  {alert.severity}
                </span>
                <span className="org-alert-time">
                  {Math.round((Date.now() - alert.triggeredAt) / 60000)}m ago
                </span>
              </div>
              <div className="org-alert-message">{alert.message}</div>
              <div className="org-alert-areas">
                Affected areas: {alert.affectedAreas.join(', ')}
              </div>
              <div className="org-alert-recommendations">
                Recommended actions: {alert.recommendationIds.length} items
              </div>
            </div>
          ))}
        </div>
      )}

      {effectiveTeamId && (
        <div className="org-context-info">
          <div className="org-context-badge">
            Optimization recommendations for: {effectiveTeamId}
          </div>
        </div>
      )}
    </div>
  );
};

export default PerformanceOptimizationRecommendations;
