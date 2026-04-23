import { useState } from 'react';
import type { AgentsResponse } from '../hooks/useAgents';
import type { AnomaliesResponse } from '../hooks/useAnomalies';
import type { CronHealthResponse } from '../hooks/useCronHealth';
import type { FreshnessResponse } from '../hooks/useFreshness';
import type { KnowledgeHealthResponse } from '../hooks/useKnowledgeHealth';
import type { KpisResponse } from '../hooks/useKpis';
import type { RoiResponse } from '../hooks/useRoi';
import type { TokenEconomicsResponse } from '../hooks/useTokenEconomics';
import { AgentDrillDown } from './AgentDrillDown';
import { AnomalyList } from './AnomalyList';
import { AgentOverviewChart } from './charts/AgentOverviewChart';
import { VaultLayerChart } from './charts/VaultLayerChart';
import { KpiCard } from './KpiCard';
import { RoiSummary } from './RoiSummary';

interface Props {
  kpis: KpisResponse | null;
  agents: AgentsResponse | null;
  anomalies: AnomaliesResponse | null;
  roi: RoiResponse | null;
  freshness: FreshnessResponse | null;
  tokenEconomics: TokenEconomicsResponse | null;
  knowledgeHealth: KnowledgeHealthResponse | null;
  cronHealth: CronHealthResponse | null;
}

export function ExecutiveDashboard({
  kpis,
  agents,
  anomalies,
  roi,
  tokenEconomics,
  knowledgeHealth,
  cronHealth,
}: Props) {
  const [drillKpi, setDrillKpi] = useState<string | null>(null);
  const [drillAgent, setDrillAgent] = useState<string | null>(null);

  if (!kpis && !agents) {
    return <div className="bi-loading">Loading executive dashboard...</div>;
  }

  const metrics = kpis?.kpis ?? [];

  return (
    <div>
      {/* KPI Cards */}
      <section className="bi-section">
        <div className="bi-section__header">
          <div>
            <h2 className="bi-section__title">Key Performance Indicators</h2>
            <p className="bi-section__desc">Real-time organizational intelligence summary</p>
          </div>
        </div>
        <div className="bi-grid--4 bi-grid">
          {metrics.map((m) => (
            <KpiCard
              key={m.name}
              metric={m}
              onClick={() => setDrillKpi(drillKpi === m.name ? null : m.name)}
              active={drillKpi === m.name}
            />
          ))}
          {metrics.length === 0 && (
            <div className="bi-empty">
              <div className="bi-empty__icon">--</div>
              <span>No KPI data available</span>
            </div>
          )}
        </div>
        {drillKpi && (
          <KpiDrillDown name={drillKpi} agents={agents} onClose={() => setDrillKpi(null)} />
        )}
      </section>

      {/* Two-column: Agent Overview + ROI */}
      <div className="bi-grid--2 bi-grid">
        <section className="bi-section">
          <div className="bi-card">
            <div className="bi-card__header">
              <span className="bi-card__title">Agent Performance</span>
              <span className="bi-card__subtitle">{agents?.totalAgents ?? 0} agents</span>
            </div>
            <AgentOverviewChart
              agents={agents}
              onSelect={(id) => setDrillAgent(id === drillAgent ? null : id)}
            />
          </div>
        </section>
        <section className="bi-section">
          <RoiSummary roi={roi} />
        </section>
      </div>

      {drillAgent && <AgentDrillDown agentId={drillAgent} onClose={() => setDrillAgent(null)} />}

      {/* Token Economics + Knowledge Health + Cron Reliability */}
      <div className="bi-grid--3 bi-grid">
        {tokenEconomics && (
          <div className="bi-card">
            <div className="bi-card__header">
              <span className="bi-card__title">Token Spend</span>
              {tokenEconomics.wastedWarning && (
                <span className="badge badge--warn">High waste</span>
              )}
            </div>
            <div
              style={{
                fontSize: 'var(--xxl)',
                fontWeight: 700,
                fontFamily: 'var(--fm)',
                color: 'var(--t1)',
              }}
            >
              ${tokenEconomics.totalSpend.toFixed(2)}
            </div>
            <div style={{ fontSize: 'var(--xs)', color: 'var(--t3)', marginTop: 'var(--s1)' }}>
              Wasted: ${tokenEconomics.wastedSpend.toFixed(2)} (
              {tokenEconomics.wastedPct.toFixed(0)}%)
            </div>
            {tokenEconomics.perModel.length > 0 && (
              <div style={{ marginTop: 'var(--s2)', fontSize: 'var(--xs)', color: 'var(--t2)' }}>
                {tokenEconomics.perModel.slice(0, 3).map((m) => (
                  <div key={m.model} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{m.model.split('/').pop()}</span>
                    <span style={{ fontFamily: 'var(--fm)' }}>${m.cost.toFixed(3)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {knowledgeHealth && (
          <div className="bi-card">
            <div className="bi-card__header">
              <span className="bi-card__title">Knowledge Health</span>
            </div>
            <VaultLayerChart health={knowledgeHealth} />
          </div>
        )}
        {cronHealth && (
          <div className="bi-card">
            <div className="bi-card__header">
              <span className="bi-card__title">Cron Reliability</span>
              <span
                className={`badge badge--${cronHealth.overallSuccessRate >= 0.8 ? 'ok' : cronHealth.overallSuccessRate >= 0.5 ? 'warn' : 'fail'}`}
              >
                {(cronHealth.overallSuccessRate * 100).toFixed(0)}%
              </span>
            </div>
            <div
              style={{
                fontSize: 'var(--xxl)',
                fontWeight: 700,
                fontFamily: 'var(--fm)',
                color: cronHealth.overallSuccessRate >= 0.8 ? 'var(--ok)' : 'var(--warn)',
              }}
            >
              {cronHealth.totalRuns} runs
            </div>
            <div style={{ fontSize: 'var(--xs)', color: 'var(--t3)', marginTop: 'var(--s1)' }}>
              {cronHealth.totalJobs} jobs &middot; {(cronHealth.totalTokens / 1000).toFixed(0)}K
              tokens
            </div>
            {cronHealth.jobs
              .filter((j) => j.lastStatus === 'error')
              .slice(0, 3)
              .map((j) => (
                <div
                  key={j.jobId}
                  className="badge badge--fail"
                  style={{ marginTop: 'var(--s1)', fontSize: 'var(--xs)' }}
                >
                  {j.jobId}: {j.lastError?.slice(0, 40) ?? 'error'}
                </div>
              ))}
          </div>
        )}
      </div>

      {/* Anomalies */}
      {anomalies && anomalies.count > 0 && (
        <section className="bi-section">
          <div className="bi-card">
            <div className="bi-card__header">
              <span className="bi-card__title">Recent Anomalies</span>
              <span className="badge badge--warn">{anomalies.count}</span>
            </div>
            <AnomalyList anomalies={anomalies.anomalies.slice(0, 8)} />
          </div>
        </section>
      )}
    </div>
  );
}

function KpiDrillDown({
  name,
  agents,
  onClose,
}: {
  name: string;
  agents: AgentsResponse | null;
  onClose: () => void;
}) {
  return (
    <div className="bi-drill">
      <button className="bi-drill__close" onClick={onClose}>
        &times; Close
      </button>
      <h3 style={{ marginBottom: 8 }}>{fmtKpiName(name)}</h3>
      {name === 'active_agents' && agents && (
        <table className="bi-table">
          <thead>
            <tr>
              <th>Agent</th>
              <th>Status</th>
              <th>Executions</th>
              <th>Success Rate</th>
            </tr>
          </thead>
          <tbody>
            {agents.agents.map((a) => (
              <tr key={a.agentId}>
                <td>{a.agentName}</td>
                <td>
                  <span className="bi-agent-status">
                    <span className={`dot dot--${statusColor(a.status)}`} />
                    {a.status}
                  </span>
                </td>
                <td>{a.totalExecutions.toLocaleString()}</td>
                <td>{a.successRate.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {name !== 'active_agents' && (
        <p style={{ color: 'var(--t2)', fontSize: 'var(--sm)' }}>
          Detailed trend analysis for {fmtKpiName(name)} — data loaded from historical aggregation.
        </p>
      )}
    </div>
  );
}

function fmtKpiName(name: string): string {
  return name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function statusColor(s: string): string {
  if (s === 'healthy') return 'ok';
  if (s === 'warning') return 'warn';
  return 'fail';
}
