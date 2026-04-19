import { useOrganizationalData } from '../hooks/organizational';

/**
 * OrganizationalDashboard Component
 *
 * Real-time organizational intelligence dashboard showing team governance,
 * security auditing, policy bridge, and session correlation data.
 */
export function OrganizationalDashboard(): JSX.Element {
  const { teamFilter, intelligence } = useOrganizationalData();

  const complianceRate = intelligence.performanceInsights
    ? intelligence.performanceInsights.policyComplianceRate * 100
    : null;
  const cacheHitRate = intelligence.performanceInsights
    ? intelligence.performanceInsights.teamScopedCacheHitRate * 100
    : null;
  const sessionCorrelation = intelligence.performanceInsights
    ? intelligence.performanceInsights.sessionCorrelationAccuracy * 100
    : null;

  return (
    <div className="org-dashboard">
      <header className="org-dashboard__header">
        <div className="org-dashboard__eyebrow">
          AGENTFLOW ENTERPRISE · ORGANIZATIONAL INTELLIGENCE
        </div>
        <div className="org-dashboard__title-row">
          <h1 className="org-dashboard__title">Team governance</h1>
          <div className="org-dashboard__actions">
            <label className="aicp-page__select-label">
              <span className="aicp-page__select-text">Team</span>
              <select
                className="aicp-page__select"
                value={teamFilter.selectedTeamId || ''}
                onChange={(e) => teamFilter.setTeam(e.target.value || null)}
              >
                <option value="">All Teams</option>
                {teamFilter.accessibleTeams.map((team) => (
                  <option key={team.teamId} value={team.teamId}>
                    {team.teamName} ({team.memberCount})
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={teamFilter.refresh}
              title="Refresh"
            >
              {'\u21BB'}
            </button>
          </div>
        </div>
        <p className="org-dashboard__subtitle">
          Team governance · security auditing · policy bridge · session correlation · zero LLM cost
        </p>
      </header>

      <div className="kpi-row">
        <div className="kpi">
          <div className="kpi__label">ACTIVE TEAMS</div>
          <div className="kpi__value">{intelligence.teamInsights?.activeTeams ?? 0}</div>
        </div>
        <div className="kpi">
          <div className="kpi__label">ACTIVE OPERATORS</div>
          <div className="kpi__value">{intelligence.operatorInsights?.activeOperators ?? 0}</div>
        </div>
        <div className="kpi">
          <div className="kpi__label">COMPLIANCE</div>
          <div
            className={`kpi__value ${complianceRate != null && complianceRate < 95 ? 'kpi__value--warn' : 'kpi__value--ok'}`}
          >
            {complianceRate != null ? complianceRate.toFixed(1) : '—'}
            {complianceRate != null && <span className="kpi__unit">%</span>}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi__label">CACHE HIT RATE</div>
          <div className="kpi__value">
            {cacheHitRate != null ? cacheHitRate.toFixed(1) : '—'}
            {cacheHitRate != null && <span className="kpi__unit">%</span>}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi__label">QUERY LATENCY</div>
          <div className="kpi__value">
            {intelligence.performanceInsights?.organizationalQueryLatency ?? 0}
            <span className="kpi__unit">ms</span>
          </div>
        </div>
        <div className="kpi">
          <div className="kpi__label">CORRELATION</div>
          <div className="kpi__value">
            {sessionCorrelation != null ? sessionCorrelation.toFixed(1) : '—'}
            {sessionCorrelation != null && <span className="kpi__unit">%</span>}
          </div>
        </div>
      </div>

      {intelligence.loading && <div className="loading-state">Loading intelligence{'\u2026'}</div>}
      {intelligence.error && (
        <div className="card">
          <div className="card__header">
            <h3 className="card__title">ERROR</h3>
          </div>
          <div className="empty-state">
            <p className="org-dashboard__error">{intelligence.error}</p>
            <p>Check server logs or retry.</p>
          </div>
        </div>
      )}

      {teamFilter.currentTeam && (
        <div className="card">
          <div className="card__header">
            <h3 className="card__title">ACTIVE TEAM</h3>
          </div>
          <div className="org-dashboard__team-info">
            <div className="org-dashboard__team-row">
              <span className="org-dashboard__team-label">Name</span>
              <span className="org-dashboard__team-value">{teamFilter.currentTeam.teamName}</span>
            </div>
            <div className="org-dashboard__team-row">
              <span className="org-dashboard__team-label">Access Level</span>
              <span className="org-dashboard__team-value">
                <span className="badge badge--info">{teamFilter.currentTeam.accessLevel}</span>
              </span>
            </div>
            <div className="org-dashboard__team-row">
              <span className="org-dashboard__team-label">Members</span>
              <span className="org-dashboard__team-value">
                {teamFilter.currentTeam.memberCount}
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card__header">
          <h3 className="card__title">SERVICE STATUS</h3>
        </div>
        <div className="org-dashboard__services">
          <div className="org-dashboard__service">
            <span className="dot dot--ok" />
            <span className="org-dashboard__service-name">Team Governance</span>
            <span className="org-dashboard__service-meta">
              {teamFilter.accessibleTeams.length} teams
            </span>
          </div>
          <div className="org-dashboard__service">
            <span className="dot dot--ok" />
            <span className="org-dashboard__service-name">Security Auditing</span>
            <span className="org-dashboard__service-meta">All operations tracked</span>
          </div>
          <div className="org-dashboard__service">
            <span className="dot dot--ok" />
            <span className="org-dashboard__service-name">Policy Bridge</span>
            <span className="org-dashboard__service-meta">
              Filter {teamFilter.filterActive ? 'active' : 'inactive'}
            </span>
          </div>
          <div className="org-dashboard__service">
            <span className="dot dot--ok" />
            <span className="org-dashboard__service-name">Session Correlation</span>
            <span className="org-dashboard__service-meta">Cross-operator intelligence</span>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card__header">
          <h3 className="card__title">AVAILABLE APIS</h3>
        </div>
        <div className="org-dashboard__api-list">
          <div className="org-dashboard__api">
            <code>/api/governance</code>
            <span className="org-dashboard__api-desc">Team governance workflows</span>
          </div>
          <div className="org-dashboard__api">
            <code>/api/policies</code>
            <span className="org-dashboard__api-desc">Organizational policy bridge</span>
          </div>
          <div className="org-dashboard__api">
            <code>/api/audit</code>
            <span className="org-dashboard__api-desc">Security audit logging</span>
          </div>
          <div className="org-dashboard__api">
            <code>/api/correlation</code>
            <span className="org-dashboard__api-desc">Session correlation</span>
          </div>
          <div className="org-dashboard__api">
            <code>/api/stats</code>
            <span className="org-dashboard__api-desc">Organizational metrics</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default OrganizationalDashboard;
