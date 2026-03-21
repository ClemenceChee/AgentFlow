import { useState } from 'react';
import type { SomaReport } from '../hooks/useSomaReport';
import { EfficiencyPanel, EfficiencyTeaser } from './EfficiencyPanel';
import { GuardExplanationCard } from './GuardExplanationCard';

function timeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function StatusBadge({ status }: { status: string }) {
  const color =
    status === 'critical'
      ? 'var(--color-critical)'
      : status === 'warning'
        ? '#d29922'
        : 'var(--color-ok)';
  const label =
    status === 'critical' ? '\u2718 BLOCK' : status === 'warning' ? '\u26A0 WARN' : '\u2714 OK';
  return <span style={{ color, fontWeight: 600, fontSize: 12 }}>{label}</span>;
}

function LayerBadge({ layer, status }: { layer?: string; status?: string }) {
  if (!layer) return null;
  const colors: Record<string, string> = {
    canon: '#3fb950',
    emerging: '#58a6ff',
    working: '#d29922',
    archive: '#8b949e',
  };
  const labels: Record<string, string> = {
    canon: 'L4 Canon',
    emerging: 'L3 Emerging',
    working: 'L2 Working',
    archive: 'L1 Archive',
  };
  const color = colors[layer] ?? '#8b949e';
  const label = labels[layer] ?? layer;
  const statusSuffix =
    status === 'promoted'
      ? ' \u2714'
      : status === 'rejected'
        ? ' \u2718'
        : status === 'pending'
          ? ' \u25CB'
          : '';
  return (
    <span
      style={{
        color,
        fontSize: 10,
        fontWeight: 600,
        border: `1px solid ${color}`,
        borderRadius: 3,
        padding: '1px 4px',
        marginLeft: 4,
      }}
    >
      {label}
      {statusSuffix}
    </span>
  );
}

/** Active state — shows real Soma intelligence data */
function ActiveView({ report, agentId }: { report: SomaReport; agentId: string }) {
  const agentData = report.agents?.find((a) => a.name === agentId);
  const agentGuard = report.guardRecommendations?.find((g) => g.agent === agentId);
  const isStale =
    report.generatedAt && Date.now() - new Date(report.generatedAt).getTime() > 30 * 60_000;

  const [typeFilter, setTypeFilter] = useState('all');
  const [confFilter, setConfFilter] = useState('all');
  const [showAllInsights, setShowAllInsights] = useState(false);
  const [showAllPolicies, setShowAllPolicies] = useState(false);

  const INSIGHT_LIMIT = 10;
  const POLICY_LIMIT = 10;

  return (
    <div className="soma-intel">
      {/* Header */}
      <div className="soma-intel__header">
        <span className="soma-intel__title">{'\u{1F9E0}'} Intelligence</span>
        <span className="soma-intel__badge">powered by Soma</span>
        {report.generatedAt && (
          <span className={`soma-intel__ts ${isStale ? 'soma-intel__ts--stale' : ''}`}>
            Updated {timeAgo(report.generatedAt)}
            {isStale && ' \u26A0 stale'}
          </span>
        )}
      </div>

      {/* Agent-specific stats */}
      {agentData && (
        <div className="soma-intel__agent-card">
          <div className="soma-intel__agent-name">{agentData.name}</div>
          <div className="soma-intel__agent-stats">
            <span>{agentData.totalRuns} runs</span>
            <span
              style={{
                color: agentData.failures > 0 ? 'var(--color-critical)' : 'var(--color-ok)',
              }}
            >
              {agentData.failures} failures
            </span>
            <span>{(agentData.failureRate * 100).toFixed(1)}%</span>
            <StatusBadge status={agentData.status} />
          </div>
          {agentGuard && agentGuard.action === 'block' && (
            <div className="soma-intel__guard-block">
              {agentGuard.explanation ? (
                <GuardExplanationCard
                  violation={{
                    type: 'high-failure-rate',
                    nodeId: agentData?.name ?? '',
                    message: agentGuard.reason,
                    timestamp: Date.now(),
                    explanation: agentGuard.explanation,
                  }}
                />
              ) : (
                <>
                  {'\u2718'} Guard would block: {agentGuard.reason}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {!agentData && <div className="soma-intel__empty">No Soma data for this agent yet</div>}

      {/* All agents overview */}
      <div className="soma-intel__section">
        <h4 className="soma-intel__section-title">Agent Health ({report.totals?.agents ?? 0})</h4>
        <div className="soma-intel__table">
          <div className="soma-intel__row soma-intel__row--header">
            <span className="soma-intel__col-name">Agent</span>
            <span className="soma-intel__col-num">Runs</span>
            <span className="soma-intel__col-num">Fail</span>
            <span className="soma-intel__col-num">Rate</span>
            <span className="soma-intel__col-status">Status</span>
          </div>
          {report.agents?.slice(0, 20).map((a) => (
            <div
              key={a.name}
              className={`soma-intel__row ${a.name === agentId ? 'soma-intel__row--active' : ''}`}
            >
              <span className="soma-intel__col-name">{a.name}</span>
              <span className="soma-intel__col-num">{a.totalRuns}</span>
              <span
                className="soma-intel__col-num"
                style={{ color: a.failures > 0 ? 'var(--color-critical)' : undefined }}
              >
                {a.failures}
              </span>
              <span className="soma-intel__col-num">{(a.failureRate * 100).toFixed(1)}%</span>
              <span className="soma-intel__col-status">
                <StatusBadge status={a.status} />
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Insights with filters */}
      {report.insights &&
        report.insights.length > 0 &&
        (() => {
          const filtered = report.insights
            .filter((ins) => typeFilter === 'all' || ins.type === typeFilter)
            .filter((ins) => confFilter === 'all' || ins.confidence === confFilter);
          const visible = showAllInsights ? filtered : filtered.slice(0, INSIGHT_LIMIT);

          return (
            <div className="soma-intel__section">
              <div className="soma-intel__section-header">
                <h4 className="soma-intel__section-title">Learned Insights ({filtered.length})</h4>
                <div className="soma-intel__filters">
                  <select
                    className="soma-intel__filter"
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value)}
                  >
                    <option value="all">All types</option>
                    <option value="insight">Insight</option>
                    <option value="decision">Decision</option>
                    <option value="constraint">Constraint</option>
                    <option value="contradiction">Contradiction</option>
                  </select>
                  <select
                    className="soma-intel__filter"
                    value={confFilter}
                    onChange={(e) => setConfFilter(e.target.value)}
                  >
                    <option value="all">All confidence</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
              </div>
              {visible.map((ins, i) => (
                <div key={i} className="soma-intel__insight">
                  <span className="soma-intel__insight-type">{ins.type}</span>
                  <strong>{ins.title}</strong>
                  <span className="soma-intel__insight-conf">{ins.confidence}</span>
                  <LayerBadge layer={(ins as any).layer} status={(ins as any).proposal_status} />
                  {(ins as any).confidence_score != null && (
                    <span style={{ fontSize: 10, color: '#8b949e', marginLeft: 4 }}>
                      ({((ins as any).confidence_score * 100).toFixed(0)}%)
                    </span>
                  )}
                  {ins.claim && <div className="soma-intel__insight-claim">{ins.claim}</div>}
                </div>
              ))}
              {filtered.length > INSIGHT_LIMIT && (
                <button
                  type="button"
                  className="soma-intel__show-more"
                  onClick={() => setShowAllInsights(!showAllInsights)}
                >
                  {showAllInsights ? 'Show less' : `Show all (${filtered.length})`}
                </button>
              )}
            </div>
          );
        })()}

      {/* Policies */}
      {report.policies &&
        report.policies.length > 0 &&
        (() => {
          const visible = showAllPolicies
            ? report.policies
            : report.policies.slice(0, POLICY_LIMIT);
          return (
            <div className="soma-intel__section">
              <h4 className="soma-intel__section-title">
                Guard Policies ({report.policies.length})
              </h4>
              {visible.map((pol, i) => (
                <div key={i} className="soma-intel__policy">
                  <strong>{pol.name}</strong>
                  <span
                    className={`soma-intel__enforcement soma-intel__enforcement--${pol.enforcement}`}
                  >
                    {pol.enforcement}
                  </span>
                  {pol.conditions && (
                    <div className="soma-intel__policy-cond">{pol.conditions}</div>
                  )}
                </div>
              ))}
              {report.policies.length > POLICY_LIMIT && (
                <button
                  type="button"
                  className="soma-intel__show-more"
                  onClick={() => setShowAllPolicies(!showAllPolicies)}
                >
                  {showAllPolicies ? 'Show less' : `Show all (${report.policies.length})`}
                </button>
              )}
            </div>
          );
        })()}

      {/* Efficiency Panel (premium — shows when SOMA data is available) */}
      {report.available ? <EfficiencyPanel apiBase="" /> : <EfficiencyTeaser />}
    </div>
  );
}

/** Teaser state — marketing CTA for non-Soma users */
function TeaserView() {
  return (
    <div className="soma-intel soma-intel--teaser">
      <div className="soma-intel__teaser-icon">{'\u{1F9E0}'}</div>
      <h3 className="soma-intel__teaser-title">Soma Intelligence</h3>
      <p className="soma-intel__teaser-subtitle">Organizational learning for your agents</p>

      <div className="soma-intel__teaser-features">
        <div className="soma-intel__teaser-feature">
          {'\u2714'} Learn failure patterns automatically
        </div>
        <div className="soma-intel__teaser-feature">
          {'\u2714'} Generate guard policies from execution data
        </div>
        <div className="soma-intel__teaser-feature">{'\u2714'} Discover cross-agent archetypes</div>
        <div className="soma-intel__teaser-feature">
          {'\u2714'} Semantic search across all knowledge
        </div>
        <div className="soma-intel__teaser-feature">{'\u2714'} Agents get smarter over time</div>
      </div>

      <a
        className="soma-intel__teaser-cta"
        href="mailto:clemence@agentflow.dev?subject=Soma%20Intelligence%20Waitlist"
        target="_blank"
        rel="noopener noreferrer"
      >
        Coming Soon — Join the Waitlist
      </a>
    </div>
  );
}

export function SomaIntelligence({
  report,
  agentId,
}: {
  report: SomaReport | null;
  agentId: string;
}) {
  if (!report) return <div className="workspace__empty">Loading intelligence...</div>;
  if (report.teaser || !report.available) return <TeaserView />;
  return <ActiveView report={report} agentId={agentId} />;
}
