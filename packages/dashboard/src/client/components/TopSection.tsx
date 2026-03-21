import { useMemo, useState } from 'react';
import type { AgentGroup, AgentStats, GroupedAgents } from '../hooks/useAgents';
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

// --- Enriched service chip with health info ---
function ServiceChip({ svc }: { svc: ServiceAudit }) {
  const active =
    svc.systemd?.activeState === 'active' || (svc.pidFile?.alive && svc.pidFile.matchesProcess);
  const failed = svc.systemd?.failed;
  const cls = failed ? 'chip--fail' : active ? 'chip--ok' : 'chip--off';
  const pid = svc.pidFile?.pid ?? svc.systemd?.mainPid;
  const cpu = svc.metrics?.cpu;
  const uptime = svc.metrics?.elapsed;

  return (
    <span className={`schip ${cls}`}>
      <span className={`dot ${failed ? 'dot--fail' : active ? 'dot--ok' : 'dot--warn'}`} />
      <span className="schip__name">{svc.name || `PID:${pid}`}</span>
      {pid && <span className="schip__detail">:{pid}</span>}
      {cpu && <span className="schip__detail">{cpu}%</span>}
      {uptime && (
        <span className="schip__detail">
          {'\u2191'}
          {uptime}
        </span>
      )}
      {svc.systemd && !active && <span className="schip__state">{svc.systemd.subState}</span>}
    </span>
  );
}

// --- Infrastructure process chip ---
function InfraChip({
  proc,
}: {
  proc: { pid: number; cpu: string; mem: string; command: string; cmdline: string };
}) {
  const name = proc.cmdline.includes('milvus')
    ? 'milvus'
    : (proc.command.split('/').pop()?.split(' ')[0] ?? `PID:${proc.pid}`);
  return (
    <span className="schip schip--infra">
      <span className="dot dot--ok" />
      <span className="schip__name">{name}</span>
      <span className="schip__detail">:{proc.pid}</span>
      <span className="schip__detail">{proc.cpu}%</span>
    </span>
  );
}

// --- Agent card ---
function AgentCard({
  agent,
  selected,
  onClick,
}: {
  agent: AgentStats;
  selected: boolean;
  onClick: () => void;
}) {
  const fail = agent.failedExecutions > 0;
  const name = agent.displayName ?? agent.agentId;
  const source = agent.adapterSource;

  return (
    <button
      className={`acard ${fail ? 'acard--fail' : ''} ${selected ? 'acard--sel' : ''}`}
      onClick={onClick}
    >
      <div className="acard__r1">
        <span className={`dot ${fail ? 'dot--fail' : 'dot--ok'}`} />
        {source && source !== 'agentflow' && <span className="acard__source">{source}</span>}
        <span className="acard__name">{name}</span>
        <span className={`acard__pct ${agent.successRate < 95 ? 'acard__pct--warn' : ''}`}>
          {agent.successRate.toFixed(0)}%
        </span>
      </div>
      <div className="acard__r2">
        <span>
          <b>{agent.totalExecutions}</b> exec
        </span>
        {fail && <span className="acard__failn">{agent.failedExecutions} fail</span>}
        <span>{fmtCompact(agent.avgExecutionTime)} avg</span>
        <span>{fmtAgo(agent.lastExecution)} ago</span>
        {agent.sources && agent.sources.length > 1 && (
          <span className="acard__merged">{agent.sources.length} src</span>
        )}
      </div>
    </button>
  );
}

// --- Worker card (from process health, no traces needed) ---
function WorkerChip({
  worker,
}: {
  worker: {
    name: string;
    pid: number | null;
    alive: boolean;
    stale: boolean;
    declaredStatus: string;
  };
}) {
  const cls = worker.alive ? 'ok' : worker.stale ? 'fail' : 'warn';
  return (
    <span className={`schip schip--worker schip--${cls}`}>
      <span className={`dot dot--${cls}`} />
      <span className="schip__name">{worker.name}</span>
      {worker.pid && <span className="schip__detail">:{worker.pid}</span>}
      <span className="schip__state">
        {worker.alive ? 'up' : worker.stale ? 'dead' : worker.declaredStatus}
      </span>
    </span>
  );
}

// --- Group section with service info ---
function GroupSection({
  group,
  selectedAgent,
  onSelectAgent,
  serviceInfo,
  workers,
}: {
  group: AgentGroup;
  selectedAgent: string | null;
  onSelectAgent: (id: string) => void;
  serviceInfo?: ServiceAudit;
  workers?: {
    name: string;
    pid: number | null;
    alive: boolean;
    stale: boolean;
    declaredStatus: string;
  }[];
}) {
  const [collapsed, setCollapsed] = useState(false);
  const agentById = new Map(group.agents.map((a) => [a.agentId, a]));
  const renderedIds = new Set<string>();

  // Find workers that don't have matching agent cards (like surveyor)
  const unmatchedWorkers = (workers ?? []).filter((w) => {
    const hasAgent = group.agents.some(
      (a) =>
        a.agentId === w.name ||
        a.displayName === w.name ||
        a.agentId.endsWith(w.name) ||
        (a.sources ?? []).some((s) => s.includes(w.name)),
    );
    return !hasAgent;
  });

  return (
    <div className="agroup">
      <button className="agroup__head" onClick={() => setCollapsed(!collapsed)}>
        <span className="agroup__expand">{collapsed ? '\u25B6' : '\u25BC'}</span>
        <span className="agroup__name">{group.displayName}</span>
        <span className="agroup__stats">
          {group.totalExecutions} exec
          {group.failedExecutions > 0 && (
            <span className="agroup__fail"> {group.failedExecutions}!</span>
          )}
        </span>
        {serviceInfo && (
          <span
            className={`agroup__svc ${serviceInfo.systemd?.activeState === 'active' ? 'agroup__svc--ok' : ''}`}
          >
            {serviceInfo.systemd?.activeState ?? 'unknown'}
            {serviceInfo.metrics && (
              <>
                {' '}
                &middot; CPU {serviceInfo.metrics.cpu}% &middot; {'\u2191'}
                {serviceInfo.metrics.elapsed}
              </>
            )}
          </span>
        )}
        <span className="agroup__count">{group.agents.length}</span>
      </button>
      {!collapsed && (
        <div className="agroup__body">
          {group.subGroups.map((sg) => {
            const sgAgents = sg.agentIds
              .map((id) => agentById.get(id))
              .filter(Boolean) as AgentStats[];
            if (sgAgents.length === 0) return null;
            for (const a of sgAgents) renderedIds.add(a.agentId);
            return (
              <div key={sg.name} className="asubgroup">
                {group.subGroups.length > 1 && <div className="asubgroup__label">{sg.name}</div>}
                <div className="asubgroup__cards">
                  {sgAgents.map((a) => (
                    <AgentCard
                      key={a.agentId}
                      agent={a}
                      selected={selectedAgent === a.agentId}
                      onClick={() => onSelectAgent(a.agentId)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
          {/* Unmatched agents */}
          {group.agents.filter((a) => !renderedIds.has(a.agentId)).length > 0 && (
            <div className="asubgroup">
              <div className="asubgroup__cards">
                {group.agents
                  .filter((a) => !renderedIds.has(a.agentId))
                  .map((a) => (
                    <AgentCard
                      key={a.agentId}
                      agent={a}
                      selected={selectedAgent === a.agentId}
                      onClick={() => onSelectAgent(a.agentId)}
                    />
                  ))}
              </div>
            </div>
          )}
          {/* Workers without trace data (like surveyor) */}
          {unmatchedWorkers.length > 0 && (
            <div className="asubgroup">
              <div className="asubgroup__label">Workers (no traces)</div>
              <div className="asubgroup__cards">
                {unmatchedWorkers.map((w) => (
                  <WorkerChip key={w.name} worker={w} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function TopSection({ processHealth, grouped, selectedAgent, onSelectAgent }: Props) {
  const infraProcs = useMemo(() => {
    if (!processHealth) return [];
    const knownPids = new Set<number>();
    for (const s of processHealth.services) {
      if (s.pidFile?.pid) knownPids.add(s.pidFile.pid);
      if (s.systemd?.mainPid) knownPids.add(s.systemd.mainPid);
      if (s.workers) for (const w of s.workers.workers) if (w.pid) knownPids.add(w.pid);
    }
    return processHealth.osProcesses.filter(
      (p) =>
        !knownPids.has(p.pid) &&
        !p.command.includes('tsx ') &&
        !p.command.includes('npm ') &&
        !p.command.includes('sh -c') &&
        parseFloat(p.cpu) > 0,
    );
  }, [processHealth]);

  // Match services to groups by name patterns
  const findServiceForGroup = (groupName: string): ServiceAudit | undefined => {
    if (!processHealth) return undefined;
    const lower = groupName.toLowerCase();
    return processHealth.services.find((s) => {
      const sLower = s.name.toLowerCase();
      return sLower.includes(lower) || lower.includes(sLower);
    });
  };

  // Find workers for a group
  const findWorkersForGroup = (groupName: string) => {
    if (!processHealth) return undefined;
    for (const s of processHealth.services) {
      if (s.workers && s.workers.workers.length > 0) {
        const sLower = s.name.toLowerCase();
        const gLower = groupName.toLowerCase();
        if (sLower.includes(gLower) || gLower.includes(sLower) || gLower === 'agentflow') {
          return s.workers.workers;
        }
      }
    }
    return undefined;
  };

  return (
    <div className="top-section">
      {/* Services & Infrastructure */}
      <div className="chip-row">
        <span className="chip-row__label">Services & Infrastructure</span>
        {processHealth?.services.map((s) => (
          <ServiceChip key={s.name || `p${s.pidFile?.pid}`} svc={s} />
        ))}
        {infraProcs.map((p) => (
          <InfraChip key={p.pid} proc={p} />
        ))}
      </div>

      {/* Agent Sessions */}
      {grouped?.groups.map((group) => (
        <GroupSection
          key={group.name}
          group={group}
          selectedAgent={selectedAgent}
          onSelectAgent={onSelectAgent}
          serviceInfo={findServiceForGroup(group.name)}
          workers={findWorkersForGroup(group.name)}
        />
      ))}
    </div>
  );
}
