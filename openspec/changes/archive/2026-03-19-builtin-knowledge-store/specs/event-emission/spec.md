## ADDED Requirements

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
