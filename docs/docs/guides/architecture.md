---
sidebar_position: 1
title: Architecture
---

# Architecture

AgentFlow is a TypeScript monorepo that brings process mining to AI agent systems. It treats agents as what they actually are — long-running, hierarchical, graph-structured processes — rather than stateless API calls.

## The Core Problem

Standard observability tools record tokens in, tokens out, and latency. That works for stateless services. It fails for agents that spawn subagents, retry on failures, call tools in loops, and run for hours. When an agent silently hangs, logs show nothing wrong. You need the **execution graph**.

## Intelligence Tiers

AgentFlow is organized into four tiers of intelligence. Each tier adds capability without requiring the tier above it.

```
┌─────────────────────────────────────────────────────────────────────┐
│  Tier 4  │  Organizational Intelligence (Soma)  │  Planned          │
│          │  Cross-team learning, org topology   │                   │
├─────────────────────────────────────────────────────────────────────┤
│  Tier 3  │  Runtime Intelligence                │  Planned          │
│          │  Compounding knowledge transfer      │                   │
├─────────────────────────────────────────────────────────────────────┤
│  Tier 2  │  Pattern Intelligence                │  Shipped          │
│          │  LLM-powered insight engine          │                   │
├─────────────────────────────────────────────────────────────────────┤
│  Tier 1  │  Structural Intelligence             │  Shipped          │
│          │  Process mining, variants, guards    │                   │
├─────────────────────────────────────────────────────────────────────┤
│  Tier 0  │  Trace Capture                       │  Shipped          │
│          │  Graph building, storage, dashboard  │                   │
└─────────────────────────────────────────────────────────────────────┘
```

### Tier 0 — Trace Capture

The foundation. Captures agent execution as a directed graph of nodes: agents, subagents, tool calls, reasoning steps, and decisions. Each node records type, start time, end time, status, and optional metadata.

LangSmith and Langfuse operate here. AgentFlow uses Tier 0 as a launchpad for higher tiers.

Key exports: `createGraphBuilder`, `graphToJson`, `loadGraph`, `toAsciiTree`, `toTimeline`

### Tier 1 — Structural Intelligence

No LLM required. Pure statistical analysis over collections of execution graphs.

- **Process model discovery** — Build a directly-follows graph from hundreds of runs. See the most common execution paths.
- **Variant analysis** — Cluster executions by their node-type sequence. Identify the happy path, failure variants, and edge-case paths.
- **Bottleneck detection** — Find nodes with P95 durations above threshold.
- **Conformance checking** — Detect when live executions deviate from discovered patterns.
- **Adaptive guards** — Runtime checks that enforce safety limits (max depth, max reasoning steps, loop detection).
- **Knowledge store** — Persistent agent profiles that accumulate statistics across runs, enabling guards to adapt.

Key exports: `discoverProcess`, `findVariants`, `getBottlenecks`, `checkConformance`, `withGuards`, `createKnowledgeStore`

### Tier 2 — Pattern Intelligence

Bring your own LLM. The insight engine takes the structured output of Tier 1 and uses an LLM to generate natural-language analysis.

```typescript
const store = createKnowledgeStore();
const engine = createInsightEngine(store, async (prompt) => myLlm.complete(prompt));
const analysis = await engine.explainFailures('my-agent');
// "The 3 recent failures share a root cause: the search tool times out when..."
```

The LLM is used only for explanation, not for detection. Detection stays at Tier 1, which means zero LLM cost for the core intelligence.

Key exports: `createInsightEngine`, `buildFailureAnalysisPrompt`, `buildAnomalyExplanationPrompt`, `buildFixSuggestionPrompt`

### Tier 3 — Runtime Intelligence (Planned)

Cross-domain knowledge transfer. Patterns discovered in one agent system inform the guards and policies of another. Organizational learning that compounds over time.

### Tier 4 — Organizational Intelligence / Soma (Planned)

A separate product layer — Soma — that represents the full organizational topology: teams, systems, strategies, data assets. AgentFlow feeds execution intelligence upward into organizational awareness.

---

## Data Flow

```
Agent code
    │
    │  builder.startNode() / builder.endNode()
    ▼
ExecutionGraph (in-memory Map<string, ExecutionNode>)
    │
    ├─── Writer ──────────────────────► JSON trace files on disk
    │                                         │
    ├─── EventEmitter ──────────────► External systems (webhooks, queues)
    │                                         │
    └─── OTel Exporter ─────────────► Datadog / Grafana / Jaeger
                                              │
                                   ┌──────────▼──────────┐
                                   │   agentflow-storage  │
                                   │   (SQLite)           │
                                   └──────────┬──────────┘
                                              │
                                   ┌──────────▼──────────┐
                                   │  Process Mining      │
                                   │  discoverProcess()   │
                                   │  findVariants()      │
                                   │  getBottlenecks()    │
                                   └──────────┬──────────┘
                                              │
                                   ┌──────────▼──────────┐
                                   │  Knowledge Store     │
                                   │  Agent profiles      │
                                   │  Rolling stats       │
                                   └──────────┬──────────┘
                                              │
                                   ┌──────────▼──────────┐
                                   │  Dashboard           │
                                   │  (React SPA)         │
                                   └─────────────────────┘
```

---

## The Feedback Loop

The architecture forms a closed feedback loop:

1. **Traces** — Execution graphs captured in real time
2. **Mining** — Process models and variants discovered from historical traces
3. **Guards** — Runtime limits derived from mined patterns (e.g., if the P95 depth is 8, flag anything over 12)
4. **Better behavior** — Guards prevent runaway agents before they consume hours of compute

```
Traces ──► Mining ──► Guards ──► Better behavior ──► Traces
   ▲                                                      │
   └──────────────────────────────────────────────────────┘
```

This loop operates entirely at Tier 1 — no LLM, no cost.

---

## Design Philosophy

### Zero dependencies in core

`agentflow-core` has no runtime dependencies. The graph model is `Map<string, ExecutionNode>` and pure TypeScript functions. This keeps it embeddable in any agent without dependency conflicts.

### Closure factories, not classes

The public API uses factory functions (`createGraphBuilder`, `createKnowledgeStore`) that return plain objects. This makes the API easy to mock, easy to tree-shake, and avoids prototype chain surprises.

### Framework-agnostic by default

AgentFlow does not know about LangChain, CrewAI, or AutoGen. It knows about nodes: `agent`, `subagent`, `tool`, `reasoning`, `decision`. Adapters translate framework-specific events into those node types.

### Incremental adoption

Each tier is independently valuable. You can use only `createGraphBuilder` + the dashboard and get immediate value. Process mining, guards, and the insight engine are opt-in.

---

## Monorepo Structure

```
packages/
├── core/        Zero-dep library: types, graph builder, mining, guards, knowledge engine
├── dashboard/   React dashboard + Express API + trace adapters + file watcher
├── otel/        OpenTelemetry exporter (AgentFlow → OTel backends)
├── storage/     SQLite persistence and analytics
└── python/      Python bindings via subprocess
```

Each package is independently installable from npm.

---

## What AgentFlow Detects

All detections run at Tier 1 — no LLM required.

| Detection | Mechanism |
|-----------|-----------|
| Hung subagents | Parent node waiting on child that never calls `endNode` |
| Reasoning loops | N consecutive same-type nodes (configurable threshold) |
| Spawn explosions | Graph depth exceeding `maxDepth` guard |
| Silent failures | Nodes that never transition out of `running` status |
| Stale PIDs | PID files pointing to dead OS processes |
| Orphan processes | Agent processes running outside your process manager |
| Conformance drift | Live execution path deviating from mined process model |
| Bottlenecks | Nodes with P95 duration above detected threshold |
