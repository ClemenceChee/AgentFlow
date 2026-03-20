---
sidebar_position: 4
title: Adding Guards
---

# Adding Guards

Guards are runtime checks that fire during graph construction — after each `endNode` or `failNode` call — and detect problematic patterns before they cause silent failures. They operate on a snapshot of the graph and produce structured `GuardViolation` objects.

There are two ways to use guards: the `withGuards` wrapper (recommended for most use cases) and the standalone `checkGuards` function (for batch analysis or custom orchestration).

## `withGuards` — protect a builder

`withGuards` wraps any `GraphBuilder` with identical interface but intercepts `endNode`, `failNode`, and `build` calls to check for violations automatically.

```typescript
import { createGraphBuilder, withGuards } from 'agentflow-core';

const raw     = createGraphBuilder({ agentId: 'my-agent', trigger: 'user-request' });
const builder = withGuards(raw, {
  maxDepth:          10,   // spawn-explosion if tree depth > 10
  maxReasoningSteps: 25,   // reasoning-loop if >25 consecutive same-type nodes
  maxAgentSpawns:    50,   // spawn-explosion if total agent/subagent nodes > 50
  timeouts: {
    tool:     30_000,      // 30 s (default)
    agent:   300_000,      // 5 min (default)
    subagent: 300_000,
  },
  onViolation: 'warn',     // 'warn' | 'error' | 'abort'
});

// Use exactly like a normal builder
const rootId = builder.startNode({ type: 'agent', name: 'main' });
const toolId = builder.startNode({ type: 'tool',  name: 'fetch', parentId: rootId });
builder.endNode(toolId);   // guards run here
builder.endNode(rootId);   // guards run here
const graph = builder.build();
```

## Violation types

| Type | Triggered by |
|---|---|
| `timeout` | A node has been `running` longer than its type's timeout threshold |
| `reasoning-loop` | More than `maxReasoningSteps` consecutive nodes of the same type along any path |
| `spawn-explosion` | Tree depth exceeds `maxDepth`, or total agent/subagent count exceeds `maxAgentSpawns` |
| `high-failure-rate` | Agent's recent failure rate exceeds the policy threshold (requires `policySource`) |
| `conformance-drift` | Agent's last conformance score is below the policy threshold (requires `policySource`) |
| `known-bottleneck` | A running node's name matches a bottleneck recorded in the knowledge store |

## `onViolation` behaviour

| Value | Effect |
|---|---|
| `'warn'` (default) | Logs to `console.warn` (or your custom `logger`) and continues |
| `'error'` | Logs and records the violation as a custom trace event on the node |
| `'abort'` | Throws immediately — stops execution at the violating step |

```typescript
const builder = withGuards(raw, {
  maxDepth: 5,
  onViolation: 'abort',
  logger: (msg) => myLogger.warn(msg),
});
```

## `checkGuards` — standalone analysis

For batch analysis or when you want to inspect violations yourself, call `checkGuards` directly on any `ExecutionGraph`:

```typescript
import { checkGuards } from 'agentflow-core';

const violations = checkGuards(graph, {
  maxDepth: 10,
  maxReasoningSteps: 25,
});

if (violations.length > 0) {
  for (const v of violations) {
    console.log(`[${v.type}] ${v.message}`);
  }
}
```

`checkGuards` is a pure function — it never modifies the graph or produces side effects.

## Handling violations

Each violation is a `GuardViolation`:

```typescript
interface GuardViolation {
  type: 'timeout' | 'reasoning-loop' | 'spawn-explosion'
      | 'high-failure-rate' | 'conformance-drift' | 'known-bottleneck';
  nodeId:    string;
  message:   string;
  timestamp: number;  // epoch ms
}
```

A typical production handler:

```typescript
const violations = checkGuards(graph, config);

for (const v of violations) {
  switch (v.type) {
    case 'timeout':
      alertOpsChannel(`Hung node detected: ${v.message}`);
      break;
    case 'reasoning-loop':
      // Force-stop the agent and record the event
      builder.failNode(v.nodeId, 'reasoning loop detected');
      break;
    case 'spawn-explosion':
      builder.failNode(graph.rootNodeId, 'spawn limit exceeded');
      break;
    default:
      console.warn('[guard]', v.message);
  }
}
```

## Adaptive guards with `PolicySource`

Guards can adapt their thresholds based on accumulated execution history. Pass a `policySource` built from the knowledge store:

```typescript
import {
  createGraphBuilder,
  createKnowledgeStore,
  createPolicySource,
  withGuards,
} from 'agentflow-core';

// The knowledge store accumulates execution and pattern events across runs
const store  = createKnowledgeStore({ baseDir: '.agentflow/knowledge' });
const policy = createPolicySource(store);

const builder = withGuards(
  createGraphBuilder({ agentId: 'my-agent' }),
  {
    policySource: policy,
    policyThresholds: {
      maxFailureRate:  0.3,  // warn if agent fails >30% of the time
      minConformance:  0.8,  // warn if last conformance score < 80%
    },
    onViolation: 'warn',
  }
);
```

With a `policySource` configured, guards automatically check `high-failure-rate`, `conformance-drift`, and `known-bottleneck` based on the agent's historical profile. No manual threshold tuning needed as the agent's behaviour evolves — the knowledge store updates on every run.

---

You now have the full getting-started foundation. From here, explore:

- **Knowledge store** — persist events and build agent profiles with `createKnowledgeStore`
- **Event emission** — stream structured events to external systems with `createEventEmitter`
- **Insight engine** — LLM-powered failure analysis with `createInsightEngine`
