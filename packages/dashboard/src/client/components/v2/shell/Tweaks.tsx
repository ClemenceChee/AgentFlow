import {
  ACCENT_SWATCHES,
  type AccentKey,
  type Density,
  type SidebarState,
  type Theme,
  type Tier,
  type Tweaks as TweaksState,
  type Variant,
} from './useTweaks';

type Option<V extends string> = { v: V; l: string };

function Seg<V extends string>({
  value,
  options,
  onChange,
}: {
  value: V;
  options: Option<V>[];
  onChange: (v: V) => void;
}) {
  return (
    <fieldset className="tweaks__seg" style={{ border: 'none', padding: 0 }}>
      {options.map((o) => (
        <button
          type="button"
          key={o.v}
          className={value === o.v ? 'is-on' : ''}
          onClick={() => onChange(o.v)}
          aria-pressed={value === o.v}
        >
          {o.l}
        </button>
      ))}
    </fieldset>
  );
}

export function TweaksPanel({
  state,
  setState,
  onClose,
}: {
  state: TweaksState;
  setState: (next: TweaksState | ((prev: TweaksState) => TweaksState)) => void;
  onClose: () => void;
}) {
  const update =
    <K extends keyof TweaksState>(key: K) =>
    (v: TweaksState[K]) =>
      setState((s) => ({ ...s, [key]: v }));

  return (
    <div
      className="tweaks"
      role="dialog"
      aria-label="Dashboard tweaks"
      // biome-ignore lint/a11y/noNoninteractiveTabindex: dialog region
      tabIndex={-1}
    >
      <div className="tweaks__head">
        <div className="tweaks__title">Tweaks</div>
        <button
          type="button"
          className="tweaks__close"
          onClick={onClose}
          aria-label="Close tweaks"
          title="Close"
        >
          {'\u00D7'}
        </button>
      </div>
      <div className="tweaks__body">
        <div className="tweaks__row">
          {/* biome-ignore lint/a11y/noLabelWithoutControl: visual label for a group */}
          <label>Variant</label>
          <Seg<Variant>
            value={state.variant}
            options={[
              { v: 'console', l: 'Console' },
              { v: 'atlas', l: 'Atlas' },
            ]}
            onChange={update('variant')}
          />
        </div>
        <div className="tweaks__row">
          {/* biome-ignore lint/a11y/noLabelWithoutControl: visual label for a group */}
          <label>Theme</label>
          <Seg<Theme>
            value={state.theme}
            options={[
              { v: 'dark', l: 'Dark' },
              { v: 'light', l: 'Light' },
            ]}
            onChange={update('theme')}
          />
        </div>
        <div className="tweaks__row">
          {/* biome-ignore lint/a11y/noLabelWithoutControl: visual label for a group */}
          <label>Density</label>
          <Seg<Density>
            value={state.density}
            options={[
              { v: 'comfortable', l: 'Comfortable' },
              { v: 'compact', l: 'Compact' },
            ]}
            onChange={update('density')}
          />
        </div>
        <div className="tweaks__row">
          {/* biome-ignore lint/a11y/noLabelWithoutControl: visual label for a group */}
          <label>Sidebar</label>
          <Seg<SidebarState>
            value={state.sidebar}
            options={[
              { v: 'expanded', l: 'Expanded' },
              { v: 'collapsed', l: 'Collapsed' },
            ]}
            onChange={update('sidebar')}
          />
        </div>
        <div className="tweaks__row">
          {/* biome-ignore lint/a11y/noLabelWithoutControl: visual label for a group */}
          <label>Tier</label>
          <Seg<Tier>
            value={state.tier}
            options={[
              { v: 'free', l: 'Free' },
              { v: 'pro', l: 'Pro' },
              { v: 'enterprise', l: 'Ent.' },
            ]}
            onChange={update('tier')}
          />
        </div>
        <div className="tweaks__row">
          {/* biome-ignore lint/a11y/noLabelWithoutControl: visual label for a group */}
          <label>Accent</label>
          <div className="tweaks__swatches">
            {(Object.entries(ACCENT_SWATCHES) as [AccentKey, string][]).map(([k, c]) => (
              <button
                type="button"
                key={k}
                className={`tweaks__swatch ${state.accent === k ? 'is-on' : ''}`}
                style={{ background: c }}
                onClick={() => update('accent')(k)}
                aria-label={`Accent: ${k}`}
                aria-pressed={state.accent === k}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function TweaksToggle({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      className="tweaks-toggle"
      onClick={onOpen}
      aria-label="Open tweaks"
      title="Tweaks (dev)"
    >
      {'\u2699'}
    </button>
  );
}
