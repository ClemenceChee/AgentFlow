---
sidebar_position: 2
title: Your First Trace
---

# Your First Trace

An execution graph is the central data structure in AgentFlow. It records every node (agent, tool, subagent, decision) that ran during a single agent execution, the parent-child relationships between them, and the lifecycle status of each node. This page walks through building one from scratch.

## Build a simple graph

```typescript
import { createGraphBuilder, getStats } from 'agentflow-core';

// 1. Create a builder for this agent run
const builder = createGraphBuilder({
  agentId: 'research-agent',
  trigger: 'user-request',
});

// 2. Start the root node — the top-level agent
const rootId = builder.startNode({ type: 'agent', name: 'main' });

// 3. Start child nodes, passing the parent's ID
const searchId = builder.startNode({ type: 'tool', name: 'web-search', parentId: rootId });
builder.endNode(searchId); // completed successfully

const llmId = builder.startNode({ type: 'agent', name: 'summarise', parentId: rootId });
builder.endNode(llmId);

// 4. Close the root node and freeze the graph
builder.endNode(rootId);
const graph = builder.build();

console.log(getStats(graph));
```

`getStats` returns a `GraphStats` object:

```
{
  totalNodes: 3,
  byStatus: { completed: 3, running: 0, failed: 0, hung: 0, timeout: 0 },
  byType:   { agent: 2, tool: 1, subagent: 0, wait: 0, decision: 0, custom: 0 },
  depth: 1,
  duration: 12,   // milliseconds
  failureCount: 0,
  hungCount: 0
}
```

## Node types

| Type | When to use |
|---|---|
| `agent` | A reasoning step — the top-level agent or an LLM call |
| `tool` | A tool call (API, database query, shell command) |
| `subagent` | A spawned child agent running in a separate process or thread |
| `decision` | A branching point (e.g. router deciding which path to take) |
| `wait` | A pause waiting on an external event or human input |
| `custom` | Anything else you want to track |

## Node statuses

Nodes start in `running` and transition to one of:

| Status | Set by |
|---|---|
| `completed` | `builder.endNode(id)` — default |
| `failed` | `builder.failNode(id, error)` or `builder.endNode(id, 'failed')` |
| `hung` | `builder.endNode(id, 'hung')` — for manually detected hangs |
| `timeout` | `builder.endNode(id, 'timeout')` |

If any node ends in `failed`, `hung`, or `timeout`, the whole graph's `status` becomes `'failed'`.

## Recording a failure

```typescript
const fetchId = builder.startNode({ type: 'tool', name: 'fetch-prices', parentId: rootId });

try {
  // ... your tool logic ...
  builder.endNode(fetchId);
} catch (err) {
  builder.failNode(fetchId, err as Error);
  // node.metadata.error is set automatically
}
```

## Attaching metadata

Pass a `metadata` object when starting a node to record arbitrary context:

```typescript
const toolId = builder.startNode({
  type: 'tool',
  name: 'llm-call',
  parentId: rootId,
  metadata: { model: 'claude-3-5-sonnet', tokens: 1024 },
});
```

You can also update state mid-execution:

```typescript
builder.updateState(toolId, { tokensUsed: 847, cached: false });
```

## The graph object

`builder.build()` returns a frozen `ExecutionGraph`:

```typescript
interface ExecutionGraph {
  readonly id: string;                              // unique graph ID
  readonly agentId: string;                         // from config
  readonly trigger: string;                         // from config
  readonly rootNodeId: string;                      // ID of the first node
  readonly nodes: ReadonlyMap<string, ExecutionNode>; // all nodes by ID
  readonly edges: readonly ExecutionEdge[];         // parent→child relationships
  readonly startTime: number;                       // epoch ms
  readonly endTime: number | null;                  // null if still running
  readonly status: 'running' | 'completed' | 'failed';
  readonly events: readonly TraceEvent[];           // full ordered event log
}
```

Edges are created automatically when you pass `parentId` to `startNode`. The default edge type is `'spawned'`. You can add explicit edges with `builder.addEdge(from, to, type)` using types `'spawned'`, `'waited_on'`, `'called'`, `'retried'`, or `'branched'`.

## Using `withParent` for nested scopes

If you have deeply nested code, `withParent` lets child `startNode` calls inherit a parent automatically:

```typescript
builder.withParent(rootId, () => {
  // parentId is implicit here
  const toolId = builder.startNode({ type: 'tool', name: 'search' });
  builder.endNode(toolId);
});
```

---

Next: [Process mining](./process-mining.md) — discover patterns, variants, and bottlenecks across multiple runs.
