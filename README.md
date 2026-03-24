# AgentFlow

[![CI](https://github.com/ClemenceChee/AgentFlow/actions/workflows/ci.yml/badge.svg)](https://github.com/ClemenceChee/AgentFlow/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/agentflow-core)](https://www.npmjs.com/package/agentflow-core)
[![License](https://img.shields.io/badge/License-Apache%202.0%20+%20Commons%20Clause-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](https://www.typescriptlang.org/)
[![Docs](https://img.shields.io/badge/docs-agentflow-blue)](https://clemencechee.github.io/AgentFlow/)

Process mining for AI agents. Build execution graphs, discover patterns across runs, detect failures, enforce runtime guards — zero dependencies, no LLM cost.

```
Your agent ran for 8 hours. The logs say "processing..." 4,000 times.
AgentFlow shows you the subagent 3 levels deep that silently hung at 2 AM.
```

---

## Quick Start

```bash
npm install agentflow-core
```

```typescript
import {
  createGraphBuilder,
  discoverProcess,
  findVariants,
  getBottlenecks,
  checkConformance,
} from 'agentflow-core';

// 1. Build execution graphs
const builder = createGraphBuilder({ agentId: 'my-agent', trigger: 'api-call' });
const root = builder.startNode({ type: 'agent', name: 'orchestrator' });
const tool = builder.startNode({ type: 'tool', name: 'web-search', parentId: root });
builder.endNode(tool);
builder.endNode(root);
const graph = builder.build();

// 2. Mine patterns across hundreds of runs
const model = discoverProcess(graphs);           // Directly-follows process model
const variants = findVariants(graphs);            // Execution path clusters
const bottlenecks = getBottlenecks(graphs);       // P95 duration hotspots
const conformance = checkConformance(graph, model); // How well does this run match the norm?

// 3. Enforce runtime guards
import { withGuards } from 'agentflow-core';

const guarded = withGuards(builder, {
  maxDepth: 10,
  maxReasoningSteps: 25,
  onViolation: 'warn',
  policySource,                  // Optional: adaptive thresholds from execution history
  policyThresholds: { maxFailureRate: 0.3, minConformance: 0.7 },
});
```

Zero npm dependencies. Just TypeScript, `Map<string, ExecutionNode>`, and pure functions.

### Dashboard

```bash
npm install -g agentflow-dashboard
agentflow-dashboard --traces ./traces
# Open http://localhost:3000
```

![AgentFlow_Gif](https://github.com/user-attachments/assets/afd356d4-2a65-4361-9330-63ce9bd30e0d)

9 interactive tabs: process map, flame chart, agent flow, transcript, metrics, dependencies, state machine, summary, and intelligence.

---

## What It Does

### Process Mining

Most observability tools show you one trace at a time. AgentFlow runs algorithmic analysis across your entire execution history:

- **`discoverProcess(graphs)`** — Builds a directly-follows graph from hundreds of executions. Same technique Celonis uses for enterprise workflows.
- **`findVariants(graphs)`** — Clusters execution paths. Discover that 73% of runs take path A→B→C, but the 12% taking A→D fail 80% of the time.
- **`getBottlenecks(graphs)`** — Finds nodes with high P95 duration. Your `web-search` tool takes 200ms normally but 8s in 5% of runs.
- **`checkConformance(graph, model)`** — Scores how closely a run follows the discovered process model. Detects unexpected transitions, missing steps, and low-frequency paths.

All of this runs without LLM calls. Pure algorithmic analysis.

### Runtime Guards

Guards protect running agents from common failure modes:

| Guard | What it catches |
|-------|----------------|
| Timeout | Node running longer than threshold per type |
| Reasoning loop | N consecutive same-type nodes in a chain |
| Spawn explosion | Graph depth or agent count exceeding limits |
| High failure rate | Agent failure rate above learned threshold |
| Conformance drift | Execution deviating from discovered patterns |
| Known bottleneck | Node flagged as slow from historical analysis |

Guards create a closed feedback loop: `Traces → Mining → Guards → Better behavior → Traces`. They adapt based on mined patterns — if P95 depth is 8, flag anything over 12. No static thresholds required.

### Knowledge Engine

Execution data accumulates into agent profiles with rolling statistics:

```typescript
const store = createKnowledgeStore();
const profile = store.getAgentProfile('my-agent');
// { totalRuns: 547, failureRate: 0.166, recentDurations: [...], knownBottlenecks: ['web-search'] }

// Feed profiles into guards for adaptive behavior
const policySource = createPolicySource(store);
```

Optional Tier 2 adds LLM-powered analysis (bring your own LLM):

```typescript
const engine = createInsightEngine(store, async (prompt) => myLlm.complete(prompt));
const analysis = await engine.explainFailures('my-agent');
// "The 3 recent failures share a root cause: the web-search tool times out when..."
```

### Failure Detection

| Detection | How |
|-----------|-----|
| Hung subagents | Parent waiting on child that never returns |
| Silent failures | Running indefinitely with no error |
| Stale PIDs | PID files pointing to dead processes |
| Orphan processes | Agents running outside your process manager |
| Conformance drift | Execution deviating from discovered patterns |

---

## Framework Support

AgentFlow works with any agent framework. Built-in adapters auto-discover traces from:

| Adapter | Formats | Ingestion |
|---------|---------|-----------|
| AgentFlow | JSON traces, JSONL sessions | File watcher |
| OpenClaw | Cron job runs, interactive sessions | File watcher |
| OpenTelemetry | OTLP spans (GenAI semantic conventions) | File watcher + HTTP `POST /v1/traces` |
| Custom | Implement `TraceAdapter` (~30 lines) | Plugin |

Any OTel-instrumented agent (LangChain, CrewAI, AutoGen, custom) can push traces to the built-in HTTP collector. AgentFlow also exports to OTel backends (Datadog, Grafana, Jaeger, Honeycomb) via the `agentflow-otel` package.

---

## How It Compares

AgentFlow occupies a different layer than most AI observability tools. LangSmith, LangFuse, Arize Phoenix, and Datadog LLM Observability track **LLM calls** — tokens, latency, cost, prompt quality. AgentFlow tracks **agent behavior** — execution graphs, process models, behavioral patterns, runtime enforcement.

| | LLM Observability Tools | AgentFlow |
|---|---|---|
| **Watches** | Model inputs/outputs | Agent execution graphs |
| **Analyzes** | Individual traces | Patterns across hundreds of runs |
| **Discovers** | Token usage, latency | Execution variants, bottlenecks, conformance |
| **Enforces** | — | Runtime guards that adapt from history |
| **Learns** | — | Organizational knowledge (Soma) |
| **LLM cost** | Per-event pricing | Zero (pure algorithmic) |

They're complementary — use LangFuse for LLM metrics, AgentFlow for agent system intelligence. AgentFlow exports to OTel so it feeds into your existing stack.

---

## Soma - Intelligence Tier (https://clemencechee.github.io/soma/) 

AgentFlow tells you what happened. Soma tells you what it means.

Soma is AgentFlow's organizational intelligence layer. Its worker cascade (Harvester → Reconciler → Synthesizer → Cartographer) ingests execution traces, synthesizes cross-agent patterns via LLM, and feeds learned policies back into AgentFlow guards through the PolicySource interface.

```
Agents execute → AgentFlow traces → Soma cascade → Knowledge vault → Policy Bridge → Guards adapt
```

**Production validated:** 6,870+ entities ingested, 15 L3 proposals synthesized from real data, governance loop tested end-to-end with evidence chains. Framework-agnostic via adapters (AgentFlow native + LangChain).

Soma is available as an early access preview. [Contact us](mailto:clemence.chee@gmail.com) for access.

---

## Architecture

```
Observe → Mine → Emit → Accumulate → Adapt
```

Each step is independently valuable. Use what you need:

| Tier | What it adds | LLM Required | Status |
|------|-------------|:---:|:---:|
| 0 — Record | Trace capture, storage, visualization, export | No | ✅ |
| 1 — Statistical | Process mining, variants, bottlenecks, conformance, adaptive guards | No | ✅ |
| 2 — Semantic | LLM-powered insight engine (failure analysis, anomaly explanation) | Yes (BYOL) | ✅ |
| 3 — Organizational | Cross-domain learning, knowledge vault, policy generation (Soma) | Yes (BYOL) | Preview |

---

## Multi-Agent Environments *(Optional)*

AgentFlow can monitor multiple agents across different frameworks and provide centralized operational control:

### External Trace Discovery

Monitor agents that create traces outside your main traces directory:

```json
{
  "discoveryPaths": [
    "~/.soma/traces",
    "~/other-agents/*/traces"
  ]
}
```

- **Zero configuration**: Automatically discovers JSON trace files
- **Real-time updates**: File system watching for new/modified traces
- **Agent detection**: Automatically identifies agents from paths and filenames
- **Framework agnostic**: Works with any agent that outputs JSON execution traces

### External Command Execution

Trigger agent operations directly from the AgentFlow dashboard:

```json
{
  "externalCommands": {
    "commands": {
      "soma-harvest": {
        "name": "SOMA Harvester",
        "command": "soma",
        "args": ["harvest"],
        "description": "Scan inbox and ingest documents"
      }
    }
  }
}
```

- **Security-first**: Explicit allowlist of pre-configured commands only
- **Audit logging**: All executions logged with timestamps and results
- **Resource limits**: Timeouts, concurrency controls, and sandboxed execution
- **Real-time monitoring**: Live execution status and log streaming

### SOMA Integration

First-class integration with [SOMA](https://github.com/ClemenceChee/soma) (Structured Organizational Memory Architecture):

- **Enhanced traces**: Operational context from SOMA vault data
- **Manual triggers**: Start SOMA workers (harvest, synthesize, reconcile, cartograph)
- **Governance dashboard**: Agentic governance controls and meta-learning visibility
- **Operational intelligence**: Multi-layer dashboard combining execution and organizational data

**All external features are completely optional.** AgentFlow works perfectly for single-agent setups without any external configuration.

---

## Packages

```
packages/
├── core/           Zero-dep library: graph builder, process mining, guards, knowledge engine
├── dashboard/      React dashboard + Express API + trace adapters (9 tabs)
├── storage/        SQLite storage and analytics
├── otel/           OpenTelemetry exporter (Datadog, Grafana, Honeycomb, Jaeger presets)
└── python/         Python integration (context managers, multi-agent support)
docs/               Documentation site (Docusaurus + TypeDoc API reference)
```

## Development

```bash
git clone https://github.com/ClemenceChee/AgentFlow.git
cd AgentFlow
npm install
npm test            # 500+ tests
npm run build       # All packages
npm run typecheck   # Strict TypeScript
npm run lint        # Biome
npm run docs:dev    # Documentation site
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for full development setup and PR guidelines.

## Security

Report vulnerabilities responsibly — see [SECURITY.md](SECURITY.md). Do not open public issues for security reports.

---

## License

Apache 2.0 with Commons Clause — See [LICENSE](LICENSE) for details.

Commercial licensing available — contact clemence.chee@gmail.com

---

<p align="center">
  <b>Built by <a href="https://0xclemo.substack.com">Clemence Chee</a>.</b><br/>
  Running in production 24/7 since 2025. Monitoring 20+ agents across multiple frameworks.
</p>
