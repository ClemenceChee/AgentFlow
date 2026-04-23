/**
 * Utility functions for parsing log lines: timestamps, levels, actions, key-value pairs.
 * Extracted from watcher.ts to reduce god-file complexity.
 * @module
 */

/** Strip ANSI escape codes from a string. */
export function stripAnsi(str: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional ANSI escape matching
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

/** Parse a string value into a typed value (number, unquoted string). */
export function parseValue(value: string): string | number {
  if (value.match(/^\d+$/)) return parseInt(value, 10);
  if (value.match(/^\d+\.\d+$/)) return parseFloat(value);
  if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1);
  if (value.startsWith('"') && value.endsWith('"')) return value.slice(1, -1);
  return value;
}

/** Parse a timestamp value (number pass-through, string → Date.getTime()). */
export function parseTimestamp(value: unknown): number | null {
  if (!value) return null;
  if (typeof value === 'number') return value;
  try {
    return new Date(value as string).getTime();
  } catch {
    return null;
  }
}

/** Extract ISO timestamp from a log line. */
export function extractTimestamp(line: string): number | null {
  const clean = stripAnsi(line);
  const isoMatch = clean.match(/(\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}[.\d]*Z?)/);
  if (isoMatch) return new Date(isoMatch[1]).getTime();
  return null;
}

/** Extract log level from a log line. */
export function extractLogLevel(line: string): string | null {
  const clean = stripAnsi(line);
  const levelMatch = clean.match(/\b(debug|info|warn|warning|error|fatal|trace)\b/i);
  return levelMatch ? levelMatch[1].trim().toLowerCase() : null;
}

/** Extract the action/message from a log line. */
export function extractAction(line: string): string {
  const clean = stripAnsi(line);

  // Alfred structlog format: "TIMESTAMP [level] action.name  key=val key=val"
  const actionMatch = clean.match(/\]\s+(\S+)/);
  if (actionMatch) return actionMatch[1].trim();

  // After level, extract the main message
  const afterLevel = clean.replace(/^.*?(debug|info|warn|warning|error|fatal|trace)\s*\]?\s*/i, '');
  return afterLevel.split(/\s+/)[0] || '';
}

/** Extract key=value pairs from a log line. */
export function extractKeyValuePairs(line: string): Record<string, unknown> {
  const pairs: Record<string, unknown> = {};
  const clean = stripAnsi(line);

  const kvRegex = /(\w+)=('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = kvRegex.exec(clean)) !== null) {
    const key = match[1];
    const value = match[2];
    if (!key || !value) continue;
    if (key === 'Z' || key === 'm') continue;
    pairs[key] = parseValue(value);
  }

  return pairs;
}

/** Detect component from action string or key-value pairs. */
export function detectComponent(action: string, kvPairs: Record<string, unknown>): string {
  if (action.includes('.')) {
    const parts = action.split('.');
    return parts[0] || action;
  }
  if (kvPairs.component) return String(kvPairs.component);
  if (kvPairs.service) return String(kvPairs.service);
  if (kvPairs.module) return String(kvPairs.module);
  if (kvPairs.worker) return String(kvPairs.worker);
  return action || 'unknown';
}

/** Detect operation from action string or key-value pairs. */
export function detectOperation(action: string, kvPairs: Record<string, unknown>): string {
  if (action.includes('.')) return action.split('.').slice(1).join('.');
  if (kvPairs.operation) return String(kvPairs.operation);
  if (kvPairs.method) return String(kvPairs.method);
  if (kvPairs.action) return String(kvPairs.action);
  return action || 'activity';
}

/** Structured activity detected from a log line. */
export interface LogActivity {
  timestamp: number;
  level: string;
  action: string;
  component: string;
  operation: string;
  [key: string]: unknown;
}

/** Detect activity patterns in log lines using universal heuristics. */
export function detectActivityPattern(line: string): LogActivity | null {
  let timestamp = extractTimestamp(line);
  let level = extractLogLevel(line);
  let action = extractAction(line);
  let kvPairs = extractKeyValuePairs(line);

  // JSON logs
  if (!timestamp) {
    const jsonMatch = line.match(/\{.*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        timestamp = parseTimestamp(parsed.timestamp || parsed.time || parsed.ts) || Date.now();
        level = parsed.level || parsed.severity || 'info';
        action = parsed.action || parsed.event || parsed.message || '';
        kvPairs = parsed;
      } catch {
        // not valid JSON
      }
    }
  }

  // Key=value format
  if (!timestamp) {
    const kvMatches = line.match(/(\w+)=([^\s]+)/g);
    if (kvMatches && kvMatches.length >= 2) {
      const pairs: Record<string, unknown> = {};
      for (const m of kvMatches) {
        const [key, value] = m.split('=', 2);
        if (key && value !== undefined) {
          pairs[key] = parseValue(value);
        }
      }
      timestamp = parseTimestamp(pairs.timestamp || pairs.time) || Date.now();
      level = String(pairs.level || 'info');
      action = String(pairs.action || pairs.event || '');
      kvPairs = pairs;
    }
  }

  // Standard syslog/application logs
  if (!timestamp) {
    const logMatch = line.match(
      /^(\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}[.\d]*Z?)\s+(\w+)?\s*:?\s*(.+)/,
    );
    if (logMatch?.[1]) {
      timestamp = new Date(logMatch[1]).getTime();
      level = logMatch[2] || 'info';
      action = logMatch[3] || '';
    }
  }

  if (!timestamp) return null;

  return {
    timestamp,
    level: level?.toLowerCase() || 'info',
    action,
    component: detectComponent(action, kvPairs),
    operation: detectOperation(action, kvPairs),
    ...kvPairs,
  };
}

/** Extract session/run/transaction ID from activity. */
export function extractSessionIdentifier(activity: Record<string, unknown>): string {
  return String(
    activity.session_id ||
      activity.run_id ||
      activity.request_id ||
      activity.trace_id ||
      activity.sweep_id ||
      activity.transaction_id ||
      'default',
  );
}

/** Detect trigger type from activity. */
export function detectTrigger(activity: Record<string, unknown>): string {
  if (activity.trigger) return String(activity.trigger);
  if (activity.method && activity.url) return 'api-call';
  if (typeof activity.operation === 'string' && activity.operation.includes('start'))
    return 'startup';
  if (typeof activity.operation === 'string' && activity.operation.includes('invoke'))
    return 'invocation';
  return 'event';
}

/** Determine node status from activity log level/operation. */
export function getUniversalNodeStatus(activity: Record<string, unknown>): string {
  if (activity.level === 'error' || activity.level === 'fatal') return 'failed';
  if (activity.level === 'warn' || activity.level === 'warning') return 'warning';
  const op = String(activity.operation || '');
  if (op.match(/start|begin|init/i)) return 'running';
  if (op.match(/complete|finish|end|done/i)) return 'completed';
  return 'completed';
}

/** Extract agent name from OpenClaw sessionId prefix. */
export function openClawSessionIdToAgent(
  sessionId: string,
  lookupMap?: Map<string, string>,
): string {
  // Use manifest lookup if available
  if (lookupMap?.has(sessionId)) {
    return lookupMap.get(sessionId)!;
  }
  // Fallback: extract the first segment before the first hyphen-UUID pattern
  const firstSegment = sessionId.split('-')[0];
  if (firstSegment) return firstSegment;
  return 'openclaw';
}

/**
 * Parse an OpenClaw sessions.json key to extract a resolved agentId.
 *
 * Key formats:
 *   agent:main:cron:newsletter-digest-daily       → openclaw:newsletter-digest-daily
 *   agent:main:cron:newsletter-digest-daily:run:X  → openclaw:newsletter-digest-daily
 *   agent:main:telegram:slash:6549702894           → openclaw:telegram:6549702894
 *   agent:main:whatsapp:group:120363...            → openclaw:whatsapp:120363...
 *   agent:main:main                                → openclaw:main
 *
 * Returns null for unrecognized formats.
 */
export function parseOpenClawSessionKey(key: string): string | null {
  const parts = key.split(':');
  // Minimum: agent:{name}:{something}
  if (parts.length < 3 || parts[0] !== 'agent') return null;

  const agentName = parts[1]; // typically "main"
  const kind = parts[2]; // "cron", "telegram", "whatsapp", or the agent name itself

  // agent:main:main → openclaw:main
  if (parts.length === 3 && kind === agentName) {
    return `openclaw:${agentName}`;
  }

  // agent:main:cron:{jobId} or agent:main:cron:{jobId}:run:{uuid}
  if (kind === 'cron' && parts.length >= 4) {
    // jobId may contain colons if it has sub-parts, but :run: marks the boundary
    const runIdx = parts.indexOf('run', 4);
    const jobParts = runIdx > 0 ? parts.slice(3, runIdx) : parts.slice(3);
    const jobId = jobParts.join('-');
    return jobId ? `openclaw:${jobId}` : null;
  }

  // agent:main:{channel}:{subtype}:{target} (telegram:slash:ID, whatsapp:group:ID)
  if (parts.length >= 5) {
    const target = parts[4];
    return `openclaw:${kind}:${target}`;
  }

  // agent:main:{channel}:{target} (simpler format)
  if (parts.length >= 4) {
    const target = parts[3];
    return `openclaw:${kind}:${target}`;
  }

  return null;
}
