/**
 * State tracking, transition detection, and persistence for `agentflow watch`.
 * Pure functions — no I/O side effects except load/save.
 * @module
 */

import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';

import type { AgentRecord } from './live.js';
import type { AgentWatchState, AlertPayload, WatchConfig, WatchStateFile } from './watch-types.js';

// ---------------------------------------------------------------------------
// Duration parsing
// ---------------------------------------------------------------------------

/** Parse a human duration string (e.g. "15m", "2h", "30s") to milliseconds. */
export function parseDuration(input: string): number {
  const match = input.match(/^(\d+(?:\.\d+)?)\s*(s|m|h|d)$/i);
  if (!match) {
    const n = parseInt(input, 10);
    return Number.isNaN(n) ? 0 : n * 1000; // bare number = seconds
  }
  const value = parseFloat(match[1]!);
  switch (match[2]?.toLowerCase()) {
    case 's':
      return value * 1000;
    case 'm':
      return value * 60_000;
    case 'h':
      return value * 3_600_000;
    case 'd':
      return value * 86_400_000;
    default:
      return value * 1000;
  }
}

// ---------------------------------------------------------------------------
// State persistence
// ---------------------------------------------------------------------------

function emptyState(): WatchStateFile {
  return { version: 1, agents: {}, lastPollTime: 0 };
}

/** Load persisted watch state. Returns empty state if missing or corrupt. */
export function loadWatchState(filePath: string): WatchStateFile {
  if (!existsSync(filePath)) return emptyState();
  try {
    const raw = JSON.parse(readFileSync(filePath, 'utf8')) as WatchStateFile;
    if (raw.version !== 1 || typeof raw.agents !== 'object') return emptyState();
    return raw;
  } catch {
    return emptyState();
  }
}

/** Save watch state atomically (write tmp + rename). */
export function saveWatchState(filePath: string, state: WatchStateFile): void {
  const tmp = `${filePath}.tmp`;
  try {
    writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
    renameSync(tmp, filePath);
  } catch {
    // If rename fails (cross-device), fall back to direct write
    try {
      writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf8');
    } catch {
      /* give up silently */
    }
  }
}

// ---------------------------------------------------------------------------
// Stale interval auto-detection
// ---------------------------------------------------------------------------

/** Estimate the expected update interval from mtime history (median of deltas). */
function estimateInterval(history: number[]): number {
  if (history.length < 3) return 0; // not enough data
  const sorted = [...history].sort((a, b) => a - b);
  const deltas: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const d = sorted[i]! - sorted[i - 1]!;
    if (d > 0) deltas.push(d);
  }
  if (deltas.length === 0) return 0;
  deltas.sort((a, b) => a - b);
  return deltas[Math.floor(deltas.length / 2)]!; // median
}

// ---------------------------------------------------------------------------
// Transition detection
// ---------------------------------------------------------------------------

/** Detect state transitions and produce alert payloads. */
export function detectTransitions(
  previous: WatchStateFile,
  currentRecords: AgentRecord[],
  config: WatchConfig,
  now: number,
): AlertPayload[] {
  const alerts: AlertPayload[] = [];

  // Index conditions by type for fast lookup
  const hasError = config.alertConditions.some((c) => c.type === 'error');
  const hasRecovery = config.alertConditions.some((c) => c.type === 'recovery');
  const staleConditions = config.alertConditions.filter((c) => c.type === 'stale') as Array<{
    type: 'stale';
    durationMs: number;
  }>;
  const consecutiveConditions = config.alertConditions.filter(
    (c) => c.type === 'consecutive-errors',
  ) as Array<{ type: 'consecutive-errors'; threshold: number }>;

  // Deduplicate records by agent id (keep most recent)
  const byAgent = new Map<string, AgentRecord>();
  for (const r of currentRecords) {
    const existing = byAgent.get(r.id);
    if (!existing || r.lastActive > existing.lastActive) {
      byAgent.set(r.id, r);
    }
  }

  for (const [agentId, record] of byAgent) {
    const prev = previous.agents[agentId];
    const prevStatus = prev?.lastStatus ?? 'unknown';
    const currStatus = record.status;

    // --- Error transition ---
    if (hasError && currStatus === 'error' && prevStatus !== 'error') {
      if (canAlert(prev, 'error', config.cooldownMs, now)) {
        alerts.push(makePayload(agentId, 'error', prevStatus, currStatus, record, config.dirs));
      }
    }

    // --- Recovery transition ---
    if (hasRecovery && currStatus === 'ok' && prevStatus === 'error') {
      // Recovery always fires (no cooldown)
      alerts.push(makePayload(agentId, 'recovery', prevStatus, currStatus, record, config.dirs));
    }

    // --- Consecutive errors ---
    const newConsec = currStatus === 'error' ? (prev?.consecutiveErrors ?? 0) + 1 : 0;
    for (const cond of consecutiveConditions) {
      if (newConsec === cond.threshold) {
        if (canAlert(prev, `consecutive-errors:${cond.threshold}`, config.cooldownMs, now)) {
          alerts.push(
            makePayload(
              agentId,
              `consecutive-errors (${cond.threshold})`,
              prevStatus,
              currStatus,
              { ...record, detail: `${newConsec} consecutive errors. ${record.detail}` },
              config.dirs,
            ),
          );
        }
      }
    }

    // --- Stale detection ---
    for (const cond of staleConditions) {
      const sinceActive = now - record.lastActive;
      if (sinceActive > cond.durationMs && record.lastActive > 0) {
        if (canAlert(prev, 'stale', config.cooldownMs, now)) {
          const mins = Math.floor(sinceActive / 60_000);
          alerts.push(
            makePayload(
              agentId,
              'stale',
              prevStatus,
              currStatus,
              { ...record, detail: `No update for ${mins}m. ${record.detail}` },
              config.dirs,
            ),
          );
        }
      }
    }

    // --- Auto-detected stale (if no explicit stale condition) ---
    if (staleConditions.length === 0) {
      const history = prev?.mtimeHistory ?? [];
      const expectedInterval = estimateInterval(history);
      if (expectedInterval > 0) {
        const sinceActive = now - record.lastActive;
        if (sinceActive > expectedInterval * 3) {
          // 3× expected interval
          if (canAlert(prev, 'stale-auto', config.cooldownMs, now)) {
            const mins = Math.floor(sinceActive / 60_000);
            const expectedMins = Math.floor(expectedInterval / 60_000);
            alerts.push(
              makePayload(
                agentId,
                'stale (auto)',
                prevStatus,
                currStatus,
                {
                  ...record,
                  detail: `No update for ${mins}m (expected every ~${expectedMins}m). ${record.detail}`,
                },
                config.dirs,
              ),
            );
          }
        }
      }
    }
  }

  return alerts;
}

/** Update the persisted state with current observations. */
export function updateWatchState(
  state: WatchStateFile,
  records: AgentRecord[],
  alerts: AlertPayload[],
  now: number,
): WatchStateFile {
  const agents = { ...state.agents };

  // Build alert lookup
  const alertsByAgent = new Map<string, AlertPayload>();
  for (const a of alerts) alertsByAgent.set(a.agentId, a);

  // Deduplicate records by id (keep most recent)
  const byAgent = new Map<string, AgentRecord>();
  for (const r of records) {
    const existing = byAgent.get(r.id);
    if (!existing || r.lastActive > existing.lastActive) {
      byAgent.set(r.id, r);
    }
  }

  for (const [agentId, record] of byAgent) {
    const prev = agents[agentId];
    const history = prev?.mtimeHistory ?? [];
    // Add mtime if different from last entry
    const newHistory = [...history];
    if (newHistory.length === 0 || newHistory[newHistory.length - 1] !== record.lastActive) {
      newHistory.push(record.lastActive);
    }
    // Keep last 10
    while (newHistory.length > 10) newHistory.shift();

    const alert = alertsByAgent.get(agentId);
    const consecutiveErrors = record.status === 'error' ? (prev?.consecutiveErrors ?? 0) + 1 : 0;

    agents[agentId] = {
      id: agentId,
      lastStatus: record.status,
      lastActive: record.lastActive,
      lastAlertTime: alert ? now : (prev?.lastAlertTime ?? 0),
      lastAlertReason: alert ? alert.condition : (prev?.lastAlertReason ?? ''),
      consecutiveErrors,
      mtimeHistory: newHistory,
    };
  }

  return { version: 1, agents, lastPollTime: now };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function canAlert(
  prev: AgentWatchState | undefined,
  reason: string,
  cooldownMs: number,
  now: number,
): boolean {
  if (!prev) return true;
  if (prev.lastAlertReason !== reason) return true;
  return now - prev.lastAlertTime > cooldownMs;
}

function makePayload(
  agentId: string,
  condition: string,
  previousStatus: string,
  currentStatus: string,
  record: AgentRecord,
  dirs: readonly string[],
): AlertPayload {
  return {
    agentId,
    condition,
    previousStatus,
    currentStatus,
    detail: record.detail,
    file: record.file,
    timestamp: Date.now(),
    dirs,
  };
}
