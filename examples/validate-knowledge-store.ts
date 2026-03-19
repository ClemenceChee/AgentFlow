/**
 * End-to-end validation of the built-in knowledge store.
 *
 * Loads real traces → emits events to knowledge store → queries profiles →
 * creates PolicySource → runs guards with policy → shows adaptive behavior.
 *
 * Usage:
 *   npx tsx examples/validate-knowledge-store.ts
 *   npx tsx examples/validate-knowledge-store.ts --traces ~/custom/traces --limit 50
 *
 * @module
 */

import { rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { readdirSync, readFileSync } from 'node:fs';

import {
  checkGuards,
  createEventEmitter,
  createExecutionEvent,
  createKnowledgeStore,
  createPatternEvent,
  createPolicySource,
  discoverProcess,
  findVariants,
  getBottlenecks,
  loadGraph,
} from 'agentflow-core';
import type { ExecutionGraph } from 'agentflow-core';

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const { values: args } = parseArgs({
  options: {
    traces: { type: 'string', default: join(process.env.HOME ?? '~', '.openclaw/workspace/traces') },
    output: { type: 'string', default: join(process.cwd(), 'tmp/knowledge-validation') },
    clean: { type: 'boolean', default: false },
    limit: { type: 'string', default: '50' },
  },
});

const tracesDir = resolve(args.traces!);
const storeDir = resolve(args.output!);
const limit = Number.parseInt(args.limit!, 10);

if (args.clean) {
  rmSync(storeDir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// Load traces
// ---------------------------------------------------------------------------

console.log(`\n  === AgentFlow Knowledge Store Validation ===\n`);
console.log(`  Traces:  ${tracesDir}`);
console.log(`  Store:   ${storeDir}\n`);

const files = readdirSync(tracesDir)
  .filter((f) => f.endsWith('.json'))
  .sort();

const selected = limit > 0 ? files.slice(0, limit) : files;
console.log(`  Found ${files.length} traces, processing ${selected.length}\n`);

const graphs: ExecutionGraph[] = [];
for (const file of selected) {
  try {
    graphs.push(loadGraph(readFileSync(join(tracesDir, file), 'utf-8')));
  } catch {
    // skip
  }
}

if (graphs.length === 0) {
  console.error('  No graphs loaded. Exiting.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Step 1: Emit events to knowledge store
// ---------------------------------------------------------------------------

console.log(`  --- Step 1: Emit events to knowledge store ---\n`);

const store = createKnowledgeStore({ baseDir: storeDir });
const emitter = createEventEmitter({
  knowledgeStore: store,
  onError: (err) => console.error('  Error:', err),
});

for (const graph of graphs) {
  await emitter.emit(createExecutionEvent(graph, {
    processContext: {
      variant: 'auto',
      conformanceScore: 1.0,
      isAnomaly: false,
    },
    semantic: { intent: graph.trigger, trigger: graph.trigger },
  }));
}

// Process mining + pattern event
const model = discoverProcess(graphs);
const variants = findVariants(graphs);
const bottlenecks = getBottlenecks(graphs);
await emitter.emit(createPatternEvent(model.agentId, model, variants, bottlenecks));

console.log(`  Emitted ${graphs.length} execution events + 1 pattern event\n`);

// ---------------------------------------------------------------------------
// Step 2: Query the knowledge store
// ---------------------------------------------------------------------------

console.log(`  --- Step 2: Query knowledge store ---\n`);

const agentIds = new Set(graphs.map((g) => g.agentId));
for (const agentId of agentIds) {
  const profile = store.getAgentProfile(agentId);
  if (!profile) {
    console.log(`  ${agentId}: no profile`);
    continue;
  }
  console.log(`  ${agentId}:`);
  console.log(`    Runs: ${profile.totalRuns} (${profile.successCount} ok, ${profile.failureCount} failed)`);
  console.log(`    Failure rate: ${(profile.failureRate * 100).toFixed(1)}%`);
  console.log(`    Recent durations: ${profile.recentDurations.length} samples`);
  if (profile.lastConformanceScore !== null) {
    console.log(`    Conformance: ${(profile.lastConformanceScore * 100).toFixed(0)}%`);
  }
  if (profile.knownBottlenecks.length > 0) {
    console.log(`    Bottlenecks: ${profile.knownBottlenecks.join(', ')}`);
  }
  console.log('');
}

const events = store.getRecentEvents(model.agentId, { limit: 5 });
console.log(`  Recent events for ${model.agentId}: ${events.length}`);

const patternHistory = store.getPatternHistory(model.agentId);
console.log(`  Pattern history for ${model.agentId}: ${patternHistory.length}\n`);

// ---------------------------------------------------------------------------
// Step 3: PolicySource → Adaptive Guards
// ---------------------------------------------------------------------------

console.log(`  --- Step 3: Adaptive guards with PolicySource ---\n`);

const policy = createPolicySource(store);

for (const agentId of agentIds) {
  console.log(`  ${agentId}:`);
  console.log(`    Failure rate: ${(policy.recentFailureRate(agentId) * 100).toFixed(1)}%`);
  const score = policy.lastConformanceScore(agentId);
  console.log(`    Conformance: ${score !== null ? `${(score * 100).toFixed(0)}%` : 'n/a'}`);
}

// Run guards on one of the graphs with the policy source
const testGraph = graphs[0]!;
const violations = checkGuards(testGraph, {
  policySource: policy,
  policyThresholds: { maxFailureRate: 0.5, minConformance: 0.7 },
});

console.log(`\n  Guard check on ${testGraph.agentId}:`);
if (violations.length === 0) {
  console.log(`    No violations — agent is healthy`);
} else {
  for (const v of violations) {
    console.log(`    [${v.type}] ${v.message}`);
  }
}

// Check bottleneck awareness
const profile = store.getAgentProfile(model.agentId);
if (profile && profile.knownBottlenecks.length > 0) {
  const bn = profile.knownBottlenecks[0]!;
  console.log(`\n  Bottleneck check: "${bn}" → ${policy.isKnownBottleneck(bn) ? 'KNOWN' : 'unknown'}`);
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n  --- Summary ---\n`);
console.log(`  Traces processed:    ${graphs.length}`);
console.log(`  Agents profiled:     ${agentIds.size}`);
console.log(`  Events in store:     ${graphs.length + 1}`);
console.log(`  Guard violations:    ${violations.length}`);
console.log(`  Store dir:           ${storeDir}`);
console.log(`\n  Full feedback loop validated: observe → mine → emit → accumulate → adapt`);
console.log('');
