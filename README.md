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

LLM observability tools show you tokens in, tokens out, latency, cost. Beautiful dashboards of what the *model* did.

But your agents aren't stateless API calls. They're stateful processes that spawn subagents, call tools, branch on decisions, retry on failures, and run for hours. When something goes wrong, you need to see the **execution graph** — not a list of log lines.

**AgentFlow brings process mining to AI agents.** The same techniques that Celonis uses to find bottlenecks in enterprise workflows, applied to your agent infrastructure. Discover execution patterns, detect silent failures, and understand what your agents actually do — with zero dependencies and no LLM cost.

---

## How AgentFlow Is Different

Every AI observability tool tracks LLM calls. AgentFlow is the only one that treats agents as **graph-structured processes** and applies process mining to discover how they actually behave.

| Capability | AgentFlow | LangSmith | LangFuse | Arize Phoenix | Datadog LLM | MLflow | W&B Weave |
|-----------|:---------:|:---------:|:--------:|:-------------:|:-----------:|:------:|:---------:|
| LLM call logging | via OTel | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Execution graph tracing | ✅ | basic | basic | DAG-aware | basic | DAG | trace trees |
| **Process mining** | ✅ | — | — | — | — | — | — |
| **Variant discovery** | ✅ | — | — | — | — | — | — |
| **Bottleneck detection (P95)** | ✅ | — | — | — | — | — | — |
| **Conformance checking** | ✅ | — | — | — | — | — | — |
| **Adaptive runtime guards** | ✅ | — | — | — | — | — | — |
| **Organizational learning** | ✅ (Soma) | — | — | — | — | — | — |
| Framework-agnostic | ✅ | mostly LC | ✅ | ✅ | ✅ | ✅ | ✅ |
| Zero dependency core | ✅ | — | — | — | — | — | — |
| Self-hosted | ✅ | — | ✅ | ✅ | — | ✅ | — |
| No LLM cost for analysis | ✅ | — | — | — | — | — | — |

**The gap is clear:** existing tools log what happened. AgentFlow discovers *patterns* across hundreds of runs — which execution paths succeed, where failures cluster, and what guards should be enforced. No other tool does this.

**How the process mining works:** AgentFlow runs `discoverProcess()` across hundreds of traces to build a directly-follows process model, then `findVariants()` to cluster execution paths, `getBottlenecks()` to identify slow nodes statistically, and `checkConformance()` to score new runs against the baseline. This is industrial process mining (think Celonis) applied to AI agents. LangSmith, Arize, LangFuse — none of them do this. They show you one trace at a time and leave the pattern-finding to you.

### vs. LangSmith

LangSmith is a debugger — it helps you inspect *one* run. AgentFlow mines patterns across *thousands* of runs. LangSmith traces LLM calls; AgentFlow discovers that 73% of your runs take path A→B→C, but the 12% that take path A→D fail 80% of the time. LangSmith requires LangChain for best results; AgentFlow works with any framework. They're complementary — use LangSmith to debug a single failure, use AgentFlow to understand your system.

### vs. LangFuse

LangFuse is strong on LLM observability (token usage, latency, cost, prompt management) and is open-source/self-hosted. But it doesn't know about execution graphs, process mining, or runtime guards. AgentFlow adds the layer that LangFuse can't: behavioral analysis at the agent system level. Use LangFuse for LLM-level metrics, AgentFlow for agent-level intelligence.

### vs. Arize Phoenix

Phoenix excels at LLM evaluation (LLM-as-a-Judge, dataset curation from production failures). It has DAG-aware tracing but no process mining — it can show you one trace graph, but can't discover patterns across traces. AgentFlow does algorithmic variant analysis, conformance checking, and bottleneck detection that Phoenix doesn't attempt.

### vs. Datadog LLM Observability

Datadog added agentic AI monitoring in 2026 with cost insights and an AI Agents Console. It's enterprise-grade but expensive (~$0.10/1K tokens, scaling to thousands/day at volume). AgentFlow's process mining runs with zero LLM cost and zero per-token charges. Datadog doesn't do variant discovery, conformance checking, or adaptive guards.

### vs. MLflow

MLflow has evolved strong agent tracing (DAG support, multi-agent orchestration, Agent Server). But it's fundamentally an experiment tracker — it logs runs for comparison. AgentFlow mines across runs to discover process models, detect conformance drift, and enforce learned policies at runtime. MLflow shows you what happened; AgentFlow tells you what *should* happen.

### vs. W&B Weave

Weave provides trace trees with automatic cost/latency aggregation, tightly integrated with the W&B experiment tracking ecosystem. Like MLflow, it's observability — it watches. AgentFlow adds intelligence — it learns and adapts. Weave doesn't do process mining, variant discovery, or runtime policy enforcement.

### Can I use AgentFlow with these tools?

**Yes.** AgentFlow exports to OpenTelemetry (with a full `agentflow-otel` package supporting GenAI semantic conventions, presets for Datadog/Grafana/Honeycomb/Jaeger, cost tracking, and guard violation export). AgentFlow adds a layer (execution intelligence) that LLM-focused tools can't provide. Use them together.

---

## 30-Second Demo

```bash
npm install -g agentflow-core agentflow-dashboard

# Point at your agent's trace directory
agentflow-dashboard --traces ./traces --data-dir ./data

# Open http://localhost:3000
```
![AgentFlow_Gif](https://github.com/user-attachments/assets/afd356d4-2a65-4361-9330-63ce9bd30e0d)


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

<img width="2889" alt="AgentFlow Dashboard" src="https://github.com/user-attachments/assets/acd199cd-5064-44be-8deb-94bd2d101c63" />

### Process Mining — Variant Analysis & Bottleneck Detection
Discover execution patterns across hundreds of runs. See the happy path, find where failures cluster, identify the slowest steps.

<img width="3283" height="1551" alt="Screenshot 2026-03-20 154543" src="https://github.com/user-attachments/assets/fb6c910f-d163-44e1-a204-d4c195c5a71b" />


### Flame Chart — Nested Execution Timeline
Every node in the execution graph, positioned by actual time, colored by type. Hover for operation details. Failed nodes highlighted with error messages.

### Transcript — Chat Replay
User input on the right, agent actions on the left. See tool calls, thinking steps, and responses in a chat-bubble UI. Error messages from `state.error` and `metadata.error` surfaced directly.

### Intelligence — Organizational Learning (Soma)
Agent health overview, learned insights, auto-generated guard policies, and recommendations — powered by Soma's knowledge vault. See which agents are healthy, which are critical, and what the system has learned from execution history.

---

## Soma Intelligence (Preview)

> Agent systems have a memory problem. Each run starts fresh. Failures recur. Patterns go unnoticed. Soma fixes this.

Soma is AgentFlow's organizational intelligence layer. It accumulates knowledge across executions, discovers what works and what fails, and feeds that knowledge back into runtime guards — creating a **closed feedback loop** where agents get smarter over time.

**What Soma does:**
- Ingests execution traces and builds a knowledge vault
- Uses LLM analysis to extract insights, decisions, and constraints from real agent behavior
- Discovers failure patterns shared across agents (including cross-agent archetypes)
- Auto-generates guard policies based on what it learns
- Feeds learned policies back to AgentFlow's runtime guards via the PolicySource interface
- Stores everything in plain Markdown with YAML frontmatter — readable, greppable, git-diffable

**Real results from production data (17 agents, 1,229 executions):**
- 11 insights extracted (failure patterns, reliability trends, shared root causes)
- 4 guard policies auto-generated (failure rate thresholds, investigation priorities)
- 6 agents flagged as critical (>30% failure rate)
- Guards would have blocked 6 unreliable agents before they failed again

**The feedback loop:**
```
Agents execute → AgentFlow traces → Soma learns → Guards adapt → Agents improve
```

Soma is currently available as an early access preview. [Contact us](mailto:clemence.chee@gmail.com) for access.

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

**Everything above runs with zero LLM cost.** Optional Tier 2 adds LLM-powered analysis.

The guard system creates a closed feedback loop: `Traces → Mining → Guards → Better behavior → Traces`. Guards enforce runtime limits (max depth, max reasoning steps, spawn explosion, timeout) and adapt based on mined patterns — e.g., if P95 depth is 8, flag anything over 12. With Soma's policy bridge, guards also pull from accumulated organizational knowledge (failure rates, known bottlenecks, conformance scores). No competitor offers this kind of closed-loop enforcement.

### Knowledge Engine Tiers

| Tier | Name | What it adds | Status |
|------|------|-------------|:---:|
| 0 | System of Record | Trace storage, visualization, export | ✅ Shipped |
| 1 | **Statistical** | Process mining, variants, bottlenecks, conformance, adaptive guards | ✅ **Shipped** |
| 2 | Semantic | LLM-powered insight engine — "Why did this agent fail 3x today?" | ✅ Shipped |
| 3 | Compounding | Organizational intelligence, cross-domain learning (Soma) | ✅ Preview |

**Tier 1 is the differentiator.** Every other tool stops at Tier 0.

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

**Zero dependencies in core.** `agentflow-core` has zero npm dependencies — just TypeScript, `Map<string, ExecutionNode>`, and pure functions. This matters: dependency conflicts are a real blocker for adoption in agent codebases that already have heavy dependency trees.

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
| **High failure rate** | Agent failure rate exceeding learned threshold |

All detections work without LLM calls.

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
npm run docs:dev    # Start documentation site
```

### Monorepo Structure

```
packages/
├── core/           # Zero-dep library: types, graph builder, mining, guards, knowledge engine
├── dashboard/      # React dashboard + Express API + trace adapters + Intelligence tab
├── storage/        # SQLite storage and analytics
├── otel/           # OpenTelemetry exporter
└── python/         # Python integration
docs/               # Docusaurus documentation site
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
- [x] Intelligence tab with organizational learning (Soma)
- [x] Documentation site with API reference
- [ ] LangChain adapter (npm package)
- [ ] CrewAI adapter
- [ ] Live message flow visualization
- [ ] Session management with cost tracking

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
