## Why

The dashboard watcher is a 1,472-line monolith that hardcodes detection for AgentFlow JSON traces, Alfred JSONL session logs, and systemd logs. It can't ingest OpenClaw cron job runs (JSONL with `{ts, jobId, status, model, usage}`), OTel spans, or traces from any other agent framework. OpenClaw runs 10+ cron jobs (email processors, monitors, digest compilers) that are invisible in the dashboard because the watcher doesn't understand their format.

AgentFlow's positioning is "observe any AI agent system." To deliver on that, the watcher needs pluggable adapters that translate external formats into a normalized trace shape — and an HTTP collector so agents on other machines can push traces.

## What Changes

**Phase 1 — Adapter Interface + OpenClaw Adapter:**
- Define a `TraceAdapter` interface: `detect(dir)`, `canHandle(file)`, `parse(file) → NormalizedTrace[]`
- Refactor watcher to use adapters instead of hardcoded format detection
- Build an AgentFlow adapter (wraps existing logic, no behavior change)
- Build an OpenClaw adapter that reads `cron/jobs.json` + `cron/runs/*.jsonl` and produces normalized traces with `agentId: "openclaw:<jobId>"`, model/token/cost metadata
- Auto-detect OpenClaw directories via `detect()` (looks for `cron/jobs.json`)

**Phase 2 — OTel Inbound Adapter:**
- Build an OTel adapter that reads OTLP JSON export files and maps `gen_ai.*` spans to AgentFlow nodes
- Add `POST /v1/traces` HTTP endpoint that accepts OTLP JSON payloads — any OTel-instrumented agent can push traces to the dashboard
- Map OTel span attributes: `gen_ai.request.model` → metadata.model, `gen_ai.usage.*` → token counts, span parent-child → node tree
- Bind HTTP collector to localhost by default (security)

## Capabilities

### New Capabilities
- `trace-adapter-interface`: `TraceAdapter` interface definition and adapter registry in the watcher
- `adapter-agentflow`: AgentFlow adapter (wraps existing parsing — .json traces, .jsonl sessions, .log files)
- `adapter-openclaw`: OpenClaw adapter (cron/jobs.json + cron/runs/*.jsonl → normalized traces)
- `adapter-otel`: OTel inbound adapter (OTLP JSON files + HTTP POST /v1/traces → normalized traces)

### Modified Capabilities
- `dashboard-directory-discovery`: Auto-detect adapter type per directory (not just "is there a .json file?")

## Impact

- **Refactored files**: `src/watcher.ts` — extract format-specific parsing into adapter modules, watcher becomes adapter orchestrator
- **New files**: `src/adapters/types.ts` (interface), `src/adapters/agentflow.ts`, `src/adapters/openclaw.ts`, `src/adapters/otel.ts`, `src/adapters/registry.ts`
- **Modified files**: `src/server.ts` (add POST /v1/traces endpoint, pass adapters to watcher)
- **New dependencies**: None. OTel adapter parses JSON — no OTel SDK needed for inbound.
- **Breaking changes**: None. Existing behavior preserved by AgentFlow adapter.
