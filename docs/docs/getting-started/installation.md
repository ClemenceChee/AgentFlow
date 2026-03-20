---
sidebar_position: 1
title: Installation
---

# Installation

AgentFlow ships as two packages: `agentflow-core` (the zero-dependency library you embed in your agent code) and `agentflow-dashboard` (the React dashboard + CLI for visualisation). This guide covers the core library.

## Requirements

- **Node.js 20 or later** — the library uses `node:crypto` for UUID generation and targets the ESM module system.
- **TypeScript 5+** recommended for full type inference (strict mode works cleanly).

## Install

```bash
npm install agentflow-core
```

There are no transitive runtime dependencies. The package ships both ESM and CJS builds with bundled type declarations.

## Import

### ESM (recommended)

```typescript
import {
  createGraphBuilder,
  discoverProcess,
  findVariants,
  getBottlenecks,
  checkConformance,
  checkGuards,
  withGuards,
} from 'agentflow-core';
```

### CommonJS

```javascript
const {
  createGraphBuilder,
  discoverProcess,
  findVariants,
  getBottlenecks,
} = require('agentflow-core');
```

## Quick verify

Run this snippet to confirm the package is installed and imports correctly:

```typescript
import { createGraphBuilder, getStats } from 'agentflow-core';

const builder = createGraphBuilder({ agentId: 'verify', trigger: 'install-check' });
const rootId = builder.startNode({ type: 'agent', name: 'main' });
builder.endNode(rootId);
const graph = builder.build();

console.log('Graph ID:', graph.id);
console.log('Stats:', getStats(graph));
// Stats: { totalNodes: 1, byStatus: { completed: 1, ... }, depth: 0, duration: ..., ... }
```

If you see the graph ID printed without errors, the package is ready.

## Package contents

All public APIs are re-exported from the package root — you never need to import from deep paths.

| Category | Key exports |
|---|---|
| Graph construction | `createGraphBuilder`, `withGuards` |
| Graph queries | `getStats`, `getChildren`, `getDepth`, `getFailures`, `getHungNodes` |
| Process mining | `discoverProcess`, `findVariants`, `getBottlenecks`, `checkConformance` |
| Knowledge store | `createKnowledgeStore`, `createPolicySource` |
| Event emission | `createEventEmitter`, `createJsonEventWriter` |
| Insight engine | `createInsightEngine` (Tier 2 — bring your own LLM) |

## TypeScript configuration

The library ships full `.d.ts` declarations. No additional `@types/*` packages are needed. A minimal `tsconfig.json` that works with the ESM build:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true
  }
}
```

---

Next: [Your first trace](./first-trace.md) — build an execution graph and inspect its structure.
