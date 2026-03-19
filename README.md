# AgentFlow

**Process mining for AI agent systems — Know when your agents break, fix them before users notice.**

## What is this?

AgentFlow monitors AI agent infrastructure (LangChain, CrewAI, AutoGen, custom agents) and alerts you when something fails. Point it at a directory of JSON state files and it auto-detects what's healthy and what isn't. Zero config required.

## Quick Start

```bash
# Install both CLI and web dashboard
npm install -g agentflow-core@latest agentflow-dashboard@latest

# Real-time terminal dashboard (alternate screen, no flicker)
agentflow live ./data ./traces --refresh 5

# Web dashboard with process health monitoring
agentflow-dashboard --traces ./traces --data-dir ./data

# Watch for failures and get alerts
agentflow watch ./data --notify telegram

# Audit OS processes for stale PIDs, orphans, systemd issues
agentflow audit ./data

# Trace any command execution
agentflow run -- python my_agent.py
```

## Monitoring Options

### Web Dashboard (Recommended)
Rich web interface with real-time WebSocket updates:
```bash
agentflow-dashboard --traces ./traces --data-dir ./data --host 0.0.0.0 --port 3000
# Open http://localhost:3000
```
- **7 tabs**: Timeline, Metrics, Dependency Graph, Error Heatmap, State Machine, Summary, Transcript
- **Cytoscape.js interactive graph** — execution trees with nodes colored by status, shaped by type, clickable for details
- **Session timeline** — color-coded event stream with type badges, duration bars, token counts
- **Transcript view** — chat-bubble UI for session conversations (user/assistant/tool/thinking)
- **Token & cost tracking** — per-session token usage and USD cost from LLM API calls
- **Multi-directory scanning** — watches JSON traces + JSONL session logs across multiple directories
- **Process health panel** — PID files, systemd state, worker liveness dots, orphan detection (excludes child processes)
- **Auto-refreshes via WebSocket** — no polling, no flicker
- **Dark GitHub theme** — responsive (desktop + mobile)

### Terminal Dashboard
Fast, lightweight terminal interface for SSH and headless use:
```bash
agentflow live ./data ./traces -R --refresh 5
```
- Alternate screen buffer — clean dedicated screen, no scrollback pollution
- Auto-discovers PID files, worker registries, and systemd units
- Process health with orphan details inline
- Sparkline activity chart, distributed trace trees
- Ctrl+C cleanly restores terminal

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

**`agentflow live`** — Real-time terminal dashboard (alternate screen, no flicker)
```bash
agentflow live ./data ./traces -R
```

**`agentflow-dashboard`** — Web dashboard with process health
```bash
agentflow-dashboard --traces ./traces --data-dir ./data --port 3000
```

**`agentflow run`** — Trace any command execution
```bash
agentflow run -- python my_agent.py
```

**`agentflow audit`** — OS-level process health check
```bash
agentflow audit ./data                          # auto-discover from directory
agentflow audit --process myagent --systemd myagent.service
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

## Knowledge Engine

AgentFlow includes a multi-tier knowledge engine that compounds intelligence over time:

| Tier | Name | Description | LLM Required |
|------|------|-------------|:---:|
| 0 | System of Record | Log traces, visualize trees, export JSON | No |
| 1 | Statistical | Process mining, variant analysis, bottleneck detection, conformance checking, adaptive guards | No |
| 2 | Semantic | LLM-powered pattern analysis, natural language insights, anomaly explanation | Yes (user-provided) |

**Tier 1** ships out of the box — statistical intelligence with zero dependencies and no LLM cost.

**Tier 2** adds an LLM-powered insight engine. You provide the LLM function, AgentFlow provides the prompts and knowledge structure:

```typescript
import { createKnowledgeStore, createInsightEngine } from 'agentflow-core';

const store = createKnowledgeStore({ baseDir: '.agentflow/knowledge' });

// Wrap any LLM as a simple function
const engine = createInsightEngine(store, async (prompt) => {
  return await myLlm.complete(prompt);
});

// Natural language analysis from accumulated execution data
const failures = await engine.explainFailures('my-agent');
console.log(failures.content);  // "The 3 recent failures share a common root cause..."

const summary = await engine.summarizeAgent('my-agent');
const fixes   = await engine.suggestFixes('my-agent');
const anomaly = await engine.explainAnomaly('my-agent', event);
```

Results are cached automatically — same underlying data won't trigger redundant LLM calls.

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
npm test            # 400+ tests passing
```

## License

MIT
