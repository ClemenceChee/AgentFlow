# AgentFlow

**Process mining for AI agent systems — Know when your agents break, fix them before users notice.**

## What is this?

AgentFlow monitors AI agent infrastructure (LangChain, CrewAI, AutoGen, custom agents) and alerts you when something fails. Point it at a directory of JSON state files and it auto-detects what's healthy and what isn't. Zero config required.

## Quick Start

```bash
# Install
npm install -g agentflow-core@latest

# Watch your agent directory for failures
agentflow watch ./data --notify telegram

# Get real-time terminal dashboard
agentflow live ./data

# Run and trace any command
agentflow run -- python my_agent.py
```

## Monitoring Options

### Terminal Dashboard (Recommended)
Fast, lightweight terminal interface for daily use:
```bash
agentflow live ./data --refresh 5
```
- ASCII trees and tables
- Real-time updates
- Low resource usage
- Perfect for SSH/remote debugging

### Web Dashboard
Rich web interface for team dashboards and presentations:
```bash
agentflow-dashboard --traces ./traces --port 3000
```
- Interactive execution graphs
- WebSocket real-time updates
- Multi-agent system overview
- Responsive design (desktop + mobile)
- Zero configuration auto-discovery

## Demo: Catch Agent Failures in Action

```bash
# Clone and run the demo
git clone https://github.com/ClemenceChee/AgentFlow.git
cd AgentFlow
npm install
npx tsx examples/demo.ts
```

The demo creates an agent that:
1. ✅ Succeeds with normal tool calls
2. ⚠️ Triggers runtime guards (infinite loop detection)
3. ❌ Fails with timeout and shows recovery
4. 📊 Generates execution graphs and visualizations

**What you'll see:**
```
✓ portfolio-recon (agent) 232ms
├─ ✓ web-search (tool) 100ms
├─ ✓ news-aggregator (tool) 120ms
├─ ⚠ reasoning-loop detected (guard violation)
└─ ✗ analysis-engine timeout after 30s
```

## Architecture

AgentFlow works by reading JSON/JSONL state files that your agents already produce:

<img width="2339" height="1337" alt="AgentFlow Live Monitor" src="https://github.com/user-attachments/assets/f592b464-0fd8-42ee-b407-f5cf9819301e" />

**Zero-config monitoring** — No SDKs, no code changes, no adapters. AgentFlow auto-detects:
- Agent health patterns (`{"status": "ok"}` vs `{"status": "error"}`)
- Job schedulers with run history
- Worker registries with PID tracking
- File staleness and recovery

<img width="977" height="1202" alt="AgentFlow Alerts" src="https://github.com/user-attachments/assets/2d7556cb-82d1-4cd1-ace6-e3f8b5cac291" />

## What AgentFlow Detects

AgentFlow auto-detects the format of every JSON/JSONL file it finds:

| What it finds | What it does |
|---|---|
| File with `status: "error"` | Alerts you |
| Job scheduler with failed runs | Shows which jobs failed and why |
| Worker registry with PIDs | Shows which workers are running |
| File that stopped updating | Detects it's stale and alerts |
| File that was erroring and now works | Sends a recovery notification |

## Core Commands

Essential commands for monitoring and tracing:

**`agentflow watch`** — Background monitoring with alerts
```bash
agentflow watch ./data --alert-on error --notify telegram
```

**`agentflow live`** — Real-time terminal dashboard
```bash
agentflow live ./data
```

**`agentflow-dashboard`** — Web-based monitoring dashboard
```bash
npm install -g agentflow-dashboard
agentflow-dashboard --traces ./data --port 3000
# Opens at http://localhost:3000
```

**`agentflow run`** — Trace any command execution
```bash
agentflow run -- python my_agent.py
```

**`agentflow audit`** — OS-level process health check
```bash
# Detect stale PIDs, orphan processes, systemd crash loops
agentflow audit --process alfred --pid-file ./data/alfred.pid --systemd alfred.service
agentflow audit --process myagent --workers-file ./workers.json
```

## Process Audit

AgentFlow can audit the OS-level health of your agent processes — not just their trace output, but whether the actual processes are alive, correctly tracked, and not orphaned.

```typescript
import { auditProcesses, formatAuditReport } from 'agentflow-core';

const result = auditProcesses({
  processName: 'alfred',
  pidFile: '/home/user/.alfred/data/alfred.pid',
  workersFile: '/home/user/.alfred/data/workers.json',
  systemdUnit: 'alfred.service',
});

// Structured result for programmatic use
if (result.problems.length > 0) {
  console.error('Issues found:', result.problems);
}
if (result.orphans.length > 0) {
  console.error('Orphan processes:', result.orphans);
}

// Or print a formatted terminal report
console.log(formatAuditReport(result));
```

**What it detects:**
| Check | What it catches |
|---|---|
| PID file validation | Stale PIDs, PID reuse by unrelated processes |
| Systemd unit state | Crash loops, failed units, high restart counts |
| Workers registry | Workers declaring "running" but actually dead |
| PID mismatch | PID file disagrees with systemd MainPID (orphan outside systemd) |
| Orphan detection | Processes matching your agent name but not tracked anywhere |

## Programmatic Usage

```typescript
import { createGraphBuilder, withGuards } from 'agentflow-core';

// Build execution graphs with runtime guards
const builder = withGuards(createGraphBuilder({ agentId: 'my-agent' }), {
  maxDepth: 10,            // Prevent infinite nesting
  maxReasoningSteps: 25,   // Catch reasoning loops
  onViolation: 'warn'      // 'warn' | 'error' | 'abort'
});

const root = builder.startNode({ type: 'agent', name: 'main' });
// ... your agent logic ...
builder.endNode(root);
const graph = builder.build();
```

## How It Works

AgentFlow reads JSON files and detects patterns:

```javascript
{"status": "error", "lastError": "connection timeout"}
// → Agent in error state

{"jobs": [{"name": "digest", "lastRunStatus": "ok"}]}
// → Job scheduler with status

{"tools": {"worker1": {"pid": 1234, "status": "running"}}}
// → Worker registry with PIDs
```

Status normalization: `ok`/`success`/`completed` → healthy, `error`/`failed`/`crashed` → error.

## Enterprise Integration

### OpenTelemetry Export
Export AgentFlow traces to enterprise observability stacks:

```bash
npm install agentflow-otel
```

```typescript
import { setupAgentFlowOTel, exportGraphToOTel } from 'agentflow-otel';

// Export to Datadog, Grafana, Jaeger, Honeycomb
await setupAgentFlowOTel({
  serviceName: 'production-agents',
  backend: 'datadog',
  headers: { 'DD-API-KEY': process.env.DATADOG_API_KEY }
});

await exportGraphToOTel(graph);
```

**Enterprise benefits:**
- Follows OpenTelemetry GenAI semantic conventions
- LLM cost and token usage metrics in your existing dashboards
- Runtime guard violations as OTel events for alerting
- Unified observability across your agent fleet

## Development

```bash
git clone https://github.com/ClemenceChee/AgentFlow.git
cd AgentFlow
npm install
npm test            # 125+ tests passing
```

## License

MIT
