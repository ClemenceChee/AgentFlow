#!/usr/bin/env node
/**
 * AgentFlow CLI
 *
 * Subcommands:
 *   agentflow run  [options] -- <command>    Wrap a command with automatic tracing
 *   agentflow live [dir] [options]           Real-time terminal monitor
 *
 * @module
 */

import { basename, resolve } from 'path';
import { startLive } from './live.js';
import type { RunConfig } from './runner.js';
import { runTraced } from './runner.js';
import { handleTrace } from './trace-cli.js';
import { startWatch } from './watch.js';

// ---------------------------------------------------------------------------
// Top-level help
// ---------------------------------------------------------------------------

function printHelp(): void {
  console.log(
    `
AgentFlow CLI — execution tracing and live monitoring for AI agent systems.

Usage:
  agentflow <command> [options]

Commands:
  run    [options] -- <cmd>       Wrap a command with automatic execution tracing
  live   [dir...] [options]      Real-time terminal monitor (auto-detects any JSON/JSONL)
  watch  [dir...] [options]      Headless alert system — detects failures, sends notifications
  trace  <command> [options]     Inspect saved execution traces (list, show, timeline, stuck, loops)

Run \`agentflow <command> --help\` for command-specific options.

Examples:
  agentflow run --traces-dir ./traces -- python -m myagent process
  agentflow live ./data
  agentflow live ./traces ./cron ./workers -R
  agentflow watch ./data --alert-on error --notify telegram
  agentflow watch ./data ./cron --alert-on stale:15m --notify webhook:https://...
`.trim(),
  );
}

// ---------------------------------------------------------------------------
// "run" subcommand
// ---------------------------------------------------------------------------

interface ParsedRunArgs {
  tracesDir: string;
  watchDirs: string[];
  watchPatterns: string[];
  agentId?: string;
  trigger: string;
  command: string[];
}

function parseRunArgs(argv: string[]): ParsedRunArgs {
  const result: ParsedRunArgs = {
    tracesDir: './traces',
    watchDirs: [],
    watchPatterns: ['*.json'],
    trigger: 'cli',
    command: [],
  };

  const dashDashIdx = argv.indexOf('--');
  const flagArgs = dashDashIdx === -1 ? argv : argv.slice(0, dashDashIdx);
  const commandArgs = dashDashIdx === -1 ? [] : argv.slice(dashDashIdx + 1);

  let i = 0;
  while (i < flagArgs.length) {
    const arg = flagArgs[i];

    switch (arg) {
      case 'run':
        i++;
        break;
      case '--traces-dir':
        i++;
        result.tracesDir = flagArgs[i] ?? result.tracesDir;
        i++;
        break;
      case '--watch-dir':
        i++;
        if (flagArgs[i]) {
          result.watchDirs.push(flagArgs[i]!);
        }
        i++;
        break;
      case '--watch-pattern':
        i++;
        if (flagArgs[i]) {
          if (result.watchPatterns.length === 1 && result.watchPatterns[0] === '*.json') {
            result.watchPatterns = [];
          }
          result.watchPatterns.push(flagArgs[i]!);
        }
        i++;
        break;
      case '--agent-id':
        i++;
        result.agentId = flagArgs[i];
        i++;
        break;
      case '--trigger':
        i++;
        result.trigger = flagArgs[i] ?? result.trigger;
        i++;
        break;
      default:
        i++;
        break;
    }
  }

  result.command = commandArgs;
  return result;
}

function printRunUsage(): void {
  console.log(
    `
AgentFlow Run — wrap any command with automatic execution tracing.

Usage:
  agentflow run [options] -- <command>

Options:
  --traces-dir <path>     Directory to save trace files (default: ./traces)
  --watch-dir <path>      Directory to watch for state changes (repeatable)
  --watch-pattern <glob>  File pattern to watch (default: *.json)
  --agent-id <name>       Agent ID for the orchestrator trace
  --trigger <name>        Trigger label (default: cli)
  --help                  Show this help message

Examples:
  agentflow run -- python -m myagent process
  agentflow run --watch-dir ./data -- python worker.py
  agentflow run --traces-dir ./my-traces --agent-id recon -- node agent.js
`.trim(),
  );
}

async function runCommand(argv: string[]): Promise<void> {
  if (argv.includes('--help') || argv.includes('-h')) {
    printRunUsage();
    process.exit(0);
  }

  const parsed = parseRunArgs(argv);

  if (parsed.command.length === 0) {
    console.error(
      'Error: No command specified. Use -- to separate agentflow flags from the command.',
    );
    console.error('Example: agentflow run -- python -m myagent process');
    process.exit(1);
  }

  const commandStr = parsed.command.join(' ');
  const watchSummary =
    parsed.watchDirs.length > 0
      ? parsed.watchDirs.map((d) => `${d} (${parsed.watchPatterns.join(', ')})`).join(', ')
      : '(none)';

  console.log(`\n\uD83D\uDD0D AgentFlow: Tracing command: ${commandStr}`);
  console.log(`\uD83D\uDCC1 Traces: ${parsed.tracesDir}`);
  console.log(`\uD83D\uDC41\uFE0F  Watching: ${watchSummary}`);
  console.log('');

  const config: RunConfig = {
    command: parsed.command,
    tracesDir: parsed.tracesDir,
    watchDirs: parsed.watchDirs,
    watchPatterns: parsed.watchPatterns,
    trigger: parsed.trigger,
  };
  if (parsed.agentId) {
    config.agentId = parsed.agentId;
  }

  try {
    const result = await runTraced(config);

    console.log('');
    console.log(
      `\u2705 Command completed (exit code ${result.exitCode}, ${result.duration.toFixed(1)}s)`,
    );

    if (result.tracePaths.length > 0) {
      console.log('\uD83D\uDCDD Traces saved:');

      const orchPath = result.tracePaths[0]!;
      const orchName = basename(orchPath, '.json').split('-')[0] ?? 'orchestrator';
      console.log(`   ${orchName.padEnd(14)} \u2192 ${orchPath}`);

      for (let i = 1; i < result.tracePaths.length; i++) {
        const tPath = result.tracePaths[i]!;
        const name = basename(tPath, '.json').replace(/-\d{4}-.*$/, '');
        const isLast = i === result.tracePaths.length - 1;
        const prefix = isLast ? '\u2514\u2500' : '\u251C\u2500';
        console.log(`   ${prefix} ${name.padEnd(12)} \u2192 ${tPath} (state changed)`);
      }
    }

    console.log(`\uD83D\uDD17 Trace ID: ${result.traceId}`);
    console.log('');

    process.exit(result.exitCode);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`\u274C AgentFlow error: ${message}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Main router
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const argv = process.argv.slice(2);

  const knownCommands = ['run', 'live', 'watch', 'trace'];
  if (
    argv.length === 0 ||
    (!knownCommands.includes(argv[0]!) && (argv.includes('--help') || argv.includes('-h')))
  ) {
    printHelp();
    process.exit(0);
  }

  const subcommand = argv[0];

  switch (subcommand) {
    case 'run':
      await runCommand(argv);
      break;
    case 'live':
      startLive(argv);
      break;
    case 'watch':
      startWatch(argv);
      break;
    case 'trace':
      await handleTrace(argv);
      break;
    default:
      // If no subcommand, check if it looks like a path (for `agentflow ./traces` shortcut)
      if (!subcommand?.startsWith('-')) {
        // Assume `agentflow live <dir>` shortcut
        startLive(['live', ...argv]);
      } else {
        printHelp();
        process.exit(1);
      }
      break;
  }
}

main();
