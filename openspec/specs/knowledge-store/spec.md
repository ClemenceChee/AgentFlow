## ADDED Requirements

### Requirement: Knowledge store creation
The system SHALL provide a `createKnowledgeStore(config: KnowledgeStoreConfig): KnowledgeStore` factory that creates a filesystem-based store for accumulating execution and pattern events. The config SHALL accept a `baseDir` path (default: `.agentflow/knowledge`). The store SHALL create the directory structure on first write.

#### Scenario: Create store with default config
- **WHEN** `createKnowledgeStore({})` is called
- **THEN** a KnowledgeStore is returned with baseDir defaulting to `.agentflow/knowledge`

#### Scenario: Create store with custom path
- **WHEN** `createKnowledgeStore({ baseDir: '/tmp/test-knowledge' })` is called
- **THEN** a KnowledgeStore is returned targeting the specified directory

### Requirement: Event persistence
The store SHALL persist ExecutionEvents and PatternEvents as individual JSON files organized by agentId and date. ExecutionEvents SHALL be stored at `events/{agentId}/{YYYY-MM-DD}/{eventType}-{timestamp}.json`. PatternEvents SHALL be stored at `patterns/{agentId}/{timestamp}.json`.

#### Scenario: Persist execution event
- **WHEN** `store.append(executionEvent)` is called with an ExecutionEvent for agentId `alfred` with timestamp `1773671702828`
- **THEN** a JSON file SHALL be created at `events/alfred/2026-03-14/execution-completed-1773671702828.json` containing the event

#### Scenario: Persist pattern event
- **WHEN** `store.append(patternEvent)` is called with a PatternEvent for agentId `alfred`
- **THEN** a JSON file SHALL be created at `patterns/alfred/{timestamp}.json` containing the event

#### Scenario: Directory auto-creation
- **WHEN** `store.append(event)` is called and the target directory does not exist
- **THEN** the directory structure SHALL be created recursively before writing

### Requirement: Agent profile derivation
The store SHALL maintain a derived agent profile at `profiles/{agentId}.json` that is updated on every `append()` call. The profile SHALL contain: `agentId`, `totalRuns`, `successCount`, `failureCount`, `failureRate` (0.0–1.0), `recentDurations` (last 100 runs, ms), `lastConformanceScore` (from most recent execution event with processContext), `knownBottlenecks` (node names from pattern events, deduplicated), `lastPatternTimestamp`, and `updatedAt` (ISO timestamp).

#### Scenario: Profile created on first event
- **WHEN** `store.append(executionEvent)` is called for an agentId with no existing profile
- **THEN** a profile JSON file SHALL be created with totalRuns 1 and the event's data

#### Scenario: Profile updated on subsequent events
- **WHEN** `store.append(executionEvent)` is called for an agentId with an existing profile showing totalRuns 5
- **THEN** the profile SHALL be updated to totalRuns 6 with the new event's duration appended to recentDurations

#### Scenario: Failure rate computation
- **WHEN** a profile has successCount 7 and failureCount 3
- **THEN** failureRate SHALL be 0.3

#### Scenario: Recent durations rolling window
- **WHEN** a profile already has 100 entries in recentDurations and a new event is appended
- **THEN** the oldest duration SHALL be removed and the new one appended (FIFO, max 100)

#### Scenario: Bottlenecks accumulated from pattern events
- **WHEN** a PatternEvent with topBottlenecks `[{nodeName: 'fetch'}, {nodeName: 'parse'}]` is appended
- **THEN** the profile's knownBottlenecks SHALL include `'fetch'` and `'parse'` (deduplicated across events)

#### Scenario: Conformance score from process context
- **WHEN** an ExecutionEvent with `processContext.conformanceScore: 0.85` is appended
- **THEN** the profile's lastConformanceScore SHALL be 0.85

#### Scenario: Atomic profile writes
- **WHEN** the profile is being updated
- **THEN** the store SHALL write to a temporary file and rename it to the target path to prevent partial writes

### Requirement: Query recent events
The store SHALL provide `getRecentEvents(agentId: string, options?: { limit?: number, since?: number }): ExecutionEvent[]` that returns events for a given agentId sorted by timestamp descending. Default limit SHALL be 50. The `since` option filters to events after the given epoch timestamp.

#### Scenario: Query with defaults
- **WHEN** `store.getRecentEvents('alfred')` is called and 200 events exist for alfred
- **THEN** the 50 most recent ExecutionEvents SHALL be returned, sorted newest first

#### Scenario: Query with limit
- **WHEN** `store.getRecentEvents('alfred', { limit: 10 })` is called
- **THEN** at most 10 events SHALL be returned

#### Scenario: Query with time filter
- **WHEN** `store.getRecentEvents('alfred', { since: 1773600000000 })` is called
- **THEN** only events with timestamp greater than 1773600000000 SHALL be returned

#### Scenario: Query for nonexistent agent
- **WHEN** `store.getRecentEvents('unknown-agent')` is called
- **THEN** an empty array SHALL be returned

### Requirement: Query agent profile
The store SHALL provide `getAgentProfile(agentId: string): AgentProfile | null` that returns the derived profile for an agent, or null if no events have been recorded.

#### Scenario: Profile exists
- **WHEN** `store.getAgentProfile('alfred')` is called and events exist for alfred
- **THEN** the AgentProfile SHALL be returned with current aggregates

#### Scenario: No profile
- **WHEN** `store.getAgentProfile('nonexistent')` is called
- **THEN** null SHALL be returned

### Requirement: Query pattern history
The store SHALL provide `getPatternHistory(agentId: string, options?: { limit?: number }): PatternEvent[]` that returns pattern events for a given agentId sorted by timestamp descending. Default limit SHALL be 20.

#### Scenario: Query pattern history
- **WHEN** `store.getPatternHistory('alfred')` is called with 30 pattern events stored
- **THEN** the 20 most recent PatternEvents SHALL be returned, sorted newest first

#### Scenario: No patterns
- **WHEN** `store.getPatternHistory('new-agent')` is called with no patterns stored
- **THEN** an empty array SHALL be returned

### Requirement: Knowledge store implements EventWriter
The KnowledgeStore SHALL implement the `EventWriter` interface so it can be used directly as a writer in `createEventEmitter`. The `writeEvent` method SHALL delegate to `append`. The `write(graph)` method SHALL be a no-op.

#### Scenario: Store used as EventWriter
- **WHEN** a KnowledgeStore is passed as a writer to `createEventEmitter`
- **AND** `emitter.emit(executionEvent)` is called
- **THEN** the event SHALL be persisted in the store and the profile SHALL be updated

### Requirement: Data compaction
The store SHALL provide `compact(options: { olderThan: number }): { removed: number }` that removes event files older than the specified epoch timestamp. Profiles SHALL NOT be removed by compaction.

#### Scenario: Compact old events
- **WHEN** `store.compact({ olderThan: 1773600000000 })` is called
- **THEN** event files with timestamps before 1773600000000 SHALL be deleted
- **AND** the return value SHALL indicate how many files were removed

#### Scenario: Compact preserves profiles
- **WHEN** `store.compact({ olderThan: ... })` is called
- **THEN** files in the `profiles/` directory SHALL NOT be deleted

### Requirement: InsightEvent type
The system SHALL define an `InsightEvent` interface with fields: `eventType` (literal `'insight.generated'`), `agentId` (string), `timestamp` (number), `schemaVersion` (number), `insightType` (`'failure-analysis' | 'anomaly-explanation' | 'agent-summary' | 'fix-suggestion'`), `prompt` (string — the prompt sent to the LLM), `response` (string — the LLM response), and `dataHash` (string — hash of input data for cache identity).

#### Scenario: InsightEvent structure
- **WHEN** an InsightEvent is created
- **THEN** it SHALL have eventType `'insight.generated'` and all required fields populated

### Requirement: Insight event persistence
The KnowledgeStore SHALL provide `appendInsight(event: InsightEvent): void` that persists insight events as JSON files at `insights/{agentId}/{insightType}-{timestamp}-{seq}.json`. The method SHALL create the directory structure on first write.

#### Scenario: Persist insight event
- **WHEN** `store.appendInsight(insightEvent)` is called with agentId `alfred` and insightType `failure-analysis`
- **THEN** a JSON file SHALL be created at `insights/alfred/failure-analysis-{timestamp}-{seq}.json`

#### Scenario: Multiple insights same type
- **WHEN** two insight events of the same type are persisted for the same agent
- **THEN** both SHALL be stored as separate files with distinct sequence numbers

### Requirement: Query recent insights
The KnowledgeStore SHALL provide `getRecentInsights(agentId: string, options?: { type?: string; limit?: number }): InsightEvent[]` that returns insight events sorted by timestamp descending. Default limit SHALL be 10. The optional `type` filter restricts results to a specific insightType.

#### Scenario: Query all insights for agent
- **WHEN** `store.getRecentInsights('alfred')` is called with 15 insights stored
- **THEN** the 10 most recent InsightEvents SHALL be returned, sorted newest first

#### Scenario: Query insights by type
- **WHEN** `store.getRecentInsights('alfred', { type: 'failure-analysis' })` is called
- **THEN** only InsightEvents with insightType `failure-analysis` SHALL be returned

#### Scenario: Query with limit
- **WHEN** `store.getRecentInsights('alfred', { limit: 5 })` is called
- **THEN** at most 5 InsightEvents SHALL be returned

#### Scenario: No insights
- **WHEN** `store.getRecentInsights('new-agent')` is called with no insights stored
- **THEN** an empty array SHALL be returned

### Requirement: Insight compaction
The existing `compact()` method SHALL also remove insight event files older than the specified timestamp. Insight compaction SHALL follow the same pattern as execution and pattern event compaction.

#### Scenario: Compact old insights
- **WHEN** `store.compact({ olderThan: timestamp })` is called
- **THEN** insight files with timestamps before the threshold SHALL be deleted
- **AND** the removed count SHALL include compacted insight files
