# AgentFlow

Universal execution tracing for AI agent systems.

AgentFlow captures the full execution graph of agent runs — every agent, subagent, tool call, decision point, and temporal relationship — and produces queryable, structured execution records.

AgentFlow is **not** a logging library. It reconstructs process graphs, not log streams.

## Features

- **Framework-agnostic** — works with LangChain, CrewAI, Mastra, or any custom agent system
- **Zero dependencies** — core package has no runtime dependencies
- **Queryable graphs** — find failures, hung nodes, critical paths, subtrees, and more
- **Immutable output** — `build()` returns a deeply frozen execution graph
- **Snapshot support** — inspect the graph mid-flight without finalizing
- **Trace events** — record structured events at any point during execution
- **TypeScript-first** — strict types, full IntelliSense, no `any`

## Installation

```bash
npm install agentflow
```

Requires Node.js 20+.

## Quick Start

```typescript
import { createGraphBuilder, getStats, getFailures } from 'agentflow';

// 1. Create a builder
const builder = createGraphBuilder({
  agentId: 'my-agent',
  trigger: 'user-request',
});

// 2. Build an execution graph
const root = builder.startNode({ type: 'agent', name: 'main' });

const search = builder.startNode({ type: 'tool', name: 'web-search', parentId: root });
builder.endNode(search);

const analysis = builder.startNode({ type: 'tool', name: 'analysis', parentId: root });
builder.endNode(analysis);

builder.endNode(root);

// 3. Finalize and query
const graph = builder.build();
const stats = getStats(graph);
console.log(stats);
// { totalNodes: 3, failureCount: 0, depth: 1, ... }
```

## API Reference

### Graph Construction

#### `createGraphBuilder(config?)`

Creates a new graph builder instance. Returns a `GraphBuilder` interface.

```typescript
const builder = createGraphBuilder({
  agentId: 'portfolio-recon',   // Identifier for the agent
  trigger: 'user-request',      // What triggered the run
  name: 'Portfolio Recon Run',  // Optional human-readable name
  idGenerator: () => myId(),    // Optional custom ID generator
});
```

#### `builder.startNode(options)`

Starts a new execution node. Returns the node ID.

```typescript
const nodeId = builder.startNode({
  type: 'agent',        // 'agent' | 'tool' | 'subagent' | 'wait' | 'decision' | 'custom'
  name: 'web-search',
  parentId: rootId,     // Optional parent node
  metadata: {},         // Optional arbitrary metadata
});
```

#### `builder.endNode(nodeId)`

Marks a node as completed.

#### `builder.failNode(nodeId, error)`

Marks a node as failed with an error message.

#### `builder.updateState(nodeId, state)`

Merges state into a node's metadata.

#### `builder.withParent(parentId, fn)`

Runs a function where all `startNode()` calls without an explicit `parentId` are automatically parented to `parentId`.

```typescript
builder.withParent(agentId, () => {
  const a = builder.startNode({ type: 'tool', name: 'step-a' }); // auto-parented
  builder.endNode(a);
  const b = builder.startNode({ type: 'tool', name: 'step-b' }); // auto-parented
  builder.endNode(b);
});
```

#### `builder.pushEvent(event)`

Records a trace event on a node.

```typescript
builder.pushEvent({
  nodeId: toolId,
  type: 'tool_start',
  data: { query: 'AAPL' },
});
```

#### `builder.build()`

Finalizes and returns a deeply frozen `ExecutionGraph`. The builder cannot be used after this.

#### `builder.getSnapshot()`

Returns a frozen snapshot of the current graph state without finalizing. The builder remains usable.

### Graph Querying

All query functions are pure and take a frozen `ExecutionGraph` as their first argument.

| Function | Description |
|---|---|
| `getNode(graph, id)` | Get a single node by ID |
| `getChildren(graph, id)` | Get direct children of a node |
| `getParent(graph, id)` | Get the parent of a node |
| `getSubtree(graph, id)` | Get a node and all its descendants |
| `getFailures(graph)` | Get all failed nodes |
| `getHungNodes(graph)` | Get nodes still in `running` status |
| `getCriticalPath(graph)` | Get the longest execution path |
| `findWaitingOn(graph, id)` | Find nodes waiting on a given node |
| `getDepth(graph)` | Get the maximum nesting depth |
| `getDuration(graph)` | Get total execution duration in ms |
| `getStats(graph)` | Get aggregate statistics |

#### `getStats(graph)` return value

```typescript
{
  totalNodes: number;
  byStatus: { running: number; completed: number; failed: number; timeout: number };
  byType: { agent: number; tool: number; subagent: number; /* ... */ };
  depth: number;
  duration: number;
  failureCount: number;
  hungCount: number;
}
```

## Architecture

AgentFlow is a monorepo with independent packages:

```
agentflow/
├── packages/
│   └── core/          # Zero-dep core: types, graph builder, graph query
├── tests/
│   └── core/          # 60 tests covering builder, query, and types
├── examples/
│   └── demo.ts        # Full worked example
└── CLAUDE.md          # Coding standards and design decisions
```

Future packages (not yet implemented):

- **`packages/writers`** — Output adapters: console, JSON, Markdown, HTML
- **`packages/adapters`** — Framework adapters: LangChain, CrewAI, Mastra, etc.
- **`packages/cli`** — CLI for inspecting execution traces

## Design Decisions

- **Zero dependencies in core** — `Map<string, ExecutionNode>` for nodes, counter-based IDs, no crypto
- **`ReadonlyMap` for nodes** — more idiomatic for runtime lookups; writers handle serialization
- **Closure-based factories** — `createGraphBuilder()` returns an interface backed by closure state, not a class
- **Deep freeze on build** — `build()` returns a deeply frozen `ExecutionGraph`; no accidental mutation
- **Library, not service** — imported into your agent runtime, not run as a separate process

## Development

```bash
# Install dependencies
npm install

# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Type-check
npm run typecheck

# Build
npm run build

# Lint
npm run lint

# Run demo
npx tsx examples/demo.ts
```

## License

MIT
