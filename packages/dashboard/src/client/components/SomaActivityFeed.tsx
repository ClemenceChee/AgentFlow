import { useEffect, useRef, useState } from 'react';

// Types for multi-layer operational intelligence
interface OperationalIntelligence {
  worker_operations: {
    harvester: {
      status: 'running' | 'idle' | 'error';
      last_run: number;
      next_run: number;
      interval: string;
    };
    reconciler: {
      status: 'running' | 'idle' | 'error';
      last_run: number;
      next_run: number;
      interval: string;
    };
    synthesizer: {
      status: 'running' | 'idle' | 'error';
      last_run: number;
      next_run: number;
      interval: string;
    };
    cartographer: {
      status: 'running' | 'idle' | 'error';
      last_run: number;
      next_run: number;
      interval: string;
    };
  };
  vault_operations: {
    l1_archive: {
      health: 'healthy' | 'degraded' | 'critical';
      growth_rate: number;
      integrity_score: number;
    };
    l2_working: {
      health: 'healthy' | 'degraded' | 'critical';
      growth_rate: number;
      integrity_score: number;
    };
    l3_emerging: {
      health: 'healthy' | 'degraded' | 'critical';
      growth_rate: number;
      integrity_score: number;
    };
    l4_canon: {
      health: 'healthy' | 'degraded' | 'critical';
      growth_rate: number;
      integrity_score: number;
    };
  };
  governance_operations: {
    agentic_review_performance: number;
    meta_governance_learning: number;
    auto_promotion_efficiency: number;
  };
  cross_system_operations: {
    policy_bridge_effectiveness: number;
    agentflow_coordination: number;
    feedback_loop_health: number;
  };
}

// Hook to fetch operational intelligence data
function useOperationalIntelligence(): OperationalIntelligence | null {
  const [opIntel, setOpIntel] = useState<OperationalIntelligence | null>(null);

  useEffect(() => {
    // Mock data for now - in real implementation, this would fetch from API
    // TODO: Replace with actual API call to SOMA operational intelligence endpoint
    const mockData: OperationalIntelligence = {
      worker_operations: {
        harvester: {
          status: 'running',
          last_run: Date.now() - 45000,
          next_run: Date.now() + 15000,
          interval: '60s',
        },
        reconciler: {
          status: 'idle',
          last_run: Date.now() - 120000,
          next_run: Date.now() + 180000,
          interval: '5min',
        },
        synthesizer: {
          status: 'running',
          last_run: Date.now() - 1800000,
          next_run: Date.now() + 1800000,
          interval: '1hr',
        },
        cartographer: {
          status: 'idle',
          last_run: Date.now() - 300000,
          next_run: 0,
          interval: 'on-change',
        },
      },
      vault_operations: {
        l1_archive: { health: 'healthy', growth_rate: 2.4, integrity_score: 0.98 },
        l2_working: { health: 'healthy', growth_rate: 1.2, integrity_score: 0.94 },
        l3_emerging: { health: 'degraded', growth_rate: 0.8, integrity_score: 0.87 },
        l4_canon: { health: 'healthy', growth_rate: 0.1, integrity_score: 0.99 },
      },
      governance_operations: {
        agentic_review_performance: 0.92,
        meta_governance_learning: 0.87,
        auto_promotion_efficiency: 0.91,
      },
      cross_system_operations: {
        policy_bridge_effectiveness: 0.89,
        agentflow_coordination: 0.94,
        feedback_loop_health: 0.96,
      },
    };
    setOpIntel(mockData);

    // Update every 5 seconds for demo
    const interval = setInterval(() => {
      setOpIntel((prevData) => {
        if (!prevData) return mockData;
        // Simulate some updates
        return {
          ...prevData,
          worker_operations: {
            ...prevData.worker_operations,
            harvester: {
              ...prevData.worker_operations.harvester,
              last_run:
                prevData.worker_operations.harvester.status === 'running'
                  ? Date.now() - Math.random() * 10000
                  : prevData.worker_operations.harvester.last_run,
            },
          },
        };
      });
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  return opIntel;
}

interface ActivityEvent {
  id: string;
  action: string;
  description: string;
  entityType?: string;
  entityId?: string;
  timestamp: string;
}

const ACTION_ICONS: Record<string, string> = {
  harvest: '\u{1F33E}',
  synthesize: '\u{1F9EA}',
  promote: '\u{2705}',
  reject: '\u{274C}',
  decay: '\u{1F342}',
  reconcile: '\u{1F527}',
  'policy-change': '\u{1F6E1}',
};

// Multi-Layer Operations Center component
function MultiLayerOperationsCenter({ opIntel }: { opIntel: OperationalIntelligence | null }) {
  const [activeTab, setActiveTab] = useState<'workers' | 'vault' | 'governance' | 'cross-system'>(
    'workers',
  );

  if (!opIntel) return null;

  const formatTime = (timestamp: number) => {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running':
        return '#3fb950';
      case 'idle':
        return '#58a6ff';
      case 'error':
        return '#f85149';
      case 'healthy':
        return '#3fb950';
      case 'degraded':
        return '#d29922';
      case 'critical':
        return '#f85149';
      default:
        return '#8b949e';
    }
  };

  return (
    <div style={{ marginBottom: 24 }}>
      <h4 style={{ color: 'var(--t1)', margin: '0 0 12px', fontSize: 14 }}>
        ⚡ Multi-Layer Operations Center
      </h4>

      {/* Operation Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {[
          { key: 'workers', label: 'Worker Operations' },
          { key: 'vault', label: 'Vault Operations' },
          { key: 'governance', label: 'Governance Operations' },
          { key: 'cross-system', label: 'Cross-System Operations' },
        ].map((tab) => (
          <button
            type="button"
            key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
            style={{
              padding: '4px 8px',
              fontSize: 11,
              background: activeTab === tab.key ? 'var(--bg2)' : 'transparent',
              border: activeTab === tab.key ? '1px solid var(--bd)' : '1px solid transparent',
              borderRadius: 4,
              color: activeTab === tab.key ? 'var(--t1)' : 'var(--t3)',
              cursor: 'pointer',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Worker Operations */}
      {activeTab === 'workers' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
          {Object.entries(opIntel.worker_operations).map(([worker, data]) => (
            <div
              key={worker}
              style={{
                padding: 12,
                background: 'var(--bg2)',
                border: `1px solid ${getStatusColor(data.status)}33`,
                borderRadius: 6,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 4,
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: 'var(--t1)',
                    textTransform: 'capitalize',
                  }}
                >
                  {worker}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    color: getStatusColor(data.status),
                    fontWeight: 600,
                    textTransform: 'uppercase',
                  }}
                >
                  {data.status}
                </span>
              </div>
              <div style={{ fontSize: 10, color: 'var(--t3)' }}>Interval: {data.interval}</div>
              <div style={{ fontSize: 10, color: 'var(--t3)' }}>
                Last: {formatTime(data.last_run)}
              </div>
              {data.next_run > 0 && (
                <div style={{ fontSize: 10, color: 'var(--t3)' }}>
                  Next: {formatTime(Date.now() - (Date.now() - data.next_run))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Vault Operations */}
      {activeTab === 'vault' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
          {Object.entries(opIntel.vault_operations).map(([layer, data]) => (
            <div
              key={layer}
              style={{
                padding: 12,
                background: 'var(--bg2)',
                border: `1px solid ${getStatusColor(data.health)}33`,
                borderRadius: 6,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 4,
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--t1)' }}>
                  {layer.replace('_', ' ').toUpperCase()}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    color: getStatusColor(data.health),
                    fontWeight: 600,
                    textTransform: 'uppercase',
                  }}
                >
                  {data.health}
                </span>
              </div>
              <div style={{ fontSize: 10, color: 'var(--t3)' }}>
                Growth: {data.growth_rate}%/day
              </div>
              <div style={{ fontSize: 10, color: 'var(--t3)' }}>
                Integrity: {(data.integrity_score * 100).toFixed(1)}%
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Governance Operations */}
      {activeTab === 'governance' && (
        <div
          style={{
            padding: 12,
            background: 'var(--bg2)',
            border: '1px solid var(--bd)',
            borderRadius: 6,
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--t3)' }}>Agentic Review Performance</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--t1)' }}>
                {(opIntel.governance_operations.agentic_review_performance * 100).toFixed(1)}%
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--t3)' }}>Meta-Learning Score</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--t1)' }}>
                {(opIntel.governance_operations.meta_governance_learning * 100).toFixed(1)}%
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--t3)' }}>Auto-Promotion Efficiency</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--t1)' }}>
                {(opIntel.governance_operations.auto_promotion_efficiency * 100).toFixed(1)}%
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cross-System Operations */}
      {activeTab === 'cross-system' && (
        <div
          style={{
            padding: 12,
            background: 'var(--bg2)',
            border: '1px solid var(--bd)',
            borderRadius: 6,
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--t3)' }}>Policy Bridge Effectiveness</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--t1)' }}>
                {(opIntel.cross_system_operations.policy_bridge_effectiveness * 100).toFixed(1)}%
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--t3)' }}>AgentFlow Coordination</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--t1)' }}>
                {(opIntel.cross_system_operations.agentflow_coordination * 100).toFixed(1)}%
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--t3)' }}>Feedback Loop Health</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--t1)' }}>
                {(opIntel.cross_system_operations.feedback_loop_health * 100).toFixed(1)}%
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Manual Operations component
function ManualOperations() {
  const [executing, setExecuting] = useState<string | null>(null);

  const executeOperation = async (operation: string) => {
    setExecuting(operation);
    try {
      // TODO: Call external command API to execute manual operation
      // await fetch('/api/external/commands/execute', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ command: operation }),
      // });

      // Mock delay for demo
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch (error) {
      console.error(`Failed to execute ${operation}:`, error);
    } finally {
      setExecuting(null);
    }
  };

  const operations = [
    { key: 'trigger-harvester', label: 'Trigger Harvester', icon: '🌾' },
    { key: 'trigger-reconciler', label: 'Trigger Reconciler', icon: '🔧' },
    { key: 'trigger-synthesizer', label: 'Trigger Synthesizer', icon: '🧪' },
    { key: 'trigger-cartographer', label: 'Trigger Cartographer', icon: '🗺️' },
    { key: 'expedite-governance', label: 'Expedite Governance', icon: '⚡' },
    { key: 'refresh-vault-health', label: 'Refresh Vault Health', icon: '🏥' },
  ];

  return (
    <div style={{ marginBottom: 24 }}>
      <h4 style={{ color: 'var(--t1)', margin: '0 0 12px', fontSize: 14 }}>🚀 Manual Operations</h4>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {operations.map((op) => (
          <button
            type="button"
            key={op.key}
            onClick={() => executeOperation(op.key)}
            disabled={executing === op.key}
            style={{
              padding: '8px 12px',
              fontSize: 11,
              background: executing === op.key ? '#8b949e' : '#58a6ff',
              color: 'white',
              border: 'none',
              borderRadius: 4,
              cursor: executing === op.key ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <span>{op.icon}</span>
            <span>{executing === op.key ? 'Running...' : op.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function SomaActivityFeed() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const eventsRef = useRef<ActivityEvent[]>([]);
  const opIntel = useOperationalIntelligence();

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}`);
    wsRef.current = ws;

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.type === 'soma-activity' && msg.data) {
          const event: ActivityEvent = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            action: msg.data.action ?? 'unknown',
            description: msg.data.description ?? msg.data.entity ?? '',
            entityType: msg.data.entityType,
            entityId: msg.data.entityId,
            timestamp: msg.data.timestamp ?? new Date().toISOString(),
          };
          eventsRef.current = [event, ...eventsRef.current].slice(0, 100);
          setEvents([...eventsRef.current]);
        }
      } catch {
        /* ignore malformed messages */
      }
    };

    return () => {
      ws.close();
    };
  }, []);

  const formatTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return '';
    }
  };

  return (
    <div className="soma-activity">
      <div className="soma-activity__header">
        <h3>📡 SOMA Activity</h3>
        <span className="soma-activity__status">
          {events.length > 0 ? `${events.length} events` : 'Waiting for events...'}
        </span>
      </div>

      {/* Multi-Layer Operational Intelligence Dashboard */}
      <MultiLayerOperationsCenter opIntel={opIntel} />
      <ManualOperations />

      {/* Real-time Activity Feed */}
      <div style={{ marginBottom: 12 }}>
        <h4 style={{ color: 'var(--t1)', margin: '0 0 8px', fontSize: 14 }}>
          📊 Real-time Activity Feed
        </h4>
      </div>

      <div className="soma-activity__list">
        {events.length === 0 && (
          <div className="soma-activity__empty">
            <p>
              No activity yet. Events will appear here in real-time as SOMA workers harvest,
              synthesize, and manage knowledge.
            </p>
          </div>
        )}
        {events.map((e) => (
          <div key={e.id} className="soma-activity__event">
            <span className="soma-activity__icon">{ACTION_ICONS[e.action] ?? '\u{1F4AC}'}</span>
            <span className="soma-activity__time">{formatTime(e.timestamp)}</span>
            <span className="soma-activity__action">{e.action}</span>
            <span className="soma-activity__desc">{e.description}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
