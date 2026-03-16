# Installation Guide

## Requirements

- **Node.js** 20 or later
- **npm** 10 or later (ships with Node.js 20+)

## Install from npm

```bash
npm install -g agentflow-core
```

That's it. The core package has **zero runtime dependencies**.

## Quick start

```bash
# Monitor your agent data directory
agentflow live ./data

# Set up alerts
agentflow watch ./data --alert-on error --alert-on stale:15m --notify telegram

# Inspect saved traces
agentflow trace list --traces-dir ./traces
agentflow trace show <trace-id> --traces-dir ./traces

# Wrap any command with tracing
agentflow run -- python my_agent.py
```

## Install from source

### 1. Clone the repository

```bash
git clone https://github.com/ClemenceChee/AgentFlow.git
cd AgentFlow
```

### 2. Install dependencies

```bash
npm install
```

This installs dev dependencies (TypeScript, Vitest, Biome, tsup) at the workspace root. The core package itself has no dependencies.

### 3. Verify the installation

```bash
# Run the test suite (125 tests)
npm test

# Type-check the project
npm run typecheck

# Run the demo
npx tsx examples/demo.ts
```

You should see all tests pass and the demo print an execution summary.

### 4. Build for production

```bash
npm run build
```

This produces `packages/core/dist/` with:
- `index.js` — ESM bundle
- `index.cjs` — CommonJS bundle
- `index.d.ts` — TypeScript declarations
- `cli.js` — CLI entry point

## Usage in your project

### ESM (recommended)

```typescript
import {
  createGraphBuilder, withGuards, checkGuards,
  createTraceStore, toAsciiTree, toTimeline,
  getStats, loadGraph, graphToJson
} from 'agentflow-core';
```

### CommonJS

```javascript
const {
  createGraphBuilder, withGuards, checkGuards,
  createTraceStore, toAsciiTree, toTimeline,
  getStats, loadGraph, graphToJson
} = require('agentflow-core');
```

## Troubleshooting

### `ERR_MODULE_NOT_FOUND` when importing

Make sure your `tsconfig.json` uses `"module": "NodeNext"` and `"moduleResolution": "NodeNext"`, or that your bundler is configured to resolve the `exports` field in `package.json`.

### Tests fail with `vitest: command not found`

Run `npm install` at the project root first — Vitest is a dev dependency of the workspace.

### Build fails with TypeScript errors

Ensure you're using TypeScript 5.7+ (`npx tsc --version`). The project uses strict mode with `noUncheckedIndexedAccess`.
