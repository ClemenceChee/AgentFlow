/**
 * Type definitions for the `agentflow watch` alert system.
 * @module
 */

/** Alert condition parsed from --alert-on flags. */
export type AlertCondition =
  | { readonly type: 'error' }
  | { readonly type: 'stale'; readonly durationMs: number }
  | { readonly type: 'recovery' }
  | { readonly type: 'consecutive-errors'; readonly threshold: number };

/** Notification channel parsed from --notify flags. */
export type NotifyChannel =
  | { readonly type: 'stdout' }
  | { readonly type: 'telegram'; readonly botToken: string; readonly chatId: string }
  | { readonly type: 'webhook'; readonly url: string }
  | { readonly type: 'command'; readonly cmd: string };

/** Configuration for the watch command. */
export interface WatchConfig {
  readonly dirs: string[];
  readonly recursive: boolean;
  readonly pollIntervalMs: number;
  readonly alertConditions: AlertCondition[];
  readonly notifyChannels: NotifyChannel[];
  readonly stateFilePath: string;
  readonly cooldownMs: number;
}

/** Per-agent tracked state (persisted to disk). */
export interface AgentWatchState {
  id: string;
  lastStatus: 'ok' | 'error' | 'running' | 'unknown';
  lastActive: number;
  lastAlertTime: number;
  lastAlertReason: string;
  consecutiveErrors: number;
  /** Recent mtime values for stale-interval auto-detection (keep last 10). */
  mtimeHistory: number[];
}

/** Persisted watch state file. */
export interface WatchStateFile {
  version: 1;
  agents: Record<string, AgentWatchState>;
  lastPollTime: number;
}

/** Alert payload passed to notification channels. */
export interface AlertPayload {
  readonly agentId: string;
  readonly condition: string;
  readonly previousStatus: string;
  readonly currentStatus: string;
  readonly detail: string;
  readonly file: string;
  readonly timestamp: number;
  readonly dirs: readonly string[];
}
