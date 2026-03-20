import { useState } from 'react';
import type { FullTrace } from '../hooks/useSelectedTrace';
import { FlameChart } from './FlameChart';
import { AgentFlow } from './AgentFlow';
import { MetricsView } from './MetricsView';
import { DependencyTree } from './DependencyTree';
import { StateMachine } from './StateMachine';
import { TranscriptView } from './TranscriptView';

type Tab = 'flame' | 'flow' | 'metrics' | 'deps' | 'state' | 'summary' | 'transcript';

function fmtDur(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

export function ExecutionDetail({ trace, loading }: { trace: FullTrace | null; loading: boolean }) {
  const [tab, setTab] = useState<Tab>('flame');

  if (loading) return <div className="workspace__empty">Loading...</div>;
  if (!trace) return <div className="workspace__empty">Select an execution</div>;

  const nodes = Object.values(trace.nodes);
  const failCount = nodes.filter((n) => n.status === 'failed').length;
  const duration = trace.endTime - trace.startTime;

  const tabs: { id: Tab; label: string }[] = [
    { id: 'flame', label: 'Flame Chart' },
    { id: 'flow', label: 'Agent Flow' },
    { id: 'metrics', label: 'Metrics' },
    { id: 'deps', label: 'Dependencies' },
    { id: 'state', label: 'State Machine' },
    { id: 'summary', label: 'Summary' },
    { id: 'transcript', label: 'Transcript' },
  ];

  return (
    <div className="exec-detail">
      <div className="ed-header">
        <span className={`dot ${trace.status === 'failed' ? 'dot--fail' : 'dot--ok'}`} />
        <span className="ed-header__agent">{trace.agentId}</span>
        <span className="ed-header__meta">
          {nodes.length}n &middot; {fmtDur(duration)} &middot; {trace.status}
          {failCount > 0 && <span style={{ color: 'var(--color-critical)' }}> &middot; {failCount} failed</span>}
        </span>
        <span className="ed-header__ts">
          {new Date(trace.startTime).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </span>
        {trace.trigger && <span className="ed-tag">{trace.trigger}</span>}
      </div>

      <div className="ed-tabs">
        {tabs.map((t) => (
          <button key={t.id} className={`ed-tab ${tab === t.id ? 'ed-tab--active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="ed-content">
        {tab === 'flame' && <FlameChart trace={trace} />}
        {tab === 'flow' && <AgentFlow trace={trace} />}
        {tab === 'metrics' && <MetricsView trace={trace} />}
        {tab === 'deps' && <DependencyTree trace={trace} />}
        {tab === 'state' && <StateMachine trace={trace} />}
        {tab === 'summary' && <SummaryContent trace={trace} />}
        {tab === 'transcript' && <TranscriptView trace={trace} />}
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
  const successRate = nodes.length > 0 ? (completed / nodes.length * 100).toFixed(1) : '0';

  return (
    <div className="summary-content">
      <div className="sc-grid">
        <div><span className="sc-label">Agent</span> {trace.agentId}</div>
        <div><span className="sc-label">Trigger</span> {trace.trigger}</div>
        <div><span className="sc-label">Status</span> <span className={trace.status === 'failed' ? 'c-fail' : 'c-ok'}>{trace.status}</span></div>
        <div><span className="sc-label">Duration</span> {fmtDur(duration)}</div>
        <div><span className="sc-label">Nodes</span> {nodes.length} ({completed} ok, {failed} fail)</div>
        <div><span className="sc-label">Success</span> {successRate}%</div>
        <div><span className="sc-label">Started</span> {new Date(trace.startTime).toLocaleString()}</div>
        {trace.name && <div><span className="sc-label">Name</span> {trace.name}</div>}
      </div>
      {failedNodes.length > 0 && (
        <div className="sc-failures">
          <h4 className="sc-failures__title">{'\u2718'} Failed Nodes</h4>
          {failedNodes.map((n) => (
            <div key={n.id} className="sc-failure">
              <span className="sc-failure__type">{n.type}:</span>
              <strong>{n.name}</strong>
              {(n.metadata?.error ?? n.state?.error) && <span className="sc-failure__err">{String(n.metadata?.error ?? n.state?.error)}</span>}
            </div>
          ))}
        </div>
      )}
      <div className="sc-types">
        <h4 className="sc-types__title">Node Types</h4>
        <div className="sc-types__list">
          {[...types.entries()].sort((a, b) => b[1] - a[1]).map(([t, c]) => (
            <span key={t} className="sc-type-badge">{t}: {c}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
