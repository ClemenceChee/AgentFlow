import { useMemo } from 'react';
import type { TraceEntry } from '../hooks/useTraces';

function fmtDur(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(0)}m`;
}

function fmtTime(ts: number): string {
  if (ts <= 0) return '';
  return new Date(ts).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface Props {
  agentId: string | null;
  /** Original agentIds before dedup merge (for filtering traces) */
  sourceAgentIds?: string[];
  traces: TraceEntry[];
  selectedFilename: string | null;
  onSelect: (filename: string, agentId: string) => void;
}

export function ExecSidebar({
  agentId,
  sourceAgentIds,
  traces,
  selectedFilename,
  onSelect,
}: Props) {
  const agentTraces = useMemo(() => {
    if (!agentId) return [];
    // Match by agentId directly, or by any of the source IDs (for merged agents)
    const matchIds = new Set([agentId, ...(sourceAgentIds ?? [])]);
    const sorted = traces
      .filter((t) => matchIds.has(t.agentId))
      .sort((a, b) => {
        // Sort by last activity (end time = start + duration), most recent first
        const aEnd = a.timestamp + a.duration;
        const bEnd = b.timestamp + b.duration;
        return bEnd - aEnd;
      });
    // Collapse near-simultaneous duplicates from overlapping schedulers
    // (e.g. long-running worker + one-shot timer firing the same agent within seconds).
    // Prefer a successful trace over a failed one when both are present in the window.
    const DEDUP_WINDOW_MS = 5000;
    const deduped: typeof sorted = [];
    for (const t of sorted) {
      const nearIdx = deduped.findIndex(
        (o) => Math.abs(o.timestamp - t.timestamp) < DEDUP_WINDOW_MS && o.nodeCount === t.nodeCount,
      );
      if (nearIdx === -1) {
        deduped.push(t);
      } else if (deduped[nearIdx].status === 'failed' && t.status !== 'failed') {
        deduped[nearIdx] = t;
      }
    }
    return deduped;
  }, [traces, agentId, sourceAgentIds]);

  const maxDur = useMemo(() => Math.max(...agentTraces.map((t) => t.duration), 1), [agentTraces]);
  const failCount = agentTraces.filter((t) => t.status === 'failed').length;

  return (
    <div className="exec-sidebar">
      <div className="exec-sidebar__head">
        {agentId ? (
          <>
            <span className="exec-sidebar__agent">{agentId}</span>
            <span className="exec-sidebar__count">
              {agentTraces.length}
              {failCount > 0 && <span className="exec-sidebar__fails"> {failCount}!</span>}
            </span>
          </>
        ) : (
          <span className="exec-sidebar__empty">No agent</span>
        )}
      </div>
      <div className="exec-sidebar__list">
        {agentTraces.slice(0, 100).map((t) => {
          const fail = t.status === 'failed';
          const sel = t.traceKey === selectedFilename || t.filename === selectedFilename;
          const barW = Math.max(3, (t.duration / maxDur) * 100);
          return (
            <button
              type="button"
              key={t.traceKey}
              className={`erow ${fail ? 'erow--fail' : ''} ${sel ? 'erow--sel' : ''}`}
              onClick={() => onSelect(t.traceKey, t.agentId)}
            >
              <span className="erow__icon">{fail ? '\u2718' : '\u2714'}</span>
              <span className="erow__time">{fmtTime(t.timestamp)}</span>
              <span className="erow__n">{t.nodeCount}n</span>
              <span className="erow__dur">{fmtDur(t.duration)}</span>
              <span className="erow__bar">
                <span
                  className={`erow__fill ${fail ? 'erow__fill--fail' : 'erow__fill--ok'}`}
                  style={{ width: `${barW}%` }}
                />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
