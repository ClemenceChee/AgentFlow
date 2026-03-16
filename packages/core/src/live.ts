#!/usr/bin/env node
/**
 * AgentFlow Live Monitor — real-time terminal dashboard for any agent system.
 *
 * Usage:
 *   agentflow live [traces-dir] [options]
 *   agentflow live ./traces --refresh 5
 *
 * Features:
 *   - Auto-discovers agents from trace files
 *   - Sparkline activity graph (1 hour)
 *   - Per-agent success/failure table
 *   - Distributed trace tree view
 *   - Recent execution feed
 *   - fs.watch auto-refresh on new traces
 *
 * @module
 */

import { readdirSync, readFileSync, statSync, watch, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { loadGraph } from './loader.js';
import { getStats, getFailures, getHungNodes, getDepth as getGraphDepth } from './graph-query.js';
import { groupByTraceId, stitchTrace, getTraceTree } from './graph-stitch.js';
import type { ExecutionGraph, DistributedTrace } from './types.js';

// ---------------------------------------------------------------------------
// ANSI helpers
// ---------------------------------------------------------------------------

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[90m', under: '\x1b[4m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', blue: '\x1b[34m',
  magenta: '\x1b[35m', cyan: '\x1b[36m', white: '\x1b[37m',
};

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

interface LiveConfig {
  tracesDir: string;
  refreshMs: number;
}

function parseArgs(argv: string[]): LiveConfig {
  const config: LiveConfig = {
    tracesDir: './traces',
    refreshMs: 3000,
  };

  const args = argv.slice(0);

  // Strip the "live" subcommand if present
  if (args[0] === 'live') args.shift();

  let i = 0;
  while (i < args.length) {
    const arg = args[i]!;

    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    } else if (arg === '--refresh' || arg === '-r') {
      i++;
      const val = parseInt(args[i] ?? '', 10);
      if (!isNaN(val) && val > 0) config.refreshMs = val * 1000;
      i++;
    } else if (arg === '--traces-dir' || arg === '-t') {
      i++;
      config.tracesDir = args[i] ?? config.tracesDir;
      i++;
    } else if (!arg.startsWith('-')) {
      // Positional: treat as traces dir
      config.tracesDir = arg;
      i++;
    } else {
      i++;
    }
  }

  config.tracesDir = resolve(config.tracesDir);
  return config;
}

function printUsage(): void {
  console.log(`
AgentFlow Live Monitor — real-time terminal dashboard for agent systems.

Usage:
  agentflow live [traces-dir] [options]

Arguments:
  traces-dir              Path to the traces directory (default: ./traces)

Options:
  -r, --refresh <secs>    Refresh interval in seconds (default: 3)
  -t, --traces-dir <path> Explicit traces directory path
  -h, --help              Show this help message

Examples:
  agentflow live
  agentflow live ./my-traces --refresh 5
  agentflow live /var/log/agentflow/traces -r 10
`.trim());
}

// ---------------------------------------------------------------------------
// Trace loading
// ---------------------------------------------------------------------------

interface TraceFile {
  filename: string;
  path: string;
  mtime: number;
}

function listTraceFiles(tracesDir: string): TraceFile[] {
  try {
    return readdirSync(tracesDir)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        const fp = join(tracesDir, f);
        const stat = statSync(fp);
        return { filename: f, path: fp, mtime: stat.mtime.getTime() };
      })
      .sort((a, b) => b.mtime - a.mtime);
  } catch {
    return [];
  }
}

function safeLoadTrace(fp: string): ExecutionGraph | null {
  try {
    return loadGraph(readFileSync(fp, 'utf8'));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

interface TraceAnalysis {
  agentId: string;
  trigger: string;
  traceId?: string;
  spanId?: string;
  parentSpanId?: string | null;
  nodes: number;
  success: boolean;
  failures: number;
  hung: number;
}

function analyze(trace: ExecutionGraph): TraceAnalysis | null {
  try {
    const stats = getStats(trace);
    const fails = getFailures(trace);
    const hung = getHungNodes(trace);
    return {
      agentId: trace.agentId,
      trigger: trace.trigger,
      traceId: trace.traceId,
      spanId: trace.spanId,
      parentSpanId: trace.parentSpanId,
      nodes: stats.totalNodes,
      success: fails.length === 0 && hung.length === 0,
      failures: fails.length,
      hung: hung.length,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Distributed trace depth helper
// ---------------------------------------------------------------------------

function getDistributedDepth(dt: DistributedTrace, spanId: string | undefined): number {
  if (!spanId) return 0;
  const graph = dt.graphs.get(spanId);
  if (!graph || !graph.parentSpanId) return 0;
  return 1 + getDistributedDepth(dt, graph.parentSpanId);
}

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

let prevFileCount = 0;
let newExecCount = 0;
const sessionStart = Date.now();

function render(config: LiveConfig): void {
  const files = listTraceFiles(config.tracesDir);

  if (files.length > prevFileCount && prevFileCount > 0) {
    newExecCount += files.length - prevFileCount;
  }
  prevFileCount = files.length;

  // Load all traces (cap at 200 for performance)
  const allTraces: ExecutionGraph[] = [];
  const agents: Record<string, { name: string; total: number; ok: number; fail: number; lastTs: number }> = {};

  for (const f of files.slice(0, 200)) {
    const trace = safeLoadTrace(f.path);
    if (!trace) continue;
    allTraces.push(trace);
    const a = analyze(trace);
    if (!a) continue;

    if (!agents[a.agentId]) {
      agents[a.agentId] = { name: a.agentId, total: 0, ok: 0, fail: 0, lastTs: 0 };
    }
    const ag = agents[a.agentId]!;
    ag.total++;
    a.success ? ag.ok++ : ag.fail++;
    if (f.mtime > ag.lastTs) ag.lastTs = f.mtime;
  }

  const agentList = Object.values(agents).sort((a, b) => b.total - a.total);
  const totExec = agentList.reduce((s, a) => s + a.total, 0);
  const totFail = agentList.reduce((s, a) => s + a.fail, 0);
  const sysRate = totExec > 0 ? ((totExec - totFail) / totExec * 100).toFixed(1) : '100.0';

  // Recent executions
  const recent: Array<TraceAnalysis & { ts: number }> = [];
  for (const f of files.slice(0, 15)) {
    const trace = safeLoadTrace(f.path);
    if (!trace) continue;
    const a = analyze(trace);
    if (a) recent.push({ ...a, ts: f.mtime });
  }

  // Sparkline (1 hour, 12 buckets of 5 minutes)
  const now = Date.now();
  const buckets = new Array(12).fill(0) as number[];
  const failBuckets = new Array(12).fill(0) as number[];
  for (const f of files) {
    const age = now - f.mtime;
    if (age > 3600000) continue;
    const idx = 11 - Math.floor(age / 300000);
    if (idx >= 0 && idx < 12) {
      const trace = safeLoadTrace(f.path);
      if (!trace) continue;
      const a = analyze(trace);
      if (!a) continue;
      buckets[idx]!++;
      if (!a.success) failBuckets[idx]!++;
    }
  }
  const maxBucket = Math.max(...buckets, 1);
  const sparkChars = ' \u2581\u2582\u2583\u2584\u2585\u2586\u2587\u2588';
  const spark = buckets.map((v, i) => {
    const level = Math.round((v / maxBucket) * 8);
    return (failBuckets[i]! > 0 ? C.red : C.green) + sparkChars[level] + C.reset;
  }).join('');

  // Distributed traces
  const traceGroups = groupByTraceId(allTraces);
  const distributedTraces: DistributedTrace[] = [];
  for (const [_traceId, graphs] of traceGroups) {
    if (graphs.length > 1) {
      try {
        distributedTraces.push(stitchTrace(graphs));
      } catch { /* skip malformed */ }
    }
  }
  distributedTraces.sort((a, b) => b.startTime - a.startTime);

  // Uptime
  const upSec = Math.floor((Date.now() - sessionStart) / 1000);
  const upMin = Math.floor(upSec / 60);
  const upStr = upMin > 0 ? `${upMin}m ${upSec % 60}s` : `${upSec}s`;
  const time = new Date().toLocaleTimeString();

  // === RENDER ===
  process.stdout.write('\x1b[2J\x1b[H');

  // Header
  console.log(`${C.bold}${C.cyan}\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557${C.reset}`);
  console.log(`${C.bold}${C.cyan}\u2551${C.reset}  ${C.bold}${C.white}AGENTFLOW LIVE${C.reset}                               ${C.green}\u25cf LIVE${C.reset}  ${C.dim}${time}${C.reset}  ${C.bold}${C.cyan}\u2551${C.reset}`);
  const metaLine = `Refresh: ${config.refreshMs / 1000}s \u00b7 Up: ${upStr}`;
  const pad1 = Math.max(0, 64 - metaLine.length);
  console.log(`${C.bold}${C.cyan}\u2551${C.reset}  ${C.dim}${metaLine}${C.reset}${' '.repeat(pad1)}${C.bold}${C.cyan}\u2551${C.reset}`);
  console.log(`${C.bold}${C.cyan}\u255a\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255d${C.reset}`);

  // Summary
  const sc = totFail === 0 ? C.green : C.yellow;
  console.log('');
  console.log(`  ${C.bold}Agents${C.reset} ${sc}${agentList.length}${C.reset}    ${C.bold}Executions${C.reset} ${sc}${totExec}${C.reset}    ${C.bold}Success${C.reset} ${sc}${sysRate}%${C.reset}    ${C.bold}Traces${C.reset} ${sc}${files.length}${C.reset}    ${C.bold}New${C.reset} ${C.yellow}+${newExecCount}${C.reset}    ${C.bold}Distributed${C.reset} ${C.magenta}${distributedTraces.length}${C.reset}`);

  // Sparkline
  console.log('');
  console.log(`  ${C.bold}Activity (1h)${C.reset}  ${spark}  ${C.dim}\u2190 now${C.reset}`);

  // Agent table
  console.log('');
  console.log(`  ${C.bold}${C.under}Agent                          Runs   OK  Fail  Rate     Last Active${C.reset}`);

  for (const ag of agentList) {
    const rate = ((ag.ok / ag.total) * 100).toFixed(0);
    const lastTime = new Date(ag.lastTs).toLocaleTimeString();
    const isRecent = (Date.now() - ag.lastTs) < 300000;

    let status: string;
    if (ag.fail > 0) status = `${C.red}\u25cf${C.reset}`;
    else if (isRecent) status = `${C.green}\u25cf${C.reset}`;
    else status = `${C.dim}\u25cb${C.reset}`;

    const name = ag.name.padEnd(28);
    const runs = String(ag.total).padStart(5);
    const ok = String(ag.ok).padStart(5);
    const fail = ag.fail > 0 ? `${C.red}${String(ag.fail).padStart(4)}${C.reset}` : String(ag.fail).padStart(4);
    const rateStr = (rate + '%').padStart(5);
    const activeStr = isRecent ? `${C.green}${lastTime}${C.reset}` : `${C.dim}${lastTime}${C.reset}`;

    console.log(`  ${status} ${name}${runs}${ok}${fail}  ${rateStr}     ${activeStr}`);
  }

  // Distributed Trace Tree View
  if (distributedTraces.length > 0) {
    console.log('');
    console.log(`  ${C.bold}${C.under}Distributed Traces (multi-agent workflows)${C.reset}`);

    for (const dt of distributedTraces.slice(0, 5)) {
      const traceTime = new Date(dt.startTime).toLocaleTimeString();
      const statusIcon = dt.status === 'completed' ? `${C.green}\u2713${C.reset}` :
                        dt.status === 'failed' ? `${C.red}\u2717${C.reset}` : `${C.yellow}\u23f3${C.reset}`;
      const dur = dt.endTime ? `${dt.endTime - dt.startTime}ms` : 'running';
      const tid = dt.traceId.slice(0, 8);

      console.log(`  ${statusIcon}  ${C.magenta}trace:${tid}${C.reset}  ${C.dim}${traceTime}${C.reset}  ${C.dim}${dur}${C.reset}  ${C.dim}(${dt.graphs.size} agents)${C.reset}`);

      const tree = getTraceTree(dt);
      for (let i = 0; i < tree.length; i++) {
        const g = tree[i]!;
        const depth = getDistributedDepth(dt, g.spanId);
        const indent = '     ' + '\u2502  '.repeat(Math.max(0, depth - 1));
        const isLast = i === tree.length - 1 || getDistributedDepth(dt, tree[i + 1]?.spanId) <= depth;
        const connector = depth === 0 ? '  ' : (isLast ? '\u2514\u2500 ' : '\u251c\u2500 ');

        const gStatus = g.status === 'completed' ? `${C.green}\u2713${C.reset}` :
                       g.status === 'failed' ? `${C.red}\u2717${C.reset}` : `${C.yellow}\u23f3${C.reset}`;
        const gDur = g.endTime ? `${g.endTime - g.startTime}ms` : 'running';

        console.log(`${indent}${connector}${gStatus} ${C.bold}${g.agentId}${C.reset} ${C.dim}[${g.trigger}] ${gDur}${C.reset}`);
      }
    }
  }

  // Recent executions
  console.log('');
  console.log(`  ${C.bold}${C.under}Recent Executions${C.reset}`);

  for (const ex of recent.slice(0, 8)) {
    const icon = ex.success ? `${C.green}\u2713${C.reset}` : `${C.red}\u2717${C.reset}`;
    const t = new Date(ex.ts).toLocaleTimeString();
    const agent = ex.agentId.padEnd(28);
    const age = Math.floor((Date.now() - ex.ts) / 1000);
    const ageStr = age < 60 ? age + 's ago' : Math.floor(age / 60) + 'm ago';
    const traceTag = ex.traceId ? ` ${C.magenta}\u29eb${C.reset}` : '';

    console.log(`  ${icon}  ${agent} ${C.dim}${t}  ${ageStr.padStart(8)}  ${ex.nodes} nodes${C.reset}${traceTag}`);
  }

  if (files.length === 0) {
    console.log(`  ${C.dim}No trace files found. Waiting for traces in:${C.reset}`);
    console.log(`  ${C.dim}${config.tracesDir}${C.reset}`);
  }

  console.log('');
  console.log(`  ${C.dim}Watching: ${config.tracesDir}${C.reset}`);
  console.log(`  ${C.dim}Press Ctrl+C to exit${C.reset}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export function startLive(argv: string[]): void {
  const config = parseArgs(argv);

  if (!existsSync(config.tracesDir)) {
    console.error(`Traces directory does not exist: ${config.tracesDir}`);
    console.error('Create it or specify a different path: agentflow live <traces-dir>');
    process.exit(1);
  }

  // Initial render
  render(config);

  // Watch for file changes
  let debounce: ReturnType<typeof setTimeout> | null = null;
  try {
    watch(config.tracesDir, () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => render(config), 500);
    });
  } catch {
    // fs.watch may not work on all platforms; fall back to interval-only
  }

  // Periodic refresh
  setInterval(() => render(config), config.refreshMs);

  process.on('SIGINT', () => {
    console.log('\n' + C.dim + 'Monitor stopped.' + C.reset);
    process.exit(0);
  });
}
