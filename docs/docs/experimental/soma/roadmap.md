---
sidebar_position: 4
title: Soma Roadmap
---

# Soma Roadmap

:::caution Experimental
Soma is experimental. APIs may change between minor versions. Do not use in production without pinning an exact version.
:::

This page describes what is stable, what is experimental, what is planned, and what the known limitations are.

---

## Stable

These features are complete, tested, and unlikely to have breaking API changes within a minor version.

- **Vault CRUD** — `create`, `read`, `update`, `remove`, `list`, `findByTag`, `findLinked` via `createVault()`
- **Entity system** — All nine built-in entity types (`agent`, `execution`, `archetype`, `insight`, `policy`, `decision`, `assumption`, `constraint`, `contradiction`, `synthesis`) with YAML frontmatter serialization
- **Harvester ingestion** — `harvester.ingest(events)` and `harvester.processInbox(dir)` with deduplication and state persistence
- **Inbox parsers** — Built-in `.json`, `.jsonl`, and `.md` parsers; pluggable custom parsers via `HarvesterConfig.parsers`
- **Policy Bridge** — `createSomaPolicySource(vault)` implementing `PolicySource` with `recentFailureRate`, `isKnownBottleneck`, `lastConformanceScore`, and `getAgentProfile`
- **JSON vector store** — `createJsonVectorStore()` for development and low-volume use
- **`createSoma()` orchestrator** — Full pipeline via `soma.run()` and polling-based inbox watcher via `soma.watch()`

---

## Experimental

These features work but have known rough edges, limited test coverage, or APIs that may evolve.

- **Synthesizer** — LLM-powered knowledge extraction runs and produces entities, but prompt design and dedup thresholds will be tuned. Requires `analysisFn`. The set of entity types extracted and the fuzzy match logic may change.
- **Cartographer** — Embedding and clustering work at small scale, but archetype discovery parameters (`minClusterSize`, `similarityThreshold`) may be adjusted. Requires `embedFn`.
- **Reconciler autofix** — Basic field repair is stable. LLM-assisted body regeneration (when `analysisFn` is provided) is experimental and may produce low-quality results on sparse entities.
- **Wikilink extraction from body text** — `extractWikilinks(text)` parses `[[type/id]]` syntax from Markdown body text, but handling of edge cases (nested brackets, multiline links) is incomplete.

---

## Planned

These features are on the roadmap but not yet started or in design only.

- **LanceDB and Milvus vector backends** — `createLanceVectorStore()` and `createMilvusVectorStore()` are exported but not yet implemented. They are stubs that throw on use. Production-scale semantic search requires one of these backends.
- **LLM-assisted reconciliation** — The Reconciler will use `analysisFn` to generate body content for stub entities and to propose resolutions for detected contradictions.
- **Real-time event streaming** — Replace the 10-second polling watcher (`soma.watch()`) with a proper file system event listener, removing latency and CPU overhead.
- **Dashboard integration** — Surface vault entity counts, recent insights, archetype discoveries, and policy bridge query results in the AgentFlow dashboard.
- **Vault search** — Full-text search across entity bodies and frontmatter without requiring embeddings.
- **Pattern event archetype creation** — The Harvester currently ignores `pattern.discovered` and `pattern.updated` events beyond updating agent stats. Future versions will automatically create `archetype` entities from AgentFlow pattern mining results.

---

## Known Limitations

**Simple YAML parser — no nested objects.** Soma's frontmatter parser handles flat key-value pairs and YAML arrays of scalars. Nested objects in frontmatter (e.g., `thresholds: { maxFailureRate: 0.5 }`) are not parsed correctly. Use flat representations or store nested data in the entity body.

**JSON vector store is not for large vaults.** `createJsonVectorStore` loads the entire vector file into memory on each query. At more than 5,000 vectors (roughly 5,000 entities with embeddings), query latency degrades significantly. Use the LanceDB or Milvus backends when they are available, or integrate your own `VectorStore` implementation.

**Polling-based inbox watcher.** `soma.watch()` polls the inbox directory every 10 seconds using `setInterval`. On high-throughput systems where new files arrive continuously, this introduces up to 10 seconds of ingestion latency. For lower latency, call `soma.harvester.processInbox()` directly on a tighter schedule or in response to an upstream event.

**Harvester state cap.** The Harvester keeps only the last 10,000 processed event IDs in its state file. On agents with very high execution frequency over a long period, older IDs are evicted and a re-ingested file may create duplicate entities. Compact old execution files from the inbox before this threshold is reached.

**No concurrent vault writes.** The vault uses atomic file rename for writes but does not hold a lock across the read-modify-write cycle. Running multiple `soma.run()` calls simultaneously against the same vault directory may cause lost updates. Run one pipeline at a time.
