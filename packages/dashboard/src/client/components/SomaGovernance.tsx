import { useEffect, useState } from 'react';
import type { GovernanceData } from '../hooks/useSomaGovernance';

// Types for agentic governance data
interface AgenticGovernanceData {
  agent_performance: {
    accuracy: number;
    decision_speed_avg: number; // ms
    auto_promotion_rate: number;
    human_escalation_rate: number;
    meta_learning_score: number;
  };
  active_queue: {
    auto_processing: number;
    human_escalation: number;
    total_pending: number;
  };
  promotion_pipeline: {
    avg_review_time: number; // hours
    efficiency_score: number;
    policy_effectiveness: number;
  };
  governance_config: {
    auto_promotion_threshold: number;
    escalation_threshold: number;
    meta_learning_enabled: boolean;
    feedback_loop_active: boolean;
  };
  agentflow_feedback: {
    policy_enforcements: number;
    violations_prevented: number;
    feedback_score: number;
  };
}

// Hook to fetch agentic governance data
function useAgenticGovernance(): AgenticGovernanceData | null {
  const [agenticData, setAgenticData] = useState<AgenticGovernanceData | null>(null);

  useEffect(() => {
    // Mock data for now - in real implementation, this would fetch from API
    // TODO: Replace with actual API call to SOMA governance endpoint
    const mockData: AgenticGovernanceData = {
      agent_performance: {
        accuracy: 0.94,
        decision_speed_avg: 1200,
        auto_promotion_rate: 0.78,
        human_escalation_rate: 0.22,
        meta_learning_score: 0.87,
      },
      active_queue: {
        auto_processing: 8,
        human_escalation: 4,
        total_pending: 12,
      },
      promotion_pipeline: {
        avg_review_time: 2.3,
        efficiency_score: 0.91,
        policy_effectiveness: 0.89,
      },
      governance_config: {
        auto_promotion_threshold: 0.85,
        escalation_threshold: 0.65,
        meta_learning_enabled: true,
        feedback_loop_active: true,
      },
      agentflow_feedback: {
        policy_enforcements: 156,
        violations_prevented: 23,
        feedback_score: 0.92,
      },
    };
    setAgenticData(mockData);
  }, []);

  return agenticData;
}

function LayerBar({ layers }: { layers: GovernanceData['layers'] }) {
  const _total = layers.archive + layers.working + layers.emerging + layers.canon;
  const items = [
    { label: 'L1 Archive', count: layers.archive, color: '#8b949e' },
    { label: 'L2 Working', count: layers.working, color: '#d29922' },
    { label: 'L3 Emerging', count: layers.emerging, color: '#58a6ff' },
    { label: 'L4 Canon', count: layers.canon, color: '#3fb950' },
  ];

  return (
    <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
      {items.map((item) => (
        <div
          key={item.label}
          style={{
            flex: 1,
            padding: '8px 12px',
            borderRadius: 6,
            border: `1px solid ${item.color}33`,
            background: `${item.color}11`,
          }}
        >
          <div style={{ fontSize: 11, color: item.color, fontWeight: 600 }}>{item.label}</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--t1)' }}>{item.count}</div>
        </div>
      ))}
    </div>
  );
}

function GovStats({ gov }: { gov: GovernanceData['governance'] }) {
  return (
    <div style={{ display: 'flex', gap: 12, marginBottom: 16, fontSize: 12 }}>
      <span style={{ color: '#58a6ff' }}>
        {'\u25CB'} {gov.pending} pending
      </span>
      <span style={{ color: '#3fb950' }}>
        {'\u2714'} {gov.promoted} promoted
      </span>
      <span style={{ color: '#f85149' }}>
        {'\u2718'} {gov.rejected} rejected
      </span>
    </div>
  );
}

// Agentic Governance Control Center
function AgenticControlCenter({ agenticData }: { agenticData: AgenticGovernanceData | null }) {
  if (!agenticData) return null;

  const { agent_performance, active_queue, promotion_pipeline } = agenticData;

  return (
    <div style={{ marginBottom: 20 }}>
      <h4 style={{ color: 'var(--t1)', margin: '0 0 12px', fontSize: 14 }}>
        📋 Agentic Governance Control Center
      </h4>

      {/* Active Governance Queue */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 12,
          marginBottom: 16,
        }}
      >
        <div
          style={{
            padding: 12,
            background: 'var(--bg2)',
            border: '1px solid #58a6ff33',
            borderRadius: 6,
          }}
        >
          <div style={{ fontSize: 11, color: '#58a6ff', fontWeight: 600 }}>Auto-Processing</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--t1)' }}>
            {active_queue.auto_processing}
          </div>
          <div style={{ fontSize: 10, color: 'var(--t3)' }}>
            of {active_queue.total_pending} total
          </div>
        </div>

        <div
          style={{
            padding: 12,
            background: 'var(--bg2)',
            border: '1px solid #d2992233',
            borderRadius: 6,
          }}
        >
          <div style={{ fontSize: 11, color: '#d29922', fontWeight: 600 }}>Human Escalation</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--t1)' }}>
            {active_queue.human_escalation}
          </div>
          <div style={{ fontSize: 10, color: 'var(--t3)' }}>require manual review</div>
        </div>

        <div
          style={{
            padding: 12,
            background: 'var(--bg2)',
            border: '1px solid #3fb95033',
            borderRadius: 6,
          }}
        >
          <div style={{ fontSize: 11, color: '#3fb950', fontWeight: 600 }}>Pipeline Efficiency</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--t1)' }}>
            {(promotion_pipeline.efficiency_score * 100).toFixed(0)}%
          </div>
          <div style={{ fontSize: 10, color: 'var(--t3)' }}>
            avg {promotion_pipeline.avg_review_time}h review
          </div>
        </div>
      </div>

      {/* Governance Agent Performance */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: 'var(--t2)', marginBottom: 8 }}>
          Governance Agent Performance & Meta-Learning
        </div>
        <div
          style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, fontSize: 11 }}
        >
          <div>
            <span style={{ color: 'var(--t3)' }}>Accuracy:</span>{' '}
            <span style={{ fontWeight: 600, color: 'var(--t1)' }}>
              {(agent_performance.accuracy * 100).toFixed(1)}%
            </span>
          </div>
          <div>
            <span style={{ color: 'var(--t3)' }}>Avg Speed:</span>{' '}
            <span style={{ fontWeight: 600, color: 'var(--t1)' }}>
              {agent_performance.decision_speed_avg}ms
            </span>
          </div>
          <div>
            <span style={{ color: 'var(--t3)' }}>Auto Rate:</span>{' '}
            <span style={{ fontWeight: 600, color: 'var(--t1)' }}>
              {(agent_performance.auto_promotion_rate * 100).toFixed(0)}%
            </span>
          </div>
          <div>
            <span style={{ color: 'var(--t3)' }}>Learning:</span>{' '}
            <span
              style={{
                fontWeight: 600,
                color: agent_performance.meta_learning_score > 0.8 ? '#3fb950' : '#d29922',
              }}
            >
              {(agent_performance.meta_learning_score * 100).toFixed(0)}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Governance Configuration Panel
function GovernanceConfiguration({
  agenticData,
  onConfigUpdate,
}: {
  agenticData: AgenticGovernanceData | null;
  onConfigUpdate: (config: Partial<AgenticGovernanceData['governance_config']>) => void;
}) {
  const [showConfig, setShowConfig] = useState(false);

  if (!agenticData) return null;

  const { governance_config } = agenticData;

  return (
    <div style={{ marginBottom: 20 }}>
      <button
        type="button"
        style={{
          cursor: 'pointer',
          fontSize: 14,
          color: 'var(--t1)',
          marginBottom: 8,
          background: 'none',
          border: 'none',
          padding: 0,
          textAlign: 'left',
        }}
        onClick={() => setShowConfig(!showConfig)}
      >
        ⚙️ Governance Configuration {showConfig ? '▼' : '▶'}
      </button>

      {showConfig && (
        <div
          style={{
            padding: 12,
            background: 'var(--bg2)',
            border: '1px solid var(--bd)',
            borderRadius: 6,
            fontSize: 12,
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label
                htmlFor="auto-promotion-threshold"
                style={{ display: 'block', color: 'var(--t2)', marginBottom: 4 }}
              >
                Auto-Promotion Threshold
              </label>
              <input
                id="auto-promotion-threshold"
                type="range"
                min="0.5"
                max="1"
                step="0.05"
                value={governance_config.auto_promotion_threshold}
                onChange={(e) =>
                  onConfigUpdate({ auto_promotion_threshold: parseFloat(e.target.value) })
                }
                style={{ width: '100%' }}
              />
              <span style={{ color: 'var(--t3)', fontSize: 10 }}>
                {(governance_config.auto_promotion_threshold * 100).toFixed(0)}%
              </span>
            </div>

            <div>
              <label
                htmlFor="escalation-threshold"
                style={{ display: 'block', color: 'var(--t2)', marginBottom: 4 }}
              >
                Escalation Threshold
              </label>
              <input
                id="escalation-threshold"
                type="range"
                min="0.3"
                max="0.8"
                step="0.05"
                value={governance_config.escalation_threshold}
                onChange={(e) =>
                  onConfigUpdate({ escalation_threshold: parseFloat(e.target.value) })
                }
                style={{ width: '100%' }}
              />
              <span style={{ color: 'var(--t3)', fontSize: 10 }}>
                {(governance_config.escalation_threshold * 100).toFixed(0)}%
              </span>
            </div>
          </div>

          <div style={{ marginTop: 12, display: 'flex', gap: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <input
                type="checkbox"
                checked={governance_config.meta_learning_enabled}
                onChange={(e) => onConfigUpdate({ meta_learning_enabled: e.target.checked })}
              />
              <span>Meta-Learning Enabled</span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <input
                type="checkbox"
                checked={governance_config.feedback_loop_active}
                onChange={(e) => onConfigUpdate({ feedback_loop_active: e.target.checked })}
              />
              <span>Policy Bridge Feedback Loop</span>
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

// Governance Analytics
function GovernanceAnalytics({ agenticData }: { agenticData: AgenticGovernanceData | null }) {
  if (!agenticData) return null;

  const { agentflow_feedback } = agenticData;

  return (
    <div style={{ marginBottom: 20 }}>
      <h4 style={{ color: 'var(--t1)', margin: '0 0 12px', fontSize: 14 }}>
        📊 Governance Analytics
      </h4>

      <div
        style={{
          padding: 12,
          background: 'var(--bg2)',
          border: '1px solid var(--bd)',
          borderRadius: 6,
        }}
      >
        <div style={{ fontSize: 12, color: 'var(--t2)', marginBottom: 8 }}>
          Real-time AgentFlow Policy Enforcement Feedback
        </div>

        <div
          style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, fontSize: 11 }}
        >
          <div>
            <span style={{ color: 'var(--t3)' }}>Enforcements:</span>{' '}
            <span style={{ fontWeight: 600, color: 'var(--t1)' }}>
              {agentflow_feedback.policy_enforcements}
            </span>
          </div>
          <div>
            <span style={{ color: 'var(--t3)' }}>Violations Prevented:</span>{' '}
            <span style={{ fontWeight: 600, color: '#3fb950' }}>
              {agentflow_feedback.violations_prevented}
            </span>
          </div>
          <div>
            <span style={{ color: 'var(--t3)' }}>Feedback Score:</span>{' '}
            <span
              style={{
                fontWeight: 600,
                color: agentflow_feedback.feedback_score > 0.9 ? '#3fb950' : '#d29922',
              }}
            >
              {(agentflow_feedback.feedback_score * 100).toFixed(0)}%
            </span>
          </div>
        </div>

        <div
          style={{
            marginTop: 8,
            fontSize: 10,
            color: 'var(--t3)',
            fontStyle: 'italic',
          }}
        >
          Policy effectiveness measured through closed feedback loop with AgentFlow guards
        </div>
      </div>
    </div>
  );
}

export function SomaGovernance({
  data,
  onPromote,
  onReject,
}: {
  data: GovernanceData | null;
  onPromote: (id: string) => Promise<boolean>;
  onReject: (id: string, reason: string) => Promise<boolean>;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const agenticData = useAgenticGovernance();

  const handleConfigUpdate = (config: Partial<AgenticGovernanceData['governance_config']>) => {
    // TODO: Implement API call to update governance configuration
    console.log('Updating governance config:', config);
  };

  if (!data) return <div className="workspace__empty">Loading governance data...</div>;
  if (!data.available)
    return <div className="workspace__empty">SOMA not configured. Set --soma-vault on server.</div>;

  return (
    <div style={{ padding: 16, maxWidth: 900 }}>
      <h3 style={{ margin: '0 0 12px', color: 'var(--t1)' }}>🏛️ SOMA Governance</h3>

      <LayerBar layers={data.layers} />
      <GovStats gov={data.governance} />

      {/* Agentic Governance Features */}
      <AgenticControlCenter agenticData={agenticData} />
      <GovernanceConfiguration agenticData={agenticData} onConfigUpdate={handleConfigUpdate} />
      <GovernanceAnalytics agenticData={agenticData} />

      {/* Pending proposals */}
      {data.insights.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h4 style={{ color: '#58a6ff', margin: '0 0 8px', fontSize: 13 }}>
            Pending Proposals ({data.insights.length})
          </h4>
          {data.insights.map((ins, _i) => {
            const id = ins.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
            const isExpanded = expandedId === id;
            const isRejecting = rejectingId === id;
            const score =
              ins.confidence_score != null ? `${(ins.confidence_score * 100).toFixed(0)}%` : '?';

            return (
              <div
                key={id}
                style={{
                  padding: '8px 12px',
                  marginBottom: 4,
                  borderRadius: 4,
                  background: 'var(--bg2)',
                  border: '1px solid var(--bd)',
                }}
              >
                {/* biome-ignore lint/a11y/useSemanticElements: interactive element with role+keyboard handlers */}
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
                  role="button"
                  tabIndex={0}
                  onClick={() => setExpandedId(isExpanded ? null : id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') setExpandedId(isExpanded ? null : id);
                  }}
                >
                  <span style={{ color: '#58a6ff', fontSize: 11, fontWeight: 600, minWidth: 36 }}>
                    {score}
                  </span>
                  <span style={{ flex: 1, color: 'var(--t1)', fontSize: 13 }}>{ins.title}</span>
                  <span style={{ fontSize: 10, color: 'var(--t3)' }}>{ins.type}</span>
                  <button
                    type="button"
                    style={{
                      fontSize: 11,
                      padding: '2px 8px',
                      background: '#238636',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 3,
                      cursor: 'pointer',
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onPromote(id);
                    }}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    style={{
                      fontSize: 11,
                      padding: '2px 8px',
                      background: '#da3633',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 3,
                      cursor: 'pointer',
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setRejectingId(isRejecting ? null : id);
                      setRejectReason('');
                    }}
                  >
                    Reject
                  </button>
                </div>

                {isExpanded && ins.claim && (
                  <div style={{ marginTop: 8, fontSize: 12, color: 'var(--t2)', paddingLeft: 44 }}>
                    {ins.claim}
                  </div>
                )}

                {isRejecting && (
                  <div style={{ marginTop: 8, display: 'flex', gap: 4, paddingLeft: 44 }}>
                    <input
                      type="text"
                      placeholder="Rejection reason..."
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      style={{
                        flex: 1,
                        padding: '4px 8px',
                        fontSize: 12,
                        background: 'var(--bg3)',
                        border: '1px solid var(--bd)',
                        color: 'var(--t1)',
                        borderRadius: 3,
                      }}
                    />
                    <button
                      type="button"
                      style={{
                        fontSize: 11,
                        padding: '4px 8px',
                        background: '#da3633',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 3,
                        cursor: 'pointer',
                      }}
                      onClick={() => {
                        onReject(id, rejectReason);
                        setRejectingId(null);
                      }}
                    >
                      Confirm
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {data.insights.length === 0 && (
        <div style={{ color: 'var(--t3)', fontSize: 13, marginBottom: 24 }}>
          No pending proposals.
        </div>
      )}

      {/* Canon entries */}
      {data.canon.length > 0 && (
        <div>
          <h4 style={{ color: '#3fb950', margin: '0 0 8px', fontSize: 13 }}>
            Canon ({data.canon.length})
          </h4>
          {data.canon.map((c, _i) => (
            <div
              key={c.title}
              style={{
                padding: '6px 12px',
                marginBottom: 4,
                borderRadius: 4,
                background: 'var(--bg2)',
                border: '1px solid #3fb95033',
                fontSize: 13,
                color: 'var(--t1)',
              }}
            >
              <strong>{c.title}</strong>
              {c.ratified_by && (
                <span style={{ fontSize: 10, color: 'var(--t3)', marginLeft: 8 }}>
                  ratified by {c.ratified_by}
                </span>
              )}
              {c.claim && (
                <div style={{ fontSize: 12, color: 'var(--t2)', marginTop: 4 }}>{c.claim}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {data.generatedAt && (
        <div style={{ marginTop: 16, fontSize: 10, color: 'var(--t3)' }}>
          Data from {new Date(data.generatedAt).toLocaleString()}
        </div>
      )}
    </div>
  );
}
