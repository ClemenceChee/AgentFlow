import { useCallback, useEffect, useState } from 'react';
import { useOrganizationalContext } from '../contexts/OrganizationalContext';
import { OrganizationalErrorBoundary } from './org/common/OrganizationalErrorBoundary';
import { CacheEfficiencyVisualizer } from './org/performance/CacheEfficiencyVisualizer';
import { OrganizationalIntelligenceMetrics } from './org/performance/OrganizationalIntelligenceMetrics';
import { TeamQueryPerformanceChart } from './org/performance/TeamQueryPerformanceChart';
import { GovernanceRecommendations } from './org/policy/GovernanceRecommendations';
import { PolicyConfigurationView } from './org/policy/PolicyConfigurationView';
import { TeamFilterDropdown } from './org/team/TeamFilterDropdown';

type OrgSubView = 'team' | 'policy' | 'session' | 'activity' | 'performance';

const SUB_VIEWS: ReadonlyArray<{ id: OrgSubView; label: string; icon: string }> = [
  { id: 'team', label: 'Team', icon: '\u{1F465}' },
  { id: 'policy', label: 'Policy', icon: '\u{1F4DC}' },
  { id: 'session', label: 'Session', icon: '\u{1F517}' },
  { id: 'activity', label: 'Activity', icon: '\u{1F4CA}' },
  { id: 'performance', label: 'Performance', icon: '\u26A1' },
];

const DEFAULT_VIEW: OrgSubView = 'team';

function readViewFromUrl(): OrgSubView {
  if (typeof window === 'undefined') return DEFAULT_VIEW;
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('org');
  if (raw && SUB_VIEWS.some((v) => v.id === raw)) return raw as OrgSubView;
  return DEFAULT_VIEW;
}

function writeViewToUrl(view: OrgSubView): void {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  params.set('org', view);
  const next = `${window.location.pathname}?${params.toString()}${window.location.hash}`;
  window.history.replaceState(null, '', next);
}

export function OrganizationalDashboard(): JSX.Element {
  const [view, setView] = useState<OrgSubView>(() => readViewFromUrl());

  useEffect(() => {
    writeViewToUrl(view);
  }, [view]);

  useEffect(() => {
    const onPop = () => setView(readViewFromUrl());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const handleSelect = useCallback((next: OrgSubView) => setView(next), []);

  return (
    <div className="organizational-dashboard">
      <header className="organizational-dashboard__header">
        <h1>Organizational Intelligence</h1>
        <div
          className="organizational-dashboard__tabs"
          role="tablist"
          aria-label="Organization sub-views"
        >
          {SUB_VIEWS.map((v) => {
            const active = v.id === view;
            return (
              <button
                key={v.id}
                type="button"
                role="tab"
                aria-selected={active}
                className={`organizational-dashboard__tab${active ? ' organizational-dashboard__tab--active' : ''}`}
                onClick={() => handleSelect(v.id)}
              >
                <span aria-hidden="true">{v.icon}</span> {v.label}
              </button>
            );
          })}
        </div>
      </header>

      <main className="organizational-dashboard__content">
        {view === 'team' && (
          <OrganizationalErrorBoundary>
            <TeamView />
          </OrganizationalErrorBoundary>
        )}
        {view === 'policy' && (
          <OrganizationalErrorBoundary>
            <PolicyView />
          </OrganizationalErrorBoundary>
        )}
        {view === 'session' && (
          <OrganizationalErrorBoundary>
            <SessionView />
          </OrganizationalErrorBoundary>
        )}
        {view === 'activity' && (
          <OrganizationalErrorBoundary>
            <ActivityView />
          </OrganizationalErrorBoundary>
        )}
        {view === 'performance' && (
          <OrganizationalErrorBoundary>
            <PerformanceView />
          </OrganizationalErrorBoundary>
        )}
      </main>
    </div>
  );
}

function TeamView(): JSX.Element {
  const ctx = useOrganizationalContext();
  const selectedTeamId = ctx.state.teamFilter.selectedTeamId;

  return (
    <section className="organizational-view">
      <h2>Team</h2>
      <div className="organizational-view__controls">
        <TeamFilterDropdown
          selectedTeamId={selectedTeamId}
          onTeamChange={(teamId) => {
            if (teamId) ctx.setTeamFilter(teamId);
            else ctx.clearTeamFilter();
          }}
        />
      </div>
      <PendingDataLayerNote
        components={[
          'TeamActivityOverview',
          'TeamPerformanceMetrics',
          'TeamComparisonView',
          'DashboardTeamFilterIntegration',
        ]}
        requires="OrganizationalTrace[]"
      />
    </section>
  );
}

function PolicyView(): JSX.Element {
  const ctx = useOrganizationalContext();
  const selectedTeamId = ctx.state.teamFilter.selectedTeamId;

  return (
    <section className="organizational-view">
      <h2>Policy</h2>
      <GovernanceRecommendations />
      <PolicyConfigurationView teamId={selectedTeamId} />
      <PendingDataLayerNote
        components={['PolicyStatusIndicator', 'PolicyComplianceCard', 'PolicyHistoryView']}
        requires="PolicyStatus"
      />
    </section>
  );
}

function SessionView(): JSX.Element {
  return (
    <section className="organizational-view">
      <h2>Session</h2>
      <PendingDataLayerNote
        components={[
          'SessionHookVisualizer',
          'SessionCorrelationChain',
          'OrganizationalBriefingDisplay',
          'CrossInstanceSessionTracker',
          'SessionSimilarityAnalyzer',
          'TemporalSessionClustering',
          'OperatorCollaborationIndicators',
        ]}
        requires="SessionCorrelation"
      />
    </section>
  );
}

function ActivityView(): JSX.Element {
  return (
    <section className="organizational-view">
      <h2>Activity</h2>
      <PendingDataLayerNote
        components={[
          'OperatorTimelineView',
          'MultiOperatorComparison',
          'WorkflowPatternIdentifier',
          'ProblemSolvingPatternAnalysis',
          'TeamCollaborationTimeline',
          'ProductivityInsights',
          'CollaborationOpportunityIdentifier',
        ]}
        requires="SessionCorrelation"
      />
    </section>
  );
}

function PerformanceView(): JSX.Element {
  const ctx = useOrganizationalContext();
  const selectedTeamId = ctx.state.teamFilter.selectedTeamId;

  return (
    <section className="organizational-view">
      <h2>Performance</h2>
      <TeamQueryPerformanceChart teamId={selectedTeamId} />
      <CacheEfficiencyVisualizer teamId={selectedTeamId} />
      <OrganizationalIntelligenceMetrics teamId={selectedTeamId} />
    </section>
  );
}

function PendingDataLayerNote(props: { components: string[]; requires: string }): JSX.Element {
  return (
    <div className="organizational-pending">
      <p>
        Components awaiting the data-plumbing follow-up:{' '}
        <strong>{props.components.join(', ')}</strong>
      </p>
      <p>
        These accept a <code>{props.requires}</code> prop that no existing hook currently produces.
        A follow-up change adds the adapter that sources this data from the trace API and makes them
        renderable here.
      </p>
    </div>
  );
}

export default OrganizationalDashboard;
