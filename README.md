# AgentFlow

[![GitHub stars](https://img.shields.io/github/stars/ClemenceChee/AgentFlow)](https://github.com/ClemenceChee/AgentFlow/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/ClemenceChee/AgentFlow)](https://github.com/ClemenceChee/AgentFlow/network/members)
[![npm downloads](https://img.shields.io/npm/dm/agentflow)](https://www.npmjs.com/package/agentflow)
[![License](https://img.shields.io/badge/License-Apache%202.0%20with%20Commons%20Clause-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/Language-TypeScript-blue.svg)](https://www.typescriptscriptlang.org/)

**Process mining for AI agent systems. See what your agents actually did—not just what they logged.**

---

## The 8-Hour Problem

Last month I woke up to find my portfolio reconciliation agent had been running for **eight hours straight**. It should have taken ten minutes.

The logs showed no errors. No crashes. No timeouts. Just a steady stream of "processing..." messages repeating since 2 AM.

The culprit? A subagent three levels deep that spawned a Finance data fetcher which never returned. The parent agent was waiting. Forever. **Silent failures don't announce themselves**—they just consume your compute budget while producing nothing.

I spent 48+ hours over two weekends debugging: config files overriding each other, CLI tools requiring parameters in a specific order, model names that must be spelled exactly one way. Three bugs, zero error messages.

**Current observability tools (LangSmith, Langfuse, etc.) treat agents like stateless functions.** They show you input tokens, output tokens, latency, cost. Beautiful dashboards of what the model did.

But AI agents are not stateless functions. They are:
- **Stateful** — execution spanning minutes, hours, or days
- **Hierarchical** — parent agents spawning subagents spawning their own children
- **Graph-structured** — workflows that branch, merge, retry, and loop
- **Non-deterministic** — same input, different execution paths depending on context

**AgentFlow** reconstructs the full execution graph—not just logs, but the actual process flow. It treats agent execution as a first-class graph you can query, visualize, and reason about.

---

## What Makes AgentFlow Different

| | LangSmith/Langfuse | **AgentFlow** |
|---|---|---|
| **Observability** | Input/output tracing | Execution graph reconstruction |
| **Failure Detection** | Error logs | Silent failure detection (hanging subagents) |
| **Process Mining** | — | DFG variants, bottleneck detection, conformance |
| **LLM Required** | Yes | **Tier 1: No LLM needed** |
| **Dependencies** | External infrastructure | **Zero dependencies, filesystem only** |

**Tier 1 ships out of the box** — statistical intelligence (process mining, variant analysis, bottleneck detection, adaptive guards) with zero dependencies and no LLM cost.

---

## Quick Start

```bash
# Install
npm install -g agentflow-core@latest agentflow-dashboard@latest

# Real-time terminal dashboard
agentflow live ./data ./traces --refresh 5

# Web dashboard with process health monitoring
agentflow-dashboard --traces ./traces --data-dir ./data

# Watch for failures and get alerts
agentflow watch ./data --notify telegram

# Trace any command execution
agentflow run -- python my_agent.py
```

---

## Screenshots

### Web Dashboard — Execution Timeline & Process Health
<img width="2889" alt="AgentFlow Dashboard Timeline" src="https://github.com/user-attachments/assets/acd199cd-5064-44be-8deb-94bd2d101c63" />

### Interactive Execution Graph
<img width="2879" alt="AgentFlow Execution Graph" src="https://github.com/user-attachments/assets/fa1fd4f1-41bf-4506-9a5d-342ed84243de" />

### Process Health & Orphan Detection
<img width="2339" alt="AgentFlow Live Monitor" src="https://github.com/user-attachments/assets/f592b464-0fd8-42ee-b407-f5cf9819301e" />

### Error Heatmap & Alerting
<img width="977" alt="AgentFlow Alerts" src="https://github.com/user-attachments/assets/2d7556cb-82d1-4cd1-ace6-e3f8b5cac291" />

---

## The Core Loop

**Observe → Mine → Emit → Accumulate → Adapt**

Each step is independently valuable:
- **Observe** — Execution tracing
- **Mine** — Cross-run process analytics
- **Emit** — Event emission for external integration
- **Accumulate** — Knowledge store for self-improving agents
- **Adapt** — Feed learned policies back into adaptive guards

---

## Knowledge Engine Tiers

| Tier | Name | Description | LLM Required | Status |
|------|------|-------------|:---:|:---:|
| 0 | System of Record | Log traces, visualize trees | No | ✅ Shipped |
| 1 | **Statistical** | Process mining, variants, bottlenecks, adaptive guards | **No** | ✅ **Shipped** |
| 2 | Semantic | LLM-powered pattern analysis | Yes | 🚧 Planned |
| 3 | Compounding | Cross-domain transfer, archetypes | Yes + Soma | 📋 Planned |

**Tier 1 is the differentiator.** LangSmith/Langfuse stop at Tier 0. AgentFlow ships Tier 1 out of the box — zero dependencies, no LLM cost.

---

## What AgentFlow Detects

- **Hung subagents** — Parent waiting on child that never returns
- **Reasoning loops** — N consecutive same-type nodes
- **Spawn explosions** — Graph depth exceeding limits
- **Stale PIDs** — PID files pointing to dead processes
- **Orphan processes** — Agents running outside systemd
- **Silent failures** — "Processing..." forever
- **Conformance drift** — Execution deviating from patterns

---

## License

Apache 2.0 with Commons Clause — See [LICENSE](LICENSE) for details.

**Commercial licensing available** — Contact clemence.chee@gmail.com for enterprise licenses, support, and custom features.

---

*Built by Clemence Chee. Running in production 24/7 since 2025.*
