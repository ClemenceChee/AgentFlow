/**
 * CrossInstanceSessionTracker Component
 *
 * Tracks and visualizes session handoffs between different Claude Code instances
 * (CLI, web app, IDE extensions) with handoff analysis and continuity metrics.
 */

import {
  Activity,
  AlertCircle,
  ArrowRight,
  Laptop,
  Monitor,
  Smartphone,
  Terminal,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useOrganizationalContext } from '../../../../contexts/OrganizationalContext';
import type { SessionCorrelation } from '../../../types/organizational.js';

export interface InstanceType {
  readonly type: 'cli' | 'web' | 'vscode' | 'jetbrains' | 'desktop' | 'mobile' | 'unknown';
  readonly version: string;
  readonly platform?: string;
  readonly userAgent?: string;
}

export interface SessionInstance {
  readonly sessionId: string;
  readonly operatorId: string;
  readonly instanceType: InstanceType;
  readonly startTime: number;
  readonly endTime?: number;
  readonly duration?: number;
  readonly location: string; // geographical or network location
  readonly contextPreserved: boolean;
  readonly tasksContinued: number;
  readonly tasksInitiated: number;
  readonly tasksFailed: number;
}

export interface SessionHandoff {
  readonly id: string;
  readonly sourceInstanceId: string;
  readonly targetInstanceId: string;
  readonly handoffTime: number;
  readonly method: 'explicit' | 'context-resume' | 'state-sync' | 'manual-recreation';
  readonly continuityScore: number;
  readonly dataPreserved: readonly string[];
  readonly dataLost: readonly string[];
  readonly latency: number; // Time between source end and target start
  readonly success: boolean;
  readonly failureReason?: string;
}

export interface CrossInstanceData {
  readonly instances: readonly SessionInstance[];
  readonly handoffs: readonly SessionHandoff[];
  readonly operatorId: string;
  readonly totalSessionTime: number;
  readonly overallContinuityScore: number;
  readonly contextSwitches: number;
  readonly mostUsedInstance: InstanceType['type'];
}

interface CrossInstanceSessionTrackerProps {
  /** Session correlation data for tracking context */
  readonly sessionCorrelation: SessionCorrelation;
  /** Display mode for instance tracking */
  readonly mode?: 'timeline' | 'network' | 'summary' | 'handoffs';
  /** Whether to show detailed handoff analysis */
  readonly showHandoffDetails?: boolean;
  /** Callback for instance selection */
  readonly onSelectInstance?: (sessionId: string) => void;
  /** Additional CSS classes */
  readonly className?: string;
}

const getInstanceIcon = (type: InstanceType['type']) => {
  switch (type) {
    case 'cli':
      return <Terminal className="h-4 w-4" />;
    case 'web':
      return <Monitor className="h-4 w-4" />;
    case 'vscode':
      return <Laptop className="h-4 w-4" />;
    case 'jetbrains':
      return <Laptop className="h-4 w-4" />;
    case 'desktop':
      return <Monitor className="h-4 w-4" />;
    case 'mobile':
      return <Smartphone className="h-4 w-4" />;
    default:
      return <Activity className="h-4 w-4" />;
  }
};

const getInstanceColor = (type: InstanceType['type']) => {
  switch (type) {
    case 'cli':
      return 'org-instance-cli';
    case 'web':
      return 'org-instance-web';
    case 'vscode':
      return 'org-instance-vscode';
    case 'jetbrains':
      return 'org-instance-jetbrains';
    case 'desktop':
      return 'org-instance-desktop';
    case 'mobile':
      return 'org-instance-mobile';
    default:
      return 'org-instance-unknown';
  }
};

const getHandoffMethodLabel = (method: SessionHandoff['method']) => {
  switch (method) {
    case 'explicit':
      return 'Explicit Transfer';
    case 'context-resume':
      return 'Context Resume';
    case 'state-sync':
      return 'State Sync';
    case 'manual-recreation':
      return 'Manual Recreation';
    default:
      return 'Unknown';
  }
};

const getContinuityColor = (score: number) => {
  if (score >= 0.9) return 'org-text-success';
  if (score >= 0.7) return 'org-text-info';
  if (score >= 0.5) return 'org-text-warning';
  return 'org-text-error';
};

const TimelineView: React.FC<{
  data: CrossInstanceData;
  onSelectInstance?: (sessionId: string) => void;
  showHandoffDetails: boolean;
}> = ({ data, onSelectInstance, showHandoffDetails }) => {
  const sortedInstances = [...data.instances].sort((a, b) => a.startTime - b.startTime);
  const startTime = Math.min(...sortedInstances.map((i) => i.startTime));
  const endTime = Math.max(...sortedInstances.map((i) => i.endTime || i.startTime));
  const timeSpan = endTime - startTime;

  return (
    <div className="org-instance-timeline">
      <div className="relative mb-6">
        <div className="absolute left-4 top-0 bottom-0 w-px org-border-muted"></div>

        <div className="space-y-6">
          {sortedInstances.map((instance) => {
            const _relativeStart =
              timeSpan > 0 ? ((instance.startTime - startTime) / timeSpan) * 100 : 0;
            const duration = instance.duration || 0;
            const relativeWidth = timeSpan > 0 ? (duration / timeSpan) * 100 : 0;

            const relevantHandoffs = data.handoffs.filter(
              (h) =>
                h.sourceInstanceId === instance.sessionId ||
                h.targetInstanceId === instance.sessionId,
            );

            return (
              <div key={instance.sessionId} className="relative flex items-start">
                <div
                  className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${getInstanceColor(instance.instanceType.type)} z-10`}
                >
                  {getInstanceIcon(instance.instanceType.type)}
                </div>

                <div className="flex-1 ml-6">
                  <div
                    className={`org-instance-card ${onSelectInstance ? 'cursor-pointer' : ''}`}
                    onClick={() => onSelectInstance?.(instance.sessionId)}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="org-font-medium">
                        {instance.instanceType.type.toUpperCase()} - {instance.sessionId.slice(-8)}
                      </div>
                      <div className="org-text-xs org-text-muted">
                        {new Date(instance.startTime).toLocaleString()}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 org-text-sm mb-3">
                      <div>
                        <div className="org-text-muted">Location</div>
                        <div>{instance.location}</div>
                      </div>
                      <div>
                        <div className="org-text-muted">Duration</div>
                        <div>{duration > 0 ? `${Math.round(duration / 60000)}m` : 'Active'}</div>
                      </div>
                      <div>
                        <div className="org-text-muted">Tasks Continued</div>
                        <div className="flex items-center space-x-1">
                          <span>{instance.tasksContinued}</span>
                          {instance.contextPreserved && <span className="org-text-success">✓</span>}
                        </div>
                      </div>
                      <div>
                        <div className="org-text-muted">New Tasks</div>
                        <div>{instance.tasksInitiated}</div>
                      </div>
                    </div>

                    {duration > 0 && (
                      <div className="relative h-2 org-bg-surface rounded-full mb-3">
                        <div
                          className={`absolute h-full rounded-full ${getInstanceColor(instance.instanceType.type)}`}
                          style={{ width: `${Math.max(relativeWidth, 2)}%` }}
                        />
                      </div>
                    )}

                    {relevantHandoffs.length > 0 && showHandoffDetails && (
                      <div className="mt-3 pt-3 org-border-t">
                        <div className="org-text-sm org-font-medium mb-2">Handoffs</div>
                        <div className="space-y-2">
                          {relevantHandoffs.map((handoff) => (
                            <div
                              key={handoff.id}
                              className="flex items-center space-x-2 org-text-xs"
                            >
                              <ArrowRight className="h-3 w-3 org-text-muted" />
                              <span className={getContinuityColor(handoff.continuityScore)}>
                                {getHandoffMethodLabel(handoff.method)}
                              </span>
                              <span className="org-text-muted">
                                ({Math.round(handoff.continuityScore * 100)}% continuity)
                              </span>
                              {!handoff.success && (
                                <AlertCircle className="h-3 w-3 org-text-error" />
                              )}
                            </div>
                          ))}
                        </div>
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
  );
};

const NetworkView: React.FC<{
  data: CrossInstanceData;
  onSelectInstance?: (sessionId: string) => void;
}> = ({ data, onSelectInstance }) => {
  const [selectedInstance, setSelectedInstance] = useState<string | null>(null);

  // Simple circular layout
  const getInstancePosition = (index: number, total: number) => {
    const angle = (index * 2 * Math.PI) / total;
    const radius = 120;
    return {
      x: 200 + Math.cos(angle) * radius,
      y: 150 + Math.sin(angle) * radius,
    };
  };

  return (
    <div className="org-instance-network">
      <svg viewBox="0 0 400 300" className="w-full h-64 org-bg-surface rounded-lg">
        {/* Render handoffs as edges */}
        {data.handoffs.map((handoff) => {
          const sourceIndex = data.instances.findIndex(
            (i) => i.sessionId === handoff.sourceInstanceId,
          );
          const targetIndex = data.instances.findIndex(
            (i) => i.sessionId === handoff.targetInstanceId,
          );

          if (sourceIndex === -1 || targetIndex === -1) return null;

          const sourcePos = getInstancePosition(sourceIndex, data.instances.length);
          const targetPos = getInstancePosition(targetIndex, data.instances.length);

          return (
            <g key={handoff.id}>
              <line
                x1={sourcePos.x}
                y1={sourcePos.y}
                x2={targetPos.x}
                y2={targetPos.y}
                className={`org-handoff-edge ${handoff.success ? 'org-edge-success' : 'org-edge-error'}`}
                strokeWidth={handoff.continuityScore * 3}
                strokeOpacity={0.7}
                markerEnd="url(#handoff-arrow)"
              />
              <text
                x={(sourcePos.x + targetPos.x) / 2}
                y={(sourcePos.y + targetPos.y) / 2}
                className="org-handoff-label"
                textAnchor="middle"
                dy="-5"
              >
                {Math.round(handoff.latency)}ms
              </text>
            </g>
          );
        })}

        {/* Render instances as nodes */}
        {data.instances.map((instance, index) => {
          const pos = getInstancePosition(index, data.instances.length);
          const isSelected = selectedInstance === instance.sessionId;

          return (
            <g key={instance.sessionId}>
              <circle
                cx={pos.x}
                cy={pos.y}
                r={isSelected ? 25 : 20}
                className={`org-instance-node ${getInstanceColor(instance.instanceType.type)} ${isSelected ? 'org-node-selected' : ''}`}
                onClick={() => {
                  setSelectedInstance(instance.sessionId);
                  onSelectInstance?.(instance.sessionId);
                }}
                style={{ cursor: onSelectInstance ? 'pointer' : 'default' }}
              />
              <text x={pos.x} y={pos.y + 35} className="org-instance-label" textAnchor="middle">
                {instance.instanceType.type.toUpperCase()}
              </text>
            </g>
          );
        })}

        {/* Arrow marker definition */}
        <defs>
          <marker
            id="handoff-arrow"
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon points="0 0, 10 3.5, 0 7" className="org-arrow" />
          </marker>
        </defs>
      </svg>

      {selectedInstance && (
        <div className="mt-4 org-card-inner">
          <h5 className="org-font-semibold mb-2">Instance Details</h5>
          {(() => {
            const instance = data.instances.find((i) => i.sessionId === selectedInstance);
            if (!instance) return null;

            return (
              <div className="grid grid-cols-2 gap-4 org-text-sm">
                <div>
                  <div className="org-text-muted">Type</div>
                  <div>{instance.instanceType.type.toUpperCase()}</div>
                </div>
                <div>
                  <div className="org-text-muted">Version</div>
                  <div>{instance.instanceType.version}</div>
                </div>
                <div>
                  <div className="org-text-muted">Platform</div>
                  <div>{instance.instanceType.platform || 'N/A'}</div>
                </div>
                <div>
                  <div className="org-text-muted">Location</div>
                  <div>{instance.location}</div>
                </div>
                <div>
                  <div className="org-text-muted">Context Preserved</div>
                  <div
                    className={instance.contextPreserved ? 'org-text-success' : 'org-text-error'}
                  >
                    {instance.contextPreserved ? 'Yes' : 'No'}
                  </div>
                </div>
                <div>
                  <div className="org-text-muted">Tasks</div>
                  <div>{instance.tasksContinued + instance.tasksInitiated} total</div>
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
};

const SummaryView: React.FC<{ data: CrossInstanceData }> = ({ data }) => (
  <div className="org-instance-summary">
    <div className="grid grid-cols-4 gap-4 mb-6">
      <div className="org-stat-card">
        <div className="org-stat-value">{data.instances.length}</div>
        <div className="org-stat-label">Instances</div>
      </div>
      <div className="org-stat-card">
        <div className="org-stat-value">{data.contextSwitches}</div>
        <div className="org-stat-label">Context Switches</div>
      </div>
      <div className="org-stat-card">
        <div className={`org-stat-value ${getContinuityColor(data.overallContinuityScore)}`}>
          {Math.round(data.overallContinuityScore * 100)}%
        </div>
        <div className="org-stat-label">Continuity Score</div>
      </div>
      <div className="org-stat-card">
        <div className="org-stat-value">{Math.round(data.totalSessionTime / 60000)}m</div>
        <div className="org-stat-label">Total Time</div>
      </div>
    </div>

    <div className="space-y-4">
      <div className="org-card-inner">
        <h4 className="org-font-semibold mb-3">Instance Usage Breakdown</h4>
        <div className="space-y-2">
          {Object.entries(
            data.instances.reduce(
              (acc, instance) => {
                const type = instance.instanceType.type;
                acc[type] = (acc[type] || 0) + (instance.duration || 0);
                return acc;
              },
              {} as Record<string, number>,
            ),
          )
            .sort(([, a], [, b]) => b - a)
            .map(([type, duration]) => (
              <div key={type} className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className={getInstanceColor(type as InstanceType['type'])}>
                    {getInstanceIcon(type as InstanceType['type'])}
                  </div>
                  <span className="org-font-medium">{type.toUpperCase()}</span>
                </div>
                <span className="org-text-muted">
                  {Math.round(duration / 60000)}m (
                  {Math.round((duration / data.totalSessionTime) * 100)}%)
                </span>
              </div>
            ))}
        </div>
      </div>

      <div className="org-card-inner">
        <h4 className="org-font-semibold mb-3">Handoff Analysis</h4>
        <div className="space-y-2">
          <div className="flex justify-between">
            <span>Successful Handoffs</span>
            <span className="org-text-success">
              {data.handoffs.filter((h) => h.success).length}/{data.handoffs.length}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Average Latency</span>
            <span>
              {Math.round(
                data.handoffs.reduce((sum, h) => sum + h.latency, 0) / data.handoffs.length,
              )}
              ms
            </span>
          </div>
          <div className="flex justify-between">
            <span>Context Preservation Rate</span>
            <span
              className={getContinuityColor(
                data.instances.filter((i) => i.contextPreserved).length / data.instances.length,
              )}
            >
              {Math.round(
                (data.instances.filter((i) => i.contextPreserved).length / data.instances.length) *
                  100,
              )}
              %
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
);

const HandoffsView: React.FC<{ data: CrossInstanceData }> = ({ data }) => (
  <div className="org-handoffs-view">
    <h4 className="org-text-lg org-font-semibold mb-4">Session Handoffs</h4>

    <div className="space-y-3">
      {data.handoffs
        .sort((a, b) => b.handoffTime - a.handoffTime)
        .map((handoff) => {
          const source = data.instances.find((i) => i.sessionId === handoff.sourceInstanceId);
          const target = data.instances.find((i) => i.sessionId === handoff.targetInstanceId);

          return (
            <div key={handoff.id} className="org-card-inner">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-3">
                  <div className="flex items-center space-x-2">
                    <div
                      className={
                        source ? getInstanceColor(source.instanceType.type) : 'org-text-muted'
                      }
                    >
                      {source ? (
                        getInstanceIcon(source.instanceType.type)
                      ) : (
                        <Activity className="h-4 w-4" />
                      )}
                    </div>
                    <span className="org-font-mono org-text-sm">
                      {source?.sessionId.slice(-8) || 'Unknown'}
                    </span>
                  </div>

                  <ArrowRight className="h-4 w-4 org-text-muted" />

                  <div className="flex items-center space-x-2">
                    <div
                      className={
                        target ? getInstanceColor(target.instanceType.type) : 'org-text-muted'
                      }
                    >
                      {target ? (
                        getInstanceIcon(target.instanceType.type)
                      ) : (
                        <Activity className="h-4 w-4" />
                      )}
                    </div>
                    <span className="org-font-mono org-text-sm">
                      {target?.sessionId.slice(-8) || 'Unknown'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <span
                    className={`org-badge org-badge-xs ${handoff.success ? 'org-badge-success' : 'org-badge-error'}`}
                  >
                    {handoff.success ? 'Success' : 'Failed'}
                  </span>
                  <span className="org-text-xs org-text-muted">
                    {new Date(handoff.handoffTime).toLocaleString()}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 org-text-sm mb-3">
                <div>
                  <div className="org-text-muted">Method</div>
                  <div>{getHandoffMethodLabel(handoff.method)}</div>
                </div>
                <div>
                  <div className="org-text-muted">Continuity Score</div>
                  <div className={getContinuityColor(handoff.continuityScore)}>
                    {Math.round(handoff.continuityScore * 100)}%
                  </div>
                </div>
                <div>
                  <div className="org-text-muted">Latency</div>
                  <div>{handoff.latency}ms</div>
                </div>
              </div>

              {handoff.dataPreserved.length > 0 && (
                <div className="mb-2">
                  <div className="org-text-sm org-font-medium mb-1">Data Preserved</div>
                  <div className="flex flex-wrap gap-1">
                    {handoff.dataPreserved.map((item) => (
                      <span key={item} className="org-badge org-badge-success org-badge-xs">
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {handoff.dataLost.length > 0 && (
                <div className="mb-2">
                  <div className="org-text-sm org-font-medium mb-1">Data Lost</div>
                  <div className="flex flex-wrap gap-1">
                    {handoff.dataLost.map((item) => (
                      <span key={item} className="org-badge org-badge-error org-badge-xs">
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {!handoff.success && handoff.failureReason && (
                <div className="org-text-sm org-text-error">
                  <strong>Failure:</strong> {handoff.failureReason}
                </div>
              )}
            </div>
          );
        })}
    </div>
  </div>
);

export const CrossInstanceSessionTracker: React.FC<CrossInstanceSessionTrackerProps> = ({
  sessionCorrelation,
  mode = 'timeline',
  showHandoffDetails = true,
  onSelectInstance,
  className = '',
}) => {
  const { teamFilter } = useOrganizationalContext();
  const [data, setData] = useState<CrossInstanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCrossInstanceData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Generate mock cross-instance data
        const instances: SessionInstance[] = [
          {
            sessionId: sessionCorrelation.sessionId,
            operatorId: sessionCorrelation.operatorId,
            instanceType: { type: 'web', version: '1.0.0', platform: 'browser' },
            startTime: sessionCorrelation.timestamp,
            location: 'San Francisco, CA',
            contextPreserved: true,
            tasksContinued: 0,
            tasksInitiated: 3,
            tasksFailed: 0,
          },
          ...sessionCorrelation.relatedSessions.slice(0, 3).map((relatedId, index) => ({
            sessionId: relatedId,
            operatorId: sessionCorrelation.operatorId,
            instanceType: {
              type: ['cli', 'vscode', 'desktop'][index] as InstanceType['type'],
              version: '1.0.0',
              platform: ['linux', 'windows', 'macos'][index],
            },
            startTime: sessionCorrelation.timestamp - (index + 1) * 7200000,
            endTime: sessionCorrelation.timestamp - (index + 1) * 7200000 + 3600000,
            duration: 3600000,
            location: ['New York, NY', 'London, UK', 'Tokyo, JP'][index],
            contextPreserved: index < 2,
            tasksContinued: index === 0 ? 2 : 1,
            tasksInitiated: index + 1,
            tasksFailed: index === 2 ? 1 : 0,
          })),
        ];

        const handoffs: SessionHandoff[] = instances.slice(1).map((_instance, index) => ({
          id: `handoff-${index}`,
          sourceInstanceId: instances[index + 1].sessionId,
          targetInstanceId: instances[index].sessionId,
          handoffTime: instances[index].startTime - 300000, // 5 minutes before
          method: ['context-resume', 'explicit', 'state-sync'][
            index % 3
          ] as SessionHandoff['method'],
          continuityScore: 0.7 + Math.random() * 0.3,
          dataPreserved: ['context', 'session-state', 'task-progress'],
          dataLost: index === 2 ? ['local-preferences'] : [],
          latency: 100 + Math.random() * 500,
          success: index < 2,
          failureReason: index === 2 ? 'Version compatibility issue' : undefined,
        }));

        const totalDuration = instances.reduce((sum, i) => sum + (i.duration || 0), 0);
        const _successfulHandoffs = handoffs.filter((h) => h.success).length;
        const continuityScore =
          handoffs.reduce((sum, h) => sum + h.continuityScore, 0) / handoffs.length;

        setData({
          instances,
          handoffs,
          operatorId: sessionCorrelation.operatorId,
          totalSessionTime: totalDuration,
          overallContinuityScore: continuityScore,
          contextSwitches: handoffs.length,
          mostUsedInstance: 'web',
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load cross-instance data');
      } finally {
        setLoading(false);
      }
    };

    fetchCrossInstanceData();
  }, [sessionCorrelation]);

  if (loading) {
    return (
      <div className={`org-instance-tracker org-loading ${className}`}>
        <div className="flex items-center space-x-2">
          <div className="org-spinner org-spinner-sm" />
          <span className="org-text-muted">Loading cross-instance tracking...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`org-instance-tracker org-error ${className}`}>
        <div className="org-error-message">
          <AlertCircle className="h-5 w-5 text-red-500" />
          <span>Failed to load cross-instance data: {error}</span>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className={`org-instance-tracker org-empty ${className}`}>
        <div className="org-empty-state">
          <Activity className="h-8 w-8 org-text-muted mb-2" />
          <div className="org-text-muted">No cross-instance data available</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`org-instance-tracker org-tracker-${mode} ${className}`}>
      {mode !== 'summary' && (
        <div className="flex items-center justify-between mb-4">
          <h3 className="org-text-lg org-font-semibold">Cross-Instance Session Tracking</h3>
          <div className="org-text-sm org-text-muted">
            {data.instances.length} instances, {data.contextSwitches} handoffs
          </div>
        </div>
      )}

      {mode === 'timeline' && (
        <TimelineView
          data={data}
          onSelectInstance={onSelectInstance}
          showHandoffDetails={showHandoffDetails}
        />
      )}
      {mode === 'network' && <NetworkView data={data} onSelectInstance={onSelectInstance} />}
      {mode === 'summary' && <SummaryView data={data} />}
      {mode === 'handoffs' && <HandoffsView data={data} />}
    </div>
  );
};

export default CrossInstanceSessionTracker;
