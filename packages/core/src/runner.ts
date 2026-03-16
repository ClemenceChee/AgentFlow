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
function snapshotDir(
  dir: string,
  patterns: RegExp[],
): Map<string, number> {
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
function deriveAgentId(command: string[]): string {
  // e.g. ['python', '-m', 'alfred', 'process'] → 'orchestrator'
  return 'orchestrator';
}

/** Build a timestamp string suitable for filenames. */
function fileTimestamp(): string {
  return new Date().toISOString().replace(/:/g, '-').replace(/\.\d+Z$/, '');
}

/** Serialize an ExecutionGraph to a plain JSON-safe object. */
function graphToJson(graph: ExecutionGraph): Record<string, unknown> {
  const nodesObj: Record<string, unknown> = {};
  for (const [id, node] of graph.nodes) {
    nodesObj[id] = node;
  }
  return {
    id: graph.id,
    rootNodeId: graph.rootNodeId,
    nodes: nodesObj,
    edges: graph.edges,
    startTime: graph.startTime,
    endTime: graph.endTime,
    status: graph.status,
    trigger: graph.trigger,
    agentId: graph.agentId,
    events: graph.events,
    traceId: graph.traceId,
    spanId: graph.spanId,
    parentSpanId: graph.parentSpanId,
  };
}

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
  } = config;

  if (command.length === 0) {
    throw new Error('runTraced: command must not be empty');
  }

  const resolvedTracesDir = resolve(tracesDir);
  const patterns = watchPatterns.map(globToRegex);

  // --- 1. Create orchestrator graph builder ---
  const orchestrator = createGraphBuilder({ agentId, trigger });
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
    const childBuilder = createGraphBuilder({
      agentId: childAgentId,
      trigger: 'state-change',
      traceId,
      parentSpanId: spanId,
    });

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
    writeFileSync(outPath, JSON.stringify(graphToJson(graph), null, 2), 'utf-8');
    tracePaths.push(outPath);
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
