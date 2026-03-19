## Why

AgentFlow can now discover process models, find variants, detect bottlenecks, and check conformance across runs — but these results are trapped inside function return values. There is no structured way to emit execution intelligence as events that external systems can consume. Without an event emission layer, Soma (the organizational intelligence layer) cannot harvest execution traces, the dashboard cannot subscribe to real-time updates, and the feedback loop that makes agents smarter over time cannot close. This is the integration contract between AgentFlow and the outside world.

## What Changes

- **New event types** in `types.ts`: `ExecutionEvent` (emitted per completed/failed run with graph summary, process mining context, semantic context, guard violations) and `PatternEvent` (emitted when process mining discovers patterns across runs)
- **New pure functions** to create events: `createExecutionEvent(graph, options?)` transforms a graph + optional process mining/semantic context into a self-describing event; `createPatternEvent(agentId, model, variants, bottlenecks)` transforms mining results into a pattern event
- **New `EventEmitter` interface** with `emit()` and `subscribe()` — the pub/sub surface for routing events to consumers
- **New `createEventEmitter(config)` factory** that creates an emitter routing events to Writers
- **New `EventWriter` interface** extending `Writer` with `writeEvent()` for systems that consume events (not just graphs)
- **New `JsonEventWriter`** reference implementation that writes events as individual JSON files to a configurable directory (filesystem-as-IPC pattern matching Soma's Curator inbox)
- **New exports** from `index.ts` for all event types, functions, and the JsonEventWriter

## Capabilities

### New Capabilities
- `event-emission`: Structured event creation, emission, subscription, and persistence for execution and pattern events

### Modified Capabilities
_(none — purely additive, existing Writer interface is not changed)_

## Impact

- **Code**: New types in `types.ts`, new module `event-emitter.ts`, new module `json-event-writer.ts` in `packages/core/src/`
- **APIs**: New public functions and interfaces exported from `agentflow-core`. No changes to existing APIs.
- **Dependencies**: Zero — uses only `node:fs` and `node:path` for the JsonEventWriter. Core event creation functions have no I/O.
- **Breaking changes**: None. Purely additive. Existing Writer interface is untouched; EventWriter extends it.
