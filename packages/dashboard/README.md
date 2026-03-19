# AgentFlow Dashboard v0.4.0

Real-time monitoring dashboard for AI agent systems. Visualize execution graphs, session transcripts, and performance metrics from any agent framework.

## Features

### Universal Agent Monitoring
- **Multi-Format Ingestion** - AgentFlow JSON traces, JSONL session logs (Claude Code compatible), structured log files, cron run logs
- **Auto-Discovery** - Recursively scans directories for trace files, watches for new files in real-time
- **Framework Agnostic** - Works with any agent system that produces JSON traces or JSONL session logs

### 7 Interactive Tabs
- **Timeline** - Waterfall execution timeline with duration bars and status icons
- **Transcript** - Full conversation view: user messages, assistant responses, thinking blocks, tool calls
- **Graph** - Interactive Cytoscape.js execution flow visualization
- **Metrics** - Success rates, token usage, duration stats, node breakdown
- **Heatmap** - Error distribution across recent traces
- **State Machine** - Execution state flow diagram with node counts
- **Summary** - Auto-generated text summary with recommendations

### Session Transcripts
- Chat-bubble UI for JSONL sessions
- User/assistant messages, tool calls with args and results
- Collapsible thinking blocks
- Token usage and cost per message
- Subagent spawn tracking

### Process Health
- Live process detection and categorization
- PID file and systemd unit monitoring
- Orphan process detection
- CPU/memory resource tracking

### Real-Time Updates
- WebSocket live trace broadcasting with auto-reconnect
- File watcher triggers instant sidebar updates on new/changed files

## Quick Start

```bash
# Install globally
npm install -g agentflow-dashboard

# Monitor a traces directory
agentflow-dashboard --traces ./traces --port 3000

# Watch multiple directories
agentflow-dashboard \
  --traces ./traces \
  --data-dir ./sessions \
  --data-dir ./cron-runs \
  --host 0.0.0.0

# Or run with npx
npx agentflow-dashboard --traces ./my-agent-traces
```

Open http://localhost:3000 to view the dashboard.

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

## Supported File Formats

| Format | Extension | Description |
|--------|-----------|-------------|
| AgentFlow JSON | `.json` | Execution graph traces with nodes, edges, timing |
| JSONL Sessions | `.jsonl` | Claude Code / OpenClaw session transcripts |
| Cron Run Logs | `.jsonl` | Job execution logs (`ts`, `jobId`, `action`, `status`) |
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

## Programmatic Usage

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

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/traces` | List all traces with metadata |
| GET | `/api/traces/:filename` | Full trace detail (nodes, events, token usage) |
| GET | `/api/traces/:filename/events` | Session events and token usage |
| GET | `/api/agents` | All discovered agents with metrics |
| GET | `/api/stats` | Global performance statistics |
| GET | `/api/stats/:agentId` | Per-agent statistics |
| GET | `/api/process-health` | Running process audit |
| WS | `/` | Real-time trace updates |

## Architecture

```
Trace files (.json, .jsonl, .log)
        │
        ▼
  TraceWatcher ──▶ AgentStats ──▶ Express + WebSocket
  (file watcher)   (metrics)      (REST API + live updates)
                                        │
                                        ▼
                                   Browser SPA
                                  (dashboard.js)
```

## Deployment

### Systemd

```ini
[Unit]
Description=AgentFlow Dashboard
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/agentflow-dashboard --host 0.0.0.0 --traces /var/log/agentflow
Restart=always

[Install]
WantedBy=multi-user.target
```

### Docker

```dockerfile
FROM node:20-alpine
RUN npm install -g agentflow-dashboard
EXPOSE 3000
CMD ["agentflow-dashboard", "--host", "0.0.0.0", "--traces", "/traces"]
```

## License

MIT
