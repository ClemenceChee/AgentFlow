import type { FullTrace } from '../hooks/useSelectedTrace';

export function StateMachine({ trace }: { trace: FullTrace }) {
  const nodes = Object.values(trace.nodes);
  const states = [
    { name: 'Pending', count: nodes.filter((n) => n.status === 'pending').length, color: 'var(--t3)', icon: '\u25CB' },
    { name: 'Running', count: nodes.filter((n) => n.status === 'running').length, color: 'var(--info)', icon: '\u25CF' },
    { name: 'Completed', count: nodes.filter((n) => n.status === 'completed').length, color: 'var(--ok)', icon: '\u2714' },
    { name: 'Failed', count: nodes.filter((n) => n.status === 'failed').length, color: 'var(--fail)', icon: '\u2718' },
  ];
  const total = nodes.length;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--s3)', padding: 'var(--s3) 0', flexWrap: 'wrap' }}>
        {states.map((s, i) => (
          <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 'var(--s2)' }}>
            <div style={{ border: `2px solid ${s.color}`, borderRadius: 'var(--r)', padding: 'var(--s2) var(--s3)', textAlign: 'center', minWidth: 80, background: s.count > 0 ? 'var(--bg3)' : 'var(--bg2)', color: s.count > 0 ? s.color : 'var(--t3)' }}>
              <div style={{ fontSize: 'var(--xl)' }}>{s.icon}</div>
              <div style={{ fontSize: 'var(--xs)', fontWeight: 600 }}>{s.name}</div>
              <div style={{ fontSize: 'var(--lg)', fontFamily: 'var(--fm)', fontWeight: 700 }}>{s.count}</div>
            </div>
            {i < states.length - 1 && <span style={{ color: 'var(--t3)', fontSize: 'var(--xl)' }}>{'\u2192'}</span>}
          </div>
        ))}
      </div>
      {states.filter((s) => s.count > 0).map((s) => (
        <div key={s.name} style={{ marginBottom: 'var(--s2)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--xs)', marginBottom: 2 }}>
            <span>{s.icon} {s.name}</span>
            <span style={{ color: 'var(--t3)' }}>{s.count} ({total > 0 ? ((s.count / total) * 100).toFixed(0) : 0}%)</span>
          </div>
          <div style={{ height: 6, background: 'var(--bg3)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${total > 0 ? (s.count / total) * 100 : 0}%`, background: s.color, borderRadius: 3 }} />
          </div>
        </div>
      ))}
    </div>
  );
}
