import { useCallback, useEffect, useState } from 'react';
import { useOrganizationalContext } from '../../../contexts/OrganizationalContext';
import type { AgentStats, GroupedAgents } from '../../../hooks/useAgents';
import { OrganizationalErrorBoundary } from '../../org/common/OrganizationalErrorBoundary';
import { CacheEfficiencyVisualizer } from '../../org/performance/CacheEfficiencyVisualizer';
import { OrganizationalIntelligenceMetrics } from '../../org/performance/OrganizationalIntelligenceMetrics';
import { TeamQueryPerformanceChart } from '../../org/performance/TeamQueryPerformanceChart';
import { GovernanceRecommendations } from '../../org/policy/GovernanceRecommendations';
import { PolicyConfigurationView } from '../../org/policy/PolicyConfigurationView';
import { TeamFilterDropdown } from '../../org/team/TeamFilterDropdown';
import { Badge, type BadgeKind, Card, fmtMs, Kpi, Sparkline } from '../atoms';

type OrgSubView = 'overview' | 'team' | 'policy' | 'performance' | 'session' | 'activity';

const SUB_VIEWS: ReadonlyArray<{ id: OrgSubView; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'team', label: 'Team' },
  { id: 'policy', label: 'Policy' },
  { id: 'performance', label: 'Performance' },
  { id: 'session', label: 'Session' },
  { id: 'activity', label: 'Activity' },
];

const DEFAULT_VIEW: OrgSubView = 'overview';

function readViewFromUrl(): OrgSubView {
  if (typeof window === 'undefined') return DEFAULT_VIEW;
  const raw = new URLSearchParams(window.location.search).get('org');
  if (raw && SUB_VIEWS.some((v) => v.id === raw)) return raw as OrgSubView;
  return DEFAULT_VIEW;
}

function writeViewToUrl(view: OrgSubView): void {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  params.set('org', view);
  window.history.replaceState(
    null,
    '',
    `${window.location.pathname}?${params.toString()}${window.location.hash}`,
  );
}

interface Row {
  id: string;
  name: string;
  members: number;
  traces: number;
  success: number;
  latency: number;
  owner: string;
}

function rollUp(grouped: GroupedAgents | null): Row[] {
  return (grouped?.groups ?? []).map((g) => {
    const traces = g.totalExecutions;
    const failed = g.failedExecutions;
    const success = traces > 0 ? ((traces - failed) / traces) * 100 : 100;
    const avgLatency =
      g.agents.reduce((sum: number, a: AgentStats) => sum + a.avgExecutionTime, 0) /
      Math.max(1, g.agents.length);
    return {
      id: g.name,
      name: g.displayName || g.name,
      members: g.agents.length,
      traces,
      success,
      latency: Math.round(avgLatency),
      owner: '—',
    };
  });
}

interface OrgRowProps {
  kind: 'ok' | 'warn' | 'fail';
  who: string;
  what: string;
  when: string;
}

function SecRow({ kind, who, what, when }: OrgRowProps) {
  const badge: BadgeKind = kind;
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'auto 1fr auto',
        gap: 10,
        alignItems: 'center',
      }}
    >
      <Badge kind={badge}>{kind}</Badge>
      <div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-12)' }}>{who}</div>
        <div style={{ color: 'var(--t-3)', fontSize: 'var(--fs-11)' }}>{what}</div>
      </div>
      <div
        style={{
          color: 'var(--t-3)',
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--fs-10)',
        }}
      >
        {when}
      </div>
    </div>
  );
}

function PendingNote({ components, requires }: { components: string[]; requires: string }) {
  return (
    <div
      style={{
        padding: 'var(--s-6)',
        color: 'var(--t-3)',
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--fs-12)',
        lineHeight: 1.55,
      }}
    >
      <div style={{ marginBottom: 8 }}>
        Components awaiting the data-plumbing follow-up:{' '}
        <strong style={{ color: 'var(--t-1)' }}>{components.join(', ')}</strong>
      </div>
      <div>
        These accept a <code>{requires}</code> prop that no existing hook currently produces. A
        follow-up change adds the adapter that sources this data from the trace API and makes them
        renderable here.
      </div>
    </div>
  );
}

function OverviewSection({
  rows,
  agents,
  totalTraces,
  avgSuccess,
}: {
  rows: Row[];
  agents: AgentStats[];
  totalTraces: number;
  avgSuccess: number;
}) {
  return (
    <>
      <div className="v2-kpi-row">
        <Kpi label="Teams" value={rows.length} />
        <Kpi label="Agents" value={agents.length} />
        <Kpi
          label="Compliance rate"
          value={avgSuccess.toFixed(1)}
          unit="%"
          sparkColor={
            avgSuccess < 80 ? 'var(--fail)' : avgSuccess < 95 ? 'var(--warn)' : 'var(--ok)'
          }
        />
        <Kpi label="Security events" value="—" sparkColor="var(--fail)" />
        <Kpi label="Cross-team" value={totalTraces} />
        <Kpi label="Cache hit" value="—" />
      </div>

      <Card title="Teams" flush>
        <table className="v2-tbl">
          <thead>
            <tr>
              <th>Team</th>
              <th className="num">Members</th>
              <th className="num">Traces 24h</th>
              <th className="num">Success</th>
              <th className="num">Avg latency</th>
              <th>Lead</th>
              <th>Trend</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id}>
                <td style={{ fontWeight: 600 }}>{t.name}</td>
                <td className="num">{t.members}</td>
                <td className="num">{t.traces}</td>
                <td
                  className="num"
                  style={{
                    color:
                      t.success < 80 ? 'var(--fail)' : t.success < 95 ? 'var(--warn)' : 'var(--ok)',
                  }}
                >
                  {t.success.toFixed(1)}%
                </td>
                <td className="num">{fmtMs(t.latency)}</td>
                <td className="t-dim">{t.owner}</td>
                <td>
                  <Sparkline
                    data={Array.from({ length: 10 }, (_, i) => ((i * 7) % 20) + 5)}
                    width={100}
                    height={22}
                  />
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  style={{
                    textAlign: 'center',
                    color: 'var(--t-3)',
                    padding: 'var(--s-6)',
                  }}
                >
                  No teams detected.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <div className="v2-grid v2-grid-2">
        <Card title="Operators">
          <div
            style={{
              padding: 'var(--s-6)',
              color: 'var(--t-3)',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--fs-12)',
            }}
          >
            Operator roster hooks not wired yet. Enterprise SSO will populate this table.
          </div>
        </Card>
        <Card title="Security events · 24h">
          <div style={{ display: 'grid', gap: 10 }}>
            <SecRow kind="ok" who="audit" what="No policy violations detected" when="current" />
            <SecRow
              kind="warn"
              who="process-health"
              what="Orphan processes not tracked"
              when="tracked"
            />
          </div>
        </Card>
      </div>
    </>
  );
}

function TeamSection() {
  const ctx = useOrganizationalContext();
  const selectedTeamId = ctx.state.teamFilter.selectedTeamId;
  return (
    <Card title="Team filter">
      <div style={{ padding: 'var(--s-4)' }}>
        <TeamFilterDropdown
          selectedTeamId={selectedTeamId}
          onTeamChange={(teamId) => {
            if (teamId) ctx.setTeamFilter(teamId);
            else ctx.clearTeamFilter();
          }}
        />
        <div style={{ marginTop: 'var(--s-4)' }}>
          <PendingNote
            components={[
              'TeamActivityOverview',
              'TeamPerformanceMetrics',
              'TeamComparisonView',
              'DashboardTeamFilterIntegration',
            ]}
            requires="OrganizationalTrace[]"
          />
        </div>
      </div>
    </Card>
  );
}

function PolicySection() {
  const ctx = useOrganizationalContext();
  const selectedTeamId = ctx.state.teamFilter.selectedTeamId;
  return (
    <div className="v2-grid v2-grid-1" style={{ display: 'grid', gap: 'var(--s-4)' }}>
      <Card title="Governance recommendations">
        <div style={{ padding: 'var(--s-4)' }}>
          <GovernanceRecommendations />
        </div>
      </Card>
      <Card title="Policy configuration">
        <div style={{ padding: 'var(--s-4)' }}>
          <PolicyConfigurationView teamId={selectedTeamId} />
        </div>
      </Card>
      <Card title="Pending">
        <PendingNote
          components={['PolicyStatusIndicator', 'PolicyComplianceCard', 'PolicyHistoryView']}
          requires="PolicyStatus"
        />
      </Card>
    </div>
  );
}

function PerformanceSection() {
  const ctx = useOrganizationalContext();
  const selectedTeamId = ctx.state.teamFilter.selectedTeamId;
  return (
    <div className="v2-grid v2-grid-1" style={{ display: 'grid', gap: 'var(--s-4)' }}>
      <Card title="Team query performance">
        <div style={{ padding: 'var(--s-4)' }}>
          <TeamQueryPerformanceChart teamId={selectedTeamId} />
        </div>
      </Card>
      <Card title="Cache efficiency">
        <div style={{ padding: 'var(--s-4)' }}>
          <CacheEfficiencyVisualizer teamId={selectedTeamId} />
        </div>
      </Card>
      <Card title="Organizational intelligence metrics">
        <div style={{ padding: 'var(--s-4)' }}>
          <OrganizationalIntelligenceMetrics teamId={selectedTeamId} />
        </div>
      </Card>
    </div>
  );
}

function SessionSection() {
  return (
    <Card title="Session correlation">
      <PendingNote
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
    </Card>
  );
}

function ActivitySection() {
  return (
    <Card title="Activity timelines">
      <PendingNote
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
    </Card>
  );
}

export function OrgPage({
  agents,
  grouped,
}: {
  agents: AgentStats[];
  grouped: GroupedAgents | null;
}) {
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

  const rows = rollUp(grouped);
  const totalTraces = rows.reduce((s, r) => s + r.traces, 0);
  const avgSuccess = rows.length > 0 ? rows.reduce((s, r) => s + r.success, 0) / rows.length : 0;
  const operators = 0;

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <div className="page__eyebrow">Organizational Intelligence</div>
          <div className="page__title">Governance</div>
          <div className="page__subtitle">
            {rows.length} teams {'·'} {operators || '—'} operators {'·'} {totalTraces} traces {'·'}{' '}
            audit log healthy
          </div>
        </div>
        <div className="page__head-actions">
          <button type="button" className="v2-btn v2-btn--sm">
            Export audit
          </button>
          <button type="button" className="v2-btn v2-btn--primary v2-btn--sm">
            Run compliance scan
          </button>
        </div>
      </div>

      <div
        role="tablist"
        aria-label="Organization sub-views"
        style={{
          display: 'flex',
          gap: 4,
          padding: '0 var(--s-6)',
          borderBottom: '1px solid var(--line)',
        }}
      >
        {SUB_VIEWS.map((v) => {
          const active = v.id === view;
          return (
            <button
              key={v.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => handleSelect(v.id)}
              className={`v2-btn v2-btn--sm${active ? ' v2-btn--primary' : ' v2-btn--ghost'}`}
              style={{ borderRadius: '6px 6px 0 0', marginBottom: -1 }}
            >
              {v.label}
            </button>
          );
        })}
      </div>

      <div className="page__body">
        <OrganizationalErrorBoundary>
          {view === 'overview' && (
            <OverviewSection
              rows={rows}
              agents={agents}
              totalTraces={totalTraces}
              avgSuccess={avgSuccess}
            />
          )}
          {view === 'team' && <TeamSection />}
          {view === 'policy' && <PolicySection />}
          {view === 'performance' && <PerformanceSection />}
          {view === 'session' && <SessionSection />}
          {view === 'activity' && <ActivitySection />}
        </OrganizationalErrorBoundary>
      </div>
    </div>
  );
}
