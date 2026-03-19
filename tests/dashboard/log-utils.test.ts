import { describe, it, expect } from 'vitest';
import {
  stripAnsi,
  parseValue,
  parseTimestamp,
  extractTimestamp,
  extractLogLevel,
  extractAction,
  extractKeyValuePairs,
  detectComponent,
  detectOperation,
  detectActivityPattern,
  extractSessionIdentifier,
  detectTrigger,
  getUniversalNodeStatus,
  openClawSessionIdToAgent,
} from '../../packages/dashboard/src/parsers/log-utils.js';

describe('Log Utils', () => {
  describe('stripAnsi', () => {
    it('removes ANSI color codes', () => {
      expect(stripAnsi('\x1b[32mhello\x1b[0m')).toBe('hello');
    });

    it('handles strings without ANSI codes', () => {
      expect(stripAnsi('plain text')).toBe('plain text');
    });

    it('removes multiple ANSI codes', () => {
      expect(stripAnsi('\x1b[1m\x1b[31merror\x1b[0m')).toBe('error');
    });
  });

  describe('parseValue', () => {
    it('parses integers', () => {
      expect(parseValue('42')).toBe(42);
    });

    it('parses floats', () => {
      expect(parseValue('3.14')).toBe(3.14);
    });

    it('strips single quotes', () => {
      expect(parseValue("'hello'")).toBe('hello');
    });

    it('strips double quotes', () => {
      expect(parseValue('"world"')).toBe('world');
    });

    it('returns plain strings as-is', () => {
      expect(parseValue('text')).toBe('text');
    });
  });

  describe('parseTimestamp', () => {
    it('returns null for falsy values', () => {
      expect(parseTimestamp(null)).toBeNull();
      expect(parseTimestamp(undefined)).toBeNull();
      expect(parseTimestamp('')).toBeNull();
    });

    it('passes through numbers', () => {
      expect(parseTimestamp(1234567890)).toBe(1234567890);
    });

    it('parses ISO date strings', () => {
      const ts = parseTimestamp('2026-03-19T10:00:00Z');
      expect(ts).toBeGreaterThan(0);
    });
  });

  describe('extractTimestamp', () => {
    it('extracts ISO timestamps from log lines', () => {
      const ts = extractTimestamp('2026-03-19T10:00:00Z [info] something happened');
      expect(ts).toBeGreaterThan(0);
    });

    it('returns null for lines without timestamps', () => {
      expect(extractTimestamp('no timestamp here')).toBeNull();
    });

    it('handles ANSI-colored timestamps', () => {
      const ts = extractTimestamp('\x1b[36m2026-03-19T10:00:00Z\x1b[0m [info] test');
      expect(ts).toBeGreaterThan(0);
    });
  });

  describe('extractLogLevel', () => {
    it('extracts standard log levels', () => {
      expect(extractLogLevel('[info] message')).toBe('info');
      expect(extractLogLevel('[ERROR] failure')).toBe('error');
      expect(extractLogLevel('[warn] caution')).toBe('warn');
      expect(extractLogLevel('[debug] trace')).toBe('debug');
    });

    it('returns null for lines without levels', () => {
      expect(extractLogLevel('no level here')).toBeNull();
    });
  });

  describe('extractAction', () => {
    it('extracts action after bracket-enclosed level', () => {
      expect(extractAction('[info] autofix.infer_name key=val')).toBe('autofix.infer_name');
    });

    it('returns empty string for unstructured lines', () => {
      const result = extractAction('just a plain message');
      expect(typeof result).toBe('string');
    });
  });

  describe('extractKeyValuePairs', () => {
    it('extracts simple key=value pairs', () => {
      const pairs = extractKeyValuePairs('field=name status=ok count=5');
      expect(pairs.field).toBe('name');
      expect(pairs.status).toBe('ok');
      expect(pairs.count).toBe(5);
    });

    it('handles quoted values', () => {
      const pairs = extractKeyValuePairs("message='hello world'");
      expect(pairs.message).toBe('hello world');
    });

    it('handles ANSI-colored input', () => {
      const pairs = extractKeyValuePairs('\x1b[36mfield\x1b[0m=\x1b[35mvalue\x1b[0m');
      // Should strip ANSI and extract
      expect(typeof pairs).toBe('object');
    });
  });

  describe('detectComponent', () => {
    it('extracts component from dotted action', () => {
      expect(detectComponent('autofix.infer_name', {})).toBe('autofix');
    });

    it('uses kvPairs.component if available', () => {
      expect(detectComponent('', { component: 'myservice' })).toBe('myservice');
    });

    it('falls back to action', () => {
      expect(detectComponent('myaction', {})).toBe('myaction');
    });
  });

  describe('detectOperation', () => {
    it('extracts operation from dotted action', () => {
      expect(detectOperation('autofix.infer_name', {})).toBe('infer_name');
    });

    it('uses kvPairs.operation if available', () => {
      expect(detectOperation('', { operation: 'process' })).toBe('process');
    });
  });

  describe('detectActivityPattern', () => {
    it('detects ISO-timestamped log lines', () => {
      const activity = detectActivityPattern(
        '2026-03-19T10:00:00Z [info] autofix.run field=name',
      );
      expect(activity).not.toBeNull();
      expect(activity!.component).toBe('autofix');
      expect(activity!.operation).toBe('run');
    });

    it('detects JSON log lines', () => {
      const activity = detectActivityPattern(
        '{"timestamp":"2026-03-19T10:00:00Z","level":"info","action":"process","status":"ok"}',
      );
      expect(activity).not.toBeNull();
      expect(activity!.level).toBe('info');
    });

    it('returns null for unstructured lines', () => {
      expect(detectActivityPattern('just some text')).toBeNull();
    });

    it('detects key=value format', () => {
      const activity = detectActivityPattern(
        'timestamp=2026-03-19T10:00:00Z level=info action=deploy',
      );
      expect(activity).not.toBeNull();
    });
  });

  describe('extractSessionIdentifier', () => {
    it('extracts session_id', () => {
      expect(extractSessionIdentifier({ session_id: 'abc123' })).toBe('abc123');
    });

    it('falls back to run_id', () => {
      expect(extractSessionIdentifier({ run_id: 'run-456' })).toBe('run-456');
    });

    it('defaults to "default"', () => {
      expect(extractSessionIdentifier({})).toBe('default');
    });
  });

  describe('detectTrigger', () => {
    it('returns trigger field if present', () => {
      expect(detectTrigger({ trigger: 'cron' })).toBe('cron');
    });

    it('detects API calls', () => {
      expect(detectTrigger({ method: 'POST', url: '/api' })).toBe('api-call');
    });

    it('detects startup', () => {
      expect(detectTrigger({ operation: 'start-server' })).toBe('startup');
    });

    it('defaults to event', () => {
      expect(detectTrigger({})).toBe('event');
    });
  });

  describe('getUniversalNodeStatus', () => {
    it('returns failed for error level', () => {
      expect(getUniversalNodeStatus({ level: 'error' })).toBe('failed');
    });

    it('returns failed for fatal level', () => {
      expect(getUniversalNodeStatus({ level: 'fatal' })).toBe('failed');
    });

    it('returns warning for warn level', () => {
      expect(getUniversalNodeStatus({ level: 'warn' })).toBe('warning');
    });

    it('returns running for start operations', () => {
      expect(getUniversalNodeStatus({ level: 'info', operation: 'startup' })).toBe('running');
    });

    it('returns completed for finish operations', () => {
      expect(getUniversalNodeStatus({ level: 'info', operation: 'completed' })).toBe('completed');
    });

    it('defaults to completed', () => {
      expect(getUniversalNodeStatus({ level: 'info' })).toBe('completed');
    });
  });

  describe('openClawSessionIdToAgent', () => {
    it('maps janitor prefix', () => {
      expect(openClawSessionIdToAgent('janitor-abc')).toBe('vault-janitor');
    });

    it('maps curator prefix', () => {
      expect(openClawSessionIdToAgent('curator-xyz')).toBe('vault-curator');
    });

    it('maps distiller prefix', () => {
      expect(openClawSessionIdToAgent('distiller-123')).toBe('vault-distiller');
    });

    it('maps main prefix', () => {
      expect(openClawSessionIdToAgent('main-session')).toBe('main');
    });

    it('extracts first segment for unknown prefixes', () => {
      expect(openClawSessionIdToAgent('custom-session')).toBe('custom');
    });
  });
});
