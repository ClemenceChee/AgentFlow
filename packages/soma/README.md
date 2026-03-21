# soma

> **Experimental.** This package is under active development. APIs will change between minor versions. Do not use in production without pinning an exact version.

**v0.1.0** — Organizational intelligence layer for AI agent systems. Knowledge vault, semantic search, and adaptive policy generation.

Soma ingests execution events from AgentFlow, external signals, and structured data. It builds a persistent knowledge vault, mines patterns across runs, and feeds learned policies back to AgentFlow guards — closing the feedback loop between execution and enforcement.

Four workers coordinate the pipeline: **Harvester** (ingest), **Reconciler** (maintain), **Synthesizer** (learn), **Cartographer** (map).

## Installation

```bash
npm install soma agentflow-core
```

Requires Node.js >= 20.

## Quick start

### 1 — Create a Soma instance

```ts
import { createSoma } from 'soma';

const soma = createSoma({
  vaultDir: '.soma/vault',   // where entities are stored (default: .soma/vault)
  inboxDir: '.soma/inbox',   // where raw files are dropped for harvesting (default: .soma/inbox)
});
```

### 2 — Ingest execution events

Drop AgentFlow event files into the inbox directory, or configure `createSomaEventWriter` in your agent to write there directly.

```ts
import { createSomaEventWriter } from 'agentflow-core';

const writer = createSomaEventWriter({ inboxDir: '.soma/inbox' });
// Attach writer to your event emitter; events are written as the agent runs.
```

### 3 — Run the full pipeline

```ts
const result = await soma.run();
// { harvested: 12, reconciled: { issues: 2, fixed: 2 }, synthesized: 5, mapped: 34 }
```

`run()` executes all four workers in sequence: Harvester → Reconciler → Synthesizer → Cartographer.

To watch an inbox directory and harvest continuously:

```ts
const stop = soma.watch(); // polls every 10 seconds
// ... later:
stop();
```

### 4 — Inspect the vault

The vault stores typed entities (agents, executions, insights, policies, archetypes, decisions, assumptions, constraints, contradictions).

```ts
const agents = soma.vault.list('agent');
const insight = soma.vault.read('insight', 'slow-fetch-tool');

// Semantic search (requires embedFn in config)
const results = await soma.vectorStore.search(embedding, { limit: 5 });
```

### 5 — Query the policy bridge

Wire Soma's learned policies back into AgentFlow guards:

```ts
import { createGraphBuilder, withGuards } from 'agentflow-core';

const guarded = withGuards(createGraphBuilder({ agentId: 'my-agent' }), {
  onViolation: 'warn',
  policySource: soma.policySource,   // adapts guard thresholds from vault knowledge
  policyThresholds: {
    maxFailureRate: 0.3,
    minConformance: 0.75,
  },
});
```

Guards will now flag high failure rates, conformance drift, and known bottlenecks drawn from accumulated organizational data.

## API highlights

| Export | Kind | Description |
|---|---|---|
| `createSoma` | factory | Orchestrator: creates vault, vector store, and all four workers |
| `createVault` | factory | Persistent entity store (file-backed, typed) |
| `createHarvester` | factory | Ingests raw files from an inbox directory into the vault |
| `createSynthesizer` | factory | Runs an LLM analysis function to extract insights and policies |
| `createCartographer` | factory | Embeds entities and discovers archetypes via clustering |
| `createReconciler` | factory | Scans vault for issues (broken links, stale data) and repairs them |
| `createSomaPolicySource` | factory | PolicySource bridge from vault → AgentFlow guards |
| `createJsonVectorStore` | factory | JSON-backed vector store for development |
| `createLanceVectorStore` | factory | LanceDB-backed vector store for production |
| `createMilvusVectorStore` | factory | Milvus-backed vector store for production |
| `cosineSimilarity` | fn | Cosine similarity between two embedding vectors |
| `parseEntity` / `serializeEntity` | fn | Entity serialization utilities |
| `extractWikilinks` | fn | Extract `[[wikilink]]` references from entity content |

## Experimental docs

[https://github.com/ClemenceChee/AgentFlow#readme](https://github.com/ClemenceChee/AgentFlow#readme)
