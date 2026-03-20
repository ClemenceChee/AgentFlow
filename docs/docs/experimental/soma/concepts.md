---
sidebar_position: 2
title: Soma Concepts
---

# Soma Concepts

:::caution Experimental
Soma is experimental. APIs may change between minor versions. Do not use in production without pinning an exact version.
:::

## The Vault

The vault is Soma's primary data store. It is a filesystem directory of Markdown files with YAML frontmatter, organized into subdirectories by entity type.

```
.soma/vault/
├── _index.json          # Fast-lookup index (auto-maintained)
├── _mutations.jsonl     # Append-only mutation log
├── agent/
│   └── my-agent.md
├── execution/
│   └── exec-my-agent-1711234567890.md
├── archetype/
│   └── scan-pattern.md
├── insight/
│   └── high-monday-failure.md
├── policy/
│   └── rate-limit-backoff.md
└── synthesis/
    └── weekend-api-degradation.md
```

Every entity file follows the same format: YAML frontmatter between `---` delimiters, followed by a Markdown body.

```markdown
---
type: insight
id: high-monday-failure
name: High Monday Failure Rate
status: active
created: 2026-03-15T09:00:00.000Z
updated: 2026-03-19T14:32:00.000Z
tags: [agent-layer, failure-pattern]
related: [agent/my-agent, execution/exec-my-agent-1711234567890]
claim: The agent fails at 3x the normal rate on Monday mornings
evidence: [15 failures between 08:00-10:00 UTC on Mondays over 4 weeks]
confidence: high
sourceIds: [exec-my-agent-1711000000000]
---

## Analysis

Correlation with downstream API latency data suggests the root cause is
weekend cache expiry in the data provider. The agent's retry logic does
not account for cold-start latency.
```

The vault maintains a fast-lookup `_index.json` that caches `id`, `type`, `name`, `status`, `tags`, and `related` for every entity. The index is rebuilt automatically on startup and updated atomically on every write.

### Vault API

The `Vault` interface provides these query methods:

| Method | Description |
|--------|-------------|
| `create(partial)` | Create an entity. Returns the generated entity ID. |
| `read(type, id)` | Read an entity by type and ID. Returns `null` if not found. |
| `update(id, patch)` | Shallow-merge fields into an existing entity. |
| `remove(id)` | Delete an entity and remove it from the index. |
| `list(type, filter?)` | List all entities of a type, with optional field filters and `limit`. |
| `findByTag(tag)` | Find all entities with a given tag across all types. |
| `findLinked(id)` | Resolve an entity's `related` wikilinks and return the linked entities. |

---

## Entity Types

Soma organizes knowledge across two layers.

### Agent Layer

These entities represent the operational state of the agent system as observed from AgentFlow execution data. They are created automatically by the Harvester.

**`agent`** — Represents a single agent identified by `agentId`. Tracks aggregate statistics (`totalExecutions`, `failureRate`) and holds a rolling `profile` mirroring AgentFlow's `AgentProfile`. The Harvester creates an `agent` entity the first time it sees an `agentId` in an event.

**`execution`** — Represents a single agent run. Created from an `ExecutionEvent` with fields `duration`, `nodeCount`, `variant` (path signature), `conformanceScore`, and a `related` wikilink back to its parent `agent` entity.

**`archetype`** — Represents a discovered behavioral cluster: a group of agents or executions that share a common structural pattern. Created by the Cartographer. Contains `confidence`, `memberAgents`, `memberExecutions`, `bottlenecks`, and `suggestedPolicies`. Archetypes are the primary source for `PolicySource.isKnownBottleneck()`.

### Knowledge Layer

These entities represent what Soma has learned. They are created by the Synthesizer (which requires an LLM) or written directly by your application.

**`insight`** — A discovered fact. Has a `claim` string, `evidence` array, `confidence` (`low` | `medium` | `high`), and `sourceIds` pointing to the entities that led to the discovery.

**`policy`** — An actionable rule. Has `scope` (what it applies to), `conditions` (when it triggers), `enforcement` (`warn` | `error` | `abort` | `info`), and optional `thresholds` for numeric guard parameters.

**`decision`** — A recorded choice made about the system, with `claim`, `rationale`, `evidence`, and `confidence`. Decisions capture architectural intent in a durable, queryable form.

**`assumption`** — A belief that has not yet been validated. Like `insight` but without confirmed evidence. When an assumption is validated or invalidated, its `status` is updated accordingly.

**`constraint`** — A known limitation on what the system can do. Has the same structure as `assumption`. Constraints inform policy conditions and synthesis.

**`contradiction`** — A pair of conflicting positions (`positionA`, `positionB`) observed in the vault. The Reconciler flags these for review. When resolved, the `status` moves to `resolved`.

**`synthesis`** — A higher-order conclusion derived from combining multiple entities. The `synthesizedFrom` field lists the entity IDs that contributed to it. Syntheses represent Soma's deepest layer of learned knowledge.

---

## Workers

Soma's four workers run in a defined pipeline order via `soma.run()`.

### Harvester

The Harvester (`createHarvester`) is the ingestion entry point. It has two modes:

**Direct ingestion** — Call `harvester.ingest(events)` with an array of `ExecutionEvent` or `PatternEvent` objects from AgentFlow. The Harvester deduplicates by event ID, creates `agent` entities on first sight, and creates `execution` entities for each completed or failed run.

**Inbox processing** — Call `harvester.processInbox(dir)` to scan a directory for files. Supported formats out of the box:
- `.json` — Single event or array of events
- `.jsonl` — One event per line
- `.md` — Creates a `note` entity with the file content

Processed files are moved to a `processed/` sibling directory. Files that fail to parse are moved to `errors/`. State (processed event IDs, last timestamp) is persisted to `.soma/harvester-state.json` to prevent re-ingestion across restarts.

Custom parsers can be registered for additional file types via `HarvesterConfig.parsers`:

```ts
const soma = createSoma({
  harvester: {
    parsers: {
      '.csv': (content, fileName) => ({
        entities: [{ type: 'note', name: fileName, body: content }],
      }),
    },
  },
});
```

### Reconciler

The Reconciler (`createReconciler`) maintains vault health. Each run scans all entities and reports `ScanIssue` records with codes, severity, affected entity paths, and whether the issue is auto-fixable.

Common issue codes:
- `FM001` — Missing required frontmatter fields
- `LINK001` — Broken wikilink (referenced entity does not exist)
- `STUB001` — Entity body is below the minimum content threshold

When `autoFix` is enabled (or an `analysisFn` is provided), the Reconciler can repair missing fields and regenerate stub bodies.

### Synthesizer

The Synthesizer (`createSynthesizer`) requires an `AnalysisFn`. It reads `execution` and `archetype` entities, constructs prompts, and calls your LLM to extract:

- `insight` entities from patterns across executions
- `decision` and `policy` entities from recurring conditions
- `contradiction` entities when conflicting signals are detected
- `synthesis` entities that combine multiple sources into a unified conclusion

The Synthesizer deduplicates outputs using fuzzy matching to avoid creating near-identical entities across runs. State is tracked in `.soma/synthesizer-state.json`.

### Cartographer

The Cartographer (`createCartographer`) requires an `embedFn`. It operates in two phases:

1. **Embed** — Calls `embedFn` on each entity's body text and stores the resulting vector in the configured `VectorStore`.
2. **Discover** — Clusters embeddings to identify archetypes, then scores entity pairs for semantic similarity and suggests wikilink relationships.

The Cartographer's outputs feed the Policy Bridge's `isKnownBottleneck()` implementation, which checks discovered archetype bottleneck lists.

---

## Wikilinks

Relationships between entities are expressed as wikilinks in the `related` array. The format is `type/id`:

```yaml
related:
  - agent/my-agent
  - archetype/scan-pattern
  - insight/high-monday-failure
```

The vault resolves wikilinks via `vault.findLinked(id)`, which reads each `related` entry, splits on `/`, and returns the full entity. The `extractWikilinks(text)` utility can also parse wikilinks from freeform Markdown body text.

---

## Policy Bridge

The Policy Bridge (`createSomaPolicySource`) implements AgentFlow's `PolicySource` interface by reading live data from the vault. It requires no configuration beyond a `Vault` instance.

```ts
import { createSomaPolicySource } from 'agentflow-soma';

const policySource = createSomaPolicySource(vault);
```

The bridge implements four `PolicySource` methods:

| Method | Vault query |
|--------|-------------|
| `recentFailureRate(agentId)` | Reads the `agent` entity's `failureRate` field |
| `isKnownBottleneck(nodeName)` | Checks `bottlenecks` arrays across all `archetype` entities |
| `lastConformanceScore(agentId)` | Reads the most recent `execution` entity's `conformanceScore` |
| `getAgentProfile(agentId)` | Returns the `agent` entity's embedded `profile` object |

When `createSoma()` is used, a `policySource` is included automatically as `soma.policySource`. Pass it to guard constructors to enable adaptive enforcement based on accumulated organizational knowledge.
