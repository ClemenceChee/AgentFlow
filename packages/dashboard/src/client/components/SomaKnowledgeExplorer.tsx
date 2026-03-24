import { useCallback, useEffect, useState } from 'react';

// Types for contextual operational data
interface OperationalContext {
  vault_health: {
    total_entities: number;
    layer_distribution: Record<string, number>;
    last_updated: number;
    indexing_status: 'idle' | 'indexing' | 'error';
  };
  knowledge_freshness: {
    stale_entities: number;
    recent_updates: number;
    avg_age_hours: number;
  };
}

// Hook to fetch operational context for knowledge explorer
function useKnowledgeOperationalContext(): OperationalContext | null {
  const [opContext, setOpContext] = useState<OperationalContext | null>(null);

  useEffect(() => {
    // Mock data for now - in real implementation, this would fetch from API
    // TODO: Replace with actual API call to SOMA operational context endpoint
    const mockData: OperationalContext = {
      vault_health: {
        total_entities: 8342,
        layer_distribution: { canon: 47, emerging: 156, working: 1238, archive: 6901 },
        last_updated: Date.now() - 15 * 60 * 1000, // 15min ago
        indexing_status: 'idle',
      },
      knowledge_freshness: {
        stale_entities: 23,
        recent_updates: 147,
        avg_age_hours: 72.5,
      },
    };
    setOpContext(mockData);
  }, []);

  return opContext;
}

interface EntitySummary {
  id: string;
  type: string;
  name: string;
  status: string;
  layer?: string;
  created: string;
  updated: string;
  tags: string[];
}

interface KnowledgeItem {
  type: string;
  id: string;
  name: string;
  claim?: string;
  confidence?: string;
  layer?: string;
}

interface EntityDetail extends EntitySummary {
  body: string;
  related: string[];
  metadata?: Record<string, unknown>;
  knowledge?: KnowledgeItem[];
}

const LAYER_COLORS: Record<string, string> = {
  canon: '#3fb950',
  emerging: '#58a6ff',
  working: '#d29922',
  archive: '#8b949e',
};
const LAYER_LABELS: Record<string, string> = {
  canon: 'L4 Canon',
  emerging: 'L3 Emerging',
  working: 'L2 Working',
  archive: 'L1 Archive',
};

// Contextual Status Indicators component
function KnowledgeStatusIndicators({ opContext }: { opContext: OperationalContext | null }) {
  if (!opContext) return null;

  const { vault_health, knowledge_freshness } = opContext;
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'idle': return '#3fb950';
      case 'indexing': return '#d29922';
      case 'error': return '#f85149';
      default: return '#8b949e';
    }
  };

  const formatTime = (timestamp: number) => {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      fontSize: 11,
      color: 'var(--t3)',
      padding: '4px 0',
      borderBottom: '1px solid var(--bd)',
      marginBottom: 8,
    }}>
      {/* Indexing Status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <div
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            backgroundColor: getStatusColor(vault_health.indexing_status),
          }}
        />
        <span>Index {vault_health.indexing_status}</span>
      </div>

      {/* Last Update */}
      <span>Updated {formatTime(vault_health.last_updated)}</span>

      {/* Knowledge Freshness */}
      <span>{knowledge_freshness.stale_entities} stale</span>
      <span>{knowledge_freshness.recent_updates} recent</span>

      {/* Avg Age */}
      <span>Avg age: {knowledge_freshness.avg_age_hours.toFixed(1)}h</span>
    </div>
  );
}

// Contextual Smart Actions component
function KnowledgeSmartActions() {
  const [operationRunning, setOperationRunning] = useState<string | null>(null);

  const executeOperation = async (operation: string) => {
    setOperationRunning(operation);
    try {
      // TODO: Call external command API to execute knowledge operation
      // await fetch('/api/external/commands/execute', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ command: operation }),
      // });

      // Mock delay for demo
      await new Promise(resolve => setTimeout(resolve, 1500));
    } catch (error) {
      console.error(`Failed to execute ${operation}:`, error);
    } finally {
      setOperationRunning(null);
    }
  };

  const smartActions = [
    { key: 'refresh-knowledge-graph', label: 'Refresh Graph', icon: '🔄' },
    { key: 'trigger-synthesis', label: 'Trigger Synthesis', icon: '🧪' },
    { key: 'rebuild-index', label: 'Rebuild Index', icon: '🔍' },
  ];

  return (
    <div style={{
      display: 'flex',
      gap: 6,
      alignItems: 'center',
    }}>
      <span style={{ fontSize: 11, color: 'var(--t3)', marginRight: 4 }}>⚡</span>
      {smartActions.map(action => (
        <button
          key={action.key}
          onClick={() => executeOperation(action.key)}
          disabled={operationRunning === action.key}
          style={{
            padding: '2px 6px',
            fontSize: 10,
            background: operationRunning === action.key ? '#8b949e' : 'var(--bg2)',
            color: operationRunning === action.key ? 'white' : 'var(--t2)',
            border: '1px solid var(--bd)',
            borderRadius: 3,
            cursor: operationRunning === action.key ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 2,
          }}
        >
          <span>{action.icon}</span>
          <span>{operationRunning === action.key ? 'Running...' : action.label}</span>
        </button>
      ))}
    </div>
  );
}

// Contextual Detail Drawer - Enhanced entity detail with operational context
function OperationalEntityDetail({ entity, opContext }: {
  entity: EntityDetail | null;
  opContext: OperationalContext | null;
}) {
  const [showOpDetail, setShowOpDetail] = useState(false);

  if (!entity) return null;

  // Mock operational data for the selected entity
  const entityOpData = {
    processing_history: [
      { worker: 'harvester', timestamp: Date.now() - 120000, action: 'indexed' },
      { worker: 'synthesizer', timestamp: Date.now() - 3600000, action: 'analyzed' },
    ],
    related_operations: 2,
    governance_status: entity.layer === 'emerging' ? 'pending-review' : 'stable',
  };

  return (
    <div style={{ position: 'relative' }}>
      {/* Operational Context Toggle */}
      <div style={{
        position: 'absolute',
        top: -2,
        right: 32,
        zIndex: 10,
      }}>
        <button
          onClick={() => setShowOpDetail(!showOpDetail)}
          style={{
            padding: '2px 4px',
            fontSize: 10,
            background: showOpDetail ? 'var(--bg3)' : 'transparent',
            border: '1px solid var(--bd)',
            borderRadius: 3,
            color: 'var(--t3)',
            cursor: 'pointer',
          }}
        >
          📊 {showOpDetail ? 'Hide' : 'Ops'}
        </button>
      </div>

      {/* Operational Details Drawer */}
      {showOpDetail && (
        <div style={{
          position: 'absolute',
          top: 0,
          right: -200,
          width: 180,
          padding: 8,
          background: 'var(--bg2)',
          border: '1px solid var(--bd)',
          borderRadius: 4,
          fontSize: 10,
          color: 'var(--t2)',
          zIndex: 20,
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        }}>
          <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--t1)' }}>
            Operational Context
          </div>

          <div style={{ marginBottom: 4 }}>
            <span style={{ color: 'var(--t3)' }}>Processing:</span>
          </div>
          {entityOpData.processing_history.map((h, i) => (
            <div key={i} style={{ fontSize: 9, paddingLeft: 8, marginBottom: 2 }}>
              {h.worker}: {h.action}
            </div>
          ))}

          <div style={{ marginBottom: 2, marginTop: 6 }}>
            <span style={{ color: 'var(--t3)' }}>Related Ops:</span> {entityOpData.related_operations}
          </div>

          <div style={{ marginBottom: 2 }}>
            <span style={{ color: 'var(--t3)' }}>Gov Status:</span>{' '}
            <span style={{
              color: entityOpData.governance_status === 'pending-review' ? '#d29922' : '#3fb950'
            }}>
              {entityOpData.governance_status}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export function SomaKnowledgeExplorer() {
  const [entities, setEntities] = useState<EntitySummary[]>([]);
  const [total, setTotal] = useState(0);
  const [typeFilter, setTypeFilter] = useState('');
  const [layerFilter, setLayerFilter] = useState('');
  const [query, setQuery] = useState('');
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<EntityDetail | null>(null);
  const opContext = useKnowledgeOperationalContext();
  const limit = 50;

  const fetchEntities = useCallback(async () => {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (typeFilter) params.set('type', typeFilter);
    if (layerFilter) params.set('layer', layerFilter);
    if (query) params.set('q', query);
    try {
      const res = await fetch(`/api/soma/vault/entities?${params}`);
      if (res.ok) {
        const data = await res.json();
        setEntities(data.entities ?? []);
        setTotal(data.total ?? 0);
      }
    } catch {
      /* retry */
    }
  }, [typeFilter, layerFilter, query, offset]);

  useEffect(() => {
    fetchEntities();
  }, [fetchEntities]);

  const fetchDetail = async (type: string, id: string) => {
    try {
      const res = await fetch(
        `/api/soma/vault/entities/${encodeURIComponent(type)}/${encodeURIComponent(id)}`,
      );
      if (res.ok) setSelected(await res.json());
    } catch {
      /* show error */
    }
  };

  return (
    <div className="soma-knowledge">
      {/* Contextual Status Indicators */}
      <KnowledgeStatusIndicators opContext={opContext} />

      <div className="soma-knowledge__filters">
        <input
          className="soma-knowledge__search"
          placeholder="Search entities..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOffset(0);
          }}
        />
        <select
          value={typeFilter}
          onChange={(e) => {
            setTypeFilter(e.target.value);
            setOffset(0);
          }}
        >
          <option value="">All types</option>
          {[
            'insight',
            'policy',
            'decision',
            'assumption',
            'constraint',
            'contradiction',
            'synthesis',
            'agent',
            'execution',
            'archetype',
          ].map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select
          value={layerFilter}
          onChange={(e) => {
            setLayerFilter(e.target.value);
            setOffset(0);
          }}
        >
          <option value="">All layers</option>
          <option value="canon">L4 Canon</option>
          <option value="emerging">L3 Emerging</option>
          <option value="working">L2 Working</option>
          <option value="archive">L1 Archive</option>
        </select>
        <span className="soma-knowledge__count">{total} entities</span>

        {/* Smart Actions */}
        <div style={{ marginLeft: 'auto' }}>
          <KnowledgeSmartActions />
        </div>
      </div>

      <div className="soma-knowledge__body">
        <div className="soma-knowledge__list">
          {entities.map((e) => (
            <button
              type="button"
              key={`${e.type}/${e.id}`}
              className={`soma-knowledge__row ${selected?.id === e.id ? 'soma-knowledge__row--sel' : ''}`}
              onClick={() => fetchDetail(e.type, e.id)}
            >
              <span className="soma-knowledge__type">{e.type}</span>
              <span className="soma-knowledge__name">{e.name}</span>
              {e.layer && (
                <span
                  className="soma-knowledge__layer"
                  style={{ color: LAYER_COLORS[e.layer], borderColor: LAYER_COLORS[e.layer] }}
                >
                  {LAYER_LABELS[e.layer] ?? e.layer}
                </span>
              )}
            </button>
          ))}
          {entities.length === 0 && <div className="soma-knowledge__empty">No entities found.</div>}
          {total > offset + limit && (
            <button
              type="button"
              className="soma-knowledge__more"
              onClick={() => setOffset(offset + limit)}
            >
              Load more...
            </button>
          )}
        </div>

        {selected && (
          <div className="soma-knowledge__detail">
            <div className="soma-knowledge__detail-header">
              <span className="soma-knowledge__type">{selected.type}</span>
              <strong>{selected.name}</strong>
              {selected.layer && (
                <span
                  className="soma-knowledge__layer"
                  style={{
                    color: LAYER_COLORS[selected.layer],
                    borderColor: LAYER_COLORS[selected.layer],
                  }}
                >
                  {LAYER_LABELS[selected.layer] ?? selected.layer}
                </span>
              )}

              {/* Operational Context Drawer */}
              <OperationalEntityDetail entity={selected} opContext={opContext} />

              <button
                type="button"
                className="soma-knowledge__close"
                onClick={() => setSelected(null)}
              >
                {'\u2715'}
              </button>
            </div>
            <div className="soma-knowledge__detail-body">
              <pre>{selected.body}</pre>
            </div>
            {selected.tags.length > 0 && (
              <div className="soma-knowledge__tags">
                {selected.tags.map((t) => (
                  <span key={t} className="soma-knowledge__tag">
                    {t}
                  </span>
                ))}
              </div>
            )}
            {selected.related.length > 0 && (
              <div className="soma-knowledge__related">
                <strong>Related:</strong>
                {selected.related.map((r) => {
                  const [rType, ...rId] = r.split('/');
                  return (
                    <button
                      type="button"
                      key={r}
                      className="soma-knowledge__link"
                      onClick={() => fetchDetail(rType, rId.join('/'))}
                    >
                      {r}
                    </button>
                  );
                })}
              </div>
            )}
            {selected.knowledge && selected.knowledge.length > 0 && (
              <div className="soma-knowledge__agent-intel">
                <strong>SOMA Intelligence ({selected.knowledge.length}):</strong>
                {selected.knowledge.map((k) => (
                  <button
                    type="button"
                    key={`${k.type}/${k.id}`}
                    className="soma-knowledge__intel-item"
                    onClick={() => fetchDetail(k.type, k.id)}
                  >
                    <span className="soma-knowledge__type">{k.type}</span>
                    <span className="soma-knowledge__intel-name">{k.name}</span>
                    {k.confidence && (
                      <span className="soma-knowledge__intel-conf">{k.confidence}</span>
                    )}
                    {k.claim && (
                      <div className="soma-knowledge__intel-claim">{k.claim.slice(0, 120)}</div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
