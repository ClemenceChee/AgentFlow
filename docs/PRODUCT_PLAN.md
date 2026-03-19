# AgentFlow Product Plan

**Date**: 2026-03-19
**Branch**: `restructure/agentflow-v2`

---

## 1.1 Product Vision & Goals

### What AgentFlow Does Today

AgentFlow is a framework-agnostic execution tracing layer for AI agent systems. It captures full execution graphs — agents, subagents, tool calls, state transitions, and temporal relationships — and produces queryable, structured execution records.

**Current capabilities:**
- **Core library** (zero-dep): Graph builder, query engine, guards, ASCII visualization
- **Terminal dashboard**: Real-time live monitoring of agent processes via ANSI terminal
- **Web dashboard**: Express + WebSocket server with REST API for trace inspection
- **Storage**: SQLite persistence with time-series analytics and query builder
- **OTel export**: OpenTelemetry span mapping for enterprise observability
- **Multi-format ingestion**: AgentFlow traces, Alfred sessions, OpenClaw logs, generic JSONL
- **Process auditing**: OS-level health checks for agent processes (PIDs, systemd units)
- **Watch system**: Headless alerting with Slack/webhook/email notification channels

### What It Should Do After Restructuring

The same things, but with:
- Clean module boundaries (no god files)
- 80%+ test coverage (up from ~50%)
- Zero lint/type errors as enforced quality gates
- Validated data at boundaries (schema checks on deserialization)
- Structured logging instead of console.warn/error
- Bounded caches with eviction policies
- Documented APIs and architecture

### Success Criteria

| Metric | Before | Target |
|--------|--------|--------|
| Test coverage | ~50% | ≥80% |
| Passing tests | 201 | ≥250 |
| TypeScript errors | 7 | 0 |
| Lint errors | 751 | 0 |
| God files (>500 lines) | 3 | 0 |
| Max file size | 1,553 lines | ≤400 lines |
| Circular dependencies | 0 | 0 |

---

## 1.2 System Layer Analysis

### Presentation Layer (Terminal + Web Dashboard)

**Current state:**
- `live.ts` (1,259 lines) mixes file discovery, format parsing, status detection, process auditing, and ANSI rendering in one module
- Web dashboard in `packages/dashboard/` is cleaner but `watcher.ts` (1,553 lines) is another god file mixing file watching, format detection, session parsing, log parsing, and Alfred/OpenClaw-specific logic

**Target state:**
- `live.ts` decomposed into: `file-discovery.ts`, `format-parsers.ts`, `status-detection.ts`, `terminal-render.ts`
- `watcher.ts` decomposed into: `watcher-core.ts`, `trace-loader.ts`, `session-parser.ts`, `log-parser.ts`, `format-detection.ts`
- Shared parsing logic extracted to a common `parsers/` directory in core to avoid duplication between live.ts and watcher.ts

**Migration path:**
1. Extract pure functions first (parsers, status detection) — no API changes
2. Create new modules, move functions, update imports
3. Verify tests pass after each extraction
4. Original files become thin wrappers that re-export, then are removed

**Risk:** Medium. Parsing logic is tightly coupled to rendering in live.ts. Need careful extraction to avoid breaking the terminal dashboard's real-time display loop.

### API/Routing Layer (REST + WebSocket)

**Current state:**
- `server.ts` (551 lines) handles all routes, WebSocket, serialization, timeline generation, and process mining in one file
- No input validation on API parameters
- No standardized error response format
- No API documentation

**Target state:**
- Routes extracted to `routes/` directory with one file per resource
- Input validation with schema checks
- Consistent `{ data, error, meta }` response shape
- OpenAPI spec generated or hand-written

**Migration path:**
1. Add response wrapper utility
2. Extract route handlers to separate files
3. Add parameter validation
4. Add error middleware

**Risk:** Low. Express routes are already isolated handlers, extraction is mechanical.

### Business Logic/Service Layer

**Current state:**
- Core query functions are pure and well-tested (graph-query.ts, guards.ts)
- Business logic in dashboard lives inside route handlers (server.ts computes timelines, process graphs inline)
- Storage analytics (analytics.ts) has complex SQL but clean interfaces
- No dependency injection — modules import each other directly

**Target state:**
- Timeline generation, process mining, and stats aggregation extracted to service functions
- Services are pure functions that take data and return results
- Route handlers only do request parsing → service call → response formatting

**Migration path:**
1. Extract inline computations from server.ts route handlers to service functions
2. Add tests for extracted services
3. Update route handlers to call services

**Risk:** Low. Computations are already fairly isolated within route handlers.

### Data Access Layer

**Current state:**
- `storage/storage.ts` (399 lines): SQLite schema + CRUD operations — clean
- `storage/ingester.ts` (683 lines): File watching + batch processing + multi-format parsing — doing too much
- `storage/query.ts` (420 lines): SQL query builder — clean but large
- `trace-store.ts` in core: JSON file persistence — clean
- No schema validation on deserialized data
- `loader.ts` accepts multiple node formats (Map, Object, Array) with no version field

**Target state:**
- Ingester split into file-watching and parsing concerns
- Schema validation on `loadGraph()` — reject malformed data instead of silently corrupting
- Version field added to serialized format for forward compatibility

**Migration path:**
1. Add validation to `loadGraph()` with clear error messages
2. Split ingester into watcher + parser
3. Add version field to `graphToJson()` output (backward-compatible)

**Risk:** Medium. Changing `loadGraph()` validation could break existing trace files. Need a lenient mode for legacy data.

### Infrastructure/Config Layer

**Current state:**
- Config is ad-hoc: CLI args parsed per-package, environment variables undocumented
- No health check endpoints
- Logging is `console.warn`/`console.error` with no structure
- No CI/CD configuration in repo
- OTel package has global singleton state (untestable)

**Target state:**
- Centralized config module with env var documentation
- Health check endpoint on dashboard server
- Structured logging utility (JSON format, log levels, correlation IDs)
- CI config with lint/type/test gates
- OTel config injectable (no global state)

**Migration path:**
1. Add structured logger utility
2. Replace console.warn/error calls with logger
3. Add health endpoint
4. Add CI config
5. Refactor OTel to accept config via parameter

**Risk:** Low. These are additive changes.

---

## 1.3 Feature Development Roadmap

### Features That Exist But Need Improvement

1. **Terminal dashboard (live.ts)** — Decompose god file, add tests
2. **Web dashboard watcher** — Decompose god file, add tests
3. **Process auditing** — Add tests, improve error handling for non-Linux platforms
4. **Watch/alerting system** — Add tests for watch.ts, watch-alerts.ts
5. **Storage ingestion** — Split concerns, add tests
6. **OTel export** — Remove global state, add tests

### Features That Are Partially Built

1. **API documentation** — Routes exist but no OpenAPI spec
2. **Process mining** — Implemented in server.ts but not tested
3. **Timeline visualization** — Implemented in server.ts but not tested
4. **CLI trace commands** — Basic trace subcommands, could expand

### Features To Add Post-Restructure

1. Health check endpoint (`/health`, `/ready`)
2. Structured logging throughout
3. Schema validation on deserialization
4. CI/CD pipeline configuration
5. Cache eviction policies for unbounded maps
6. Rate limiting on dashboard API

### Features To Remove/Deprecate

None. All current features serve the product. The restructure is about quality and maintainability, not feature changes.

---

## 1.4 Dependency & Integration Map

### External Services and APIs

| Service | Integration Point | Protocol |
|---------|------------------|----------|
| Filesystem | trace-store, loader, live, watcher, ingester | fs (read/write JSON, JSONL, LOG) |
| SQLite | storage | better-sqlite3 (synchronous) |
| OpenTelemetry collectors | otel/exporter | OTLP HTTP/gRPC |
| Slack | watch-alerts | Webhook HTTP POST |
| Email | watch-alerts | SMTP (future) |
| Webhooks | watch-alerts | HTTP POST |
| systemd | process-audit | `systemctl` CLI |
| /proc filesystem | process-audit | Direct file read |

### Internal Module Dependencies

```
core (zero deps, hub of everything)
  ↑ imported by: dashboard, otel, storage (indirectly via loadGraph)

dashboard → core (loadGraph, getStats, getFailures, getHungNodes)
dashboard → express, ws, chokidar

storage → better-sqlite3, chokidar (does NOT import core directly)

otel → core (types), @opentelemetry/*
```

### Data Flow

1. **Agent runs** produce trace files (JSON/JSONL/LOG) on disk
2. **Core** loads and parses these into `ExecutionGraph` objects
3. **Dashboard watcher** monitors directories, emits events on new/changed files
4. **Dashboard server** serves graphs via REST API and pushes updates via WebSocket
5. **Storage ingester** watches directories, parses files, persists to SQLite
6. **Storage query** provides SQL-based analytics on persisted data
7. **OTel exporter** converts graphs to OpenTelemetry spans for external collectors
8. **Watch system** monitors agent state transitions and sends alerts

### Authentication/Authorization Flow

None. AgentFlow is a local-only tool — no auth layer. The dashboard server binds to localhost by default.
