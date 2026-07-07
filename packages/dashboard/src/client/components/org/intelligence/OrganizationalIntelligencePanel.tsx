/**
 * Organizational Intelligence Panel — Displays SOMA organizational intelligence data.
 *
 * This component demonstrates how to wire AgentFlow dashboard components
 * to SOMA enriched organizational intelligence using the new data layer.
 */

import { useEffect } from 'react';
import { useOrganizationalIntelligence, useOrganizationalTraces } from '../../../hooks/useOrganizationalData.js';
import { useOrganizationalContext } from '../../../contexts/OrganizationalContext.js';

export function OrganizationalIntelligencePanel(): JSX.Element {
  const { intelligence, loading: intelligenceLoading, error: intelligenceError, refresh } = useOrganizationalIntelligence();
  const { state, refreshIntelligence } = useOrganizationalContext();

  const {
    traces,
    loading: tracesLoading,
    error: tracesError,
    total: totalTraces
  } = useOrganizationalTraces({
    teamFilter: state.teamFilter.selectedTeamId,
    limit: 50,
    autoRefresh: true,
    refreshInterval: 30000
  });

  // Update context when intelligence is loaded
  useEffect(() => {
    if (intelligence) {
      // This would normally call refreshIntelligence() to update the context
      // but for now we'll just refresh to demonstrate the pattern
      refreshIntelligence();
    }
  }, [intelligence, refreshIntelligence]);

  if (intelligenceLoading && !intelligence) {
    return (
      <div className="organizational-intelligence-panel loading">
        <div className="loading-spinner">
          <div className="spinner"></div>
          Loading organizational intelligence...
        </div>
      </div>
    );
  }

  if (intelligenceError) {
    return (
      <div className="organizational-intelligence-panel error">
        <div className="error-message">
          <span className="error-icon">⚠️</span>
          <div>
            <h3>Failed to load organizational intelligence</h3>
            <p>{intelligenceError}</p>
            <button onClick={refresh} className="retry-button">
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!intelligence) {
    return (
      <div className="organizational-intelligence-panel empty">
        <div className="empty-state">
          <span className="empty-icon">📊</span>
          <h3>No organizational intelligence available</h3>
          <p>Connect SOMA vault to see organizational insights and metrics.</p>
        </div>
      </div>
    );
  }

  const {
    operatorInsights,
    teamInsights,
    performanceInsights
  } = intelligence;

  return (
    <div className="organizational-intelligence-panel">
      <header className="panel-header">
        <h2>
          <span className="icon">🧠</span>
          Organizational Intelligence
        </h2>
        <div className="header-actions">
          <span className="data-indicator">
            {totalTraces} enriched traces
          </span>
          <button
            onClick={refresh}
            disabled={intelligenceLoading}
            className="refresh-button"
          >
            {intelligenceLoading ? '↻' : '🔄'}
          </button>
        </div>
      </header>

      <div className="intelligence-grid">
        {/* Operator Insights */}
        <div className="intelligence-section">
          <h3>
            <span className="section-icon">👥</span>
            Operator Insights
          </h3>
          <div className="metrics-grid">
            <div className="metric">
              <span className="metric-value">{operatorInsights.totalOperators}</span>
              <span className="metric-label">Total Operators</span>
            </div>
            <div className="metric">
              <span className="metric-value">{operatorInsights.activeOperators}</span>
              <span className="metric-label">Active (24h)</span>
            </div>
            <div className="metric">
              <span className="metric-value">{operatorInsights.collaborationEvents}</span>
              <span className="metric-label">Collaboration Events</span>
            </div>
            <div className="metric">
              <span className="metric-value">{operatorInsights.knowledgeSharing}</span>
              <span className="metric-label">Knowledge Sharing</span>
            </div>
          </div>
        </div>

        {/* Team Insights */}
        <div className="intelligence-section">
          <h3>
            <span className="section-icon">🏢</span>
            Team Insights
          </h3>
          <div className="metrics-grid">
            <div className="metric">
              <span className="metric-value">{teamInsights.totalTeams}</span>
              <span className="metric-label">Total Teams</span>
            </div>
            <div className="metric">
              <span className="metric-value">{teamInsights.activeTeams}</span>
              <span className="metric-label">Active Teams</span>
            </div>
            <div className="metric">
              <span className="metric-value">{teamInsights.crossTeamCollaboration}</span>
              <span className="metric-label">Cross-Team Events</span>
            </div>
            <div className="metric">
              <span className="metric-value">{teamInsights.averageTeamSize}</span>
              <span className="metric-label">Avg Team Size</span>
            </div>
          </div>
        </div>

        {/* Performance Insights */}
        <div className="intelligence-section">
          <h3>
            <span className="section-icon">⚡</span>
            Performance Insights
          </h3>
          <div className="metrics-grid">
            <div className="metric">
              <span className="metric-value">
                {Math.round(performanceInsights.organizationalQueryLatency)}ms
              </span>
              <span className="metric-label">Avg Query Latency</span>
            </div>
            <div className="metric">
              <span className="metric-value">
                {Math.round(performanceInsights.teamScopedCacheHitRate * 100)}%
              </span>
              <span className="metric-label">Cache Hit Rate</span>
            </div>
            <div className="metric">
              <span className="metric-value">
                {Math.round(performanceInsights.sessionCorrelationAccuracy * 100)}%
              </span>
              <span className="metric-label">Session Correlation</span>
            </div>
            <div className="metric">
              <span className="metric-value">
                {Math.round(performanceInsights.policyComplianceRate * 100)}%
              </span>
              <span className="metric-label">Policy Compliance</span>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Organizational Traces */}
      <div className="recent-traces-section">
        <h3>
          <span className="section-icon">📋</span>
          Recent Organizational Traces
          {state.teamFilter.filterActive && (
            <span className="filter-indicator">
              (Team: {state.teamFilter.selectedTeamId})
            </span>
          )}
        </h3>

        {tracesLoading && traces.length === 0 ? (
          <div className="loading-traces">Loading traces...</div>
        ) : tracesError ? (
          <div className="traces-error">
            Error loading traces: {tracesError}
          </div>
        ) : traces.length === 0 ? (
          <div className="empty-traces">
            No organizational traces found for the selected criteria.
          </div>
        ) : (
          <div className="traces-list">
            {traces.slice(0, 5).map(trace => (
              <div key={trace.filename} className="trace-item">
                <div className="trace-header">
                  <span className="agent-id">{trace.agentId}</span>
                  <span className="trace-status status-{trace.status}">
                    {trace.status}
                  </span>
                  <span className="trace-time">
                    {new Date(trace.startTime).toLocaleTimeString()}
                  </span>
                </div>
                <div className="trace-details">
                  {trace.operatorContext && (
                    <span className="operator-info">
                      👤 {trace.operatorContext.operatorId}
                      {trace.operatorContext.teamId && (
                        <span className="team-badge">
                          🏢 {trace.operatorContext.teamId}
                        </span>
                      )}
                    </span>
                  )}
                  <div className="organizational-features">
                    {trace.metadata?.organizationalFeatures?.hasSessionCorrelation && (
                      <span className="feature-badge">🔗 Session Correlated</span>
                    )}
                    {trace.metadata?.organizationalFeatures?.hasPolicyStatus && (
                      <span className="feature-badge">📋 Policy Evaluated</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}