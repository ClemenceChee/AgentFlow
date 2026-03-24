/**
 * Structured guard violation explanation card.
 * Renders rule, threshold vs actual, source badge, and evidence.
 * Falls back to raw message when explanation field is missing.
 */

export interface GuardExplanation {
  rule: string;
  threshold: number | string;
  actual: number | string;
  source: 'static' | 'soma-policy' | 'adaptive' | 'assertion';
  evidence?: string;
}

export interface Violation {
  type: string;
  nodeId: string;
  message: string;
  timestamp: number;
  explanation?: GuardExplanation;
}

const SOURCE_LABELS: Record<string, { label: string; className: string }> = {
  static: { label: 'Static', className: 'guard-source--static' },
  'soma-policy': { label: 'SOMA Policy', className: 'guard-source--soma' },
  adaptive: { label: 'Adaptive', className: 'guard-source--adaptive' },
  assertion: { label: 'Assertion', className: 'guard-source--assertion' },
};

export function GuardExplanationCard({ violation }: { violation: Violation }) {
  const { explanation } = violation;

  if (!explanation) {
    // Backward compat: old violations without explanation
    return (
      <div className="guard-card">
        <div className="guard-card__type">{violation.type}</div>
        <div className="guard-card__message">{violation.message}</div>
      </div>
    );
  }

  const sourceInfo = SOURCE_LABELS[explanation.source] ??
    SOURCE_LABELS.static ?? { label: 'Unknown', className: 'guard-source--unknown' };

  return (
    <div className="guard-card">
      <div className="guard-card__header">
        <span className="guard-card__rule">{explanation.rule}</span>
        <span className={`guard-card__source ${sourceInfo.className}`}>{sourceInfo.label}</span>
      </div>
      <div className="guard-card__comparison">
        <span className="guard-card__actual">{String(explanation.actual)}</span>
        <span className="guard-card__arrow">{'\u2192'}</span>
        <span className="guard-card__threshold">limit {String(explanation.threshold)}</span>
      </div>
      {explanation.evidence && <div className="guard-card__evidence">{explanation.evidence}</div>}
    </div>
  );
}
