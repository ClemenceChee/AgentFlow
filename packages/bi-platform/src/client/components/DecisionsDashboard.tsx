import React, { useState } from 'react';
import type { RecommendationsResponse, Recommendation } from '../hooks/useDecisionRecommendations';
import type { PatternsResponse, BusinessPattern } from '../hooks/useDecisionPatterns';
import type { DelegationRoiResponse } from '../hooks/useDecisionRoi';
import type { ComplianceRisksResponse, ComplianceRisk } from '../hooks/useComplianceRisks';
import type { DecisionAlertsResponse } from '../hooks/useDecisionAlerts';

interface Props {
  recommendations: RecommendationsResponse | null;
  patterns: PatternsResponse | null;
  roi: DelegationRoiResponse | null;
  complianceRisks: ComplianceRisksResponse | null;
  alerts: DecisionAlertsResponse | null;
}

type Tab = 'recommendations' | 'patterns' | 'roi' | 'risks';

const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };

export function DecisionsDashboard({ recommendations, patterns, roi, complianceRisks, alerts }: Props) {
  const [tab, setTab] = useState<Tab>('recommendations');
  const [expandedRec, setExpandedRec] = useState<string | null>(null);

  const criticalAlerts = (alerts?.alerts ?? []).filter((a) => !a.acknowledged);

  return (
    <div>
      {/* Critical alerts banner */}
      {criticalAlerts.length > 0 && (
        <div className="bi-alerts" style={{ marginBottom: 'var(--s4)' }}>
          {criticalAlerts.slice(0, 4).map((a) => (
            <div key={a.id} className="bi-alert">
              <span className={`bi-alert__sev bi-alert__sev--${a.severity}`}>{a.severity}</span>
              <span>{a.title}</span>
              <span style={{ color: 'var(--t3)', fontSize: 'var(--xs)' }}>{a.suggestedAction}</span>
            </div>
          ))}
        </div>
      )}

      {/* Sub-tabs */}
      <div className="bi-tabs">
        <button className={`bi-tab${tab === 'recommendations' ? ' bi-tab--active' : ''}`} onClick={() => setTab('recommendations')}>
          Recommendations ({recommendations?.recommendations.length ?? 0})
        </button>
        <button className={`bi-tab${tab === 'patterns' ? ' bi-tab--active' : ''}`} onClick={() => setTab('patterns')}>
          Patterns ({patterns?.patterns.length ?? 0})
        </button>
        <button className={`bi-tab${tab === 'roi' ? ' bi-tab--active' : ''}`} onClick={() => setTab('roi')}>
          Delegation ROI
        </button>
        <button className={`bi-tab${tab === 'risks' ? ' bi-tab--active' : ''}`} onClick={() => setTab('risks')}>
          Compliance Risks ({complianceRisks?.risks.length ?? 0})
        </button>
      </div>

      {/* Recommendations */}
      {tab === 'recommendations' && (
        <RecommendationsView
          recs={recommendations?.recommendations ?? []}
          expanded={expandedRec}
          onToggle={(id) => setExpandedRec(expandedRec === id ? null : id)}
        />
      )}

      {/* Patterns */}
      {tab === 'patterns' && <PatternsView patterns={patterns?.patterns ?? []} />}

      {/* ROI */}
      {tab === 'roi' && <RoiView roi={roi} />}

      {/* Compliance Risks */}
      {tab === 'risks' && <ComplianceRisksView risks={complianceRisks?.risks ?? []} />}
    </div>
  );
}

// --- Recommendations ---

function RecommendationsView({ recs, expanded, onToggle }: { recs: Recommendation[]; expanded: string | null; onToggle: (id: string) => void }) {
  if (recs.length === 0) {
    return <div className="bi-empty"><div className="bi-empty__icon">--</div><span>No recommendations — all agents operating within thresholds</span></div>;
  }

  const sorted = [...recs].sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s3)' }}>
      {sorted.map((rec) => (
        <div key={rec.id} className="bi-card" style={{ cursor: 'pointer' }} onClick={() => onToggle(rec.id)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s3)', marginBottom: 'var(--s2)' }}>
            <span className={`badge badge--${sevBadge(rec.priority)}`}>{rec.priority}</span>
            <span className="badge badge--neutral">{rec.type}</span>
            <span style={{ flex: 1, fontWeight: 600 }}>{rec.title}</span>
            <span style={{ fontSize: 'var(--xs)', color: 'var(--t3)' }}>
              {(rec.confidence * 100).toFixed(0)}% confidence
            </span>
          </div>
          <p style={{ fontSize: 'var(--sm)', color: 'var(--t2)', margin: 0 }}>{rec.description}</p>

          {expanded === rec.id && (
            <div style={{ marginTop: 'var(--s3)', borderTop: '1px solid var(--bdm)', paddingTop: 'var(--s3)' }}>
              {/* Evidence */}
              {rec.evidence.length > 0 && (
                <div style={{ marginBottom: 'var(--s3)' }}>
                  <div style={{ fontSize: 'var(--xs)', color: 'var(--t3)', marginBottom: 'var(--s1)' }}>Evidence</div>
                  {rec.evidence.map((e, i) => (
                    <div key={i} style={{ fontSize: 'var(--sm)', display: 'flex', gap: 'var(--s2)', color: 'var(--t2)' }}>
                      <span className="badge badge--neutral" style={{ fontSize: 'var(--xs)' }}>{e.source}</span>
                      <span>{e.context}: <strong style={{ fontFamily: 'var(--fm)' }}>{e.value}</strong></span>
                    </div>
                  ))}
                </div>
              )}

              {/* Impact */}
              <div style={{ marginBottom: 'var(--s3)' }}>
                <div style={{ fontSize: 'var(--xs)', color: 'var(--t3)', marginBottom: 'var(--s1)' }}>Impact</div>
                <div style={{ display: 'flex', gap: 'var(--s4)', fontSize: 'var(--sm)' }}>
                  <span>Value: <strong style={{ fontFamily: 'var(--fm)' }}>${rec.impact.estimatedValue.toFixed(2)}</strong></span>
                  <span>Timeframe: {rec.impact.timeframe}</span>
                  <span>Risk: <span className={`badge badge--${rec.impact.riskLevel === 'high' ? 'fail' : rec.impact.riskLevel === 'medium' ? 'warn' : 'ok'}`}>{rec.impact.riskLevel}</span></span>
                  <span>Effort: <span className="badge badge--neutral">{rec.impact.effort}</span></span>
                </div>
              </div>

              {/* Action Items */}
              {rec.actionItems.length > 0 && (
                <div>
                  <div style={{ fontSize: 'var(--xs)', color: 'var(--t3)', marginBottom: 'var(--s1)' }}>Action Items</div>
                  <ul style={{ margin: 0, paddingLeft: 'var(--s4)', fontSize: 'var(--sm)', color: 'var(--t2)' }}>
                    {rec.actionItems.map((item, i) => <li key={i} style={{ marginBottom: 2 }}>{item}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// --- Patterns ---

function PatternsView({ patterns }: { patterns: BusinessPattern[] }) {
  if (patterns.length === 0) {
    return <div className="bi-empty"><div className="bi-empty__icon">--</div><span>No cross-agent patterns detected</span></div>;
  }

  return (
    <div className="bi-grid--2 bi-grid">
      {patterns.map((p) => (
        <div key={p.id} className="bi-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s2)', marginBottom: 'var(--s2)' }}>
            <span className={`badge badge--${sevBadge(p.businessImpact.severity)}`}>{p.businessImpact.severity}</span>
            <span className="badge badge--neutral">{fmtPatternType(p.type)}</span>
          </div>
          <div style={{ fontWeight: 600, marginBottom: 'var(--s1)' }}>{p.title}</div>
          <p style={{ fontSize: 'var(--sm)', color: 'var(--t2)', margin: '0 0 var(--s2)' }}>{p.description}</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--s1)', marginBottom: 'var(--s2)' }}>
            {p.affectedAgents.map((a) => (
              <span key={a} className="badge badge--neutral" style={{ fontSize: 'var(--xs)' }}>{a}</span>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 'var(--s3)', fontSize: 'var(--xs)', color: 'var(--t3)' }}>
            {p.businessImpact.estimatedCostImpact > 0 && (
              <span>Est. cost: <strong style={{ fontFamily: 'var(--fm)' }}>${p.businessImpact.estimatedCostImpact.toFixed(2)}</strong></span>
            )}
            <span>Confidence: {(p.confidence * 100).toFixed(0)}%</span>
            <span>{p.businessImpact.riskCategory}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// --- ROI ---

function RoiView({ roi }: { roi: DelegationRoiResponse | null }) {
  if (!roi) return <div className="bi-loading">Loading ROI analysis...</div>;

  const a = roi.analysis;
  const roiColor = a.roiMultiplier >= 2 ? 'var(--ok)' : a.roiMultiplier >= 1 ? 'var(--warn)' : 'var(--fail)';

  return (
    <div>
      {/* Summary metrics */}
      <div className="bi-grid--4 bi-grid" style={{ marginBottom: 'var(--s4)' }}>
        <MetricBox label="ROI Multiplier" value={`${a.roiMultiplier.toFixed(1)}x`} color={roiColor} />
        <MetricBox label="Total Delegations" value={a.totalDelegations.toLocaleString()} />
        <MetricBox label="Success Rate" value={`${(a.delegationSuccessRate * 100).toFixed(1)}%`} color={a.delegationSuccessRate >= 0.8 ? 'var(--ok)' : 'var(--warn)'} />
        <MetricBox label="Time Saved" value={`${a.estimatedTimeSavedHours.toFixed(0)}h`} />
      </div>
      <div className="bi-grid--2 bi-grid" style={{ marginBottom: 'var(--s4)' }}>
        <MetricBox label="Cost per Delegation" value={`$${a.costPerDelegation.toFixed(4)}`} />
        <MetricBox label="Period" value={a.period.replace(/_/g, ' ')} />
      </div>

      {/* Top agents */}
      {a.topPerformingAgents.length > 0 && (
        <div className="bi-card" style={{ marginBottom: 'var(--s4)' }}>
          <div className="bi-card__header">
            <span className="bi-card__title">Top Performing Agents</span>
          </div>
          <table className="bi-table">
            <thead>
              <tr><th>Agent</th><th>Delegations</th><th>Success Rate</th><th>Cost Efficiency</th></tr>
            </thead>
            <tbody>
              {a.topPerformingAgents.map((agent) => (
                <tr key={agent.agentId}>
                  <td style={{ fontWeight: 500 }}>{agent.agentName}</td>
                  <td style={{ fontFamily: 'var(--fm)' }}>{agent.delegations}</td>
                  <td style={{ fontFamily: 'var(--fm)', color: agent.successRate >= 0.9 ? 'var(--ok)' : 'var(--warn)' }}>
                    {(agent.successRate * 100).toFixed(1)}%
                  </td>
                  <td style={{ fontFamily: 'var(--fm)' }}>${agent.costEfficiency.toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Recommendations */}
      {a.recommendations.length > 0 && (
        <div className="bi-card">
          <div className="bi-card__header">
            <span className="bi-card__title">Optimization Recommendations</span>
          </div>
          <ul style={{ margin: 0, paddingLeft: 'var(--s4)', fontSize: 'var(--sm)', color: 'var(--t2)' }}>
            {a.recommendations.map((r, i) => <li key={i} style={{ marginBottom: 'var(--s1)' }}>{r}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

// --- Compliance Risks ---

function ComplianceRisksView({ risks }: { risks: ComplianceRisk[] }) {
  if (risks.length === 0) {
    return <div className="bi-empty"><div className="bi-empty__icon">--</div><span>No compliance risks detected</span></div>;
  }

  const trendIcon = (d: string) => d === 'improving' ? '\u2191' : d === 'degrading' ? '\u2193' : '\u2192';
  const trendColor = (d: string) => d === 'improving' ? 'var(--ok)' : d === 'degrading' ? 'var(--fail)' : 'var(--t3)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s3)' }}>
      {risks.map((risk) => (
        <div key={risk.id} className="bi-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s3)', marginBottom: 'var(--s2)' }}>
            <span className={`badge badge--${sevBadge(risk.riskLevel)}`}>{risk.riskLevel}</span>
            <span style={{ fontWeight: 600, flex: 1 }}>{risk.regulation}</span>
            <span style={{ fontFamily: 'var(--fm)', fontSize: 'var(--sm)' }}>
              Score: {risk.currentScore.toFixed(0)}
            </span>
            <span style={{ color: trendColor(risk.trendDirection), fontSize: 'var(--sm)' }}>
              {trendIcon(risk.trendDirection)} {risk.trendDirection}
            </span>
          </div>
          <p style={{ fontSize: 'var(--sm)', color: 'var(--t2)', margin: '0 0 var(--s2)' }}>{risk.description}</p>

          {risk.affectedAgents.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--s1)', marginBottom: 'var(--s2)' }}>
              {risk.affectedAgents.map((a) => (
                <span key={a} className="badge badge--neutral" style={{ fontSize: 'var(--xs)' }}>{a}</span>
              ))}
            </div>
          )}

          {risk.requiredActions.length > 0 && (
            <div>
              <div style={{ fontSize: 'var(--xs)', color: 'var(--t3)', marginBottom: 'var(--s1)' }}>Required Actions</div>
              <ol style={{ margin: 0, paddingLeft: 'var(--s4)', fontSize: 'var(--sm)', color: 'var(--t2)' }}>
                {risk.requiredActions.map((action, i) => <li key={i} style={{ marginBottom: 2 }}>{action}</li>)}
              </ol>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// --- Shared helpers ---

function MetricBox({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="bi-kpi">
      <span className="bi-kpi__label">{label}</span>
      <span className="bi-kpi__value" style={{ color: color ?? 'var(--t1)', fontSize: 'var(--xl)' }}>{value}</span>
    </div>
  );
}

function sevBadge(s: string): string {
  if (s === 'critical') return 'fail';
  if (s === 'high') return 'warn';
  if (s === 'medium') return 'info';
  return 'neutral';
}

function fmtPatternType(t: string): string {
  return t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
