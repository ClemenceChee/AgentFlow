/**
 * Validation script: loads real traces from ~/.openclaw/workspace/traces/,
 * runs process mining + event emission APIs, and writes events to a test dir.
 *
 * Usage:
 *   npx tsx examples/validate-traces.ts
 *   npx tsx examples/validate-traces.ts --traces ~/custom/traces --output ./my-events
 *
 * @module
 */

import { readdirSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import {
  createExecutionEvent,
  createJsonEventWriter,
  createPatternEvent,
  discoverProcess,
  findVariants,
  getBottlenecks,
  getPathSignature,
  getStats,
  loadGraph,
} from 'agentflow-core';
import type { ExecutionGraph } from 'agentflow-core';

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const { values: args } = parseArgs({
  options: {
    traces: { type: 'string', default: join(process.env.HOME ?? '~', '.openclaw/workspace/traces') },
    output: { type: 'string', default: join(process.cwd(), 'tmp/validation-events') },
    clean: { type: 'boolean', default: false },
    limit: { type: 'string', default: '0' },
  },
});

const tracesDir = resolve(args.traces!);
const outputDir = resolve(args.output!);
const limit = Number.parseInt(args.limit!, 10);

// ---------------------------------------------------------------------------
// Load traces
// ---------------------------------------------------------------------------

console.log(`\n  Loading traces from ${tracesDir}\n`);

const files = readdirSync(tracesDir)
  .filter((f) => f.endsWith('.json'))
  .sort();

if (files.length === 0) {
  console.error('  No JSON trace files found. Exiting.');
  process.exit(1);
}

const selected = limit > 0 ? files.slice(0, limit) : files;
console.log(`  Found ${files.length} trace files, processing ${selected.length}\n`);

const graphs: ExecutionGraph[] = [];
const loadErrors: { file: string; error: string }[] = [];

for (const file of selected) {
  try {
    const raw = readFileSync(join(tracesDir, file), 'utf-8');
    const graph = loadGraph(raw);
    graphs.push(graph);
  } catch (err) {
    loadErrors.push({ file, error: (err as Error).message });
  }
}

console.log(`  Loaded: ${graphs.length}  |  Errors: ${loadErrors.length}`);
if (loadErrors.length > 0) {
  console.log('  Load errors:');
  for (const { file, error } of loadErrors.slice(0, 5)) {
    console.log(`    ${file}: ${error}`);
  }
  if (loadErrors.length > 5) console.log(`    ... and ${loadErrors.length - 5} more`);
}

if (graphs.length === 0) {
  console.error('\n  No graphs loaded successfully. Exiting.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Process mining
// ---------------------------------------------------------------------------

console.log('\n  --- Process Mining ---\n');

const model = discoverProcess(graphs);
console.log(`  Process model: ${model.steps.length} steps, ${model.transitions.length} transitions`);
for (const t of model.transitions.slice(0, 10)) {
  console.log(`    ${t.from} → ${t.to}  (${(t.probability * 100).toFixed(0)}%, n=${t.count})`);
}
if (model.transitions.length > 10) {
  console.log(`    ... ${model.transitions.length - 10} more transitions`);
}

const variants = findVariants(graphs);
console.log(`\n  Variants: ${variants.length}`);
for (const v of variants.slice(0, 5)) {
  const sig = v.pathSignature.length > 80 ? `${v.pathSignature.slice(0, 77)}...` : v.pathSignature;
  console.log(`    ${v.percentage.toFixed(1)}% (n=${v.count})  ${sig}`);
}

const bottlenecks = getBottlenecks(graphs);
console.log(`\n  Bottlenecks (top 5 by p95):`);
for (const b of bottlenecks.slice(0, 5)) {
  console.log(
    `    ${b.nodeType}:${b.nodeName}  median=${b.durations.median.toFixed(0)}ms  p95=${b.durations.p95.toFixed(0)}ms  p99=${b.durations.p99.toFixed(0)}ms`,
  );
}

// ---------------------------------------------------------------------------
// Event emission
// ---------------------------------------------------------------------------

console.log('\n  --- Event Emission ---\n');

if (args.clean) {
  rmSync(outputDir, { recursive: true, force: true });
}

const writer = createJsonEventWriter({ outputDir });

let executionEventsWritten = 0;
for (const graph of graphs) {
  const sig = getPathSignature(graph);
  const stats = getStats(graph);

  const event = createExecutionEvent(graph, {
    processContext: {
      variant: sig,
      conformanceScore: 1.0, // no reference model yet for per-graph conformance
      isAnomaly: false,
    },
    semantic: {
      intent: graph.trigger,
      trigger: graph.trigger,
    },
  });

  await writer.writeEvent(event);
  executionEventsWritten++;
}

console.log(`  Wrote ${executionEventsWritten} execution events`);

// Pattern event
const patternEvent = createPatternEvent(model.agentId, model, variants, bottlenecks);
await writer.writeEvent(patternEvent);
console.log(`  Wrote 1 pattern event`);

console.log(`\n  All events written to ${outputDir}`);

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log('\n  --- Summary ---\n');
console.log(`  Traces loaded:       ${graphs.length}`);
console.log(`  Load errors:         ${loadErrors.length}`);
console.log(`  Process steps:       ${model.steps.length}`);
console.log(`  Transitions:         ${model.transitions.length}`);
console.log(`  Variants:            ${variants.length}`);
console.log(`  Bottleneck entries:  ${bottlenecks.length}`);
console.log(`  Events written:      ${executionEventsWritten + 1}`);
console.log(`  Output dir:          ${outputDir}`);
console.log('');
