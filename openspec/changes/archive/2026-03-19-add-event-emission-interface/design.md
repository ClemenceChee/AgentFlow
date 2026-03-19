## Context

AgentFlow's process mining primitives (`discoverProcess`, `findVariants`, `getBottlenecks`, `checkConformance`) produce rich cross-run analysis. The existing `Writer` interface handles graph persistence (`write(graph)`). What's missing is a structured event layer that transforms graphs + mining results into self-describing events consumable by external systems.

The primary consumer is Soma (formerly Alfred), whose Curator worker watches an inbox directory for new files on a 60-second cycle. Secondary consumers include the dashboard (real-time WebSocket updates) and future sentinel agents (querying event history).

## Goals / Non-Goals

**Goals:**
- Define a typed event schema that carries enough context to understand an execution without reading the full graph
- Provide pure functions to create events from graphs + process mining results
- Provide an EventEmitter for pub/sub event routing
- Provide a reference JsonEventWriter that writes events as files (filesystem-as-IPC)
- Maintain backward compatibility — existing Writer interface unchanged

**Non-Goals:**
- Event querying or storage (that's trace-store / knowledge engine territory)
- Event aggregation or windowing (that's Soma's Distiller territory)
- Webhook or HTTP delivery (future writer, not this change)
- Dashboard WebSocket integration (dashboard can subscribe via EventEmitter, but wiring is out of scope)

## Decisions

### 1. Two event types, not one

**Decision:** Separate `ExecutionEvent` (per-run) and `PatternEvent` (cross-run) rather than a single generic event.

**Rationale:** These have fundamentally different shapes and lifecycles. An execution event is emitted once per run and describes what happened. A pattern event is emitted periodically based on accumulated analysis and describes what was discovered. Combining them into a union with a discriminator field (eventType) is clean, but the data structures are different enough that separate interfaces are more readable and type-safe.

**Alternative considered:** Single `AgentFlowEvent` with polymorphic payload. Rejected because TypeScript discriminated unions work well here, and consumers can pattern-match on `eventType`.

### 2. Events are self-describing

**Decision:** Each event contains all context needed to understand it without reading the original graph or mining results. This means some data duplication (e.g., the execution path is in both the graph and the event).

**Rationale:** Soma's Curator processes events independently — it doesn't have access to AgentFlow's in-memory graphs. The event must stand on its own. A reference-based approach (event contains graphId, consumer looks up graph) would couple the consumer to AgentFlow's storage, breaking the agnostic design.

### 3. EventEmitter is a simple pub/sub, not an event bus

**Decision:** `createEventEmitter()` returns an object with `emit()` and `subscribe()`. Emit sends to all writers + subscribers synchronously (fire-and-forget for writers, sync callbacks for subscribers). No queuing, no retry, no backpressure.

**Rationale:** AgentFlow is a library, not a service. The emitter runs in-process. If a writer fails (e.g., filesystem full), it should log the error and continue — not block the agent. Complex delivery guarantees are the domain of external message systems. Keep it simple.

**Alternative considered:** Async event bus with queuing. Rejected as over-engineering for Phase 1. If delivery guarantees matter, users can implement an EventWriter that pushes to a message queue.

### 4. JsonEventWriter writes individual files, not append-to-log

**Decision:** Each event becomes its own file (`{eventType}-{agentId}-{timestamp}.json`) in the output directory, rather than appending to a single JSONL file.

**Rationale:** Soma's Curator processes individual files from the inbox. One-file-per-event matches this pattern and avoids file locking issues. File naming includes enough context for the Curator to prioritize without opening the file.

**Alternative considered:** JSONL append. Simpler but creates contention with concurrent writers and requires the consumer to track read position. Individual files are more robust for filesystem-as-IPC.

### 5. EventWriter extends Writer (additive, not breaking)

**Decision:** New `EventWriter` interface extends `Writer` adding `writeEvent()`. Existing Writer implementations are unaffected. The EventEmitter checks if a writer implements EventWriter and calls `writeEvent()` if available, otherwise falls back to `write()` for execution events (which carry the graph reference).

**Rationale:** Backward compatible. Existing writers keep working. New writers that want event data implement the extended interface.

## Risks / Trade-offs

**[Data duplication in events]** → Events contain summarized data from the graph (path, duration, failure point) plus optional process mining context. This duplicates data that exists in the raw graph. → Acceptable: events are a materialized view optimized for consumers. The raw graph remains the source of truth.

**[Event schema evolution]** → As AgentFlow adds capabilities, the event schema will grow. No version field yet. → Mitigation: Add a `schemaVersion` field to events from the start. Consumers can ignore unknown fields (forward-compatible) or check version (strict).

**[Writer error handling]** → If JsonEventWriter fails (disk full, permissions), the event is lost. → Mitigation: Emit errors via the emitter's `onError` callback (matches AgentFlowConfig.onError pattern). Don't throw — never block the agent runtime.

**[Memory in long-running processes]** → Subscriber list in EventEmitter grows if subscribers don't unsubscribe. → Mitigation: `subscribe()` returns an unsubscribe function. Document that subscribers must clean up.
