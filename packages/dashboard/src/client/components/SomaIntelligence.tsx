import type { SomaReport } from '../hooks/useSomaReport';

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
  const color = status === 'critical' ? 'var(--color-critical)' : status === 'warning' ? '#d29922' : 'var(--color-ok)';
  const label = status === 'critical' ? '\u2718 BLOCK' : status === 'warning' ? '\u26A0 WARN' : '\u2714 OK';
  return <span style={{ color, fontWeight: 600, fontSize: 12 }}>{label}</span>;
}

/** Active state — shows real Soma intelligence data */
function ActiveView({ report, agentId }: { report: SomaReport; agentId: string }) {
  const agentData = report.agents?.find((a) => a.name === agentId);
  const agentGuard = report.guardRecommendations?.find((g) => g.agent === agentId);
  const isStale = report.generatedAt && (Date.now() - new Date(report.generatedAt).getTime()) > 30 * 60_000;

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
            <span style={{ color: agentData.failures > 0 ? 'var(--color-critical)' : 'var(--color-ok)' }}>{agentData.failures} failures</span>
            <span>{(agentData.failureRate * 100).toFixed(1)}%</span>
            <StatusBadge status={agentData.status} />
          </div>
          {agentGuard && agentGuard.action === 'block' && (
            <div className="soma-intel__guard-block">{'\u2718'} Guard would block: {agentGuard.reason}</div>
          )}
        </div>
      )}

      {!agentData && (
        <div className="soma-intel__empty">No Soma data for this agent yet</div>
      )}

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
            <div key={a.name} className={`soma-intel__row ${a.name === agentId ? 'soma-intel__row--active' : ''}`}>
              <span className="soma-intel__col-name">{a.name}</span>
              <span className="soma-intel__col-num">{a.totalRuns}</span>
              <span className="soma-intel__col-num" style={{ color: a.failures > 0 ? 'var(--color-critical)' : undefined }}>{a.failures}</span>
              <span className="soma-intel__col-num">{(a.failureRate * 100).toFixed(1)}%</span>
              <span className="soma-intel__col-status"><StatusBadge status={a.status} /></span>
            </div>
          ))}
        </div>
      </div>

      {/* Insights */}
      {report.insights && report.insights.length > 0 && (
        <div className="soma-intel__section">
          <h4 className="soma-intel__section-title">Learned Insights ({report.insights.length})</h4>
          {report.insights.map((ins, i) => (
            <div key={i} className="soma-intel__insight">
              <span className="soma-intel__insight-type">{ins.type}</span>
              <strong>{ins.title}</strong>
              <span className="soma-intel__insight-conf">{ins.confidence}</span>
              {ins.claim && <div className="soma-intel__insight-claim">{ins.claim}</div>}
            </div>
          ))}
        </div>
      )}

      {/* Policies */}
      {report.policies && report.policies.length > 0 && (
        <div className="soma-intel__section">
          <h4 className="soma-intel__section-title">Guard Policies ({report.policies.length})</h4>
          {report.policies.map((pol, i) => (
            <div key={i} className="soma-intel__policy">
              <strong>{pol.name}</strong>
              <span className={`soma-intel__enforcement soma-intel__enforcement--${pol.enforcement}`}>{pol.enforcement}</span>
              {pol.conditions && <div className="soma-intel__policy-cond">{pol.conditions}</div>}
            </div>
          ))}
        </div>
      )}
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
        <div className="soma-intel__teaser-feature">{'\u2714'} Learn failure patterns automatically</div>
        <div className="soma-intel__teaser-feature">{'\u2714'} Generate guard policies from execution data</div>
        <div className="soma-intel__teaser-feature">{'\u2714'} Discover cross-agent archetypes</div>
        <div className="soma-intel__teaser-feature">{'\u2714'} Semantic search across all knowledge</div>
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

export function SomaIntelligence({ report, agentId }: { report: SomaReport | null; agentId: string }) {
  if (!report) return <div className="workspace__empty">Loading intelligence...</div>;
  if (report.teaser || !report.available) return <TeaserView />;
  return <ActiveView report={report} agentId={agentId} />;
}
