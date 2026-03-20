---
sidebar_position: 3
title: Getting Started with Soma
---

# Getting Started with Soma

:::caution Experimental
Soma is experimental. APIs may change between minor versions. Do not use in production without pinning an exact version.
:::

## Installation

Install the `agentflow-soma` package alongside `agentflow-core`:

```bash
npm install agentflow-soma agentflow-core
```

Soma has no required peer dependencies beyond `agentflow-core`. The Synthesizer and Cartographer workers require you to supply your own LLM and embedding functions — Soma does not install any AI SDK by default.

---

## Create a Soma Instance

The `createSoma()` factory wires up the vault, vector store, all four workers, and the policy bridge in one call:

```ts
import { createSoma } from 'agentflow-soma';

const soma = createSoma({
  vaultDir: '.soma/vault',   // default
  inboxDir: '.soma/inbox',   // default
});
```

`createSoma` returns a `Soma` object with these properties:

| Property | Type | Description |
|----------|------|-------------|
| `soma.vault` | `Vault` | Direct access to the knowledge vault |
| `soma.vectorStore` | `VectorStore` | The vector backend (JSON file by default) |
| `soma.policySource` | `PolicySource` | Ready to pass to AgentFlow guards |
| `soma.harvester` | Harvester | Ingest events and inbox files |
| `soma.synthesizer` | Synthesizer or `undefined` | Present only when `analysisFn` is provided |
| `soma.cartographer` | Cartographer | Embed and cluster entities |
| `soma.reconciler` | Reconciler | Scan and repair vault health |

---

## Ingest Execution Events

The most common starting point is feeding AgentFlow execution events into the Harvester directly:

```ts
import { createEventEmitter } from 'agentflow-core';

// Wire up the event emitter to feed Soma automatically
const emitter = createEventEmitter({
  writers: [],
  onError: console.error,
});

// Subscribe to events and forward them to Soma
emitter.subscribe(async (event) => {
  await soma.harvester.ingest([event]);
});
```

Alternatively, if you have a batch of events from a `KnowledgeStore` or another source:

```ts
const events = knowledgeStore.getRecentEvents('my-agent', { limit: 100 });
await soma.harvester.ingest(events);
```

The Harvester deduplicates automatically — re-ingesting the same event ID is a no-op.

---

## Process an Inbox Directory

Drop files into `.soma/inbox` and call `processInbox` to ingest them:

```ts
// Manually trigger inbox processing
const count = await soma.harvester.processInbox('.soma/inbox');
console.log(`Ingested ${count} files`);
```

The Harvester supports `.json`, `.jsonl`, and `.md` files out of the box. Processed files are moved to `.soma/processed/`. Failed files are moved to `.soma/errors/`.

To watch the inbox continuously:

```ts
// Returns an unsubscribe function
const stopWatching = soma.watch();

// Later, to stop:
stopWatching();
```

The watcher polls every 10 seconds. See the [Roadmap](./roadmap.md) for plans to replace polling with a proper file watcher.

---

## Run the Full Pipeline

`soma.run()` executes all four workers in order: Harvester, Reconciler, Synthesizer (if configured), then Cartographer:

```ts
const result = await soma.run();

console.log(`Harvested: ${result.harvested} files`);
console.log(`Reconciled: ${result.reconciled.issues} issues, ${result.reconciled.fixed} fixed`);
console.log(`Synthesized: ${result.synthesized} entities`);
console.log(`Mapped: ${result.mapped} embeddings + archetypes`);
```

Run this on a schedule (e.g., every hour via cron) to keep the vault current with execution data.

---

## Inspect the Vault on Disk

After running the pipeline, inspect the vault directory directly:

```bash
# List all agent entities
ls .soma/vault/agent/

# Read an agent entity
cat .soma/vault/agent/my-agent.md

# Find all entities tagged with 'failure-pattern'
grep -rl "failure-pattern" .soma/vault/
```

You can also query via the vault API:

```ts
// List all agent entities
const agents = soma.vault.list('agent');
agents.forEach((a) => console.log(a.id, a.name));

// Read a specific agent
const agent = soma.vault.read('agent', 'my-agent');
console.log(agent?.failureRate);

// Find all entities linked to this agent
const linked = soma.vault.findLinked('my-agent');
linked.forEach((e) => console.log(e.type, e.id));

// Find all entities with a tag
const failures = soma.vault.findByTag('failure-pattern');
```

---

## Query via Policy Bridge

The `policySource` returned by `createSoma()` implements AgentFlow's `PolicySource` interface. Pass it to guards to enable adaptive enforcement:

```ts
import { createGraphBuilder } from 'agentflow-core';

const builder = createGraphBuilder({
  agentId: 'my-agent',
  trigger: 'user-request',
});

// Check accumulated failure rate before executing
const failureRate = soma.policySource.recentFailureRate('my-agent');
if (failureRate > 0.4) {
  console.warn(`Agent my-agent has a ${(failureRate * 100).toFixed(0)}% failure rate`);
}

// Check whether a specific node is a known bottleneck
const isSlow = soma.policySource.isKnownBottleneck('fetch-market-data');
if (isSlow) {
  console.warn('fetch-market-data is a known bottleneck — consider caching');
}

// Get the last conformance score
const score = soma.policySource.lastConformanceScore('my-agent');
if (score !== null && score < 0.7) {
  console.warn(`Low conformance score: ${score}`);
}
```

These methods read directly from the vault — no network calls, no additional configuration.

---

## Enable the Synthesizer (Optional)

To extract insights, policies, and decisions with an LLM, provide an `analysisFn`:

```ts
import { createSoma } from 'agentflow-soma';
import OpenAI from 'openai';

const openai = new OpenAI();

const soma = createSoma({
  analysisFn: async (prompt) => {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
    });
    return response.choices[0]?.message.content ?? '';
  },
});
```

With `analysisFn` set, `soma.synthesizer` is defined and `soma.run()` will call it automatically.

---

## Enable the Cartographer (Optional)

To build a semantic map of the vault and discover archetypes, provide an `embedFn`:

```ts
const soma = createSoma({
  embedFn: async (text) => {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
    });
    return response.data[0]!.embedding;
  },
});
```

With `embedFn` set, `soma.cartographer.embed()` and `soma.cartographer.discover()` are called during `soma.run()`. Vectors are stored in `.soma/_vectors.json` by default.
