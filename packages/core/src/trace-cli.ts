/**
 * CLI handlers for trace subcommands.
 *
 * Each function parses its own flags, uses createTraceStore() for data,
 * and toAsciiTree()/toTimeline() for display.
 *
 * @module
 */

import { resolve } from 'path';

import { createTraceStore } from './trace-store.js';
import type { GraphStatus } from './types.js';
import { toAsciiTree, toTimeline } from './visualize.js';

/**
 * Parse --traces-dir from argv, defaulting to ./traces.
 */
function getTracesDir(argv: string[]): string {
  const idx = argv.indexOf('--traces-dir');
  if (idx !== -1 && argv[idx + 1]) {
    return resolve(argv[idx + 1]!);
  }
  return resolve('./traces');
}

/**
 * Parse a named string flag from argv.
 */
function getFlag(argv: string[], name: string): string | undefined {
  const idx = argv.indexOf(name);
  if (idx !== -1 && argv[idx + 1]) {
    return argv[idx + 1];
  }
  return undefined;
}

/**
 * Print help for trace subcommands.
 */
function printTraceHelp(): void {
  console.log(
    `
AgentFlow Trace — inspect saved execution traces.

Usage:
  agentflow trace <command> [options]

Commands:
  list [--status <status>] [--limit <n>]    List saved traces
  show <graph-id>                           Show trace as ASCII tree
  timeline <graph-id>                       Show trace as timeline waterfall
  stuck                                     Show all stuck/hung/timeout spans
  loops [--threshold <n>]                   Detect reasoning loops

Options:
  --traces-dir <path>   Directory containing trace files (default: ./traces)

Examples:
  agentflow trace list --status failed --limit 10
  agentflow trace show abc-123
  agentflow trace timeline abc-123
  agentflow trace stuck
  agentflow trace loops --threshold 10
`.trim(),
  );
}

/**
 * agentflow trace list [--status <status>] [--limit <n>]
 */
async function traceList(argv: string[]): Promise<void> {
  const dir = getTracesDir(argv);
  const store = createTraceStore(dir);
  const status = getFlag(argv, '--status') as GraphStatus | undefined;
  const limitStr = getFlag(argv, '--limit');
  const limit = limitStr ? Number.parseInt(limitStr, 10) : undefined;

  const graphs = await store.list({ status, limit });

  if (graphs.length === 0) {
    console.log('No traces found.');
    return;
  }

  console.log(`Found ${graphs.length} trace(s) in ${dir}:\n`);
  for (const g of graphs) {
    const duration = g.endTime ? `${((g.endTime - g.startTime) / 1000).toFixed(1)}s` : 'running';
    const date = new Date(g.startTime)
      .toISOString()
      .replace('T', ' ')
      .replace(/\.\d+Z$/, '');
    const icon = g.status === 'completed' ? '\u2713' : g.status === 'failed' ? '\u2717' : '\u231B';
    console.log(
      `  ${icon} ${g.id}  ${g.status.padEnd(10)} ${duration.padEnd(8)} ${date}  ${g.agentId}`,
    );
  }
}

/**
 * agentflow trace show <graph-id>
 */
async function traceShow(argv: string[]): Promise<void> {
  const dir = getTracesDir(argv);
  const store = createTraceStore(dir);

  // Find the graph ID (first positional arg after 'show')
  const showIdx = argv.indexOf('show');
  const graphId = showIdx !== -1 ? argv[showIdx + 1] : undefined;

  if (!graphId || graphId.startsWith('--')) {
    console.error('Usage: agentflow trace show <graph-id>');
    process.exit(1);
  }

  let graph = await store.get(graphId);
  // Also try as a filename (with or without .json)
  if (!graph) {
    const { readFile } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const fname = graphId.endsWith('.json') ? graphId : `${graphId}.json`;
    try {
      const { loadGraph } = await import('./loader.js');
      const content = await readFile(join(dir, fname), 'utf-8');
      graph = loadGraph(content);
    } catch {
      // not found
    }
  }
  if (!graph) {
    console.error(`Trace "${graphId}" not found in ${dir}`);
    process.exit(1);
  }

  console.log(`Trace: ${graph.id} (${graph.status})\n`);
  console.log(toAsciiTree(graph));
}

/**
 * agentflow trace timeline <graph-id>
 */
async function traceTimeline(argv: string[]): Promise<void> {
  const dir = getTracesDir(argv);
  const store = createTraceStore(dir);

  const timelineIdx = argv.indexOf('timeline');
  const graphId = timelineIdx !== -1 ? argv[timelineIdx + 1] : undefined;

  if (!graphId || graphId.startsWith('--')) {
    console.error('Usage: agentflow trace timeline <graph-id>');
    process.exit(1);
  }

  let graph = await store.get(graphId);
  if (!graph) {
    const { readFile } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const fname = graphId.endsWith('.json') ? graphId : `${graphId}.json`;
    try {
      const { loadGraph } = await import('./loader.js');
      const content = await readFile(join(dir, fname), 'utf-8');
      graph = loadGraph(content);
    } catch {
      // not found
    }
  }
  if (!graph) {
    console.error(`Trace "${graphId}" not found in ${dir}`);
    process.exit(1);
  }

  console.log(`Trace: ${graph.id} (${graph.status})\n`);
  console.log(toTimeline(graph));
}

/**
 * agentflow trace stuck
 */
async function traceStuck(argv: string[]): Promise<void> {
  const dir = getTracesDir(argv);
  const store = createTraceStore(dir);

  const stuck = await store.getStuckSpans();

  if (stuck.length === 0) {
    console.log('No stuck spans found.');
    return;
  }

  console.log(`Found ${stuck.length} stuck span(s):\n`);
  for (const node of stuck) {
    const elapsed = Date.now() - node.startTime;
    const icon =
      node.status === 'timeout' ? '\u231B' : node.status === 'hung' ? '\u231B' : '\u231B';
    console.log(
      `  ${icon} ${node.id}  ${node.type.padEnd(10)} ${node.name.padEnd(20)} ${node.status.padEnd(8)} ${(elapsed / 1000).toFixed(0)}s`,
    );
  }
}

/**
 * agentflow trace loops [--threshold <n>]
 */
async function traceLoops(argv: string[]): Promise<void> {
  const dir = getTracesDir(argv);
  const store = createTraceStore(dir);
  const thresholdStr = getFlag(argv, '--threshold');
  const threshold = thresholdStr ? Number.parseInt(thresholdStr, 10) : undefined;

  const loops = await store.getReasoningLoops(threshold);

  if (loops.length === 0) {
    console.log('No reasoning loops detected.');
    return;
  }

  console.log(`Found reasoning loops in ${loops.length} trace(s):\n`);
  for (const { graphId, nodes } of loops) {
    console.log(`  Graph: ${graphId}`);
    for (const node of nodes) {
      console.log(`    - ${node.id} (${node.type}: ${node.name})`);
    }
    console.log('');
  }
}

/**
 * Main router for `agentflow trace` subcommands.
 */
export async function handleTrace(argv: string[]): Promise<void> {
  if (argv.includes('--help') || argv.includes('-h')) {
    printTraceHelp();
    return;
  }

  // Find the sub-subcommand (after 'trace')
  const traceIdx = argv.indexOf('trace');
  const subcommand = traceIdx !== -1 ? argv[traceIdx + 1] : undefined;

  switch (subcommand) {
    case 'list':
      await traceList(argv);
      break;
    case 'show':
      await traceShow(argv);
      break;
    case 'timeline':
      await traceTimeline(argv);
      break;
    case 'stuck':
      await traceStuck(argv);
      break;
    case 'loops':
      await traceLoops(argv);
      break;
    default:
      printTraceHelp();
      break;
  }
}
