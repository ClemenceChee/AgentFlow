import { describe, expect, it } from 'vitest';
import type { AgentRecord } from '../../packages/core/src/live.js';
import {
  detectTransitions,
  parseDuration,
  updateWatchState,
} from '../../packages/core/src/watch-state.js';
import type { WatchConfig, WatchStateFile } from '../../packages/core/src/watch-types.js';

function makeRecord(overrides: Partial<AgentRecord> = {}): AgentRecord {
  return {
    id: 'test-agent',
    source: 'state',
    status: 'ok',
    lastActive: Date.now(),
    detail: 'test detail',
    file: 'test.json',
    ...overrides,
  };
}

function makeConfig(overrides: Partial<WatchConfig> = {}): WatchConfig {
  return {
    dirs: ['/tmp'],
    recursive: false,
    pollIntervalMs: 10000,
    alertConditions: [{ type: 'error' }, { type: 'recovery' }],
    notifyChannels: [{ type: 'stdout' }],
    stateFilePath: '/tmp/test-state.json',
    cooldownMs: 1800000,
    ...overrides,
  };
}

function emptyState(): WatchStateFile {
  return { version: 1, agents: {}, lastPollTime: 0 };
}

describe('parseDuration', () => {
  it('parses seconds', () => {
    expect(parseDuration('30s')).toBe(30000);
  });

  it('parses minutes', () => {
    expect(parseDuration('15m')).toBe(900000);
  });

  it('parses hours', () => {
    expect(parseDuration('2h')).toBe(7200000);
  });

  it('parses days', () => {
    expect(parseDuration('1d')).toBe(86400000);
  });

  it('treats bare number as seconds', () => {
    expect(parseDuration('60')).toBe(60000);
  });

  it('returns 0 for invalid input', () => {
    expect(parseDuration('abc')).toBe(0);
  });
});

describe('detectTransitions', () => {
  it('detects ok-to-error transition', () => {
    const state: WatchStateFile = {
      version: 1,
      agents: {
        'test-agent': {
          id: 'test-agent',
          lastStatus: 'ok',
          lastActive: 1000,
          lastAlertTime: 0,
          lastAlertReason: '',
          consecutiveErrors: 0,
          mtimeHistory: [],
        },
      },
      lastPollTime: 1000,
    };
    const records = [makeRecord({ status: 'error' })];
    const config = makeConfig();

    const alerts = detectTransitions(state, records, config, Date.now());
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.condition).toBe('error');
    expect(alerts[0]!.agentId).toBe('test-agent');
  });

  it('detects error-to-ok recovery', () => {
    const state: WatchStateFile = {
      version: 1,
      agents: {
        'test-agent': {
          id: 'test-agent',
          lastStatus: 'error',
          lastActive: 1000,
          lastAlertTime: 0,
          lastAlertReason: '',
          consecutiveErrors: 3,
          mtimeHistory: [],
        },
      },
      lastPollTime: 1000,
    };
    const records = [makeRecord({ status: 'ok' })];
    const config = makeConfig();

    const alerts = detectTransitions(state, records, config, Date.now());
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.condition).toBe('recovery');
  });

  it('does not alert when status unchanged', () => {
    const state: WatchStateFile = {
      version: 1,
      agents: {
        'test-agent': {
          id: 'test-agent',
          lastStatus: 'ok',
          lastActive: 1000,
          lastAlertTime: 0,
          lastAlertReason: '',
          consecutiveErrors: 0,
          mtimeHistory: [],
        },
      },
      lastPollTime: 1000,
    };
    const records = [makeRecord({ status: 'ok' })];
    const config = makeConfig();

    const alerts = detectTransitions(state, records, config, Date.now());
    expect(alerts).toHaveLength(0);
  });

  it('respects cooldown for duplicate alerts', () => {
    const now = Date.now();
    const state: WatchStateFile = {
      version: 1,
      agents: {
        'test-agent': {
          id: 'test-agent',
          lastStatus: 'ok',
          lastActive: 1000,
          lastAlertTime: now - 1000, // alerted 1 second ago
          lastAlertReason: 'error',
          consecutiveErrors: 0,
          mtimeHistory: [],
        },
      },
      lastPollTime: now - 1000,
    };
    const records = [makeRecord({ status: 'error' })];
    const config = makeConfig({ cooldownMs: 60000 }); // 1 minute cooldown

    const alerts = detectTransitions(state, records, config, now);
    expect(alerts).toHaveLength(0); // suppressed by cooldown
  });

  it('detects stale agents', () => {
    const now = Date.now();
    const records = [makeRecord({ status: 'ok', lastActive: now - 20 * 60_000 })]; // 20 min ago
    const config = makeConfig({
      alertConditions: [{ type: 'stale', durationMs: 15 * 60_000 }], // 15 min stale threshold
    });

    const alerts = detectTransitions(emptyState(), records, config, now);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.condition).toBe('stale');
  });

  it('detects consecutive errors', () => {
    const state: WatchStateFile = {
      version: 1,
      agents: {
        'test-agent': {
          id: 'test-agent',
          lastStatus: 'error',
          lastActive: 1000,
          lastAlertTime: 0,
          lastAlertReason: '',
          consecutiveErrors: 2,
          mtimeHistory: [],
        },
      },
      lastPollTime: 1000,
    };
    const records = [makeRecord({ status: 'error' })];
    const config = makeConfig({
      alertConditions: [{ type: 'consecutive-errors', threshold: 3 }],
    });

    const alerts = detectTransitions(state, records, config, Date.now());
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.condition).toContain('consecutive-errors');
  });

  it('alerts on first observation if error (no previous state)', () => {
    const records = [makeRecord({ status: 'error' })];
    const config = makeConfig();

    const alerts = detectTransitions(emptyState(), records, config, Date.now());
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.condition).toBe('error');
  });
});

describe('updateWatchState', () => {
  it('creates new agent entries', () => {
    const records = [makeRecord({ id: 'new-agent', status: 'ok', lastActive: 5000 })];
    const result = updateWatchState(emptyState(), records, [], Date.now());

    expect(result.agents['new-agent']).toBeDefined();
    expect(result.agents['new-agent']!.lastStatus).toBe('ok');
    expect(result.agents['new-agent']!.lastActive).toBe(5000);
  });

  it('tracks consecutive errors', () => {
    const state: WatchStateFile = {
      version: 1,
      agents: {
        'test-agent': {
          id: 'test-agent',
          lastStatus: 'error',
          lastActive: 1000,
          lastAlertTime: 0,
          lastAlertReason: '',
          consecutiveErrors: 2,
          mtimeHistory: [1000],
        },
      },
      lastPollTime: 1000,
    };
    const records = [makeRecord({ status: 'error', lastActive: 2000 })];
    const result = updateWatchState(state, records, [], Date.now());

    expect(result.agents['test-agent']!.consecutiveErrors).toBe(3);
  });

  it('resets consecutive errors on ok', () => {
    const state: WatchStateFile = {
      version: 1,
      agents: {
        'test-agent': {
          id: 'test-agent',
          lastStatus: 'error',
          lastActive: 1000,
          lastAlertTime: 0,
          lastAlertReason: '',
          consecutiveErrors: 5,
          mtimeHistory: [1000],
        },
      },
      lastPollTime: 1000,
    };
    const records = [makeRecord({ status: 'ok', lastActive: 2000 })];
    const result = updateWatchState(state, records, [], Date.now());

    expect(result.agents['test-agent']!.consecutiveErrors).toBe(0);
  });

  it('keeps mtime history trimmed to 10', () => {
    const state: WatchStateFile = {
      version: 1,
      agents: {
        'test-agent': {
          id: 'test-agent',
          lastStatus: 'ok',
          lastActive: 1000,
          lastAlertTime: 0,
          lastAlertReason: '',
          consecutiveErrors: 0,
          mtimeHistory: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        },
      },
      lastPollTime: 1000,
    };
    const records = [makeRecord({ status: 'ok', lastActive: 11 })];
    const result = updateWatchState(state, records, [], Date.now());

    expect(result.agents['test-agent']!.mtimeHistory.length).toBeLessThanOrEqual(10);
  });
});
