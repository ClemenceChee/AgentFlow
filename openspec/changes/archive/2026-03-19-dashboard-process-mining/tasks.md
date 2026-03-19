## 1. Server Setup

- [x] 1.1 Add `createKnowledgeStore`, `createExecutionEvent`, `loadGraph`, `discoverProcess`, `findVariants`, `getBottlenecks` imports to `server.ts`
- [x] 1.2 Initialize `KnowledgeStore` in server constructor at `{dataDir}/.agentflow/knowledge/`
- [x] 1.3 Create helper function `getGraphTraces(agentId)` that filters watcher traces to valid ExecutionGraphs (non-empty nodes) and converts via `loadGraph()`
- [x] 1.4 Hook into watcher `trace-added` event: for valid graph traces, create ExecutionEvent and append to knowledge store

## 2. Replace Process Graph Endpoint

- [x] 2.1 Refactor `/api/agents/:agentId/process-graph`: use `getGraphTraces()` to check if graph-based traces exist
- [x] 2.2 For graph-based traces: call `discoverProcess(graphs)` and `getBottlenecks(graphs)`, map output to existing response shape (nodes with id/label/count/frequency/avgDuration/failRate/p95Duration, edges with source/target/count/frequency)
- [x] 2.3 Add virtual `[START]`/`[END]` nodes and edges to match existing frontend expectation
- [x] 2.4 Keep existing inline logic as fallback for session-only traces
- [x] 2.5 Add `maxEdgeCount` and `maxNodeCount` computation to maintain response shape compatibility

## 3. New API Endpoints

- [x] 3.1 Add `GET /api/agents/:agentId/variants` endpoint: call `findVariants(graphs)`, return `{ agentId, totalTraces, variants[] }` with pathSignature, count, percentage
- [x] 3.2 Add `GET /api/agents/:agentId/bottlenecks` endpoint: call `getBottlenecks(graphs)`, return `{ agentId, bottlenecks[] }` with nodeName, nodeType, occurrences, durations (median, p95, p99, min, max)
- [x] 3.3 Add `GET /api/agents/:agentId/profile` endpoint: read from knowledge store, return AgentProfile or 404

## 4. Frontend Enrichment

- [x] 4.1 Update Cytoscape node styling to use `p95Duration` for bottleneck heat coloring (green → yellow → red gradient)
- [x] 4.2 Update node click/hover detail panel to show p95 Duration field
- [x] 4.3 Add variant list panel below process map: fetch `/api/agents/:agentId/variants`, display top 5 variants with truncated path, count, percentage
- [x] 4.4 Add agent profile summary card to agent detail view: fetch `/api/agents/:agentId/profile`, display totalRuns, failureRate, knownBottlenecks
- [x] 4.5 Handle empty states: "No variant data" message, profile card hidden when 404

## 5. Testing

- [x] 5.1 Build verification: core (244 tests passing) + dashboard builds clean
- [x] 5.2 Verify existing dashboard tests: 59/71 pass (12 pre-existing failures in stats/watcher/process-health, none related to this change)
- [x] 5.3 Manual verification: dashboard starts with 905 traces, all 5 endpoints return correct data (process-graph, variants, bottlenecks, profile, curator process-graph)
