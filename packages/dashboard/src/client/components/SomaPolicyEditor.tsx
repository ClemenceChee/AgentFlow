import { useCallback, useEffect, useState } from 'react';

interface Policy {
  name: string;
  enforcement: string;
  scope: string;
  conditions: string;
}

export function SomaPolicyEditor() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [newPolicy, setNewPolicy] = useState({ name: '', enforcement: 'warn', scope: '', conditions: '' });
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchPolicies = useCallback(async () => {
    try {
      const res = await fetch('/api/soma/policies');
      if (res.ok) {
        const data = await res.json();
        setPolicies(data.policies ?? []);
      }
    } catch { /* retry */ }
  }, []);

  useEffect(() => { fetchPolicies(); }, [fetchPolicies]);

  const handleCreate = async () => {
    if (!newPolicy.name) return;
    try {
      const res = await fetch('/api/soma/policies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPolicy),
      });
      if (res.ok) {
        setShowForm(false);
        setNewPolicy({ name: '', enforcement: 'warn', scope: '', conditions: '' });
        await fetchPolicies();
      }
    } catch { /* show error */ }
  };

  const handleDelete = async (name: string) => {
    if (deleting === name) {
      try {
        await fetch(`/api/soma/policies/${encodeURIComponent(name)}`, { method: 'DELETE' });
        setDeleting(null);
        await fetchPolicies();
      } catch { /* show error */ }
    } else {
      setDeleting(name);
    }
  };

  const enforcementColor = (e: string) =>
    e === 'abort' ? '#f85149' : e === 'error' ? '#f85149' : e === 'warn' ? '#d29922' : '#58a6ff';

  return (
    <div className="soma-policies">
      <div className="soma-policies__header">
        <h3>Guard Policies</h3>
        <button className="soma-policies__add" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : '+ New Policy'}
        </button>
      </div>

      {showForm && (
        <div className="soma-policies__form">
          <input placeholder="Policy name" value={newPolicy.name} onChange={(e) => setNewPolicy({ ...newPolicy, name: e.target.value })} />
          <select value={newPolicy.enforcement} onChange={(e) => setNewPolicy({ ...newPolicy, enforcement: e.target.value })}>
            <option value="info">Info</option>
            <option value="warn">Warn</option>
            <option value="error">Error</option>
            <option value="abort">Abort</option>
          </select>
          <input placeholder="Scope (e.g. agent:*, all)" value={newPolicy.scope} onChange={(e) => setNewPolicy({ ...newPolicy, scope: e.target.value })} />
          <input placeholder="Conditions" value={newPolicy.conditions} onChange={(e) => setNewPolicy({ ...newPolicy, conditions: e.target.value })} />
          <button className="soma-policies__submit" onClick={handleCreate}>Create</button>
        </div>
      )}

      <div className="soma-policies__list">
        {policies.length === 0 && <div className="soma-policies__empty">No policies defined yet.</div>}
        {policies.map((p) => (
          <div key={p.name} className="soma-policies__row">
            <span className="soma-policies__name">{p.name}</span>
            <span className="soma-policies__badge" style={{ color: enforcementColor(p.enforcement), borderColor: enforcementColor(p.enforcement) }}>
              {p.enforcement.toUpperCase()}
            </span>
            <span className="soma-policies__scope">{p.scope}</span>
            <span className="soma-policies__cond">{p.conditions}</span>
            <button className="soma-policies__del" onClick={() => handleDelete(p.name)}>
              {deleting === p.name ? 'Confirm?' : '\u{2715}'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
