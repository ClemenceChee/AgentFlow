## ADDED Requirements

### Requirement: SomaEventWriter implements EventWriter interface
The `createSomaEventWriter(config)` factory SHALL return an object implementing the `EventWriter` interface with `write(graph)` as a no-op and `writeEvent(event)` that persists events as Markdown files.

#### Scenario: Writer conforms to EventWriter interface
- **WHEN** `createSomaEventWriter({ inboxDir: '/path/to/inbox' })` is called
- **THEN** the returned object SHALL have a `write` method and a `writeEvent` method

#### Scenario: write() is a no-op
- **WHEN** `writer.write(graph)` is called
- **THEN** no files SHALL be created (raw graphs are not Curator-compatible)

### Requirement: ExecutionEvent produces Curator-compatible Markdown
The writer SHALL convert an `ExecutionEvent` into a Markdown file with YAML frontmatter that the Curator can ingest without modification.

#### Scenario: Completed execution event
- **WHEN** `writeEvent` is called with an ExecutionEvent where `eventType` is `execution.completed`
- **THEN** a `.md` file SHALL be created in the inbox directory with:
  - Frontmatter field `type` set to `execution`
  - Frontmatter field `subtype` set to `completed`
  - Frontmatter field `name` set to `Execution: {agentId} — completed`
  - Frontmatter field `source` set to `agentflow`
  - Frontmatter field `created` set to ISO date derived from `event.timestamp`
  - Frontmatter field `alfred_tags` containing `agentflow/execution`, `agent/{agentId}`, `status/completed`
  - Frontmatter field `agentflow_graph_id` set to `event.graphId`
  - Frontmatter field `duration_ms` set to `event.duration`
  - Frontmatter field `node_count` set to `event.nodeCount`
  - Body containing a Markdown summary with path signature and duration
  - Body containing wikilink `[[agent/{agentId}]]`

#### Scenario: Failed execution event
- **WHEN** `writeEvent` is called with an ExecutionEvent where `eventType` is `execution.failed`
- **THEN** the file SHALL have:
  - Frontmatter field `subtype` set to `failed`
  - Frontmatter field `alfred_tags` containing `status/failed`
  - Body containing failure point details (nodeName, nodeType, error) if present

#### Scenario: Execution event with process context
- **WHEN** `writeEvent` is called with an ExecutionEvent that includes `processContext`
- **THEN** frontmatter SHALL include `conformance_score` and `is_anomaly` fields
- **AND** if `isAnomaly` is true, `alfred_tags` SHALL include `agentflow/anomaly`

### Requirement: PatternEvent produces Curator-compatible Markdown
The writer SHALL convert a `PatternEvent` into a Markdown file suitable for ingestion as a `synthesis/` vault entity.

#### Scenario: Pattern discovered event
- **WHEN** `writeEvent` is called with a PatternEvent where `eventType` is `pattern.discovered`
- **THEN** a `.md` file SHALL be created in the inbox directory with:
  - Frontmatter field `type` set to `synthesis`
  - Frontmatter field `subtype` set to `pattern-discovery`
  - Frontmatter field `name` set to `Pattern: {agentId} — {variantCount} variants across {totalGraphs} runs`
  - Frontmatter field `source` set to `agentflow`
  - Frontmatter field `created` set to ISO date derived from `event.timestamp`
  - Frontmatter field `alfred_tags` containing `agentflow/pattern`, `agent/{agentId}`
  - Frontmatter field `variant_count` set to `event.pattern.variantCount`
  - Frontmatter field `total_graphs` set to `event.pattern.totalGraphs`
  - Body containing a summary of top variants (path signature, count, percentage)
  - Body containing a summary of top bottlenecks (nodeName, nodeType, p95)
  - Body containing wikilink `[[agent/{agentId}]]`

### Requirement: File naming follows Curator conventions
Event files SHALL be named `{type}-{agentId}-{ISO-timestamp}.md` where the ISO timestamp uses compact format (no colons, no milliseconds).

#### Scenario: Execution event file naming
- **WHEN** an ExecutionEvent with `agentId: "alfred"` and `timestamp: 1773671702828` is written
- **THEN** the filename SHALL match the pattern `execution-alfred-2026-03-14T*.md`

#### Scenario: Pattern event file naming
- **WHEN** a PatternEvent with `agentId: "alfred"` is written
- **THEN** the filename SHALL match the pattern `synthesis-alfred-*.md`

### Requirement: Inbox directory is created if absent
The writer SHALL create the inbox directory (recursively) if it does not exist, matching `JsonEventWriter` behavior.

#### Scenario: Missing inbox directory
- **WHEN** `writeEvent` is called and the configured `inboxDir` does not exist
- **THEN** the directory SHALL be created recursively before writing the file

### Requirement: Writer is exported from agentflow-core
The `createSomaEventWriter` factory and its config type SHALL be exported from the package barrel (`index.ts`).

#### Scenario: Import from package
- **WHEN** a consumer imports `createSomaEventWriter` from `agentflow-core`
- **THEN** the import SHALL resolve without error

### Requirement: Writer plugs into EventEmitter
The writer SHALL work as a writer in `createEventEmitter({ writers: [somaWriter] })`.

#### Scenario: Emitter routes events to Soma writer
- **WHEN** an `EventEmitter` is created with a `SomaEventWriter` in its writers array
- **AND** `emitter.emit(executionEvent)` is called
- **THEN** a Markdown file SHALL appear in the inbox directory
