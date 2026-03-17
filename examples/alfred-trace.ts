/**
 * Create a trace from live Alfred worker state and test all new features.
 */

import { readFileSync } from 'node:fs';
import { createGraphBuilder } from '../packages/core/src/graph-builder.js';
import { checkGuards, withGuards } from '../packages/core/src/guards.js';
import { createTraceStore } from '../packages/core/src/trace-store.js';
import { toAsciiTree, toTimeline } from '../packages/core/src/visualize.js';

const workers = JSON.parse(readFileSync('/home/trader/.alfred/data/workers.json', 'utf-8'));

// Build a traced graph from Alfred infrastructure
const raw = createGraphBuilder({ agentId: 'alfred-supervisor', trigger: 'cron' });
const builder = withGuards(raw, {
  maxDepth: 10,
  maxAgentSpawns: 50,
  onViolation: 'warn',
  logger: () => {},
});

const root = builder.startNode({
  type: 'agent',
  name: 'alfred-supervisor',
  metadata: { pid: workers.pid, started_at: workers.started_at },
});

for (const [name, info] of Object.entries(workers.tools)) {
  const w = info as { pid: number | null; status: string; restarts: number; exit_code?: number };
  const child = builder.startNode({
    type: 'subagent',
    name,
    parentId: root,
    metadata: { pid: w.pid, restarts: w.restarts },
  });
  if (w.status === 'running') {
    builder.endNode(child);
  } else {
    builder.failNode(child, `Worker stopped (exit_code: ${w.exit_code}, restarts: ${w.restarts})`);
  }
}

builder.endNode(root);
const graph = builder.build();

// Check guards
const violations = checkGuards(graph);
console.log(`Guard violations: ${violations.length}`);

// Visualize
console.log('\n=== ASCII Tree ===');
console.log(toAsciiTree(graph));

console.log('\n=== Timeline ===');
// Patch times so timeline renders (nodes created in ms)
const now = Date.now();
const duration = 5000;
const nodes = [...graph.nodes.entries()];
const patchedNodes = new Map(
  nodes.map(([id, node], i) => [
    id,
    {
      ...node,
      startTime: now - duration + (i * duration) / nodes.length,
      endTime: now - duration + ((i + 1) * duration) / nodes.length,
    },
  ]),
);
const patchedGraph = { ...graph, startTime: now - duration, endTime: now, nodes: patchedNodes };
console.log(toTimeline(patchedGraph as typeof graph));

// Save to store
const store = createTraceStore('./traces');
const filePath = await store.save(graph);
console.log(`\nSaved to: ${filePath}`);
console.log(`Graph ID: ${graph.id}`);

// Query the store
const stuck = await store.getStuckSpans();
console.log(`Stuck spans: ${stuck.length}`);

const all = await store.list();
console.log(`Total traces: ${all.length}`);

const failed = await store.list({ status: 'failed' });
console.log(`Failed traces: ${failed.length}`);
