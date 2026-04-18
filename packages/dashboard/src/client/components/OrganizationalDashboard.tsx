import React from 'react';
import { useOrganizationalData } from '../hooks/organizational';

/**
 * OrganizationalDashboard Component
 *
 * Real-time organizational intelligence dashboard showing team governance,
 * security auditing, policy bridge, and session correlation data.
 */
export function OrganizationalDashboard(): JSX.Element {
  const { teamFilter, intelligence, context } = useOrganizationalData();

  return (
    <div className="organizational-dashboard">
      <div className="organizational-header">
        <h1>🏢 Organizational Intelligence</h1>
        <p>Real-time team governance and security intelligence</p>
      </div>

      {/* Team Filter Section */}
      <div className="organizational-section">
        <h2>👥 Team Context</h2>
        <div className="team-filter-controls">
          <select
            value={teamFilter.selectedTeamId || ''}
            onChange={(e) => teamFilter.setTeam(e.target.value || null)}
          >
            <option value="">All Teams</option>
            {teamFilter.accessibleTeams.map(team => (
              <option key={team.teamId} value={team.teamId}>
                {team.teamName} ({team.memberCount} members)
              </option>
            ))}
          </select>
          <button onClick={teamFilter.refresh}>
            {teamFilter.loading ? '⟳' : '🔄'} Refresh Teams
          </button>
        </div>

        {teamFilter.currentTeam && (
          <div className="current-team-info">
            <h3>Active Team: {teamFilter.currentTeam.teamName}</h3>
            <p>Access Level: {teamFilter.currentTeam.accessLevel}</p>
            <p>Members: {teamFilter.currentTeam.memberCount}</p>
          </div>
        )}
      </div>

      {/* Intelligence Overview */}
      <div className="organizational-section">
        <h2>🧠 Intelligence Overview</h2>
        <div className="intelligence-grid">
          {intelligence.loading ? (
            <div className="loading">Loading intelligence data...</div>
          ) : intelligence.error ? (
            <div className="error">Error: {intelligence.error}</div>
          ) : intelligence.data ? (
            <>
              <div className="intelligence-card">
                <h3>👤 Operator Insights</h3>
                <p>Active Operators: {intelligence.operatorInsights?.activeOperators || 0}</p>
                <p>Collaboration Events: {intelligence.operatorInsights?.collaborationEvents || 0}</p>
              </div>

              <div className="intelligence-card">
                <h3>🏢 Team Insights</h3>
                <p>Active Teams: {intelligence.teamInsights?.activeTeams || 0}</p>
                <p>Cross-team Collaboration: {intelligence.teamInsights?.crossTeamCollaboration || 0}</p>
              </div>

              <div className="intelligence-card">
                <h3>⚡ Performance Insights</h3>
                <p>Query Latency: {intelligence.performanceInsights?.organizationalQueryLatency || 0}ms</p>
                <p>Cache Hit Rate: {((intelligence.performanceInsights?.teamScopedCacheHitRate || 0) * 100).toFixed(1)}%</p>
              </div>
            </>
          ) : (
            <div className="no-data">No intelligence data available</div>
          )}
        </div>
      </div>

      {/* Status Grid */}
      <div className="organizational-section">
        <h2>🔧 Service Status</h2>
        <div className="status-grid">
          <div className="status-card">
            <h3>✅ Team Governance</h3>
            <p>Workflow customization active</p>
            <p>{teamFilter.accessibleTeams.length} teams accessible</p>
          </div>

          <div className="status-card">
            <h3>✅ Security Auditing</h3>
            <p>All operations tracked</p>
            <p>Compliance rate: {intelligence.performanceInsights ? `${(intelligence.performanceInsights.policyComplianceRate * 100).toFixed(1)}%` : 'N/A'}</p>
          </div>

          <div className="status-card">
            <h3>✅ Policy Bridge</h3>
            <p>Organizational context enabled</p>
            <p>Filter: {teamFilter.filterActive ? 'Active' : 'Inactive'}</p>
          </div>

          <div className="status-card">
            <h3>✅ Session Correlation</h3>
            <p>Cross-operator intelligence</p>
            <p>Accuracy: {intelligence.performanceInsights ? `${(intelligence.performanceInsights.sessionCorrelationAccuracy * 100).toFixed(1)}%` : 'N/A'}</p>
          </div>
        </div>
      </div>

      {/* API Status */}
      <div className="organizational-section">
        <h2>📡 Available APIs</h2>
        <div className="api-status">
          <ul>
            <li><strong>/api/governance</strong> - Team governance workflows</li>
            <li><strong>/api/policies</strong> - Organizational policy bridge</li>
            <li><strong>/api/audit</strong> - Security audit logging</li>
            <li><strong>/api/correlation</strong> - Session correlation</li>
            <li><strong>/api/stats</strong> - Organizational intelligence metrics</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default OrganizationalDashboard;