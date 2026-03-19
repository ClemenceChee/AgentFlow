## Context

The dashboard's `/api/agents/:agentId/process-graph` endpoint (server.ts:240-357) manually builds a process graph from traces: it extracts activity sequences, counts transitions, computes frequencies, and returns nodes/edges for Cytoscape.js rendering. This duplicates what `packages/core` now does with `discoverProcess`, `findVariants`, and `getBottlenecks`.

The key complication: the watcher loads traces in three formats (JSON, JSONL, LOG). Only JSON traces produce proper `ExecutionGraph` objects with a `nodes` Map. JSONL/LOG traces produce `WatchedTrace` objects with `sessionEvents[]` arrays instead. The core APIs require `ExecutionGraph[]` — they can't operate on session-based traces directly.

### Current response shape (process-graph)

```json
{
  "agentId": "alfred",
  "totalTraces": 50,
  "nodes": [{ "id": "fetch", "label": "fetch", "count": 45, "frequency": 0.9, "avgDuration": 200, "failRate": 0.02, "isVirtual": false }],
  "edges": [{ "source": "[START]", "target": "main", "count": 50, "frequency": 1.0 }],
  "maxEdgeCount": 50,
  "maxNodeCount": 45
}
```

The frontend's Cytoscape renderer depends on this shape.

## Goals / Non-Goals

**Goals:**
- Replace inline process mining with core APIs for graph-based traces
- Add variant, bottleneck, and profile endpoints
- Initialize knowledge store and persist events as traces arrive
- Enrich frontend process map with bottleneck coloring and variant info
- Keep backward compatibility for session-based traces

**Non-Goals:**
- Rewriting the watcher's trace loading logic
- Converting session-based traces to ExecutionGraph (future work)
- Adding new frontend pages/tabs (enrich existing views only)
- Changing the timeline/Gantt endpoints

## Decisions

### 1. Dual-path: core APIs for graph traces, existing logic for session traces

The process-graph endpoint checks whether an agent's traces have proper `ExecutionGraph` data (nodes as Map/object). If yes, use `discoverProcess` + `getBottlenecks`. If no (session-only), fall back to the existing inline logic.

This is a pragmatic split: ~50% of traces (alfred JSON files) benefit immediately. Session-based traces keep working. A future change can add session→graph conversion.

**Alternative considered:** Convert all session traces to ExecutionGraph upfront in the watcher. Rejected because it's a separate concern — the watcher handles many formats, and conversion logic is complex.

### 2. Map core API output to existing frontend shape

The frontend expects `{ nodes[], edges[], totalTraces, maxEdgeCount, maxNodeCount }`. The core's `ProcessModel` returns `{ steps[], transitions[], totalGraphs }`. A thin mapping layer translates:

- `ProcessModel.steps` → nodes with `id`, `label`, `count`, `frequency`
- `ProcessModel.transitions` → edges with `source`, `target`, `count`, `frequency`
- `getBottlenecks()` result enriches nodes with `avgDuration`, `failRate`, `p95Duration`
- Virtual `[START]`/`[END]` nodes are added to match existing behavior

This keeps the frontend unchanged while delivering richer data.

### 3. Knowledge store initialized in server constructor

```typescript
this.knowledgeStore = createKnowledgeStore({
  baseDir: join(this.config.dataDir || '.', '.agentflow', 'knowledge')
});
```

On watcher `trace-added` events, valid ExecutionGraphs are emitted to the knowledge store. This happens in the background — the store is append-only and cheap.

### 4. New endpoints are additive

| Endpoint | Source | Response |
|----------|--------|----------|
| `GET /api/agents/:agentId/variants` | `findVariants(graphs)` | Top variants with path, count, percentage |
| `GET /api/agents/:agentId/bottlenecks` | `getBottlenecks(graphs)` | Nodes with p50/p95/p99 durations |
| `GET /api/agents/:agentId/profile` | `store.getAgentProfile(id)` | Accumulated stats from knowledge store |

Existing endpoints remain unchanged.

### 5. Frontend enrichment via existing Cytoscape renderer

- **Bottleneck coloring**: nodes get a `p95Duration` field in the process-graph response. The Cytoscape renderer maps p95 to a yellow→red heat scale (existing `failRate` coloring logic extended).
- **Variant panel**: a collapsible list below the process map showing top 5 variants with percentages. Loaded from `/api/agents/:agentId/variants`.
- **Profile card**: agent summary (totalRuns, failureRate, knownBottlenecks) shown as a header card on the agent detail view.

## Risks / Trade-offs

- **Dual-path complexity** → Two code paths for process graph computation. Mitigation: the session-based path stays as-is (frozen), new code only touches the graph-based path. Clear comment marking the legacy path.
- **Shape mapping** → The core's `ProcessModel` doesn't have virtual START/END nodes. Mitigation: thin adapter adds them. Simple and tested.
- **Knowledge store disk usage** → Events accumulate on the dashboard server. Mitigation: compaction is available, and dashboard traces are typically small (~1KB each).
- **First-load cold start** → On first server start, knowledge store is empty — profile endpoint returns null. Mitigation: the endpoint returns 404 gracefully, and profiles build up as traces are loaded.
