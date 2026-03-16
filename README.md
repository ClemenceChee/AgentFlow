# AgentFlow

**Know when your AI agents break. Fix them before your users notice.**

AgentFlow monitors any AI agent infrastructure — cron jobs, worker daemons, task queues, LLM pipelines — and alerts you when something fails or goes silent. Point it at a directory. It figures out the rest.

```bash
npm install -g agentflow-core
```

## 30-second setup

```bash
# Watch your agent data directory for failures
agentflow watch ./data --notify telegram

# That's it. You'll get a Telegram message when:
# - An agent errors out
# - A scheduled job stops running
# - A worker goes silent
# - An agent recovers
```

No config files. No adapters. No code changes. AgentFlow reads your existing JSON and JSONL state files and figures out what's healthy and what isn't.

## What it monitors

AgentFlow auto-detects the format of every JSON/JSONL file it finds:

| What it finds | What it does |
|---|---|
| File with `status: "error"` | Alerts you |
| Job scheduler with failed runs | Shows which jobs failed and why |
| Worker registry with PIDs | Shows which workers are running |
| File that stopped updating | Detects it's stale and alerts |
| File that was erroring and now works | Sends a recovery notification |

It works with **any** agent framework — LangChain, CrewAI, AutoGen, custom Python/Node agents, cron-based pipelines, Docker services — as long as they write JSON state files somewhere.

## Five commands

### `agentflow watch` — Alerts (run as a background service)

```bash
# Alert on errors and stale agents, notify via Telegram
agentflow watch ./data ./cron \
  --alert-on error \
  --alert-on stale:15m \
  --alert-on recovery \
  --notify telegram

# Alert via webhook (Slack, Discord, PagerDuty, etc.)
agentflow watch ./data --notify webhook:https://hooks.slack.com/services/...

# Alert via shell command
agentflow watch ./data --notify "command:curl -X POST https://my-alerting/endpoint"

# Multiple directories, multiple conditions
agentflow watch ./traces ./workers ./cron \
  --alert-on error \
  --alert-on stale:30m \
  --alert-on consecutive-errors:3 \
  --poll 60
```

**Alert conditions** (composable with multiple `--alert-on` flags):
- `error` — agent status transitions to error
- `recovery` — agent recovers from error to ok
- `stale:DURATION` — file not updated within threshold (e.g. `15m`, `1h`, `2d`)
- `consecutive-errors:N` — N consecutive error observations

**Notification channels** (composable with multiple `--notify` flags):
- `telegram` — needs `AGENTFLOW_TELEGRAM_BOT_TOKEN` and `AGENTFLOW_TELEGRAM_CHAT_ID` env vars
- `webhook:URL` — POSTs a JSON payload to any URL
- `command:CMD` — runs a shell command with `AGENTFLOW_ALERT_*` env vars
- stdout — always on

**Built-in deduplication**: Won't spam you. Once an alert fires, it waits for recovery (or a configurable cooldown) before alerting again.

**State persistence**: Survives restarts. Remembers what was healthy and what was broken.

### `agentflow live` — Terminal dashboard (interactive debugging)

```bash
# Real-time view of all agents
agentflow live ./data

# Multiple directories
agentflow live ./traces ./cron ./workers

# With subdirectory scanning
agentflow live ./data -R --refresh 5
```

Auto-refreshing terminal UI showing:
- Per-agent status table with nested groups (workers under their registry, jobs under their scheduler)
- Sparkline activity graph (1 hour)
- Distributed trace tree view
- Recent activity feed
- Flicker-free rendering

### `agentflow run` — Execution tracing (wrap any command)

```bash
# Trace any command — zero code changes
agentflow run -- python my_agent.py

# Watch state files for sub-worker activity
agentflow run --watch-dir ./data -- python -m myagent process
```

Creates structured JSON trace files that `agentflow live` and `agentflow watch` can read.

### `agentflow trace` — Inspect saved traces

```bash
# List all saved traces
agentflow trace list --traces-dir ./traces

# Filter by status
agentflow trace list --status failed --limit 10

# Show a trace as an ASCII tree
agentflow trace show <trace-id-or-filename> --traces-dir ./traces
# ✓ alfred-supervisor (agent) 232ms
# ├─ ✓ dispatch-command (tool) 232ms
# └─ ✓ state-monitor (tool) 232ms

# Show a trace as a timeline waterfall
agentflow trace timeline <trace-id-or-filename> --traces-dir ./traces
# 0ms         50ms        100ms       150ms       200ms
# ┼───────────┼───────────┼───────────┼───────────┤
# ██████████████████████████████████████████████████ ✓ main (232ms)
#  ████████████████████                              ✓ search (100ms)

# Find all stuck/hung spans across traces
agentflow trace stuck --traces-dir ./traces

# Detect reasoning loops
agentflow trace loops --traces-dir ./traces
```

Accepts both graph IDs and filenames (with or without `.json`).

### Runtime guards (programmatic)

Guards detect stuck agents, reasoning loops, and spawn explosions in real-time:

```typescript
import { createGraphBuilder, withGuards, checkGuards } from 'agentflow-core';

// Wrap any builder with guards
const raw = createGraphBuilder({ agentId: 'my-agent' });
const builder = withGuards(raw, {
  maxDepth: 10,            // Max nesting depth
  maxAgentSpawns: 50,      // Max agent/subagent count
  maxReasoningSteps: 25,   // Consecutive same-type node limit
  onViolation: 'warn',     // 'warn' | 'error' | 'abort'
});

// Use exactly like a normal builder — guards check automatically
const root = builder.startNode({ type: 'agent', name: 'main' });
builder.endNode(root);
const graph = builder.build();

// Or check any graph after the fact
const violations = checkGuards(graph, { maxDepth: 5 });
```

Guard violation types:
- **Timeout**: Node running longer than threshold (configurable per type: tool 30s, agent 5m, wait 10m)
- **Reasoning loop**: Consecutive same-type nodes exceeding limit (catches infinite loops)
- **Spawn explosion**: Graph depth or agent count exceeding limits

## How auto-detection works

AgentFlow doesn't need to know your agent framework. It reads JSON files and looks for patterns:

```
# A file like this:
{"status": "error", "lastError": "connection timeout", "ts": 1710000000}
→ Detected as: agent in error state

# A file like this:
{"jobs": [{"name": "digest", "state": {"lastRunStatus": "ok", "lastRunAtMs": 1710000000}}]}
→ Detected as: job scheduler with per-job status

# A file like this:
{"tools": {"curator": {"pid": 1234, "status": "running"}, "janitor": {"pid": 1235, "status": "running"}}}
→ Detected as: worker registry with 2 running workers

# A JSONL file like this:
{"ts": 1710000000, "action": "finished", "status": "ok"}
→ Detected as: session log, last run successful
```

Status values are normalized automatically: `ok`/`success`/`completed`/`healthy`/`done`/`passed` → ok. `error`/`failed`/`crashed`/`timeout` → error. `running`/`active`/`processing` → running.

## Programmatic API

```typescript
import {
  createGraphBuilder, withGuards, checkGuards,
  createTraceStore, toAsciiTree, toTimeline,
  graphToJson, loadGraph, getStats
} from 'agentflow-core';

// Build execution traces with runtime guards
const raw = createGraphBuilder({ agentId: 'my-agent', trigger: 'cron' });
const builder = withGuards(raw, { maxDepth: 10, onViolation: 'warn' });
const root = builder.startNode({ type: 'agent', name: 'main' });
// ... your agent logic ...
builder.endNode(root);
const graph = builder.build();

// Visualize
console.log(toAsciiTree(graph));    // ASCII tree with status icons
console.log(toTimeline(graph));     // Horizontal waterfall

// Persist and query
const store = createTraceStore('./traces');
await store.save(graph);
const stuck = await store.getStuckSpans();
const loops = await store.getReasoningLoops();

// Load and analyze any trace
const loaded = loadGraph(readFileSync('trace.json', 'utf8'));
console.log(getStats(loaded));
// { totalNodes: 5, failureCount: 0, depth: 2, duration: 1234, ... }
```

## Run as a systemd service

```ini
# /etc/systemd/user/agentflow-watch.service
[Unit]
Description=AgentFlow Watch
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/agentflow watch /path/to/data /path/to/cron --alert-on error --alert-on stale:15m --alert-on recovery --notify telegram --poll 60
Restart=always
RestartSec=10
Environment=AGENTFLOW_TELEGRAM_BOT_TOKEN=your-bot-token
Environment=AGENTFLOW_TELEGRAM_CHAT_ID=your-chat-id

[Install]
WantedBy=default.target
```

```bash
systemctl --user enable --now agentflow-watch
```

## Full API reference

### CLI

| Command | Description |
|---|---|
| `agentflow watch [dir...] [options]` | Headless alert system |
| `agentflow live [dir...] [options]` | Real-time terminal dashboard |
| `agentflow run [options] -- <cmd>` | Wrap a command with tracing |
| `agentflow trace list [--status] [--limit]` | List saved traces |
| `agentflow trace show <id>` | Show trace as ASCII tree |
| `agentflow trace timeline <id>` | Show trace as timeline waterfall |
| `agentflow trace stuck` | Find stuck/hung/timeout spans |
| `agentflow trace loops` | Detect reasoning loops |

### Graph construction

| Function | Description |
|---|---|
| `createGraphBuilder(config?)` | Create a new graph builder |
| `builder.startNode(options)` | Start an execution node |
| `builder.endNode(nodeId)` | Mark node completed |
| `builder.failNode(nodeId, error)` | Mark node failed |
| `builder.build()` | Finalize and return frozen `ExecutionGraph` |

### Runtime guards

| Function | Description |
|---|---|
| `withGuards(builder, config?)` | Wrap a builder with guard detection |
| `checkGuards(graph, config?)` | Check a graph for violations |

### Visualization

| Function | Description |
|---|---|
| `toAsciiTree(graph)` | Render as ASCII tree with status icons |
| `toTimeline(graph)` | Render as horizontal timeline waterfall |

### Trace storage

| Function | Description |
|---|---|
| `createTraceStore(dir)` | Create a JSON file-based trace store |
| `store.save(graph)` | Save a graph to disk |
| `store.get(id)` | Load a graph by ID |
| `store.list({ status?, limit? })` | List stored graphs |
| `store.getStuckSpans()` | Find stuck nodes across all traces |
| `store.getReasoningLoops(threshold?)` | Detect reasoning loops |

### Graph querying

| Function | Description |
|---|---|
| `getStats(graph)` | Aggregate statistics |
| `getFailures(graph)` | All failed/hung/timeout nodes |
| `getHungNodes(graph)` | Nodes still running |
| `getCriticalPath(graph)` | Longest execution path |

### Serialization

| Function | Description |
|---|---|
| `loadGraph(input)` | JSON (string or object) → `ExecutionGraph` |
| `graphToJson(graph)` | `ExecutionGraph` → plain JSON object |

### Distributed tracing

| Function | Description |
|---|---|
| `groupByTraceId(graphs)` | Group by shared trace ID |
| `stitchTrace(graphs)` | Combine into a trace tree |
| `getTraceTree(trace)` | Depth-first ordered list |

Trace context propagates automatically via `AGENTFLOW_TRACE_ID` and `AGENTFLOW_PARENT_SPAN_ID` environment variables.

## Packages

| Package | Description |
|---|---|
| [`agentflow-core`](https://www.npmjs.com/package/agentflow-core) | CLI, graph engine, guards, visualization, trace store |
| [`agentflow-dashboard`](https://www.npmjs.com/package/agentflow-dashboard) | Web dashboard with WebSocket |
| [`agentflow-storage`](https://www.npmjs.com/package/agentflow-storage) | SQLite persistence & analytics |

## Development

```bash
git clone https://github.com/ClemenceChee/AgentFlow.git
cd AgentFlow
npm install
npm run build
npm test            # 125 tests
```

## License

MIT
