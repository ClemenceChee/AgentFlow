# AgentFlow

[![npm version](https://img.shields.io/npm/v/agentflow-core)](https://www.npmjs.com/package/agentflow-core)
[![License](https://img.shields.io/badge/License-Apache%202.0%20+%20Commons%20Clause-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](https://www.typescriptlang.org/)
[![Docs](https://img.shields.io/badge/docs-agentflow-blue)](https://clemencechee.github.io/AgentFlow/)

**Process mining for AI agents. See what your agents actually do — not just what they log.**

```
Your agent ran for 8 hours. The logs say "processing..." 4,000 times.
AgentFlow shows you the subagent 3 levels deep that silently hung at 2 AM.
```

---

## The Problem

LangSmith and Langfuse show you tokens in, tokens out, latency, cost. Beautiful dashboards of what the *model* did.

But your agents aren't stateless API calls. They're stateful processes that spawn subagents, call tools, branch on decisions, retry on failures, and run for hours. When something goes wrong, you need to see the **execution graph** — not a list of log lines.

**AgentFlow brings process mining to AI agents.** The same techniques that Celonis uses to find bottlenecks in enterprise workflows, applied to your agent infrastructure. Discover execution patterns, detect silent failures, and understand what your agents actually do — with zero dependencies and no LLM cost.

---

## 30-Second Demo

```bash
npm install -g agentflow-core agentflow-dashboard

# Point at your agent's trace directory
agentflow-dashboard --traces ./traces --data-dir ./data

# Open http://localhost:3000
```

That's it. AgentFlow auto-discovers your agents, parses their traces, and shows you:

- **Process maps** — directed-follows graphs showing how your agents execute, with bottleneck heatmaps
- **Variant analysis** — discover your happy path vs failure paths across thousands of runs
- **Flame charts** — nested execution timeline showing exactly where time is spent
- **Agent clustering** — automatic grouping by system, purpose, and role
- **Silent failure detection** — hung subagents, orphan processes, stale PIDs, reasoning loops

### Framework Agnostic

AgentFlow works with any agent framework. Built-in adapters for:

| Adapter | What it ingests | How |
|---------|----------------|-----|
| **AgentFlow** | JSON traces, JSONL sessions, systemd logs | File watcher |
| **OpenClaw** | Cron job runs, interactive sessions | File watcher |
| **OpenTelemetry** | OTLP JSON spans (GenAI semantic conventions) | File watcher + HTTP `POST /v1/traces` |
| **Custom** | Implement `TraceAdapter` interface (~30 lines) | Plugin |

Any OTel-instrumented agent (LangChain, CrewAI, AutoGen, custom) can push traces to AgentFlow's HTTP collector.

---

## What You See

### Dashboard — Agent Overview with Process Health
Service health, agent cards grouped by system, execution sparklines, failure indicators — all on one page.

<!-- TODO: Replace with new React dashboard screenshot -->
<img width="2889" alt="AgentFlow Dashboard" src="https://github.com/user-attachments/assets/acd199cd-5064-44be-8deb-94bd2d101c63" />

### Process Mining — Variant Analysis & Bottleneck Detection
Discover execution patterns across hundreds of runs. See the happy path, find where failures cluster, identify the slowest steps.

<img width="2879" alt="AgentFlow Process Mining" src="https://github.com/user-attachments/assets/fa1fd4f1-41bf-4506-9a5d-342ed84243de" />

### Flame Chart — Nested Execution Timeline
Every node in the execution graph, positioned by actual time, colored by type. Hover for operation details. Failed nodes highlighted with callouts.

### Transcript — Chat Replay
User input on the right, agent actions on the left. See tool calls, thinking steps, and responses in a chat-bubble UI.

---

## Why AgentFlow Exists

Last year I woke up to find my portfolio reconciliation agent had been running for **eight hours straight**. It should have taken ten minutes.

The logs showed no errors. Just a steady stream of "processing..." messages repeating since 2 AM. The culprit? A subagent three levels deep that spawned a data fetcher which never returned. The parent was waiting. Forever.

I spent 48+ hours debugging: config files overriding each other, model names that must be spelled exactly one way, CLI tools requiring parameters in a specific order. Three bugs, zero error messages.

**Silent failures don't announce themselves — they just consume your compute budget while producing nothing.**

Existing tools couldn't help because they treat agents like stateless functions. AgentFlow treats them like what they are: long-running, hierarchical, graph-structured processes.

---

## Architecture

```
Observe → Mine → Emit → Accumulate → Adapt
```

Each step is independently valuable. Use what you need:

| Step | What it does | LLM Required |
|------|-------------|:---:|
| **Observe** | Execution graph tracing, failure detection | No |
| **Mine** | Process model discovery, variant analysis, bottleneck detection | No |
| **Emit** | Event emission for external integration | No |
| **Accumulate** | Knowledge store with agent profiles, rolling stats | No |
| **Adapt** | Adaptive guards that learn from execution history | No |

**Everything above runs with zero LLM cost.** This is Tier 1 — shipped and production-ready.

### Knowledge Engine Tiers

| Tier | Name | What it adds | Status |
|------|------|-------------|:---:|
| 0 | System of Record | Trace storage, visualization, export | ✅ Shipped |
| 1 | **Statistical** | Process mining, variants, bottlenecks, conformance, adaptive guards | ✅ **Shipped** |
| 2 | Semantic | LLM-powered insight engine — "Why did this agent fail 3x today?" | ✅ Shipped |
| 3 | Compounding | Cross-domain knowledge transfer, organizational learning | 🔜 Planned |

**Tier 1 is the differentiator.** LangSmith and Langfuse stop at Tier 0. AgentFlow ships Tier 1 out of the box.

---

## Programmatic Usage

```typescript
import {
  createGraphBuilder,
  withGuards,
  createKnowledgeStore,
  createInsightEngine,
  discoverProcess,
  findVariants,
  getBottlenecks,
} from 'agentflow-core';

// Build execution graphs with runtime guards
const builder = withGuards(
  createGraphBuilder({ agentId: 'my-agent', trigger: 'api-call' }),
  { maxDepth: 10, maxReasoningSteps: 25, onViolation: 'warn' }
);

const root = builder.startNode({ type: 'agent', name: 'main' });
const tool = builder.startNode({ type: 'tool', name: 'search', parentId: root });
builder.endNode(tool);
builder.endNode(root);
const graph = builder.build();

// Process mining across multiple runs
const model = discoverProcess(graphs);        // Directly-follows graph
const variants = findVariants(graphs);         // Execution path analysis
const bottlenecks = getBottlenecks(graphs);    // P95 duration hotspots

// Tier 2: LLM-powered insights (bring your own LLM)
const store = createKnowledgeStore();
const engine = createInsightEngine(store, async (prompt) => myLlm.complete(prompt));
const analysis = await engine.explainFailures('my-agent');
console.log(analysis.content); // "The 3 recent failures share a root cause..."
```

**Zero dependencies in core.** Just TypeScript, `Map<string, ExecutionNode>`, and pure functions.

---

## What AgentFlow Detects

| Detection | How |
|-----------|-----|
| **Hung subagents** | Parent waiting on child that never returns |
| **Reasoning loops** | N consecutive same-type nodes (configurable) |
| **Spawn explosions** | Graph depth exceeding limits |
| **Silent failures** | "Processing..." forever with no error |
| **Stale PIDs** | PID files pointing to dead processes |
| **Orphan processes** | Agents running outside your process manager |
| **Conformance drift** | Execution deviating from discovered patterns |
| **Bottlenecks** | Steps with P95 duration above threshold |

All detections work at Tier 1 — no LLM required.

---

## Adapter System

Write a custom adapter in ~30 lines:

```typescript
import type { TraceAdapter, NormalizedTrace } from 'agentflow-dashboard';

class MyFrameworkAdapter implements TraceAdapter {
  name = 'my-framework';

  detect(dirPath: string): boolean {
    // Return true if this directory contains your framework's traces
    return existsSync(join(dirPath, 'my-framework.json'));
  }

  canHandle(filePath: string): boolean {
    return filePath.endsWith('.my-trace');
  }

  parse(filePath: string): NormalizedTrace[] {
    // Read your format, return normalized traces
    const data = JSON.parse(readFileSync(filePath, 'utf-8'));
    return [{ id: data.id, agentId: data.agent, nodes: {...}, ... }];
  }
}
```

Register it and the dashboard auto-discovers your traces.

---

## OTel Collector

Any OpenTelemetry-instrumented agent can push traces directly:

```bash
# Push traces from any OTel SDK
curl -X POST http://localhost:3000/v1/traces \
  -H "Content-Type: application/json" \
  -d '{"resourceSpans": [...]}'
```

AgentFlow maps GenAI semantic conventions (`gen_ai.chat`, `gen_ai.usage.*`) to its execution graph model. Your LangChain or CrewAI agent's spans become AgentFlow nodes with process mining superpowers.

---

## Development

```bash
git clone https://github.com/ClemenceChee/AgentFlow.git
cd AgentFlow
npm install
npm test            # 400+ tests
npm run build       # Build all packages
npm run typecheck   # Zero errors
```

### Monorepo Structure

```
packages/
├── core/           # Zero-dep library: types, graph builder, mining, guards, knowledge engine
├── dashboard/      # React dashboard + Express API + trace adapters
└── otel/           # OpenTelemetry exporter (AgentFlow → OTel backends)
```

---

## Roadmap

- [x] Execution graph tracing with runtime guards
- [x] Process mining (DFG, variants, bottlenecks, conformance)
- [x] Knowledge store with agent profiles and adaptive guards
- [x] Insight engine (Tier 2 — LLM-powered analysis)
- [x] React dashboard with process mining visualizations
- [x] Universal adapter system (AgentFlow, OpenClaw, OTel)
- [x] HTTP trace collector (OTLP-compatible)
- [x] Agent clustering and deduplication
- [ ] Live message flow visualization
- [ ] Session management with cost tracking
- [ ] Scheduled job monitoring
- [ ] Real-time log streaming
- [ ] Organizational intelligence layer

---

## License

Apache 2.0 with Commons Clause — See [LICENSE](LICENSE) for details.

**Commercial licensing available** — contact clemence.chee@gmail.com for enterprise licenses, support, and custom integrations.

---

<p align="center">
  <b>Built by <a href="https://0xclemo.substack.com">Clemence Chee</a>.</b><br/>
  Running in production 24/7 since 2025. Monitoring 20+ agents across multiple frameworks.<br/><br/>
  <i>Process mining changed how enterprises understand their workflows.<br/>
  AgentFlow brings the same intelligence to AI agent systems.</i>
</p>
