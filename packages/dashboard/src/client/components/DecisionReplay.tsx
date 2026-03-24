/**
 * Decision Replay — step-by-step visualization of an agent's decision chain.
 * Shows action, reasoning, tool, outcome, and duration for each decision.
 */

import { useEffect, useState } from 'react';

interface Decision {
  action: string;
  reasoning?: string;
  tool?: string;
  outcome: 'ok' | 'failed' | 'timeout' | 'skipped';
  output?: string;
  error?: string;
  durationMs?: number;
  index: number;
}

interface DecisionData {
  decisions: Decision[];
  pattern: string;
}

function fmtDur(ms: number | undefined): string {
  if (ms == null) return '';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

const OUTCOME_STYLE: Record<string, { icon: string; className: string }> = {
  ok: { icon: '\u2714', className: 'dr-ok' },
  failed: { icon: '\u2718', className: 'dr-fail' },
  timeout: { icon: '\u23F1', className: 'dr-fail' },
  skipped: { icon: '\u25CB', className: 'dr-skip' },
};

export function DecisionReplay({ filename }: { filename: string }) {
  const [data, setData] = useState<DecisionData | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  useEffect(() => {
    fetch(`/api/traces/${encodeURIComponent(filename)}/decisions`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => {});
  }, [filename]);

  if (!data) return null;
  if (data.decisions.length === 0) {
    return (
      <div className="decision-replay">
        <em>No decision-level data available for this execution.</em>
      </div>
    );
  }

  const ok = data.decisions.filter((d) => d.outcome === 'ok').length;
  const failed = data.decisions.filter((d) => d.outcome === 'failed').length;

  return (
    <div className="decision-replay">
      <div className="decision-replay__summary">
        <strong>{data.decisions.length}</strong> decisions
        <span className="dr-ok"> {ok} ok</span>
        {failed > 0 && <span className="dr-fail"> {failed} failed</span>}
      </div>

      <div className="decision-replay__pattern">
        <strong>Pattern:</strong> <code>{data.pattern}</code>
      </div>

      <div className="decision-replay__steps">
        {data.decisions.map((d) => {
          const style = OUTCOME_STYLE[d.outcome] ?? OUTCOME_STYLE.ok!;
          const isExpanded = expanded.has(d.index);

          return (
            <button
              type="button"
              key={d.index}
              className={`decision-replay__step ${style.className}`}
              onClick={() => {
                const next = new Set(expanded);
                if (isExpanded) next.delete(d.index);
                else next.add(d.index);
                setExpanded(next);
              }}
            >
              <div className="decision-replay__step-header">
                <span className="decision-replay__idx">{d.index + 1}</span>
                <span className="decision-replay__icon">{style.icon}</span>
                <span className="decision-replay__action">{d.action}</span>
                <span className="decision-replay__dur">{fmtDur(d.durationMs)}</span>
              </div>

              {isExpanded && (
                <div className="decision-replay__detail">
                  {d.reasoning && (
                    <div className="decision-replay__reasoning">
                      <strong>Why:</strong> {d.reasoning}
                    </div>
                  )}
                  {d.output && d.outcome === 'ok' && (
                    <div className="decision-replay__output">
                      <strong>Result:</strong> {d.output}
                    </div>
                  )}
                  {d.error && (
                    <div className="decision-replay__error">
                      <strong>Error:</strong> {d.error}
                    </div>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
