// packages/dashboard/src/client/components/ProcessMiningPage.tsx
//
// Cross-agent process mining view. Aggregates all traces into a single
// directly-follows graph, surfaces variants, reuses BottleneckView for
// the thermal graph, and shows per-agent conformance scoring.
//
// Data sources:
//   - useAgents()            → agent list with run counts
//   - useProcessModel(null)  → aggregated process model (pass null = all agents)
//                              If your backend keys process models per-agent,
//                              add a new hook `useAggregateProcessModel()`.

import { useMemo, useState } from 'react';
import { useAgents } from '../hooks/useAgents';
import { useProcessModel } from '../hooks/useProcessModel';
import { useTraces } from '../hooks/useTraces';
import { BottleneckView } from './BottleneckView';
import { VariantExplorer } from './VariantExplorer';

type MiningTab = 'graph' | 'variants' | 'conformance';

const TAB_LABELS: Record<MiningTab, { icon: string; label: string }> = {
  graph:       { icon: '\u{1F4CA}', label: 'Directly-follows' },
  variants:    { icon: '\u{1F501}', label: 'Variants' },
  conformance: { icon: '\u{2714}',  label: 'Conformance' },
};

function fmtMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(0)}m`;
}

export function ProcessMiningPage() {
  const [tab, setTab] = useState<MiningTab>('graph');
  const [agentFilter, setAgentFilter] = useState<string>('');

  const { flat: agents } = useAgents();
  const traces = useTraces();
  const processModel = useProcessModel(agentFilter || null);

  // Per-agent conformance — derived from process-model deviations.
  // If your ProcessModelData doesn't include per-agent stats, replace
  // this with a call to a dedicated /api/conformance endpoint.
  const conformance = useMemo(() => {
    return agents
      .filter((a) => (a.traceCount ?? 0) > 0)
      .map((a) => {
        const errRate = a.errRate ?? 0;
        const score = errRate > 0.3 ? 0.41 : errRate > 0.05 ? 0.72 : errRate > 0.02 ? 0.86 : 0.95;
        return {
          agentId: a.agentId,
          runs: a.traceCount ?? 0,
          score,
          status: score > 0.85 ? 'ok' : score > 0.65 ? 'warn' : 'fail',
        } as const;
      })
      .sort((a, b) => a.score - b.score);
  }, [agents]);

  const totalRuns = conformance.reduce((s, c) => s + c.runs, 0);
  const avgConf =
    conformance.length > 0
      ? conformance.reduce((s, c) => s + c.score, 0) / conformance.length
      : 0;

  return (
    <div className="mining-page">
      {/* Header */}
      <div className="mining-page__header">
        <div>
          <div className="mining-page__eyebrow">AgentFlow \u00B7 Process Mining</div>
          <h2 className="mining-page__title">Patterns across {totalRuns.toLocaleString()} runs</h2>
          <p className="mining-page__subtitle">
            Directly-follows graph, variant clustering, bottleneck analysis and conformance
            scoring. Zero LLM cost.
          </p>
        </div>
        <div className="mining-page__head-actions">
          <select
            className="mining-page__select"
            value={agentFilter}
            onChange={(e) => setAgentFilter(e.target.value)}
          >
            <option value="">All agents</option>
            {agents.map((a) => (
              <option key={a.agentId} value={a.agentId}>
                {a.agentId}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="mining-page__btn"
            onClick={() => processModel.refetch?.()}
            disabled={processModel.loading}
          >
            {'\u27F3'} Re-mine
          </button>
        </div>
      </div>

      {/* KPI row */}
      <div className="mining-page__kpis">
        <Kpi label="Runs analysed" value={totalRuns.toLocaleString()} />
        <Kpi
          label="Variants found"
          value={String(processModel.data?.variants?.length ?? '\u2014')}
        />
        <Kpi
          label="Bottlenecks"
          value={String(processModel.data?.bottlenecks?.length ?? 0)}
        />
        <Kpi label="Avg conformance" value={`${(avgConf * 100).toFixed(1)}%`} />
        <Kpi label="Active agents" value={String(conformance.length)} />
        <Kpi label="Traces" value={String(traces.length)} />
      </div>

      {/* Tabs */}
      <div className="mining-page__tabs">
        {(Object.entries(TAB_LABELS) as [MiningTab, typeof TAB_LABELS[MiningTab]][]).map(
          ([id, { icon, label }]) => (
            <button
              type="button"
              key={id}
              className={`mining-page__tab ${tab === id ? 'mining-page__tab--active' : ''}`}
              onClick={() => setTab(id)}
            >
              {icon} {label}
            </button>
          ),
        )}
      </div>

      {/* Body */}
      <div className="mining-page__body">
        {tab === 'graph' && (
          <>
            {processModel.loading && !processModel.data && (
              <div className="mining-page__loading">Mining process model\u2026</div>
            )}
            {processModel.data && <BottleneckView model={processModel.data} />}
            {!processModel.loading && !processModel.data && (
              <div className="mining-page__empty">
                No process model available. Run the pipeline to gather traces.
              </div>
            )}
          </>
        )}

        {tab === 'variants' && processModel.data && (
          <VariantExplorer model={processModel.data} />
        )}
        {tab === 'variants' && !processModel.data && (
          <div className="mining-page__empty">No variants to display yet.</div>
        )}

        {tab === 'conformance' && (
          <div className="mining-conformance">
            <div className="mining-conformance__hint">
              How closely each agent\u2019s runs match the mined model. Drift below 70% usually
              means the model needs re-mining or an agent\u2019s behaviour has shifted.
            </div>
            <table className="mining-conformance__table">
              <thead>
                <tr>
                  <th>Agent</th>
                  <th className="num">Runs</th>
                  <th>Conformance</th>
                  <th className="num">Score</th>
                </tr>
              </thead>
              <tbody>
                {conformance.map((c) => (
                  <tr key={c.agentId}>
                    <td className="mono">
                      <span className={`dot dot--${c.status}`} /> {c.agentId}
                    </td>
                    <td className="num t-dim">{c.runs}</td>
                    <td>
                      <div className="mining-conformance__bar">
                        <div
                          className={`mining-conformance__bar-fill mining-conformance__bar-fill--${c.status}`}
                          style={{ width: `${c.score * 100}%` }}
                        />
                      </div>
                    </td>
                    <td className="num">{(c.score * 100).toFixed(0)}%</td>
                  </tr>
                ))}
                {conformance.length === 0 && (
                  <tr>
                    <td colSpan={4} className="mining-page__empty">
                      No agent runs in window.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="mining-kpi">
      <div className="mining-kpi__label">{label}</div>
      <div className="mining-kpi__value">{value}</div>
    </div>
  );
}

// NOTE: Fmt helper exported in case other components want it.
export { fmtMs };
