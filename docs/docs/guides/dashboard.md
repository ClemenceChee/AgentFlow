---
sidebar_position: 2
title: Dashboard
---

# Dashboard

`agentflow-dashboard` is a self-hosted React dashboard with an Express backend. It watches trace directories, parses execution graphs in real time, and serves a web UI for exploring agent behavior.

## Quick Start

```bash
# Install globally
npm install -g agentflow-dashboard

# Point at your traces directory
agentflow-dashboard --traces ./traces --port 3000
```

Open [http://localhost:3000](http://localhost:3000).

No configuration file required. The dashboard auto-discovers agents by scanning the traces directory recursively.

## CLI Options

```
agentflow-dashboard [options]

Options:
  -p, --port <number>     Server port (default: 3000)
  -t, --traces <path>     Primary traces directory (default: ./traces)
  -h, --host <address>    Host address (default: localhost)
  --data-dir <path>       Extra data directory (repeatable)
  --cors                  Enable CORS headers
  --help                  Show help message
```

### Multiple directories

```bash
agentflow-dashboard \
  --traces ./traces \
  --data-dir ./sessions \
  --data-dir ./cron-runs \
  --host 0.0.0.0
```

### Run without installing

```bash
npx agentflow-dashboard --traces ./my-agent-traces
```

---

## The Nine Tabs

Each trace opens into a tabbed detail view. Every tab shows a different lens on the same execution graph.

| Tab | What it shows |
|-----|---------------|
| **Timeline** | Waterfall chart with duration bars and status icons per node |
| **Transcript** | Chat-bubble replay: user messages, assistant responses, thinking blocks, tool calls |
| **Graph** | Interactive Cytoscape.js execution flow visualization |
| **Metrics** | Success rates, token usage, duration stats, node type breakdown |
| **Heatmap** | Error distribution across recent traces |
| **State Machine** | Execution state flow diagram with node counts |
| **Summary** | Auto-generated text summary with recommendations |
| **Agent Timeline** | Gantt chart of all executions for an agent with expandable sub-activities |
| **Process Map** | Process mining graph: activity flows, transition frequencies, failure rates |

### Agent Timeline (Gantt)

Shows all executions for an agent on a shared time axis. Click any row to expand nested sub-activities. Bars are color-coded by node type (user, assistant, thinking, tool call, tool result). Displays up to the 50 most recent executions.

### Process Map

Directed graph aggregated across all executions for an agent. Node size is proportional to frequency, edge width to transition count, and color to failure rate (green to red). Click any node to see occurrence count, frequency percentage, average duration, and fail rate. Rare activities are filtered automatically to keep the graph readable.

---

## Supported File Formats

| Format | Extension | Description |
|--------|-----------|-------------|
| AgentFlow JSON | `.json` | Execution graph traces with nodes, timing, status |
| JSONL Sessions | `.jsonl` | Claude Code / OpenClaw session transcripts |
| Cron Run Logs | `.jsonl` | Job logs with `ts`, `jobId`, `action`, `status` fields |
| Structured Logs | `.log` | Python structlog, JSON logs, key=value logs |
| Session Index | `sessions.json` | Agent session metadata (auto-discovered) |

### JSONL Session Format

Compatible with Claude Code session format:

```jsonl
{"type":"session","id":"abc123","timestamp":"2026-03-19T10:00:00Z"}
{"type":"model_change","modelId":"claude-sonnet-4-20250514","provider":"anthropic"}
{"type":"message","message":{"role":"user","content":[{"type":"text","text":"Hello"}]}}
{"type":"message","message":{"role":"assistant","content":[{"type":"text","text":"Hi!"}],"usage":{"input":100,"output":50}}}
```

### AgentFlow Trace Format

```json
{
  "id": "node_001",
  "rootNodeId": "node_001",
  "agentId": "my-agent",
  "trigger": "cron",
  "startTime": 1710800000000,
  "endTime": 1710800060000,
  "status": "completed",
  "nodes": {
    "node_001": { "id": "node_001", "type": "agent", "name": "my-agent", "children": ["node_002"] },
    "node_002": { "id": "node_002", "type": "tool", "name": "search", "children": [] }
  }
}
```

---

## Programmatic API

Use `DashboardServer` to embed the dashboard in your own application:

```typescript
import { DashboardServer } from 'agentflow-dashboard';

const dashboard = new DashboardServer({
  port: 3000,
  tracesDir: './traces',
  dataDirs: ['./sessions', './cron-runs'],
  host: 'localhost',
  enableCors: false,
});

await dashboard.start();
```

---

## REST API

The dashboard exposes a REST API that you can query directly.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/traces` | List all traces with metadata |
| GET | `/api/traces/:filename` | Full trace detail (nodes, events, token usage) |
| GET | `/api/traces/:filename/events` | Session events and token usage |
| GET | `/api/agents` | All discovered agents with metrics |
| GET | `/api/agents/:agentId/timeline` | Gantt data: executions with nested activities |
| GET | `/api/agents/:agentId/process-graph` | Process mining graph: activity transitions |
| GET | `/api/stats` | Global performance statistics |
| GET | `/api/stats/:agentId` | Per-agent statistics |
| GET | `/api/process-health` | Running process audit |
| WS | `/` | Real-time trace updates (WebSocket) |

---

## Real-Time Updates

The dashboard uses a WebSocket connection for live updates. The file watcher detects new or changed trace files and pushes updates to all connected browser sessions immediately. The WebSocket client auto-reconnects on disconnect.

---

## Process Health

The dashboard audits running OS processes against your agent configuration. It detects:

- Live process status and resource usage (CPU, memory)
- PID file validity — whether the PID file points to an actually-running process
- Systemd unit status for agents managed as services
- Orphan processes — agent processes running outside your process manager

Access this via the **Process Health** section of the dashboard or the `/api/process-health` endpoint.
