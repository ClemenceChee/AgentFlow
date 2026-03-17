# AgentFlow — POC Super Prompt (Adapted)

## Add Runtime Guards, Visualization & Trace CLI to AgentFlow

---

## How to Run

Save this file as `PROMPT.md` in the agentflow directory. Then paste this into your terminal:

```bash
cd /home/trader/agentflow
ITER=0; while true; do
  ITER=$((ITER + 1))
  echo "=== Ralph loop iteration $ITER ==="
  cat PROMPT.md | claude -p --allowedTools 'Bash(*)' 'Read(*)' 'Write(*)'
  if [ -f ".agentflow_done" ]; then echo "All tasks complete."; break; fi
  if [ "$ITER" -ge 20 ]; then echo "Max iterations reached."; break; fi
  sleep 3
done
```

Then walk away. Review `IMPLEMENTATION_PLAN.md` and `git log` for progress.

---

## Autonomous Loop Protocol

You are an autonomous agent running inside a Ralph Wiggum loop. Each invocation gives you fresh context. Your progress lives on disk (files, git history), not in memory.

**On every invocation:**

1. `cd /home/trader/agentflow`. Run `npm install` only if `node_modules` is missing.
2. Check if `IMPLEMENTATION_PLAN.md` exists. If not, create it by writing the plan from the section below to disk.
3. Read `IMPLEMENTATION_PLAN.md`. Find the first unchecked task (`- [ ]`). Skip any marked `BLOCKED:`.
4. Implement that ONE task. Do not work on multiple tasks.
5. Run the verification command for that task's phase.
6. If it passes: mark the task `- [x]` in `IMPLEMENTATION_PLAN.md`, then `git add -A && git commit -m "feat(scope): description"`.
7. If it fails: fix it. If still failing after 2 attempts, write `BLOCKED: [reason]` next to the task, commit, move on.
8. After completing or blocking your task, check: are ALL tasks done? If yes, run `npm run build && npm test && npm run lint`. If everything passes, run `touch .agentflow_done` and stop.
9. If tasks remain, just exit. The loop restarts you with fresh context.

**Rules:**
- One task per invocation. This keeps context focused.
- Read from disk first. Your only memory between invocations is the filesystem and git.
- Commit after every completed task. Commits are your checkpoints.
- Never delete or weaken tests to make them pass.
- If `npm test` hangs, check for unresolved promises or missing test teardown.

---

## Role

You are a systems engineer extending an existing observability framework for AI agents. You are methodical and test-driven. You do not over-abstract. You ship working code in small increments and verify each increment before moving on.

---

## Project Context

**Directory**: `/home/trader/agentflow`
**Language**: TypeScript monorepo (npm workspaces, Vitest, Biome)
**Packages**: `packages/core` (CLI + graph engine), `packages/dashboard` (web UI), `packages/storage` (SQLite)
**Existing tests**: 85 passing — do not break them

### What Already Exists (DO NOT REBUILD)

AgentFlow already has a complete tracing primitive layer. You MUST build on top of it, not alongside it.

**Existing types** (`packages/core/src/types.ts`):
- `ExecutionNode` — a single step (agent, tool, subagent, wait, decision, custom)
- `ExecutionGraph` — the complete trace (nodes as ReadonlyMap, edges, events, traceId/spanId)
- `TraceEvent` — timestamped events on nodes
- `NodeStatus` — 'running' | 'completed' | 'failed' | 'hung' | 'timeout'
- `NodeType` — 'agent' | 'tool' | 'subagent' | 'wait' | 'decision' | 'custom'
- `GraphBuilder` — mutable builder interface (startNode, endNode, failNode, pushEvent, withParent, build)
- `AgentFlowConfig` — includes timeout config (default, tool, agent) — accepted but not enforced yet

**Existing graph builder** (`packages/core/src/graph-builder.ts`):
- `createGraphBuilder(config)` — closure-based factory, returns `GraphBuilder`
- Counter-based IDs (node_001...), injectable ID generator
- Deep freeze on `build()`, snapshot via `getSnapshot()`
- Distributed tracing: auto-generates traceId/spanId, reads AGENTFLOW_TRACE_ID env var

**Existing queries** (`packages/core/src/graph-query.ts`):
- `getStats()`, `getFailures()`, `getHungNodes()`, `getCriticalPath()`
- `getChildren()`, `getParent()`, `getSubtree()`, `getDepth()`, `getDuration()`
- All pure functions, no side effects

**Existing serialization** (`packages/core/src/loader.ts`):
- `graphToJson(graph)` — serialize to JSON-safe object
- `loadGraph(input)` — deserialize from string or object, handles 3 formats

**Existing distributed tracing** (`packages/core/src/graph-stitch.ts`):
- `stitchTrace(graphs)` — merge multiple graphs into DistributedTrace
- `groupByTraceId(graphs)`, `getTraceTree(trace)`

**Existing CLI** (`packages/core/src/cli.ts`):
- `agentflow run` — wrap commands with tracing
- `agentflow live` — real-time terminal dashboard
- `agentflow watch` — headless alerting with --alert-on and --notify

**Your mission**: Add three capabilities that DON'T exist yet:
1. **Runtime guards** — detect stuck agents, reasoning loops, and spawn explosions during graph construction
2. **Trace visualization** — ASCII tree and timeline rendering of ExecutionGraphs
3. **Trace CLI commands** — `agentflow trace list|show|timeline|stuck|loops` for inspecting saved traces

---

## Architecture Principles

1. **Zero extra dependencies.** Use only what's already in the repo. Core has zero deps — keep it that way.
2. **Build on existing primitives.** Guards operate on `GraphBuilder`/`ExecutionGraph`. Visualization renders `ExecutionGraph`. CLI uses `loadGraph()` to read traces.
3. **OTel-compatible attribute names.** Use `gen_ai.*` prefixed keys in `ExecutionNode.metadata` so traces can be exported to OTel later. We are NOT building the exporter in this POC.
4. **Additive, not breaking.** Existing commands (`watch`, `live`, `run`) must still work. All 85 tests must pass.
5. **Pure functions for queries, closures for stateful logic.** Match the existing patterns.

---

## Guard Design

Guards hook into the graph builder to detect problems during construction. They do NOT create a parallel type system — they consume `ExecutionNode`, `ExecutionGraph`, and `TraceEvent` directly.

### Guard Types

1. **Long-running span**: Flag nodes still in `running` status after a configurable timeout per `NodeType`:
   - `tool`: 30s (default)
   - `agent`/`subagent`: 300s (default)
   - `wait`: 600s (default)
   - Uses the existing `AgentFlowConfig.timeout` shape

2. **Reasoning loop**: Detect when an agent spawns > N consecutive nodes of the same type with similar names (default: 25). Bonus: flag >90% text similarity in `metadata` between consecutive nodes.

3. **Spawn explosion**: Max depth (default 10) and max total `agent`/`subagent` node count (default 50).

### Guard API

```typescript
// New file: packages/core/src/guards.ts
import type { ExecutionGraph, NodeType } from './types.js';

interface GuardConfig {
  timeouts?: Partial<Record<NodeType, number>>;
  maxReasoningSteps?: number;
  maxDepth?: number;
  maxAgentSpawns?: number;
  onViolation?: 'warn' | 'error' | 'abort';
}

interface GuardViolation {
  type: 'timeout' | 'reasoning-loop' | 'spawn-explosion';
  nodeId: string;
  message: string;
  timestamp: number;
}

// Pure function: check an ExecutionGraph (or snapshot) for violations
function checkGuards(graph: ExecutionGraph, config?: GuardConfig): readonly GuardViolation[];

// Factory: create a guard-aware wrapper around GraphBuilder
function withGuards(builder: GraphBuilder, config?: GuardConfig): GraphBuilder;
```

Guards record violations as `TraceEvent` entries (eventType: `'custom'`, data includes violation info) so they appear in the trace timeline.

---

## Visualization Design

Visualization functions take an `ExecutionGraph` and return formatted strings. They do NOT read files or manage I/O.

```typescript
// New file: packages/core/src/visualize.ts

// ASCII tree — shows parent-child hierarchy
function toAsciiTree(graph: ExecutionGraph): string;
// Example output:
// ✓ main (agent) 4.2s
// ├─ ✓ search (tool) 1.1s
// ├─ ⏳ planner (subagent) 2.8s [TIMEOUT]
// │  ├─ ✓ lookup (tool) 0.3s
// │  └─ ✗ analyze (tool) 0.5s — Error: rate limit
// └─ ✓ respond (tool) 0.3s

// Timeline — horizontal waterfall
function toTimeline(graph: ExecutionGraph): string;
// Example output:
// 0s        1s        2s        3s        4s
// ├─────────┼─────────┼─────────┼─────────┤
// ████████████████████████████████████████── main (4.2s)
//  ██████████─────────────────────────────── search (1.1s)
//            █████████████████████████████── planner (2.8s) ⚠ TIMEOUT
//            ████─────────────────────────── lookup (0.3s)
//                 ██████──────────────────── analyze (0.5s) ✗
//                                     ████─ respond (0.3s)
```

Status icons: `✓` completed, `✗` failed, `⏳` running/hung/timeout
Show guard violations inline with `⚠` markers.
Show `gen_ai.*` attributes (model, token counts) when present in metadata.

---

## Trace Store Design

A lightweight JSON file store for traces. One file per trace, using the existing `graphToJson()` / `loadGraph()` for serialization.

```typescript
// New file: packages/core/src/trace-store.ts

interface TraceStore {
  save(graph: ExecutionGraph): Promise<string>;    // returns file path
  get(graphId: string): Promise<ExecutionGraph | null>;
  list(opts?: { status?: GraphStatus; limit?: number }): Promise<ExecutionGraph[]>;
  getStuckSpans(): Promise<ExecutionNode[]>;        // nodes with status running/hung/timeout
  getReasoningLoops(threshold?: number): Promise<Array<{ graphId: string; nodes: ExecutionNode[] }>>;
}

function createTraceStore(dir: string): TraceStore;
```

File naming: `{graphId}.json` in the configured directory. Compatible with `agentflow watch` auto-detection.

---

## CLI Design

Add a `trace` subcommand to the existing CLI router in `packages/core/src/cli.ts`.

```
agentflow trace list [--status <status>] [--limit <n>]
agentflow trace show <graph-id>           # ASCII tree
agentflow trace timeline <graph-id>       # Waterfall view
agentflow trace stuck                     # All stuck/hung/timeout nodes across traces
agentflow trace loops                     # Detected reasoning loops
```

Also extend `agentflow watch` with `--alert-on reasoning-loop` support.

---

## IMPLEMENTATION_PLAN.md

On your first iteration, write this to `./IMPLEMENTATION_PLAN.md`. On subsequent iterations it will already exist — just read it and continue.

```markdown
# AgentFlow POC — Implementation Plan

## Phase 1 — Runtime Guards
Verify after each task: `npm run build && npm test && npm run lint`

- [ ] 1.1 Create `packages/core/src/guards.ts` — types: `GuardConfig`, `GuardViolation`. Pure function `checkGuards(graph, config?)` that inspects an ExecutionGraph for three violation types: timeout (per NodeType), reasoning-loop (consecutive same-type nodes), spawn-explosion (depth + count). Returns `readonly GuardViolation[]`.
- [ ] 1.2 Add `withGuards(builder, config?)` factory in `guards.ts` — wraps a `GraphBuilder`, intercepts `endNode`/`build` to run `checkGuards` on snapshots. On violation: 'warn' logs via config logger, 'error' pushes TraceEvent, 'abort' throws. Returns a `GraphBuilder` with identical interface.
- [ ] 1.3 Export guards from `packages/core/src/index.ts` — add `checkGuards`, `withGuards`, and types `GuardConfig`, `GuardViolation` to the barrel export.
- [ ] 1.4 Write `tests/core/guards.test.ts` — test timeout detection (tool at 30s, agent at 300s), reasoning loop (>25 consecutive same-type nodes), spawn explosion (depth >10, agent count >50), abort throws, warn emits event, no false positives on healthy graphs, custom config overrides.
- [ ] 1.5 Verify: `npm run build && npm test && npm run lint` — all pass including original 85

## Phase 2 — Trace Visualization
Verify after each task: `npm run build && npm test && npm run lint`

- [ ] 2.1 Create `packages/core/src/visualize.ts` — `toAsciiTree(graph)` renders a tree with status icons (✓ ✗ ⏳), durations, guard violation markers (⚠), and gen_ai.* metadata (model, tokens) when present. Uses `getChildren()` from graph-query.ts for traversal.
- [ ] 2.2 Add `toTimeline(graph)` in `visualize.ts` — horizontal waterfall showing span start/end relative to graph start. Scale adapts to total duration. Shows status icons and violation warnings inline.
- [ ] 2.3 Export visualization from `packages/core/src/index.ts` — add `toAsciiTree`, `toTimeline`.
- [ ] 2.4 Write `tests/core/visualize.test.ts` — test: single node, nested 3-level tree, concurrent siblings, failed/hung nodes show correct icons, guard violations show ⚠, empty graph edge case, timeline scaling, gen_ai attributes displayed.
- [ ] 2.5 Verify: `npm run build && npm test && npm run lint` — all pass

## Phase 3 — JSON Trace Store
Verify after each task: `npm run build && npm test && npm run lint`

- [ ] 3.1 Create `packages/core/src/trace-store.ts` — `createTraceStore(dir)` factory returning `TraceStore` interface. Uses `graphToJson()`/`loadGraph()` for serialization. One JSON file per graph (`{graphId}.json`). `save()`, `get()`, `list()` with optional status filter and limit.
- [ ] 3.2 Add query methods to TraceStore: `getStuckSpans()` scans all traces for nodes with status running/hung/timeout. `getReasoningLoops(threshold?)` scans for consecutive same-type node sequences exceeding threshold.
- [ ] 3.3 Export trace store from `packages/core/src/index.ts` — add `createTraceStore` and type `TraceStore`.
- [ ] 3.4 Write `tests/core/trace-store.test.ts` — save/load round-trip, list with status filter, list with limit, getStuckSpans returns correct nodes, getReasoningLoops detection, empty directory, file matches loadGraph format. Use tmp directories for isolation.
- [ ] 3.5 Verify: `npm run build && npm test && npm run lint` — all pass

## Phase 4 — CLI Trace Commands
Verify after each task: `npm run build && npm test && npm run lint`

- [ ] 4.1 Create `packages/core/src/trace-cli.ts` — handler functions for trace subcommands: `traceList(argv)`, `traceShow(argv)`, `traceTimeline(argv)`, `traceStuck(argv)`, `traceLoops(argv)`. Each parses its own flags, uses `createTraceStore()` for data and `toAsciiTree()`/`toTimeline()` for display.
- [ ] 4.2 Wire trace subcommands into `packages/core/src/cli.ts` — add `trace` to the command router. `agentflow trace list|show|timeline|stuck|loops`. Add `--traces-dir` flag (default: ./traces).
- [ ] 4.3 Add `--alert-on reasoning-loop` support to `agentflow watch` — extend `AlertCondition` in `watch-types.ts`, detection logic in `watch-state.ts`, and parsing in `watch.ts`. When enabled, watch loads traces via `createTraceStore()` and checks for reasoning loops each poll cycle.
- [ ] 4.4 Write `tests/core/trace-cli.test.ts` — test argument parsing for each subcommand, verify correct store/visualize function calls. Use fixture traces.
- [ ] 4.5 Verify: `npm run build && npm test && npm run lint` — all pass

## Phase 5 — Integration & Polish
Verify: `npm run build && npm test && npm run lint`

- [ ] 5.1 Update `packages/core/src/runner.ts` — after saving traces, print a hint: `Run "agentflow trace show <id>" to inspect`. Optionally wrap builder with `withGuards()` if guard config is provided.
- [ ] 5.2 End-to-end smoke test: write `tests/core/trace-integration.test.ts` — programmatically create a graph with guards, save to store, load it, render tree and timeline, verify round-trip fidelity.
- [ ] 5.3 Update CLAUDE.md — add new files to Project Structure, add `trace` to CLI commands, document guard and visualization APIs in Usage section.
- [ ] 5.4 Verify: all tests pass (original 85 + new), build clean, lint clean.

## Final Verification

- [ ] F.1 All tests pass: `npm run build && npm test`
- [ ] F.2 Linter clean: `npm run lint`
- [ ] F.3 Original 85 tests still pass unchanged
- [ ] F.4 Smoke test: create trace with guards, save to JSON, display with `agentflow trace show`
```

---

## Coding Standards

Match the existing codebase patterns exactly:

- TypeScript strict mode. No `any` except test fixtures.
- **Functions + interfaces, not classes.** Use closure-based factories (like `createGraphBuilder`). Classes only if genuinely needed for statefulness.
- **Immutable by default**: `Readonly<T>`, `ReadonlyMap`, `Object.freeze()`. Match the deep-freeze pattern in graph-builder.ts.
- **Pure functions for queries.** Guards checking and visualization are pure — they take an ExecutionGraph and return data.
- **String literal unions, not enums.** Match `NodeType`, `NodeStatus` style.
- Every public function has JSDoc comments and at least one test.
- Test behavior, not implementation. Descriptive test names.
- No mocks for core logic. Mock only I/O (filesystem in trace-store tests).
- File naming: kebab-case (`guards.ts`, `trace-store.ts`, `visualize.ts`).
- Use existing test patterns: see `tests/core/graph-builder.test.ts` for reference (helper builders, deterministic IDs).

### File Organization

```
packages/core/src/
├── ... (existing files unchanged)
├── guards.ts          # Runtime guard detection
├── visualize.ts       # ASCII tree + timeline rendering
├── trace-store.ts     # JSON file-based trace storage
└── trace-cli.ts       # CLI handlers for trace subcommands

tests/core/
├── ... (existing test files unchanged)
├── guards.test.ts
├── visualize.test.ts
├── trace-store.test.ts
├── trace-cli.test.ts
└── trace-integration.test.ts
```

---

## Anti-Patterns to Avoid

- **Rebuilding what exists.** Do NOT create new Span/Trace types. Use ExecutionNode/ExecutionGraph.
- **God objects.** Separate concerns: guards, visualization, storage, CLI.
- **Premature abstraction.** No `AbstractGuardProvider`. Start concrete.
- **Circular dependencies.** guards.ts imports from types.ts and graph-query.ts only. visualize.ts imports from types.ts and graph-query.ts only. trace-store.ts imports from types.ts and loader.ts only.
- **Breaking existing tests.** The 85 existing tests must pass at all times. Run them after every change.
- **Adding dependencies to core.** Core has zero runtime deps. Keep it that way.

---

## Success Criteria

```typescript
import {
  createGraphBuilder,
  withGuards,
  checkGuards,
  createTraceStore,
  toAsciiTree,
  toTimeline,
} from 'agentflow-core';

// Guards wrap the existing builder
const raw = createGraphBuilder({ agentId: 'research', trigger: 'user' });
const builder = withGuards(raw, { maxDepth: 5, onViolation: 'error' });

const root = builder.startNode({ type: 'agent', name: 'Planner' });
const tool = builder.startNode({ type: 'tool', name: 'WebSearch', parentId: root });
builder.endNode(tool);
builder.endNode(root);

const graph = builder.build();

// Visualization
console.log(toAsciiTree(graph));
console.log(toTimeline(graph));

// Storage
const store = createTraceStore('./traces');
await store.save(graph);
const loaded = await store.get(graph.id);
const stuck = await store.getStuckSpans();
```

```bash
# CLI commands
agentflow trace list --status failed --limit 10
agentflow trace show abc-123          # ASCII lineage tree
agentflow trace timeline abc-123      # Waterfall view
agentflow trace stuck                 # All stuck spans
agentflow trace loops                 # Reasoning loop detection

# Extended watch
agentflow watch ./traces --alert-on reasoning-loop --notify stdout
```

---

## Future Work (NOT in this POC)

- OTel OTLP exporter (traces are already OTel-attribute-compatible)
- Framework adapters (LangChain, CrewAI, Mastra)
- Web dashboard integration (packages/dashboard)
- Python SDK (packages/python)
- Similarity-based reasoning loop detection (cosine similarity on metadata)
