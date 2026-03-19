## Context

AgentFlow emits two event types — `ExecutionEvent` (per-run completion/failure) and `PatternEvent` (cross-run process mining results) — via the `EventWriter` interface. The reference implementation (`JsonEventWriter`) writes raw JSON files. Soma's Curator watches `~/.openclaw/workspace/inbox/` on a 60-second interval and expects Markdown files with YAML frontmatter. After ingestion, the Curator creates vault entities (`execution/`, `synthesis/`, `agent/`) with wikilinks.

The gap: AgentFlow speaks JSON, the Curator speaks Markdown+YAML. We need an adapter that bridges the format without changing either side.

## Goals / Non-Goals

**Goals:**
- Bridge AgentFlow event emission to Soma's Curator inbox format
- Implement as a standard `EventWriter` so it plugs into `createEventEmitter` alongside other writers
- Map event fields to Curator conventions (frontmatter metadata, wikilinks, alfred_tags)
- Produce files the Curator can process without any Curator-side changes
- Zero new runtime dependencies

**Non-Goals:**
- Modifying the Curator's processing pipeline
- Adding Curator entity type definitions to the vault (that's Soma's responsibility)
- Bidirectional communication (Soma → AgentFlow policy feedback is a future phase)
- Handling event batching, queuing, or retry logic
- Supporting non-filesystem transports

## Decisions

### 1. Markdown adapter, not Curator modification

Write a new `SomaEventWriter` that converts events to Markdown+YAML. The Curator already processes arbitrary Markdown files — we conform to its input format rather than teaching it JSON.

**Alternative considered:** Add a JSON handler to the Curator. Rejected because it couples the systems and requires Curator changes outside this repo.

### 2. Entity type routing via frontmatter `type` field

- `ExecutionEvent` → `type: execution`, `subtype: completed|failed`
- `PatternEvent` → `type: synthesis`, `subtype: pattern-discovery`

The Curator uses `type` to route entities to vault directories. `execution/` entities are already in the Soma ontology. `synthesis/` is the natural home for cross-run pattern analysis.

**Alternative considered:** New `pattern/` entity type. Rejected because `synthesis/` already represents "cross-cutting insights, emergent patterns" per the ontology.

### 3. Wikilink generation for entity relationships

Each event file includes wikilinks the Curator's Stage 3 (link creation) can process:
- Execution events: `[[agent/{agentId}]]`
- Pattern events: `[[agent/{agentId}]]` + `[[execution/{graphId}]]` references for top variants
- Failed executions: `[[decision/{failure-context}]]` if failure point is present

This lets the Curator wire execution intelligence into the broader knowledge graph.

### 4. File naming: `{type}-{agentId}-{ISO-timestamp}.md`

Example: `execution-alfred-2026-03-16T143503.md`

Matches the Curator's existing naming patterns (`digest-2026-03-01.md`, `email-2026-03-16-*.md`). ISO timestamp in the filename (not epoch ms) for human readability.

### 5. `alfred_tags` for semantic clustering

Map event metadata to tags the Surveyor (embedding/clustering worker) can use:
- `agentflow/execution`, `agentflow/pattern`
- `agent/{agentId}`
- `status/{completed|failed}`
- Bottleneck node names for pattern events

## Risks / Trade-offs

- **Curator format coupling** → The Markdown+YAML format is a de facto contract, not a versioned schema. If the Curator changes its expectations, this adapter breaks. Mitigation: the adapter is a single file (~100 lines), easy to update.
- **No delivery guarantee** → File write is fire-and-forget. If the inbox dir doesn't exist or disk is full, the write fails silently (per EventEmitter's `onError` pattern). Mitigation: the `createEventEmitter` `onError` callback surfaces these.
- **Duplicate events** → If the same graph is processed twice, two event files are written. The Curator moves processed files to `processed/`, so duplicates would both be ingested. Mitigation: acceptable for now — deduplication is a Curator concern.
- **Large pattern events** → A pattern event with a full `processModel` (367 steps, 363 transitions from validation) produces a long Markdown file. Mitigation: include summary in body, full model as a YAML frontmatter field or appendix.
