import { Card } from '../atoms';

const FEATURES: [string, string, string][] = [
  [
    '\u25A0',
    'Knowledge Vault',
    'Four-layer architecture: Archive, Working, Emerging, Canon. Machine proposals flow through human review before becoming truth.',
  ],
  [
    '\u25B3',
    'Guard Policies',
    'Enforcement rules that shape agent behavior. Warn, block, or abort based on learned patterns. Fed into AgentFlow guards.',
  ],
  [
    '\u25C7',
    'Insight Engine',
    'LLM-synthesized explanations (BYOL). Cross-agent failure analysis, drift detection, contradiction spotting.',
  ],
  [
    '\u25A3',
    'Session Correlation',
    '92%+ cross-operator accuracy. Track handoffs, collaboration patterns, knowledge transfer.',
  ],
  [
    '\u25C8',
    'Evidence Chains',
    'Every Canon fact traces back to raw execution evidence. Provenance built into the vault.',
  ],
  [
    '\u25B2',
    'Cartographer',
    'Maps cross-agent dependencies and domain boundaries. Discover which agents touch which knowledge.',
  ],
];

export function SomaLockedTeaser({ onUpgrade }: { onUpgrade?: () => void }) {
  return (
    <div className="page">
      <div className="page__header">
        <div>
          <div className="page__eyebrow">AgentFlow add-on {'\u00B7'} Preview</div>
          <div className="page__title">SOMA {'\u2014'} Organizational Intelligence</div>
          <div className="page__subtitle">
            AgentFlow tells you what happened. SOMA tells you what it means.
          </div>
        </div>
        <div className="page__head-actions">
          <button type="button" className="v2-btn v2-btn--sm">
            Docs
          </button>
          <button type="button" className="v2-btn v2-btn--primary v2-btn--sm" onClick={onUpgrade}>
            Unlock Pro
          </button>
        </div>
      </div>
      <div className="page__body">
        <div
          style={{
            padding: '40px 32px',
            background: 'var(--bg-2)',
            border: '1px solid var(--bd)',
            borderRadius: 'var(--radius)',
            textAlign: 'center',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'radial-gradient(ellipse at top, var(--accent-weak), transparent 60%)',
              opacity: 0.5,
              pointerEvents: 'none',
            }}
          />
          <div style={{ position: 'relative', maxWidth: 720, margin: '0 auto' }}>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--fs-10)',
                color: 'var(--accent)',
                letterSpacing: '.14em',
                textTransform: 'uppercase',
                marginBottom: 14,
              }}
            >
              {'\u{1F512}'} Premium Add-on
            </div>
            <h2
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'var(--fs-32)',
                fontWeight: 600,
                letterSpacing: '-.02em',
                marginBottom: 10,
              }}
            >
              Turn agent traces into organizational knowledge
            </h2>
            <p
              style={{
                color: 'var(--t-2)',
                fontSize: 'var(--fs-14)',
                lineHeight: 1.55,
                marginBottom: 24,
              }}
            >
              SOMA runs a worker cascade {'\u2014'} Harvester {'\u2192'} Reconciler {'\u2192'}{' '}
              Synthesizer {'\u2192'} Cartographer {'\u2014'} that ingests AgentFlow traces,
              synthesizes cross-agent patterns, and feeds learned policies back into guards through
              the Policy Bridge.
            </p>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--fs-12)',
                color: 'var(--t-3)',
                marginBottom: 24,
              }}
            >
              Agents execute {'\u2192'} AgentFlow traces {'\u2192'}{' '}
              <span style={{ color: 'var(--accent)' }}>SOMA cascade</span> {'\u2192'} Knowledge
              vault {'\u2192'} Policy Bridge {'\u2192'} Guards adapt
            </div>
            <button type="button" className="v2-btn v2-btn--primary" onClick={onUpgrade}>
              {'\u25B6'} Unlock preview access
            </button>
          </div>
        </div>

        <div className="v2-grid v2-grid-3">
          {FEATURES.map(([icon, title, desc]) => (
            <div
              key={title}
              style={{
                padding: 18,
                background: 'var(--bg-2)',
                border: '1px solid var(--bd)',
                borderRadius: 'var(--radius)',
              }}
            >
              <div
                style={{
                  fontSize: 22,
                  marginBottom: 8,
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--accent)',
                }}
              >
                {icon}
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 600,
                  marginBottom: 6,
                }}
              >
                {title}
              </div>
              <div
                style={{
                  color: 'var(--t-2)',
                  fontSize: 'var(--fs-12)',
                  lineHeight: 1.5,
                }}
              >
                {desc}
              </div>
            </div>
          ))}
        </div>

        <Card title="What you'll see when unlocked">
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 12,
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--fs-12)',
            }}
          >
            {[
              'Intelligence \u00B7 drift + insights',
              'Review queue \u00B7 promote to Canon',
              'Policies \u00B7 adaptive enforcement',
              'Knowledge explorer \u00B7 search memories',
              'Activity feed \u00B7 live cascade',
              'Evidence chain \u00B7 trace \u2192 insight',
            ].map((x) => (
              <div
                key={x}
                style={{
                  padding: '8px 10px',
                  background: 'var(--bg-2)',
                  borderLeft: '2px solid var(--accent)',
                  borderRadius: 2,
                }}
              >
                {x}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
