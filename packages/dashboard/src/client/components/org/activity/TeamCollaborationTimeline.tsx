/**
 * TeamCollaborationTimeline Component
 *
 * Visualizes team collaboration timeline with knowledge sharing events,
 * task handoffs, and collaborative problem-solving sessions.
 */

import {
  ArrowRight,
  Clock,
  GitBranch,
  MessageCircle,
  Share,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useOrganizationalContext } from '../../../../contexts/OrganizationalContext';
import type { SessionCorrelation } from '../../../types/organizational.js';

export interface CollaborationEvent {
  readonly eventId: string;
  readonly timestamp: number;
  readonly eventType:
    | 'knowledge-sharing'
    | 'task-handoff'
    | 'pair-programming'
    | 'code-review'
    | 'mentoring'
    | 'brainstorming'
    | 'decision-making';
  readonly title: string;
  readonly description: string;
  readonly participants: readonly string[];
  readonly initiator: string;
  readonly duration?: number;
  readonly outcome?: string;
  readonly artifacts?: readonly string[]; // Documents, code, decisions created
  readonly knowledgeTransferred?: readonly string[]; // Topics/skills shared
  readonly context: 'planned' | 'spontaneous' | 'emergency' | 'scheduled';
  readonly impact: 'low' | 'medium' | 'high' | 'critical';
  readonly followUpRequired?: boolean;
  readonly relatedSessions?: readonly string[];
  readonly tags?: readonly string[];
}

export interface KnowledgeFlow {
  readonly flowId: string;
  readonly sourceOperatorId: string;
  readonly targetOperatorId: string;
  readonly knowledgeTopic: string;
  readonly transferMethod: 'documentation' | 'verbal' | 'demonstration' | 'pair-work' | 'review';
  readonly effectiveness: number; // 0-1 score based on retention/application
  readonly timestamp: number;
  readonly relatedEventId?: string;
  readonly verificationMethod?: string;
  readonly retentionScore?: number;
}

export interface TaskHandoff {
  readonly handoffId: string;
  readonly taskDescription: string;
  readonly fromOperatorId: string;
  readonly toOperatorId: string;
  readonly timestamp: number;
  readonly reason:
    | 'workload-balance'
    | 'expertise-required'
    | 'availability'
    | 'planned-rotation'
    | 'escalation';
  readonly contextTransferred: readonly string[];
  readonly completionStatus: boolean;
  readonly handoffQuality: number; // 0-1 score based on context completeness
  readonly timeToProductivity: number; // How long until recipient became productive
  readonly complications?: readonly string[];
  readonly successFactors?: readonly string[];
}

export interface TeamCollaborationData {
  readonly teamId: string;
  readonly timeRange: { start: number; end: number };
  readonly events: readonly CollaborationEvent[];
  readonly knowledgeFlows: readonly KnowledgeFlow[];
  readonly taskHandoffs: readonly TaskHandoff[];
  readonly participantMetrics: Record<
    string,
    {
      collaborationScore: number;
      knowledgeShared: number;
      knowledgeReceived: number;
      handoffsGiven: number;
      handoffsReceived: number;
    }
  >;
  readonly collaborationPatterns: readonly {
    pattern: string;
    frequency: number;
    participants: readonly string[];
    successRate: number;
  }[];
  readonly knowledgeAreas: readonly {
    area: string;
    transferCount: number;
    retentionRate: number;
    experts: readonly string[];
  }[];
  readonly teamHealth: {
    collaborationFrequency: number;
    knowledgeDistribution: number;
    handoffEfficiency: number;
    communicationQuality: number;
  };
}

interface TeamCollaborationTimelineProps {
  /** Session correlation data for team context */
  readonly sessionCorrelation: SessionCorrelation;
  /** Time range for collaboration analysis */
  readonly timeRange?: 'week' | 'month' | 'quarter' | 'half-year';
  /** Display mode for timeline */
  readonly mode?: 'timeline' | 'flows' | 'handoffs' | 'metrics';
  /** Event types to show */
  readonly eventFilter?: readonly CollaborationEvent['eventType'][];
  /** Whether to group events by type */
  readonly groupByType?: boolean;
  /** Callback for event selection */
  readonly onSelectEvent?: (event: CollaborationEvent) => void;
  /** Additional CSS classes */
  readonly className?: string;
}

const getEventTypeIcon = (type: CollaborationEvent['eventType']) => {
  switch (type) {
    case 'knowledge-sharing':
      return <Share className="h-4 w-4" />;
    case 'task-handoff':
      return <ArrowRight className="h-4 w-4" />;
    case 'pair-programming':
      return <Users className="h-4 w-4" />;
    case 'code-review':
      return <MessageCircle className="h-4 w-4" />;
    case 'mentoring':
      return <TrendingUp className="h-4 w-4" />;
    case 'brainstorming':
      return <Zap className="h-4 w-4" />;
    case 'decision-making':
      return <GitBranch className="h-4 w-4" />;
    default:
      return <Users className="h-4 w-4" />;
  }
};

const getEventTypeColor = (type: CollaborationEvent['eventType']) => {
  switch (type) {
    case 'knowledge-sharing':
      return 'org-event-knowledge';
    case 'task-handoff':
      return 'org-event-handoff';
    case 'pair-programming':
      return 'org-event-pairing';
    case 'code-review':
      return 'org-event-review';
    case 'mentoring':
      return 'org-event-mentoring';
    case 'brainstorming':
      return 'org-event-brainstorming';
    case 'decision-making':
      return 'org-event-decision';
    default:
      return 'org-event-default';
  }
};

const getContextColor = (context: CollaborationEvent['context']) => {
  switch (context) {
    case 'planned':
      return 'org-context-planned';
    case 'spontaneous':
      return 'org-context-spontaneous';
    case 'emergency':
      return 'org-context-emergency';
    case 'scheduled':
      return 'org-context-scheduled';
    default:
      return 'org-context-default';
  }
};

const getImpactColor = (impact: CollaborationEvent['impact']) => {
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

const getTransferMethodColor = (method: KnowledgeFlow['transferMethod']) => {
  switch (method) {
    case 'documentation':
      return 'org-transfer-documentation';
    case 'verbal':
      return 'org-transfer-verbal';
    case 'demonstration':
      return 'org-transfer-demonstration';
    case 'pair-work':
      return 'org-transfer-pair';
    case 'review':
      return 'org-transfer-review';
    default:
      return 'org-transfer-default';
  }
};

const formatDuration = (ms?: number): string => {
  if (!ms) return '—';
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};

const TimelineView: React.FC<{
  data: TeamCollaborationData;
  eventFilter?: readonly CollaborationEvent['eventType'][];
  groupByType: boolean;
  onSelectEvent?: (event: CollaborationEvent) => void;
}> = ({ data, eventFilter, groupByType, onSelectEvent }) => {
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);
  const [timeScale, setTimeScale] = useState<'hour' | 'day' | 'week'>('day');

  const filteredEvents = eventFilter
    ? data.events.filter((event) => eventFilter.includes(event.eventType))
    : data.events;

  const sortedEvents = [...filteredEvents].sort((a, b) => b.timestamp - a.timestamp);

  const groupedEvents = groupByType
    ? sortedEvents.reduce(
        (acc, event) => {
          if (!acc[event.eventType]) acc[event.eventType] = [];
          acc[event.eventType].push(event);
          return acc;
        },
        {} as Record<string, CollaborationEvent[]>,
      )
    : { all: sortedEvents };

  return (
    <div className="org-collaboration-timeline">
      <div className="flex items-center justify-between mb-6">
        <h4 className="org-text-lg org-font-semibold">Team Collaboration Timeline</h4>
        <div className="flex items-center space-x-2">
          <select
            value={timeScale}
            onChange={(e) => setTimeScale(e.target.value as any)}
            className="org-select org-select-sm"
          >
            <option value="hour">Hourly View</option>
            <option value="day">Daily View</option>
            <option value="week">Weekly View</option>
          </select>
          <span className="org-text-sm org-text-muted">{sortedEvents.length} events</span>
        </div>
      </div>

      <div className="space-y-6">
        {Object.entries(groupedEvents).map(([groupKey, events]) => (
          <div key={groupKey}>
            {groupByType && groupKey !== 'all' && (
              <div className="flex items-center space-x-2 mb-4">
                <div className={getEventTypeColor(groupKey as CollaborationEvent['eventType'])}>
                  {getEventTypeIcon(groupKey as CollaborationEvent['eventType'])}
                </div>
                <h5 className="org-font-semibold capitalize">
                  {groupKey.replace('-', ' ')} ({events.length})
                </h5>
              </div>
            )}

            <div className="relative">
              <div className="absolute left-8 top-0 bottom-0 w-px org-border-muted"></div>

              <div className="space-y-4">
                {events.map((event) => {
                  const isSelected = selectedEvent === event.eventId;

                  return (
                    <div key={event.eventId} className="relative flex items-start">
                      <div
                        className={`flex-shrink-0 w-16 h-8 ${getEventTypeColor(event.eventType)} rounded-lg flex items-center justify-center z-10`}
                      >
                        {getEventTypeIcon(event.eventType)}
                      </div>

                      <div className="flex-1 ml-4">
                        <div
                          className={`org-timeline-event ${isSelected ? 'org-event-selected' : ''} ${
                            onSelectEvent ? 'cursor-pointer' : ''
                          }`}
                          onClick={() => {
                            const newSelected = isSelected ? null : event.eventId;
                            setSelectedEvent(newSelected);
                            if (onSelectEvent && !isSelected) {
                              onSelectEvent(event);
                            }
                          }}
                        >
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1">
                              <div className="flex items-center space-x-2 mb-1">
                                <h5 className="org-font-semibold">{event.title}</h5>
                                <span
                                  className={`org-badge org-badge-xs ${getImpactColor(event.impact)}`}
                                >
                                  {event.impact}
                                </span>
                                <span
                                  className={`org-badge org-badge-xs ${getContextColor(event.context)}`}
                                >
                                  {event.context}
                                </span>
                              </div>
                              <p className="org-text-sm org-text-muted mb-2">{event.description}</p>
                              <div className="flex items-center space-x-4 org-text-sm org-text-muted">
                                <span>Participants: {event.participants.length}</span>
                                <span>Initiated by: {event.initiator.slice(-6)}</span>
                                {event.duration && (
                                  <span>Duration: {formatDuration(event.duration)}</span>
                                )}
                              </div>
                            </div>
                            <div className="text-right org-text-sm org-text-muted">
                              {new Date(event.timestamp).toLocaleString()}
                            </div>
                          </div>

                          {isSelected && (
                            <div className="mt-4 pt-4 org-border-t">
                              <div className="grid grid-cols-2 gap-6 mb-4">
                                <div>
                                  <h6 className="org-font-semibold mb-2">Participants</h6>
                                  <div className="space-y-1">
                                    <div className="flex items-center space-x-2">
                                      <span className="org-badge org-badge-primary org-badge-xs">
                                        Initiator
                                      </span>
                                      <span className="org-text-sm">
                                        {event.initiator.slice(-8)}
                                      </span>
                                    </div>
                                    {event.participants
                                      .filter((p) => p !== event.initiator)
                                      .map((participant) => (
                                        <div
                                          key={participant}
                                          className="flex items-center space-x-2"
                                        >
                                          <span className="org-badge org-badge-secondary org-badge-xs">
                                            Participant
                                          </span>
                                          <span className="org-text-sm">
                                            {participant.slice(-8)}
                                          </span>
                                        </div>
                                      ))}
                                  </div>
                                </div>

                                {event.knowledgeTransferred &&
                                  event.knowledgeTransferred.length > 0 && (
                                    <div>
                                      <h6 className="org-font-semibold mb-2">
                                        Knowledge Transferred
                                      </h6>
                                      <div className="flex flex-wrap gap-1">
                                        {event.knowledgeTransferred.map((knowledge) => (
                                          <span
                                            key={knowledge}
                                            className="org-badge org-badge-info org-badge-xs"
                                          >
                                            {knowledge}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                              </div>

                              {event.artifacts && event.artifacts.length > 0 && (
                                <div className="mb-4">
                                  <h6 className="org-font-semibold mb-2">Artifacts Created</h6>
                                  <div className="flex flex-wrap gap-1">
                                    {event.artifacts.map((artifact) => (
                                      <span
                                        key={artifact}
                                        className="org-badge org-badge-success org-badge-xs"
                                      >
                                        {artifact}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {event.outcome && (
                                <div className="mb-4">
                                  <h6 className="org-font-semibold mb-2">Outcome</h6>
                                  <p className="org-text-sm org-text-muted">{event.outcome}</p>
                                </div>
                              )}

                              {event.followUpRequired && (
                                <div className="org-badge org-badge-warning org-badge-sm">
                                  Follow-up Required
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
      </div>

      {sortedEvents.length === 0 && (
        <div className="org-empty-state">
          <Users className="h-8 w-8 org-text-muted mb-2" />
          <div className="org-text-muted">No collaboration events match the current filter</div>
        </div>
      )}
    </div>
  );
};

const FlowsView: React.FC<{
  data: TeamCollaborationData;
}> = ({ data }) => {
  const [selectedFlow, setSelectedFlow] = useState<string | null>(null);

  // Group flows by knowledge topic
  const flowsByTopic = data.knowledgeFlows.reduce(
    (acc, flow) => {
      if (!acc[flow.knowledgeTopic]) acc[flow.knowledgeTopic] = [];
      acc[flow.knowledgeTopic].push(flow);
      return acc;
    },
    {} as Record<string, KnowledgeFlow[]>,
  );

  const topicStats = Object.entries(flowsByTopic)
    .map(([topic, flows]) => ({
      topic,
      flows,
      totalTransfers: flows.length,
      avgEffectiveness: flows.reduce((sum, f) => sum + f.effectiveness, 0) / flows.length,
      uniqueParticipants: new Set([
        ...flows.map((f) => f.sourceOperatorId),
        ...flows.map((f) => f.targetOperatorId),
      ]).size,
    }))
    .sort((a, b) => b.totalTransfers - a.totalTransfers);

  return (
    <div className="org-knowledge-flows">
      <div className="flex items-center justify-between mb-6">
        <h4 className="org-text-lg org-font-semibold">Knowledge Transfer Flows</h4>
        <div className="org-text-sm org-text-muted">
          {data.knowledgeFlows.length} transfers across {Object.keys(flowsByTopic).length} topics
        </div>
      </div>

      <div className="space-y-6">
        {topicStats.map(
          ({ topic, flows, totalTransfers, avgEffectiveness, uniqueParticipants }) => (
            <div key={topic} className="org-card-inner">
              <div
                className="cursor-pointer"
                onClick={() => setSelectedFlow(selectedFlow === topic ? null : topic)}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-lg org-bg-info-light flex items-center justify-center">
                      <Share className="h-5 w-5 org-text-info" />
                    </div>
                    <div>
                      <h5 className="org-font-semibold">{topic}</h5>
                      <div className="org-text-sm org-text-muted">
                        {totalTransfers} transfers • {uniqueParticipants} participants
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div
                      className={`org-text-lg org-font-semibold ${
                        avgEffectiveness >= 0.8
                          ? 'org-text-success'
                          : avgEffectiveness >= 0.6
                            ? 'org-text-info'
                            : 'org-text-warning'
                      }`}
                    >
                      {Math.round(avgEffectiveness * 100)}%
                    </div>
                    <div className="org-text-xs org-text-muted">avg effectiveness</div>
                  </div>
                </div>

                {selectedFlow === topic && (
                  <div className="pt-4 org-border-t">
                    <div className="space-y-3">
                      {flows.map((flow) => (
                        <div key={flow.flowId} className="org-card-inner org-card-sm">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                              <div className="flex items-center space-x-2">
                                <span className="org-font-mono org-text-sm">
                                  {flow.sourceOperatorId.slice(-6)}
                                </span>
                                <ArrowRight className="h-3 w-3 org-text-muted" />
                                <span className="org-font-mono org-text-sm">
                                  {flow.targetOperatorId.slice(-6)}
                                </span>
                              </div>
                              <span
                                className={`org-badge org-badge-xs ${getTransferMethodColor(flow.transferMethod)}`}
                              >
                                {flow.transferMethod}
                              </span>
                            </div>
                            <div className="text-right">
                              <div
                                className={`org-text-sm org-font-semibold ${
                                  flow.effectiveness >= 0.8
                                    ? 'org-text-success'
                                    : flow.effectiveness >= 0.6
                                      ? 'org-text-info'
                                      : 'org-text-warning'
                                }`}
                              >
                                {Math.round(flow.effectiveness * 100)}%
                              </div>
                              <div className="org-text-xs org-text-muted">
                                {new Date(flow.timestamp).toLocaleDateString()}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ),
        )}
      </div>
    </div>
  );
};

const HandoffsView: React.FC<{
  data: TeamCollaborationData;
}> = ({ data }) => {
  const [sortBy, setSortBy] = useState<'recent' | 'quality' | 'complexity'>('recent');

  const sortedHandoffs = [...data.taskHandoffs].sort((a, b) => {
    switch (sortBy) {
      case 'recent':
        return b.timestamp - a.timestamp;
      case 'quality':
        return b.handoffQuality - a.handoffQuality;
      case 'complexity':
        return b.timeToProductivity - a.timeToProductivity;
      default:
        return b.timestamp - a.timestamp;
    }
  });

  const handoffReasons = data.taskHandoffs.reduce(
    (acc, handoff) => {
      acc[handoff.reason] = (acc[handoff.reason] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  return (
    <div className="org-task-handoffs">
      <div className="flex items-center justify-between mb-6">
        <h4 className="org-text-lg org-font-semibold">Task Handoffs</h4>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as any)}
          className="org-select org-select-sm"
        >
          <option value="recent">Sort by Recent</option>
          <option value="quality">Sort by Quality</option>
          <option value="complexity">Sort by Complexity</option>
        </select>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="org-stat-card">
          <div className="org-stat-value">{data.taskHandoffs.length}</div>
          <div className="org-stat-label">Total Handoffs</div>
        </div>
        <div className="org-stat-card">
          <div className="org-stat-value">
            {Math.round(
              (data.taskHandoffs.reduce((sum, h) => sum + h.handoffQuality, 0) /
                data.taskHandoffs.length) *
                100,
            )}
            %
          </div>
          <div className="org-stat-label">Avg Quality</div>
        </div>
        <div className="org-stat-card">
          <div className="org-stat-value">
            {Math.round(
              data.taskHandoffs.reduce((sum, h) => sum + h.timeToProductivity, 0) /
                data.taskHandoffs.length /
                3600000,
            )}
            h
          </div>
          <div className="org-stat-label">Avg Ramp-up Time</div>
        </div>
      </div>

      <div className="mb-6">
        <h5 className="org-font-semibold mb-3">Handoff Reasons</h5>
        <div className="flex flex-wrap gap-2">
          {Object.entries(handoffReasons).map(([reason, count]) => (
            <span key={reason} className="org-badge org-badge-secondary">
              {reason.replace('-', ' ')}: {count}
            </span>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        {sortedHandoffs.slice(0, 10).map((handoff) => (
          <div key={handoff.handoffId} className="org-card-inner">
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1">
                <div className="flex items-center space-x-2 mb-1">
                  <h5 className="org-font-semibold truncate">{handoff.taskDescription}</h5>
                  <span
                    className={`org-badge org-badge-xs ${
                      handoff.completionStatus ? 'org-badge-success' : 'org-badge-warning'
                    }`}
                  >
                    {handoff.completionStatus ? 'Completed' : 'In Progress'}
                  </span>
                </div>
                <div className="flex items-center space-x-4 org-text-sm org-text-muted mb-2">
                  <span>
                    {handoff.fromOperatorId.slice(-6)} → {handoff.toOperatorId.slice(-6)}
                  </span>
                  <span className="capitalize">{handoff.reason.replace('-', ' ')}</span>
                  <span>{new Date(handoff.timestamp).toLocaleDateString()}</span>
                </div>
                <div className="flex items-center space-x-4 org-text-sm">
                  <span
                    className={`${
                      handoff.handoffQuality >= 0.8
                        ? 'org-text-success'
                        : handoff.handoffQuality >= 0.6
                          ? 'org-text-info'
                          : 'org-text-warning'
                    }`}
                  >
                    Quality: {Math.round(handoff.handoffQuality * 100)}%
                  </span>
                  <span className="org-text-muted">
                    Ramp-up: {formatDuration(handoff.timeToProductivity)}
                  </span>
                  <span className="org-text-muted">
                    Context: {handoff.contextTransferred.length} items
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {handoff.successFactors && handoff.successFactors.length > 0 && (
                <div>
                  <h6 className="org-font-medium mb-1 org-text-sm">Success Factors</h6>
                  <div className="flex flex-wrap gap-1">
                    {handoff.successFactors.map((factor) => (
                      <span key={factor} className="org-badge org-badge-success org-badge-xs">
                        {factor}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {handoff.complications && handoff.complications.length > 0 && (
                <div>
                  <h6 className="org-font-medium mb-1 org-text-sm">Complications</h6>
                  <div className="flex flex-wrap gap-1">
                    {handoff.complications.map((complication) => (
                      <span key={complication} className="org-badge org-badge-warning org-badge-xs">
                        {complication}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {sortedHandoffs.length === 0 && (
        <div className="org-empty-state">
          <ArrowRight className="h-8 w-8 org-text-muted mb-2" />
          <div className="org-text-muted">No task handoffs recorded</div>
        </div>
      )}
    </div>
  );
};

const MetricsView: React.FC<{
  data: TeamCollaborationData;
}> = ({ data }) => {
  const participants = Object.keys(data.participantMetrics);

  return (
    <div className="org-collaboration-metrics">
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="org-stat-card">
          <div className="org-stat-value">
            {Math.round(data.teamHealth.collaborationFrequency * 100)}%
          </div>
          <div className="org-stat-label">Collaboration Frequency</div>
        </div>
        <div className="org-stat-card">
          <div className="org-stat-value">
            {Math.round(data.teamHealth.knowledgeDistribution * 100)}%
          </div>
          <div className="org-stat-label">Knowledge Distribution</div>
        </div>
        <div className="org-stat-card">
          <div className="org-stat-value">
            {Math.round(data.teamHealth.handoffEfficiency * 100)}%
          </div>
          <div className="org-stat-label">Handoff Efficiency</div>
        </div>
        <div className="org-stat-card">
          <div className="org-stat-value">
            {Math.round(data.teamHealth.communicationQuality * 100)}%
          </div>
          <div className="org-stat-label">Communication Quality</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 mb-6">
        <div className="org-card-inner">
          <h4 className="org-font-semibold mb-4">Team Member Performance</h4>
          <div className="space-y-3">
            {participants.slice(0, 8).map((participantId) => {
              const metrics = data.participantMetrics[participantId];
              return (
                <div key={participantId} className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="org-font-mono org-text-sm">{participantId.slice(-8)}</span>
                  </div>
                  <div className="flex items-center space-x-4 org-text-sm">
                    <div className="text-right">
                      <div
                        className={`org-font-semibold ${
                          metrics.collaborationScore >= 0.8
                            ? 'org-text-success'
                            : metrics.collaborationScore >= 0.6
                              ? 'org-text-info'
                              : 'org-text-warning'
                        }`}
                      >
                        {Math.round(metrics.collaborationScore * 100)}%
                      </div>
                      <div className="org-text-xs org-text-muted">collab score</div>
                    </div>
                    <div className="text-right">
                      <div className="org-font-semibold">{metrics.knowledgeShared}</div>
                      <div className="org-text-xs org-text-muted">shared</div>
                    </div>
                    <div className="text-right">
                      <div className="org-font-semibold">{metrics.knowledgeReceived}</div>
                      <div className="org-text-xs org-text-muted">received</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="org-card-inner">
          <h4 className="org-font-semibold mb-4">Knowledge Areas</h4>
          <div className="space-y-3">
            {data.knowledgeAreas.slice(0, 6).map((area) => (
              <div key={area.area} className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="org-font-medium org-text-sm">{area.area}</div>
                  <div className="org-text-xs org-text-muted">
                    {area.experts.length} experts • {area.transferCount} transfers
                  </div>
                </div>
                <div className="text-right">
                  <div
                    className={`org-font-semibold ${
                      area.retentionRate >= 0.8
                        ? 'org-text-success'
                        : area.retentionRate >= 0.6
                          ? 'org-text-info'
                          : 'org-text-warning'
                    }`}
                  >
                    {Math.round(area.retentionRate * 100)}%
                  </div>
                  <div className="org-text-xs org-text-muted">retention</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="org-card-inner">
        <h4 className="org-font-semibold mb-4">Collaboration Patterns</h4>
        <div className="space-y-3">
          {data.collaborationPatterns.map((pattern, index) => (
            <div key={index} className="flex items-center justify-between">
              <div className="flex-1">
                <div className="org-font-medium org-text-sm">{pattern.pattern}</div>
                <div className="org-text-xs org-text-muted">
                  {pattern.participants.length} participants • {pattern.frequency} occurrences
                </div>
              </div>
              <div className="text-right">
                <div
                  className={`org-font-semibold ${
                    pattern.successRate >= 0.8
                      ? 'org-text-success'
                      : pattern.successRate >= 0.6
                        ? 'org-text-info'
                        : 'org-text-warning'
                  }`}
                >
                  {Math.round(pattern.successRate * 100)}%
                </div>
                <div className="org-text-xs org-text-muted">success rate</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export const TeamCollaborationTimeline: React.FC<TeamCollaborationTimelineProps> = ({
  sessionCorrelation,
  timeRange = 'month',
  mode = 'timeline',
  eventFilter,
  groupByType = false,
  onSelectEvent,
  className = '',
}) => {
  const { teamFilter } = useOrganizationalContext();
  const [data, setData] = useState<TeamCollaborationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCollaborationData = async () => {
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

        // Generate mock collaboration data
        const mockEvents: CollaborationEvent[] = Array.from({ length: 30 }, (_, i) => {
          const eventTypes: CollaborationEvent['eventType'][] = [
            'knowledge-sharing',
            'task-handoff',
            'pair-programming',
            'code-review',
            'mentoring',
            'brainstorming',
            'decision-making',
          ];
          const contexts: CollaborationEvent['context'][] = [
            'planned',
            'spontaneous',
            'emergency',
            'scheduled',
          ];
          const impacts: CollaborationEvent['impact'][] = ['low', 'medium', 'high', 'critical'];

          const eventType = eventTypes[i % eventTypes.length];
          const participants = Array.from(
            { length: Math.floor(Math.random() * 4) + 2 },
            (_, _j) => `op-${Math.random().toString(36).slice(2, 8)}`,
          );

          return {
            eventId: `event-${i}`,
            timestamp: startTime + Math.random() * timeRangeMs,
            eventType,
            title: `${eventType.replace('-', ' ')} session ${i + 1}`,
            description: `Collaborative session focusing on ${eventType.replace('-', ' ')} activities`,
            participants,
            initiator: participants[0],
            duration: Math.random() > 0.3 ? 1800000 + Math.random() * 5400000 : undefined, // 30min - 2h
            outcome:
              Math.random() > 0.2 ? `Successfully completed ${eventType} objectives` : undefined,
            artifacts:
              Math.random() > 0.6
                ? ['Documentation', 'Code changes', 'Decision record']
                : undefined,
            knowledgeTransferred:
              Math.random() > 0.4
                ? ['Technical patterns', 'Best practices', 'Domain knowledge'].slice(
                    0,
                    Math.floor(Math.random() * 3) + 1,
                  )
                : undefined,
            context: contexts[Math.floor(Math.random() * contexts.length)],
            impact: impacts[Math.floor(Math.random() * impacts.length)],
            followUpRequired: Math.random() > 0.7,
            relatedSessions: Math.random() > 0.5 ? [sessionCorrelation.sessionId] : undefined,
            tags: ['collaboration', 'team-work'].slice(0, Math.floor(Math.random() * 2) + 1),
          };
        });

        const mockKnowledgeFlows: KnowledgeFlow[] = Array.from({ length: 20 }, (_, i) => {
          const transferMethods: KnowledgeFlow['transferMethod'][] = [
            'documentation',
            'verbal',
            'demonstration',
            'pair-work',
            'review',
          ];
          const knowledgeTopics = [
            'React patterns',
            'API design',
            'Testing strategies',
            'Deployment processes',
            'Performance optimization',
          ];

          return {
            flowId: `flow-${i}`,
            sourceOperatorId: `op-${Math.random().toString(36).slice(2, 8)}`,
            targetOperatorId: `op-${Math.random().toString(36).slice(2, 8)}`,
            knowledgeTopic: knowledgeTopics[i % knowledgeTopics.length],
            transferMethod: transferMethods[Math.floor(Math.random() * transferMethods.length)],
            effectiveness: 0.4 + Math.random() * 0.6,
            timestamp: startTime + Math.random() * timeRangeMs,
            relatedEventId:
              Math.random() > 0.5
                ? mockEvents[Math.floor(Math.random() * mockEvents.length)].eventId
                : undefined,
            retentionScore: Math.random() > 0.3 ? 0.5 + Math.random() * 0.5 : undefined,
          };
        });

        const mockTaskHandoffs: TaskHandoff[] = Array.from({ length: 15 }, (_, i) => {
          const reasons: TaskHandoff['reason'][] = [
            'workload-balance',
            'expertise-required',
            'availability',
            'planned-rotation',
            'escalation',
          ];

          return {
            handoffId: `handoff-${i}`,
            taskDescription: `Task ${i + 1} - Development and implementation`,
            fromOperatorId: `op-${Math.random().toString(36).slice(2, 8)}`,
            toOperatorId: `op-${Math.random().toString(36).slice(2, 8)}`,
            timestamp: startTime + Math.random() * timeRangeMs,
            reason: reasons[Math.floor(Math.random() * reasons.length)],
            contextTransferred: [
              'Requirements',
              'Technical specs',
              'Previous attempts',
              'Dependencies',
            ].slice(0, Math.floor(Math.random() * 4) + 1),
            completionStatus: Math.random() > 0.2,
            handoffQuality: 0.4 + Math.random() * 0.6,
            timeToProductivity: 1800000 + Math.random() * 7200000, // 30min - 2h
            complications:
              Math.random() > 0.7 ? ['Missing context', 'Tool access issues'] : undefined,
            successFactors:
              Math.random() > 0.6 ? ['Clear documentation', 'Direct communication'] : undefined,
          };
        });

        // Generate participant metrics
        const allParticipants = new Set([
          ...mockEvents.flatMap((e) => e.participants),
          ...mockKnowledgeFlows.map((f) => f.sourceOperatorId),
          ...mockKnowledgeFlows.map((f) => f.targetOperatorId),
          ...mockTaskHandoffs.map((h) => h.fromOperatorId),
          ...mockTaskHandoffs.map((h) => h.toOperatorId),
        ]);

        const participantMetrics: Record<string, any> = {};
        allParticipants.forEach((participantId) => {
          participantMetrics[participantId] = {
            collaborationScore: 0.4 + Math.random() * 0.6,
            knowledgeShared: Math.floor(Math.random() * 15),
            knowledgeReceived: Math.floor(Math.random() * 12),
            handoffsGiven: Math.floor(Math.random() * 8),
            handoffsReceived: Math.floor(Math.random() * 6),
          };
        });

        setData({
          teamId: sessionCorrelation.teamId || 'default-team',
          timeRange: { start: startTime, end: endTime },
          events: mockEvents,
          knowledgeFlows: mockKnowledgeFlows,
          taskHandoffs: mockTaskHandoffs,
          participantMetrics,
          collaborationPatterns: [
            {
              pattern: 'Daily standup knowledge sharing',
              frequency: 20,
              participants: Array.from(allParticipants).slice(0, 6),
              successRate: 0.89,
            },
            {
              pattern: 'Peer code review sessions',
              frequency: 35,
              participants: Array.from(allParticipants).slice(2, 8),
              successRate: 0.92,
            },
            {
              pattern: 'Problem-solving collaboration',
              frequency: 12,
              participants: Array.from(allParticipants).slice(1, 5),
              successRate: 0.84,
            },
          ],
          knowledgeAreas: [
            {
              area: 'Frontend Development',
              transferCount: 25,
              retentionRate: 0.87,
              experts: Array.from(allParticipants).slice(0, 4),
            },
            {
              area: 'Backend APIs',
              transferCount: 18,
              retentionRate: 0.82,
              experts: Array.from(allParticipants).slice(3, 6),
            },
            {
              area: 'DevOps & Deployment',
              transferCount: 12,
              retentionRate: 0.78,
              experts: Array.from(allParticipants).slice(2, 4),
            },
          ],
          teamHealth: {
            collaborationFrequency: 0.76,
            knowledgeDistribution: 0.68,
            handoffEfficiency: 0.82,
            communicationQuality: 0.85,
          },
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load collaboration data');
      } finally {
        setLoading(false);
      }
    };

    fetchCollaborationData();
  }, [sessionCorrelation, timeRange]);

  if (loading) {
    return (
      <div className={`org-team-collaboration org-loading ${className}`}>
        <div className="flex items-center space-x-2">
          <div className="org-spinner org-spinner-sm" />
          <span className="org-text-muted">Loading collaboration timeline...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`org-team-collaboration org-error ${className}`}>
        <div className="org-error-message">
          <Users className="h-5 w-5 text-red-500" />
          <span>Failed to load collaboration data: {error}</span>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className={`org-team-collaboration org-empty ${className}`}>
        <div className="org-empty-state">
          <Clock className="h-8 w-8 org-text-muted mb-2" />
          <div className="org-text-muted">No collaboration data available</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`org-team-collaboration org-collaboration-${mode} ${className}`}>
      <div className="flex items-center justify-between mb-6">
        <h3 className="org-text-xl org-font-semibold">Team Collaboration Timeline</h3>
        <div className="org-text-sm org-text-muted">
          {data.events.length} events • {data.knowledgeFlows.length} transfers • {timeRange}
        </div>
      </div>

      {mode === 'timeline' && (
        <TimelineView
          data={data}
          eventFilter={eventFilter}
          groupByType={groupByType}
          onSelectEvent={onSelectEvent}
        />
      )}
      {mode === 'flows' && <FlowsView data={data} />}
      {mode === 'handoffs' && <HandoffsView data={data} />}
      {mode === 'metrics' && <MetricsView data={data} />}
    </div>
  );
};

export default TeamCollaborationTimeline;
