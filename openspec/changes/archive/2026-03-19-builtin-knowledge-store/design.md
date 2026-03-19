## Context

AgentFlow has the full observe → mine → emit pipeline but no accumulation layer. Events are emitted and written to flat files via EventWriters, but nothing reads them back, indexes them, or makes them queryable. Guards are static — they can't learn from execution history.

Alfred's architecture provides proven patterns for this: structured entities with metadata, append-only ingestion, directory-based organization by entity type, and worker-based processing. AgentFlow's knowledge store adapts these patterns for execution intelligence — no LLM stages (Tier 1 is statistical), no wikilinks, but the same structural discipline.

### Current flow (broken loop)
```
agent executes → graph built → process mining → events emitted → flat files (dead end)
```

### Target flow (complete loop)
```
agent executes → graph built → process mining → events emitted → knowledge store → policy source → guards adapt
```

## Goals / Non-Goals

**Goals:**
- Self-contained knowledge accumulation within `packages/core` — no external dependencies
- Filesystem-based storage: append-only event log + derived indexes
- Query functions for recent events, agent profiles, pattern history
- PolicySource interface that guards consume for adaptive behavior
- Automatic persistence when wired into EventEmitter
- Works out of the box with `npm install agentflow`

**Non-Goals:**
- LLM-powered analysis (Tier 2/3 — future, requires user-provided LLM function)
- Entity linking / wikilinks (that's Soma's domain)
- Database or network storage (filesystem only for core)
- Real-time streaming queries (batch/read-on-demand is sufficient)
- Breaking existing guard API (PolicySource is opt-in)

## Decisions

### 1. Storage layout inspired by Alfred's vault pattern

Alfred organizes knowledge by entity type in directories. AgentFlow adapts this for execution intelligence:

```
.agentflow/knowledge/
├── events/
│   └── {agentId}/
│       └── {YYYY-MM-DD}/
│           └── {eventType}-{timestamp}.json
├── profiles/
│   └── {agentId}.json          # Derived: rolling stats per agent
└── patterns/
    └── {agentId}/
        └── {timestamp}.json    # Pattern snapshots over time
```

Events are append-only (never modified). Profiles are derived and recomputed on write. This mirrors Alfred's "raw input → processed entity" flow, but without LLM stages.

**Alternative considered:** Single flat directory with all events. Rejected because querying by agentId would require scanning all files. Date partitioning keeps reads fast.

### 2. Profile as a derived, rolling aggregate (inspired by Alfred's entity enrichment)

Alfred's Curator creates enriched entity records from raw input. AgentFlow's equivalent is the **agent profile** — a derived JSON record per agentId that summarizes:

- Total runs, success/failure counts, failure rate
- Last N execution durations (rolling window)
- Most recent conformance score
- Known bottleneck nodes (accumulated from pattern events)
- Last pattern snapshot timestamp

The profile is recomputed on every event write — cheap because it's a single JSON file per agent. Consumers (guards, dashboards) read the profile, not the raw event log.

**Alternative considered:** Compute profiles lazily on query. Rejected because it requires scanning the event log on every guard check — too slow for the hot path.

### 3. PolicySource as a pure read interface over profiles

```typescript
interface PolicySource {
  recentFailureRate(agentId: string): number;        // 0.0–1.0
  isKnownBottleneck(nodeName: string): boolean;
  lastConformanceScore(agentId: string): number | null;
  getAgentProfile(agentId: string): AgentProfile | null;
}
```

`createPolicySource(store)` creates a PolicySource backed by a knowledge store. Guards call these methods — they never touch the filesystem directly.

**Alternative considered:** Guards query the store directly. Rejected because it couples guards to storage internals and makes testing harder. The interface is the contract.

### 4. Guards accept optional PolicySource, remain backward-compatible

```typescript
interface GuardConfig {
  // ... existing fields ...
  readonly policySource?: PolicySource;
}
```

When `policySource` is present, `checkGuards` adds policy-derived violations:
- `high-failure-rate`: agent's recent failure rate exceeds threshold (default 0.5)
- `conformance-drift`: conformance score dropped below threshold (default 0.7)
- `known-bottleneck`: a running node is a known bottleneck (informational warning)

When `policySource` is absent, guards behave exactly as today. No breaking changes.

### 5. EventEmitter auto-persists to knowledge store (opt-in)

```typescript
const store = createKnowledgeStore({ baseDir: '.agentflow/knowledge' });
const emitter = createEventEmitter({
  writers: [jsonWriter],        // existing writers still work
  knowledgeStore: store,        // NEW: opt-in persistence
});
```

On `emit()`, the emitter writes to all writers AND persists to the knowledge store. The store implements `EventWriter` internally so this is just sugar over adding it as a writer.

### 6. Naming: AgentFlow's own vocabulary

Drawing from Alfred's patterns but with AgentFlow naming:
- **Knowledge Store** (not "vault") — the accumulation layer
- **Agent Profile** (not "entity") — derived per-agent summary
- **PolicySource** (not "Curator/Distiller") — the query interface for guards
- **Pattern Snapshot** (not "synthesis") — accumulated process mining results

## Risks / Trade-offs

- **Disk growth** → Append-only event log grows indefinitely. Mitigation: date-partitioned directories make it trivial to prune old data. Add a `compact(olderThan)` method that removes events beyond a retention window.
- **Profile recomputation cost** → Recomputing profile on every write could be slow if event history is large. Mitigation: profile stores rolling aggregates (last 100 runs), not full history. Recomputation reads the profile file + appends new data, not the full event log.
- **Concurrent writes** → Multiple agent processes writing to the same store could corrupt profiles. Mitigation: write-then-rename pattern for atomic file updates. Events are always new files (no conflict). Profile updates use a temp file + rename.
- **Cold start** → First run has no history, so PolicySource returns defaults (failure rate 0, no bottlenecks). This is correct behavior — guards start permissive and tighten as knowledge accumulates.
