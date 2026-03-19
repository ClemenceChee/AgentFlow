## 1. Event Types

- [x] 1.1 Add `AgentFlowEventType` string literal union to `types.ts` ('execution.completed' | 'execution.failed' | 'pattern.discovered' | 'pattern.updated')
- [x] 1.2 Add `SemanticContext` interface to `types.ts` (intent?, trigger?, inputSummary?, outputSummary?, tokenCost?, modelId?)
- [x] 1.3 Add `ProcessContext` interface to `types.ts` (variant, conformanceScore, isAnomaly)
- [x] 1.4 Add `FailurePoint` interface to `types.ts` (nodeId, nodeName, nodeType, error?)
- [x] 1.5 Add `ExecutionEvent` interface to `types.ts` (eventType, graphId, agentId, timestamp, schemaVersion, status, duration, nodeCount, pathSignature, failurePoint?, processContext?, semantic?, violations)
- [x] 1.6 Add `PatternEvent` interface to `types.ts` (eventType, agentId, timestamp, schemaVersion, pattern object with totalGraphs, variantCount, topVariants, topBottlenecks, processModel)
- [x] 1.7 Add `ExecutionEventOptions` interface to `types.ts` (processContext?, semantic?, violations?)
- [x] 1.8 Add `EventEmitterConfig` interface to `types.ts` (writers?, onError?)
- [x] 1.9 Add `EventWriter` interface extending `Writer` with writeEvent method
- [x] 1.10 Add `EventEmitter` interface to `types.ts` (emit, subscribe)

## 2. Event Creation Functions

- [x] 2.1 Create `packages/core/src/event-emitter.ts` with module JSDoc header
- [x] 2.2 Implement `createExecutionEvent(graph, options?)` — extract summary from graph, compute pathSignature, find failure point if failed, merge optional context
- [x] 2.3 Implement `createPatternEvent(agentId, model, variants, bottlenecks)` — summarize mining results, cap topVariants and topBottlenecks at 5

## 3. EventEmitter Implementation

- [x] 3.1 Implement `createEventEmitter(config)` — factory with emit/subscribe, routes to EventWriters, error handling via onError callback

## 4. JsonEventWriter

- [x] 4.1 Create `packages/core/src/json-event-writer.ts`
- [x] 4.2 Implement `createJsonEventWriter({ outputDir })` — writes events as individual JSON files, creates directory if needed, no-op write(graph)

## 5. Exports

- [x] 5.1 Add event creation functions to `index.ts` barrel export
- [x] 5.2 Add all new types to `index.ts` type exports
- [x] 5.3 Add JsonEventWriter factory to `index.ts` export

## 6. Tests

- [x] 6.1 Create `tests/core/event-emitter.test.ts` with test scaffolding
- [x] 6.2 Test `createExecutionEvent` — successful graph, failed graph with failure point, with process context, with semantic context, without options
- [x] 6.3 Test `createPatternEvent` — standard mining results, capping at 5, fewer than 5
- [x] 6.4 Test `createEventEmitter` — emit to writer, emit to subscribers, unsubscribe, writer error handling, no writers/subscribers
- [x] 6.5 Test `createJsonEventWriter` — writes execution event file, writes pattern event file, creates output directory, multiple events produce separate files
- [x] 6.6 Integration test: build graph → create execution event → emit through emitter → verify JsonEventWriter file output
