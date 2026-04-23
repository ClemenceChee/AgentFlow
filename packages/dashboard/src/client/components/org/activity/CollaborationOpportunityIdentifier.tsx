import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useOrganizationalContext } from '../../../contexts/OrganizationalContext';

// Types for collaboration analysis
interface CollaborationGap {
  readonly id: string;
  readonly type:
    | 'knowledge_silo'
    | 'skill_gap'
    | 'communication_barrier'
    | 'workflow_inefficiency'
    | 'resource_bottleneck';
  readonly severity: 'low' | 'medium' | 'high' | 'critical';
  readonly affectedOperators: string[];
  readonly affectedTeams: string[];
  readonly description: string;
  readonly impact: {
    readonly productivityLoss: number; // percentage
    readonly qualityRisk: number; // 0-1 score
    readonly learningOpportunity: number; // 0-1 score
  };
  readonly identifiedAt: number;
}

interface OptimizationOpportunity {
  readonly id: string;
  readonly title: string;
  readonly category:
    | 'mentoring'
    | 'knowledge_sharing'
    | 'process_improvement'
    | 'resource_allocation'
    | 'skill_development';
  readonly priority: 'low' | 'medium' | 'high' | 'urgent';
  readonly description: string;
  readonly expectedBenefits: {
    readonly productivityGain: number; // percentage
    readonly qualityImprovement: number; // 0-1 score
    readonly learningAcceleration: number; // 0-1 score
    readonly collaborationScore: number; // 0-1 score
  };
  readonly implementation: {
    readonly effort: 'low' | 'medium' | 'high';
    readonly timeline: string;
    readonly resources: string[];
    readonly steps: string[];
  };
  readonly roi: {
    readonly score: number; // 0-100
    readonly paybackPeriod: string;
    readonly confidenceLevel: number; // 0-1
  };
  readonly relatedGaps: string[];
}

interface CollaborationMetrics {
  readonly overallScore: number; // 0-100
  readonly knowledgeSharingRate: number; // percentage
  readonly crossTeamCollaboration: number; // 0-1 score
  readonly mentorshipActivity: number; // sessions per week
  readonly problemSolvingEfficiency: number; // average resolution time
  readonly learningVelocity: number; // skills gained per month
  readonly trends: {
    readonly period: string;
    readonly change: number; // percentage change
    readonly trajectory: 'improving' | 'stable' | 'declining';
  };
}

interface TeamOptimizationSuggestion {
  readonly id: string;
  readonly teamId: string;
  readonly teamName: string;
  readonly suggestion: string;
  readonly category: 'structure' | 'process' | 'skills' | 'communication' | 'tools';
  readonly impact: 'low' | 'medium' | 'high' | 'transformative';
  readonly implementation: {
    readonly complexity: 'simple' | 'moderate' | 'complex';
    readonly timeframe: string;
    readonly requirements: string[];
  };
  readonly expectedOutcome: string;
  readonly successMetrics: string[];
}

interface CollaborationNetwork {
  readonly nodes: Array<{
    readonly id: string;
    readonly type: 'operator' | 'team' | 'skill' | 'project';
    readonly label: string;
    readonly strength: number; // 0-1 connection strength
    readonly centrality: number; // network centrality score
  }>;
  readonly edges: Array<{
    readonly source: string;
    readonly target: string;
    readonly weight: number; // collaboration frequency
    readonly type: 'knowledge_transfer' | 'project_collaboration' | 'mentoring' | 'problem_solving';
  }>;
}

type ViewMode = 'overview' | 'gaps' | 'opportunities' | 'network' | 'suggestions';

interface Props {
  readonly className?: string;
  readonly onOpportunitySelect?: (opportunity: OptimizationOpportunity) => void;
  readonly showRealTimeUpdates?: boolean;
}

export const CollaborationOpportunityIdentifier: React.FC<Props> = ({
  className = '',
  onOpportunitySelect,
  showRealTimeUpdates = true,
}) => {
  const { selectedTeam, operatorContext } = useOrganizationalContext();
  const [viewMode, setViewMode] = useState<ViewMode>('overview');
  const [selectedGap, setSelectedGap] = useState<string | null>(null);
  const [selectedOpportunity, setSelectedOpportunity] = useState<string | null>(null);
  const [networkViewMode, setNetworkViewMode] = useState<
    'knowledge' | 'collaboration' | 'mentoring'
  >('collaboration');
  const [timeRange, setTimeRange] = useState<'week' | 'month' | 'quarter'>('month');
  const [autoRefresh, setAutoRefresh] = useState(showRealTimeUpdates);

  // Mock data - replace with actual API calls
  const mockGaps: CollaborationGap[] = useMemo(
    () => [
      {
        id: 'gap-001',
        type: 'knowledge_silo',
        severity: 'high',
        affectedOperators: ['op-123', 'op-456'],
        affectedTeams: ['team-frontend', 'team-backend'],
        description:
          'Frontend team lacks backend database optimization knowledge, leading to repeated performance issues',
        impact: {
          productivityLoss: 25,
          qualityRisk: 0.7,
          learningOpportunity: 0.9,
        },
        identifiedAt: Date.now() - 86400000,
      },
      {
        id: 'gap-002',
        type: 'communication_barrier',
        severity: 'medium',
        affectedOperators: ['op-789', 'op-012'],
        affectedTeams: ['team-design', 'team-frontend'],
        description:
          'Asynchronous communication gaps between design and frontend causing implementation delays',
        impact: {
          productivityLoss: 15,
          qualityRisk: 0.5,
          learningOpportunity: 0.6,
        },
        identifiedAt: Date.now() - 172800000,
      },
      {
        id: 'gap-003',
        type: 'skill_gap',
        severity: 'critical',
        affectedOperators: ['op-345', 'op-678'],
        affectedTeams: ['team-infra'],
        description:
          'Critical kubernetes expertise gap in infrastructure team affecting deployment reliability',
        impact: {
          productivityLoss: 40,
          qualityRisk: 0.9,
          learningOpportunity: 0.8,
        },
        identifiedAt: Date.now() - 259200000,
      },
    ],
    [],
  );

  const mockOpportunities: OptimizationOpportunity[] = useMemo(
    () => [
      {
        id: 'opp-001',
        title: 'Cross-Team Database Knowledge Transfer Program',
        category: 'knowledge_sharing',
        priority: 'high',
        description:
          'Implement weekly knowledge sharing sessions between backend and frontend teams focusing on database optimization techniques',
        expectedBenefits: {
          productivityGain: 30,
          qualityImprovement: 0.8,
          learningAcceleration: 0.9,
          collaborationScore: 0.7,
        },
        implementation: {
          effort: 'medium',
          timeline: '6-8 weeks',
          resources: ['Senior Backend Engineer', 'Meeting Rooms', 'Documentation Platform'],
          steps: [
            'Identify key database optimization topics',
            'Schedule recurring knowledge sharing sessions',
            'Create shared documentation repository',
            'Implement hands-on workshops',
            'Establish mentorship pairs',
          ],
        },
        roi: {
          score: 85,
          paybackPeriod: '3 months',
          confidenceLevel: 0.8,
        },
        relatedGaps: ['gap-001'],
      },
      {
        id: 'opp-002',
        title: 'Design-Frontend Collaboration Workflow',
        category: 'process_improvement',
        priority: 'medium',
        description:
          'Establish structured handoff process with design system components and regular sync points',
        expectedBenefits: {
          productivityGain: 20,
          qualityImprovement: 0.6,
          learningAcceleration: 0.5,
          collaborationScore: 0.8,
        },
        implementation: {
          effort: 'low',
          timeline: '3-4 weeks',
          resources: ['Design System', 'Project Management Tool', 'Collaboration Platform'],
          steps: [
            'Define design-to-development handoff checklist',
            'Implement regular design-frontend sync meetings',
            'Create shared component library',
            'Establish feedback loops',
          ],
        },
        roi: {
          score: 70,
          paybackPeriod: '2 months',
          confidenceLevel: 0.9,
        },
        relatedGaps: ['gap-002'],
      },
      {
        id: 'opp-003',
        title: 'Kubernetes Expertise Development Program',
        category: 'skill_development',
        priority: 'urgent',
        description:
          'Intensive kubernetes training program with external expert mentorship and hands-on projects',
        expectedBenefits: {
          productivityGain: 50,
          qualityImprovement: 0.9,
          learningAcceleration: 0.8,
          collaborationScore: 0.6,
        },
        implementation: {
          effort: 'high',
          timeline: '12-16 weeks',
          resources: [
            'External K8s Expert',
            'Training Budget',
            'Test Environment',
            'Dedicated Learning Time',
          ],
          steps: [
            'Hire kubernetes consultant for intensive training',
            'Set up dedicated learning environment',
            'Create structured learning path',
            'Implement pair programming with expert',
            'Establish internal expertise sharing',
          ],
        },
        roi: {
          score: 95,
          paybackPeriod: '4 months',
          confidenceLevel: 0.7,
        },
        relatedGaps: ['gap-003'],
      },
    ],
    [],
  );

  const mockMetrics: CollaborationMetrics = useMemo(
    () => ({
      overallScore: 72,
      knowledgeSharingRate: 65,
      crossTeamCollaboration: 0.7,
      mentorshipActivity: 3.2,
      problemSolvingEfficiency: 4.5,
      learningVelocity: 2.1,
      trends: {
        period: 'Last 30 days',
        change: 8,
        trajectory: 'improving',
      },
    }),
    [],
  );

  const mockSuggestions: TeamOptimizationSuggestion[] = useMemo(
    () => [
      {
        id: 'sug-001',
        teamId: 'team-frontend',
        teamName: 'Frontend Team',
        suggestion:
          'Implement rotating code review assignments to increase knowledge sharing across different parts of the codebase',
        category: 'process',
        impact: 'medium',
        implementation: {
          complexity: 'simple',
          timeframe: '2 weeks',
          requirements: ['Code review tool configuration', 'Team agreement on process'],
        },
        expectedOutcome: 'Increased code familiarity and reduced knowledge silos',
        successMetrics: [
          'Review participation rate',
          'Cross-component contributions',
          'Bug detection rate',
        ],
      },
      {
        id: 'sug-002',
        teamId: 'team-backend',
        teamName: 'Backend Team',
        suggestion:
          'Create architectural decision record (ADR) writing rotation to improve documentation and decision transparency',
        category: 'communication',
        impact: 'high',
        implementation: {
          complexity: 'moderate',
          timeframe: '4 weeks',
          requirements: ['ADR template', 'Documentation platform', 'Review process'],
        },
        expectedOutcome: 'Better architectural decisions and improved team alignment',
        successMetrics: ['ADR completion rate', 'Decision clarity scores', 'Onboarding efficiency'],
      },
    ],
    [],
  );

  const mockNetwork: CollaborationNetwork = useMemo(
    () => ({
      nodes: [
        { id: 'op-123', type: 'operator', label: 'Alice Frontend', strength: 0.9, centrality: 0.8 },
        { id: 'op-456', type: 'operator', label: 'Bob Backend', strength: 0.8, centrality: 0.9 },
        { id: 'op-789', type: 'operator', label: 'Carol Design', strength: 0.7, centrality: 0.6 },
        {
          id: 'team-frontend',
          type: 'team',
          label: 'Frontend Team',
          strength: 0.8,
          centrality: 0.7,
        },
        { id: 'team-backend', type: 'team', label: 'Backend Team', strength: 0.9, centrality: 0.8 },
        { id: 'skill-react', type: 'skill', label: 'React', strength: 0.9, centrality: 0.7 },
        { id: 'skill-nodejs', type: 'skill', label: 'Node.js', strength: 0.8, centrality: 0.8 },
      ],
      edges: [
        { source: 'op-123', target: 'op-456', weight: 0.7, type: 'project_collaboration' },
        { source: 'op-456', target: 'op-789', weight: 0.4, type: 'knowledge_transfer' },
        { source: 'op-123', target: 'skill-react', weight: 0.9, type: 'knowledge_transfer' },
        { source: 'op-456', target: 'skill-nodejs', weight: 0.8, type: 'knowledge_transfer' },
      ],
    }),
    [],
  );

  // Auto-refresh effect
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      // Trigger data refresh
      console.log('Refreshing collaboration data...');
    }, 30000);

    return () => clearInterval(interval);
  }, [autoRefresh]);

  const getSeverityColor = (severity: string): string => {
    switch (severity) {
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

  const getPriorityColor = (priority: string): string => {
    switch (priority) {
      case 'urgent':
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

  const renderOverview = () => (
    <div className="org-collaboration-overview">
      <div className="org-metrics-summary">
        <div className="org-metric-card">
          <div className="org-metric-value">{mockMetrics.overallScore}</div>
          <div className="org-metric-label">Collaboration Score</div>
          <div className="org-metric-trend org-trend-positive">
            +{mockMetrics.trends.change}% {mockMetrics.trends.period}
          </div>
        </div>
        <div className="org-metric-card">
          <div className="org-metric-value">{mockMetrics.knowledgeSharingRate}%</div>
          <div className="org-metric-label">Knowledge Sharing</div>
        </div>
        <div className="org-metric-card">
          <div className="org-metric-value">{mockMetrics.mentorshipActivity}</div>
          <div className="org-metric-label">Mentorship Sessions/Week</div>
        </div>
        <div className="org-metric-card">
          <div className="org-metric-value">{mockMetrics.learningVelocity}</div>
          <div className="org-metric-label">Skills Gained/Month</div>
        </div>
      </div>

      <div className="org-summary-cards">
        <div className="org-summary-card org-alert-high">
          <h4>Critical Gaps Identified</h4>
          <div className="org-summary-value">
            {mockGaps.filter((g) => g.severity === 'critical' || g.severity === 'high').length}
          </div>
          <p>High-impact collaboration gaps requiring immediate attention</p>
        </div>
        <div className="org-summary-card org-success">
          <h4>Optimization Opportunities</h4>
          <div className="org-summary-value">{mockOpportunities.length}</div>
          <p>Identified opportunities with ROI analysis</p>
        </div>
        <div className="org-summary-card org-info">
          <h4>Team Suggestions</h4>
          <div className="org-summary-value">{mockSuggestions.length}</div>
          <p>Actionable suggestions for team optimization</p>
        </div>
      </div>
    </div>
  );

  const renderGaps = () => (
    <div className="org-collaboration-gaps">
      <div className="org-section-header">
        <h3>Collaboration Gaps</h3>
        <div className="org-gap-filters">
          <select defaultValue="all">
            <option value="all">All Severities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <select defaultValue="all">
            <option value="all">All Types</option>
            <option value="knowledge_silo">Knowledge Silos</option>
            <option value="communication_barrier">Communication</option>
            <option value="skill_gap">Skill Gaps</option>
            <option value="workflow_inefficiency">Workflow</option>
          </select>
        </div>
      </div>

      <div className="org-gaps-list">
        {mockGaps.map((gap) => (
          <div
            key={gap.id}
            className={`org-gap-card ${selectedGap === gap.id ? 'org-selected' : ''}`}
            onClick={() => setSelectedGap(selectedGap === gap.id ? null : gap.id)}
          >
            <div className="org-gap-header">
              <div
                className="org-gap-severity"
                style={{ backgroundColor: getSeverityColor(gap.severity) }}
              >
                {gap.severity.toUpperCase()}
              </div>
              <div className="org-gap-type">{gap.type.replace('_', ' ')}</div>
              <div className="org-gap-impact">{gap.impact.productivityLoss}% productivity loss</div>
            </div>
            <div className="org-gap-description">{gap.description}</div>
            <div className="org-gap-affected">
              <span>Teams: {gap.affectedTeams.join(', ')}</span>
              <span>Operators: {gap.affectedOperators.length}</span>
            </div>

            {selectedGap === gap.id && (
              <div className="org-gap-details">
                <div className="org-impact-metrics">
                  <div className="org-impact-metric">
                    <span>Quality Risk</span>
                    <div className="org-progress-bar">
                      <div
                        className="org-progress-fill org-alert-high"
                        style={{ width: `${gap.impact.qualityRisk * 100}%` }}
                      />
                    </div>
                    <span>{Math.round(gap.impact.qualityRisk * 100)}%</span>
                  </div>
                  <div className="org-impact-metric">
                    <span>Learning Opportunity</span>
                    <div className="org-progress-bar">
                      <div
                        className="org-progress-fill org-success"
                        style={{ width: `${gap.impact.learningOpportunity * 100}%` }}
                      />
                    </div>
                    <span>{Math.round(gap.impact.learningOpportunity * 100)}%</span>
                  </div>
                </div>
                <div className="org-related-opportunities">
                  <h5>Related Opportunities</h5>
                  {mockOpportunities
                    .filter((opp) => opp.relatedGaps.includes(gap.id))
                    .map((opp) => (
                      <div key={opp.id} className="org-related-opportunity">
                        <span>{opp.title}</span>
                        <span className="org-roi-score">ROI: {opp.roi.score}</span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  const renderOpportunities = () => (
    <div className="org-collaboration-opportunities">
      <div className="org-section-header">
        <h3>Optimization Opportunities</h3>
        <div className="org-opportunity-filters">
          <select defaultValue="all">
            <option value="all">All Categories</option>
            <option value="knowledge_sharing">Knowledge Sharing</option>
            <option value="process_improvement">Process Improvement</option>
            <option value="skill_development">Skill Development</option>
            <option value="mentoring">Mentoring</option>
          </select>
          <select defaultValue="roi">
            <option value="roi">Sort by ROI</option>
            <option value="priority">Sort by Priority</option>
            <option value="effort">Sort by Effort</option>
          </select>
        </div>
      </div>

      <div className="org-opportunities-list">
        {mockOpportunities.map((opportunity) => (
          <div
            key={opportunity.id}
            className={`org-opportunity-card ${selectedOpportunity === opportunity.id ? 'org-selected' : ''}`}
            onClick={() =>
              setSelectedOpportunity(selectedOpportunity === opportunity.id ? null : opportunity.id)
            }
          >
            <div className="org-opportunity-header">
              <h4>{opportunity.title}</h4>
              <div className="org-opportunity-badges">
                <span
                  className="org-priority-badge"
                  style={{ backgroundColor: getPriorityColor(opportunity.priority) }}
                >
                  {opportunity.priority}
                </span>
                <span className="org-roi-badge">ROI: {opportunity.roi.score}</span>
              </div>
            </div>
            <div className="org-opportunity-description">{opportunity.description}</div>
            <div className="org-opportunity-metrics">
              <div className="org-benefit-metric">
                <span>Productivity Gain</span>
                <span>{opportunity.expectedBenefits.productivityGain}%</span>
              </div>
              <div className="org-benefit-metric">
                <span>Implementation Effort</span>
                <span className="org-effort-indicator org-effort-{opportunity.implementation.effort}">
                  {opportunity.implementation.effort}
                </span>
              </div>
              <div className="org-benefit-metric">
                <span>Timeline</span>
                <span>{opportunity.implementation.timeline}</span>
              </div>
            </div>

            {selectedOpportunity === opportunity.id && (
              <div className="org-opportunity-details">
                <div className="org-implementation-plan">
                  <h5>Implementation Steps</h5>
                  <ol>
                    {opportunity.implementation.steps.map((step, index) => (
                      <li key={index}>{step}</li>
                    ))}
                  </ol>
                </div>
                <div className="org-required-resources">
                  <h5>Required Resources</h5>
                  <ul>
                    {opportunity.implementation.resources.map((resource, index) => (
                      <li key={index}>{resource}</li>
                    ))}
                  </ul>
                </div>
                <div className="org-expected-benefits">
                  <h5>Expected Benefits</h5>
                  <div className="org-benefit-grid">
                    <div className="org-benefit-item">
                      <span>Quality Improvement</span>
                      <div className="org-progress-bar">
                        <div
                          className="org-progress-fill org-success"
                          style={{
                            width: `${opportunity.expectedBenefits.qualityImprovement * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                    <div className="org-benefit-item">
                      <span>Learning Acceleration</span>
                      <div className="org-progress-bar">
                        <div
                          className="org-progress-fill org-info"
                          style={{
                            width: `${opportunity.expectedBenefits.learningAcceleration * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                    <div className="org-benefit-item">
                      <span>Collaboration Score</span>
                      <div className="org-progress-bar">
                        <div
                          className="org-progress-fill org-primary"
                          style={{
                            width: `${opportunity.expectedBenefits.collaborationScore * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="org-opportunity-actions">
                  <button
                    className="org-button org-button-primary"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpportunitySelect?.(opportunity);
                    }}
                  >
                    Start Implementation
                  </button>
                  <button className="org-button org-button-secondary">Save for Later</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  const renderNetwork = () => (
    <div className="org-collaboration-network">
      <div className="org-section-header">
        <h3>Collaboration Network</h3>
        <div className="org-network-controls">
          <select
            value={networkViewMode}
            onChange={(e) => setNetworkViewMode(e.target.value as any)}
          >
            <option value="collaboration">Collaboration Patterns</option>
            <option value="knowledge">Knowledge Transfer</option>
            <option value="mentoring">Mentoring Relationships</option>
          </select>
        </div>
      </div>

      <div className="org-network-visualization">
        <svg className="org-network-svg" viewBox="0 0 600 400">
          {/* Render network edges */}
          {mockNetwork.edges.map((edge, index) => {
            const sourceNode = mockNetwork.nodes.find((n) => n.id === edge.source);
            const targetNode = mockNetwork.nodes.find((n) => n.id === edge.target);
            if (!sourceNode || !targetNode) return null;

            // Simple layout - replace with force-directed layout
            const sourceX = 100 + (index % 3) * 200;
            const sourceY = 100 + Math.floor(index / 3) * 100;
            const targetX = 200 + (index % 3) * 200;
            const targetY = 150 + Math.floor(index / 3) * 100;

            return (
              <line
                key={`edge-${index}`}
                x1={sourceX}
                y1={sourceY}
                x2={targetX}
                y2={targetY}
                stroke="var(--org-border)"
                strokeWidth={edge.weight * 4}
                opacity={0.6}
              />
            );
          })}

          {/* Render network nodes */}
          {mockNetwork.nodes.map((node, index) => {
            // Simple layout - replace with force-directed layout
            const x = 100 + (index % 3) * 200;
            const y = 100 + Math.floor(index / 3) * 100;
            const radius = 20 + node.centrality * 20;

            const nodeColor =
              node.type === 'operator'
                ? 'var(--org-primary)'
                : node.type === 'team'
                  ? 'var(--org-success)'
                  : 'var(--org-info)';

            return (
              <g key={node.id}>
                <circle cx={x} cy={y} r={radius} fill={nodeColor} opacity={0.7} />
                <text x={x} y={y + radius + 15} textAnchor="middle" className="org-network-label">
                  {node.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="org-network-insights">
        <div className="org-insight-card">
          <h5>Network Analysis</h5>
          <ul>
            <li>Alice Frontend shows high centrality - key knowledge broker</li>
            <li>Design team shows lower connection strength - collaboration opportunity</li>
            <li>React expertise is well distributed across frontend team</li>
            <li>Cross-team mentoring relationships could be strengthened</li>
          </ul>
        </div>
      </div>
    </div>
  );

  const renderSuggestions = () => (
    <div className="org-collaboration-suggestions">
      <div className="org-section-header">
        <h3>Team Optimization Suggestions</h3>
        <div className="org-suggestion-filters">
          <select defaultValue="all">
            <option value="all">All Teams</option>
            <option value="team-frontend">Frontend</option>
            <option value="team-backend">Backend</option>
            <option value="team-design">Design</option>
          </select>
          <select defaultValue="impact">
            <option value="impact">Sort by Impact</option>
            <option value="complexity">Sort by Complexity</option>
            <option value="timeframe">Sort by Timeframe</option>
          </select>
        </div>
      </div>

      <div className="org-suggestions-list">
        {mockSuggestions.map((suggestion) => (
          <div key={suggestion.id} className="org-suggestion-card">
            <div className="org-suggestion-header">
              <h4>{suggestion.teamName}</h4>
              <div className="org-suggestion-badges">
                <span className={`org-impact-badge org-impact-${suggestion.impact}`}>
                  {suggestion.impact} impact
                </span>
                <span
                  className={`org-complexity-badge org-complexity-${suggestion.implementation.complexity}`}
                >
                  {suggestion.implementation.complexity}
                </span>
              </div>
            </div>
            <div className="org-suggestion-content">
              <p className="org-suggestion-text">{suggestion.suggestion}</p>
              <div className="org-suggestion-details">
                <div className="org-suggestion-detail">
                  <strong>Category:</strong> {suggestion.category}
                </div>
                <div className="org-suggestion-detail">
                  <strong>Timeline:</strong> {suggestion.implementation.timeframe}
                </div>
                <div className="org-suggestion-detail">
                  <strong>Expected Outcome:</strong> {suggestion.expectedOutcome}
                </div>
              </div>
              <div className="org-requirements">
                <h6>Requirements:</h6>
                <ul>
                  {suggestion.implementation.requirements.map((req, index) => (
                    <li key={index}>{req}</li>
                  ))}
                </ul>
              </div>
              <div className="org-success-metrics">
                <h6>Success Metrics:</h6>
                <ul>
                  {suggestion.successMetrics.map((metric, index) => (
                    <li key={index}>{metric}</li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="org-suggestion-actions">
              <button className="org-button org-button-primary">Implement Suggestion</button>
              <button className="org-button org-button-secondary">Share with Team</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className={`org-collaboration-opportunity-identifier ${className}`}>
      <div className="org-component-header">
        <h2>Collaboration Opportunity Identifier</h2>
        <div className="org-header-controls">
          <div className="org-time-range-selector">
            <select value={timeRange} onChange={(e) => setTimeRange(e.target.value as any)}>
              <option value="week">Last Week</option>
              <option value="month">Last Month</option>
              <option value="quarter">Last Quarter</option>
            </select>
          </div>
          <div className="org-auto-refresh">
            <label>
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
              />
              Auto-refresh
            </label>
          </div>
        </div>
      </div>

      <div className="org-view-tabs">
        {[
          { key: 'overview', label: 'Overview' },
          { key: 'gaps', label: `Gaps (${mockGaps.length})` },
          { key: 'opportunities', label: `Opportunities (${mockOpportunities.length})` },
          { key: 'network', label: 'Network' },
          { key: 'suggestions', label: `Suggestions (${mockSuggestions.length})` },
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

      <div className="org-collaboration-content">
        {viewMode === 'overview' && renderOverview()}
        {viewMode === 'gaps' && renderGaps()}
        {viewMode === 'opportunities' && renderOpportunities()}
        {viewMode === 'network' && renderNetwork()}
        {viewMode === 'suggestions' && renderSuggestions()}
      </div>

      {selectedTeam && (
        <div className="org-context-info">
          <div className="org-context-badge">Analyzing team: {selectedTeam}</div>
        </div>
      )}
    </div>
  );
};

export default CollaborationOpportunityIdentifier;
