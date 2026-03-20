---
sidebar_position: 3
title: Process Mining
---

# Process Mining

Process mining analyses a collection of execution graphs to discover how your agent actually behaves across many runs — not just in a single trace. AgentFlow ships three pure functions for this: `discoverProcess`, `findVariants`, and `getBottlenecks`. Conformance checking is handled by `checkConformance`.

All functions are zero-dependency and require no LLM.

## Build a set of graphs

First, create multiple execution graphs representing different runs. In production these come from your running agent; here we build them manually to illustrate the concepts.

```typescript
import {
  createGraphBuilder,
  discoverProcess,
  findVariants,
  getBottlenecks,
  checkConformance,
} from 'agentflow-core';

function buildHappyPath(): ExecutionGraph {
  const b = createGraphBuilder({ agentId: 'research-agent', trigger: 'cron' });
  const root  = b.startNode({ type: 'agent', name: 'main' });
  const fetch = b.startNode({ type: 'tool',  name: 'fetch-data',  parentId: root });
  b.endNode(fetch);
  const llm   = b.startNode({ type: 'agent', name: 'summarise',   parentId: root });
  b.endNode(llm);
  b.endNode(root);
  return b.build();
}

function buildFailurePath(): ExecutionGraph {
  const b = createGraphBuilder({ agentId: 'research-agent', trigger: 'cron' });
  const root  = b.startNode({ type: 'agent', name: 'main' });
  const fetch = b.startNode({ type: 'tool',  name: 'fetch-data',  parentId: root });
  b.failNode(fetch, new Error('HTTP 503'));
  const retry = b.startNode({ type: 'tool',  name: 'fetch-data',  parentId: root });
  b.endNode(retry);
  const llm   = b.startNode({ type: 'agent', name: 'summarise',   parentId: root });
  b.endNode(llm);
  b.endNode(root);
  return b.build();
}

// Simulate 10 runs: 8 happy paths and 2 failures
const graphs = [
  ...Array.from({ length: 8 }, buildHappyPath),
  ...Array.from({ length: 2 }, buildFailurePath),
];
```

## Discover a process model

`discoverProcess` builds a **directly-follows graph** (DFG) — every parent→child transition observed across all runs, annotated with frequency and probability.

```typescript
const model = discoverProcess(graphs);

console.log('Steps:', model.steps);
// ['agent:main', 'agent:summarise', 'tool:fetch-data']

for (const t of model.transitions) {
  console.log(
    `${t.from} → ${t.to}  count=${t.count}  probability=${(t.probability * 100).toFixed(0)}%`
  );
}
// agent:main → tool:fetch-data  count=10  probability=100%
// agent:main → agent:summarise  count=10  probability=50%
// tool:fetch-data → agent:summarise  count=0  ...
```

The `ProcessModel` shape:

```typescript
interface ProcessModel {
  steps: string[];           // all observed 'type:name' identifiers
  transitions: ProcessTransition[];
  totalGraphs: number;
  agentId: string;
}

interface ProcessTransition {
  from: string;              // 'type:name'
  to: string;
  count: number;             // absolute frequency
  probability: number;       // relative frequency from source (0.0–1.0)
}
```

## Variant analysis

`findVariants` groups graphs by their structural path signature and returns clusters sorted by frequency. Use this to identify your happy path vs failure paths.

```typescript
const variants = findVariants(graphs);

for (const v of variants) {
  console.log(
    `${v.percentage.toFixed(0)}% (${v.count} runs): ${v.pathSignature}`
  );
}
// 80% (8 runs): agent:main→agent:summarise→tool:fetch-data
// 20% (2 runs): agent:main→agent:summarise→tool:fetch-data→tool:fetch-data
```

The path signature is produced by a depth-first traversal of the node tree, emitting `type:name` for each node. Children at the same level are sorted alphabetically so the signature is deterministic regardless of execution order.

```typescript
interface Variant {
  pathSignature: string;     // canonical path string
  count: number;
  percentage: number;        // 0–100
  graphIds: string[];        // IDs of graphs in this cluster
  exampleGraph: ExecutionGraph;
}
```

The first variant in the array is your happy path (most frequent). Tail variants reveal error handling branches, retry loops, and edge cases.

## Bottleneck detection

`getBottlenecks` aggregates node durations across all graphs and computes percentile statistics. Results are sorted by p95 duration descending.

```typescript
const bottlenecks = getBottlenecks(graphs);

for (const b of bottlenecks) {
  console.log(
    `${b.nodeType}:${b.nodeName}  p50=${b.durations.median}ms  p95=${b.durations.p95}ms  p99=${b.durations.p99}ms`
  );
}
// tool:fetch-data  p50=120ms  p95=890ms  p99=2100ms
// agent:summarise  p50=340ms  p95=520ms  p99=610ms
```

The `Bottleneck` shape:

```typescript
interface Bottleneck {
  nodeName: string;
  nodeType: NodeType;
  occurrences: number;        // how many graphs contain this node
  durations: {
    median: number;
    p95: number;
    p99: number;
    min: number;
    max: number;
  };
  percentOfGraphs: number;    // 0–100
}
```

A high p95 relative to the median indicates occasional severe slowdowns — a classic sign of an intermittent external dependency.

## Conformance checking

Once you have a process model you can check whether a new run conforms to it. This is how AgentFlow detects **conformance drift** — executions that deviate significantly from the established pattern.

```typescript
const newRun = buildHappyPath(); // or any new graph
const report = checkConformance(newRun, model);

console.log('Score:', report.conformanceScore); // 0.0–1.0
console.log('Conforming:', report.isConforming);

for (const deviation of report.deviations) {
  console.log(`[${deviation.type}] ${deviation.message}`);
}
```

Deviations fall into three categories:

| Type | Meaning |
|---|---|
| `unexpected-transition` | The graph contains a parent→child step not seen in the model |
| `missing-transition` | A transition with model probability > 50% is absent from the graph |
| `low-frequency-path` | A transition is present but has model probability < 10% |

A `conformanceScore` of `1.0` means no deviations. Scores below `0.7` are a strong signal that the run is anomalous.

---

Next: [Adding guards](./adding-guards.md) — detect problems in real time as graphs are being built.
