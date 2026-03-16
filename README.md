# AgentFlow

**Universal execution tracing and monitoring for AI agent systems.**

AgentFlow captures, stores, and analyzes the full execution graphs of AI agent systems — including **distributed traces across multiple processes**. Monitor single agents or entire multi-agent ecosystems with a real-time CLI, web dashboard, and cross-language support.

## Installation

```bash
npm install -g agentflow-core
```

That's it. This gives you the `agentflow` CLI and the core library. Works with Node.js 20+.

**Optional packages:**

```bash
npm install agentflow-dashboard   # Web dashboard
npm install agentflow-storage     # SQLite persistence & analytics
pip install agentflow-python      # Python agent integration
```

## Quick Start — Zero-code tracing

The fastest way to start: wrap any command with `agentflow run`. No code changes needed.

```bash
# Trace any command
agentflow run -- python my_agent.py

# Watch state files to detect sub-worker activity
agentflow run --watch-dir ./data -- python -m alfred process

# Full example with all options
agentflow run \
  --traces-dir ./traces \
  --watch-dir /path/to/worker/state \
  --agent-id my-orchestrator \
  --trigger cron \
  -- python -m my_agent process
```

**What happens:**
1. AgentFlow creates an orchestrator trace with a unique `traceId`
2. Sets `AGENTFLOW_TRACE_ID` and `AGENTFLOW_PARENT_SPAN_ID` env vars
3. Runs your command (stdout/stderr pass through normally)
4. After exit, checks watched directories for file changes → creates child traces for each changed file
5. Saves all traces as JSON files

**Output:**
```
🔍 AgentFlow: Tracing command: python -m alfred process
📁 Traces: ./traces
👁️  Watching: ./data (*.json)

... your command output ...

✅ Command completed (exit code 0, 2.3s)
📝 Traces saved:
   alfred         → traces/alfred-2026-03-16T14-00-00.json
   ├─ curator     → traces/alfred-curator-2026-03-16T14-00-00.json (state changed)
   └─ janitor     → traces/alfred-janitor-2026-03-16T14-00-00.json (state changed)
🔗 Trace ID: abc12345
```

### `agentflow run` CLI reference

```
agentflow run [options] -- <command>

Options:
  --traces-dir <path>     Where to save trace files (default: ./traces)
  --watch-dir <path>      Directory to monitor for state changes (repeatable)
  --watch-pattern <glob>  File pattern to watch (default: *.json)
  --agent-id <name>       Agent name (default: derived from command)
  --trigger <name>        Trigger label (default: cli)
```

### Cron job integration

Replace your existing cron entry:

```bash
# Before:
*/30 * * * * python -m alfred process

# After:
*/30 * * * * npx agentflow run --watch-dir ~/.alfred/data --traces-dir ~/traces -- python -m alfred process
```

## Code-level instrumentation

For deeper tracing inside your agent code:

### JavaScript

```typescript
import { createGraphBuilder, getStats, getFailures } from 'agentflow-core';
import fs from 'fs';

const builder = createGraphBuilder({
  agentId: 'my-agent',
  trigger: 'api-request',
});

const root = builder.startNode({ type: 'agent', name: 'main' });
const tool = builder.startNode({ type: 'tool', name: 'search', parentId: root });
builder.endNode(tool);
builder.endNode(root);

const graph = builder.build();

// Save trace to disk
fs.writeFileSync(
  `traces/${graph.agentId}-${Date.now()}.json`,
  JSON.stringify({
    ...graph,
    nodes: Array.from(graph.nodes.entries()),
  }, null, 2)
);

// Query the graph
const stats = getStats(graph);
console.log(stats); // { totalNodes: 2, failureCount: 0, depth: 1, ... }
```

### 2. Instrument an agent (Python)

```python
from agentflow_python import AgentFlowTracer, traced_execution

tracer = AgentFlowTracer("my-python-agent")

# Option A: context manager
with traced_execution(tracer, "process_data", input_data) as trace:
    result = do_work(input_data)

# Option B: direct call
result = tracer.trace_execution("analyze", data, {"model": "gpt-4"})
```

### 3. Monitor in real-time (CLI)

Create a monitoring script that reads your trace files:

```javascript
// monitor.js
import fs from 'fs';
import { getStats, getFailures, groupByTraceId, stitchTrace, getTraceTree } from 'agentflow-core';

const traces = fs.readdirSync('./traces')
  .filter(f => f.endsWith('.json'))
  .map(f => JSON.parse(fs.readFileSync(`./traces/${f}`, 'utf8')))
  .map(t => ({ ...t, nodes: new Map(t.nodes) }));

// Per-agent stats
const agents = {};
for (const t of traces) {
  const stats = getStats(t);
  const fails = getFailures(t);
  agents[t.agentId] ??= { runs: 0, ok: 0, fail: 0 };
  agents[t.agentId].runs++;
  fails.length === 0 ? agents[t.agentId].ok++ : agents[t.agentId].fail++;
}

console.table(agents);

// Distributed traces (multi-agent workflows)
const groups = groupByTraceId(traces);
for (const [traceId, graphs] of groups) {
  if (graphs.length > 1) {
    const dt = stitchTrace(graphs);
    const tree = getTraceTree(dt);
    console.log(`\nDistributed trace ${traceId.slice(0,8)}:`);
    for (const g of tree) console.log(`  ${g.agentId} [${g.status}]`);
  }
}
```

```bash
node monitor.js
```

A complete live-updating monitor example is included in [examples/live-monitor.js](examples/).

## Distributed Tracing

AgentFlow supports **cross-process trace propagation**. When one agent spawns another, the execution graphs are automatically linked via shared trace IDs and rendered as a tree:

```
✓  trace:75629bc2  1:56 PM  (4 agents)
     ✓ orchestrator [cron] 1ms
   ├─ ✓ curator [spawned] 12ms
   │  └─ ✓ sub-worker [spawned] 3ms
   └─ ✓ janitor [spawned] 8ms
```

### How it works

1. **Parent agent** creates a graph and gets a trace context:

```typescript
const builder = createGraphBuilder({ agentId: 'orchestrator', trigger: 'cron' });
const { traceId, spanId } = builder.traceContext;
```

2. **Pass context to child** via environment variables:

```bash
AGENTFLOW_TRACE_ID=<traceId> AGENTFLOW_PARENT_SPAN_ID=<spanId> node child-agent.js
```

3. **Child agent** automatically picks up the context:

```typescript
// child-agent.js — no extra config needed
const builder = createGraphBuilder({ agentId: 'worker', trigger: 'spawned' });
// traceId and parentSpanId are read from env vars automatically
const graph = builder.build();
// graph.traceId === parent's traceId
// graph.parentSpanId === parent's spanId
```

4. **Stitch and visualize** across process boundaries:

```typescript
import { groupByTraceId, stitchTrace, getTraceTree } from 'agentflow-core';

const groups = groupByTraceId(allGraphs);
for (const [traceId, graphs] of groups) {
  const trace = stitchTrace(graphs);
  const tree = getTraceTree(trace);
  // tree is depth-first ordered: [orchestrator, curator, sub-worker, janitor]
}
```

### Python distributed tracing

```python
tracer = AgentFlowTracer("orchestrator")
tracer.trace_execution("dispatch", task_data)

# Spawn child with trace context propagated automatically
result = tracer.spawn_traced(["python3", "worker.py", "--task", task_id])

# Or get env vars to pass manually
child_env = tracer.get_child_env()
subprocess.run(["node", "worker.js"], env=child_env)
```

## Core API Reference

### Graph Construction

| Function | Description |
|----------|-------------|
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
|----------|-------------|
| `getStats(graph)` | Aggregate statistics (nodes, depth, duration, failures) |
| `getFailures(graph)` | All failed nodes |
| `getHungNodes(graph)` | Nodes still in `running` status |
| `getCriticalPath(graph)` | Longest execution path |
| `getNode(graph, id)` | Get a single node by ID |
| `getChildren(graph, id)` | Get direct children of a node |
| `getSubtree(graph, id)` | Get a node and all descendants |
| `getDepth(graph)` | Maximum nesting depth |
| `getDuration(graph)` | Total execution duration in ms |

### Distributed Tracing & CLI Runner

| Function / CLI | Description |
|----------|-------------|
| `agentflow run -- <cmd>` | Trace any command without code changes |
| `runTraced(config)` | Programmatic API for `agentflow run` |
| `groupByTraceId(graphs)` | Group graphs by their shared `traceId` |
| `stitchTrace(graphs)` | Combine graphs into a `DistributedTrace` tree |
| `getTraceTree(trace)` | Depth-first ordered list of graphs in a trace |

### Environment Variables

| Variable | Description |
|----------|-------------|
| `AGENTFLOW_TRACE_ID` | Trace ID to join (read automatically by `createGraphBuilder`) |
| `AGENTFLOW_PARENT_SPAN_ID` | Parent span ID (read automatically by `createGraphBuilder`) |

## Node Types

Execution nodes have a `type` field:

| Type | Use for |
|------|---------|
| `agent` | Top-level agent execution |
| `subagent` | Agent spawned by another agent |
| `tool` | Tool call (API, database, file I/O) |
| `decision` | Branching logic or routing |
| `wait` | Waiting for external input |
| `custom` | Anything else |

## Python Integration

```bash
pip install agentflow-python
```

Requires Node.js 18+ (used internally via subprocess).

```python
from agentflow_python import AgentFlowTracer, traced_execution

tracer = AgentFlowTracer("my-agent")

# Trace a function
result = tracer.trace_execution("process", data, {"batch_size": 100})

# Context manager
with traced_execution(tracer, "train_model", config) as trace:
    model = train(config)

# Spawn a child process with trace context
result = tracer.spawn_traced(["python3", "child_agent.py"])

# Or get env vars for manual propagation
env = tracer.get_child_env()
subprocess.run(["node", "worker.js"], env=env)
```

## Production Deployment

### Docker Compose

```yaml
version: '3.8'
services:
  agentflow-dashboard:
    image: node:18-alpine
    command: >
      sh -c "npm install -g agentflow-dashboard &&
             agentflow-dashboard --traces /traces --port 3000 --host 0.0.0.0"
    ports:
      - "3000:3000"
    volumes:
      - ./traces:/traces

  agentflow-storage:
    image: node:18-alpine
    command: >
      sh -c "npm install -g agentflow-storage &&
             agentflow-query ingest --traces /traces --db /data/agentflow.db"
    volumes:
      - ./traces:/traces
      - ./data:/data
    restart: unless-stopped
```

### Systemd Service

```ini
# /etc/systemd/system/agentflow-monitor.service
[Unit]
Description=AgentFlow Monitor
After=network.target

[Service]
Type=simple
User=agentflow
WorkingDirectory=/opt/agentflow
ExecStart=/usr/local/bin/node monitor.js
Restart=always

[Install]
WantedBy=multi-user.target
```

## Architecture

```
agentflow/
├── packages/
│   ├── core/           # Graph builder, query engine, distributed tracing
│   ├── python/         # Python integration (subprocess bridge)
│   ├── dashboard/      # Web monitoring interface
│   └── storage/        # SQLite persistence & analytics
├── tests/              # Test suite
└── examples/           # Usage examples
```

### Design Decisions

- **Zero dependencies in core** — `Map<string, ExecutionNode>` for nodes, `crypto.randomUUID()` for trace IDs
- **Environment variable propagation** — Works across any process spawning method (subprocess, exec, Docker, SSH)
- **Stitching at read time** — Each process writes independently; correlation happens when reading traces
- **Deep freeze on build** — `build()` returns a deeply frozen, immutable `ExecutionGraph`
- **Backward compatible** — All distributed tracing fields are optional; existing traces work unchanged

## Development

```bash
git clone https://github.com/ClemenceChee/AgentFlow.git
cd AgentFlow

npm install          # Install dependencies
npm run build        # Build all packages
npm test             # Run tests
npm run typecheck    # Type-check
npm run lint         # Lint
```

## npm Packages

| Package | Version | Description |
|---------|---------|-------------|
| [`agentflow-core`](https://www.npmjs.com/package/agentflow-core) | 0.1.3 | Graph builder, query engine, distributed tracing |
| [`agentflow-python`](https://www.npmjs.com/package/agentflow-python) | 0.1.3 | Python integration |
| [`agentflow-dashboard`](https://www.npmjs.com/package/agentflow-dashboard) | 0.1.3 | Web monitoring dashboard |
| [`agentflow-storage`](https://www.npmjs.com/package/agentflow-storage) | 0.1.3 | SQLite persistence & analytics |

## License

MIT