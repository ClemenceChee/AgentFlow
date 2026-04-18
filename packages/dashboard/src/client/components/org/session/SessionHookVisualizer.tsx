/**
 * SessionHookVisualizer Component
 *
 * Displays session hook execution status with real-time updates,
 * execution timeline, and performance metrics.
 */

import { useState, useEffect } from 'react';
import { Clock, CheckCircle, XCircle, AlertCircle, Play, Pause, RotateCcw } from 'lucide-react';
import { useOrganizationalContext } from '../../../../contexts/OrganizationalContext';
import type { SessionCorrelation } from '../../../types/organizational.js';

export interface SessionHook {
  readonly id: string;
  readonly name: string;
  readonly type: 'start' | 'initialized' | 'end' | 'custom';
  readonly status: 'pending' | 'running' | 'success' | 'failed' | 'timeout';
  readonly startTime?: number;
  readonly endTime?: number;
  readonly duration?: number;
  readonly error?: string;
  readonly metadata?: Record<string, any>;
  readonly retryCount?: number;
  readonly maxRetries?: number;
}

export interface SessionHookExecution {
  readonly sessionId: string;
  readonly operatorId: string;
  readonly timestamp: number;
  readonly hooks: readonly SessionHook[];
  readonly totalDuration?: number;
  readonly overallStatus: 'pending' | 'running' | 'success' | 'failed' | 'partial';
}

interface SessionHookVisualizerProps {
  /** Session correlation data containing hook information */
  readonly sessionCorrelation: SessionCorrelation;
  /** Display mode for hook visualization */
  readonly mode?: 'compact' | 'detailed' | 'timeline';
  /** Whether to show real-time updates */
  readonly realTime?: boolean;
  /** Callback for hook retry actions */
  readonly onRetryHook?: (hookId: string) => Promise<void>;
  /** Additional CSS classes */
  readonly className?: string;
}

const getStatusIcon = (status: SessionHook['status']) => {
  switch (status) {
    case 'success': return <CheckCircle className="h-4 w-4 text-green-600" />;
    case 'failed': return <XCircle className="h-4 w-4 text-red-600" />;
    case 'running': return <Play className="h-4 w-4 text-blue-600" />;
    case 'pending': return <Clock className="h-4 w-4 text-gray-400" />;
    case 'timeout': return <AlertCircle className="h-4 w-4 text-orange-600" />;
    default: return <Clock className="h-4 w-4 text-gray-400" />;
  }
};

const getStatusColor = (status: SessionHook['status']) => {
  switch (status) {
    case 'success': return 'org-text-success';
    case 'failed': return 'org-text-error';
    case 'running': return 'org-text-info';
    case 'pending': return 'org-text-muted';
    case 'timeout': return 'org-text-warning';
    default: return 'org-text-muted';
  }
};

const formatDuration = (ms?: number): string => {
  if (!ms) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
};

const CompactHookView: React.FC<{ execution: SessionHookExecution }> = ({ execution }) => (
  <div className="org-hook-compact">
    <div className="flex items-center justify-between mb-2">
      <span className="org-text-sm org-font-medium">
        Session Hooks ({execution.hooks.length})
      </span>
      <span className={`org-text-xs ${getStatusColor(execution.overallStatus)}`}>
        {execution.overallStatus.toUpperCase()}
      </span>
    </div>
    <div className="flex space-x-1">
      {execution.hooks.map((hook) => (
        <div
          key={hook.id}
          className="h-2 w-8 rounded-sm org-bg-surface flex-shrink-0"
          title={`${hook.name}: ${hook.status}`}
        >
          <div
            className={`h-full rounded-sm transition-all duration-300 ${
              hook.status === 'success' ? 'org-bg-success' :
              hook.status === 'failed' ? 'org-bg-error' :
              hook.status === 'running' ? 'org-bg-info' :
              hook.status === 'timeout' ? 'org-bg-warning' :
              'org-bg-muted'
            }`}
            style={{
              width: hook.status === 'running' ? '60%' :
                     hook.status === 'pending' ? '20%' : '100%'
            }}
          />
        </div>
      ))}
    </div>
    {execution.totalDuration && (
      <div className="mt-1 org-text-xs org-text-muted">
        Total: {formatDuration(execution.totalDuration)}
      </div>
    )}
  </div>
);

const DetailedHookView: React.FC<{
  execution: SessionHookExecution;
  onRetryHook?: (hookId: string) => Promise<void>;
}> = ({ execution, onRetryHook }) => (
  <div className="org-hook-detailed">
    <div className="flex items-center justify-between mb-4">
      <h4 className="org-text-base org-font-semibold">Session Hook Execution</h4>
      <div className="flex items-center space-x-2">
        <span className={`org-badge ${getStatusColor(execution.overallStatus)}`}>
          {execution.overallStatus.toUpperCase()}
        </span>
        {execution.totalDuration && (
          <span className="org-text-sm org-text-muted">
            {formatDuration(execution.totalDuration)}
          </span>
        )}
      </div>
    </div>

    <div className="space-y-3">
      {execution.hooks.map((hook) => (
        <div key={hook.id} className="org-card-inner p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-2">
              {getStatusIcon(hook.status)}
              <span className="org-font-medium">{hook.name}</span>
              <span className="org-badge org-badge-secondary">
                {hook.type}
              </span>
            </div>
            <div className="flex items-center space-x-2">
              {hook.duration && (
                <span className="org-text-sm org-text-muted">
                  {formatDuration(hook.duration)}
                </span>
              )}
              {hook.status === 'failed' && onRetryHook && hook.retryCount !== undefined &&
               hook.maxRetries !== undefined && hook.retryCount < hook.maxRetries && (
                <button
                  onClick={() => onRetryHook(hook.id)}
                  className="org-button org-button-ghost org-button-xs"
                  title="Retry hook execution"
                >
                  <RotateCcw className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>

          {hook.error && (
            <div className="mt-2 p-2 org-bg-error-light rounded-md">
              <div className="org-text-sm org-text-error org-font-medium mb-1">Error</div>
              <div className="org-text-sm org-text-error-dark org-font-mono">
                {hook.error}
              </div>
            </div>
          )}

          {hook.retryCount !== undefined && hook.retryCount > 0 && (
            <div className="mt-2 org-text-xs org-text-muted">
              Retry {hook.retryCount}/{hook.maxRetries || 3}
            </div>
          )}

          {hook.metadata && Object.keys(hook.metadata).length > 0 && (
            <div className="mt-2">
              <div className="org-text-xs org-text-muted mb-1">Metadata</div>
              <div className="org-text-xs org-font-mono org-bg-surface p-2 rounded">
                {JSON.stringify(hook.metadata, null, 2)}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  </div>
);

const TimelineHookView: React.FC<{ execution: SessionHookExecution }> = ({ execution }) => {
  const startTime = Math.min(...execution.hooks.map(h => h.startTime || 0).filter(t => t > 0));
  const endTime = Math.max(...execution.hooks.map(h => h.endTime || 0).filter(t => t > 0));
  const totalSpan = endTime - startTime;

  return (
    <div className="org-hook-timeline">
      <div className="flex items-center justify-between mb-4">
        <h4 className="org-text-base org-font-semibold">Hook Execution Timeline</h4>
        <span className="org-text-sm org-text-muted">
          {formatDuration(totalSpan)}
        </span>
      </div>

      <div className="relative">
        <div className="absolute left-8 top-0 bottom-0 w-px org-border-muted"></div>

        <div className="space-y-4">
          {execution.hooks
            .sort((a, b) => (a.startTime || 0) - (b.startTime || 0))
            .map((hook, index) => {
              const relativeStart = startTime > 0 && hook.startTime ?
                ((hook.startTime - startTime) / totalSpan) * 100 : 0;
              const duration = hook.duration || 0;
              const relativeWidth = totalSpan > 0 ? (duration / totalSpan) * 100 : 0;

              return (
                <div key={hook.id} className="relative flex items-center">
                  <div className="flex-shrink-0 w-16 h-8 flex items-center justify-center">
                    {getStatusIcon(hook.status)}
                  </div>

                  <div className="flex-1 ml-4">
                    <div className="flex items-center justify-between mb-1">
                      <span className="org-font-medium">{hook.name}</span>
                      <span className="org-text-xs org-text-muted">
                        {formatDuration(hook.duration)}
                      </span>
                    </div>

                    <div className="relative h-2 org-bg-surface rounded-full">
                      <div
                        className={`absolute h-full rounded-full transition-all duration-300 ${
                          hook.status === 'success' ? 'org-bg-success' :
                          hook.status === 'failed' ? 'org-bg-error' :
                          hook.status === 'running' ? 'org-bg-info' :
                          hook.status === 'timeout' ? 'org-bg-warning' :
                          'org-bg-muted'
                        }`}
                        style={{
                          left: `${relativeStart}%`,
                          width: `${Math.max(relativeWidth, 2)}%`
                        }}
                      />
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

export const SessionHookVisualizer: React.FC<SessionHookVisualizerProps> = ({
  sessionCorrelation,
  mode = 'detailed',
  realTime = false,
  onRetryHook,
  className = ''
}) => {
  const { teamFilter } = useOrganizationalContext();
  const [execution, setExecution] = useState<SessionHookExecution | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchHookExecution = async () => {
      try {
        setLoading(true);
        setError(null);

        // Transform session correlation data into hook execution format
        const hooks: SessionHook[] = [
          {
            id: 'session-start',
            name: 'Session Start',
            type: 'start',
            status: 'success',
            startTime: sessionCorrelation.timestamp,
            endTime: sessionCorrelation.timestamp + 100,
            duration: 100
          },
          {
            id: 'session-initialized',
            name: 'Session Initialized',
            type: 'initialized',
            status: sessionCorrelation.confidence > 0.8 ? 'success' : 'failed',
            startTime: sessionCorrelation.timestamp + 100,
            endTime: sessionCorrelation.timestamp + 250,
            duration: 150,
            error: sessionCorrelation.confidence <= 0.8 ? 'Low confidence initialization' : undefined
          }
        ];

        const overallStatus: SessionHookExecution['overallStatus'] =
          hooks.every(h => h.status === 'success') ? 'success' :
          hooks.some(h => h.status === 'failed') ? 'failed' :
          hooks.some(h => h.status === 'running') ? 'running' :
          'pending';

        setExecution({
          sessionId: sessionCorrelation.sessionId,
          operatorId: sessionCorrelation.operatorId,
          timestamp: sessionCorrelation.timestamp,
          hooks,
          totalDuration: hooks.reduce((sum, h) => sum + (h.duration || 0), 0),
          overallStatus
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load hook execution');
      } finally {
        setLoading(false);
      }
    };

    fetchHookExecution();
  }, [sessionCorrelation]);

  // Real-time updates
  useEffect(() => {
    if (!realTime || !execution) return;

    const interval = setInterval(() => {
      // Simulate real-time updates for running hooks
      setExecution(prev => {
        if (!prev) return prev;

        const updatedHooks = prev.hooks.map(hook => {
          if (hook.status === 'running') {
            const elapsed = Date.now() - (hook.startTime || 0);
            return {
              ...hook,
              duration: elapsed
            };
          }
          return hook;
        });

        return {
          ...prev,
          hooks: updatedHooks,
          totalDuration: updatedHooks.reduce((sum, h) => sum + (h.duration || 0), 0)
        };
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [realTime, execution]);

  if (loading) {
    return (
      <div className={`org-hook-visualizer org-loading ${className}`}>
        <div className="flex items-center space-x-2">
          <div className="org-spinner org-spinner-sm" />
          <span className="org-text-muted">Loading hook execution...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`org-hook-visualizer org-error ${className}`}>
        <div className="org-error-message">
          <AlertCircle className="h-5 w-5 text-red-500" />
          <span>Failed to load hook execution: {error}</span>
        </div>
      </div>
    );
  }

  if (!execution) {
    return (
      <div className={`org-hook-visualizer org-empty ${className}`}>
        <div className="org-empty-state">
          <Clock className="h-8 w-8 org-text-muted mb-2" />
          <div className="org-text-muted">No hook execution data available</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`org-hook-visualizer org-hook-${mode} ${className}`}>
      {mode === 'compact' && <CompactHookView execution={execution} />}
      {mode === 'detailed' && (
        <DetailedHookView execution={execution} onRetryHook={onRetryHook} />
      )}
      {mode === 'timeline' && <TimelineHookView execution={execution} />}
    </div>
  );
};

export default SessionHookVisualizer;