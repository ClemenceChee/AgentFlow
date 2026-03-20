# agentflow-core

**v0.8.0** — Monitor any AI agent system. Auto-detects failures, sends alerts, audits OS processes. Zero config, zero dependencies.

Works with any agent framework: OpenAI, Anthropic, LangChain, CrewAI, AutoGen, or hand-rolled agents.

## Installation

```bash
npm install agentflow-core
```

Requires Node.js >= 20.

## Quick start

### Step 1 — Build an execution graph

Wrap your agent's work with `createGraphBuilder`. Each logical unit of work is a node; the graph captures the full execution tree.

```ts
import { createGraphBuilder, getStats } from 'agentflow-core';

const builder = createGraphBuilder({ agentId: 'my-agent' });

const rootId = builder.startNode({ type: 'agent', name: 'main' });
  const toolId = builder.startNode({ type: 'tool', name: 'fetch', parentId: rootId });
  builder.endNode(toolId);
builder.endNode(rootId);

const graph = builder.build();
console.log(getStats(graph));
// { totalNodes: 2, failedNodes: 0, duration: 42, status: 'completed' }
```

### Step 2 — Mine patterns across runs

Accumulate graphs over time and use process mining to find variants, bottlenecks, and conformance drift.

```ts
import { discoverProcess, findVariants, getBottlenecks, checkConformance } from 'agentflow-core';

const model = discoverProcess(graphs);          // build a process model from observed runs
const variants = findVariants(graphs);          // group runs by their execution path
const bottlenecks = getBottlenecks(graphs);     // rank nodes by cumulative wait time
const report = checkConformance(graph, model);  // score a new run against the baseline
```

### Step 3 — Add guards

Guards detect runaway loops, spawn explosions, and policy violations at runtime. Wrap your builder with `withGuards` to activate them.

```ts
import { createGraphBuilder, withGuards, createSomaPolicySource } from 'agentflow-core';

const raw = createGraphBuilder({ agentId: 'my-agent' });
const guarded = withGuards(raw, {
  maxDepth: 8,
  maxReasoningSteps: 20,
  onViolation: 'warn',        // 'warn' | 'error' | 'abort'
  policySource: myPolicySource, // optional: adaptive thresholds from Soma
});
```

## API highlights

| Export | Kind | Description |
|---|---|---|
| `createGraphBuilder` | factory | Build and mutate an execution graph during a run |
| `withGuards` | wrapper | Add runtime guard checks to any GraphBuilder |
| `checkGuards` | fn | Pure guard check on a graph snapshot |
| `getStats` | fn | Summary stats: node counts, status, duration |
| `getCriticalPath` | fn | Longest path through the graph by duration |
| `getFailures` | fn | All failed nodes with error metadata |
| `getHungNodes` | fn | Nodes that are running beyond their timeout |
| `discoverProcess` | fn | Build a process model from a run corpus |
| `findVariants` | fn | Group runs by execution path signature |
| `getBottlenecks` | fn | Rank nodes by cumulative elapsed time |
| `checkConformance` | fn | Score a run against a reference process model |
| `createInsightEngine` | factory | Tier-2 LLM analysis: anomaly, failure, and fix prompts |
| `createTraceStore` | factory | Persist and load graphs from disk |
| `createEventEmitter` | factory | Emit structured events during execution |
| `createJsonEventWriter` | factory | Write events to newline-delimited JSON |
| `createSomaEventWriter` | factory | Write events to a Soma inbox for ingestion |
| `createKnowledgeStore` | factory | Lightweight in-process key/value knowledge store |
| `createPolicySource` | factory | Static policy source for guard thresholds |
| `stitchTrace` | fn | Reconstruct a distributed trace from span events |
| `startLive` | fn | Live terminal monitor for a running agent |
| `startWatch` | fn | Headless watcher with alerting via notify channels |
| `auditProcesses` | fn | Audit OS processes, PIDs, and systemd units |
| `runTraced` | fn | Run a shell command with full execution tracing |
| `toAsciiTree` | fn | Render a graph as an ASCII tree |
| `toTimeline` | fn | Render a graph as a text timeline |

Full type definitions are bundled. All functions are pure unless noted as factory.

## Docs

[https://github.com/ClemenceChee/AgentFlow#readme](https://github.com/ClemenceChee/AgentFlow#readme)
