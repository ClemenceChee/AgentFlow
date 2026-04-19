/**
 * AICP Control Plane — unified operational intelligence briefing.
 * Combines preflight authorization, health, decisions, drift,
 * warnings, recommendations, and consultation history for one agent.
 */

import { useEffect, useState } from 'react';
import { useAgentBriefing } from '../hooks/useAgentBriefing';
import { useAgentDrift } from '../hooks/useAgentDrift';
import type { PreflightRecommendation, PreflightWarning } from '../hooks/useAicpPreflight';
import { useAicpPreflight } from '../hooks/useAicpPreflight';
import { IntelligencePanel } from './IntelligencePanel';

interface AgentOption {
  agentId: string;
  displayName: string;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ProceedBadge({ proceed, latencyMs }: { proceed: boolean; latencyMs: number }) {
  return (
    <div className="aicp-proceed">
      <span
        className={`aicp-proceed__badge ${proceed ? 'aicp-proceed__badge--ok' : 'aicp-proceed__badge--blocked'}`}
      >
        {proceed ? '\u2714 PROCEED' : '\u26D4 BLOCKED'}
      </span>
      <span className="aicp-proceed__latency">{latencyMs}ms vault consultation</span>
    </div>
  );
}

function WarningCard({
  warning,
  expanded,
  onToggle,
  agentId,
}: {
  warning: PreflightWarning;
  expanded: boolean;
  onToggle: () => void;
  agentId: string | null;
}) {
  const isL4 = warning.source.includes('L4');
  const isAdvisory = warning.source.includes('L3') || warning.rule === 'max-failure-rate';
  const severity = isL4 ? 'critical' : isAdvisory ? 'advisory' : 'info';
  const drilldownAgent = warning.sourceAgents?.[0] ?? agentId;

  return (
    <div className={`aicp-warning aicp-warning--${severity}`}>
      <div
        className="aicp-warning__header"
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onToggle()}
        style={{ cursor: 'pointer' }}
      >
        <span className="aicp-warning__icon">
          {isL4 ? '\u26D4' : isAdvisory ? '\u26A0' : '\u2139'}
        </span>
        <span className="aicp-warning__rule">{warning.rule}</span>
        <span className="aicp-warning__source">{warning.source}</span>
        <span className="aicp-intelligence__chevron">{expanded ? '\u25BE' : '\u25B8'}</span>
      </div>
      <div className="aicp-warning__message">{warning.message}</div>
      {warning.threshold != null && warning.actual != null && (
        <div className="aicp-warning__bar">
          <div
            className="aicp-warning__bar-fill"
            style={{
              width: `${Math.min(100, (warning.actual / Math.max(0.01, warning.threshold)) * 100)}%`,
            }}
          />
          <span className="aicp-warning__bar-label">
            {(warning.actual * 100).toFixed(1)}% / {(warning.threshold * 100).toFixed(0)}% threshold
          </span>
        </div>
      )}
      {expanded && drilldownAgent && (
        <div className="aicp-intelligence__drilldown">
          <IntelligencePanel agentId={drilldownAgent} />
        </div>
      )}
    </div>
  );
}

function RecommendationCard({
  rec,
  onSelectAgent,
  expanded,
  onToggle,
  agentId,
}: {
  rec: PreflightRecommendation;
  onSelectAgent: (id: string) => void;
  expanded: boolean;
  onToggle: () => void;
  agentId: string | null;
}) {
  const drilldownAgent = rec.sourceAgents.length > 0 ? rec.sourceAgents[0] : agentId;

  return (
    <div className="aicp-rec">
      <div
        className="aicp-rec__insight"
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onToggle()}
        style={{ cursor: 'pointer' }}
      >
        {rec.insight}
        <span className="aicp-intelligence__chevron">{expanded ? '\u25BE' : '\u25B8'}</span>
      </div>
      <div className="aicp-rec__meta">
        {rec.sourceAgents.map((a) => (
          <button
            type="button"
            key={a}
            className="aicp-rec__agent-link"
            onClick={(e) => {
              e.stopPropagation();
              onSelectAgent(a);
            }}
          >
            {a}
          </button>
        ))}
        <span className="aicp-rec__confidence">
          {(rec.confidence * 100).toFixed(0)}% confidence
        </span>
      </div>
      <div className="aicp-rec__confidence-bar">
        <div
          className="aicp-rec__confidence-fill"
          style={{ width: `${Math.round(rec.confidence * 100)}%` }}
        />
      </div>
      {expanded && drilldownAgent && (
        <div className="aicp-intelligence__drilldown">
          <IntelligencePanel agentId={drilldownAgent} />
        </div>
      )}
    </div>
  );
}

function DriftSparkline({ points }: { points: { score: number }[] }) {
  if (points.length < 2) return null;
  const recent = points.slice(-20);
  const max = Math.max(...recent.map((p) => p.score), 1);
  const w = 120;
  const h = 24;
  const path = recent
    .map((p, i) => `${(i / (recent.length - 1)) * w},${h - (p.score / max) * h}`)
    .join(' ');
  return (
    <svg
      className="aicp-sparkline"
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      role="img"
      aria-label="Conformance drift sparkline"
    >
      <title>Conformance drift trend</title>
      <polyline points={path} fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AicpPage() {
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [warningsExpanded, setWarningsExpanded] = useState(false);
  const [expandedWarningIdx, setExpandedWarningIdx] = useState<number | null>(null);
  const [expandedRecIdx, setExpandedRecIdx] = useState<number | null>(null);

  const preflight = useAicpPreflight(selectedAgent);
  const briefing = useAgentBriefing(selectedAgent);
  const drift = useAgentDrift(selectedAgent);

  // Fetch agent list
  useEffect(() => {
    fetch('/api/agents')
      .then((r) => (r.ok ? r.json() : []))
      .then((data: AgentOption[] | { groups?: { agents: AgentOption[] }[] }) => {
        if (Array.isArray(data)) {
          setAgents(data);
        } else if (data.groups) {
          setAgents(data.groups.flatMap((g) => g.agents));
        }
      })
      .catch(() => {});
  }, []);

  // Consultation history from briefing intelligence
  const consultations =
    briefing.data?.intelligence
      .filter((i) => i.type === 'execution' || i.name.includes('aicp'))
      .slice(0, 10) ?? [];

  const aicpConsultations = consultations.filter(
    (i) => i.claim.includes('aicp') || i.name.includes('aicp'),
  );

  const warnings = preflight.data?.warnings ?? [];
  const visibleWarnings = warningsExpanded ? warnings : warnings.slice(0, 5);
  const hiddenCount = warnings.length - 5;

  if (agents.length === 0) {
    return (
      <div className="aicp-page">
        <div className="aicp-empty">
          No agents registered. Run the pipeline to create agent profiles.
        </div>
      </div>
    );
  }

  const successRate = briefing.data ? (1 - briefing.data.failureRate) * 100 : null;
  const driftStatus = drift.data?.drift.status ?? '—';

  return (
    <div className="aicp-page">
      <header className="aicp-page__header">
        <div className="aicp-page__eyebrow">AGENTFLOW · AICP CONTROL PLANE</div>
        <div className="aicp-page__title-row">
          <h1 className="aicp-page__title">Operational briefing</h1>
          <div className="aicp-page__actions">
            <label className="aicp-page__select-label">
              <span className="aicp-page__select-text">Agent</span>
              <select
                className="aicp-page__select"
                value={selectedAgent ?? ''}
                onChange={(e) => {
                  setSelectedAgent(e.target.value || null);
                  setWarningsExpanded(false);
                  setExpandedWarningIdx(null);
                  setExpandedRecIdx(null);
                }}
              >
                <option value="">Select an agent{'\u2026'}</option>
                {agents.map((a) => (
                  <option key={a.agentId} value={a.agentId}>
                    {a.displayName || a.agentId}
                  </option>
                ))}
              </select>
            </label>
            {selectedAgent && (
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => preflight.refetch()}
                disabled={preflight.loading}
                title="Refresh"
              >
                {'\u21BB'}
              </button>
            )}
          </div>
        </div>
        <p className="aicp-page__subtitle">
          Preflight authorization · health monitoring · conformance drift · consultation history ·
          zero LLM cost
        </p>
      </header>

      {selectedAgent && preflight.data?.available && (
        <div className="kpi-row">
          <div className="kpi">
            <div className="kpi__label">AUTHORIZATION</div>
            <div
              className={`kpi__value ${preflight.data.proceed ? 'kpi__value--ok' : 'kpi__value--fail'}`}
            >
              {preflight.data.proceed ? 'PROCEED' : 'BLOCKED'}
            </div>
          </div>
          <div className="kpi">
            <div className="kpi__label">LATENCY</div>
            <div className="kpi__value">
              {preflight.data._meta.durationMs}
              <span className="kpi__unit">ms</span>
            </div>
          </div>
          <div className="kpi">
            <div className="kpi__label">WARNINGS</div>
            <div className={`kpi__value ${warnings.length > 0 ? 'kpi__value--warn' : ''}`}>
              {warnings.length}
            </div>
          </div>
          <div className="kpi">
            <div className="kpi__label">RECOMMENDATIONS</div>
            <div className="kpi__value">{preflight.data.recommendations.length}</div>
          </div>
          <div className="kpi">
            <div className="kpi__label">SUCCESS RATE</div>
            <div
              className={`kpi__value ${successRate != null && successRate < 95 ? 'kpi__value--warn' : ''}`}
            >
              {successRate != null ? successRate.toFixed(1) : '—'}
              {successRate != null && <span className="kpi__unit">%</span>}
            </div>
          </div>
          <div className="kpi">
            <div className="kpi__label">DRIFT</div>
            <div
              className={`kpi__value ${driftStatus === 'degrading' ? 'kpi__value--warn' : driftStatus === 'improving' ? 'kpi__value--ok' : ''}`}
            >
              {driftStatus}
            </div>
          </div>
        </div>
      )}

      {!selectedAgent && (
        <div className="aicp-empty">Select an agent to see its operational briefing.</div>
      )}

      {selectedAgent && preflight.loading && !preflight.data && (
        <div className="aicp-loading">Loading preflight evaluation...</div>
      )}

      {selectedAgent && preflight.error && (
        <div className="aicp-empty">Preflight evaluation failed: {preflight.error}</div>
      )}

      {selectedAgent && preflight.data && !preflight.data.available && (
        <div className="aicp-empty">
          SOMA vault not configured. AICP requires a connected vault.
        </div>
      )}

      {selectedAgent && preflight.data?.available && (
        <>
          {/* Authorization Section */}
          <div className="aicp-section">
            <h3 className="aicp-section__title">Authorization</h3>
            {preflight.loading ? (
              <div className="aicp-loading">Evaluating...</div>
            ) : (
              <div className="aicp-auth">
                <ProceedBadge
                  proceed={preflight.data.proceed}
                  latencyMs={preflight.data._meta.durationMs}
                />
                <div className="aicp-auth__counts">
                  <span>{warnings.length} warnings</span>
                  <span>{preflight.data.recommendations.length} recommendations</span>
                </div>
              </div>
            )}
          </div>

          {/* Health & Drift Section */}
          <div className="aicp-section aicp-section--row">
            <div className="aicp-health">
              <h3 className="aicp-section__title">Health</h3>
              {briefing.loading ? (
                <div className="aicp-loading">Loading...</div>
              ) : briefing.data ? (
                <>
                  <div className="aicp-health__status">
                    <span
                      className={`aicp-health__badge aicp-health__badge--${briefing.data.status.toLowerCase()}`}
                    >
                      {briefing.data.status === 'CRITICAL'
                        ? '\u26D4'
                        : briefing.data.status === 'DEGRADED'
                          ? '\u26A0'
                          : '\u2714'}{' '}
                      {briefing.data.status}
                    </span>
                  </div>
                  <div className="aicp-health__stats">
                    <div>{((1 - briefing.data.failureRate) * 100).toFixed(1)}% success rate</div>
                    <div>
                      {briefing.data.totalExecutions} runs ({briefing.data.failureCount} failed)
                    </div>
                  </div>
                </>
              ) : null}
            </div>
            <div className="aicp-drift">
              <h3 className="aicp-section__title">Conformance Drift</h3>
              {drift.loading ? (
                <div className="aicp-loading">Loading...</div>
              ) : drift.data ? (
                <>
                  <div className="aicp-drift__status">
                    <span
                      className={`aicp-drift__badge aicp-drift__badge--${drift.data.drift.status}`}
                    >
                      {drift.data.drift.status === 'degrading'
                        ? '\u2198'
                        : drift.data.drift.status === 'improving'
                          ? '\u2197'
                          : '\u2192'}{' '}
                      {drift.data.drift.status}
                    </span>
                    <span className="aicp-drift__points">
                      {drift.data.drift.dataPoints} data points
                    </span>
                  </div>
                  {drift.data.points.length >= 2 && <DriftSparkline points={drift.data.points} />}
                </>
              ) : (
                <div className="aicp-drift__empty">Insufficient data</div>
              )}
            </div>
          </div>

          {/* Warnings Section */}
          {warnings.length > 0 && (
            <div className="aicp-section">
              <h3 className="aicp-section__title">Warnings ({warnings.length})</h3>
              <div className="aicp-warnings">
                {visibleWarnings.map((w, i) => (
                  <WarningCard
                    key={`${w.rule}-${i}`}
                    warning={w}
                    expanded={expandedWarningIdx === i}
                    onToggle={() => setExpandedWarningIdx(expandedWarningIdx === i ? null : i)}
                    agentId={selectedAgent}
                  />
                ))}
                {!warningsExpanded && hiddenCount > 0 && (
                  <button
                    type="button"
                    className="aicp-warnings__expander"
                    onClick={() => setWarningsExpanded(true)}
                  >
                    Show {hiddenCount} more
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Recommendations Section */}
          {preflight.data.recommendations.length > 0 && (
            <div className="aicp-section">
              <h3 className="aicp-section__title">
                Recommendations ({preflight.data.recommendations.length})
              </h3>
              <div className="aicp-recs">
                {preflight.data.recommendations.map((r, i) => (
                  <RecommendationCard
                    key={`rec-${i}`}
                    rec={r}
                    onSelectAgent={(id) => setSelectedAgent(id)}
                    expanded={expandedRecIdx === i}
                    onToggle={() => setExpandedRecIdx(expandedRecIdx === i ? null : i)}
                    agentId={selectedAgent}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Consultation History Section */}
          <div className="aicp-section">
            <h3 className="aicp-section__title">Consultation History</h3>
            {briefing.data?.intelligence && briefing.data.intelligence.length > 0 ? (
              <div className="aicp-consultations">
                <div className="aicp-consultations__summary">
                  {aicpConsultations.length > 0
                    ? `${aicpConsultations.length} of ${briefing.data.intelligence.length} intelligence items reference AICP`
                    : 'No AICP consultations recorded yet'}
                </div>
                <div className="aicp-consultations__hint">
                  Agents that call <code>/api/aicp/preflight</code> before execution record
                  consultations in their traces, enabling provenance tracking.
                </div>
              </div>
            ) : (
              <div className="aicp-consultations__empty">
                No intelligence data. Run the pipeline to gather agent intelligence.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
