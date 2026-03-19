## ADDED Requirements

### Requirement: Execution event creation
The system SHALL provide a `createExecutionEvent(graph: ExecutionGraph, options?: ExecutionEventOptions): ExecutionEvent` pure function that transforms a completed execution graph into a self-describing event. The event SHALL include: `eventType` ('execution.completed' or 'execution.failed' based on graph status), `graphId`, `agentId`, `timestamp` (epoch ms), `status`, `duration` (ms), `nodeCount`, `pathSignature` (from getPathSignature), and `schemaVersion` (integer, starting at 1). When a `failurePoint` exists (graph status is 'failed'), the event SHALL include the first failed node's id, name, type, and error message. When `processContext` is provided in options, it SHALL be included verbatim. When `semantic` context is provided in options, it SHALL be included verbatim. When `violations` are provided in options, they SHALL be included; otherwise defaults to an empty array.

#### Scenario: Successful execution event
- **WHEN** `createExecutionEvent` is called with a completed graph containing 5 nodes and duration 3400ms
- **THEN** it returns an ExecutionEvent with eventType 'execution.completed', nodeCount 5, duration 3400, and pathSignature matching `getPathSignature(graph)`

#### Scenario: Failed execution event with failure context
- **WHEN** `createExecutionEvent` is called with a failed graph where node 'fetch-data' (type: tool) has status 'failed'
- **THEN** the event includes a `failurePoint` object with nodeName 'fetch-data', nodeType 'tool', and the error from the failed node's metadata

#### Scenario: Event with process mining context
- **WHEN** `createExecutionEvent` is called with options containing `processContext: { variant: 'A→B→C', conformanceScore: 0.85, isAnomaly: false }`
- **THEN** the returned event includes the processContext verbatim

#### Scenario: Event with semantic context
- **WHEN** `createExecutionEvent` is called with options containing `semantic: { intent: 'daily-rebalance', trigger: 'cron', tokenCost: 4500 }`
- **THEN** the returned event includes the semantic context verbatim

#### Scenario: Event without optional fields
- **WHEN** `createExecutionEvent` is called with only a graph and no options
- **THEN** the event has no `failurePoint` (if graph succeeded), no `processContext`, no `semantic`, and `violations` is an empty array

---

### Requirement: Pattern event creation
The system SHALL provide a `createPatternEvent(agentId: string, model: ProcessModel, variants: Variant[], bottlenecks: Bottleneck[]): PatternEvent` pure function that transforms process mining results into a structured pattern event. The event SHALL include: `eventType` ('pattern.discovered'), `agentId`, `timestamp`, `schemaVersion`, and a `pattern` object containing `totalGraphs` (from model), `variantCount`, `topVariants` (up to 5, with pathSignature, count, percentage), `topBottlenecks` (up to 5, with nodeName, nodeType, p95 duration), and the full `processModel`.

#### Scenario: Pattern event from mining results
- **WHEN** `createPatternEvent` is called with a model from 50 graphs, 3 variants, and 4 bottlenecks
- **THEN** the event has eventType 'pattern.discovered', pattern.totalGraphs 50, pattern.variantCount 3, and topVariants contains up to 3 entries

#### Scenario: Pattern event caps top lists at 5
- **WHEN** `createPatternEvent` is called with 10 variants and 8 bottlenecks
- **THEN** topVariants has exactly 5 entries and topBottlenecks has exactly 5 entries

#### Scenario: Pattern event with fewer than 5 items
- **WHEN** `createPatternEvent` is called with 2 variants and 1 bottleneck
- **THEN** topVariants has 2 entries and topBottlenecks has 1 entry

---

### Requirement: Event emitter
The system SHALL provide a `createEventEmitter(config: EventEmitterConfig): EventEmitter` factory that creates an event emitter for routing events to writers and subscribers. The emitter SHALL have an `emit(event)` method that sends the event to all configured EventWriters via `writeEvent()` and to all subscribers. The emitter SHALL have a `subscribe(listener)` method that returns an unsubscribe function. Writer errors SHALL NOT throw — they SHALL be reported via the optional `onError` callback in config. The emitter SHALL process writers and subscribers sequentially (not concurrently) to maintain ordering guarantees.

#### Scenario: Emit to a single writer
- **WHEN** an event is emitted and one EventWriter is configured
- **THEN** the writer's `writeEvent` method is called with the event

#### Scenario: Emit to multiple subscribers
- **WHEN** two subscribers are registered and an event is emitted
- **THEN** both subscribers receive the event

#### Scenario: Unsubscribe stops delivery
- **WHEN** a subscriber unsubscribes and a new event is emitted
- **THEN** the unsubscribed listener does not receive the event

#### Scenario: Writer error does not block emission
- **WHEN** an EventWriter's `writeEvent` throws an error
- **THEN** the error is passed to the `onError` callback, other writers and subscribers still receive the event

#### Scenario: Emit with no writers or subscribers
- **WHEN** an event is emitted with no writers configured and no subscribers
- **THEN** the emit completes without error

---

### Requirement: EventWriter interface
The system SHALL define an `EventWriter` interface extending `Writer` with an additional `writeEvent(event: ExecutionEvent | PatternEvent): Promise<void>` method. Implementations of EventWriter SHALL handle both event types.

#### Scenario: EventWriter extends Writer
- **WHEN** a class implements EventWriter
- **THEN** it must also implement `write(graph: ExecutionGraph): Promise<void>` from the Writer interface

---

### Requirement: JSON event writer
The system SHALL provide a `createJsonEventWriter(config: { outputDir: string }): EventWriter` factory that creates a writer persisting events as individual JSON files. Each event SHALL be written to a file named `{eventType}-{agentId}-{timestamp}.json` where eventType dots are replaced with dashes (e.g., `execution-completed-portfolio-recon-1710800000000.json`). The writer SHALL create the output directory if it does not exist. The JSON SHALL be formatted with 2-space indentation for human readability. The `write(graph)` method SHALL be a no-op (JsonEventWriter only handles events, not raw graphs).

#### Scenario: Write execution event to file
- **WHEN** `writeEvent` is called with an ExecutionEvent with agentId 'my-agent' and timestamp 1710800000000
- **THEN** a file named `execution-completed-my-agent-1710800000000.json` (or `execution-failed-...`) is created in the output directory containing the event as formatted JSON

#### Scenario: Write pattern event to file
- **WHEN** `writeEvent` is called with a PatternEvent with agentId 'my-agent' and timestamp 1710800000000
- **THEN** a file named `pattern-discovered-my-agent-1710800000000.json` is created in the output directory

#### Scenario: Output directory does not exist
- **WHEN** `writeEvent` is called and the configured output directory does not exist
- **THEN** the directory is created recursively before writing the file

#### Scenario: Multiple events produce separate files
- **WHEN** three events are written in sequence
- **THEN** three separate JSON files exist in the output directory

---

### Requirement: EventEmitter knowledge store integration
The `EventEmitterConfig` SHALL accept an optional `knowledgeStore: KnowledgeStore` field. When provided, the emitter SHALL persist every emitted event to the knowledge store in addition to sending it to writers and subscribers. Knowledge store errors SHALL be handled via the same `onError` callback as writer errors.

#### Scenario: Emitter with knowledge store
- **WHEN** `createEventEmitter({ knowledgeStore: store })` is called
- **AND** `emitter.emit(executionEvent)` is called
- **THEN** the event SHALL be persisted in the knowledge store AND the agent profile SHALL be updated

#### Scenario: Emitter with both writers and knowledge store
- **WHEN** `createEventEmitter({ writers: [jsonWriter], knowledgeStore: store })` is called
- **AND** `emitter.emit(event)` is called
- **THEN** the event SHALL be written to jsonWriter AND persisted in the knowledge store

#### Scenario: Knowledge store error does not block emission
- **WHEN** the knowledge store's append method throws an error
- **THEN** the error SHALL be passed to `onError`, other writers and subscribers SHALL still receive the event

#### Scenario: Emitter without knowledge store unchanged
- **WHEN** `createEventEmitter({ writers: [jsonWriter] })` is called without a knowledgeStore
- **THEN** behavior SHALL be identical to existing implementation
