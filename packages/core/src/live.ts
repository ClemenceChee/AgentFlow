#!/usr/bin/env node
/**
 * AgentFlow Live Monitor — real-time terminal dashboard for any agent system.
 *
 * Auto-detects and displays data from any JSON/JSONL files in the watched
 * directory. Works with agentflow traces, generic state files, job
 * schedulers, session logs — no configuration needed.
 *
 * File detection:
 *   .json with `nodes` + `agentId`          → AgentFlow trace (full analysis)
 *   .json with array of objects with `state` → Job/task list (per-item status)
 *   .json with `status`/`pid`/`tools`        → Process/worker state
 *   .json with any other structure            → Generic state (mtime-based)
 *   .jsonl                                    → Session log (last entry status)
 *
 * @module
 */

import { readdirSync, readFileSync, statSync, watch, existsSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';

import { loadGraph } from './loader.js';
import { getStats, getFailures, getHungNodes } from './graph-query.js';
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
// Arguments
// ---------------------------------------------------------------------------

interface LiveConfig {
  dirs: string[];
  refreshMs: number;
  recursive: boolean;
}

function parseArgs(argv: string[]): LiveConfig {
  const config: LiveConfig = { dirs: [], refreshMs: 3000, recursive: false };
  const args = argv.slice(0);
  if (args[0] === 'live') args.shift();

  let i = 0;
  while (i < args.length) {
    const arg = args[i]!;
    if (arg === '--help' || arg === '-h') { printUsage(); process.exit(0); }
    else if (arg === '--refresh' || arg === '-r') {
      i++; const v = parseInt(args[i] ?? '', 10);
      if (!isNaN(v) && v > 0) config.refreshMs = v * 1000; i++;
    } else if (arg === '--recursive' || arg === '-R') { config.recursive = true; i++; }
    else if (!arg.startsWith('-')) { config.dirs.push(resolve(arg)); i++; }
    else { i++; }
  }
  if (config.dirs.length === 0) config.dirs.push(resolve('.'));
  return config;
}

function printUsage(): void {
  console.log(`
AgentFlow Live Monitor — real-time terminal dashboard for agent systems.

Auto-detects agent traces, state files, job schedulers, and session logs
from any JSON/JSONL files in the watched directories.

Usage:
  agentflow live [dir...] [options]

Arguments:
  dir                     One or more directories to watch (default: .)

Options:
  -r, --refresh <secs>    Refresh interval in seconds (default: 3)
  -R, --recursive         Scan subdirectories (1 level deep)
  -h, --help              Show this help message

Examples:
  agentflow live ./data
  agentflow live ./traces ./cron ./workers --refresh 5
  agentflow live /var/lib/myagent -R
`.trim());
}

// ---------------------------------------------------------------------------
// Unified agent record (any source type)
// ---------------------------------------------------------------------------

type SourceType = 'trace' | 'state' | 'jobs' | 'session' | 'workers';

interface AgentRecord {
  id: string;
  source: SourceType;
  status: 'ok' | 'error' | 'running' | 'unknown';
  lastActive: number;       // epoch ms
  detail: string;           // one-line summary
  file: string;             // source filename
  // trace-specific (populated only for agentflow traces)
  traceData?: ExecutionGraph;
}

// ---------------------------------------------------------------------------
// File scanning
// ---------------------------------------------------------------------------

interface ScannedFile {
  filename: string;
  path: string;
  mtime: number;
  ext: '.json' | '.jsonl';
}

function scanFiles(dirs: string[], recursive: boolean): ScannedFile[] {
  const results: ScannedFile[] = [];
  const seen = new Set<string>();

  function scanDir(d: string, topLevel: boolean) {
    try {
      for (const f of readdirSync(d)) {
        if (f.startsWith('.')) continue;
        const fp = join(d, f);
        if (seen.has(fp)) continue;
        let stat;
        try { stat = statSync(fp); } catch { continue; }

        if (stat.isDirectory() && recursive && topLevel) {
          scanDir(fp, false);
          continue;
        }
        if (!stat.isFile()) continue;

        if (f.endsWith('.json')) {
          seen.add(fp);
          results.push({ filename: f, path: fp, mtime: stat.mtime.getTime(), ext: '.json' });
        } else if (f.endsWith('.jsonl')) {
          seen.add(fp);
          results.push({ filename: f, path: fp, mtime: stat.mtime.getTime(), ext: '.jsonl' });
        }
      }
    } catch { /* dir not readable */ }
  }

  for (const dir of dirs) scanDir(dir, true);
  results.sort((a, b) => b.mtime - a.mtime);
  return results;
}

// ---------------------------------------------------------------------------
// Auto-detection: classify and extract from any JSON file
// ---------------------------------------------------------------------------

function safeReadJson(fp: string): unknown {
  try { return JSON.parse(readFileSync(fp, 'utf8')); } catch { return null; }
}

function nameFromFile(filename: string): string {
  return basename(filename).replace(/\.(json|jsonl)$/, '').replace(/-state$/, '');
}

/** Detect common status field values and normalize to ok/error/running/unknown */
function normalizeStatus(val: unknown): 'ok' | 'error' | 'running' | 'unknown' {
  if (typeof val !== 'string') return 'unknown';
  const s = val.toLowerCase();
  if (['ok', 'success', 'completed', 'done', 'passed', 'healthy', 'good'].includes(s)) return 'ok';
  if (['error', 'failed', 'failure', 'crashed', 'unhealthy', 'bad', 'timeout'].includes(s)) return 'error';
  if (['running', 'active', 'in_progress', 'started', 'pending', 'processing'].includes(s)) return 'running';
  return 'unknown';
}

/** Search an object for common status-like fields */
function findStatus(obj: Record<string, unknown>): 'ok' | 'error' | 'running' | 'unknown' {
  for (const key of ['status', 'state', 'lastRunStatus', 'lastStatus', 'health', 'result']) {
    if (key in obj) {
      const val = obj[key];
      if (typeof val === 'string') return normalizeStatus(val);
      if (typeof val === 'object' && val !== null && 'status' in (val as Record<string, unknown>)) {
        return normalizeStatus((val as Record<string, unknown>).status);
      }
    }
  }
  return 'unknown';
}

/** Search an object for a timestamp field (returns epoch ms or 0) */
function findTimestamp(obj: Record<string, unknown>): number {
  for (const key of ['ts', 'timestamp', 'lastRunAtMs', 'last_run', 'lastExecution', 'updated_at', 'started_at', 'endTime', 'startTime']) {
    const val = obj[key];
    if (typeof val === 'number') return val > 1e12 ? val : val * 1000; // handle seconds vs ms
    if (typeof val === 'string') {
      const d = Date.parse(val);
      if (!isNaN(d)) return d;
    }
  }
  return 0;
}

/** Extract a one-line detail string from an object */
function extractDetail(obj: Record<string, unknown>): string {
  const parts: string[] = [];
  // Look for common informative fields
  for (const key of ['summary', 'message', 'description', 'lastError', 'error', 'name', 'jobId', 'id']) {
    const val = obj[key];
    if (typeof val === 'string' && val.length > 0 && val.length < 200) {
      parts.push(val.slice(0, 80));
      break;
    }
  }
  // Add numeric stats if present
  for (const key of ['totalExecutions', 'runs', 'count', 'processed', 'consecutiveErrors']) {
    const val = obj[key];
    if (typeof val === 'number') { parts.push(`${key}: ${val}`); break; }
  }
  return parts.join(' | ') || '';
}

/** Try to load as an agentflow trace */
function tryLoadTrace(fp: string, raw: unknown): ExecutionGraph | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  // Heuristic: agentflow traces have nodes + agentId (or rootNodeId)
  if (!('nodes' in obj)) return null;
  if (!('agentId' in obj) && !('rootNodeId' in obj) && !('rootId' in obj)) return null;
  try { return loadGraph(obj); } catch { return null; }
}

/** Process a .json file into agent records */
function processJsonFile(file: ScannedFile): AgentRecord[] {
  const raw = safeReadJson(file.path);
  if (raw === null) return [];
  const records: AgentRecord[] = [];

  // 1. Try as agentflow trace
  const trace = tryLoadTrace(file.path, raw);
  if (trace) {
    try {
      const fails = getFailures(trace);
      const hung = getHungNodes(trace);
      const stats = getStats(trace);
      records.push({
        id: trace.agentId,
        source: 'trace',
        status: (fails.length === 0 && hung.length === 0) ? 'ok' : 'error',
        lastActive: file.mtime,
        detail: `${stats.totalNodes} nodes [${trace.trigger}]`,
        file: file.filename,
        traceData: trace,
      });
    } catch { /* skip broken trace */ }
    return records;
  }

  if (typeof raw !== 'object') return records;

  // 2. Array at top level or under a known key → job/task list
  const arr = Array.isArray(raw) ? raw :
    Array.isArray((raw as Record<string, unknown>).jobs) ? (raw as Record<string, unknown>).jobs as unknown[] :
    Array.isArray((raw as Record<string, unknown>).tasks) ? (raw as Record<string, unknown>).tasks as unknown[] :
    Array.isArray((raw as Record<string, unknown>).items) ? (raw as Record<string, unknown>).items as unknown[] :
    null;

  if (arr && arr.length > 0 && typeof arr[0] === 'object' && arr[0] !== null) {
    for (const item of arr.slice(0, 50) as Record<string, unknown>[]) {
      const name = (item.name ?? item.id ?? item.jobId ?? item.agentId) as string | undefined;
      if (!name) continue;
      const state = (typeof item.state === 'object' && item.state !== null) ? item.state as Record<string, unknown> : item;
      const status = findStatus(state);
      const ts = findTimestamp(state) || file.mtime;
      const detail = extractDetail(state);
      records.push({ id: String(name), source: 'jobs', status, lastActive: ts, detail, file: file.filename });
    }
    return records;
  }

  // 3. Object with `tools`/`workers`/`services` sub-objects → worker registry
  const obj = raw as Record<string, unknown>;
  for (const containerKey of ['tools', 'workers', 'services', 'agents', 'daemons']) {
    const container = obj[containerKey];
    if (typeof container === 'object' && container !== null && !Array.isArray(container)) {
      for (const [name, info] of Object.entries(container as Record<string, unknown>)) {
        if (typeof info !== 'object' || info === null) continue;
        const w = info as Record<string, unknown>;
        const status = findStatus(w);
        const ts = findTimestamp(w) || findTimestamp(obj) || file.mtime;
        const pid = w.pid as number | undefined;
        const detail = pid ? `pid: ${pid}` : extractDetail(w);
        records.push({ id: name, source: 'workers', status, lastActive: ts, detail, file: file.filename });
      }
      return records;
    }
  }

  // 4. Generic state file
  const status = findStatus(obj);
  const ts = findTimestamp(obj) || file.mtime;
  const detail = extractDetail(obj);
  records.push({ id: nameFromFile(file.filename), source: 'state', status, lastActive: ts, detail, file: file.filename });
  return records;
}

/** Process a .jsonl file — read last non-empty line */
function processJsonlFile(file: ScannedFile): AgentRecord[] {
  try {
    const content = readFileSync(file.path, 'utf8').trim();
    if (!content) return [];
    const lines = content.split('\n');
    // Read last line
    const lastLine = lines[lines.length - 1]!;
    const obj = JSON.parse(lastLine) as Record<string, unknown>;
    const name = (obj.jobId ?? obj.agentId ?? obj.name ?? obj.id ?? nameFromFile(file.filename)) as string;
    const status = findStatus(obj);
    const ts = findTimestamp(obj) || file.mtime;
    const action = obj.action as string | undefined;
    const detail = action ? `${action} (${lines.length} entries)` : `${lines.length} entries`;
    return [{ id: String(name), source: 'session', status, lastActive: ts, detail, file: file.filename }];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Flicker-free rendering: buffer lines, cursor-home, overwrite, clear tail
// ---------------------------------------------------------------------------

const K = '\x1b[K'; // clear to end of line

function writeLine(lines: string[], text: string): void {
  lines.push(text + K);
}

function flushLines(lines: string[]): void {
  // Move cursor home (no screen clear)
  process.stdout.write('\x1b[H');
  // Write all lines, each ending with clear-to-EOL
  process.stdout.write(lines.join('\n') + '\n');
  // Clear everything below the last line
  process.stdout.write('\x1b[J');
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

let prevFileCount = 0;
let newExecCount = 0;
const sessionStart = Date.now();
let firstRender = true;

function render(config: LiveConfig): void {
  const files = scanFiles(config.dirs, config.recursive);

  if (files.length > prevFileCount && prevFileCount > 0) {
    newExecCount += files.length - prevFileCount;
  }
  prevFileCount = files.length;

  // Process all files into agent records
  const allRecords: AgentRecord[] = [];
  const allTraces: ExecutionGraph[] = [];

  for (const f of files.slice(0, 300)) {
    const records = f.ext === '.jsonl' ? processJsonlFile(f) : processJsonFile(f);
    for (const r of records) {
      allRecords.push(r);
      if (r.traceData) allTraces.push(r.traceData);
    }
  }

  // Group records by source file for nesting
  const byFile = new Map<string, AgentRecord[]>();
  for (const r of allRecords) {
    const arr = byFile.get(r.file) ?? [];
    arr.push(r);
    byFile.set(r.file, arr);
  }

  // Build grouped agent list: single-record files are top-level,
  // multi-record files become a group with children
  interface AgentGroup {
    name: string;
    source: SourceType;
    status: 'ok' | 'error' | 'running' | 'unknown';
    lastTs: number;
    detail: string;
    children: AgentRecord[];
    ok: number;
    fail: number;
    running: number;
    total: number;
  }

  const groups: AgentGroup[] = [];

  for (const [file, records] of byFile) {
    if (records.length === 1) {
      const r = records[0]!;
      groups.push({
        name: r.id, source: r.source, status: r.status, lastTs: r.lastActive,
        detail: r.detail, children: [], ok: r.status === 'ok' ? 1 : 0,
        fail: r.status === 'error' ? 1 : 0, running: r.status === 'running' ? 1 : 0, total: 1,
      });
    } else {
      // Multi-record file: group name from filename, children are the records
      const groupName = nameFromFile(file);
      let lastTs = 0;
      let ok = 0, fail = 0, running = 0;
      for (const r of records) {
        if (r.lastActive > lastTs) lastTs = r.lastActive;
        if (r.status === 'ok') ok++;
        else if (r.status === 'error') fail++;
        else if (r.status === 'running') running++;
      }
      const status: AgentGroup['status'] = fail > 0 ? 'error' : running > 0 ? 'running' : ok > 0 ? 'ok' : 'unknown';
      groups.push({
        name: groupName, source: records[0]!.source, status, lastTs,
        detail: `${records.length} agents`, children: records.sort((a, b) => b.lastActive - a.lastActive),
        ok, fail, running, total: records.length,
      });
    }
  }

  groups.sort((a, b) => b.lastTs - a.lastTs);

  const totExec = allRecords.length;
  const totFail = allRecords.filter(r => r.status === 'error').length;
  const totRunning = allRecords.filter(r => r.status === 'running').length;
  const uniqueAgents = new Set(allRecords.map(r => r.id)).size;
  const sysRate = totExec > 0 ? (((totExec - totFail) / totExec) * 100).toFixed(1) : '100.0';

  // Sparkline
  const now = Date.now();
  const buckets = new Array(12).fill(0) as number[];
  const failBuckets = new Array(12).fill(0) as number[];
  for (const r of allRecords) {
    const age = now - r.lastActive;
    if (age > 3600000 || age < 0) continue;
    const idx = 11 - Math.floor(age / 300000);
    if (idx >= 0 && idx < 12) {
      buckets[idx]!++;
      if (r.status === 'error') failBuckets[idx]!++;
    }
  }
  const maxBucket = Math.max(...buckets, 1);
  const sparkChars = ' \u2581\u2582\u2583\u2584\u2585\u2586\u2587\u2588';
  const spark = buckets.map((v, i) => {
    const level = Math.round((v / maxBucket) * 8);
    return (failBuckets[i]! > 0 ? C.red : C.green) + sparkChars[level] + C.reset;
  }).join('');

  // Distributed traces
  const distributedTraces: DistributedTrace[] = [];
  if (allTraces.length > 1) {
    const traceGroups = groupByTraceId(allTraces);
    for (const [_tid, graphs] of traceGroups) {
      if (graphs.length > 1) {
        try { distributedTraces.push(stitchTrace(graphs)); } catch { /* skip */ }
      }
    }
    distributedTraces.sort((a, b) => b.startTime - a.startTime);
  }

  // Uptime
  const upSec = Math.floor((Date.now() - sessionStart) / 1000);
  const upMin = Math.floor(upSec / 60);
  const upStr = upMin > 0 ? `${upMin}m ${upSec % 60}s` : `${upSec}s`;
  const time = new Date().toLocaleTimeString();

  // Status helpers
  function statusIcon(s: string, recent: boolean): string {
    if (s === 'error') return `${C.red}\u25cf${C.reset}`;
    if (s === 'running') return `${C.green}\u25cf${C.reset}`;
    if (s === 'ok' && recent) return `${C.green}\u25cf${C.reset}`;
    if (s === 'ok') return `${C.dim}\u25cb${C.reset}`;
    return `${C.dim}\u25cb${C.reset}`;
  }

  function statusText(g: AgentGroup): string {
    if (g.fail > 0 && g.ok === 0 && g.running === 0) return `${C.red}error${C.reset}`;
    if (g.running > 0) return `${C.green}running${C.reset}`;
    if (g.fail > 0) return `${C.yellow}${g.ok}ok/${g.fail}err${C.reset}`;
    if (g.ok > 0) return g.total > 1 ? `${C.green}${g.ok}/${g.total} ok${C.reset}` : `${C.green}ok${C.reset}`;
    return `${C.dim}idle${C.reset}`;
  }

  function sourceTag(s: SourceType): string {
    switch (s) {
      case 'trace': return `${C.cyan}trace${C.reset}`;
      case 'jobs': return `${C.blue}job${C.reset}`;
      case 'workers': return `${C.magenta}worker${C.reset}`;
      case 'session': return `${C.yellow}session${C.reset}`;
      case 'state': return `${C.dim}state${C.reset}`;
    }
  }

  function timeStr(ts: number): string {
    if (ts <= 0) return 'n/a';
    return new Date(ts).toLocaleTimeString();
  }

  function truncate(s: string, max: number): string {
    return s.length > max ? s.slice(0, max - 1) + '\u2026' : s;
  }

  // === BUILD OUTPUT ===
  if (firstRender) {
    process.stdout.write('\x1b[2J'); // clear screen only on first render
    firstRender = false;
  }

  const L: string[] = [];

  // Header
  writeLine(L, `${C.bold}${C.cyan}\u2554${'═'.repeat(70)}\u2557${C.reset}`);
  writeLine(L, `${C.bold}${C.cyan}\u2551${C.reset}  ${C.bold}${C.white}AGENTFLOW LIVE${C.reset}                               ${C.green}\u25cf LIVE${C.reset}  ${C.dim}${time}${C.reset}  ${C.bold}${C.cyan}\u2551${C.reset}`);
  const metaLine = `Refresh: ${config.refreshMs / 1000}s \u00b7 Up: ${upStr} \u00b7 Files: ${files.length}`;
  const pad1 = Math.max(0, 64 - metaLine.length);
  writeLine(L, `${C.bold}${C.cyan}\u2551${C.reset}  ${C.dim}${metaLine}${C.reset}${' '.repeat(pad1)}${C.bold}${C.cyan}\u2551${C.reset}`);
  writeLine(L, `${C.bold}${C.cyan}\u255a${'═'.repeat(70)}\u255d${C.reset}`);

  // Summary
  const sc = totFail === 0 ? C.green : C.yellow;
  writeLine(L, '');
  writeLine(L, `  ${C.bold}Agents${C.reset} ${sc}${uniqueAgents}${C.reset}    ${C.bold}Records${C.reset} ${sc}${totExec}${C.reset}    ${C.bold}Success${C.reset} ${sc}${sysRate}%${C.reset}    ${C.bold}Running${C.reset} ${C.green}${totRunning}${C.reset}    ${C.bold}Errors${C.reset} ${totFail > 0 ? C.red : C.dim}${totFail}${C.reset}    ${C.bold}New${C.reset} ${C.yellow}+${newExecCount}${C.reset}`);

  // Sparkline
  writeLine(L, '');
  writeLine(L, `  ${C.bold}Activity (1h)${C.reset}  ${spark}  ${C.dim}\u2190 now${C.reset}`);

  // Grouped agent table
  writeLine(L, '');
  writeLine(L, `  ${C.bold}${C.under}Agent                        Status      Last Active  Detail${C.reset}`);

  let lineCount = 0;
  for (const g of groups) {
    if (lineCount > 35) break;
    const isRecent = (Date.now() - g.lastTs) < 300000;
    const icon = statusIcon(g.status, isRecent);
    const active = isRecent ? `${C.green}${timeStr(g.lastTs)}${C.reset}` : `${C.dim}${timeStr(g.lastTs)}${C.reset}`;

    if (g.children.length === 0) {
      // Single agent — flat row
      const name = truncate(g.name, 26).padEnd(26);
      const st = statusText(g);
      const det = truncate(g.detail, 30);
      writeLine(L, `  ${icon} ${name}  ${st.padEnd(20)}  ${active.padEnd(20)}  ${C.dim}${det}${C.reset}`);
      lineCount++;
    } else {
      // Group header
      const name = truncate(g.name, 24).padEnd(24);
      const st = statusText(g);
      const tag = sourceTag(g.source);
      writeLine(L, `  ${icon} ${C.bold}${name}${C.reset}  ${st.padEnd(20)}  ${active.padEnd(20)}  ${tag} ${C.dim}(${g.children.length} agents)${C.reset}`);
      lineCount++;

      // Children (indented with tree connectors)
      const kids = g.children.slice(0, 12);
      for (let i = 0; i < kids.length; i++) {
        if (lineCount > 35) break;
        const child = kids[i]!;
        const isLast = i === kids.length - 1;
        const connector = isLast ? '\u2514\u2500' : '\u251c\u2500';
        const cIcon = statusIcon(child.status, (Date.now() - child.lastActive) < 300000);
        const cName = truncate(child.id, 22).padEnd(22);
        const cActive = `${C.dim}${timeStr(child.lastActive)}${C.reset}`;
        const cDet = truncate(child.detail, 25);
        writeLine(L, `     ${C.dim}${connector}${C.reset} ${cIcon} ${cName}  ${cActive.padEnd(20)}  ${C.dim}${cDet}${C.reset}`);
        lineCount++;
      }
      if (g.children.length > 12) {
        writeLine(L, `     ${C.dim}   ... +${g.children.length - 12} more${C.reset}`);
        lineCount++;
      }
    }
  }

  // Distributed traces
  if (distributedTraces.length > 0) {
    writeLine(L, '');
    writeLine(L, `  ${C.bold}${C.under}Distributed Traces${C.reset}`);
    for (const dt of distributedTraces.slice(0, 3)) {
      const traceTime = new Date(dt.startTime).toLocaleTimeString();
      const si = dt.status === 'completed' ? `${C.green}\u2713${C.reset}` :
                 dt.status === 'failed' ? `${C.red}\u2717${C.reset}` : `${C.yellow}\u23f3${C.reset}`;
      const dur = dt.endTime ? `${dt.endTime - dt.startTime}ms` : 'running';
      const tid = dt.traceId.slice(0, 8);
      writeLine(L, `  ${si}  ${C.magenta}trace:${tid}${C.reset}  ${C.dim}${traceTime}  ${dur}  (${dt.graphs.size} agents)${C.reset}`);

      const tree = getTraceTree(dt);
      for (let i = 0; i < Math.min(tree.length, 6); i++) {
        const tg = tree[i]!;
        const depth = getDistDepth(dt, tg.spanId);
        const indent = '     ' + '\u2502  '.repeat(Math.max(0, depth - 1));
        const isLast = i === tree.length - 1 || getDistDepth(dt, tree[i + 1]?.spanId) <= depth;
        const conn = depth === 0 ? '  ' : (isLast ? '\u2514\u2500 ' : '\u251c\u2500 ');
        const gs = tg.status === 'completed' ? `${C.green}\u2713${C.reset}` :
                   tg.status === 'failed' ? `${C.red}\u2717${C.reset}` : `${C.yellow}\u23f3${C.reset}`;
        const gd = tg.endTime ? `${tg.endTime - tg.startTime}ms` : 'running';
        writeLine(L, `${indent}${conn}${gs} ${C.bold}${tg.agentId}${C.reset} ${C.dim}[${tg.trigger}] ${gd}${C.reset}`);
      }
    }
  }

  // Recent activity
  const recentRecords = allRecords
    .filter(r => r.lastActive > 0)
    .sort((a, b) => b.lastActive - a.lastActive)
    .slice(0, 6);

  if (recentRecords.length > 0) {
    writeLine(L, '');
    writeLine(L, `  ${C.bold}${C.under}Recent Activity${C.reset}`);
    for (const r of recentRecords) {
      const icon = r.status === 'ok' ? `${C.green}\u2713${C.reset}` :
                   r.status === 'error' ? `${C.red}\u2717${C.reset}` :
                   r.status === 'running' ? `${C.green}\u25b6${C.reset}` : `${C.dim}\u25cb${C.reset}`;
      const t = new Date(r.lastActive).toLocaleTimeString();
      const agent = truncate(r.id, 26).padEnd(26);
      const age = Math.floor((Date.now() - r.lastActive) / 1000);
      const ageStr = age < 60 ? age + 's ago' : age < 3600 ? Math.floor(age / 60) + 'm ago' : Math.floor(age / 3600) + 'h ago';
      const det = truncate(r.detail, 25);
      writeLine(L, `  ${icon}  ${agent} ${C.dim}${t}  ${ageStr.padStart(8)}${C.reset}  ${C.dim}${det}${C.reset}`);
    }
  }

  if (files.length === 0) {
    writeLine(L, '');
    writeLine(L, `  ${C.dim}No JSON/JSONL files found. Waiting for data in:${C.reset}`);
    for (const d of config.dirs) writeLine(L, `  ${C.dim}  ${d}${C.reset}`);
  }

  writeLine(L, '');
  const dirLabel = config.dirs.length === 1 ? config.dirs[0]! : `${config.dirs.length} directories`;
  writeLine(L, `  ${C.dim}Watching: ${dirLabel}${C.reset}`);
  writeLine(L, `  ${C.dim}Press Ctrl+C to exit${C.reset}`);

  flushLines(L);
}

function getDistDepth(dt: DistributedTrace, spanId: string | undefined): number {
  if (!spanId) return 0;
  const g = dt.graphs.get(spanId);
  if (!g || !g.parentSpanId) return 0;
  return 1 + getDistDepth(dt, g.parentSpanId);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export function startLive(argv: string[]): void {
  const config = parseArgs(argv);

  // Validate directories
  const valid = config.dirs.filter(d => existsSync(d));
  if (valid.length === 0) {
    console.error(`No valid directories found: ${config.dirs.join(', ')}`);
    console.error('Specify directories containing JSON/JSONL files: agentflow live <dir> [dir...]');
    process.exit(1);
  }
  const invalid = config.dirs.filter(d => !existsSync(d));
  if (invalid.length > 0) {
    console.warn(`Skipping non-existent: ${invalid.join(', ')}`);
  }
  config.dirs = valid;

  render(config);

  // Watch all directories for changes
  let debounce: ReturnType<typeof setTimeout> | null = null;
  for (const dir of config.dirs) {
    try {
      watch(dir, { recursive: config.recursive }, () => {
        if (debounce) clearTimeout(debounce);
        debounce = setTimeout(() => render(config), 500);
      });
    } catch { /* fs.watch may not work on all platforms */ }
  }

  setInterval(() => render(config), config.refreshMs);

  process.on('SIGINT', () => {
    console.log('\n' + C.dim + 'Monitor stopped.' + C.reset);
    process.exit(0);
  });
}
