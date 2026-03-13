# AgentFlow — Universal Execution Tracing for AI Agent Systems
## What This Project Is
AgentFlow is a framework-agnostic execution tracing layer for AI agent systems. It captures the full execution graph of agent runs — every agent, subagent, spawned process, state transition, and temporal relationship — and produces queryable, structured execution records.
AgentFlow is NOT a logging library. It reconstructs process graphs, not log streams.
## Architecture
AgentFlow is a monorepo with independent packages:
- **`packages/core`** — Zero-dependency core: types, graph builder, graph query. The foundation everything else builds on.
- **`packages/writers`** (future) — Output adapters: console, JSON, Markdown/vault, HTML.
- **`packages/adapters`** (future) — Framework adapters: LangChain, CrewAI, Mastra, OpenClaw, etc.
- **`packages/cli`** (future) — CLI tool for inspecting execution traces.
## Quick Start
```bash
# Install dependencies
npm install

# Run tests
npm test

# Run demo
npx tsx examples/demo.ts

# Typecheck
npm run typecheck

# Build
npm run build

# Lint
npm run lint
```
## Usage
```typescript
import { createGraphBuilder, getStats, getFailures } from 'agentflow';

const builder = createGraphBuilder({
  agentId: 'my-agent',
  trigger: 'user-request',
});

const root = builder.startNode({ type: 'agent', name: 'main' });
const tool = builder.startNode({ type: 'tool', name: 'search', parentId: root });
builder.endNode(tool);
builder.endNode(root);

const graph = builder.build();
const stats = getStats(graph);
// { totalNodes: 2, failureCount: 0, depth: 1, ... }
```
## Tech Stack
- **Language**: TypeScript (strict mode)
- **Runtime**: Node.js 20+
- **Build**: tsx for development, tsup for production build
- **Testing**: Vitest
- **Linting**: Biome
- **Structure**: npm workspaces monorepo
- **No frameworks**: No Express, no Fastify. This is a library/SDK, not a server.
## Coding Standards
- Pure functions where possible. Side effects only at boundaries.
- No classes unless genuinely needed for statefulness. Prefer interfaces + functions.
- All public APIs must have JSDoc comments.
- Error handling: never swallow errors silently. This project exists because silent failures are the problem.
- Every module must have unit tests. Test the execution graph logic thoroughly.
- File naming: kebab-case. `execution-graph.ts`, `trace-collector.ts`.
- Imports: use Node.js native modules where possible. Minimise dependencies.
- Zero dependencies in core. Writers and adapters may add deps as needed.
## Project Structure
```
agentflow/
├── packages/
│   └── core/
│       ├── src/
│       │   ├── types.ts           # All interfaces and union types
│       │   ├── graph-builder.ts   # createGraphBuilder() factory
│       │   ├── graph-query.ts     # Pure query functions
│       │   └── index.ts           # Public API barrel
│       ├── package.json           # "agentflow", zero deps
│       ├── tsconfig.json          # Extends root base
│       └── tsconfig.build.json    # For tsup (no composite)
├── tests/
│   └── core/
│       ├── types.test.ts
│       ├── graph-builder.test.ts
│       └── graph-query.test.ts
├── examples/
│   └── demo.ts
├── package.json                   # Workspace root
├── tsconfig.json                  # Project references
├── tsconfig.base.json             # Shared compiler options
├── vitest.config.ts               # @agentflow/core alias
├── biome.json
└── CLAUDE.md
```
## Key Design Decisions
1. **Zero deps in core**: The core package has no runtime dependencies. `Map<string, ExecutionNode>` for nodes, counter-based IDs, no crypto.
2. **Map over Record**: `ExecutionGraph.nodes` is a `ReadonlyMap` — more idiomatic for runtime lookups. Writers handle serialization to JSON/YAML as needed.
3. **Framework-agnostic**: Core knows nothing about any agent framework. Adapters translate framework events into graph builder calls.
4. **Library, not service**: AgentFlow is imported into the agent runtime, not run as a separate process. Zero network overhead.
5. **Human-readable by design**: Every execution record opens in a text editor. Git log shows what changed.
6. **Closure-based factories**: `createGraphBuilder()` returns an interface backed by closure state, not a class. Keeps the API surface clean and testable.
7. **Deep freeze on build**: `build()` returns a deeply frozen `ExecutionGraph`. No accidental mutation.
## What NOT to Build
- No web UI (yet). Terminal visualisation first.
- No database. Filesystem only for persistence.
- No agent runtime. That's the framework's job.
- No LLM calls. AgentFlow observes, it does not reason.
