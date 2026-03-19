## Why

AgentFlow can observe agent executions, mine patterns across runs, and emit structured events — but the events vanish into flat files with no accumulation or feedback. The observe → mine → emit loop exists, but the **accumulate → adapt** half doesn't. Without a built-in knowledge store, `npm install agentflow` gives you tracing and analytics but not the self-improving feedback loop that's AgentFlow's core differentiator over LangSmith/Langfuse. This completes Phase 1 of the roadmap.

## What Changes

- **New knowledge store** (`packages/core/src/knowledge-store.ts`): A filesystem-based, append-only event log that accumulates ExecutionEvents and PatternEvents across runs. Indexed by agentId and timestamp. Queryable with pure functions.
- **New query functions**: `getRecentEvents(agentId, timeRange)`, `getPatternHistory(agentId)`, `getAgentProfile(agentId)` — read accumulated knowledge without loading all data into memory.
- **New PolicySource interface** (in `types.ts`): The contract adaptive guards use to query accumulated knowledge — `recentFailureRate(agentId)`, `isKnownBottleneck(nodeName)`, `lastConformanceScore(agentId)`.
- **Adaptive guards**: `withGuards` and `checkGuards` accept an optional `PolicySource` to make dynamic decisions (e.g., warn on high failure rate, flag known bottlenecks, detect conformance drift).
- **EventEmitter integration**: `createEventEmitter` accepts an optional knowledge store as a writer, so events are automatically persisted as they're emitted.

## Capabilities

### New Capabilities
- `knowledge-store`: Filesystem-based event accumulation and querying. Append-only log indexed by agentId + timestamp, with pure query functions for recent events, pattern history, and agent profiles.
- `policy-source`: PolicySource interface and default implementation that derives adaptive policies from the knowledge store. Bridges accumulated knowledge to guard decisions.

### Modified Capabilities
- `event-emission`: EventEmitter gains optional knowledge store integration for automatic event persistence.

## Impact

- **New files**: `packages/core/src/knowledge-store.ts`, `packages/core/src/policy-source.ts`
- **Modified files**: `packages/core/src/types.ts` (PolicySource interface, KnowledgeStore interface), `packages/core/src/guards.ts` (accept PolicySource), `packages/core/src/event-emitter.ts` (optional store config), `packages/core/src/index.ts` (new exports)
- **Zero new runtime dependencies**: Filesystem only (`node:fs`, `node:path`).
- **No breaking changes**: PolicySource is optional in guard config. Existing guard usage unchanged.
- **Storage**: Events stored as JSON files under a configurable directory (default: `.agentflow/knowledge/`).
