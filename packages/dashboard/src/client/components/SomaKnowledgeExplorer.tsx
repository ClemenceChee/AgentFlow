import { useCallback, useEffect, useState } from 'react';

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

interface EntityDetail extends EntitySummary {
  body: string;
  related: string[];
  metadata?: Record<string, unknown>;
}

const LAYER_COLORS: Record<string, string> = {
  canon: '#3fb950', emerging: '#58a6ff', working: '#d29922', archive: '#8b949e',
};
const LAYER_LABELS: Record<string, string> = {
  canon: 'L4 Canon', emerging: 'L3 Emerging', working: 'L2 Working', archive: 'L1 Archive',
};

export function SomaKnowledgeExplorer() {
  const [entities, setEntities] = useState<EntitySummary[]>([]);
  const [total, setTotal] = useState(0);
  const [typeFilter, setTypeFilter] = useState('');
  const [layerFilter, setLayerFilter] = useState('');
  const [query, setQuery] = useState('');
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<EntityDetail | null>(null);
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
    } catch { /* retry */ }
  }, [typeFilter, layerFilter, query, offset]);

  useEffect(() => { fetchEntities(); }, [fetchEntities]);

  const fetchDetail = async (type: string, id: string) => {
    try {
      const res = await fetch(`/api/soma/vault/entities/${encodeURIComponent(type)}/${encodeURIComponent(id)}`);
      if (res.ok) setSelected(await res.json());
    } catch { /* show error */ }
  };

  return (
    <div className="soma-knowledge">
      <div className="soma-knowledge__filters">
        <input className="soma-knowledge__search" placeholder="Search entities..." value={query}
          onChange={(e) => { setQuery(e.target.value); setOffset(0); }} />
        <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setOffset(0); }}>
          <option value="">All types</option>
          {['insight', 'policy', 'decision', 'assumption', 'constraint', 'contradiction', 'synthesis', 'agent', 'execution', 'archetype'].map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <select value={layerFilter} onChange={(e) => { setLayerFilter(e.target.value); setOffset(0); }}>
          <option value="">All layers</option>
          <option value="canon">L4 Canon</option>
          <option value="emerging">L3 Emerging</option>
          <option value="working">L2 Working</option>
          <option value="archive">L1 Archive</option>
        </select>
        <span className="soma-knowledge__count">{total} entities</span>
      </div>

      <div className="soma-knowledge__body">
        <div className="soma-knowledge__list">
          {entities.map((e) => (
            <button key={`${e.type}/${e.id}`} className={`soma-knowledge__row ${selected?.id === e.id ? 'soma-knowledge__row--sel' : ''}`}
              onClick={() => fetchDetail(e.type, e.id)}>
              <span className="soma-knowledge__type">{e.type}</span>
              <span className="soma-knowledge__name">{e.name}</span>
              {e.layer && (
                <span className="soma-knowledge__layer" style={{ color: LAYER_COLORS[e.layer], borderColor: LAYER_COLORS[e.layer] }}>
                  {LAYER_LABELS[e.layer] ?? e.layer}
                </span>
              )}
            </button>
          ))}
          {entities.length === 0 && <div className="soma-knowledge__empty">No entities found.</div>}
          {total > offset + limit && (
            <button className="soma-knowledge__more" onClick={() => setOffset(offset + limit)}>Load more...</button>
          )}
        </div>

        {selected && (
          <div className="soma-knowledge__detail">
            <div className="soma-knowledge__detail-header">
              <span className="soma-knowledge__type">{selected.type}</span>
              <strong>{selected.name}</strong>
              {selected.layer && (
                <span className="soma-knowledge__layer" style={{ color: LAYER_COLORS[selected.layer], borderColor: LAYER_COLORS[selected.layer] }}>
                  {LAYER_LABELS[selected.layer] ?? selected.layer}
                </span>
              )}
              <button className="soma-knowledge__close" onClick={() => setSelected(null)}>{'\u2715'}</button>
            </div>
            <div className="soma-knowledge__detail-body">
              <pre>{selected.body}</pre>
            </div>
            {selected.tags.length > 0 && (
              <div className="soma-knowledge__tags">
                {selected.tags.map((t) => <span key={t} className="soma-knowledge__tag">{t}</span>)}
              </div>
            )}
            {selected.related.length > 0 && (
              <div className="soma-knowledge__related">
                <strong>Related:</strong>
                {selected.related.map((r) => {
                  const [rType, ...rId] = r.split('/');
                  return (
                    <button key={r} className="soma-knowledge__link" onClick={() => fetchDetail(rType, rId.join('/'))}>
                      {r}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
