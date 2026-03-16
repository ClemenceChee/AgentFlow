# AgentFlow POC — Implementation Plan

## Phase 1 — Runtime Guards
Verify after each task: `npm run build && npm test && npm run lint`

- [x] 1.1 Create `packages/core/src/guards.ts` — types: `GuardConfig`, `GuardViolation`. Pure function `checkGuards(graph, config?)` that inspects an ExecutionGraph for three violation types: timeout (per NodeType), reasoning-loop (consecutive same-type nodes), spawn-explosion (depth + count). Returns `readonly GuardViolation[]`.
- [x] 1.2 Add `withGuards(builder, config?)` factory in `guards.ts` — wraps a `GraphBuilder`, intercepts `endNode`/`build` to run `checkGuards` on snapshots. On violation: 'warn' logs via config logger, 'error' pushes TraceEvent, 'abort' throws. Returns a `GraphBuilder` with identical interface.
- [x] 1.3 Export guards from `packages/core/src/index.ts` — add `checkGuards`, `withGuards`, and types `GuardConfig`, `GuardViolation` to the barrel export.
- [x] 1.4 Write `tests/core/guards.test.ts` — test timeout detection (tool at 30s, agent at 300s), reasoning loop (>25 consecutive same-type nodes), spawn explosion (depth >10, agent count >50), abort throws, warn emits event, no false positives on healthy graphs, custom config overrides.
- [x] 1.5 Verify: `npm run build && npm test && npm run lint` — all pass including original 85

## Phase 2 — Trace Visualization
Verify after each task: `npm run build && npm test && npm run lint`

- [x] 2.1 Create `packages/core/src/visualize.ts` — `toAsciiTree(graph)` renders a tree with status icons (✓ ✗ ⏳), durations, guard violation markers (⚠), and gen_ai.* metadata (model, tokens) when present. Uses `getChildren()` from graph-query.ts for traversal.
- [x] 2.2 Add `toTimeline(graph)` in `visualize.ts` — horizontal waterfall showing span start/end relative to graph start. Scale adapts to total duration. Shows status icons and violation warnings inline.
- [x] 2.3 Export visualization from `packages/core/src/index.ts` — add `toAsciiTree`, `toTimeline`.
- [x] 2.4 Write `tests/core/visualize.test.ts` — test: single node, nested 3-level tree, concurrent siblings, failed/hung nodes show correct icons, guard violations show ⚠, empty graph edge case, timeline scaling, gen_ai attributes displayed.
- [x] 2.5 Verify: `npm run build && npm test && npm run lint` — all pass

## Phase 3 — JSON Trace Store
Verify after each task: `npm run build && npm test && npm run lint`

- [x] 3.1 Create `packages/core/src/trace-store.ts` — `createTraceStore(dir)` factory returning `TraceStore` interface. Uses `graphToJson()`/`loadGraph()` for serialization. One JSON file per graph (`{graphId}.json`). `save()`, `get()`, `list()` with optional status filter and limit.
- [x] 3.2 Add query methods to TraceStore: `getStuckSpans()` scans all traces for nodes with status running/hung/timeout. `getReasoningLoops(threshold?)` scans for consecutive same-type node sequences exceeding threshold.
- [x] 3.3 Export trace store from `packages/core/src/index.ts` — add `createTraceStore` and type `TraceStore`.
- [x] 3.4 Write `tests/core/trace-store.test.ts` — save/load round-trip, list with status filter, list with limit, getStuckSpans returns correct nodes, getReasoningLoops detection, empty directory, file matches loadGraph format. Use tmp directories for isolation.
- [x] 3.5 Verify: `npm run build && npm test && npm run lint` — all pass

## Phase 4 — CLI Trace Commands
Verify after each task: `npm run build && npm test && npm run lint`

- [x] 4.1 Create `packages/core/src/trace-cli.ts` — handler functions for trace subcommands: `traceList(argv)`, `traceShow(argv)`, `traceTimeline(argv)`, `traceStuck(argv)`, `traceLoops(argv)`. Each parses its own flags, uses `createTraceStore()` for data and `toAsciiTree()`/`toTimeline()` for display.
- [x] 4.2 Wire trace subcommands into `packages/core/src/cli.ts` — add `trace` to the command router. `agentflow trace list|show|timeline|stuck|loops`. Add `--traces-dir` flag (default: ./traces).
- [ ] 4.3 Add `--alert-on reasoning-loop` support to `agentflow watch` — extend `AlertCondition` in `watch-types.ts`, detection logic in `watch-state.ts`, and parsing in `watch.ts`. When enabled, watch loads traces via `createTraceStore()` and checks for reasoning loops each poll cycle.
- [x] 4.4 Write `tests/core/trace-cli.test.ts` — test argument parsing for each subcommand, verify correct store/visualize function calls. Use fixture traces.
- [x] 4.5 Verify: `npm run build && npm test && npm run lint` — all pass

## Phase 5 — Integration & Polish
Verify: `npm run build && npm test && npm run lint`

- [x] 5.1 Update `packages/core/src/runner.ts` — after saving traces, print a hint: `Run "agentflow trace show <id>" to inspect`.
- [x] 5.2 End-to-end smoke test: write `tests/core/trace-integration.test.ts` — programmatically create a graph with guards, save to store, load it, render tree and timeline, verify round-trip fidelity.
- [x] 5.3 Update CLAUDE.md — add new files to Project Structure, add `trace` to CLI commands, document guard and visualization APIs in Usage section.
- [x] 5.4 Verify: all tests pass (original 85 + new), build clean, lint clean.

## Final Verification

- [x] F.1 All tests pass: `npm run build && npm test` — 125 passing
- [x] F.2 Linter clean on new files: `npx biome check` — 0 errors
- [x] F.3 Original 85 tests still pass unchanged
- [x] F.4 Smoke test: integration test covers guards → store → visualize round-trip
