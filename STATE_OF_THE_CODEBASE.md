# State of the Codebase — AgentFlow Audit Baseline

**Date**: 2026-03-19
**Branch**: `restructure/agentflow-v2`
**Auditor**: Claude Code (autonomous restructure)

---

## Tech Stack Inventory

| Component | Technology | Version |
|-----------|-----------|---------|
| Language | TypeScript | 5.7+ (strict mode) |
| Runtime | Node.js | 20+ |
| Build (dev) | tsx | 4.19+ |
| Build (prod) | tsup | 8.4+ |
| Testing | Vitest | 3.0+ |
| Linting | Biome | 2.4.6 |
| Package Manager | npm workspaces | Monorepo |
| OTel SDK | @opentelemetry/* | 0.45/1.7+ |
| Database | better-sqlite3 | 9.2+ |
| File Watching | chokidar | 3.5+ |

---

## Directory Structure

```
agentflow/                        # Workspace root
├── packages/
│   ├── core/                     # Zero-dep core library (5,366 LoC)
│   │   └── src/
│   │       ├── types.ts          # 305 — All interfaces/union types
│   │       ├── graph-builder.ts  # 334 — createGraphBuilder() factory
│   │       ├── graph-query.ts    # 269 — Pure query functions
│   │       ├── graph-stitch.ts   #  78 — Distributed trace stitching
│   │       ├── guards.ts         # 274 — Runtime violation detection
│   │       ├── visualize.ts      # 220 — ASCII tree/timeline
│   │       ├── trace-store.ts    # 176 — JSON file persistence
│   │       ├── loader.ts         # 118 — Serialization/deserialization
│   │       ├── runner.ts         # 278 — CLI subprocess wrapper
│   │       ├── watch.ts          # 299 — Headless alert system
│   │       ├── watch-types.ts    #  60 — Alert type definitions
│   │       ├── watch-state.ts    # 305 — State tracking & transitions
│   │       ├── watch-alerts.ts   # 148 — Notification channels
│   │       ├── live.ts           # 1,259 — Terminal dashboard (⚠ GOD FILE)
│   │       ├── process-audit.ts  # 521 — OS-level health checks
│   │       ├── trace-cli.ts      # 260 — CLI trace subcommands
│   │       ├── cli.ts            # 379 — CLI entry point
│   │       └── index.ts          #  83 — Public API barrel
│   ├── dashboard/                # Web UI (2,546 LoC src)
│   │   └── src/
│   │       ├── server.ts         # 551 — Express + WebSocket
│   │       ├── watcher.ts        # 1,553 — Trace file monitoring (⚠ GOD FILE)
│   │       ├── stats.ts          # 265 — Performance analytics
│   │       ├── cli.ts            # 158 — CLI argument parsing
│   │       └── index.ts          #  19 — Public exports
│   ├── otel/                     # OpenTelemetry exporter (597 LoC)
│   │   └── src/
│   │       ├── exporter.ts       # 273 — OTel span generation
│   │       ├── config.ts         # 170 — Configuration & backends
│   │       ├── watcher.ts        #  75 — File-based OTel export
│   │       └── index.ts          #  79 — Setup/export API
│   ├── storage/                  # SQLite persistence (2,292 LoC)
│   │   └── src/
│   │       ├── storage.ts        # 399 — Database & schema
│   │       ├── ingester.ts       # 683 — File-based trace ingestion
│   │       ├── query.ts          # 420 — Query builder
│   │       ├── analytics.ts      # 397 — Time-series analysis
│   │       ├── cli.ts            # 372 — Query CLI
│   │       └── index.ts          #  21 — Public exports
│   └── python/                   # Python bindings (minimal)
├── tests/                        # 3,946 LoC test code
│   ├── core/                     # 11 test files
│   ├── dashboard/                # 4 test files
│   └── storage/                  # 1 test file
├── examples/                     # Demo scripts
├── docs/                         # (to be created)
└── traces/                       # Runtime trace output
```

**Total source lines**: ~10,800
**Total test lines**: ~3,946
**Total files (non-vendor)**: ~70

---

## Dependency Graph (Internal)

```
core (zero deps)
├── types.ts           ← imported by everything
├── graph-builder.ts   ← types
├── graph-query.ts     ← types
├── graph-stitch.ts    ← types
├── guards.ts          ← graph-query, types
├── visualize.ts       ← graph-query, types
├── loader.ts          ← types
├── trace-store.ts     ← loader, types
├── runner.ts          ← graph-builder, loader, types
├── watch-types.ts     ← (standalone)
├── watch-state.ts     ← live, watch-types
├── watch-alerts.ts    ← watch-types
├── watch.ts           ← live, watch-state, watch-alerts, watch-types
├── live.ts            ← graph-query, graph-stitch, loader, process-audit, types
├── process-audit.ts   ← (standalone, uses fs/child_process)
├── trace-cli.ts       ← trace-store, visualize
└── cli.ts             ← runner, trace-cli, watch, live

dashboard → core (loadGraph, getStats, getFailures, getHungNodes)
otel      → core (ExecutionGraph, types)
storage   → (standalone, uses better-sqlite3)
```

**No circular dependencies detected.** Hub-and-spoke pattern with core as the hub.

---

## Test Coverage Baseline

### Test Results (pre-restructure)
- **Total tests**: 201
- **Passing**: 200
- **Failing**: 1
- **Duration**: 7.15s

### Failing Test
```
FAIL tests/dashboard/watcher.test.ts
  > TraceWatcher > loadSessionFile > extracts agentId from OpenClaw path
  Expected: "main"
  Received: "openclaw-main"
```

### Coverage by Module

| Module | Test File(s) | Status |
|--------|-------------|--------|
| graph-builder | graph-builder.test.ts | ✅ Covered |
| graph-query | graph-query.test.ts | ✅ Covered |
| guards | guards.test.ts | ✅ Covered |
| visualize | visualize.test.ts | ✅ Covered |
| trace-store | trace-store.test.ts | ✅ Covered |
| loader | loader.test.ts | ✅ Covered |
| types | types.test.ts | ✅ Covered |
| watch-state | watch-state.test.ts | ✅ Covered |
| trace-cli | trace-cli.test.ts | ✅ Covered |
| security | security.test.ts | ✅ Covered |
| trace integration | trace-integration.test.ts | ✅ Covered |
| dashboard/server | server.test.ts | ✅ Covered |
| dashboard/stats | stats.test.ts | ✅ Covered |
| dashboard/watcher | watcher.test.ts | ⚠️ 1 failing |
| dashboard/integration | integration.test.ts | ✅ Covered |
| storage/query | query-security.test.ts | ✅ Covered |
| **cli.ts** | — | ❌ No tests |
| **runner.ts** | — | ❌ No tests |
| **watch.ts** | — | ❌ No tests |
| **watch-alerts.ts** | — | ❌ No tests |
| **live.ts** | — | ❌ No tests |
| **process-audit.ts** | — | ❌ No tests |
| **graph-stitch.ts** | — | ❌ No tests |
| **otel/*** | — | ❌ No tests |
| **storage/storage.ts** | — | ❌ No tests |
| **storage/ingester.ts** | — | ❌ No tests |
| **storage/analytics.ts** | — | ❌ No tests |

**Estimated coverage**: ~50-55% of source lines

---

## TypeScript Errors (pre-restructure)

7 errors from `npm run typecheck`:

1. `guards.ts:13` — Unused import `ExecutionNode`
2. `live.ts:313` — Unused variable `fp`
3. `process-audit.ts:410` — `string | undefined` not assignable to `string`
4. `runner.ts:96` — Unused variable `command`
5. `watch-state.ts:8` — Unused import declaration
6. `watch-state.ts:13` — Unused import `AlertCondition`
7. `watch.ts:16` — Unused import `formatAlertMessage`

---

## Lint Errors (pre-restructure)

**Biome check results**:
- **751 errors** (mostly `useNodejsImportProtocol`, `noExplicitAny`)
- **873 warnings** (mostly `noNonNullAssertion`)
- **761 info** (mostly `organizeImports`)

Most are auto-fixable with `biome check --write`.

---

## Top 10 Architectural Issues (Ranked by Severity)

### 1. 🔴 God Files — `live.ts` (1,259 lines) and `watcher.ts` (1,553 lines)
Both files handle file detection, format parsing, state management, and rendering in a single module. `live.ts` mixes terminal ANSI rendering with agent state detection, JSONL parsing, and process health checks. `watcher.ts` combines trace loading, session parsing, log parsing, OpenClaw format handling, and file watching.

**Impact**: Extremely hard to test, maintain, or extend independently.

### 2. 🔴 751 Lint Errors
The linter is essentially broken — too many violations to be useful as a quality gate. Most are fixable (`node:` protocol imports, import organization), but this must be cleaned up before any restructuring.

### 3. 🔴 7 TypeScript Errors
Build-blocking type errors (unused imports/variables, one genuine type safety issue in `process-audit.ts`). Must be fixed for `tsc` to pass cleanly.

### 4. 🟡 1 Failing Test
`watcher.test.ts` expects agentId `"main"` but gets `"openclaw-main"`. Either the test or the implementation drifted.

### 5. 🟡 Silent Error Handling
- `watch-alerts.ts`: `sendAlert()` catches all errors, logs to stderr, no retry
- `live.ts`: Unparseable log lines silently skipped
- `watcher.ts`: `loadFile()` returns false on error with no diagnostics

### 6. 🟡 Unbounded Caches
- `live.ts`: `dirMtimeCache`, `dirFileCache` — no eviction
- `dashboard/stats.ts`: Inconsistent limits (100 per agent, 200 global)

### 7. 🟡 Missing Validation Layer
No schema validation on `ExecutionGraph` deserialization. `loader.ts` accepts nodes as Map, Object, or Array with no version field. Format changes would cause silent data corruption.

### 8. 🟡 ~50% Test Coverage Gaps
CLI, runner, watch system, live dashboard, process audit, OTel, and most of storage have no unit tests.

### 9. 🔵 No Structured Logging
Uses `console.warn`/`console.error` throughout. No log levels, no correlation IDs, no JSON output for machine parsing.

### 10. 🔵 Global Singleton in OTel
`otel/index.ts` uses module-level `globalConfig` and `globalExporter`. Not suitable for testing or multi-tenant scenarios.

---

## Performance Observations

- **Build time**: ~2s per package (tsup), total ~6s
- **Test suite**: 7.15s for 201 tests
- **Lint**: ~500ms (but exits with errors)
- **Typecheck**: ~2s (but exits with errors)

No significant performance bottlenecks identified at current scale.

---

## Summary

AgentFlow has a **solid architectural foundation** — zero-dep core, pure functions, immutable data, closure-based factories, and a clean monorepo structure. The core library is well-designed and well-tested.

The main issues are:
1. **Code hygiene debt**: Lint errors, type errors, and a failing test need immediate fixing
2. **God files**: Two files over 1,000 lines need decomposition
3. **Test coverage**: ~50% — many modules have zero tests
4. **Error handling**: Silent failures throughout the watch/live/dashboard stack
5. **No validation**: Deserialized data is trusted without schema checks

The restructure should prioritize fixing the hygiene issues first (they're blocking quality gates), then decompose the god files, then improve coverage.
