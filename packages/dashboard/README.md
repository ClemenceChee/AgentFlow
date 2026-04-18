# AgentFlow Dashboard v0.9.1

Real-time monitoring dashboard for AI agent systems with organizational intelligence. Visualize execution graphs, session transcripts, performance metrics, and organizational context from any agent framework with enterprise-grade team governance and security auditing.

## Features

### Error Surfacing
- **Crystal-clear error tracking** — Failed node errors (`state.error` and `metadata.error`) are surfaced in all detail views: Flame Chart, Agent Flow, Summary, and Transcript
- Error messages like `"403 Forbidden — Key limit exceeded"` appear directly in the UI — no more digging through log files

### Universal Agent Monitoring
- **Multi-Format Ingestion** - AgentFlow JSON traces, JSONL session logs (Claude Code compatible), structured log files, cron run logs
- **Auto-Discovery** - Recursively scans directories for trace files, watches for new files in real-time
- **Framework Agnostic** - Works with any agent system that produces JSON traces or JSONL session logs

### 9 Interactive Tabs
- **Timeline** - Waterfall execution timeline with duration bars and status icons
- **Transcript** - Full conversation view: user messages, assistant responses, thinking blocks, tool calls
- **Graph** - Interactive Cytoscape.js execution flow visualization
- **Metrics** - Success rates, token usage, duration stats, node breakdown
- **Heatmap** - Error distribution across recent traces
- **State Machine** - Execution state flow diagram with node counts
- **Summary** - Auto-generated text summary with recommendations
- **Agent Timeline** - Gantt chart of all executions for an agent with expandable sub-activities
- **Process Map** - Process mining graph showing activity flows, transition frequencies, and failure rates

### Agent Timeline (Gantt Chart)
- All executions for an agent on a shared time axis
- Click any execution row to expand and see nested sub-activities
- Color-coded bars by type: user, assistant, thinking, tool call, tool result
- Trigger badges (cron, message, worker) and status indicators
- Up to 50 most recent executions per agent

### Process Map (Process Mining)
- Directed graph of activity flows aggregated across all executions
- Node size proportional to frequency, edge width proportional to transition count
- Color-coded by failure rate (green → yellow → red)
- Click nodes for occurrence count, frequency, avg duration, fail rate
- Filters rare activities to keep the graph readable

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

## 🏢 Organizational Intelligence (NEW)

Enterprise-grade team governance, security auditing, and organizational context for AI agent systems.

### Team Governance & Context
- **Team Filtering** - Filter traces and metrics by team with access control enforcement
- **Operator Context** - Track operator sessions, team membership, and instance assignments
- **Cross-Team Collaboration** - Monitor collaboration patterns and knowledge sharing
- **Team Performance Metrics** - Success rates, execution times, and productivity insights per team

### Security Auditing & Compliance
- **Comprehensive Audit Logging** - All organizational operations tracked with security events
- **Policy Enforcement** - Define and enforce organizational policies with violation detection
- **Compliance Monitoring** - Real-time compliance rates and governance recommendations
- **Security Alerting** - Anomaly detection with configurable security thresholds

### Session Correlation & Intelligence
- **Cross-Operator Intelligence** - Correlate sessions across operators and instances
- **Session Continuity Tracking** - Monitor handoffs and collaboration quality
- **Problem Pattern Analysis** - Identify recurring issues and workflow patterns
- **Knowledge Transfer** - Track knowledge sharing and learning patterns

### Policy Bridge & Governance
- **Organizational Context Queries** - Enhanced agent queries with team and policy context
- **Workflow Customization** - Team-specific validation and approval workflows
- **Policy Compliance Bridge** - Integration between organizational policies and agent behavior
- **Governance Workflows** - Multi-layer approval processes with audit trails

### SOMA Intelligence Integration
- **Organizational Vault** - Team-scoped knowledge management with governance layers
- **Intelligence Analytics** - Organizational insights from agent execution patterns
- **Guard Policies** - Behavioral enforcement based on organizational learning
- **Knowledge Explorer** - Browse team insights, decisions, and constraints by confidence level

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
  --soma-vault <path>     SOMA vault directory for organizational intelligence
  --cors                  Enable CORS headers
  --help                  Show help message

Environment Variables:
  SOMA_VAULT              SOMA vault path (alternative to --soma-vault)
```

### Organizational Intelligence Setup

```bash
# Basic setup with organizational intelligence
agentflow-dashboard \
  --traces ./traces \
  --soma-vault ~/.soma/vault \
  --host 0.0.0.0

# Or use environment variable
SOMA_VAULT=~/.soma/vault agentflow-dashboard --traces ./traces

# Team-scoped monitoring for enterprise
agentflow-dashboard \
  --traces ./traces \
  --soma-vault /org/soma/vault \
  --data-dir ./team-sessions \
  --host 0.0.0.0 \
  --port 3000
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
  somaVault: '~/.soma/vault', // Enable organizational intelligence
});

await dashboard.start();
```

### With Organizational Intelligence

```typescript
import { DashboardServer } from 'agentflow-dashboard';

const dashboard = new DashboardServer({
  port: 3000,
  tracesDir: './traces',
  dataDirs: ['./team-sessions', './audit-logs'],
  host: '0.0.0.0', // Bind to all interfaces for team access
  enableCors: true,
  somaVault: '/org/soma/vault', // Enterprise SOMA vault
  // Organizational features automatically enabled when somaVault is configured
});

await dashboard.start();
console.log('AgentFlow Dashboard with Organizational Intelligence running on http://localhost:3000');
console.log('📊 Team governance, security auditing, and session correlation active');
```

## API Endpoints

### Core Monitoring
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/traces` | List all traces with metadata |
| GET | `/api/traces/:filename` | Full trace detail (nodes, events, token usage) |
| GET | `/api/traces/:filename/events` | Session events and token usage |
| GET | `/api/agents` | All discovered agents with metrics |
| GET | `/api/agents/:agentId/timeline` | Gantt data: executions with nested activities |
| GET | `/api/agents/:agentId/process-graph` | Process mining graph: activity transitions |
| GET | `/api/stats` | Global performance statistics with organizational intelligence |
| GET | `/api/stats/:agentId` | Per-agent statistics |
| GET | `/api/process-health` | Running process audit |
| WS | `/` | Real-time trace updates |

### Organizational Intelligence
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/governance` | Team governance workflows and validation |
| GET | `/api/policies` | Organizational policy bridge and team policies |
| GET | `/api/audit` | Security audit logging and compliance metrics |
| GET | `/api/correlation` | Session correlation and cross-operator intelligence |
| GET | `/api/teams` | Available teams with access control information |
| GET | `/api/operators/:operatorId/activity` | Operator activity patterns and metrics |
| GET | `/api/sessions/:sessionId/correlations` | Session correlation data with similarity metrics |

### SOMA Intelligence
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/soma/tier` | SOMA vault configuration and feature tier detection |
| GET | `/api/soma/report` | Organizational intelligence analytics and insights |
| GET | `/api/soma/governance` | SOMA governance data and pending reviews |
| GET | `/api/soma/policies` | SOMA guard policies and enforcement rules |
| GET | `/api/soma/vault/entities` | Browse SOMA vault entities by layer and confidence |
| GET | `/api/soma/cross-agent` | Cross-agent knowledge flow and collaboration insights |

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
