import type { ProcessVariant } from '../hooks/useProcessModel';

const STEP_COLORS = [
  '#58a6ff',
  '#bc8cff',
  '#d29922',
  '#56d364',
  '#f0883e',
  '#ff7b72',
  '#a5d6ff',
  '#ffa657',
];

export function VariantExplorer({ variants }: { variants: ProcessVariant[] }) {
  if (variants.length === 0) return <div className="workspace__empty">No variants discovered</div>;

  return (
    <div className="variants">
      {variants.map((v, i) => {
        const steps = v.pathSignature.split('\u2192').map((s) => s.trim());
        const isHappy = i === 0;
        return (
          <div key={v.pathSignature} className={`var-row ${isHappy ? 'var-row--happy' : ''}`}>
            <div className="var-row__header">
              <span className="var-row__rank">#{i + 1}</span>
              {isHappy && <span className="var-row__badge">Happy Path</span>}
              <span className="var-row__count">
                {v.count} ({v.percentage.toFixed(1)}%)
              </span>
              <span className="var-row__pct-bar">
                <span className="var-row__pct-fill" style={{ width: `${v.percentage}%` }} />
              </span>
            </div>
            <div className="var-row__steps">
              {steps.map((step, si) => (
                <span key={si}>
                  {si > 0 && <span className="var-row__arrow">{'\u2192'}</span>}
                  <span
                    className="var-row__step"
                    style={{ borderColor: STEP_COLORS[si % STEP_COLORS.length] }}
                  >
                    {step}
                  </span>
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
