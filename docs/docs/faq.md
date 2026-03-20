---
sidebar_position: 5
title: FAQ
---

# Frequently Asked Questions

---

## General

### What is AgentFlow?

AgentFlow is a process mining library and dashboard for AI agents. It answers a different question than most observability tools: not "what did the model do?" but **"what did the agent actually do?"**

Concretely, it gives you:

- **Execution graphs** — a directed-follows graph of every node your agent visited, including subagents, tools, reasoning steps, and decision points
- **Process mining** — variant analysis, bottleneck detection, and conformance checking across hundreds of runs
- **Runtime guards** — configurable trip-wires that catch hung agents, reasoning loops, spawn explosions, and silent failures before they consume your compute budget
- **A self-hosted dashboard** — process maps, flame charts, variant tables, and transcript replay, no SaaS account required

The core library (`agentflow-core`) has zero external dependencies. It is plain TypeScript.

---

### Is it open source?

AgentFlow is licensed under **Apache 2.0 with Commons Clause**. The source code is public and freely usable for personal and internal commercial projects. The Commons Clause restricts reselling AgentFlow itself as a managed service without a commercial license.

Commercial licenses and enterprise support are available — contact clemence.chee@gmail.com.

---

### What frameworks does it support?

AgentFlow is framework-agnostic. It ships with built-in adapters for:

| Adapter | What it ingests |
|---|---|
| **AgentFlow native** | JSON traces, JSONL sessions, systemd logs |
| **OpenClaw** | Cron job runs and interactive sessions |
| **OpenTelemetry** | OTLP JSON spans using GenAI semantic conventions |
| **Custom** | Implement `TraceAdapter` in ~30 lines |

Any agent instrumented with an OTel SDK — LangChain, CrewAI, AutoGen, or a custom framework — can push spans to AgentFlow's HTTP collector (`POST /v1/traces`). AgentFlow maps GenAI semantic conventions to its execution graph model automatically.

---

### Is it self-hosted or SaaS?

Fully **self-hosted**. There is no cloud component, no telemetry sent anywhere, no account to create. You run `agentflow-dashboard` against a local trace directory and open `http://localhost:3000`. Your traces stay on your machine.

:::info
The `agentflow-otel` package can *export* traces to external backends like Datadog, Grafana Tempo, Honeycomb, or Jaeger — but that is opt-in and push-based. AgentFlow itself never pulls your data.
:::

---

## How AgentFlow Compares

These comparisons are meant to be useful, not adversarial. Every tool listed below does something genuinely well. The goal is to help you understand what each one is for so you can pick the right tool — or combine them.

The short version: **AgentFlow watches the agent. Most other tools watch the LLM.**

---

### vs. MLflow

MLflow is an experiment tracking platform for the machine learning lifecycle: log parameters, metrics, and artifacts for training runs, compare experiments, and register models for deployment.

AgentFlow is a production monitoring and process mining tool for deployed agents: track execution paths, detect bottlenecks, enforce runtime guards.

**Where they differ:**

| | MLflow | AgentFlow |
|---|---|---|
| Primary use | Training & experiment tracking | Production agent monitoring |
| Data model | Runs, params, metrics, artifacts | Execution graphs, nodes, variants |
| Process mining | No | Yes — DFG, variants, conformance |
| Runtime guards | No | Yes — loop detection, depth limits |
| Self-hosted | Yes | Yes |

These tools answer different questions. MLflow asks "which hyperparameter combination worked best?" AgentFlow asks "why did my production agent hang at 2 AM?" They don't overlap and can coexist comfortably in the same stack.

---

### vs. LangSmith

LangSmith is a debugging and evaluation platform built by the LangChain team. It excels at tracing individual LangChain runs, inspecting prompt/response pairs, running evaluations, and using the prompt playground for iterative development.

AgentFlow is a pattern-discovery and monitoring tool that works across all frameworks and focuses on aggregate behavior over many runs.

**Where they differ:**

| | LangSmith | AgentFlow |
|---|---|---|
| Primary use | Debug and evaluate individual runs | Understand system behavior across runs |
| Framework | Primarily LangChain | Any framework (OTel-based or custom adapter) |
| Process mining | No | Yes |
| Self-hosted | Partial (cloud-first) | Yes, fully |
| Zero dependencies | No | Core has none |
| Guard / anomaly detection | No | Yes |

LangSmith is the right tool for "this run returned the wrong answer — why?" AgentFlow is the right tool for "across the last 500 runs, what is my failure rate, where do runs diverge, and what is the slowest step?"

:::tip
If you use LangChain and want both: keep LangSmith for prompt-level debugging, add AgentFlow for system-level monitoring. LangChain agents can push OTel spans to AgentFlow's HTTP collector.
:::

---

### vs. LangFuse

LangFuse is an open-source LLM observability platform focused on token usage, latency, cost tracking, and LLM-level evaluation. It gives you a clean view of what your language model calls look like over time.

AgentFlow is focused on the agent as a system — the execution graph that wraps those LLM calls.

**Where they differ:**

| | LangFuse | AgentFlow |
|---|---|---|
| Primary use | LLM call observability, cost tracking | Agent execution graphs, process mining |
| Token/cost tracking | Yes — first-class feature | Via OTel export (surfaced in OTel backends) |
| Process mining | No | Yes |
| Execution graph model | No | Yes — nodes, edges, hierarchy |
| Runtime guards | No | Yes |
| Self-hosted | Yes | Yes |

LangFuse watches what happens *inside* a single LLM call. AgentFlow watches what happens *around* those calls — the branching logic, the subagent spawning, the tool retry loops, the decision points.

**These tools complement each other well.** LangFuse for LLM-level cost and quality; AgentFlow for agent-level behavior and safety.

---

### vs. Arize Phoenix

Arize Phoenix is an LLM evaluation and tracing platform focused on model quality, drift detection, hallucination analysis, and span-level trace inspection. It is strong on the evaluation side.

AgentFlow is focused on execution path analysis, process mining, and runtime guard enforcement.

**Where they differ:**

| | Arize Phoenix | AgentFlow |
|---|---|---|
| Primary use | LLM quality, drift, evaluation | Agent behavior, path analysis, guards |
| Trace analysis | Individual span inspection | Aggregate process model discovery |
| Evaluation / evals | Yes | No |
| Process mining | No | Yes |
| Runtime guards | No | Yes |
| Self-hosted | Yes | Yes |

Arize asks "is my model producing good outputs?" AgentFlow asks "is my agent taking sensible paths to produce those outputs?" Complementary concerns.

---

### vs. Weights & Biases

Weights & Biases is an ML experiment tracking and model management platform. Its core strengths are hyperparameter sweeps, training run comparison, model artifact versioning, and team collaboration on ML experiments.

AgentFlow is a production agent monitoring tool that has nothing to do with training.

**Where they differ:**

| | Weights & Biases | AgentFlow |
|---|---|---|
| Stage | Model training and development | Production agent deployment |
| Data model | Experiments, runs, sweeps, artifacts | Execution graphs, nodes, variants |
| Process mining | No | Yes |
| Runtime guards | No | Yes |

These tools live at different stages of the lifecycle. W&B is for the team building and evaluating models. AgentFlow is for the system running agents against those models in production. There is no meaningful overlap.

---

### Can I use AgentFlow alongside these tools?

Yes — AgentFlow is **additive**. It adds a layer (execution intelligence) that none of the above tools provide. Nothing you are already running needs to be removed.

The `agentflow-otel` package exports AgentFlow execution graphs as OTel spans following GenAI semantic conventions. This means you can send AgentFlow data to:

- **Datadog APM** — agent traces alongside your application metrics
- **Grafana Tempo** — custom dashboards with agent health visualizations
- **Honeycomb** — high-cardinality trace analysis
- **Jaeger** — distributed trace inspection
- **Any OTLP-compatible backend**

OTel export includes guard violation attributes (`agentflow.guard.violated`, `agentflow.guard.violation.*.type`) so you can set up PagerDuty alerts or Slack notifications on safety incidents directly from your existing observability stack.

:::info
The key message: use LangFuse or LangSmith for LLM-level visibility. Use AgentFlow for agent-level visibility. They observe different things and feed different audiences.
:::

---

## Technical

### What does "zero dependency" mean?

The `agentflow-core` package has **no npm dependencies** — no lodash, no axios, no zod, no LangChain. It is pure TypeScript using only the standard library.

This matters for a few reasons:

- **No supply chain risk** from transitive dependencies
- **No version conflicts** when you add it to an existing project
- **Small bundle size** — the core graph builder, process mining functions, and knowledge store are a few KB
- **Works anywhere TypeScript runs** — Node, Deno, edge runtimes, Lambda

The `agentflow-dashboard` (React + Express) and `agentflow-otel` (OTel SDK) packages do have dependencies, but those are isolated to their own packages.

---

### What is the performance overhead?

Graph building is synchronous and in-memory. Calling `builder.startNode()` and `builder.endNode()` adds a `Map` write and an optional guard check. In practice:

- **Graph operations**: microseconds per node
- **Guard checks**: a depth check and a counter comparison — effectively free
- **Process mining** (`discoverProcess`, `findVariants`, `getBottlenecks`): runs once per analysis, not per agent step. On hundreds of traces it completes in milliseconds

No LLM calls, no network I/O, and no async operations are required for Tier 0 or Tier 1 features. The insight engine (Tier 2) calls an LLM only when you explicitly invoke `engine.explainFailures()` using a model you provide.

---

### How does process mining work?

Process mining is a technique originally developed for enterprise workflow analysis (popularized by tools like Celonis and ProM). It discovers patterns in event logs to build a model of how a process actually behaves — not how it was designed to behave.

AgentFlow applies this to agent execution traces:

1. **Directly-follows graph (DFG)** — for each pair of consecutive node types across all traces, count how often one follows the other. The result is an aggregate graph showing the most common execution paths, weighted by frequency.

2. **Variant analysis** — group traces by their unique execution path signature. The most common path is the "happy path." Clusters of deviating paths reveal error modes, retry patterns, and edge cases.

3. **Bottleneck detection** — for each node type, compute the P95 duration across all traces. Nodes above the threshold are flagged as bottlenecks.

4. **Conformance checking** — compare a new trace against the discovered process model. Deviations (skipped steps, unexpected paths) are surfaced as conformance violations.

None of this requires an LLM. It is statistical analysis over your trace data.

---

### How do guards work?

Guards are synchronous checks that run during graph construction — as your agent executes, not after.

```typescript
const builder = withGuards(
  createGraphBuilder({ agentId: 'my-agent', trigger: 'api-call' }),
  {
    maxDepth: 10,           // Maximum subagent nesting depth
    maxReasoningSteps: 25,  // Consecutive reasoning nodes before alert
    onViolation: 'warn'     // 'warn' | 'throw' | 'callback'
  }
);
```

When a violation is detected, AgentFlow can:

- **warn** — log the violation and attach it to the graph node as metadata, execution continues
- **throw** — raise an exception immediately, halting the agent
- **callback** — call a user-supplied function with violation details

Guard violations are preserved in the trace and exported as OTel span attributes (`agentflow.guard.violated: true`) so they surface in your existing alerting pipeline.

Built-in guard types:

| Guard | What triggers it |
|---|---|
| `max_depth` | Subagent nesting exceeds `maxDepth` |
| `reasoning_loop` | N consecutive same-type reasoning nodes |
| `spawn_explosion` | Graph breadth (child count) exceeds limit |
| Conformance drift | Execution path deviates from discovered model |

---

## Troubleshooting

### My trace file is empty

A few common causes:

1. **`builder.build()` was never called.** The graph is not written to disk until you call `build()`. Make sure it is called in a `finally` block so it runs even when the agent throws.

2. **The trace directory doesn't exist.** AgentFlow writes to whatever path you configured. If the directory was not created, the write silently fails. Pre-create the directory or add a `mkdirSync` call.

3. **The agent crashed before `endNode`.** If the process exited abruptly, some nodes may be open (started but not ended). AgentFlow marks these as `incomplete` and still writes the partial trace. Check the file for nodes with no `endTime`.

4. **Wrong trace directory in the dashboard.** The `--traces` flag must point to the directory containing your trace files, not a parent directory. Check with `ls ./traces` to confirm files are present.

---

### The dashboard won't start

```bash
agentflow-dashboard --traces ./traces --data-dir ./data
```

Common issues:

- **Port 3000 already in use** — pass `--port 3001` (or any free port)
- **`./traces` does not exist** — the dashboard expects the directory to exist at startup; create it first even if empty
- **Node version** — AgentFlow requires Node 18 or later; run `node --version` to confirm
- **Missing `agentflow-dashboard` package** — install it globally: `npm install -g agentflow-dashboard`

If the dashboard starts but shows no agents, confirm that your trace files are in a format AgentFlow recognises (native JSON/JSONL, OTel OTLP JSON, or OpenClaw). The dashboard logs the adapters it loaded at startup.

---

### Guards aren't firing

Guards only fire when you wrap your builder with `withGuards`. A plain `createGraphBuilder()` has no guard logic.

Check:

1. You are using `withGuards(createGraphBuilder(...), { ... })` and passing the resulting builder to your agent code
2. `onViolation` is set — the default is `'warn'`, which logs to stderr. If you are capturing stdout only, you may be missing the output
3. The threshold you set is actually being exceeded — add a temporary `console.log` to print `builder.getNodeCount()` or the current depth mid-run
4. You are calling `builder.endNode()` correctly — guards run on `startNode`, so if nodes are never ending, the depth counter may not be incrementing as expected

---

### Process mining shows no variants

Variant analysis requires **multiple traces** — a single run produces one variant by definition, which is not very informative.

If you have multiple trace files but variants are still empty:

1. **Agent IDs differ between runs.** Variants are grouped per agent ID. If your agent generates a random ID each run (e.g. `agent-${uuid()}`), each run is treated as a different agent. Use a stable, human-readable ID like `portfolio-reconciler`.

2. **All traces are identical.** If every run takes exactly the same path, there is one variant with a count equal to the number of runs. That is correct — it means your agent is deterministic.

3. **Traces are not being discovered.** Check that the dashboard's trace directory contains parsed `.json` files. The dashboard logs which files it successfully parsed on startup.

4. **Not enough runs.** Variant analysis becomes meaningful with 10+ runs. With 2–3 runs, the variant table will show data but patterns won't be statistically significant.

:::tip
Use stable, descriptive agent IDs. Instead of generating a UUID per run, use something like `data-pipeline-prod` or `report-generator`. This lets process mining accumulate meaningful history across runs.
:::
