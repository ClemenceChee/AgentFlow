import { useState } from 'react';
import type { AgentStats } from '../hooks/useAgents';
import type { ProcessModelData } from '../hooks/useProcessModel';
import { useSomaReport } from '../hooks/useSomaReport';
import { BottleneckView } from './BottleneckView';
import { DottedChart } from './DottedChart';
import { ProcessMapView } from './ProcessMapView';
import { SomaIntelligence } from './SomaIntelligence';
import { VariantExplorer } from './VariantExplorer';
import type { TraceEntry } from '../hooks/useTraces';

type Tab = 'process-map' | 'variants' | 'bottlenecks' | 'dotted' | 'intelligence';

function fmtDur(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(0)}m`;
}

interface Props {
  agentId: string;
  agents: AgentStats[];
  traces: TraceEntry[];
  processModel: ProcessModelData | null;
  processModelLoading: boolean;
}

export function AgentProfile({ agentId, agents, traces, processModel, processModelLoading }: Props) {
  const agentTraces = traces.filter((t) => t.agentId === agentId);
  const [tab, setTab] = useState<Tab>('process-map');
  const { report: somaReport } = useSomaReport();
  const agent = agents.find((a) => a.agentId === agentId);

  return (
    <div className="agent-profile">
      {/* Stats bar */}
      <div className="ap-stats">
        <div className="ap-stat"><span className="ap-stat__v">{agent?.totalExecutions ?? '?'}</span><span className="ap-stat__l">Executions</span></div>
        <div className="ap-stat"><span className="ap-stat__v" style={{ color: (agent?.failedExecutions ?? 0) > 0 ? 'var(--color-critical)' : 'var(--color-ok)' }}>{agent?.failedExecutions ?? 0}</span><span className="ap-stat__l">Failed</span></div>
        <div className="ap-stat"><span className="ap-stat__v">{agent?.successRate.toFixed(1) ?? '?'}%</span><span className="ap-stat__l">Success</span></div>
        <div className="ap-stat"><span className="ap-stat__v">{fmtDur(agent?.avgExecutionTime ?? 0)}</span><span className="ap-stat__l">Avg Time</span></div>
        {agent?.triggers && Object.entries(agent.triggers).map(([t, c]) => (
          <div key={t} className="ap-stat"><span className="ap-stat__v">{c}</span><span className="ap-stat__l">{t}</span></div>
        ))}
      </div>

      {/* Tabs */}
      <div className="ap-tabs">
        {[
          { id: 'process-map' as const, label: 'Process Map' },
          { id: 'variants' as const, label: 'Variants' },
          { id: 'bottlenecks' as const, label: 'Bottlenecks' },
          { id: 'dotted' as const, label: 'Dotted Chart' },
          { id: 'intelligence' as const, label: '\u{1F9E0} Intelligence' },
        ].map((t) => (
          <button key={t.id} className={`ap-tab ${tab === t.id ? 'ap-tab--active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="ap-content">
        {processModelLoading && <div className="workspace__empty">Computing process model...</div>}
        {!processModelLoading && !processModel && <div className="workspace__empty">No process model available. The API endpoint may not be implemented yet.</div>}
        {!processModelLoading && processModel && tab === 'process-map' && (
          <ProcessMapView model={processModel} />
        )}
        {!processModelLoading && processModel && tab === 'variants' && (
          <VariantExplorer variants={processModel.variants} />
        )}
        {!processModelLoading && processModel && tab === 'bottlenecks' && (
          <BottleneckView model={processModel} />
        )}
        {tab === 'dotted' && (
          <DottedChart traces={agentTraces} />
        )}
        {tab === 'intelligence' && (
          <SomaIntelligence report={somaReport} agentId={agentId} />
        )}
      </div>
    </div>
  );
}
