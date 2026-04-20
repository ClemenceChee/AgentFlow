import type { Theme, Tier, Variant } from './useTweaks';

export type PageId = 'overview' | 'agents' | 'mining' | 'guards' | 'soma' | 'org';

interface TabDef {
  id: PageId;
  label: string;
  kbd: string;
  premium?: boolean;
  requiredTier?: Tier;
}

const TABS: TabDef[] = [
  { id: 'overview', label: 'Overview', kbd: '1' },
  { id: 'agents', label: 'Agents', kbd: '2' },
  { id: 'mining', label: 'Process Mining', kbd: '3' },
  { id: 'guards', label: 'Guards', kbd: '4' },
  { id: 'soma', label: 'SOMA', kbd: '5', premium: true, requiredTier: 'pro' },
  { id: 'org', label: 'Org', kbd: '6', premium: true, requiredTier: 'enterprise' },
];

function isLocked(tab: TabDef, tier: Tier): boolean {
  if (!tab.requiredTier) return false;
  if (tab.requiredTier === 'pro') return tier === 'free';
  if (tab.requiredTier === 'enterprise') return tier !== 'enterprise';
  return false;
}

export function Topbar({
  page,
  onPage,
  variant,
  onVariantToggle,
  theme,
  onThemeToggle,
  tier,
  version,
}: {
  page: PageId;
  onPage: (p: PageId) => void;
  variant: Variant;
  onVariantToggle: () => void;
  theme: Theme;
  onThemeToggle: () => void;
  tier: Tier;
  version?: string;
}) {
  return (
    <header className="topbar">
      <div className="topbar__brand">
        <div className="topbar__brand-mark" />
        <span className="topbar__brand-name">AgentFlow</span>
        {version && <span className="topbar__brand-sub">v{version}</span>}
      </div>
      <nav className="topbar__nav" aria-label="Primary">
        {TABS.map((t) => {
          const locked = isLocked(t, tier);
          return (
            <button
              type="button"
              key={t.id}
              className={page === t.id ? 'is-active' : ''}
              onClick={() => onPage(t.id)}
              title={locked ? `Requires ${t.requiredTier}` : t.label}
              aria-current={page === t.id ? 'page' : undefined}
            >
              {t.label}
              {t.premium && (
                <span
                  className={`badge-premium ${locked ? 'badge-premium--off' : 'badge-premium--on'}`}
                >
                  {locked ? '\u{1F512}' : '\u2726'}
                </span>
              )}
              <span className="kbd">{t.kbd}</span>
            </button>
          );
        })}
      </nav>
      <div className="topbar__spacer" />
      <search className="topbar__search" aria-label="Global jump">
        <span aria-hidden>{'\u2315'}</span>
        <span>jump to agent, trace, insight{'\u2026'}</span>
        <kbd>{'\u2318'}K</kbd>
      </search>
      <div className="topbar__right">
        <span className="topbar__live">
          <span className="topbar__live-dot" /> live
        </span>
        <span className={`topbar__tier ${tier !== 'free' ? 'is-active' : ''}`}>
          <strong>{tier.toUpperCase()}</strong>
        </span>
        <button
          type="button"
          className="topbar__iconbtn"
          title="Toggle theme"
          onClick={onThemeToggle}
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? '\u263D' : '\u2600'}
        </button>
        <button
          type="button"
          className="topbar__iconbtn"
          title="Toggle variant"
          onClick={onVariantToggle}
          aria-label="Toggle variant"
        >
          {variant === 'console' ? '\u25A8' : '\u25D0'}
        </button>
      </div>
    </header>
  );
}

export { TABS as TOPBAR_TABS };
