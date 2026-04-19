import { useEffect, useMemo, useState } from 'react';
import type { AgentStats } from '../hooks/useAgents';
import type { ProcessModelData, ProcessVariant } from '../hooks/useProcessModel';
import { useSomaReport } from '../hooks/useSomaReport';
import type { TraceEntry } from '../hooks/useTraces';
import { AgentHealthBriefing } from './AgentHealthBriefing';
import { BottleneckView } from './BottleneckView';
import { DottedChart } from './DottedChart';
import { ProcessMapView } from './ProcessMapView';
import { SomaIntelligence } from './SomaIntelligence';
import { VariantExplorer } from './VariantExplorer';

type Tab = 'timeline' | 'variants' | 'bottlenecks' | 'graph' | 'intelligence' | 'health';

function fmtDur(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(0)}m`;
}

function fmtAgo(ts: number): string {
  const d = Date.now() - ts;
  if (d < 60000) return 'now';
  if (d < 3600000) return `${Math.floor(d / 60000)}m`;
  if (d < 86400000) return `${Math.floor(d / 3600000)}h`;
  return `${Math.floor(d / 86400000)}d`;
}

interface Props {
  agentId: string;
  agents: AgentStats[];
  traces: TraceEntry[];
  processModel: ProcessModelData | null;
  processModelLoading: boolean;
}

interface TabDef {
  id: Tab;
  label: string;
  shortcut: string;
}

export function AgentProfile({
  agentId,
  agents,
  traces,
  processModel,
  processModelLoading,
}: Props) {
  const agentTraces = traces.filter((t) => t.agentId === agentId);
  const [tab, setTab] = useState<Tab>('timeline');
  const { report: somaReport } = useSomaReport();
  const agent = agents.find((a) => a.agentId === agentId);
  const [modelVariants, setModelVariants] = useState<ProcessVariant[] | undefined>();

  const tabs: TabDef[] = useMemo(
    () => [
      { id: 'timeline', label: 'Timeline', shortcut: '1' },
      { id: 'variants', label: 'Variants', shortcut: '2' },
      { id: 'bottlenecks', label: 'Bottlenecks', shortcut: '3' },
      { id: 'graph', label: 'Graph', shortcut: '4' },
      { id: 'intelligence', label: 'Intelligence', shortcut: '5' },
      { id: 'health', label: 'Health', shortcut: '6' },
    ],
    [],
  );

  useEffect(() => {
    fetch(`/api/agents/${encodeURIComponent(agentId)}/variants?by=model`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.modelVariants?.length > 0) setModelVariants(d.modelVariants);
      })
      .catch(() => {});
  }, [agentId]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const num = Number.parseInt(e.key, 10);
      if (num >= 1 && num <= tabs.length) {
        setTab(tabs[num - 1].id);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [tabs]);

  const displayName = agent?.displayName ?? agentId;
  const latestTrace = agentTraces.sort((a, b) => {
    const aTs = typeof a.timestamp === 'number' ? a.timestamp : 0;
    const bTs = typeof b.timestamp === 'number' ? b.timestamp : 0;
    return bTs - aTs;
  })[0];

  const handleRefresh = () => window.location.reload();
  const handleOpenLatest = () => {
    if (latestTrace) {
      window.location.hash = `#trace/${encodeURIComponent(String(latestTrace.executionId ?? ''))}`;
    }
  };

  return (
    <div className="agent-profile">
      <header className="agent-profile__header">
        <div className="agent-profile__eyebrow">
          <span className="agent-profile__crumb">Agents</span>
          <span className="agent-profile__crumb-sep">{'\u203A'}</span>
          <span className="agent-profile__crumb agent-profile__crumb--current">{agentId}</span>
        </div>
        <div className="agent-profile__title-row">
          <h1 className="agent-profile__title">{displayName}</h1>
          <div className="agent-profile__actions">
            {latestTrace && (
              <button
                type="button"
                className="btn btn--secondary"
                onClick={handleOpenLatest}
                title="Open latest trace"
              >
                Open latest trace
              </button>
            )}
            <button
              type="button"
              className="btn btn--secondary"
              onClick={handleRefresh}
              title="Refresh data"
            >
              {'\u21BB'}
            </button>
          </div>
        </div>
        <p className="agent-profile__subtitle">
          Process mining · execution analysis · SOMA intelligence · zero LLM cost
        </p>
      </header>

      <div className="kpi-row">
        <div className="kpi">
          <div className="kpi__label">EXECUTIONS</div>
          <div className="kpi__value">{agent?.totalExecutions ?? 0}</div>
        </div>
        <div className="kpi">
          <div className="kpi__label">FAILED</div>
          <div
            className={`kpi__value ${(agent?.failedExecutions ?? 0) > 0 ? 'kpi__value--fail' : ''}`}
          >
            {agent?.failedExecutions ?? 0}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi__label">SUCCESS RATE</div>
          <div
            className={`kpi__value ${(agent?.successRate ?? 100) < 95 ? 'kpi__value--warn' : ''}`}
          >
            {agent?.successRate.toFixed(1) ?? '0.0'}
            <span className="kpi__unit">%</span>
          </div>
        </div>
        <div className="kpi">
          <div className="kpi__label">AVG TIME</div>
          <div className="kpi__value">{fmtDur(agent?.avgExecutionTime ?? 0)}</div>
        </div>
        <div className="kpi">
          <div className="kpi__label">LAST SEEN</div>
          <div className="kpi__value">{agent ? fmtAgo(agent.lastExecution) : '—'}</div>
        </div>
        <div className="kpi">
          <div className="kpi__label">SOURCES</div>
          <div className="kpi__value">{agent?.sources?.length ?? 1}</div>
        </div>
      </div>

      <div className="tabs" role="tablist">
        {tabs.map((t) => (
          <button
            type="button"
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`tabs__item ${tab === t.id ? 'tabs__item--active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            <span className="tabs__label">{t.label}</span>
            <kbd className="tabs__shortcut">{t.shortcut}</kbd>
          </button>
        ))}
      </div>

      <div className="agent-profile__content">
        {processModelLoading && <div className="loading-state">Mining process model{'\u2026'}</div>}
        {!processModelLoading && !processModel && tab !== 'graph' && tab !== 'health' && (
          <div className="empty-state">
            <p>No process model available.</p>
            <p>
              Run {'\u0060'}soma ingest{'\u0060'} to populate traces.
            </p>
          </div>
        )}
        {!processModelLoading && processModel && tab === 'timeline' && (
          <ProcessMapView model={processModel} />
        )}
        {!processModelLoading && processModel && tab === 'variants' && (
          <VariantExplorer
            variants={processModel.variants}
            modelVariants={modelVariants}
            isPro={!!somaReport}
          />
        )}
        {!processModelLoading && processModel && tab === 'bottlenecks' && (
          <BottleneckView model={processModel} />
        )}
        {tab === 'graph' && <DottedChart traces={agentTraces} />}
        {tab === 'intelligence' && <SomaIntelligence report={somaReport} agentId={agentId} />}
        {tab === 'health' && <AgentHealthBriefing agentId={agentId} />}
      </div>
    </div>
  );
}
