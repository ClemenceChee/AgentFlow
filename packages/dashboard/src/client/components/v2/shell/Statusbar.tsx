import { useEffect, useState } from 'react';
import { Dot } from '../atoms/Dot';
import type { Theme, Variant } from './useTweaks';

export function Statusbar({
  variant,
  theme,
  selectedAgent,
  tracesCount,
  health,
}: {
  variant: Variant;
  theme: Theme;
  selectedAgent: string | null;
  tracesCount: number;
  health?: 'healthy' | 'degraded' | 'offline';
}) {
  const [clock, setClock] = useState(() => new Date().toLocaleTimeString([], { hour12: false }));

  useEffect(() => {
    const id = setInterval(
      () => setClock(new Date().toLocaleTimeString([], { hour12: false })),
      1000,
    );
    return () => clearInterval(id);
  }, []);

  const h = health ?? 'healthy';
  const dot = h === 'healthy' ? 'ok' : h === 'degraded' ? 'warn' : 'fail';

  return (
    <footer className="statusbar">
      <span className="statusbar__item">
        <Dot kind={dot} /> <strong>{h}</strong>
      </span>
      <span className="statusbar__sep">{'\u2502'}</span>
      <span className="statusbar__item">
        variant <strong>{variant}</strong>
      </span>
      <span className="statusbar__sep">{'\u2502'}</span>
      <span className="statusbar__item">
        theme <strong>{theme}</strong>
      </span>
      <span className="statusbar__sep">{'\u2502'}</span>
      <span className="statusbar__item">
        agent <strong>{selectedAgent ?? '\u2014'}</strong>
      </span>
      <span className="statusbar__sep">{'\u2502'}</span>
      <span className="statusbar__item">
        traces <strong>{tracesCount}</strong>
      </span>
      <span className="statusbar__spacer" />
      <span className="statusbar__item">ws://live {'\u2713'}</span>
      <span className="statusbar__sep">{'\u2502'}</span>
      <span className="statusbar__item">{clock}</span>
    </footer>
  );
}
