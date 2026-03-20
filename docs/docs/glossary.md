---
sidebar_position: 6
title: Glossary
---

# Glossary

Terms used across AgentFlow and the Soma experimental layer, listed alphabetically. Soma-specific terms are marked *(Soma, experimental)*.

---

**adapter** — A plugin that hooks into an agent framework's lifecycle events and translates them into `GraphBuilder` calls. Adapters implement the `Adapter` interface with `attach` and `detach` methods.

**agent profile** — A derived summary accumulated from execution and pattern events for a single agent. Returned by `KnowledgeStore.getAgentProfile()` and contains fields like `failureRate`, `knownBottlenecks`, and `lastConformanceScore`.

**analysis function** — A user-provided async function with the signature `(prompt: string) => Promise<string>`. AgentFlow constructs prompts and delegates the actual LLM call to this function, keeping the library provider-agnostic. Typed as `AnalysisFn`.

**archetype** *(Soma, experimental)* — A cluster of agents or executions that share a common behavioral pattern, discovered by the Cartographer worker. Stored as an `ArchetypeEntity` in the vault with fields like `confidence`, `memberAgents`, `bottlenecks`, and `suggestedPolicies`.

**bottleneck** — A node that has statistically high execution durations across multiple graphs. Represented by the `Bottleneck` interface, which includes `p95` and `p99` duration percentiles. Node names appearing in archetypes are also flagged via `PolicySource.isKnownBottleneck()`.

**cartographer** *(Soma, experimental)* — The Soma worker responsible for embedding entities into vector space and discovering archetypes through clustering. Requires an `embedFn` to be provided. Created via `createCartographer()`.

**conformance score** — A number between 0.0 and 1.0 that measures how closely a single execution graph matches a discovered process model. A score of 1.0 means no deviations. Returned in `ConformanceReport.conformanceScore`.

**contradiction** *(Soma, experimental)* — A knowledge entity that records two conflicting positions observed in the vault, captured as a `ContradictionEntity` with `positionA` and `positionB` fields. The Reconciler flags and optionally resolves contradictions.

**edge** — A directed relationship between two nodes in an execution graph. Typed as `ExecutionEdge` with `from`, `to`, and a relationship type (`spawned`, `waited_on`, `called`, `retried`, or `branched`).

**entity** *(Soma, experimental)* — The base unit of knowledge in the Soma vault. All entities implement the `Entity` interface and are stored as Markdown files with YAML frontmatter. Every entity has `type`, `id`, `name`, `status`, `created`, `updated`, `tags`, `related`, and `body` fields.

**entity type** *(Soma, experimental)* — The category an entity belongs to, matching its directory name in the vault. Built-in types span two layers: Agent Layer (`agent`, `execution`, `archetype`) and Knowledge Layer (`insight`, `policy`, `decision`, `assumption`, `constraint`, `contradiction`, `synthesis`). Custom string types are also supported.

**event emitter** — The AgentFlow component that routes `ExecutionEvent` and `PatternEvent` instances to registered `EventWriter` targets and in-process subscribers. Created via `createEventEmitter()` and configured with the `EventEmitterConfig` interface.

**event writer** — An output target that receives structured AgentFlow events. Extends the `Writer` interface with a `writeEvent(event)` method. `KnowledgeStore` implements `EventWriter` so it can be used directly with `createEventEmitter`.

**execution graph** — The complete record of a single agent run, represented by the `ExecutionGraph` interface. Contains all nodes, edges, events, timing, status, and optional distributed trace context.

**execution node** — A single step in an execution graph, represented by `ExecutionNode`. Has a `type` (`agent`, `tool`, `subagent`, `wait`, `decision`, or `custom`), `status`, parent/child relationships, `metadata`, and `state`.

**guard** — A runtime check applied to execution graphs to detect problematic conditions such as timeouts, reasoning loops, spawn explosions, high failure rates, conformance drift, and known bottlenecks. Guards produce `GuardViolation` records.

**guard violation** — A `GuardViolation` record emitted when a guard detects a problem. Contains `type`, `nodeId`, `message`, and `timestamp`. Violations are attached to `ExecutionEvent` records.

**harvester** *(Soma, experimental)* — The Soma worker that ingests data into the vault. Processes `ExecutionEvent` and `PatternEvent` objects from AgentFlow, and scans an inbox directory for `.json`, `.jsonl`, and `.md` files. Created via `createHarvester()`.

**inbox parser** *(Soma, experimental)* — A pluggable function that converts raw file content into events or entity partials for vault ingestion. The `InboxParser` type has the signature `(content: string, fileName: string) => InboxParseResult`. Custom parsers can be registered by file extension in `HarvesterConfig.parsers`.

**insight** *(Soma, experimental)* — A knowledge entity that records a discovered claim with supporting evidence and a confidence level (`low`, `medium`, or `high`). Stored as an `InsightEntity`. Distinct from the AgentFlow `InsightEngine`, which generates LLM-powered analyses stored as `InsightEvent` records.

**insight engine** — An LLM-powered analysis component in AgentFlow core. Uses an `AnalysisFn` to explain failures, explain anomalies, summarize agent health, and suggest fixes. Results are cached and stored as `InsightEvent` records in a `KnowledgeStore`.

**knowledge store** — The AgentFlow core component that persists `ExecutionEvent`, `PatternEvent`, and `InsightEvent` records to disk and derives per-agent profiles. Implements `EventWriter`. Created via `createKnowledgeStore()` with a configurable `baseDir`.

**node status** — The lifecycle state of an `ExecutionNode`. One of: `running`, `completed`, `failed`, `hung`, or `timeout`.

**node type** — The category of work an `ExecutionNode` represents. One of: `agent`, `tool`, `subagent`, `wait`, `decision`, or `custom`.

**path signature** — A canonical string that encodes the sequence of steps taken through an execution graph, used to group runs into variants. Stored in `Variant.pathSignature` and `ExecutionEvent.pathSignature`.

**policy bridge** *(Soma, experimental)* — The Soma component that implements AgentFlow's `PolicySource` interface by reading from the vault. Closes the feedback loop by making accumulated organizational knowledge available to AgentFlow guards. Created via `createSomaPolicySource()`.

**policy source** — A read-only interface (`PolicySource`) used by AgentFlow guards to query accumulated execution history. Provides `recentFailureRate()`, `isKnownBottleneck()`, `lastConformanceScore()`, and `getAgentProfile()`. The `KnowledgeStore` and Soma's `PolicyBridge` both implement this interface.

**process model** — A statistical model of agent behavior discovered from a set of execution graphs via process mining. The `ProcessModel` interface contains all observed steps, transitions with frequencies, and the total number of graphs analyzed.

**reconciler** *(Soma, experimental)* — The Soma worker that maintains vault health by scanning for issues such as missing required fields, broken wikilinks, and stub entities. Reports `ScanIssue` records and can auto-fix some problems. Created via `createReconciler()`.

**synthesis** *(Soma, experimental)* — A knowledge entity that represents a higher-order conclusion derived from combining multiple other entities, stored as a `SynthesisEntity`. The `synthesizedFrom` field records which entity IDs contributed to the synthesis.

**synthesizer** *(Soma, experimental)* — The Soma worker that uses an `AnalysisFn` to extract insights, decisions, and policies from execution and archetype entities. Requires `analysisFn` to be passed to `createSoma()`. Created via `createSynthesizer()`.

**trace event** — A raw lifecycle event recorded during execution, represented by `TraceEvent`. Has `timestamp`, `eventType`, `nodeId`, and `data`. The full ordered event log is stored on `ExecutionGraph.events` for auditability.

**variant** — A group of execution graphs that share the same structural path signature. The `Variant` interface includes `count`, `percentage`, member `graphIds`, and an `exampleGraph`.

**vault** *(Soma, experimental)* — The filesystem-based knowledge store at the heart of Soma. Persists entities as Markdown files with YAML frontmatter, organized into type-named directories under a configurable `baseDir` (default: `.soma/vault`). The `Vault` interface provides CRUD, list, tag-based, and wikilink-based queries. Created via `createVault()`.

**vector store** *(Soma, experimental)* — A pluggable storage backend for entity embeddings used by the Cartographer. Implements the `VectorStore` interface with `upsert`, `delete`, `search`, and `count` methods. Soma ships a JSON file backend (`createJsonVectorStore`) and optional LanceDB and Milvus backends.

**wikilink** *(Soma, experimental)* — A cross-entity reference in the format `type/id` stored in an entity's `related` array (e.g., `"agent/my-agent"` or `"archetype/scan-pattern"`). The vault's `findLinked()` method resolves wikilinks to full entities.
