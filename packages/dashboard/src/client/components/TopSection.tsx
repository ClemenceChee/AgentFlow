import { useMemo } from 'react';
import type { AgentStats, GroupedAgents } from '../hooks/useAgents';
import type { ProcessHealthData, ServiceAudit } from '../hooks/useProcessHealth';

function fmtCompact(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(0)}s`;
  return `${(ms / 60000).toFixed(0)}m`;
}

function fmtAgo(ts: number): string {
  const d = Date.now() - ts;
  if (d < 60000) return 'now';
  if (d < 3600000) return `${Math.floor(d / 60000)}m`;
  if (d < 86400000) return `${Math.floor(d / 3600000)}h`;
  return `${Math.floor(d / 86400000)}d`;
}

interface Props {
  processHealth: ProcessHealthData | null;
  grouped: GroupedAgents | null;
  selectedAgent: string | null;
  onSelectAgent: (agentId: string) => void;
}

// Page header component
function PageHeader({
  title,
  subtitle,
  eyebrow,
  children,
}: {
  title: string;
  subtitle: string;
  eyebrow: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="top-section__header">
      <div className="top-section__eyebrow">{eyebrow}</div>
      <div className="top-section__title-row">
        <h1 className="top-section__title">{title}</h1>
        <div className="top-section__actions">{children}</div>
      </div>
      <p className="top-section__subtitle">{subtitle}</p>
    </header>
  );
}

// KPI component
function Kpi({ label, value, unit }: { label: string; value: string | number; unit?: string }) {
  return (
    <div className="kpi">
      <div className="kpi__label">{label}</div>
      <div className="kpi__value">
        {value}
        {unit && <span className="kpi__unit">{unit}</span>}
      </div>
    </div>
  );
}

// KPI Row component
function KpiRow({ children }: { children: React.ReactNode }) {
  return <div className="kpi-row">{children}</div>;
}

// Service status badge
function ServiceBadge({ service }: { service: ServiceAudit }) {
  const active =
    service.systemd?.activeState === 'active' ||
    (service.pidFile?.alive && service.pidFile.matchesProcess);
  const failed = service.systemd?.failed;

  const kind = failed ? 'fail' : active ? 'ok' : 'warn';
  const label = service.name || 'unknown';

  return <span className={`badge badge--${kind}`}>{label}</span>;
}

// Simplified agent card
function AgentCard({
  agent,
  selected,
  onClick,
}: {
  agent: AgentStats;
  selected: boolean;
  onClick: () => void;
}) {
  const hasFailures = agent.failedExecutions > 0;
  const name = agent.displayName ?? agent.agentId;

  return (
    <button
      type="button"
      className={`top-section__agent-card ${selected ? 'top-section__agent-card--selected' : ''}`}
      onClick={onClick}
    >
      <div className="top-section__agent-card-header">
        <span className={`dot dot--${hasFailures ? 'fail' : 'ok'}`} />
        <span className="top-section__agent-name">{name}</span>
        <span
          className={`top-section__agent-success ${agent.successRate < 95 ? 'top-section__agent-success--warn' : ''}`}
        >
          {agent.successRate.toFixed(0)}%
        </span>
      </div>
      <div className="top-section__agent-meta">
        <span className="top-section__agent-stat">{agent.totalExecutions} exec</span>
        <span className="top-section__agent-stat">{fmtCompact(agent.avgExecutionTime)} avg</span>
        <span className="top-section__agent-stat">{fmtAgo(agent.lastExecution)} ago</span>
      </div>
    </button>
  );
}

export function TopSection({ processHealth, grouped, selectedAgent, onSelectAgent }: Props) {
  // Calculate fleet KPIs
  const fleetStats = useMemo(() => {
    if (!grouped) {
      return {
        totalAgents: 0,
        activeNow: 0,
        successRate: 0,
        failedExecutions: 0,
        servicesUp: 0,
        avgResponse: 0,
      };
    }

    const allAgents = grouped.groups.flatMap((g) => g.agents);
    const now = Date.now();
    const activeNow = allAgents.filter((a) => now - a.lastExecution < 5 * 60 * 1000).length;

    const totalExec = allAgents.reduce((sum, a) => sum + a.totalExecutions, 0);
    const successfulExec = allAgents.reduce((sum, a) => sum + a.successfulExecutions, 0);
    const successRate = totalExec > 0 ? (successfulExec / totalExec) * 100 : 0;

    const failedExecutions = allAgents.reduce((sum, a) => sum + a.failedExecutions, 0);
    const avgResponse =
      totalExec > 0
        ? allAgents.reduce((sum, a) => sum + a.avgExecutionTime * a.totalExecutions, 0) / totalExec
        : 0;

    const servicesUp =
      processHealth?.services.filter(
        (s) =>
          s.systemd?.activeState === 'active' || (s.pidFile?.alive && s.pidFile.matchesProcess),
      ).length ?? 0;

    return {
      totalAgents: allAgents.length,
      activeNow,
      successRate,
      failedExecutions,
      servicesUp,
      avgResponse,
    };
  }, [grouped, processHealth]);

  // Flatten all agents for display
  const allAgents = useMemo(() => {
    if (!grouped) return [];
    return grouped.groups.flatMap((g) => g.agents);
  }, [grouped]);

  const handleRefresh = () => {
    window.location.reload();
  };

  return (
    <div className="top-section">
      <PageHeader
        eyebrow="AGENTFLOW · AGENTS"
        title="Fleet overview"
        subtitle="Active agents · health monitoring · process telemetry · zero LLM cost"
      >
        <button
          type="button"
          className="btn btn--secondary"
          onClick={handleRefresh}
          title="Refresh data"
        >
          ↻
        </button>
      </PageHeader>

      <KpiRow>
        <Kpi label="TOTAL AGENTS" value={fleetStats.totalAgents} />
        <Kpi label="ACTIVE NOW" value={fleetStats.activeNow} />
        <Kpi label="SUCCESS RATE" value={fleetStats.successRate.toFixed(1)} unit="%" />
        <Kpi label="FAILED EXECUTIONS" value={fleetStats.failedExecutions} />
        <Kpi label="SERVICES UP" value={fleetStats.servicesUp} />
        <Kpi label="AVG RESPONSE" value={fmtCompact(fleetStats.avgResponse)} />
      </KpiRow>

      {processHealth?.services && processHealth.services.length > 0 && (
        <div className="card">
          <div className="card__header">
            <h3 className="card__title">SERVICES</h3>
          </div>
          <div className="top-section__services">
            {processHealth.services.map((service) => (
              <ServiceBadge key={service.name || `p${service.pidFile?.pid}`} service={service} />
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <div className="card__header">
          <h3 className="card__title">AGENTS</h3>
          <div className="card__subtitle">{allAgents.length} registered</div>
        </div>
        <div className="top-section__agent-grid">
          {allAgents.map((agent) => (
            <AgentCard
              key={agent.agentId}
              agent={agent}
              selected={selectedAgent === agent.agentId}
              onClick={() => onSelectAgent(agent.agentId)}
            />
          ))}
          {allAgents.length === 0 && (
            <div className="empty-state">
              <p>No agents registered.</p>
              <p>Run the pipeline to create profiles.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
