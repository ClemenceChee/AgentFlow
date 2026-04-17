/**
 * CLI runner that wraps any command with automatic AgentFlow tracing.
 *
 * No code changes needed in the target application — the runner sets
 * AGENTFLOW_TRACE_ID and AGENTFLOW_PARENT_SPAN_ID env vars so any child
 * process using AgentFlow auto-joins the distributed trace.
 *
 * @example
 * ```ts
 * const result = await runTraced({
 *   command: ['python', '-m', 'alfred', 'process'],
 *   watchDirs: ['/home/trader/.alfred/data'],
 * });
 * ```
 * @module
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

import { createGraphBuilder } from './graph-builder.js';
import { graphToJson } from './loader.js';
import type { ExecutionGraph } from './types.js';

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface RunConfig {
  /** Command to execute (e.g. ['python', '-m', 'alfred', 'process']). */
  command: string[];
  /** Agent ID for the orchestrator trace (default: derived from command). */
  agentId?: string;
  /** Trigger label (default: "cli"). */
  trigger?: string;
  /** Directory to save trace files (default: ./traces). */
  tracesDir?: string;
  /** Directories to watch for state file changes during execution. */
  watchDirs?: string[];
  /** File patterns to watch (default: ["*.json"]). */
  watchPatterns?: string[];
  /** Operator ID for context tracking (default: from environment). */
  operatorId?: string;
}

export interface RunResult {
  exitCode: number;
  traceId: string;
  spanId: string;
  tracePaths: string[];
  stateChanges: string[];
  duration: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert a glob pattern like "*.json" into a RegExp. */
function globToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`);
}

/** Snapshot mtimes of matching files in a directory. */
function snapshotDir(dir: string, patterns: RegExp[]): Map<string, number> {
  const result = new Map<string, number>();
  if (!existsSync(dir)) return result;

  for (const entry of readdirSync(dir)) {
    if (!patterns.some((re) => re.test(entry))) continue;
    const full = join(dir, entry);
    try {
      const stat = statSync(full);
      if (stat.isFile()) {
        result.set(full, stat.mtimeMs);
      }
    } catch {
      // file may have been removed between readdir and stat
    }
  }
  return result;
}

/** Derive a short agent ID from a state filename. */
function agentIdFromFilename(filePath: string): string {
  const base = basename(filePath, '.json');
  // "curator-state" → "alfred-curator", "janitor-state" → "alfred-janitor"
  const cleaned = base.replace(/-state$/, '');
  return `alfred-${cleaned}`;
}

/** Derive a default agent ID from the command array. */
function deriveAgentId(_command: string[]): string {
  // e.g. ['python', '-m', 'alfred', 'process'] → 'orchestrator'
  return 'orchestrator';
}

/** Build a timestamp string suitable for filenames. */
function fileTimestamp(): string {
  return new Date()
    .toISOString()
    .replace(/:/g, '-')
    .replace(/\.\d+Z$/, '');
}

// graphToJson is imported from ./loader.js

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/**
 * Run a command with automatic AgentFlow tracing.
 *
 * 1. Creates an orchestrator (parent) trace.
 * 2. Snapshots watched directories.
 * 3. Spawns the command with trace env vars.
 * 4. After exit, detects state file changes and creates child traces.
 * 5. Saves all trace JSON files.
 */
export async function runTraced(config: RunConfig): Promise<RunResult> {
  const {
    command,
    agentId = deriveAgentId(command),
    trigger = 'cli',
    tracesDir = './traces',
    watchDirs = [],
    watchPatterns = ['*.json'],
    operatorId,
  } = config;

  if (command.length === 0) {
    throw new Error('runTraced: command must not be empty');
  }

  const resolvedTracesDir = resolve(tracesDir);
  const patterns = watchPatterns.map(globToRegex);

  // --- 1. Create orchestrator graph builder ---
  const orchestratorConfig: Parameters<typeof createGraphBuilder>[0] = {
    agentId,
    trigger,
    ...(operatorId && {
      operatorContext: {
        operatorId,
        sessionId: process.env?.CLAUDE_CODE_SESSION_ID || `cli-${Date.now()}`,
        teamId: process.env?.TEAM_ID,
        instanceId: process.env?.CLAUDE_CODE_INSTANCE_ID,
        timestamp: Date.now(),
        userAgent: process.env?.CLAUDE_CODE_USER_AGENT
      }
    })
  };
  const orchestrator = createGraphBuilder(orchestratorConfig);
  const { traceId, spanId } = orchestrator.traceContext;

  // --- 2. Snapshot state dirs ---
  const beforeSnapshots = new Map<string, Map<string, number>>();
  for (const dir of watchDirs) {
    beforeSnapshots.set(dir, snapshotDir(dir, patterns));
  }

  // --- 3. Build orchestrator trace nodes ---
  const rootId = orchestrator.startNode({ type: 'agent', name: agentId });

  const dispatchId = orchestrator.startNode({
    type: 'tool',
    name: 'dispatch-command',
    parentId: rootId,
  });
  orchestrator.updateState(dispatchId, { command: command.join(' ') });

  const monitorId = orchestrator.startNode({
    type: 'tool',
    name: 'state-monitor',
    parentId: rootId,
  });
  orchestrator.updateState(monitorId, {
    watchDirs,
    watchPatterns,
  });

  // --- 4. Spawn the child process ---
  const startMs = Date.now();

  const execCmd: string = command[0] ?? '';
  const execArgs: string[] = command.slice(1);
  process.env.AGENTFLOW_TRACE_ID = traceId;
  process.env.AGENTFLOW_PARENT_SPAN_ID = spanId;
  const result = spawnSync(execCmd, execArgs, { stdio: 'inherit' });
  delete process.env.AGENTFLOW_TRACE_ID;
  delete process.env.AGENTFLOW_PARENT_SPAN_ID;
  const exitCode = result.status ?? 1;

  const duration = (Date.now() - startMs) / 1000;

  // --- 5. Detect changed state files ---
  const stateChanges: string[] = [];
  for (const dir of watchDirs) {
    const before = beforeSnapshots.get(dir) ?? new Map();
    const after = snapshotDir(dir, patterns);

    for (const [filePath, mtime] of after) {
      const prevMtime = before.get(filePath);
      if (prevMtime === undefined || mtime > prevMtime) {
        stateChanges.push(filePath);
      }
    }
  }

  // End orchestrator tool nodes
  orchestrator.updateState(monitorId, { stateChanges });
  orchestrator.endNode(monitorId);

  if (exitCode === 0) {
    orchestrator.endNode(dispatchId);
  } else {
    orchestrator.failNode(dispatchId, `Command exited with code ${exitCode}`);
  }

  orchestrator.updateState(rootId, {
    exitCode,
    duration,
    stateChanges,
  });
  if (exitCode === 0) {
    orchestrator.endNode(rootId);
  } else {
    orchestrator.failNode(rootId, `Command exited with code ${exitCode}`);
  }

  const orchestratorGraph = orchestrator.build();

  // --- 6. Create child traces for changed state files ---
  const allGraphs: ExecutionGraph[] = [orchestratorGraph];

  for (const filePath of stateChanges) {
    const childAgentId = agentIdFromFilename(filePath);
    const childConfig: Parameters<typeof createGraphBuilder>[0] = {
      agentId: childAgentId,
      trigger: 'state-change',
      traceId,
      parentSpanId: spanId,
      ...(operatorId && {
        operatorContext: {
          operatorId,
          sessionId: process.env?.CLAUDE_CODE_SESSION_ID || `cli-${Date.now()}`,
          teamId: process.env?.TEAM_ID,
          instanceId: process.env?.CLAUDE_CODE_INSTANCE_ID,
          timestamp: Date.now(),
          userAgent: process.env?.CLAUDE_CODE_USER_AGENT
        }
      })
    };
    const childBuilder = createGraphBuilder(childConfig);

    const childRootId = childBuilder.startNode({
      type: 'agent',
      name: childAgentId,
    });
    childBuilder.updateState(childRootId, {
      stateFile: filePath,
      detectedBy: 'runner-state-monitor',
    });
    childBuilder.endNode(childRootId);
    allGraphs.push(childBuilder.build());
  }

  // --- 7. Save traces to disk ---
  if (!existsSync(resolvedTracesDir)) {
    mkdirSync(resolvedTracesDir, { recursive: true });
  }

  const ts = fileTimestamp();
  const tracePaths: string[] = [];

  for (const graph of allGraphs) {
    const filename = `${graph.agentId}-${ts}.json`;
    const outPath = join(resolvedTracesDir, filename);
    const resolvedOut = resolve(outPath);
    if (!resolvedOut.startsWith(`${resolvedTracesDir}/`) && resolvedOut !== resolvedTracesDir) {
      throw new Error(
        `Path traversal detected: agentId "${graph.agentId}" escapes traces directory`,
      );
    }
    writeFileSync(outPath, JSON.stringify(graphToJson(graph), null, 2), 'utf-8');
    tracePaths.push(outPath);
  }

  // Hint for trace inspection
  if (tracePaths.length > 0) {
    console.log(
      `\uD83D\uDD0D Run "agentflow trace show ${orchestratorGraph.id} --traces-dir ${resolvedTracesDir}" to inspect`,
    );
  }

  return {
    exitCode,
    traceId,
    spanId,
    tracePaths,
    stateChanges,
    duration,
  };
}
