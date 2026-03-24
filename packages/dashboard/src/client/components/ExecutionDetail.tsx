import { useState, useEffect } from 'react';
import type { FullTrace } from '../hooks/useSelectedTrace';
import { AgentFlow } from './AgentFlow';
import { DecisionReplay } from './DecisionReplay';
import { DependencyTree } from './DependencyTree';
import { FlameChart } from './FlameChart';
import { GuardExplanationCard, type Violation } from './GuardExplanationCard';
import { MetricsView } from './MetricsView';
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

// Hook to fetch enhanced SOMA trace data
function useEnhancedSOMATrace(trace: FullTrace | null): EnhancedSOMATrace | null {
  const [enhancedTrace, setEnhancedTrace] = useState<EnhancedSOMATrace | null>(null);

  useEffect(() => {
    if (!trace) {
      setEnhancedTrace(null);
      return;
    }

    // Check if this is a SOMA trace (basic heuristic - could be improved)
    const isSOMATrace = trace.agentId?.toLowerCase().includes('soma') ||
      trace.name?.toLowerCase().includes('soma') ||
      Object.values(trace.nodes).some(node => node.type?.toLowerCase().includes('soma'));

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
        errorsEncountered: Object.values(trace.nodes).filter(n => n.status === 'failed').length,
      },
    };

    setEnhancedTrace(mockEnhanced);
  }, [trace]);

  return enhancedTrace;
}

// Helper function to detect SOMA worker type from trace
function detectSOMAWorkerType(trace: FullTrace): 'harvester' | 'reconciler' | 'synthesizer' | 'cartographer' {
  const nodes = Object.values(trace.nodes);

  // Look for indicators in node types, names, or metadata
  if (nodes.some(n => n.type?.includes('harvest') || n.name?.includes('harvest'))) {
    return 'harvester';
  }
  if (nodes.some(n => n.type?.includes('reconcile') || n.name?.includes('reconcile'))) {
    return 'reconciler';
  }
  if (nodes.some(n => n.type?.includes('synthesize') || n.name?.includes('synthesize'))) {
    return 'synthesizer';
  }
  if (nodes.some(n => n.type?.includes('cartographer') || n.name?.includes('map'))) {
    return 'cartographer';
  }

  // Default fallback
  return 'harvester';
}

// Helper function to generate mock SOMA execution steps from trace data
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
        name: 'File Parsing',
        type: 'harvester',
        status: 'completed',
        startTime: trace.startTime + 2000,
        endTime: trace.startTime + 8000,
        duration: 6000,
        details: {
          operation: 'parse_files',
          description: 'Parsing and extracting structured data from files',
          output: { eventsExtracted: Math.floor(Math.random() * 20) + 5 },
        },
      },
      {
        id: 'step-3',
        name: 'Event Ingestion',
        type: 'harvester',
        status: nodes.some(n => n.status === 'failed') ? 'failed' : 'completed',
        startTime: trace.startTime + 8000,
        endTime: trace.endTime,
        duration: trace.endTime - (trace.startTime + 8000),
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
        name: 'Candidate Scoring',
        type: 'synthesizer',
        status: 'completed',
        startTime: trace.startTime,
        endTime: trace.startTime + 5000,
        duration: 5000,
        details: {
          operation: 'score_candidates',
          description: 'Scoring synthesis candidates based on relevance',
          output: { candidatesScored: Math.floor(Math.random() * 30) + 10 },
        },
      },
      {
        id: 'step-2',
        name: 'LLM Analysis',
        type: 'synthesizer',
        status: 'completed',
        startTime: trace.startTime + 5000,
        endTime: trace.startTime + 25000,
        duration: 20000,
        details: {
          operation: 'llm_analysis',
          description: 'Deep LLM analysis for insight generation',
          output: { insightsGenerated: Math.floor(Math.random() * 8) + 2 },
        },
      },
      {
        id: 'step-3',
        name: 'Deduplication',
        type: 'synthesizer',
        status: nodes.some(n => n.status === 'failed') ? 'failed' : 'completed',
        startTime: trace.startTime + 25000,
        endTime: trace.endTime,
        duration: trace.endTime - (trace.startTime + 25000),
        details: {
          operation: 'deduplicate',
          description: 'Removing duplicate insights and consolidating',
          output: { uniqueInsights: Math.floor(Math.random() * 5) + 1 },
        },
      },
    ],
    reconciler: [
      {
        id: 'step-1',
        name: 'Issue Detection',
        type: 'reconciler',
        status: 'completed',
        startTime: trace.startTime,
        endTime: trace.startTime + 3000,
        duration: 3000,
        details: {
          operation: 'detect_issues',
          description: 'Detecting inconsistencies and conflicts in vault data',
          output: { issuesFound: Math.floor(Math.random() * 5) },
        },
      },
      {
        id: 'step-2',
        name: 'Entity Merging',
        type: 'reconciler',
        status: nodes.some(n => n.status === 'failed') ? 'failed' : 'completed',
        startTime: trace.startTime + 3000,
        endTime: trace.endTime,
        duration: trace.endTime - (trace.startTime + 3000),
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
        name: 'Entity Embedding',
        type: 'cartographer',
        status: 'completed',
        startTime: trace.startTime,
        endTime: trace.startTime + 10000,
        duration: 10000,
        details: {
          operation: 'embed_entities',
          description: 'Generating semantic embeddings for entities',
          output: { entitiesEmbedded: Math.floor(Math.random() * 100) + 20 },
        },
      },
      {
        id: 'step-2',
        name: 'Archetype Discovery',
        type: 'cartographer',
        status: 'completed',
        startTime: trace.startTime + 10000,
        endTime: trace.startTime + 20000,
        duration: 10000,
        details: {
          operation: 'discover_archetypes',
          description: 'Discovering patterns and archetypes in entity relationships',
          output: { archetypesFound: Math.floor(Math.random() * 3) + 1 },
        },
      },
      {
        id: 'step-3',
        name: 'Relationship Mapping',
        type: 'cartographer',
        status: nodes.some(n => n.status === 'failed') ? 'failed' : 'completed',
        startTime: trace.startTime + 20000,
        endTime: trace.endTime,
        duration: trace.endTime - (trace.startTime + 20000),
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

// SOMA Execution Steps Viewer Component
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
      case 'completed': return '#3fb950';
      case 'failed': return '#f85149';
      case 'running': return '#d29922';
      default: return '#8b949e';
    }
  };

  const getWorkerIcon = (worker: string) => {
    switch (worker) {
      case 'harvester': return '🌾';
      case 'reconciler': return '🔧';
      case 'synthesizer': return '🧪';
      case 'cartographer': return '🗺️';
      default: return '⚙️';
    }
  };

  return (
    <div className="soma-steps">
      {/* Worker Header */}
      <div className="soma-steps__header">
        <h3 className="soma-steps__title">
          {getWorkerIcon(enhancedTrace.worker)} SOMA {enhancedTrace.worker.charAt(0).toUpperCase() + enhancedTrace.worker.slice(1)} Execution
        </h3>
        <div className="soma-steps__meta">
          <span className="soma-steps__enhanced-badge">Enhanced View</span>
        </div>
      </div>

      {/* Operational Summary */}
      <div className="soma-steps__summary">
        <div className="soma-steps__summary-grid">
          {enhancedTrace.operationalData.entityChanges !== undefined && (
            <div className="soma-steps__summary-item">
              <span className="soma-steps__summary-label">Entity Changes</span>
              <span className="soma-steps__summary-value">{enhancedTrace.operationalData.entityChanges}</span>
            </div>
          )}
          {enhancedTrace.operationalData.filesProcessed !== undefined && (
            <div className="soma-steps__summary-item">
              <span className="soma-steps__summary-label">Files Processed</span>
              <span className="soma-steps__summary-value">{enhancedTrace.operationalData.filesProcessed}</span>
            </div>
          )}
          {enhancedTrace.operationalData.insightsGenerated !== undefined && (
            <div className="soma-steps__summary-item">
              <span className="soma-steps__summary-label">Insights Generated</span>
              <span className="soma-steps__summary-value">{enhancedTrace.operationalData.insightsGenerated}</span>
            </div>
          )}
          {enhancedTrace.operationalData.errorsEncountered !== undefined && (
            <div className="soma-steps__summary-item">
              <span className="soma-steps__summary-label">Errors</span>
              <span
                className="soma-steps__summary-value"
                style={{ color: enhancedTrace.operationalData.errorsEncountered > 0 ? '#f85149' : '#3fb950' }}
              >
                {enhancedTrace.operationalData.errorsEncountered}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Execution Steps Timeline */}
      <div className="soma-steps__timeline">
        <h4 className="soma-steps__timeline-title">Granular Execution Steps</h4>
        {enhancedTrace.executionSteps.map((step, index) => (
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
                  <span style={{
                    color: getStatusColor(step.status),
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    marginLeft: 8,
                  }}>
                    {step.status}
                  </span>
                </span>
              </div>
            </div>

            <div className="soma-steps__step-details">
              <div className="soma-steps__step-description">
                {step.details.description}
              </div>

              {step.details.output && (
                <div className="soma-steps__step-output">
                  <span className="soma-steps__step-output-label">Output:</span>
                  <div className="soma-steps__step-output-data">
                    {Object.entries(step.details.output).map(([key, value]) => (
                      <span key={key} className="soma-steps__output-item">
                        {key}: <strong>{String(value)}</strong>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {step.details.metadata && (
                <details className="soma-steps__step-metadata">
                  <summary className="soma-steps__step-metadata-toggle">
                    Technical Details
                  </summary>
                  <pre className="soma-steps__step-metadata-content">
                    {JSON.stringify(step.details.metadata, null, 2)}
                  </pre>
                </details>
              )}
            </div>

            {/* Timeline connector (except for last step) */}
            {index < enhancedTrace.executionSteps.length - 1 && (
              <div className="soma-steps__connector" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ExecutionDetail({ trace, loading }: { trace: FullTrace | null; loading: boolean }) {
  const [tab, setTab] = useState<Tab>('flame');
  const enhancedSOMATrace = useEnhancedSOMATrace(trace);

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
    <div className="exec-detail">
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
        {tab === 'decisions' && <DecisionReplay filename={trace.filename} />}
      </div>
    </div>
  );
}

// Inline summary (simple)
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
