---
sidebar_position: 1
title: Soma Overview
---

# Soma Overview

:::caution Experimental
Soma is experimental. APIs may change between minor versions. Do not use in production without pinning an exact version.
:::

## The Core Thesis

Agent systems have a memory problem. Each run starts fresh. Failures recur. Patterns go unnoticed. Teams accumulate tribal knowledge in Slack threads and runbooks rather than anywhere that the agents themselves can act on.

Soma exists to close that loop.

Execution data flows into Soma. Soma builds a structured knowledge vault. The vault feeds policies back into AgentFlow guards. Guards shape the next execution. Over time, the system learns — not by retraining a model, but by accumulating and acting on organizational knowledge.

```
┌─────────────────────────────────────────────────────────┐
│                        AgentFlow                        │
│                                                         │
│   GraphBuilder ──► ExecutionGraph ──► EventEmitter      │
│                                            │            │
│                         ┌──────────────────┘            │
│                         │  ExecutionEvent / PatternEvent │
└─────────────────────────┼───────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                          Soma                           │
│                                                         │
│   Harvester ──► Vault ──► Reconciler                    │
│                  │                                      │
│                  ├──────► Synthesizer (needs LLM)       │
│                  │                                      │
│                  └──────► Cartographer (needs embeddings)│
│                                                         │
│   PolicyBridge ◄────────── Vault                        │
└──────────────┬──────────────────────────────────────────┘
               │  PolicySource
               ▼
┌─────────────────────────────────────────────────────────┐
│                        AgentFlow                        │
│                                                         │
│   Guards ◄── PolicySource.recentFailureRate()           │
│              PolicySource.isKnownBottleneck()           │
│              PolicySource.lastConformanceScore()        │
└─────────────────────────────────────────────────────────┘
```

## What Soma Is

Soma is the **organizational intelligence layer** that sits alongside AgentFlow. Where AgentFlow handles execution tracing, process mining, and guard enforcement in real time, Soma handles the longer arc: accumulating knowledge across many executions over time and making that knowledge actionable.

At its core, Soma is a **knowledge vault** — a filesystem-based store of Markdown entities with structured frontmatter, organized by type and linked by wikilinks. Everything Soma learns lives in plain files you can read, edit, and commit to version control.

Soma has four workers that operate on the vault:

- **Harvester** — Ingests `ExecutionEvent` and `PatternEvent` records from AgentFlow, plus arbitrary files dropped into an inbox directory. Creates and updates `agent` and `execution` entities automatically.
- **Reconciler** — Scans the vault for health issues: missing required fields, broken wikilinks, stub entities with no content. Reports problems and auto-fixes what it can.
- **Synthesizer** — Uses an LLM (via your `AnalysisFn`) to read execution entities and extract higher-order knowledge: insights, decisions, policies, assumptions, constraints, and contradictions.
- **Cartographer** — Uses embeddings (via your `embedFn`) to map the semantic space of the vault, discover archetypes (clusters of similar behavior), and suggest wikilink relationships.

The **Policy Bridge** (`createSomaPolicySource`) connects the vault back to AgentFlow by implementing the `PolicySource` interface. Guards can query it for `recentFailureRate`, `isKnownBottleneck`, and `lastConformanceScore` — all derived from live vault data.

## The Full Stack

SOMA is one layer in a five-layer architecture for agent governance: SPE (agent-local memory) at the bottom, AgentFlow (execution observability) as the foundation, SOMA (knowledge synthesis and governance) in the middle, Operational Intelligence (per-run enforcement and visibility) as SOMA's enforcement complement, and AICP (organizational policy authority) at the top. Each layer operates at a different timescale — from millisecond-level per-run checks to month-level organizational policy adjustments. Operational Intelligence enforces the thresholds that SOMA discovers: SOMA learns from many runs, Ops Intel acts on each one.

```
L4  AICP ──────────── Organizational policy authority
L3  Ops Intel ──────── Per-run enforcement & receipts
L2  SOMA ──────────── Knowledge synthesis & governance    ◄── you are here
L1  AgentFlow ──────── Execution observability
L0  SPE ───────────── Agent-local memory
```

For the full picture — data flow, feedback loops, and status of each layer — see the [Full Stack Architecture](https://ClemenceChee.github.io/soma/architecture/full-stack) page in the SOMA documentation.

## Why It Exists

### Agents Are Stateless by Default

An agent that fails every Monday morning because a downstream API is slow on weekends has no way to know that unless something tells it. AgentFlow can detect the pattern. Soma remembers it, names it, and surfaces it as a policy.

### Organizations Need Memory Across Agents

In multi-agent systems, Agent A's failures are often caused by conditions that Agent B discovered last week. Without a shared knowledge layer, that connection is never made. Soma's vault stores knowledge at the organizational level, not the per-agent level.

### Knowledge Should Be Human-Readable

Soma deliberately stores everything in plain Markdown with YAML frontmatter. You can read the vault in any editor, search it with grep, diff it with git, and reason about it without a database client. The vault is a first-class artifact of your system, not a black box.

### Feedback Loops Compound

The value of Soma grows over time. Each execution adds data. Each Synthesizer run extracts more signal. Each Cartographer run discovers new relationships. Each Policy Bridge query makes guards smarter. The longer Soma runs, the better the organizational picture becomes.
