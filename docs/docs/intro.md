---
sidebar_position: 1
slug: /
---

# AgentFlow

**Execution intelligence for AI agent systems.**

AgentFlow monitors any AI agent system — regardless of framework — and turns raw execution traces into actionable intelligence: process models, bottleneck detection, conformance scoring, and adaptive guards.

## The Problem

AI agents are black boxes. When an agent fails, you see the error. You don't see:
- Which execution path it took (and whether that path usually fails)
- Where the bottleneck was (was it the tool call? the LLM? the orchestrator?)
- Whether the agent's behavior has drifted from its normal pattern
- What you should do differently next time

LLM observability tools tell you what the model said. AgentFlow tells you **how the agent behaved as a system**.

## 30-Second Example

```typescript
import {
  createGraphBuilder,
  discoverProcess,
  findVariants,
  getBottlenecks,
} from 'agentflow-core';

// Build an execution graph
const builder = createGraphBuilder({ agentId: 'my-agent', trigger: 'user-request' });
const root = builder.startNode({ type: 'agent', name: 'orchestrator' });
const tool = builder.startNode({ type: 'tool', name: 'web-search', parentId: root });
builder.endNode(tool);
builder.endNode(root);
const graph = builder.build();

// Mine patterns across many executions
const model = discoverProcess([graph, ...moreGraphs]);
const variants = findVariants(model);
const bottlenecks = getBottlenecks(model);

console.log(`${variants.length} execution variants discovered`);
console.log(`Top bottleneck: ${bottlenecks[0]?.nodeName}`);
```

## Key Features

- **Zero dependencies** — No external packages. Works everywhere Node.js runs.
- **Framework-agnostic** — Works with LangChain, CrewAI, AutoGen, custom agents, or any system.
- **Process mining** — Discovers execution variants, bottlenecks, and conformance scores automatically.
- **Runtime guards** — Enforce policies (timeout, failure rate, conformance) at execution time.
- **Knowledge engine** — Accumulates execution history, generates agent profiles, provides adaptive policy data.
- **OTel export** — Send traces to Jaeger, Datadog, Grafana, Honeycomb, or any OTel-compatible backend.
- **Dashboard** — Real-time visualization of agent execution graphs and performance.

## Next Steps

- [Install AgentFlow](./getting-started/installation)
- [Build your first trace](./getting-started/first-trace)
- [Understand the architecture](./guides/architecture)
- [FAQ — How does AgentFlow compare to alternatives?](./faq)
