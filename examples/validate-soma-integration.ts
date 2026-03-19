/**
 * End-to-end validation: loads real traces, runs process mining, emits events
 * to a test inbox directory via SomaEventWriter, and verifies the output files
 * have correct frontmatter and wikilinks.
 *
 * Usage:
 *   npx tsx examples/validate-soma-integration.ts
 *   npx tsx examples/validate-soma-integration.ts --traces ~/custom/traces --output ./my-inbox
 *   npx tsx examples/validate-soma-integration.ts --live   # write to real Soma inbox
 *
 * @module
 */

import { readdirSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import {
  createEventEmitter,
  createExecutionEvent,
  createPatternEvent,
  createSomaEventWriter,
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
    output: { type: 'string', default: join(process.cwd(), 'tmp/soma-validation-inbox') },
    live: { type: 'boolean', default: false },
    clean: { type: 'boolean', default: false },
    limit: { type: 'string', default: '20' },
  },
});

const tracesDir = resolve(args.traces!);
const inboxDir = args.live
  ? resolve(join(process.env.HOME ?? '~', '.openclaw/workspace/inbox'))
  : resolve(args.output!);
const limit = Number.parseInt(args.limit!, 10);

// ---------------------------------------------------------------------------
// Load traces
// ---------------------------------------------------------------------------

console.log(`\n  Loading traces from ${tracesDir}`);
console.log(`  Writing to ${inboxDir}${args.live ? ' (LIVE — real Soma inbox!)' : ' (test dir)'}\n`);

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
for (const file of selected) {
  try {
    const raw = readFileSync(join(tracesDir, file), 'utf-8');
    graphs.push(loadGraph(raw));
  } catch {
    // Skip unparseable files
  }
}

if (graphs.length === 0) {
  console.error('  No graphs loaded. Exiting.');
  process.exit(1);
}

console.log(`  Loaded ${graphs.length} graphs\n`);

// ---------------------------------------------------------------------------
// Process mining
// ---------------------------------------------------------------------------

const model = discoverProcess(graphs);
const variants = findVariants(graphs);
const bottlenecks = getBottlenecks(graphs);

console.log(`  Process model: ${model.steps.length} steps, ${model.transitions.length} transitions`);
console.log(`  Variants: ${variants.length}, Bottleneck entries: ${bottlenecks.length}\n`);

// ---------------------------------------------------------------------------
// Emit via SomaEventWriter
// ---------------------------------------------------------------------------

if (args.clean) {
  rmSync(inboxDir, { recursive: true, force: true });
}

const somaWriter = createSomaEventWriter({ inboxDir });
const emitter = createEventEmitter({
  writers: [somaWriter],
  onError: (err) => console.error('  Write error:', err),
});

let executionCount = 0;
for (const graph of graphs) {
  const event = createExecutionEvent(graph, {
    processContext: {
      variant: `variant-${variants.findIndex((v) => v.graphIds.includes(graph.id)) + 1}`,
      conformanceScore: 1.0,
      isAnomaly: false,
    },
    semantic: { intent: graph.trigger, trigger: graph.trigger },
  });
  await emitter.emit(event);
  executionCount++;
}

const patternEvent = createPatternEvent(model.agentId, model, variants, bottlenecks);
await emitter.emit(patternEvent);

console.log(`  Emitted ${executionCount} execution events + 1 pattern event\n`);

// ---------------------------------------------------------------------------
// Verify output
// ---------------------------------------------------------------------------

console.log('  --- Verification ---\n');

const outputFiles = readdirSync(inboxDir).filter((f) => f.endsWith('.md'));
console.log(`  Files in inbox: ${outputFiles.length}`);

const executionFiles = outputFiles.filter((f) => f.startsWith('execution-'));
const synthesisFiles = outputFiles.filter((f) => f.startsWith('synthesis-'));
console.log(`  Execution files: ${executionFiles.length}`);
console.log(`  Synthesis files: ${synthesisFiles.length}`);

// Verify frontmatter on first execution file
let errors = 0;

function check(label: string, condition: boolean): void {
  if (condition) {
    console.log(`  [PASS] ${label}`);
  } else {
    console.log(`  [FAIL] ${label}`);
    errors++;
  }
}

if (executionFiles.length > 0) {
  const content = readFileSync(join(inboxDir, executionFiles[0]!), 'utf-8');
  check('Execution file has YAML frontmatter', content.startsWith('---\n'));
  check('Execution file has type: execution', content.includes("type: 'execution'"));
  check('Execution file has source: agentflow', content.includes("source: 'agentflow'"));
  check('Execution file has alfred_tags', content.includes('alfred_tags:'));
  check('Execution file has agent wikilink', /\[\[agent\/[\w-]+\]\]/.test(content));
  check('Execution file has agentflow_graph_id', content.includes('agentflow_graph_id:'));
  check('Execution file has duration_ms', content.includes('duration_ms:'));
}

if (synthesisFiles.length > 0) {
  const content = readFileSync(join(inboxDir, synthesisFiles[0]!), 'utf-8');
  check('Synthesis file has YAML frontmatter', content.startsWith('---\n'));
  check('Synthesis file has type: synthesis', content.includes("type: 'synthesis'"));
  check('Synthesis file has subtype: pattern-discovery', content.includes("subtype: 'pattern-discovery'"));
  check('Synthesis file has variant_count', content.includes('variant_count:'));
  check('Synthesis file has Top Variants table', content.includes('Top Variants'));
  check('Synthesis file has Top Bottlenecks table', content.includes('Top Bottlenecks'));
  check('Synthesis file has agent wikilink', /\[\[agent\/[\w-]+\]\]/.test(content));
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n  --- Summary ---\n`);
console.log(`  Traces processed:  ${graphs.length}`);
console.log(`  Events emitted:    ${executionCount + 1}`);
console.log(`  Files written:     ${outputFiles.length}`);
console.log(`  Checks passed:     ${errors === 0 ? 'ALL' : `${14 - errors}/14`}`);
console.log(`  Output dir:        ${inboxDir}`);

if (errors > 0) {
  console.log(`\n  ${errors} check(s) failed!`);
  process.exit(1);
}

console.log(`\n  All checks passed. Curator-compatible output confirmed.`);
console.log('');
