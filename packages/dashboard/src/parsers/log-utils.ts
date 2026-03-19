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
    if (match[1] === 'Z' || match[1] === 'm') continue;
    pairs[match[1]!] = parseValue(match[2]!);
  }

  return pairs;
}

/** Detect component from action string or key-value pairs. */
export function detectComponent(action: string, kvPairs: Record<string, unknown>): string {
  if (action.includes('.')) return action.split('.')[0]!;
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
        pairs[key!] = parseValue(value!);
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
    if (logMatch) {
      timestamp = new Date(logMatch[1]!).getTime();
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

/** Map OpenClaw sessionId prefix to agent name. */
export function openClawSessionIdToAgent(sessionId: string): string {
  if (sessionId.startsWith('janitor-')) return 'vault-janitor';
  if (sessionId.startsWith('curator-')) return 'vault-curator';
  if (sessionId.startsWith('distiller-')) return 'vault-distiller';
  if (sessionId.startsWith('main-')) return 'main';
  const firstSegment = sessionId.split('-')[0];
  if (firstSegment) return firstSegment;
  return 'openclaw';
}
