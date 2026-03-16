#!/usr/bin/env node
/**
 * AgentFlow CLI
 * Usage: agentflow run [options] -- <command>
 *
 * Options:
 *   --traces-dir <path>     Directory to save traces (default: ./traces)
 *   --watch-dir <path>      Directory to watch for state changes (repeatable)
 *   --watch-pattern <glob>  File pattern to watch (default: *.json)
 *   --agent-id <name>       Agent ID for orchestrator (default: derived from command)
 *   --trigger <name>        Trigger label (default: cli)
 *
 * @module
 */

import { basename } from 'path';

import type { RunConfig } from './runner.js';
import { runTraced } from './runner.js';

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

interface ParsedArgs {
  tracesDir: string;
  watchDirs: string[];
  watchPatterns: string[];
  agentId?: string;
  trigger: string;
  command: string[];
}

function parseArgs(argv: string[]): ParsedArgs {
  const result: ParsedArgs = {
    tracesDir: './traces',
    watchDirs: [],
    watchPatterns: ['*.json'],
    trigger: 'cli',
    command: [],
  };

  // Find the "--" separator
  const dashDashIdx = argv.indexOf('--');
  const flagArgs = dashDashIdx === -1 ? argv : argv.slice(0, dashDashIdx);
  const commandArgs = dashDashIdx === -1 ? [] : argv.slice(dashDashIdx + 1);

  let i = 0;
  while (i < flagArgs.length) {
    const arg = flagArgs[i];

    switch (arg) {
      case 'run':
        // subcommand — skip it
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
          // Replace defaults on first explicit pattern
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

function printUsage(): void {
  console.log(`
AgentFlow CLI — Wrap any command with automatic execution tracing.

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
  agentflow run -- python -m alfred process
  agentflow run --watch-dir /home/trader/.alfred/data -- python -m alfred process
  agentflow run --traces-dir ./my-traces --agent-id alfred -- node worker.js
`.trim());
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  // Skip node and script path
  const argv = process.argv.slice(2);

  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  const parsed = parseArgs(argv);

  if (parsed.command.length === 0) {
    console.error('Error: No command specified. Use -- to separate agentflow flags from the command.');
    console.error('Example: agentflow run -- python -m alfred process');
    process.exit(1);
  }

  const commandStr = parsed.command.join(' ');
  const watchSummary = parsed.watchDirs.length > 0
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
    console.log(`\u2705 Command completed (exit code ${result.exitCode}, ${result.duration.toFixed(1)}s)`);

    if (result.tracePaths.length > 0) {
      console.log('\uD83D\uDCDD Traces saved:');

      // Print the orchestrator trace (first one)
      const orchPath = result.tracePaths[0]!;
      const orchName = basename(orchPath, '.json').split('-')[0] ?? 'orchestrator';
      console.log(`   ${orchName.padEnd(14)} \u2192 ${orchPath}`);

      // Print child traces with tree formatting
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

main();
