import type { PageId } from './shell';

const COPY: Record<PageId, { eyebrow: string; title: string; subtitle: string }> = {
  overview: {
    eyebrow: 'Control Plane \u00B7 last 24h',
    title: 'Fleet Overview',
    subtitle: 'Redesign in progress \u2014 will arrive in the Phase 2 PR.',
  },
  agents: {
    eyebrow: 'Agent',
    title: 'Agent Profile',
    subtitle: 'Select an agent from the sidebar. Redesign arrives in Phase 3.',
  },
  mining: {
    eyebrow: 'AgentFlow \u00B7 Process Mining',
    title: 'Patterns across runs',
    subtitle: 'Redesign arrives in Phase 5.',
  },
  guards: {
    eyebrow: 'AgentFlow \u00B7 Runtime Guards',
    title: 'Adaptive enforcement',
    subtitle: 'Redesign arrives in Phase 5.',
  },
  soma: {
    eyebrow: 'AgentFlow add-on \u00B7 SOMA',
    title: 'Organizational intelligence',
    subtitle: 'Redesign arrives in Phase 6.',
  },
  org: {
    eyebrow: 'Enterprise \u00B7 Governance',
    title: 'Organizational governance',
    subtitle: 'Redesign arrives in Phase 6.',
  },
};

export function Placeholder({ page }: { page: PageId }) {
  const c = COPY[page];
  return (
    <div className="page">
      <div className="page__header">
        <div>
          <div className="page__eyebrow">{c.eyebrow}</div>
          <div className="page__title">{c.title}</div>
          <div className="page__subtitle">{c.subtitle}</div>
        </div>
      </div>
      <div className="page__body">
        <div
          className="v2-card"
          style={{ padding: 'var(--s-8)', textAlign: 'center', color: 'var(--t-2)' }}
        >
          <p style={{ fontSize: 'var(--fs-13)' }}>
            The shell is live. Page content is being redesigned one phase at a time.
          </p>
          <p
            style={{
              marginTop: 'var(--s-4)',
              fontSize: 'var(--fs-11)',
              color: 'var(--t-3)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            page = {page}
          </p>
        </div>
      </div>
    </div>
  );
}
