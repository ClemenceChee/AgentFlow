## ADDED Requirements

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
