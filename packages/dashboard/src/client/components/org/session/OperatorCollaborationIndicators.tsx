/**
 * OperatorCollaborationIndicators Component
 *
 * Visualizes knowledge sharing patterns, collaboration networks, and
 * cross-operator learning opportunities within the organization.
 */

import { ArrowRight, BookOpen, MessageCircle, Share, TrendingUp, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useOrganizationalContext } from '../../../../contexts/OrganizationalContext';
import type { SessionCorrelation } from '../../../types/organizational.js';

export interface KnowledgeExchange {
  readonly id: string;
  readonly sourceOperatorId: string;
  readonly targetOperatorId: string;
  readonly exchangeType:
    | 'solution-sharing'
    | 'problem-consultation'
    | 'code-review'
    | 'mentoring'
    | 'pair-programming';
  readonly knowledgeDomain: string;
  readonly timestamp: number;
  readonly effectiveness: number; // 0-1 score based on outcome
  readonly contextType: 'direct' | 'indirect' | 'documented' | 'observed';
  readonly outcomeImpact: 'low' | 'medium' | 'high' | 'critical';
  readonly sessionIds: readonly string[];
}

export interface CollaborationPattern {
  readonly id: string;
  readonly patternType:
    | 'frequent-collaborators'
    | 'knowledge-hub'
    | 'expertise-cluster'
    | 'mentoring-chain'
    | 'problem-solver-network';
  readonly participants: readonly string[];
  readonly strength: number; // 0-1 indicating how strong the pattern is
  readonly frequency: number; // How often this pattern occurs
  readonly domains: readonly string[]; // Areas of collaboration
  readonly trends: 'increasing' | 'stable' | 'decreasing';
  readonly discoveredAt: number;
  readonly lastSeen: number;
}

export interface OperatorProfile {
  readonly operatorId: string;
  readonly teamId?: string;
  readonly knowledgeDomains: readonly string[];
  readonly collaborationScore: number;
  readonly mentorshipGiven: number;
  readonly mentorshipReceived: number;
  readonly knowledgeShared: number;
  readonly knowledgeReceived: number;
  readonly networkCentrality: number; // How central they are in the collaboration network
  readonly specializations: readonly string[];
  readonly preferredCollaborationStyles: readonly string[];
}

export interface CollaborationMetrics {
  readonly totalExchanges: number;
  readonly uniqueCollaboratorPairs: number;
  readonly averageEffectiveness: number;
  readonly knowledgeDomainsCovered: number;
  readonly mentorshipConnections: number;
  readonly crossTeamCollaborations: number;
  readonly topCollaborators: readonly OperatorProfile[];
  readonly emergingPatterns: readonly CollaborationPattern[];
}

interface OperatorCollaborationIndicatorsProps {
  /** Session correlation data for collaboration context */
  readonly sessionCorrelation: SessionCorrelation;
  /** Display mode for collaboration indicators */
  readonly mode?: 'network' | 'patterns' | 'metrics' | 'timeline';
  /** Time window for collaboration analysis */
  readonly timeWindow?: 'day' | 'week' | 'month' | 'quarter';
  /** Whether to include cross-team collaborations */
  readonly includeCrossTeam?: boolean;
  /** Callback for operator profile selection */
  readonly onSelectOperator?: (operatorId: string) => void;
  /** Additional CSS classes */
  readonly className?: string;
}

const getExchangeTypeIcon = (type: KnowledgeExchange['exchangeType']) => {
  switch (type) {
    case 'solution-sharing':
      return <Share className="h-4 w-4" />;
    case 'problem-consultation':
      return <MessageCircle className="h-4 w-4" />;
    case 'code-review':
      return <BookOpen className="h-4 w-4" />;
    case 'mentoring':
      return <Users className="h-4 w-4" />;
    case 'pair-programming':
      return <TrendingUp className="h-4 w-4" />;
    default:
      return <Users className="h-4 w-4" />;
  }
};

const getExchangeTypeColor = (type: KnowledgeExchange['exchangeType']) => {
  switch (type) {
    case 'solution-sharing':
      return 'org-text-success';
    case 'problem-consultation':
      return 'org-text-info';
    case 'code-review':
      return 'org-text-warning';
    case 'mentoring':
      return 'org-text-primary';
    case 'pair-programming':
      return 'org-text-secondary';
    default:
      return 'org-text-muted';
  }
};

const getPatternTypeColor = (type: CollaborationPattern['patternType']) => {
  switch (type) {
    case 'frequent-collaborators':
      return 'org-badge-info';
    case 'knowledge-hub':
      return 'org-badge-warning';
    case 'expertise-cluster':
      return 'org-badge-success';
    case 'mentoring-chain':
      return 'org-badge-primary';
    case 'problem-solver-network':
      return 'org-badge-secondary';
    default:
      return 'org-badge-muted';
  }
};

const getEffectivenessColor = (effectiveness: number) => {
  if (effectiveness >= 0.8) return 'org-text-success';
  if (effectiveness >= 0.6) return 'org-text-info';
  if (effectiveness >= 0.4) return 'org-text-warning';
  return 'org-text-error';
};

const getTrendIcon = (trend: CollaborationPattern['trends']) => {
  switch (trend) {
    case 'increasing':
      return <TrendingUp className="h-3 w-3 org-text-success" />;
    case 'decreasing':
      return <TrendingUp className="h-3 w-3 org-text-error transform rotate-180" />;
    case 'stable':
      return <ArrowRight className="h-3 w-3 org-text-muted" />;
    default:
      return <ArrowRight className="h-3 w-3 org-text-muted" />;
  }
};

const NetworkView: React.FC<{
  metrics: CollaborationMetrics;
  exchanges: readonly KnowledgeExchange[];
  onSelectOperator?: (operatorId: string) => void;
}> = ({ metrics, exchanges, onSelectOperator }) => {
  const [selectedOperator, setSelectedOperator] = useState<string | null>(null);

  // Simple circular layout for operator nodes
  const getOperatorPosition = (index: number, total: number) => {
    const angle = (index * 2 * Math.PI) / total;
    const radius = 100;
    return {
      x: 200 + Math.cos(angle) * radius,
      y: 150 + Math.sin(angle) * radius,
    };
  };

  // Build collaboration connections
  const connections = exchanges.reduce(
    (acc, exchange) => {
      const key = `${exchange.sourceOperatorId}-${exchange.targetOperatorId}`;
      if (!acc[key]) {
        acc[key] = {
          source: exchange.sourceOperatorId,
          target: exchange.targetOperatorId,
          strength: 0,
          count: 0,
        };
      }
      acc[key].strength += exchange.effectiveness;
      acc[key].count += 1;
      return acc;
    },
    {} as Record<string, any>,
  );

  return (
    <div className="org-collaboration-network">
      <div className="flex items-center justify-between mb-4">
        <h4 className="org-text-lg org-font-semibold">Collaboration Network</h4>
        <div className="org-text-sm org-text-muted">
          {metrics.uniqueCollaboratorPairs} active collaborations
        </div>
      </div>

      <svg viewBox="0 0 400 300" className="w-full h-64 org-bg-surface rounded-lg mb-4">
        {/* Render collaboration edges */}
        {Object.values(connections).map((connection: any, index) => {
          const sourceIndex = metrics.topCollaborators.findIndex(
            (op) => op.operatorId === connection.source,
          );
          const targetIndex = metrics.topCollaborators.findIndex(
            (op) => op.operatorId === connection.target,
          );

          if (sourceIndex === -1 || targetIndex === -1) return null;

          const sourcePos = getOperatorPosition(sourceIndex, metrics.topCollaborators.length);
          const targetPos = getOperatorPosition(targetIndex, metrics.topCollaborators.length);
          const avgStrength = connection.strength / connection.count;

          return (
            <line
              key={index}
              x1={sourcePos.x}
              y1={sourcePos.y}
              x2={targetPos.x}
              y2={targetPos.y}
              className="org-collaboration-edge"
              strokeWidth={Math.max(1, avgStrength * 4)}
              strokeOpacity={0.6}
              stroke={avgStrength >= 0.7 ? '#10b981' : avgStrength >= 0.5 ? '#3b82f6' : '#6b7280'}
            />
          );
        })}

        {/* Render operator nodes */}
        {metrics.topCollaborators.map((operator, index) => {
          const pos = getOperatorPosition(index, metrics.topCollaborators.length);
          const isSelected = selectedOperator === operator.operatorId;
          const radius = 8 + operator.networkCentrality * 12;

          return (
            <g key={operator.operatorId}>
              <circle
                cx={pos.x}
                cy={pos.y}
                r={radius}
                className={`org-operator-node ${isSelected ? 'org-node-selected' : ''}`}
                fill={
                  operator.collaborationScore >= 0.8
                    ? '#10b981'
                    : operator.collaborationScore >= 0.6
                      ? '#3b82f6'
                      : operator.collaborationScore >= 0.4
                        ? '#f59e0b'
                        : '#6b7280'
                }
                onClick={() => {
                  setSelectedOperator(operator.operatorId);
                  onSelectOperator?.(operator.operatorId);
                }}
                style={{ cursor: onSelectOperator ? 'pointer' : 'default' }}
              />
              <text
                x={pos.x}
                y={pos.y + radius + 12}
                className="org-operator-label"
                textAnchor="middle"
                fontSize="10"
              >
                {operator.operatorId.slice(-6)}
              </text>
            </g>
          );
        })}
      </svg>

      {selectedOperator && (
        <div className="org-card-inner">
          <h5 className="org-font-semibold mb-2">Operator Profile</h5>
          {(() => {
            const operator = metrics.topCollaborators.find(
              (op) => op.operatorId === selectedOperator,
            );
            if (!operator) return null;

            return (
              <div className="grid grid-cols-2 gap-4 org-text-sm">
                <div>
                  <div className="org-text-muted">Collaboration Score</div>
                  <div className={getEffectivenessColor(operator.collaborationScore)}>
                    {Math.round(operator.collaborationScore * 100)}%
                  </div>
                </div>
                <div>
                  <div className="org-text-muted">Network Centrality</div>
                  <div>{Math.round(operator.networkCentrality * 100)}%</div>
                </div>
                <div>
                  <div className="org-text-muted">Knowledge Shared</div>
                  <div>{operator.knowledgeShared}</div>
                </div>
                <div>
                  <div className="org-text-muted">Mentorship Given</div>
                  <div>{operator.mentorshipGiven}</div>
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
};

const PatternsView: React.FC<{
  patterns: readonly CollaborationPattern[];
  timeWindow: string;
}> = ({ patterns, timeWindow }) => {
  const sortedPatterns = [...patterns].sort((a, b) => b.strength - a.strength);

  return (
    <div className="org-collaboration-patterns">
      <div className="flex items-center justify-between mb-4">
        <h4 className="org-text-lg org-font-semibold">Collaboration Patterns</h4>
        <div className="org-text-sm org-text-muted">
          {patterns.length} patterns identified ({timeWindow})
        </div>
      </div>

      <div className="space-y-3">
        {sortedPatterns.map((pattern) => (
          <div key={pattern.id} className="org-card-inner">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-3">
                <span className={`org-badge ${getPatternTypeColor(pattern.patternType)}`}>
                  {pattern.patternType.replace('-', ' ')}
                </span>
                <div className="flex items-center space-x-1">
                  {getTrendIcon(pattern.trends)}
                  <span className="org-text-sm org-text-muted capitalize">{pattern.trends}</span>
                </div>
              </div>
              <div className="text-right">
                <div className="org-text-lg org-font-semibold org-text-primary">
                  {Math.round(pattern.strength * 100)}%
                </div>
                <div className="org-text-xs org-text-muted">strength</div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 org-text-sm mb-3">
              <div>
                <div className="org-text-muted">Participants</div>
                <div>{pattern.participants.length} operators</div>
              </div>
              <div>
                <div className="org-text-muted">Frequency</div>
                <div>{pattern.frequency} interactions</div>
              </div>
              <div>
                <div className="org-text-muted">Domains</div>
                <div>{pattern.domains.length} areas</div>
              </div>
            </div>

            <div className="space-y-2">
              <div>
                <div className="org-text-sm org-font-medium mb-1">Knowledge Domains</div>
                <div className="flex flex-wrap gap-1">
                  {pattern.domains.map((domain) => (
                    <span key={domain} className="org-badge org-badge-secondary org-badge-xs">
                      {domain}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <div className="org-text-sm org-font-medium mb-1">Key Participants</div>
                <div className="flex flex-wrap gap-1">
                  {pattern.participants.slice(0, 5).map((participantId) => (
                    <span key={participantId} className="org-badge org-badge-info org-badge-xs">
                      {participantId.slice(-6)}
                    </span>
                  ))}
                  {pattern.participants.length > 5 && (
                    <span className="org-text-xs org-text-muted">
                      +{pattern.participants.length - 5} more
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-3 pt-3 org-border-t org-text-xs org-text-muted">
              <span>Discovered: {new Date(pattern.discoveredAt).toLocaleDateString()}</span>
              <span className="mx-2">•</span>
              <span>Last seen: {new Date(pattern.lastSeen).toLocaleDateString()}</span>
            </div>
          </div>
        ))}
      </div>

      {sortedPatterns.length === 0 && (
        <div className="org-empty-state">
          <Users className="h-8 w-8 org-text-muted mb-2" />
          <div className="org-text-muted">No collaboration patterns identified</div>
        </div>
      )}
    </div>
  );
};

const MetricsView: React.FC<{ metrics: CollaborationMetrics }> = ({ metrics }) => (
  <div className="org-collaboration-metrics">
    <div className="grid grid-cols-4 gap-4 mb-6">
      <div className="org-stat-card">
        <div className="org-stat-value">{metrics.totalExchanges}</div>
        <div className="org-stat-label">Knowledge Exchanges</div>
      </div>
      <div className="org-stat-card">
        <div className="org-stat-value">{metrics.uniqueCollaboratorPairs}</div>
        <div className="org-stat-label">Active Pairs</div>
      </div>
      <div className="org-stat-card">
        <div className={`org-stat-value ${getEffectivenessColor(metrics.averageEffectiveness)}`}>
          {Math.round(metrics.averageEffectiveness * 100)}%
        </div>
        <div className="org-stat-label">Avg Effectiveness</div>
      </div>
      <div className="org-stat-card">
        <div className="org-stat-value">{metrics.crossTeamCollaborations}</div>
        <div className="org-stat-label">Cross-Team</div>
      </div>
    </div>

    <div className="grid grid-cols-2 gap-6">
      <div className="org-card-inner">
        <h4 className="org-font-semibold mb-3">Top Collaborators</h4>
        <div className="space-y-2">
          {metrics.topCollaborators.slice(0, 5).map((operator, index) => (
            <div key={operator.operatorId} className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-6 h-6 rounded-full flex items-center justify-center org-bg-primary-light org-text-primary org-text-xs org-font-semibold">
                  {index + 1}
                </div>
                <div>
                  <div className="org-font-medium">{operator.operatorId.slice(-8)}</div>
                  <div className="org-text-xs org-text-muted">
                    {operator.specializations.slice(0, 2).join(', ')}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div
                  className={`org-text-sm org-font-semibold ${getEffectivenessColor(operator.collaborationScore)}`}
                >
                  {Math.round(operator.collaborationScore * 100)}%
                </div>
                <div className="org-text-xs org-text-muted">score</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="org-card-inner">
        <h4 className="org-font-semibold mb-3">Knowledge Domains</h4>
        <div className="space-y-2">
          {metrics.topCollaborators
            .flatMap((op) => op.knowledgeDomains)
            .reduce(
              (acc, domain) => {
                acc[domain] = (acc[domain] || 0) + 1;
                return acc;
              },
              {} as Record<string, number>,
            ) &&
            Object.entries(
              metrics.topCollaborators
                .flatMap((op) => op.knowledgeDomains)
                .reduce(
                  (acc, domain) => {
                    acc[domain] = (acc[domain] || 0) + 1;
                    return acc;
                  },
                  {} as Record<string, number>,
                ),
            )
              .sort(([, a], [, b]) => b - a)
              .slice(0, 8)
              .map(([domain, count]) => (
                <div key={domain} className="flex items-center justify-between">
                  <span className="org-font-medium">{domain}</span>
                  <span className="org-text-muted">{count} experts</span>
                </div>
              ))}
        </div>
      </div>
    </div>

    <div className="mt-6 org-card-inner">
      <h4 className="org-font-semibold mb-3">Collaboration Health</h4>
      <div className="grid grid-cols-3 gap-4 org-text-sm">
        <div>
          <div className="org-text-muted">Mentorship Connections</div>
          <div className="org-font-semibold">{metrics.mentorshipConnections}</div>
          <div className="org-text-xs org-text-muted">
            {Math.round((metrics.mentorshipConnections / metrics.totalExchanges) * 100)}% of
            exchanges
          </div>
        </div>
        <div>
          <div className="org-text-muted">Cross-Team Rate</div>
          <div className="org-font-semibold">
            {Math.round((metrics.crossTeamCollaborations / metrics.totalExchanges) * 100)}%
          </div>
          <div className="org-text-xs org-text-muted">of all collaborations</div>
        </div>
        <div>
          <div className="org-text-muted">Emerging Patterns</div>
          <div className="org-font-semibold">{metrics.emergingPatterns.length}</div>
          <div className="org-text-xs org-text-muted">new this period</div>
        </div>
      </div>
    </div>
  </div>
);

const TimelineView: React.FC<{
  exchanges: readonly KnowledgeExchange[];
  timeWindow: string;
}> = ({ exchanges, timeWindow }) => {
  const sortedExchanges = [...exchanges].sort((a, b) => b.timestamp - a.timestamp);
  const groupedByDay = sortedExchanges.reduce(
    (acc, exchange) => {
      const day = new Date(exchange.timestamp).toDateString();
      if (!acc[day]) acc[day] = [];
      acc[day].push(exchange);
      return acc;
    },
    {} as Record<string, KnowledgeExchange[]>,
  );

  return (
    <div className="org-collaboration-timeline">
      <div className="flex items-center justify-between mb-4">
        <h4 className="org-text-lg org-font-semibold">Knowledge Exchange Timeline</h4>
        <div className="org-text-sm org-text-muted">
          {exchanges.length} exchanges ({timeWindow})
        </div>
      </div>

      <div className="space-y-4">
        {Object.entries(groupedByDay)
          .slice(0, 7)
          .map(([day, dayExchanges]) => (
            <div key={day} className="org-timeline-day">
              <div className="flex items-center space-x-3 mb-3">
                <div className="w-3 h-3 rounded-full org-bg-primary"></div>
                <div className="org-font-semibold">{day}</div>
                <div className="org-text-sm org-text-muted">{dayExchanges.length} exchanges</div>
              </div>

              <div className="ml-6 space-y-2">
                {dayExchanges.slice(0, 5).map((exchange) => (
                  <div key={exchange.id} className="org-card-inner org-card-sm">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-2">
                        <div className={getExchangeTypeColor(exchange.exchangeType)}>
                          {getExchangeTypeIcon(exchange.exchangeType)}
                        </div>
                        <span className="org-font-medium capitalize">
                          {exchange.exchangeType.replace('-', ' ')}
                        </span>
                      </div>
                      <div
                        className={`org-text-sm ${getEffectivenessColor(exchange.effectiveness)}`}
                      >
                        {Math.round(exchange.effectiveness * 100)}% effective
                      </div>
                    </div>

                    <div className="flex items-center space-x-4 org-text-sm org-text-muted">
                      <span>
                        {exchange.sourceOperatorId.slice(-6)} →{' '}
                        {exchange.targetOperatorId.slice(-6)}
                      </span>
                      <span>{exchange.knowledgeDomain}</span>
                      <span
                        className={`org-badge org-badge-xs ${
                          exchange.outcomeImpact === 'critical'
                            ? 'org-badge-error'
                            : exchange.outcomeImpact === 'high'
                              ? 'org-badge-warning'
                              : exchange.outcomeImpact === 'medium'
                                ? 'org-badge-info'
                                : 'org-badge-secondary'
                        }`}
                      >
                        {exchange.outcomeImpact} impact
                      </span>
                    </div>
                  </div>
                ))}

                {dayExchanges.length > 5 && (
                  <div className="org-text-sm org-text-muted ml-2">
                    +{dayExchanges.length - 5} more exchanges
                  </div>
                )}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
};

export const OperatorCollaborationIndicators: React.FC<OperatorCollaborationIndicatorsProps> = ({
  sessionCorrelation,
  mode = 'metrics',
  timeWindow = 'week',
  includeCrossTeam = true,
  onSelectOperator,
  className = '',
}) => {
  const { teamFilter } = useOrganizationalContext();
  const [metrics, setMetrics] = useState<CollaborationMetrics | null>(null);
  const [exchanges, setExchanges] = useState<KnowledgeExchange[]>([]);
  const [patterns, setPatterns] = useState<CollaborationPattern[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCollaborationData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Generate mock collaboration data
        const mockExchanges: KnowledgeExchange[] = Array.from({ length: 15 }, (_, i) => ({
          id: `exchange-${i}`,
          sourceOperatorId: `op-${Math.random().toString(36).slice(2, 10)}`,
          targetOperatorId: `op-${Math.random().toString(36).slice(2, 10)}`,
          exchangeType: [
            'solution-sharing',
            'problem-consultation',
            'code-review',
            'mentoring',
            'pair-programming',
          ][i % 5] as KnowledgeExchange['exchangeType'],
          knowledgeDomain: ['Frontend', 'Backend', 'DevOps', 'Testing', 'Architecture'][i % 5],
          timestamp: sessionCorrelation.timestamp - i * 3600000,
          effectiveness: 0.6 + Math.random() * 0.4,
          contextType: ['direct', 'indirect', 'documented', 'observed'][
            i % 4
          ] as KnowledgeExchange['contextType'],
          outcomeImpact: ['low', 'medium', 'high', 'critical'][
            Math.floor(Math.random() * 4)
          ] as KnowledgeExchange['outcomeImpact'],
          sessionIds: sessionCorrelation.relatedSessions.slice(0, 2),
        }));

        const mockProfiles: OperatorProfile[] = Array.from({ length: 6 }, (_, i) => ({
          operatorId: `op-${Math.random().toString(36).slice(2, 10)}`,
          teamId: sessionCorrelation.teamId,
          knowledgeDomains: ['Frontend', 'Backend', 'DevOps', 'Testing', 'Architecture'].slice(
            0,
            2 + (i % 3),
          ),
          collaborationScore: 0.6 + Math.random() * 0.4,
          mentorshipGiven: Math.floor(Math.random() * 10),
          mentorshipReceived: Math.floor(Math.random() * 5),
          knowledgeShared: Math.floor(Math.random() * 20),
          knowledgeReceived: Math.floor(Math.random() * 15),
          networkCentrality: Math.random(),
          specializations: ['React', 'Node.js', 'Docker', 'Jest', 'GraphQL'].slice(0, 2),
          preferredCollaborationStyles: ['pair-programming', 'code-review', 'mentoring'].slice(
            0,
            2,
          ),
        }));

        const mockPatterns: CollaborationPattern[] = [
          {
            id: 'pattern-1',
            patternType: 'frequent-collaborators',
            participants: mockProfiles.slice(0, 3).map((p) => p.operatorId),
            strength: 0.85,
            frequency: 12,
            domains: ['Frontend', 'Backend'],
            trends: 'increasing',
            discoveredAt: sessionCorrelation.timestamp - 604800000, // 1 week ago
            lastSeen: sessionCorrelation.timestamp - 3600000,
          },
          {
            id: 'pattern-2',
            patternType: 'knowledge-hub',
            participants: [
              mockProfiles[0].operatorId,
              ...mockProfiles.slice(2, 5).map((p) => p.operatorId),
            ],
            strength: 0.73,
            frequency: 8,
            domains: ['Architecture', 'DevOps'],
            trends: 'stable',
            discoveredAt: sessionCorrelation.timestamp - 1209600000, // 2 weeks ago
            lastSeen: sessionCorrelation.timestamp - 7200000,
          },
        ];

        const mockMetrics: CollaborationMetrics = {
          totalExchanges: mockExchanges.length,
          uniqueCollaboratorPairs: 8,
          averageEffectiveness:
            mockExchanges.reduce((sum, e) => sum + e.effectiveness, 0) / mockExchanges.length,
          knowledgeDomainsCovered: 5,
          mentorshipConnections: mockExchanges.filter((e) => e.exchangeType === 'mentoring').length,
          crossTeamCollaborations: includeCrossTeam ? 3 : 0,
          topCollaborators: mockProfiles.sort(
            (a, b) => b.collaborationScore - a.collaborationScore,
          ),
          emergingPatterns: mockPatterns.filter((p) => p.discoveredAt > Date.now() - 604800000), // Last week
        };

        setExchanges(mockExchanges);
        setPatterns(mockPatterns);
        setMetrics(mockMetrics);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load collaboration data');
      } finally {
        setLoading(false);
      }
    };

    fetchCollaborationData();
  }, [sessionCorrelation, includeCrossTeam]);

  if (loading) {
    return (
      <div className={`org-collaboration-indicators org-loading ${className}`}>
        <div className="flex items-center space-x-2">
          <div className="org-spinner org-spinner-sm" />
          <span className="org-text-muted">Loading collaboration indicators...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`org-collaboration-indicators org-error ${className}`}>
        <div className="org-error-message">
          <Users className="h-5 w-5 text-red-500" />
          <span>Failed to load collaboration data: {error}</span>
        </div>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className={`org-collaboration-indicators org-empty ${className}`}>
        <div className="org-empty-state">
          <Users className="h-8 w-8 org-text-muted mb-2" />
          <div className="org-text-muted">No collaboration data available</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`org-collaboration-indicators org-indicators-${mode} ${className}`}>
      {mode !== 'metrics' && (
        <div className="flex items-center justify-between mb-4">
          <h3 className="org-text-lg org-font-semibold">Operator Collaboration</h3>
          <div className="org-text-sm org-text-muted">
            {metrics.totalExchanges} exchanges, {Math.round(metrics.averageEffectiveness * 100)}%
            avg effectiveness
          </div>
        </div>
      )}

      {mode === 'network' && (
        <NetworkView metrics={metrics} exchanges={exchanges} onSelectOperator={onSelectOperator} />
      )}
      {mode === 'patterns' && <PatternsView patterns={patterns} timeWindow={timeWindow} />}
      {mode === 'metrics' && <MetricsView metrics={metrics} />}
      {mode === 'timeline' && <TimelineView exchanges={exchanges} timeWindow={timeWindow} />}
    </div>
  );
};

export default OperatorCollaborationIndicators;
