import { useCallback, useEffect, useState } from 'react';
import type { GroupedAgents } from '../../../hooks/useAgents';
import { Sidebar } from './Sidebar';
import { Statusbar } from './Statusbar';
import { type PageId, TOPBAR_TABS, Topbar } from './Topbar';
import { TweaksPanel, TweaksToggle } from './Tweaks';
import { isTweaksAvailable, useTweaks } from './useTweaks';

export interface ShellProps {
  page: PageId;
  onPage: (p: PageId) => void;
  grouped: GroupedAgents | null;
  selectedAgent: string | null;
  onSelectAgent: (id: string) => void;
  showSidebar?: boolean;
  tracesCount: number;
  version?: string;
  health?: 'healthy' | 'degraded' | 'offline';
  children: React.ReactNode;
}

export function Shell({
  page,
  onPage,
  grouped,
  selectedAgent,
  onSelectAgent,
  showSidebar = true,
  tracesCount,
  version,
  health,
  children,
}: ShellProps) {
  const [tweaks, setTweaks] = useTweaks();
  const [tweaksOpen, setTweaksOpen] = useState(false);
  const tweaksAvailable = isTweaksAvailable();

  // Keyboard: number keys switch tabs
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return;
      const idx = Number.parseInt(e.key, 10);
      if (idx >= 1 && idx <= TOPBAR_TABS.length) {
        onPage(TOPBAR_TABS[idx - 1].id);
      }
      if (e.key === 'Escape') setTweaksOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onPage]);

  const toggleVariant = useCallback(
    () => setTweaks((s) => ({ ...s, variant: s.variant === 'console' ? 'atlas' : 'console' })),
    [setTweaks],
  );
  const toggleTheme = useCallback(
    () => setTweaks((s) => ({ ...s, theme: s.theme === 'dark' ? 'light' : 'dark' })),
    [setTweaks],
  );

  return (
    <div className="v2">
      <div className="shell">
        <Topbar
          page={page}
          onPage={onPage}
          variant={tweaks.variant}
          onVariantToggle={toggleVariant}
          theme={tweaks.theme}
          onThemeToggle={toggleTheme}
          tier={tweaks.tier}
          version={version}
        />

        {showSidebar ? (
          <Sidebar
            grouped={grouped}
            selectedAgent={selectedAgent}
            onSelectAgent={onSelectAgent}
            collapsed={tweaks.sidebar === 'collapsed'}
          />
        ) : (
          <aside className="shell__sidebar is-collapsed" aria-hidden />
        )}

        <main className="shell__main">{children}</main>

        <Statusbar
          variant={tweaks.variant}
          theme={tweaks.theme}
          selectedAgent={selectedAgent}
          tracesCount={tracesCount}
          health={health}
        />
      </div>

      {tweaksAvailable &&
        (tweaksOpen ? (
          <TweaksPanel state={tweaks} setState={setTweaks} onClose={() => setTweaksOpen(false)} />
        ) : (
          <TweaksToggle onOpen={() => setTweaksOpen(true)} />
        ))}
    </div>
  );
}

export { type PageId, TOPBAR_TABS } from './Topbar';
export type { Density, Theme, Tier, Tweaks, Variant } from './useTweaks';
export { isTweaksAvailable, useTweaks } from './useTweaks';
