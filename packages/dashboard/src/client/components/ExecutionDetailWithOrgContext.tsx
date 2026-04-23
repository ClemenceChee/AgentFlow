import { useEffect, useState } from 'react';
import type { FullTrace } from '../hooks/useSelectedTrace';
import type { OrganizationalTrace } from '../types/organizational';
import { AgentFlow } from './AgentFlow';
import { DecisionReplay } from './DecisionReplay';
import { DependencyTree } from './DependencyTree';
import { FlameChart } from './FlameChart';
import { GuardExplanationCard, type Violation } from './GuardExplanationCard';
import { MetricsView } from './MetricsView';
import { OrganizationalContextPanel } from './org/context/OrganizationalContextPanel';
import { RunReceiptView } from './RunReceiptView';
import { StateMachine } from './StateMachine';
import { TranscriptView } from './TranscriptView';

// Types for enhanced SOMA execution steps
interface SOMAExecutionStep {
  id: string;
  name: string;
  type: 'harvester' | 'reconciler' | 'synthesizer' | 'cartographer';
  status: 'completed' | 'failed' | 'running';
  startTime: number;
  endTime?: number;
  duration?: number;
  details: {
    operation: string;
    description: string;
    input?: any;
    output?: any;
    metadata?: any;
  };
  subSteps?: SOMAExecutionStep[];
}

interface EnhancedSOMATrace {
  traceId: string;
  isSOMA: boolean;
  enhanced: boolean;
  worker: 'harvester' | 'reconciler' | 'synthesizer' | 'cartographer';
  executionSteps: SOMAExecutionStep[];
  operationalData: {
    entityChanges?: number;
    filesProcessed?: number;
    insightsGenerated?: number;
    errorsEncountered?: number;
  };
}

// Hook to convert FullTrace to OrganizationalTrace with mock organizational data
function useOrganizationalTrace(trace: FullTrace | null): OrganizationalTrace | null {
  const [orgTrace, setOrgTrace] = useState<OrganizationalTrace | null>(null);

  useEffect(() => {
    if (!trace) {
      setOrgTrace(null);
      return;
    }

    // Convert FullTrace to OrganizationalTrace with mock organizational context
    const convertedTrace: OrganizationalTrace = {
      // Base trace properties
      ...trace,

      // Enhanced organizational context
      operatorContext: {
        operatorId: `op-${Math.random().toString(36).substr(2, 9)}`,
        sessionId: trace.filename,
        teamId: determineTeamFromTrace(trace),
        instanceId: trace.agentId,
        timestamp: trace.startTime,
        userAgent: 'AgentFlow Dashboard 1.0',
      },

      sessionCorrelation: {
        correlationId: `corr-${trace.filename}`,
        relatedSessions: generateMockRelatedSessions(trace),
        confidenceScore: 0.85,
        similarityMetrics: {
          workflowSimilarity: 0.73,
          contextOverlap: 0.82,
          problemDomainMatch: 0.91,
          solutionPatternMatch: 0.67,
        },
        crossInstanceTracking: {
          instanceTransitions: [],
          handoffQuality: 0.89,
          continuityScore: 0.92,
        },
      },

      policyStatus: {
        evaluationId: `eval-${trace.filename}`,
        complianceStatus: trace.status === 'failed' ? 'violation' : 'compliant',
        policiesEvaluated: [
          {
            policyId: 'execution-time-limit',
            policyName: 'Execution Time Limit',
            status: trace.endTime - trace.startTime > 300000 ? 'violation' : 'compliant',
            severity: 'medium',
            details: `Execution time: ${Math.round((trace.endTime - trace.startTime) / 1000)}s`,
          },
          {
            policyId: 'error-rate-threshold',
            policyName: 'Error Rate Threshold',
            status:
              Object.values(trace.nodes).filter((n) => n.status === 'failed').length > 3
                ? 'violation'
                : 'compliant',
            severity: 'high',
            details: `Failed nodes: ${Object.values(trace.nodes).filter((n) => n.status === 'failed').length}`,
          },
        ],
        governanceRecommendations: generateGovernanceRecommendations(trace),
        approvalWorkflow: null,
        exemptionStatus: null,
      },
    };

    setOrgTrace(convertedTrace);
  }, [trace]);

  return orgTrace;
}

// Helper function to determine team from trace characteristics
function determineTeamFromTrace(trace: FullTrace): string {
  if (
    trace.agentId?.toLowerCase().includes('frontend') ||
    trace.name?.toLowerCase().includes('ui') ||
    trace.name?.toLowerCase().includes('react')
  ) {
    return 'team-frontend';
  }
  if (
    trace.agentId?.toLowerCase().includes('backend') ||
    trace.name?.toLowerCase().includes('api') ||
    trace.name?.toLowerCase().includes('server')
  ) {
    return 'team-backend';
  }
  if (trace.agentId?.toLowerCase().includes('soma') || trace.name?.toLowerCase().includes('soma')) {
    return 'team-soma';
  }
  if (
    trace.agentId?.toLowerCase().includes('infra') ||
    trace.name?.toLowerCase().includes('deploy')
  ) {
    return 'team-infra';
  }
  return 'team-general';
}

// Helper function to generate mock related sessions
function generateMockRelatedSessions(trace: FullTrace) {
  return [
    {
      sessionId: `session-${Math.random().toString(36).substr(2, 9)}`,
      similarity: 0.89,
      relationshipType: 'workflow_similarity' as const,
      timestamp: trace.startTime - 3600000,
      summary: 'Similar data processing workflow with comparable node patterns',
    },
    {
      sessionId: `session-${Math.random().toString(36).substr(2, 9)}`,
      similarity: 0.76,
      relationshipType: 'problem_pattern' as const,
      timestamp: trace.startTime - 7200000,
      summary: 'Encountered similar error patterns in execution flow',
    },
  ];
}

// Helper function to generate governance recommendations
function generateGovernanceRecommendations(trace: FullTrace) {
  const recommendations = [];

  const duration = trace.endTime - trace.startTime;
  if (duration > 300000) {
    // 5 minutes
    recommendations.push({
      type: 'optimization' as const,
      priority: 'medium' as const,
      title: 'Long Execution Time Detected',
      description: `Execution took ${Math.round(duration / 1000)}s. Consider optimizing for better performance.`,
      actionable: true,
      estimatedImpact: 'medium' as const,
    });
  }

  const failedNodes = Object.values(trace.nodes).filter((n) => n.status === 'failed');
  if (failedNodes.length > 0) {
    recommendations.push({
      type: 'reliability' as const,
      priority: 'high' as const,
      title: 'Error Handling Review Needed',
      description: `${failedNodes.length} nodes failed. Review error handling and retry mechanisms.`,
      actionable: true,
      estimatedImpact: 'high' as const,
    });
  }

  return recommendations;
}

// Hook to fetch enhanced SOMA trace data (existing code from ExecutionDetail)
function useEnhancedSOMATrace(trace: FullTrace | null): EnhancedSOMATrace | null {
  const [enhancedTrace, setEnhancedTrace] = useState<EnhancedSOMATrace | null>(null);

  useEffect(() => {
    if (!trace) {
      setEnhancedTrace(null);
      return;
    }

    // Check if this is a SOMA trace (basic heuristic - could be improved)
    const isSOMATrace =
      trace.agentId?.toLowerCase().includes('soma') ||
      trace.name?.toLowerCase().includes('soma') ||
      Object.values(trace.nodes).some((node) => node.type?.toLowerCase().includes('soma'));

    if (!isSOMATrace) {
      setEnhancedTrace(null);
      return;
    }

    // TODO: In real implementation, this would call the trace enhancement service
    // For now, generate mock enhanced data based on trace type detection
    const mockEnhanced: EnhancedSOMATrace = {
      traceId: trace.filename,
      isSOMA: true,
      enhanced: true,
      worker: detectSOMAWorkerType(trace),
      executionSteps: generateMockSOMASteps(trace),
      operationalData: {
        entityChanges: Math.floor(Math.random() * 50),
        filesProcessed: Math.floor(Math.random() * 20),
        insightsGenerated: Math.floor(Math.random() * 10),
        errorsEncountered: Object.values(trace.nodes).filter((n) => n.status === 'failed').length,
      },
    };

    setEnhancedTrace(mockEnhanced);
  }, [trace]);

  return enhancedTrace;
}

// Helper function to detect SOMA worker type from trace (existing code)
function detectSOMAWorkerType(
  trace: FullTrace,
): 'harvester' | 'reconciler' | 'synthesizer' | 'cartographer' {
  const nodes = Object.values(trace.nodes);

  if (nodes.some((n) => n.type?.includes('harvest') || n.name?.includes('harvest'))) {
    return 'harvester';
  }
  if (nodes.some((n) => n.type?.includes('reconcile') || n.name?.includes('reconcile'))) {
    return 'reconciler';
  }
  if (nodes.some((n) => n.type?.includes('synthesize') || n.name?.includes('synthesize'))) {
    return 'synthesizer';
  }
  if (nodes.some((n) => n.type?.includes('cartographer') || n.name?.includes('map'))) {
    return 'cartographer';
  }

  return 'harvester';
}

// Helper function to generate mock SOMA execution steps (existing code - simplified)
function generateMockSOMASteps(trace: FullTrace): SOMAExecutionStep[] {
  const workerType = detectSOMAWorkerType(trace);
  const nodes = Object.values(trace.nodes);

  const baseSteps: Record<string, SOMAExecutionStep[]> = {
    harvester: [
      {
        id: 'step-1',
        name: 'Inbox Scanning',
        type: 'harvester',
        status: 'completed',
        startTime: trace.startTime,
        endTime: trace.startTime + 2000,
        duration: 2000,
        details: {
          operation: 'scan_inbox',
          description: 'Scanning inbox for new files and events',
          output: { filesFound: Math.floor(Math.random() * 10) + 1 },
        },
      },
      {
        id: 'step-2',
        name: 'Event Ingestion',
        type: 'harvester',
        status: nodes.some((n) => n.status === 'failed') ? 'failed' : 'completed',
        startTime: trace.startTime + 2000,
        endTime: trace.endTime,
        duration: trace.endTime - (trace.startTime + 2000),
        details: {
          operation: 'ingest_events',
          description: 'Ingesting events into SOMA vault',
          output: { entitiesCreated: Math.floor(Math.random() * 15) + 3 },
        },
      },
    ],
    synthesizer: [
      {
        id: 'step-1',
        name: 'LLM Analysis',
        type: 'synthesizer',
        status: 'completed',
        startTime: trace.startTime,
        endTime: trace.startTime + 15000,
        duration: 15000,
        details: {
          operation: 'llm_analysis',
          description: 'Deep LLM analysis for insight generation',
          output: { insightsGenerated: Math.floor(Math.random() * 8) + 2 },
        },
      },
    ],
    reconciler: [
      {
        id: 'step-1',
        name: 'Entity Merging',
        type: 'reconciler',
        status: nodes.some((n) => n.status === 'failed') ? 'failed' : 'completed',
        startTime: trace.startTime,
        endTime: trace.endTime,
        duration: trace.endTime - trace.startTime,
        details: {
          operation: 'merge_entities',
          description: 'Merging duplicate entities and fixing data consistency',
          output: { entitiesMerged: Math.floor(Math.random() * 3) },
        },
      },
    ],
    cartographer: [
      {
        id: 'step-1',
        name: 'Relationship Mapping',
        type: 'cartographer',
        status: nodes.some((n) => n.status === 'failed') ? 'failed' : 'completed',
        startTime: trace.startTime,
        endTime: trace.endTime,
        duration: trace.endTime - trace.startTime,
        details: {
          operation: 'map_relationships',
          description: 'Mapping complex relationships between entities',
          output: { relationshipsMapped: Math.floor(Math.random() * 50) + 10 },
        },
      },
    ],
  };

  return baseSteps[workerType] || baseSteps.harvester;
}

type Tab =
  | 'flame'
  | 'flow'
  | 'metrics'
  | 'deps'
  | 'state'
  | 'summary'
  | 'transcript'
  | 'receipt'
  | 'decisions'
  | 'soma-steps';

function fmtDur(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

// SOMA Execution Steps Viewer Component (existing code - simplified)
function SOMAStepsView({ enhancedTrace }: { enhancedTrace: EnhancedSOMATrace | null }) {
  if (!enhancedTrace) {
    return (
      <div className="soma-steps soma-steps--empty">
        <div className="soma-steps__empty-message">
          <h3>No SOMA Enhancement Available</h3>
          <p>This trace is not a SOMA worker execution or enhancement data is not available.</p>
        </div>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return '#3fb950';
      case 'failed':
        return '#f85149';
      case 'running':
        return '#d29922';
      default:
        return '#8b949e';
    }
  };

  const getWorkerIcon = (worker: string) => {
    switch (worker) {
      case 'harvester':
        return '🌾';
      case 'reconciler':
        return '🔧';
      case 'synthesizer':
        return '🧪';
      case 'cartographer':
        return '🗺️';
      default:
        return '⚙️';
    }
  };

  return (
    <div className="soma-steps">
      <div className="soma-steps__header">
        <h3 className="soma-steps__title">
          {getWorkerIcon(enhancedTrace.worker)} SOMA{' '}
          {enhancedTrace.worker.charAt(0).toUpperCase() + enhancedTrace.worker.slice(1)} Execution
        </h3>
        <div className="soma-steps__meta">
          <span className="soma-steps__enhanced-badge">Enhanced View</span>
        </div>
      </div>

      <div className="soma-steps__timeline">
        <h4 className="soma-steps__timeline-title">Execution Steps</h4>
        {enhancedTrace.executionSteps.map((step) => (
          <div key={step.id} className="soma-steps__step">
            <div className="soma-steps__step-header">
              <div
                className="soma-steps__step-status"
                style={{ backgroundColor: getStatusColor(step.status) }}
              />
              <div className="soma-steps__step-info">
                <span className="soma-steps__step-name">{step.name}</span>
                <span className="soma-steps__step-meta">
                  {step.duration && fmtDur(step.duration)}
                  <span
                    style={{
                      color: getStatusColor(step.status),
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      marginLeft: 8,
                    }}
                  >
                    {step.status}
                  </span>
                </span>
              </div>
            </div>
            <div className="soma-steps__step-details">
              <div className="soma-steps__step-description">{step.details.description}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Enhanced ExecutionDetail component with organizational context integration
export function ExecutionDetailWithOrgContext({
  trace,
  loading,
}: {
  trace: FullTrace | null;
  loading: boolean;
}) {
  const [tab, setTab] = useState<Tab>('flame');
  const [orgPanelCollapsed, setOrgPanelCollapsed] = useState(false);
  const enhancedSOMATrace = useEnhancedSOMATrace(trace);
  const organizationalTrace = useOrganizationalTrace(trace);

  if (loading) return <div className="workspace__empty">Loading...</div>;
  if (!trace) return <div className="workspace__empty">Select an execution</div>;

  const nodes = Object.values(trace.nodes);
  const failCount = nodes.filter((n) => n.status === 'failed').length;
  const duration = trace.endTime - trace.startTime;

  const baseTabs: { id: Tab; label: string }[] = [
    { id: 'flame', label: 'Flame Chart' },
    { id: 'flow', label: 'Agent Flow' },
    { id: 'metrics', label: 'Metrics' },
    { id: 'deps', label: 'Dependencies' },
    { id: 'state', label: 'State Machine' },
    { id: 'summary', label: 'Summary' },
    { id: 'transcript', label: 'Transcript' },
    { id: 'receipt', label: 'Receipt' },
    { id: 'decisions', label: 'Decisions' },
  ];

  // Add SOMA Steps tab if this is a SOMA trace
  const tabs = enhancedSOMATrace?.isSOMA
    ? [{ id: 'soma-steps' as Tab, label: '🧠 SOMA Steps' }, ...baseTabs]
    : baseTabs;

  // Auto-switch to SOMA steps tab for SOMA traces
  if (enhancedSOMATrace?.isSOMA && tab === 'flame') {
    setTab('soma-steps');
  }

  return (
    <div className="exec-detail-with-org-context">
      {/* Main execution detail content */}
      <div
        className={`exec-detail ${orgPanelCollapsed ? 'exec-detail--full-width' : 'exec-detail--with-org-panel'}`}
      >
        <div className="ed-header">
          <span className={`dot ${trace.status === 'failed' ? 'dot--fail' : 'dot--ok'}`} />
          <span className="ed-header__agent">{trace.agentId}</span>
          <span className="ed-header__meta">
            {nodes.length}n &middot; {fmtDur(duration)} &middot; {trace.status}
            {failCount > 0 && (
              <span style={{ color: 'var(--color-critical)' }}> &middot; {failCount} failed</span>
            )}
          </span>
          <span className="ed-header__ts">
            {new Date(trace.startTime).toLocaleString([], {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            })}
          </span>
          {trace.trigger && <span className="ed-tag">{trace.trigger}</span>}

          {/* Toggle button for organizational context panel */}
          <button
            type="button"
            className={`org-panel-toggle ${orgPanelCollapsed ? 'org-panel-toggle--collapsed' : ''}`}
            onClick={() => setOrgPanelCollapsed(!orgPanelCollapsed)}
            title={
              orgPanelCollapsed ? 'Show organizational context' : 'Hide organizational context'
            }
          >
            👥 {orgPanelCollapsed ? 'Show Context' : 'Hide Context'}
          </button>
        </div>

        <div className="ed-tabs">
          {tabs.map((t) => (
            <button
              type="button"
              key={t.id}
              className={`ed-tab ${tab === t.id ? 'ed-tab--active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="ed-content">
          {tab === 'soma-steps' && <SOMAStepsView enhancedTrace={enhancedSOMATrace} />}
          {tab === 'flame' && <FlameChart trace={trace} />}
          {tab === 'flow' && <AgentFlow trace={trace} />}
          {tab === 'metrics' && <MetricsView trace={trace} />}
          {tab === 'deps' && <DependencyTree trace={trace} />}
          {tab === 'state' && <StateMachine trace={trace} />}
          {tab === 'summary' && <SummaryContent trace={trace} />}
          {tab === 'transcript' && <TranscriptView trace={trace} />}
          {tab === 'receipt' && <RunReceiptView trace={trace} />}
          {tab === 'decisions' && (
            <DecisionReplay filename={trace.filename} agentId={trace.agentId} />
          )}
        </div>
      </div>

      {/* Organizational context panel */}
      {!orgPanelCollapsed && (
        <div className="org-context-sidebar">
          <OrganizationalContextPanel
            trace={organizationalTrace}
            position="right"
            compact={true}
            onCollapseChange={setOrgPanelCollapsed}
            showEmpty={true}
            className="execution-detail-org-panel"
          />
        </div>
      )}
    </div>
  );
}

// Inline summary (existing code)
function SummaryContent({ trace }: { trace: FullTrace }) {
  const nodes = Object.values(trace.nodes);
  const completed = nodes.filter((n) => n.status === 'completed').length;
  const failed = nodes.filter((n) => n.status === 'failed').length;
  const failedNodes = nodes.filter((n) => n.status === 'failed');
  const types = new Map<string, number>();
  for (const n of nodes) types.set(n.type, (types.get(n.type) ?? 0) + 1);
  const duration = trace.endTime - trace.startTime;
  const successRate = nodes.length > 0 ? ((completed / nodes.length) * 100).toFixed(1) : '0';

  return (
    <div className="summary-content">
      <div className="sc-grid">
        <div>
          <span className="sc-label">Agent</span> {trace.agentId}
        </div>
        <div>
          <span className="sc-label">Trigger</span> {trace.trigger}
        </div>
        <div>
          <span className="sc-label">Status</span>{' '}
          <span className={trace.status === 'failed' ? 'c-fail' : 'c-ok'}>{trace.status}</span>
        </div>
        <div>
          <span className="sc-label">Duration</span> {fmtDur(duration)}
        </div>
        <div>
          <span className="sc-label">Nodes</span> {nodes.length} ({completed} ok, {failed} fail)
        </div>
        <div>
          <span className="sc-label">Success</span> {successRate}%
        </div>
        <div>
          <span className="sc-label">Started</span> {new Date(trace.startTime).toLocaleString()}
        </div>
        {trace.name && (
          <div>
            <span className="sc-label">Name</span> {trace.name}
          </div>
        )}
      </div>
      {failedNodes.length > 0 && (
        <div className="sc-failures">
          <h4 className="sc-failures__title">{'\u2718'} Failed Nodes</h4>
          {failedNodes.map((n) => {
            const violation = (n.metadata?.guardViolation ?? n.state?.guardViolation) as
              | Violation
              | undefined;
            return (
              <div key={n.id} className="sc-failure">
                <span className="sc-failure__type">{n.type}:</span>
                <strong>{n.name}</strong>
                {violation ? (
                  <GuardExplanationCard violation={violation} />
                ) : (n.metadata?.error ?? n.state?.error) ? (
                  <span className="sc-failure__err">
                    {String(n.metadata?.error ?? n.state?.error)}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
      <div className="sc-types">
        <h4 className="sc-types__title">Node Types</h4>
        <div className="sc-types__list">
          {[...types.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([t, c]) => (
              <span key={t} className="sc-type-badge">
                {t}: {c}
              </span>
            ))}
        </div>
      </div>
    </div>
  );
}

// Export as default to maintain compatibility
export default ExecutionDetailWithOrgContext;
