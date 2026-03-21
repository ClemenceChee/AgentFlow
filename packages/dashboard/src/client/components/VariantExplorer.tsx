import { useState } from 'react';
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

export function VariantExplorer({
  variants,
  modelVariants,
  isPro,
}: {
  variants: ProcessVariant[];
  modelVariants?: ProcessVariant[];
  isPro?: boolean;
}) {
  const [byModel, setByModel] = useState(false);
  const displayVariants = byModel && modelVariants ? modelVariants : variants;

  if (variants.length === 0) return <div className="workspace__empty">No variants discovered</div>;

  return (
    <div className="variants">
      {isPro && modelVariants && (
        <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontSize: 12, color: 'var(--t2)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={byModel}
              onChange={(e) => setByModel(e.target.checked)}
              style={{ marginRight: 4 }}
            />
            By Model
          </label>
        </div>
      )}
      {displayVariants.map((v, i) => {
        // Split on | to separate path from model info
        const sigParts = v.pathSignature.split('|');
        const pathPart = sigParts[0] ?? v.pathSignature;
        const modelPart = sigParts.find((p) => p.startsWith('model:'));
        const steps = pathPart.split('\u2192').map((s) => s.trim());
        const isHappy = i === 0;
        return (
          <div key={v.pathSignature} className={`var-row ${isHappy ? 'var-row--happy' : ''}`}>
            <div className="var-row__header">
              <span className="var-row__rank">#{i + 1}</span>
              {isHappy && <span className="var-row__badge">Happy Path</span>}
              {modelPart && (
                <span
                  className="var-row__badge"
                  style={{ background: 'rgba(130,80,223,0.15)', color: '#8250df' }}
                >
                  {modelPart.replace('model:', '')}
                </span>
              )}
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
