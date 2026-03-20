## 1. Adapter Interface & Types

- [x] 1.1 Create `src/adapters/types.ts` with `NormalizedTrace`, `NormalizedNode`, and `TraceAdapter` interfaces
- [x] 1.2 Create `src/adapters/registry.ts` with ordered adapter list and `findAdapter(file)` / `detectAdapters(dir)` functions

## 2. AgentFlow Adapter (wrap existing)

- [x] 2.1 Create `src/adapters/agentflow.ts` implementing `TraceAdapter`
- [x] 2.2 Parsing delegated to watcher's existing methods (thin wrapper, not full extraction)
- [x] 2.3 `detect()`: returns true for any directory (fallback adapter)
- [x] 2.4 `canHandle()`: returns true for `.json`, `.jsonl`, `.log`, `.trace` files (with skip list)
- [ ] 2.5 Future: move full parsing into adapter (tracked but not blocking)

## 3. OpenClaw Adapter

- [x] 3.1 Create `src/adapters/openclaw.ts` implementing `TraceAdapter`
- [x] 3.2 `detect()`: returns true if directory contains `cron/jobs.json` or path includes `.openclaw`
- [x] 3.3 `canHandle()`: returns true for files matching `cron/runs/*.jsonl`
- [x] 3.4 `parse()`: read JSONL, filter `action: "finished"` entries, map to NormalizedTrace with `agentId: "openclaw:<jobId>"`
- [x] 3.5 Load `cron/jobs.json` for human-readable job names (with cache)
- [x] 3.6 Extract model, provider, usage (tokens) into trace metadata
- [x] 3.7 Map `status: "ok"` → completed, `status: "error"` → failed
- [x] 3.8 Remove `jobs.json` from watcher SKIP_FILES list

## 4. OTel Adapter

- [x] 4.1 Create `src/adapters/otel.ts` implementing `TraceAdapter`
- [x] 4.2 `detect()`: returns true if directory contains `*.otlp.json` or `otel-traces/`
- [x] 4.3 `canHandle()`: returns true for `.otlp.json` files
- [x] 4.4 `parse()`: read OTLP JSON `{ resourceSpans }`, group spans by traceId, build parent-child tree from parentSpanId
- [x] 4.5 Map GenAI semantic conventions: `gen_ai.chat` → type `llm`, `gen_ai.embeddings` → `embedding`, tool spans → `tool`
- [x] 4.6 Extract `gen_ai.request.model`, `gen_ai.usage.*` into metadata
- [x] 4.7 Derive agentId from `service.name` resource attribute, prefixed with `otel:`
- [x] 4.8 `parseOtlpPayload(body)` exported for HTTP ingestion

## 5. Watcher Refactor

- [x] 5.1 Modified `loadFile()` to check adapter registry first — non-agentflow adapters handle their own parsing
- [x] 5.2 Added `loadViaAdapter()` method that converts NormalizedTrace to WatchedTrace
- [x] 5.3 File change handler uses adapters (via modified loadFile)
- [x] 5.4 Existing parsing preserved in watcher for agentflow adapter (thin wrapper pattern)
- [x] 5.5 Watcher stores adapter name in trace metadata (`adapterSource`)

## 6. HTTP Collector

- [x] 6.1 Add `POST /v1/traces` endpoint to server.ts accepting OTLP JSON body
- [x] 6.2 Parse payload with `parseOtlpPayload()`, store in trace store
- [x] 6.3 Emit WebSocket `traces-updated` notification
- [x] 6.4 Localhost binding by default (Express default)
- [x] 6.5 Payload limit: 10MB via `express.json({ limit: '10mb' })`

## 7. Integration & Testing

- [ ] 7.1 Verify existing Alfred traces load correctly (restart server, check agent count)
- [ ] 7.2 Verify OpenClaw cron runs appear as agents in dashboard
- [ ] 7.3 Test OTel file ingestion with a sample OTLP JSON export
- [ ] 7.4 Test HTTP collector with curl POST
- [x] 7.5 Dashboard agent cards show adapter source badge (openclaw:, otel: prefix → badge)
