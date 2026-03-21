import { useMemo } from 'react';
import type { FullTrace, TraceNode } from '../hooks/useSelectedTrace';

function fmtDur(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(0)}m`;
}

function getDepth(id: string, nodes: Record<string, TraceNode>): number {
  let d = 0,
    n = nodes[id];
  while (n?.parentId && nodes[n.parentId]) {
    d++;
    n = nodes[n.parentId];
  }
  return d;
}

function categorize(n: TraceNode): { cat: string; icon: string; color: string } {
  const t = n.type.toLowerCase(),
    nm = n.name.toLowerCase();
  if (t === 'tool' || nm.includes('tool')) return { cat: 'Tool', icon: '\u2699', color: '#d29922' };
  if (nm.includes('llm') || nm.includes('pipeline'))
    return { cat: 'LLM', icon: '\u2726', color: '#bc8cff' };
  if (nm.includes('search') || nm.includes('web') || nm.includes('fetch'))
    return { cat: 'Search', icon: '\u2315', color: '#58a6ff' };
  if (nm.includes('embed')) return { cat: 'Embed', icon: '\u25A3', color: '#f0883e' };
  if (nm.includes('write') || nm.includes('save') || nm.includes('store') || nm.includes('tag'))
    return { cat: 'Write', icon: '\u270E', color: '#56d364' };
  if (nm.includes('read') || nm.includes('scan') || nm.includes('watch') || nm.includes('label'))
    return { cat: 'Read', icon: '\u2630', color: '#a5d6ff' };
  if (t === 'agent' || t === 'daemon') return { cat: 'Agent', icon: '\u25C9', color: '#58a6ff' };
  return { cat: n.type, icon: '\u25CB', color: '#8b949e' };
}

/**
 * Build a tree-aware reversed list: root-level nodes are sorted most-recent-first,
 * but children stay grouped under their parent in chronological order.
 */
function buildReversedTree(nodes: Record<string, TraceNode>): TraceNode[] {
  const all = Object.values(nodes);
  const roots = all.filter((n) => !n.parentId || !nodes[n.parentId]);
  const childrenOf = new Map<string, TraceNode[]>();

  for (const n of all) {
    if (n.parentId && nodes[n.parentId]) {
      const siblings = childrenOf.get(n.parentId) ?? [];
      siblings.push(n);
      childrenOf.set(n.parentId, siblings);
    }
  }

  // Sort roots by startTime descending (most recent first)
  roots.sort((a, b) => b.startTime - a.startTime);

  // Flatten: each root followed by its children (chronological, recursive)
  const result: TraceNode[] = [];
  function walk(node: TraceNode) {
    result.push(node);
    const children = childrenOf.get(node.id);
    if (children) {
      children.sort((a, b) => a.startTime - b.startTime);
      for (const child of children) walk(child);
    }
  }
  for (const root of roots) walk(root);

  return result;
}

export function AgentFlow({ trace }: { trace: FullTrace }) {
  const steps = useMemo(() => buildReversedTree(trace.nodes), [trace.nodes]);

  return (
    <div className="aflow">
      {steps.map((node) => {
        const c = categorize(node);
        const dur = (node.endTime ?? node.startTime) - node.startTime;
        const fail = node.status === 'failed';
        const depth = getDepth(node.id, trace.nodes);

        return (
          <div
            key={node.id}
            className={`af-step ${fail ? 'af-step--fail' : ''}`}
            style={{ marginLeft: depth * 16 }}
          >
            <div className="af-step__line" />
            <div className="af-step__row">
              <span
                className="af-step__icon"
                style={{ color: fail ? 'var(--color-critical)' : c.color }}
              >
                {fail ? '\u2718' : c.icon}
              </span>
              <span className="af-step__cat" style={{ color: c.color }}>
                {c.cat}
              </span>
              <span className="af-step__name">{node.name}</span>
              <span className="af-step__dur">{fmtDur(dur)}</span>
              <span className="af-step__ts">
                {new Date(node.startTime).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </span>
            </div>
            {/* Operation details */}
            {(node.metadata?.operation || node.metadata?.action || node.metadata?.component) && (
              <div className="af-step__ops">
                {node.metadata.component && (
                  <span className="af-step__op-tag">{String(node.metadata.component)}</span>
                )}
                {node.metadata.operation && (
                  <span className="af-step__op-detail">{String(node.metadata.operation)}</span>
                )}
                {node.metadata.action &&
                  node.metadata.action !==
                    `${node.metadata.component}.${node.metadata.operation}` && (
                    <span className="af-step__op-detail">{String(node.metadata.action)}</span>
                  )}
                {node.metadata.model && (
                  <span className="af-step__op-tag af-step__op-tag--model">
                    {String(node.metadata.model)}
                  </span>
                )}
              </div>
            )}
            {(node.metadata?.error ?? node.state?.error) && (
              <div className="af-step__err">
                {'\u2718'} {String(node.metadata?.error ?? node.state?.error)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
