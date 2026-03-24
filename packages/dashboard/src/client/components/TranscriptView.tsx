import { useEffect, useState } from 'react';
import type { FullTrace, SessionEvent } from '../hooks/useSelectedTrace';

function fmtTime(ts?: number) {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

const ROLE_CONFIG: Record<string, { icon: string; label: string; cls: string; origin: string }> = {
  user: { icon: '\u25B6', label: 'User Input', cls: 'tv-bubble--user', origin: 'user' },
  human: { icon: '\u25B6', label: 'User Input', cls: 'tv-bubble--user', origin: 'user' },
  assistant: {
    icon: '\u2726',
    label: 'Agent Response',
    cls: 'tv-bubble--assistant',
    origin: 'agent',
  },
  tool: { icon: '\u2699', label: 'Tool Call', cls: 'tv-bubble--tool', origin: 'agent' },
  tool_call: { icon: '\u2699', label: 'Tool Call', cls: 'tv-bubble--tool', origin: 'agent' },
  tool_result: { icon: '\u21B3', label: 'Tool Result', cls: 'tv-bubble--tool', origin: 'agent' },
  toolResult: { icon: '\u21B3', label: 'Tool Result', cls: 'tv-bubble--tool', origin: 'agent' },
  tool_use: { icon: '\u2699', label: 'Tool Use', cls: 'tv-bubble--tool', origin: 'agent' },
  thinking: {
    icon: '\u2026',
    label: 'Agent Thinking',
    cls: 'tv-bubble--thinking',
    origin: 'agent',
  },
  model_change: {
    icon: '\u21C4',
    label: 'Model Change',
    cls: 'tv-bubble--system',
    origin: 'system',
  },
  system: { icon: '\u2630', label: 'System', cls: 'tv-bubble--system', origin: 'system' },
  event: { icon: '\u25CB', label: 'Event', cls: 'tv-bubble--event', origin: 'system' },
};

export function TranscriptView({ trace }: { trace: FullTrace }) {
  const [events, setEvents] = useState<SessionEvent[]>(trace.sessionEvents ?? []);
  const [loading, setLoading] = useState(false);
  const [expandedThinking, setExpandedThinking] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (trace.sessionEvents && trace.sessionEvents.length > 0) {
      setEvents(trace.sessionEvents);
      return;
    }
    setLoading(true);
    fetch(`/api/traces/${encodeURIComponent(trace.filename)}/events`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setEvents(Array.isArray(d) ? d : []))
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  }, [trace.filename, trace.sessionEvents]);

  if (loading) return <div className="workspace__empty">Loading transcript...</div>;
  if (events.length === 0)
    return <div className="workspace__empty">No session events for this trace</div>;

  const toggleThinking = (idx: number) => {
    setExpandedThinking((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const failedNodes = Object.values(trace.nodes).filter((n) => n.status === 'failed');

  return (
    <div className="tv-chat">
      {failedNodes.length > 0 && (
        <div className="tv-bubble tv-bubble--error tv-bubble--left" style={{ marginBottom: 16 }}>
          <div className="tv-bubble__header">
            <span className="tv-origin tv-origin--system">system</span>
            <span className="tv-bubble__icon">{'\u2718'}</span>
            <span className="tv-bubble__role">
              {failedNodes.length} Failed Node{failedNodes.length > 1 ? 's' : ''}
            </span>
          </div>
          {failedNodes.map((n) => {
            const errMsg = n.metadata?.error ?? n.state?.error;
            return (
              <div key={n.id} style={{ padding: '4px 0', fontFamily: 'monospace', fontSize: 12 }}>
                <strong>
                  {n.type}: {n.name}
                </strong>
                {errMsg && (
                  <div style={{ color: 'var(--color-critical, #f85149)', marginTop: 2 }}>
                    Error: {String(errMsg)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {[...events].reverse().map((ev, i) => {
        const raw = ev as Record<string, unknown>;
        const msg = (raw.message as Record<string, unknown>) ?? {};

        // Role: check top-level, then nested message.role, then type
        const role =
          (raw.role as string) || (msg.role as string) || (raw.type as string) || 'event';

        // Content: check top-level, then message.content (which may be array of {type, text})
        let content = '';
        const rawContent = raw.content ?? msg.content;
        if (typeof rawContent === 'string') {
          content = rawContent;
        } else if (Array.isArray(rawContent)) {
          content = rawContent
            .map((c: Record<string, unknown>) => {
              if (c.type === 'thinking') return `[thinking] ${String(c.thinking ?? '')}`;
              if (c.type === 'toolCall') {
                const toolContent = c as { name?: string; toolName?: string };
                return `[tool call: ${String(toolContent.name ?? toolContent.toolName ?? 'unknown')}]`;
              }
              return String(c.text ?? c.content ?? '');
            })
            .filter(Boolean)
            .join('\n');
        }
        const config = ROLE_CONFIG[role] ??
          ROLE_CONFIG.event ?? { icon: '•', label: 'Unknown', cls: '', origin: 'system' };
        const isThinking = role === 'thinking';
        const isError = !!raw.error;
        const isHuman = config.origin === 'user';

        return (
          <div
            key={`event-${raw.id ?? raw.timestamp ?? i}`}
            className={`tv-bubble ${config.cls} ${isError ? 'tv-bubble--error' : ''} ${isHuman ? 'tv-bubble--right' : 'tv-bubble--left'}`}
          >
            {/* Avatar + role */}
            <div className="tv-bubble__header">
              <span className={`tv-origin tv-origin--${config.origin}`}>{config.origin}</span>
              <span className="tv-bubble__icon">{config.icon}</span>
              <span className="tv-bubble__role">{config.label}</span>
              {raw.model && <span className="tv-bubble__model">{String(raw.model)}</span>}
              {raw.tokenCount && Number(raw.tokenCount) > 0 && (
                <span className="tv-bubble__tokens">
                  {Number(raw.tokenCount).toLocaleString()} tok
                </span>
              )}
              <span className="tv-bubble__time">{fmtTime(raw.timestamp as number)}</span>
            </div>

            {/* Tool call info */}
            {raw.toolName && (
              <div className="tv-bubble__tool">
                <span className="tv-bubble__tool-name">
                  {'\u2699'} {String(raw.toolName)}
                </span>
                {raw.toolArgs && (
                  <pre className="tv-code">
                    {String(raw.toolArgs).slice(0, 300)}
                    {String(raw.toolArgs).length > 300 ? '...' : ''}
                  </pre>
                )}
              </div>
            )}

            {/* Thinking toggle */}
            {isThinking && content && (
              <button type="button" className="tv-thinking-btn" onClick={() => toggleThinking(i)}>
                {expandedThinking.has(i) ? '\u25BC Hide thinking' : '\u25B6 Show thinking'}
              </button>
            )}

            {/* Content */}
            {(!isThinking || expandedThinking.has(i)) && content && (
              <div className="tv-bubble__content">
                {content.length > 1000 ? `${content.slice(0, 1000)}...` : content}
              </div>
            )}

            {/* Tool result */}
            {raw.toolResult && (
              <pre className={`tv-code ${isError ? 'tv-code--error' : ''}`}>
                {String(raw.toolResult).slice(0, 500)}
                {String(raw.toolResult).length > 500 ? '...' : ''}
              </pre>
            )}

            {/* Error */}
            {raw.error && (
              <div className="tv-bubble__error">
                {'\u2718'} {String(raw.error)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
