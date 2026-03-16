/**
 * AgentFlow Watch — headless alert system for agent infrastructure.
 *
 * Polls directories for JSON/JSONL state files, detects status transitions
 * (ok→error, stale, recovery), and sends alerts via Telegram, webhooks,
 * shell commands, or stdout.
 *
 * @module
 */

import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { hostname } from 'node:os';

import { scanFiles, processJsonFile, processJsonlFile } from './live.js';
import type { AgentRecord } from './live.js';
import { loadWatchState, saveWatchState, detectTransitions, updateWatchState, parseDuration } from './watch-state.js';
import { sendAlert, formatAlertMessage } from './watch-alerts.js';
import type { AlertCondition, NotifyChannel, WatchConfig } from './watch-types.js';

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

function parseWatchArgs(argv: string[]): WatchConfig {
  const dirs: string[] = [];
  const alertConditions: AlertCondition[] = [];
  const notifyChannels: NotifyChannel[] = [];
  let recursive = false;
  let pollIntervalMs = 30_000;
  let cooldownMs = 30 * 60_000; // 30 minutes
  let stateFilePath = '';

  const args = argv.slice(0);
  if (args[0] === 'watch') args.shift();

  let i = 0;
  while (i < args.length) {
    const arg = args[i]!;

    if (arg === '--help' || arg === '-h') {
      printWatchUsage();
      process.exit(0);
    } else if (arg === '--alert-on') {
      i++;
      const val = args[i] ?? '';
      if (val === 'error') {
        alertConditions.push({ type: 'error' });
      } else if (val === 'recovery') {
        alertConditions.push({ type: 'recovery' });
      } else if (val.startsWith('stale:')) {
        const dur = parseDuration(val.slice(6));
        if (dur > 0) alertConditions.push({ type: 'stale', durationMs: dur });
      } else if (val.startsWith('consecutive-errors:')) {
        const n = parseInt(val.slice(19), 10);
        if (n > 0) alertConditions.push({ type: 'consecutive-errors', threshold: n });
      }
      i++;
    } else if (arg === '--notify') {
      i++;
      const val = args[i] ?? '';
      if (val === 'telegram') {
        const botToken = process.env['AGENTFLOW_TELEGRAM_BOT_TOKEN'] ?? '';
        const chatId = process.env['AGENTFLOW_TELEGRAM_CHAT_ID'] ?? '';
        if (botToken && chatId) {
          notifyChannels.push({ type: 'telegram', botToken, chatId });
        } else {
          console.error('Warning: --notify telegram requires AGENTFLOW_TELEGRAM_BOT_TOKEN and AGENTFLOW_TELEGRAM_CHAT_ID env vars');
        }
      } else if (val.startsWith('webhook:')) {
        notifyChannels.push({ type: 'webhook', url: val.slice(8) });
      } else if (val.startsWith('command:')) {
        notifyChannels.push({ type: 'command', cmd: val.slice(8) });
      }
      i++;
    } else if (arg === '--poll') {
      i++;
      const v = parseInt(args[i] ?? '', 10);
      if (!isNaN(v) && v > 0) pollIntervalMs = v * 1000;
      i++;
    } else if (arg === '--cooldown') {
      i++;
      const dur = parseDuration(args[i] ?? '30m');
      if (dur > 0) cooldownMs = dur;
      i++;
    } else if (arg === '--state-file') {
      i++;
      stateFilePath = args[i] ?? '';
      i++;
    } else if (arg === '--recursive' || arg === '-R') {
      recursive = true;
      i++;
    } else if (!arg.startsWith('-')) {
      dirs.push(resolve(arg));
      i++;
    } else {
      i++;
    }
  }

  if (dirs.length === 0) dirs.push(resolve('.'));

  // Defaults: if no alert conditions specified, alert on errors and recovery
  if (alertConditions.length === 0) {
    alertConditions.push({ type: 'error' });
    alertConditions.push({ type: 'recovery' });
  }

  // Stdout is always a channel
  notifyChannels.unshift({ type: 'stdout' });

  // Default state file location
  if (!stateFilePath) {
    stateFilePath = join(dirs[0]!, '.agentflow-watch-state.json');
  }

  return {
    dirs,
    recursive,
    pollIntervalMs,
    alertConditions,
    notifyChannels,
    stateFilePath: resolve(stateFilePath),
    cooldownMs,
  };
}

function printWatchUsage(): void {
  console.log(`
AgentFlow Watch — headless alert system for agent infrastructure.

Polls directories for JSON/JSONL files, detects failures and stale
agents, sends alerts. Same auto-detection as \`agentflow live\`.

Usage:
  agentflow watch [dir...] [options]

Arguments:
  dir                          One or more directories to watch (default: .)

Alert conditions (--alert-on, repeatable):
  error                        Agent transitions to error status
  recovery                     Agent recovers from error to ok
  stale:DURATION               No file update within duration (e.g. 15m, 1h)
  consecutive-errors:N         N consecutive error observations

  Default (if none specified): error + recovery

Notification channels (--notify, repeatable):
  telegram                     Telegram Bot API (needs env vars)
  webhook:URL                  POST JSON to any URL
  command:CMD                  Run shell command with alert env vars

  Stdout alerts are always printed regardless of --notify flags.

Options:
  --poll <secs>                Poll interval in seconds (default: 30)
  --cooldown <duration>        Alert dedup cooldown (default: 30m)
  --state-file <path>          Persistence file (default: <dir>/.agentflow-watch-state.json)
  -R, --recursive              Scan subdirectories (1 level deep)
  -h, --help                   Show this help message

Environment variables:
  AGENTFLOW_TELEGRAM_BOT_TOKEN   Telegram bot token (for --notify telegram)
  AGENTFLOW_TELEGRAM_CHAT_ID     Telegram chat ID (for --notify telegram)

Examples:
  agentflow watch ./data --alert-on error --alert-on stale:15m
  agentflow watch ./data ./cron --notify telegram --poll 60
  agentflow watch ./traces --notify webhook:https://hooks.slack.com/... --alert-on consecutive-errors:3
  agentflow watch ./data --notify "command:curl -X POST https://my-pagerduty/alert"
`.trim());
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

export function startWatch(argv: string[]): void {
  const config = parseWatchArgs(argv);

  // Validate directories
  const valid = config.dirs.filter(d => existsSync(d));
  if (valid.length === 0) {
    console.error(`No valid directories found: ${config.dirs.join(', ')}`);
    process.exit(1);
  }
  const invalid = config.dirs.filter(d => !existsSync(d));
  if (invalid.length > 0) {
    console.warn(`Skipping non-existent: ${invalid.join(', ')}`);
  }

  // Load persisted state
  let state = loadWatchState(config.stateFilePath);

  // Startup banner
  const condLabels = config.alertConditions.map(c => {
    if (c.type === 'stale') return `stale:${Math.floor(c.durationMs / 60_000)}m`;
    if (c.type === 'consecutive-errors') return `consecutive-errors:${c.threshold}`;
    return c.type;
  });
  const channelLabels = config.notifyChannels.filter(c => c.type !== 'stdout').map(c => {
    if (c.type === 'webhook') return `webhook:${c.url.slice(0, 40)}...`;
    if (c.type === 'command') return `command:${c.cmd.slice(0, 40)}`;
    return c.type;
  });

  console.log(`\nagentflow watch started`);
  console.log(`  Directories:  ${valid.join(', ')}`);
  console.log(`  Poll:         ${config.pollIntervalMs / 1000}s`);
  console.log(`  Alert on:     ${condLabels.join(', ')}`);
  console.log(`  Notify:       stdout${channelLabels.length > 0 ? ', ' + channelLabels.join(', ') : ''}`);
  console.log(`  Cooldown:     ${Math.floor(config.cooldownMs / 60_000)}m`);
  console.log(`  State:        ${config.stateFilePath}`);
  console.log(`  Hostname:     ${hostname()}`);
  console.log('');

  let pollCount = 0;

  async function poll(): Promise<void> {
    const now = Date.now();
    pollCount++;

    // Scan and process files
    const files = scanFiles(valid, config.recursive);
    const records: AgentRecord[] = [];
    for (const f of files.slice(0, 500)) {
      const recs = f.ext === '.jsonl' ? processJsonlFile(f) : processJsonFile(f);
      records.push(...recs);
    }

    // Detect transitions and fire alerts
    const alerts = detectTransitions(state, records, config, now);

    for (const alert of alerts) {
      for (const channel of config.notifyChannels) {
        await sendAlert(alert, channel);
      }
    }

    // Update and persist state
    state = updateWatchState(state, records, alerts, now);
    saveWatchState(config.stateFilePath, state);

    // Periodic heartbeat (every 10 polls)
    if (pollCount % 10 === 0) {
      const agentCount = Object.keys(state.agents).length;
      const errorCount = Object.values(state.agents).filter(a => a.lastStatus === 'error').length;
      const runningCount = Object.values(state.agents).filter(a => a.lastStatus === 'running').length;
      const time = new Date().toLocaleTimeString();
      console.log(`[${time}] heartbeat: ${agentCount} agents, ${runningCount} running, ${errorCount} errors, ${files.length} files`);
    }
  }

  // Initial poll
  poll();

  // Periodic
  setInterval(() => { poll(); }, config.pollIntervalMs);

  // Graceful shutdown
  function shutdown() {
    console.log('\nagentflow watch stopped.');
    saveWatchState(config.stateFilePath, state);
    process.exit(0);
  }
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
