## Why

The dashboard has 120 lines of hand-rolled process mining at `server.ts:240-357` — transition counting, frequency calculation, activity extraction — that duplicates what `packages/core` now does better. The core's `discoverProcess`, `findVariants`, and `getBottlenecks` produce richer output (DFG with probabilities, variant clustering, percentile statistics) and are thoroughly tested (244 tests). Meanwhile, the dashboard can't show variants, bottleneck heatmaps, or agent profiles because it's computing everything from scratch. Replacing the inline code with core APIs removes duplication and unlocks the new capabilities in the UI.

## What Changes

- **Replace inline process-graph computation** in `server.ts` with `discoverProcess()` from core. The `/api/agents/:agentId/process-graph` endpoint returns the same shape but computed by the tested engine.
- **New variant endpoint** (`/api/agents/:agentId/variants`) powered by `findVariants()`. Shows execution path clusters with frequency percentages.
- **New bottleneck endpoint** (`/api/agents/:agentId/bottlenecks`) powered by `getBottlenecks()`. Returns p50/p95/p99 duration stats per node.
- **New agent profile endpoint** (`/api/agents/:agentId/profile`) backed by the knowledge store. Returns accumulated stats: failure rate, recent durations, known bottlenecks, conformance score.
- **Knowledge store initialization** on server startup. As the watcher loads traces, valid ExecutionGraphs are persisted to the knowledge store.
- **Frontend enrichment**: bottleneck highlighting on the Cytoscape process map (color by p95), variant list panel, agent profile summary card.
- **Backward compatibility**: traces from JSONL/LOG files that don't produce valid ExecutionGraphs continue to use the existing rendering path. The new APIs only operate on proper ExecutionGraph traces.

## Capabilities

### New Capabilities
- `dashboard-mining-api`: Server-side API endpoints that wrap core process mining functions and knowledge store queries for the dashboard frontend.
- `dashboard-mining-ui`: Frontend components for displaying variants, bottlenecks, and agent profiles.

### Modified Capabilities

## Impact

- **Modified files**: `packages/dashboard/src/server.ts` (replace inline mining, add endpoints), `packages/dashboard/public/dashboard.js` (new panels/tabs)
- **New dependency usage**: `discoverProcess`, `findVariants`, `getBottlenecks`, `createKnowledgeStore`, `createExecutionEvent`, `loadGraph` from `agentflow-core` (already a dependency)
- **API additions**: 3 new REST endpoints, no breaking changes to existing endpoints
- **Storage**: Knowledge store at `.agentflow/knowledge/` created on server startup
