/**
 * Run receipt tab — structured summary of an agent execution.
 * Shows step table with status, duration, and optional token cost.
 */

import type { FullTrace } from '../hooks/useSelectedTrace';

function fmtDur(ms: number | null): string {
  if (ms === null) return '\u2014';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function extractTokenCost(node: Record<string, unknown>): number | null {
  const semantic = (node.metadata as Record<string, unknown> | undefined)?.semantic as
    | Record<string, unknown>
    | undefined;
  if (semantic?.tokenCost != null) return Number(semantic.tokenCost);
  const state = node.state as Record<string, unknown> | undefined;
  if (state?.tokenCost != null) return Number(state.tokenCost);
  return null;
}

interface Step {
  nodeId: string;
  name: string;
  type: string;
  status: string;
  durationMs: number | null;
  tokenCost: number | null;
  error: string | null;
}

export function RunReceiptView({ trace }: { trace: FullTrace }) {
  const nodes = Object.values(trace.nodes).sort((a, b) => (a.startTime ?? 0) - (b.startTime ?? 0));

  const steps: Step[] = nodes.map((n) => ({
    nodeId: n.id,
    name: n.name,
    type: n.type,
    status: n.status,
    durationMs: n.endTime != null ? n.endTime - n.startTime : null,
    tokenCost: extractTokenCost(n as Record<string, unknown>),
    error: n.state?.error
      ? String(n.state.error)
      : n.metadata?.error
        ? String(n.metadata.error)
        : null,
  }));

  const succeeded = steps.filter((s) => s.status === 'completed').length;
  const failed = steps.filter(
    (s) => s.status === 'failed' || s.status === 'hung' || s.status === 'timeout',
  ).length;
  const totalDur = trace.endTime ? trace.endTime - trace.startTime : null;
  const hasCost = steps.some((s) => s.tokenCost !== null);
  const totalCost = hasCost ? steps.reduce((sum, s) => sum + (s.tokenCost ?? 0), 0) : null;

  return (
    <div className="receipt">
      <div className="receipt__header">
        <div>
          <div className="receipt__header-label">Run ID</div>
          <div>{trace.id}</div>
        </div>
        <div>
          <div className="receipt__header-label">Agent</div>
          <div>{trace.agentId}</div>
        </div>
        <div>
          <div className="receipt__header-label">Status</div>
          <div className={trace.status === 'failed' ? 'c-fail' : 'c-ok'}>{trace.status}</div>
        </div>
        <div>
          <div className="receipt__header-label">Duration</div>
          <div>{fmtDur(totalDur)}</div>
        </div>
      </div>

      <div className="receipt__summary">
        <span className="receipt__summary-item">
          <strong>{steps.length}</strong> attempted
        </span>
        <span className="receipt__summary-item">
          <strong>{succeeded}</strong> succeeded
        </span>
        <span
          className="receipt__summary-item"
          style={{ color: failed > 0 ? 'var(--fail)' : undefined }}
        >
          <strong>{failed}</strong> failed
        </span>
      </div>

      <table className="receipt__table">
        <thead>
          <tr>
            <th>#</th>
            <th>Step</th>
            <th>Type</th>
            <th>Status</th>
            <th>Duration</th>
            {hasCost && <th>Tokens</th>}
          </tr>
        </thead>
        <tbody>
          {steps.map((step, i) => (
            <tr key={step.nodeId}>
              <td>{i + 1}</td>
              <td>{step.name}</td>
              <td>{step.type}</td>
              <td
                className={
                  step.status === 'failed' ? 'c-fail' : step.status === 'completed' ? 'c-ok' : ''
                }
              >
                {step.status}
              </td>
              <td>{fmtDur(step.durationMs)}</td>
              {hasCost && (
                <td>{step.tokenCost !== null ? step.tokenCost.toLocaleString() : '\u2014'}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="receipt__total">
        {totalCost !== null
          ? `Total: ${totalCost.toLocaleString()} tokens`
          : 'No cost data available'}
      </div>
    </div>
  );
}
