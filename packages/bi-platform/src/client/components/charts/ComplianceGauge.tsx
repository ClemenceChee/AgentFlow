import React from 'react';

interface Props {
  score: number; // 0-100
  label?: string;
  size?: number;
}

export function ComplianceGauge({ score, label, size = 120 }: Props) {
  const r = (size - 16) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 90 ? 'var(--ok)' : score >= 70 ? 'var(--warn)' : 'var(--fail)';

  return (
    <div className="bi-gauge">
      <div className="bi-gauge__circle" style={{ width: size, height: size }}>
        <svg viewBox={`0 0 ${size} ${size}`}>
          <circle className="bi-gauge__bg" cx={size / 2} cy={size / 2} r={r} />
          <circle
            className="bi-gauge__fill"
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
          />
        </svg>
        <div className="bi-gauge__value" style={{ color }}>{score.toFixed(0)}%</div>
      </div>
      {label && <div className="bi-gauge__label">{label}</div>}
    </div>
  );
}
