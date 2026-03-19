# AgentFlow — Architecture & Product Theory

## The Thesis

Modern AI agent systems have an observability problem. Tools like LangSmith and Langfuse are **systems of record** — they capture logs, traces, and metrics. But logs are linear. They tell you what happened, not what it means.

AgentFlow is a **system of activities**. It doesn't just record what agents do — it reconstructs execution graphs, mines patterns across runs, accumulates knowledge, and feeds learned policies back to agents. Agents get smarter over time, out of the box.

The insight: process mining (a discipline from industrial engineering) applied to AI agent execution creates a feedback loop that compounds. Every run teaches the system something. Statistical patterns emerge. Bottlenecks surface. Conformance drifts get caught. Guards adapt.

`npm install agentflow` gives you the full loop. No external infrastructure. No database. No LLM required (Tier 1). Just a library that observes, learns, and enforces.

## Two-System Architecture

```
                        ┌──────────────────────────────────────────────┐
                        │              AgentFlow                       │
                        │         Execution Intelligence               │
                        │                                              │
  Any Agent Framework ──┤  Observe → Mine → Emit → Accumulate → Adapt │
  (LangChain, CrewAI,  │                                              │
   Mastra, OpenClaw,   │  Built-in knowledge engine (Tier 1-3)        │
   custom)             │  Zero dependencies. Filesystem only.         │
                        └──────────────┬───────────────────────────────┘
                                       │ Events (optional)
                                       ▼
                        ┌──────────────────────────────────────────────┐
                        │                Soma                          │
                        │       Organizational Intelligence            │
                        │                                              │
                        │  Curator → Janitor → Distiller → Surveyor   │
                        │                                              │
                        │  Understands: OKRs, decisions, metrics,      │
                        │  business rules, domain knowledge, agents    │
                        └──────────────────────────────────────────────┘
```

**AgentFlow** is the execution layer. It's a library imported into agent runtimes. It captures execution graphs, mines patterns, accumulates knowledge, and provides adaptive guards. Self-contained — works without Soma.

**Soma** is the organizational layer. It's a separate intelligence system (formerly Alfred) that understands business context — strategy, decisions, constraints, metrics, people, systems. When connected to AgentFlow, it provides the "why" behind the "what": Soma teaches AgentFlow what "better" looks like based on accumulated organizational context.

Together they form the **feedback loop**: AgentFlow emits execution events → Soma ingests and synthesizes with business context → learned policies feed back to AgentFlow guards → agents improve.

## The Feedback Loop (Core)

```
┌─────────┐     ┌──────┐     ┌──────┐     ┌─────────────┐     ┌───────┐
│ Observe │ ──▶ │ Mine │ ──▶ │ Emit │ ──▶ │ Accumulate  │ ──▶ │ Adapt │
│         │     │      │     │      │     │             │     │       │
│ Graph   │     │ DFG  │     │ Exec │     │ Knowledge   │     │ Guard │
│ Builder │     │ Var. │     │ Pat. │     │ Store       │     │ Policy│
│         │     │ Bot. │     │ Events│    │ Profiles    │     │Source │
└─────────┘     └──────┘     └──────┘     └─────────────┘     └───────┘
```

Each step is independently valuable. You can use AgentFlow just for tracing (Observe). Add process mining for cross-run analytics (Mine). Add event emission for external integration (Emit). Add the knowledge store for self-improving agents (Accumulate + Adapt). Each layer builds on the previous.

## Knowledge Engine Tiers

| Tier | Name | Description | LLM Required | Status |
|------|------|-------------|:---:|:---:|
| 0 | System of Record | Log traces, visualize trees, export JSON | No | Shipped |
| 1 | Statistical | Process mining, variant analysis, bottleneck detection, conformance checking, agent profiles, adaptive guards | No | Shipped |
| 2 | Semantic | LLM-powered pattern analysis, natural language insights, anomaly explanation | Yes (user-provided) | Planned |
| 3 | Compounding | Cross-domain knowledge transfer, archetype discovery, policy generation, organizational learning | Yes + Soma | Planned |

**Tier 1 is the differentiator.** LangSmith/Langfuse stop at Tier 0. AgentFlow ships Tier 1 out of the box — statistical intelligence that compounds over time, with zero dependencies and no LLM cost.

**Tier 2** adds an LLM-powered analysis layer. The user provides the LLM function (`string in → string out`), AgentFlow provides the prompts and knowledge structure. Think: "Why did this agent fail 3x today?" answered in natural language from accumulated execution data.

**Tier 3** is the full vision — Soma provides organizational context, and the system discovers cross-domain patterns (archetypes) that transfer knowledge between agents, teams, and processes. This is where it becomes an operating system, not a library.

## AgentFlow Architecture (packages/core)

### Module Map

```
packages/core/src/
├── types.ts              # All interfaces — ExecutionGraph, ExecutionNode, AgentProfile,
│                         #   PolicySource, KnowledgeStore, EventWriter, etc.
├── graph-builder.ts      # createGraphBuilder() — closure-based, counter IDs, deep-freeze on build
├── graph-query.ts        # 11 pure query functions — getStats, getCriticalPath, getFailures, etc.
├── graph-stitch.ts       # Distributed trace linking — stitchTrace, groupByTraceId
├── loader.ts             # loadGraph() / graphToJson() — handles all serialization formats
│
├── process-mining.ts     # getPathSignature, discoverProcess, findVariants,
│                         #   getBottlenecks, checkConformance
│
├── event-emitter.ts      # createExecutionEvent, createPatternEvent, createEventEmitter
├── json-event-writer.ts  # EventWriter → individual JSON files
├── soma-event-writer.ts  # EventWriter → Curator-compatible Markdown (optional adapter)
│
├── knowledge-store.ts    # createKnowledgeStore() — append-only event log, profile derivation,
│                         #   queries, compaction. Implements EventWriter.
├── policy-source.ts      # createPolicySource(store) — read interface for adaptive guards
├── guards.ts             # checkGuards, withGuards — static + policy-derived violations
│
├── visualize.ts          # toAsciiTree(), toTimeline() — terminal visualization
├── trace-store.ts        # createTraceStore() — raw graph persistence
├── live.ts               # startLive() — real-time monitoring
├── watch.ts              # startWatch() — headless alerting
├── runner.ts             # runTraced() — CLI execution wrapper
├── process-audit.ts      # System process discovery
└── index.ts              # 48 exports (15 functions + 33 types)
```

### Design Principles

1. **Zero dependencies in core.** `Map<string, ExecutionNode>` for nodes, counter-based IDs, no crypto. Uses only `node:fs`, `node:path`, `node:util`.
2. **Pure functions everywhere.** All query, mining, and event creation functions are pure. Side effects only at boundaries (file writes via Writers).
3. **Closure-based factories, not classes.** `createGraphBuilder()`, `createKnowledgeStore()`, `createPolicySource()` — clean API surface, testable, composable.
4. **Deep freeze on build.** `build()` returns a deeply frozen `ExecutionGraph`. No accidental mutation.
5. **Library, not service.** Imported into agent runtime. Zero network overhead. No separate process.
6. **Human-readable by design.** Every trace opens in a text editor. Git log shows what changed.

### Extension Points

| Extension | Direction | Interface | Purpose |
|-----------|-----------|-----------|---------|
| **Adapters** | Inbound | `Adapter` | Translate framework events into graph builder calls |
| **Writers** | Outbound | `Writer` / `EventWriter` | Output to any target (JSON, Markdown, DB, API) |
| **PolicySource** | Feedback | `PolicySource` | Feed knowledge from any system into guards |
| **KnowledgeStore** | Storage | `KnowledgeStore` | Swap the built-in filesystem store for custom backends |

### Knowledge Store Layout

```
.agentflow/knowledge/
├── events/{agentId}/{YYYY-MM-DD}/{eventType}-{timestamp}-{seq}.json
├── patterns/{agentId}/{timestamp}-{seq}.json
└── profiles/{agentId}.json          # Derived: rolling stats per agent
```

- **Events** are append-only, date-partitioned.
- **Profiles** are derived aggregates, recomputed atomically on every event write.
- **Compaction** removes old events while preserving profiles.

### Adaptive Guards

Guards start static (maxDepth, timeouts, reasoning-loop detection) and become adaptive when a `PolicySource` is provided:

| Violation | Source | Trigger |
|-----------|--------|---------|
| `timeout` | Static | Node exceeds type-specific timeout |
| `reasoning-loop` | Static | N consecutive same-type nodes |
| `spawn-explosion` | Static | Graph depth or agent count exceeds limit |
| `high-failure-rate` | Policy | Agent's recent failure rate > threshold (default 50%) |
| `conformance-drift` | Policy | Conformance score dropped below threshold (default 70%) |
| `known-bottleneck` | Policy | Running node is a known bottleneck (informational) |

## Soma Architecture (Planned)

Soma is the organizational intelligence layer — the "cell body that decides what to fire." It processes signals from all sources (agents, humans, systems) into structured, queryable knowledge.

### Workers

| Worker | Interval | Purpose |
|--------|----------|---------|
| **Curator** | 60s | Ingest raw files from inbox → create entities with metadata |
| **Janitor** | 300s | Maintain wikilinks, fill missing fields, fix broken references |
| **Distiller** | 600s | Extract assumptions, decisions, contradictions, insights (LLM) |
| **Surveyor** | 3600s | Embed records, cluster by similarity, discover connections |

### Entity Ontology

Eight layers, implemented incrementally:

| Layer | Entity Types | Purpose |
|-------|-------------|---------|
| **Strategic** | objective, initiative, metric, risk | What the org is trying to achieve |
| **Organizational** | person, org, team, role | Who does what |
| **Operational** | process, workflow, task, project, incident | How work gets done |
| **Product/Service** | product, capability | What the org delivers |
| **Data & Systems** | system, data-asset, integration | Infrastructure and data |
| **Agent** | agent, execution, archetype | AI agent definitions and patterns |
| **Knowledge** | decision, assumption, constraint, synthesis, contradiction, insight, policy | What the org knows and believes |
| **Communication** | conversation, event, document, account, asset | Signals and artifacts |

**Implementation order:** Agent layer first (for AgentFlow integration), then Strategic (for business context), then expand outward.

### Storage

Obsidian-compatible Markdown vault with YAML frontmatter and wikilinks:

```yaml
---
name: Daily Portfolio Rebalance
type: execution
source: agentflow
alfred_tags: ['agentflow/execution', 'agent/alfred', 'status/completed']
---

# Execution: alfred — completed

**Duration:** 410ms
**Path:** `agent:alfred→tool:dispatch-command→tool:state-monitor`

## Related
- [[agent/alfred]]
- [[decision/rebalance-strategy]]
```

## Product Roadmap

### Phase 1: AgentFlow Core — COMPLETE

Self-contained execution intelligence. `npm install agentflow` gives you the full feedback loop.

| Capability | Module | Tests | Status |
|------------|--------|:-----:|:------:|
| Execution graph construction | `graph-builder.ts` | 27 | Shipped |
| Graph querying (11 functions) | `graph-query.ts` | 24 | Shipped |
| Runtime guards (static) | `guards.ts` | 13 | Shipped |
| Visualization (ASCII tree, timeline) | `visualize.ts` | 10 | Shipped |
| Trace persistence | `trace-store.ts` | 9 | Shipped |
| Distributed trace stitching | `graph-stitch.ts` | 11 | Shipped |
| Graph serialization/deserialization | `loader.ts` | 8 | Shipped |
| Security hardening | multiple | 5 | Shipped |
| Process mining (DFG, variants, bottlenecks, conformance) | `process-mining.ts` | 25 | Shipped |
| Event emission (execution + pattern events) | `event-emitter.ts` | 20 | Shipped |
| JSON event writer | `json-event-writer.ts` | (in event tests) | Shipped |
| Soma event writer (optional adapter) | `soma-event-writer.ts` | 14 | Shipped |
| Knowledge store (accumulation + profiles) | `knowledge-store.ts` | 25 | Shipped |
| PolicySource + adaptive guards | `policy-source.ts`, `guards.ts` | 19 | Shipped |
| **Total** | **25 source files** | **244** | |

### Phase 1.5: Dashboard + DX (Next)

Make the shipped capabilities visible and usable.

- **Dashboard integration** — Replace inline process mining in dashboard `server.ts` with the new APIs + knowledge store queries. Agent profiles, variant analysis, bottleneck heatmaps powered by the real engine.
- **Knowledge Engine Tier 2** — LLM-powered analysis layer. User provides the LLM function. AgentFlow provides prompts that read from the knowledge store and generate natural language insights. "Why did this agent fail 3x today?"
- **Framework adapters** — First adapters for LangChain, CrewAI, Mastra, OpenClaw. Each translates framework events into `GraphBuilder` calls.
- **CLI improvements** — `agentflow trace`, `agentflow profile`, `agentflow mine` commands.

### Phase 2: Soma Intelligence Layer

Build Soma as a separate package/system with organizational context.

- **Curator worker** — Ingest execution events + external signals (email, Slack, docs) into structured vault entities.
- **Agent layer entities** — `agent/`, `execution/`, `archetype/` vault directories with the AgentFlow knowledge store as a source.
- **Distiller worker** — LLM-powered synthesis: extract decisions, assumptions, contradictions from accumulated knowledge.
- **PolicySource bridge** — Soma feeds learned policies back to AgentFlow guards. The full external feedback loop.
- **Strategic layer entities** — `objective/`, `metric/`, `initiative/` so Soma understands business context.

### Phase 3: Connectors + Full Ontology

Expand Soma's reach into the organization's data ecosystem.

- **Connectors:** Jira, Linear, Slack, Google Workspace, Snowflake, dbt, Databricks
- **Full ontology:** All 8 entity layers populated, cross-referenced, embedded.
- **Surveyor worker:** Semantic clustering, similarity search, automatic connection discovery.
- **Archetype discovery:** Cross-domain patterns that transfer knowledge between agents, teams, and processes.

### Phase 4: Agent OS

The intelligence layer as the operating system kernel for agent-driven organizations.

- AgentFlow as the execution control plane (observe, learn, enforce)
- Soma as the knowledge operating system (understand, reason, advise)
- Policy-as-code: guards, SLAs, compliance rules expressed as queryable knowledge
- Humans consume first (dashboard, transparency, trust), then sentinel agents consume the data
- Self-governing agent networks with organizational awareness

## Competitive Positioning

```
                    Observe    Mine    Learn    Enforce    Org Context
                    ───────    ────    ─────    ───────    ───────────
LangSmith/Langfuse    ✓
AgentFlow (Tier 1)    ✓         ✓       ✓        ✓
AgentFlow (Tier 2)    ✓         ✓       ✓✓       ✓
AgentFlow + Soma      ✓         ✓       ✓✓✓      ✓✓           ✓
```

The key insight: observability tools stop at "system of records." AgentFlow is a "system of activities" — knowledge compounds, agents improve, and the gap widens over time.

## Specifications

Maintained via OpenSpec (`openspec/specs/`):

| Spec | Requirements | Scenarios |
|------|:-----------:|:---------:|
| `event-emission` | 5 | 17 |
| `knowledge-store` | 9 | 19 |
| `policy-source` | 5 | 14 |
| `process-mining` | 5 | ~15 |
| `input-sanitization` | 5 | ~10 |

Archived changes: `security-hardening`, `process-mining-primitives`, `event-emission-interface`, `builtin-knowledge-store`, `soma-event-integration`.
