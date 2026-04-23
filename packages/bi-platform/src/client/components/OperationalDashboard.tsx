import React, { useState } from 'react';
import type { AgentsResponse } from '../hooks/useAgents';
import type { CostsResponse } from '../hooks/useCosts';
import type { AnomaliesResponse } from '../hooks/useAnomalies';
import type { FreshnessResponse } from '../hooks/useFreshness';
import type { TokenEconomicsResponse } from '../hooks/useTokenEconomics';
import type { CronHealthResponse } from '../hooks/useCronHealth';
import { AnomalyList } from './AnomalyList';
import { AgentDrillDown } from './AgentDrillDown';
import { CostChart } from './charts/CostChart';
import { CronHealthTable } from './CronHealthTable';

interface Props {
  agents: AgentsResponse | null;
  costs: CostsResponse | null;
  anomalies: AnomaliesResponse | null;
  freshness: FreshnessResponse | null;
  tokenEconomics: TokenEconomicsResponse | null;
  cronHealth: CronHealthResponse | null;
}

type Tab = 'agents' | 'costs' | 'tokens' | 'cron' | 'anomalies';

export function OperationalDashboard({ agents, costs, anomalies, freshness, tokenEconomics, cronHealth }: Props) {
  const [tab, setTab] = useState<Tab>('agents');
  const [drillAgent, setDrillAgent] = useState<string | null>(null);

  return (
    <div>
      {/* Data freshness bar */}
      {freshness && (
        <section className="bi-section">
          <div className="bi-freshness">
            {freshness.sources.map((s) => (
              <div key={s.source} className="bi-freshness__source">
                <span className={`dot dot--${freshnessColor(s.status)}`} />
                <strong>{s.source}</strong>
                <span style={{ color: 'var(--t3)' }}>
                  {s.lastSync ? `${s.ageSeconds}s ago` : 'never synced'}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Tabs */}
      <div className="bi-tabs">
        <button className={`bi-tab${tab === 'agents' ? ' bi-tab--active' : ''}`} onClick={() => setTab('agents')}>
          Agents ({agents?.totalAgents ?? 0})
        </button>
        <button className={`bi-tab${tab === 'costs' ? ' bi-tab--active' : ''}`} onClick={() => setTab('costs')}>
          Cost Analysis
        </button>
        <button className={`bi-tab${tab === 'tokens' ? ' bi-tab--active' : ''}`} onClick={() => setTab('tokens')}>
          Token Economics
        </button>
        <button className={`bi-tab${tab === 'cron' ? ' bi-tab--active' : ''}`} onClick={() => setTab('cron')}>
          Cron Health ({cronHealth?.totalJobs ?? 0})
        </button>
        <button className={`bi-tab${tab === 'anomalies' ? ' bi-tab--active' : ''}`} onClick={() => setTab('anomalies')}>
          Anomalies ({anomalies?.count ?? 0})
        </button>
      </div>

      {/* Agent Table */}
      {tab === 'agents' && (
        <div className="bi-card bi-card--flush">
          {!agents ? (
            <div className="bi-loading">Loading agents...</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="bi-table">
                <thead>
                  <tr>
                    <th>Agent</th>
                    <th>Source</th>
                    <th>Status</th>
                    <th>Executions</th>
                    <th>Success Rate</th>
                    <th>Avg Response</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {agents.agents.map((a) => (
                    <tr key={a.agentId}>
                      <td>
                        <div className="bi-agent-status">
                          <span className={`dot dot--${statusDot(a.status)}`} />
                          {a.agentName}
                        </div>
                      </td>
                      <td><span className="badge badge--neutral">{(a as any).source ?? 'unknown'}</span></td>
                      <td><span className={`badge badge--${statusBadge(a.status)}`}>{a.status}</span></td>
                      <td style={{ fontFamily: 'var(--fm)' }}>{a.totalExecutions.toLocaleString()}</td>
                      <td>
                        <span style={{ fontFamily: 'var(--fm)', color: a.successRate >= 95 ? 'var(--ok)' : a.successRate >= 80 ? 'var(--warn)' : 'var(--fail)' }}>
                          {a.successRate.toFixed(1)}%
                        </span>
                      </td>
                      <td style={{ fontFamily: 'var(--fm)' }}>{fmtDuration(a.avgResponseTimeMs)}</td>
                      <td>
                        <button className="bi-btn bi-btn--sm" onClick={() => setDrillAgent(a.agentId === drillAgent ? null : a.agentId)}>
                          Details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Cost Chart */}
      {tab === 'costs' && (
        <div className="bi-card">
          <CostChart costs={costs} agents={agents} />
        </div>
      )}

      {/* Token Economics */}
      {tab === 'tokens' && tokenEconomics && (
        <div className="bi-card">
          <div className="bi-card__header">
            <span className="bi-card__title">Per-Agent Token Spend</span>
            <span style={{ fontFamily: 'var(--fm)', fontSize: 'var(--sm)' }}>
              Total: ${tokenEconomics.totalSpend.toFixed(2)}
            </span>
          </div>
          {tokenEconomics.perAgent.length === 0 ? (
            <div className="bi-empty"><span>No token data available</span></div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="bi-table">
                <thead><tr><th>Agent</th><th>Cost</th><th>Tokens</th><th>Cost/Success</th></tr></thead>
                <tbody>
                  {tokenEconomics.perAgent.map((a) => (
                    <tr key={a.agentId}>
                      <td>{a.agentId}</td>
                      <td style={{ fontFamily: 'var(--fm)' }}>${a.cost.toFixed(4)}</td>
                      <td style={{ fontFamily: 'var(--fm)' }}>{(a.tokens / 1000).toFixed(1)}K</td>
                      <td style={{ fontFamily: 'var(--fm)' }}>${a.costPerSuccess.toFixed(4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {tokenEconomics.perModel.length > 0 && (
            <div style={{ marginTop: 'var(--s4)', borderTop: '1px solid var(--bdm)', paddingTop: 'var(--s3)' }}>
              <div style={{ fontSize: 'var(--xs)', color: 'var(--t3)', marginBottom: 'var(--s2)' }}>Model Cost Comparison</div>
              <table className="bi-table">
                <thead><tr><th>Model</th><th>Cost</th><th>Tokens</th><th>$/Token</th></tr></thead>
                <tbody>
                  {tokenEconomics.perModel.map((m) => (
                    <tr key={m.model}>
                      <td>{m.model}</td>
                      <td style={{ fontFamily: 'var(--fm)' }}>${m.cost.toFixed(4)}</td>
                      <td style={{ fontFamily: 'var(--fm)' }}>{(m.tokens / 1000).toFixed(1)}K</td>
                      <td style={{ fontFamily: 'var(--fm)' }}>${(m.costPerToken * 1000).toFixed(4)}/1K</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {tokenEconomics.wastedWarning && (
            <div className="badge badge--warn" style={{ marginTop: 'var(--s3)' }}>
              Wasted spend: ${tokenEconomics.wastedSpend.toFixed(2)} ({tokenEconomics.wastedPct.toFixed(0)}% of total)
            </div>
          )}
        </div>
      )}

      {/* Cron Health */}
      {tab === 'cron' && (
        <div className="bi-card">
          <CronHealthTable cron={cronHealth} />
        </div>
      )}

      {/* Anomalies */}
      {tab === 'anomalies' && (
        <div className="bi-card">
          <AnomalyList anomalies={anomalies?.anomalies ?? []} />
        </div>
      )}

      {drillAgent && <AgentDrillDown agentId={drillAgent} onClose={() => setDrillAgent(null)} />}
    </div>
  );
}

function statusDot(s: string): string {
  if (s === 'healthy') return 'ok';
  if (s === 'warning') return 'warn';
  return 'fail';
}

function statusBadge(s: string): string {
  if (s === 'healthy') return 'ok';
  if (s === 'warning') return 'warn';
  return 'fail';
}

function freshnessColor(s: string): string {
  if (s === 'fresh') return 'ok';
  if (s === 'acceptable') return 'warn';
  return 'fail';
}

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}
