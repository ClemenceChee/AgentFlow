# AgentFlow

**Universal execution tracing and live monitoring for AI agent systems.**

AgentFlow gives you real-time visibility into any AI agent infrastructure. Point it at a directory — it auto-detects traces, state files, job schedulers, and session logs. No configuration, no adapters, no code changes.

## Installation

```bash
npm install -g agentflow-core
```

Works with Node.js 20+. Gives you the `agentflow` CLI with two commands: `run` and `live`.

**Optional packages:**

```bash
npm install agentflow-dashboard   # Web dashboard with WebSocket updates
npm install agentflow-storage     # SQLite persistence & analytics
pip install agentflow-python      # Python agent integration
```

## Live Monitor — see everything, instantly

```bash
agentflow live ./data
```

That's it. AgentFlow scans the directory for JSON and JSONL files, auto-detects what each file is, and renders a real-time terminal dashboard.

**Watch multiple directories at once:**

```bash
agentflow live ./traces ./cron ./workers
```

**What it auto-detects:**

| File pattern | Detection | Display |
|---|---|---|
| JSON with `nodes` + `agentId` | AgentFlow trace | Full graph analysis with stats |
| JSON with `jobs`/`tasks`/`items` array | Job scheduler | Per-job status, last run, errors |
| JSON with `tools`/`workers`/`services` | Worker registry | Per-worker pid, status, restarts |
| JSON with `status`/`state` fields | Generic state | Status + last modified |
| JSONL files | Session logs | Last entry status + entry count |

Status values are normalized automatically: `ok`/`success`/`completed`/`healthy` → green, `error`/`failed`/`crashed` → red, `running`/`active` → blue. Timestamps are detected from `ts`, `timestamp`, `lastRunAtMs`, `started_at`, etc.

**Dashboard features:**
- Per-agent success/failure table
- Sparkline activity graph (1 hour)
- Distributed trace tree view
- Recent activity feed
- Auto-refresh on file changes + configurable polling

### `agentflow live` reference

```
agentflow live [dir...] [options]

Arguments:
  dir                     One or more directories to watch (default: .)

Options:
  -r, --refresh <secs>    Refresh interval in seconds (default: 3)
  -R, --recursive         Scan subdirectories (1 level deep)
  -h, --help              Show this help message
```

## Zero-code Tracing

Wrap any command with `agentflow run` to capture execution traces automatically:

```bash
agentflow run -- python my_agent.py

# Watch state files to detect sub-worker activity
agentflow run --watch-dir ./data -- python -m myagent process

# Full example
agentflow run \
  --traces-dir ./traces \
  --watch-dir ./worker-state \
  --agent-id my-orchestrator \
  --trigger cron \
  -- python -m my_agent process
```

**What happens:**
1. Creates an orchestrator trace with a unique `traceId`
2. Sets `AGENTFLOW_TRACE_ID` and `AGENTFLOW_PARENT_SPAN_ID` env vars
3. Runs your command (stdout/stderr pass through)
4. Detects changed files in watched directories → creates child traces
5. Saves all traces as JSON

**Output:**
```
🔍 AgentFlow: Tracing command: python -m myagent process
📁 Traces: ./traces
👁️  Watching: ./data (*.json)

... your command output ...

✅ Command completed (exit code 0, 2.3s)
📝 Traces saved:
   orchestrator   → traces/orchestrator-2026-03-16T14-00-00.json
   ├─ curator     → traces/curator-2026-03-16T14-00-00.json (state changed)
   └─ janitor     → traces/janitor-2026-03-16T14-00-00.json (state changed)
🔗 Trace ID: abc12345
```

### Cron integration

```bash
# Before:
*/30 * * * * python -m myagent process

# After:
*/30 * * * * npx agentflow run --watch-dir ./data --traces-dir ./traces -- python -m myagent process
```

### `agentflow run` reference

```
agentflow run [options] -- <command>

Options:
  --traces-dir <path>     Where to save trace files (default: ./traces)
  --watch-dir <path>      Directory to monitor for state changes (repeatable)
  --watch-pattern <glob>  File pattern to watch (default: *.json)
  --agent-id <name>       Agent name (default: derived from command)
  --trigger <name>        Trigger label (default: cli)
```

## Serialization

AgentFlow traces are plain JSON files. The library handles all serialization formats automatically:

```typescript
import { loadGraph, graphToJson, getStats } from 'agentflow-core';
import { readFileSync, writeFileSync } from 'fs';

// Load any trace file (handles all node formats: object, array, Map)
const graph = loadGraph(readFileSync('trace.json', 'utf8'));
console.log(getStats(graph));

// Save a graph to disk
writeFileSync('trace.json', JSON.stringify(graphToJson(graph), null, 2));
```

## Code-level Instrumentation

For deeper tracing inside your agent code:

### JavaScript / TypeScript

```typescript
import { createGraphBuilder, graphToJson, getStats } from 'agentflow-core';
import { writeFileSync } from 'fs';

const builder = createGraphBuilder({
  agentId: 'my-agent',
  trigger: 'api-request',
});

const root = builder.startNode({ type: 'agent', name: 'main' });
const tool = builder.startNode({ type: 'tool', name: 'search', parentId: root });
builder.endNode(tool);
builder.endNode(root);

const graph = builder.build();
writeFileSync(`traces/${graph.agentId}-${Date.now()}.json`,
  JSON.stringify(graphToJson(graph), null, 2));

console.log(getStats(graph)); // { totalNodes: 2, failureCount: 0, ... }
```

### Python

```bash
pip install agentflow-python
```

```python
from agentflow_python import AgentFlowTracer, traced_execution

tracer = AgentFlowTracer("my-agent")

# Trace a function
result = tracer.trace_execution("process", data, {"batch_size": 100})

# Context manager
with traced_execution(tracer, "train_model", config) as trace:
    model = train(config)
```

## Distributed Tracing

AgentFlow links execution graphs across processes via trace IDs:

```
✓  trace:75629bc2  1:56 PM  (4 agents)
     ✓ orchestrator [cron] 1ms
   ├─ ✓ curator [spawned] 12ms
   │  └─ ✓ sub-worker [spawned] 3ms
   └─ ✓ janitor [spawned] 8ms
```

**Parent creates context:**
```typescript
const builder = createGraphBuilder({ agentId: 'orchestrator' });
const { traceId, spanId } = builder.traceContext;
```

**Child picks it up automatically:**
```bash
AGENTFLOW_TRACE_ID=<traceId> AGENTFLOW_PARENT_SPAN_ID=<spanId> node child.js
```

```typescript
// child.js — traceId and parentSpanId read from env automatically
const builder = createGraphBuilder({ agentId: 'worker', trigger: 'spawned' });
```

**Stitch and visualize:**
```typescript
import { groupByTraceId, stitchTrace, getTraceTree } from 'agentflow-core';

const groups = groupByTraceId(allGraphs);
for (const [traceId, graphs] of groups) {
  const trace = stitchTrace(graphs);
  const tree = getTraceTree(trace);
  for (const g of tree) console.log(`${g.agentId} [${g.status}]`);
}
```

## API Reference

### Graph Construction

| Function | Description |
|---|---|
| `createGraphBuilder(config?)` | Create a new graph builder |
| `builder.startNode(options)` | Start an execution node, returns node ID |
| `builder.endNode(nodeId)` | Mark a node as completed |
| `builder.failNode(nodeId, error)` | Mark a node as failed |
| `builder.withParent(id, fn)` | Auto-parent all nodes created inside `fn` |
| `builder.build()` | Finalize and return a frozen `ExecutionGraph` |
| `builder.getSnapshot()` | Get a frozen snapshot without finalizing |
| `builder.traceContext` | Get `{ traceId, spanId }` for propagation |

### Graph Querying

| Function | Description |
|---|---|
| `getStats(graph)` | Aggregate statistics (nodes, depth, duration, failures) |
| `getFailures(graph)` | All failed/hung/timeout nodes |
| `getHungNodes(graph)` | Nodes still in `running` status |
| `getCriticalPath(graph)` | Longest execution path |
| `getNode(graph, id)` | Get a single node by ID |
| `getChildren(graph, id)` | Direct children of a node |
| `getSubtree(graph, id)` | All descendants in BFS order |
| `getDepth(graph)` | Maximum nesting depth |
| `getDuration(graph)` | Total duration in ms |

### Serialization

| Function | Description |
|---|---|
| `loadGraph(input)` | Deserialize JSON (string or object) into `ExecutionGraph` |
| `graphToJson(graph)` | Serialize `ExecutionGraph` to a plain JSON-safe object |

### Distributed Tracing

| Function | Description |
|---|---|
| `groupByTraceId(graphs)` | Group graphs by shared `traceId` |
| `stitchTrace(graphs)` | Combine into a `DistributedTrace` tree |
| `getTraceTree(trace)` | Depth-first ordered list of graphs |

### CLI

| Command | Description |
|---|---|
| `agentflow live [dir...]` | Real-time terminal monitor (auto-detects any JSON/JSONL) |
| `agentflow run -- <cmd>` | Trace any command without code changes |
| `startLive(argv)` | Programmatic API for the live monitor |
| `runTraced(config)` | Programmatic API for the runner |

### Environment Variables

| Variable | Description |
|---|---|
| `AGENTFLOW_TRACE_ID` | Trace ID to join (read automatically) |
| `AGENTFLOW_PARENT_SPAN_ID` | Parent span ID (read automatically) |

## Node Types

| Type | Use for |
|---|---|
| `agent` | Top-level agent execution |
| `subagent` | Agent spawned by another agent |
| `tool` | Tool call (API, database, file I/O) |
| `decision` | Branching logic or routing |
| `wait` | Waiting for external input |
| `custom` | Anything else |

## Architecture

```
agentflow/
├── packages/
│   ├── core/           # Graph builder, query engine, live monitor, CLI
│   ├── python/         # Python integration
│   ├── dashboard/      # Web monitoring with WebSocket
│   └── storage/        # SQLite persistence & analytics
├── tests/
└── examples/
```

## Development

```bash
git clone https://github.com/ClemenceChee/AgentFlow.git
cd AgentFlow
npm install
npm run build
npm test
```

## npm Packages

| Package | Version | Description |
|---|---|---|
| [`agentflow-core`](https://www.npmjs.com/package/agentflow-core) | 0.2.1 | Graph builder, query engine, live monitor, CLI |
| [`agentflow-dashboard`](https://www.npmjs.com/package/agentflow-dashboard) | 0.1.4 | Web monitoring dashboard |
| [`agentflow-storage`](https://www.npmjs.com/package/agentflow-storage) | 0.1.4 | SQLite persistence & analytics |
| [`agentflow-python`](https://www.npmjs.com/package/agentflow-python) | 0.1.3 | Python integration |

## License

MIT
