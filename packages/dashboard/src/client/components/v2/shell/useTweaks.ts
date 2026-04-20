import { useEffect, useState } from 'react';

export type Variant = 'console' | 'atlas';
export type Theme = 'dark' | 'light';
export type Density = 'comfortable' | 'compact';
export type SidebarState = 'expanded' | 'collapsed';
export type Tier = 'free' | 'pro' | 'enterprise';
export type AccentKey = 'amber' | 'teal' | 'indigo' | 'green' | 'red' | 'magenta';

export interface Tweaks {
  variant: Variant;
  theme: Theme;
  density: Density;
  sidebar: SidebarState;
  accent: AccentKey;
  tier: Tier;
}

const STORAGE_KEY = 'agentflow.v2.tweaks';

const DEFAULTS: Tweaks = {
  variant: 'console',
  theme: 'dark',
  density: 'comfortable',
  sidebar: 'expanded',
  accent: 'amber',
  tier: 'pro',
};

export const ACCENT_SWATCHES: Record<AccentKey, string> = {
  amber: 'oklch(0.82 0.15 80)',
  teal: 'oklch(0.68 0.14 205)',
  indigo: 'oklch(0.68 0.16 265)',
  green: 'oklch(0.72 0.17 145)',
  red: 'oklch(0.66 0.21 27)',
  magenta: 'oklch(0.70 0.22 330)',
};

function loadTweaks(): Tweaks {
  if (typeof window === 'undefined') return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return DEFAULTS;
  }
}

export function useTweaks() {
  const [tweaks, setTweaks] = useState<Tweaks>(loadTweaks);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tweaks));
    } catch {
      // ignore quota/privacy errors
    }
    const r = document.documentElement;
    r.setAttribute('data-variant', tweaks.variant);
    r.setAttribute('data-theme', tweaks.theme);
    r.setAttribute('data-density', tweaks.density);
    const color = ACCENT_SWATCHES[tweaks.accent];
    if (color) {
      r.style.setProperty('--accent', color);
      r.style.setProperty('--accent-weak', color.replace(')', ' / 0.18)'));
    }
  }, [tweaks]);

  return [tweaks, setTweaks] as const;
}

/** True when the Tweaks dev panel should be available.
 *  Matches the handoff's recommendation: do not ship in production. */
export function isTweaksAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as typeof window & { __AGENTFLOW_DEV?: boolean };
  if (w.__AGENTFLOW_DEV) return true;
  const env = typeof process !== 'undefined' ? process.env?.NODE_ENV : undefined;
  if (env && env !== 'production') return true;
  return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
}
