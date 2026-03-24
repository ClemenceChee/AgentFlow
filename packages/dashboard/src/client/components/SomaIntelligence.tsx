import { useEffect, useState } from 'react';
import type { SomaReport } from '../hooks/useSomaReport';
import { EfficiencyPanel, EfficiencyTeaser } from './EfficiencyPanel';
import { GuardExplanationCard } from './GuardExplanationCard';

// Types for vault health data
interface VaultHealthData {
  l4_canon_policies: number;
  l3_emerging_proposals: number;
  l2_working_entries: number;
  l1_archive_entities: number;
  last_worker_run?: {
    harvester?: number;
    reconciler?: number;
    synthesizer?: number;
    cartographer?: number;
  };
}

// Hook to fetch vault health data
function useVaultHealth(): VaultHealthData | null {
  const [vaultHealth, setVaultHealth] = useState<VaultHealthData | null>(null);

  useEffect(() => {
    // Mock data for now - in real implementation, this would fetch from API
    // TODO: Replace with actual API call to /api/external/commands or SOMA data endpoint
    const mockData: VaultHealthData = {
      l4_canon_policies: 47,
      l3_emerging_proposals: 12,
      l2_working_entries: 156,
      l1_archive_entities: 6870,
      last_worker_run: {
        harvester: Date.now() - 23 * 60 * 1000, // 23min ago
        reconciler: Date.now() - 47 * 60 * 1000, // 47min ago
        synthesizer: Date.now() - 2.1 * 60 * 60 * 1000, // 2.1h ago
        cartographer: Date.now() - 15 * 60 * 1000, // 15min ago
      },
    };
    setVaultHealth(mockData);
  }, []);

  return vaultHealth;
}

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

// Vault Health Indicators component
function VaultHealthIndicators({ vaultHealth }: { vaultHealth: VaultHealthData | null }) {
  if (!vaultHealth) return null;

  const formatNumber = (num: number): string => {
    if (num > 1000) return `${Math.floor(num / 1000)}k+`;
    return num.toString();
  };

  const layerData = [
    {
      key: 'l4_canon',
      label: 'L4 Canon',
      count: vaultHealth.l4_canon_policies,
      color: '#3fb950',
      suffix: 'policies active',
    },
    {
      key: 'l3_emerging',
      label: 'L3 Emerging',
      count: vaultHealth.l3_emerging_proposals,
      color: '#58a6ff',
      suffix: 'proposals pending',
    },
    {
      key: 'l2_working',
      label: 'L2 Working',
      count: vaultHealth.l2_working_entries,
      color: '#d29922',
      suffix: 'context entries',
    },
    {
      key: 'l1_archive',
      label: 'L1 Archive',
      count: vaultHealth.l1_archive_entities,
      color: '#8b949e',
      suffix: 'entities',
    },
  ];

  return (
    <div className="soma-intel__vault-health">
      <div className="soma-intel__vault-health-title">📊 Vault Health Indicators</div>
      <div className="soma-intel__vault-layers">
        {layerData.map((layer, index) => (
          <span key={layer.key}>
            <span
              style={{
                color: layer.color,
                fontWeight: 600,
                fontSize: 12,
              }}
            >
              {layer.label}: {formatNumber(layer.count)} {layer.suffix}
            </span>
            {index < layerData.length - 1 && (
              <span style={{ margin: '0 8px', color: '#8b949e' }}>→</span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

// Live Intelligence Pipeline Status component
function PipelineStatus({ vaultHealth }: { vaultHealth: VaultHealthData | null }) {
  const [showDetails, setShowDetails] = useState(false);

  if (!vaultHealth?.last_worker_run) return null;

  const workers = [
    { name: 'Harvester', interval: '60s', lastRun: vaultHealth.last_worker_run.harvester },
    { name: 'Reconciler', interval: '5min', lastRun: vaultHealth.last_worker_run.reconciler },
    { name: 'Synthesizer', interval: '1hr', lastRun: vaultHealth.last_worker_run.synthesizer },
    {
      name: 'Cartographer',
      interval: 'on-change',
      lastRun: vaultHealth.last_worker_run.cartographer,
    },
  ];

  const latestUpdate = Math.max(...workers.map((w) => w.lastRun || 0));
  const staleness = latestUpdate ? timeAgo(new Date(latestUpdate).toISOString()) : 'never';

  return (
    <div className="soma-intel__pipeline">
      <button
        type="button"
        className="soma-intel__pipeline-summary"
        style={{ cursor: 'pointer', background: 'none', border: 'none', padding: 0, textAlign: 'left', width: '100%' }}
        onClick={() => setShowDetails(!showDetails)}
      >
        🔄 Live Intelligence Pipeline Status
        <span style={{ marginLeft: 8, fontSize: 12, color: '#8b949e' }}>
          Insights last updated {staleness} <span style={{ fontSize: 10 }}>▼</span>
        </span>
      </div>

      {showDetails && (
        <div className="soma-intel__worker-details">
          <div className="soma-intel__worker-grid">
            {workers.map((worker) => (
              <div key={worker.name} className="soma-intel__worker">
                <div className="soma-intel__worker-name">{worker.name}</div>
                <div className="soma-intel__worker-interval">({worker.interval})</div>
                <div className="soma-intel__worker-status">
                  {worker.lastRun ? timeAgo(new Date(worker.lastRun).toISOString()) : 'never'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Smart Actions component
function SmartActions() {
  const [refreshing, setRefreshing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

  const handleRefreshIntelligence = async () => {
    setRefreshing(true);
    try {
      // TODO: Call external command API to trigger SOMA workers
      // await fetch('/api/external/commands/execute', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ command: 'refresh-soma-intelligence' }),
      // });

      // Mock delay for demo
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch (error) {
      console.error('Failed to refresh intelligence:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const handleDeepAnalysis = async () => {
    setAnalyzing(true);
    try {
      // TODO: Call external command API for deep analysis
      // Mock delay for demo
      await new Promise((resolve) => setTimeout(resolve, 1500));
    } catch (error) {
      console.error('Failed to start deep analysis:', error);
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="soma-intel__smart-actions">
      <div className="soma-intel__smart-actions-title">⚡ Smart Actions</div>
      <div className="soma-intel__action-buttons">
        <button
          className="soma-intel__action-btn"
          onClick={handleRefreshIntelligence}
          disabled={refreshing}
          style={{
            backgroundColor: refreshing ? '#8b949e' : '#3fb950',
            color: 'white',
            border: 'none',
            borderRadius: 4,
            padding: '6px 12px',
            fontSize: 12,
            cursor: refreshing ? 'not-allowed' : 'pointer',
            marginRight: 8,
          }}
        >
          {refreshing ? '⟳ Refreshing...' : 'Refresh Intelligence'}
        </button>

        <button
          className="soma-intel__action-btn"
          onClick={handleDeepAnalysis}
          disabled={analyzing}
          style={{
            backgroundColor: analyzing ? '#8b949e' : '#58a6ff',
            color: 'white',
            border: 'none',
            borderRadius: 4,
            padding: '6px 12px',
            fontSize: 12,
            cursor: analyzing ? 'not-allowed' : 'pointer',
          }}
        >
          {analyzing ? '🔍 Analyzing...' : 'Deep Analysis'}
        </button>
      </div>
    </div>
  );
}

/** Active state — shows real Soma intelligence data */
function ActiveView({ report, agentId }: { report: SomaReport; agentId: string }) {
  const agentData = report.agents?.find((a) => a.name === agentId);
  const agentGuard = report.guardRecommendations?.find((g) => g.agent === agentId);
  const isStale =
    report.generatedAt && Date.now() - new Date(report.generatedAt).getTime() > 30 * 60_000;
  const vaultHealth = useVaultHealth();

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

      {/* Operational Context - Vault Health, Pipeline Status, Smart Actions */}
      <div className="soma-intel__operational-context">
        <VaultHealthIndicators vaultHealth={vaultHealth} />
        <PipelineStatus vaultHealth={vaultHealth} />
        <SmartActions />
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
              {visible.map((ins, _i) => (
                <div key={ins.title} className="soma-intel__insight">
                  <span className="soma-intel__insight-type">{ins.type}</span>
                  <strong>{ins.title}</strong>
                  <span className="soma-intel__insight-conf">{ins.confidence}</span>
                  <LayerBadge layer={ins.layer} status={ins.proposal_status} />
                  {ins.confidence_score != null && (
                    <span style={{ fontSize: 10, color: '#8b949e', marginLeft: 4 }}>
                      ({(ins.confidence_score * 100).toFixed(0)}%)
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
              {visible.map((pol, _i) => (
                <div key={pol.name} className="soma-intel__policy">
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
