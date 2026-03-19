## ADDED Requirements

### Requirement: Process graph endpoint uses core APIs for graph-based traces
The `/api/agents/:agentId/process-graph` endpoint SHALL use `discoverProcess()` and `getBottlenecks()` from `agentflow-core` when the agent's traces contain valid ExecutionGraph data (nodes as Map or plain object). The response shape SHALL remain compatible with the existing frontend: `{ agentId, totalTraces, nodes[], edges[], maxEdgeCount, maxNodeCount }`.

#### Scenario: Graph-based traces use core API
- **WHEN** a GET request is made to `/api/agents/:agentId/process-graph` and the agent has traces with proper ExecutionGraph nodes
- **THEN** the response SHALL contain nodes derived from `discoverProcess().steps` and edges derived from `discoverProcess().transitions`, with `frequency` computed as `count / totalGraphs`

#### Scenario: Nodes include bottleneck statistics
- **WHEN** the process-graph endpoint returns nodes for graph-based traces
- **THEN** each node SHALL include `avgDuration`, `failRate`, and `p95Duration` fields derived from `getBottlenecks()`

#### Scenario: Virtual START and END nodes included
- **WHEN** the process-graph response is built from core API output
- **THEN** the response SHALL include `[START]` and `[END]` virtual nodes with edges connecting them to root and leaf steps, matching the existing frontend expectation

#### Scenario: Session-based traces fall back to existing logic
- **WHEN** a GET request is made to `/api/agents/:agentId/process-graph` and the agent's traces only have sessionEvents (no proper nodes)
- **THEN** the endpoint SHALL use the existing inline computation logic for backward compatibility

### Requirement: Variants endpoint
The server SHALL expose `GET /api/agents/:agentId/variants` that returns variant analysis from `findVariants()`.

#### Scenario: Variants returned for agent with graph traces
- **WHEN** a GET request is made to `/api/agents/:agentId/variants` and graph-based traces exist
- **THEN** the response SHALL contain `{ agentId, totalTraces, variants[] }` where each variant has `pathSignature`, `count`, and `percentage`

#### Scenario: No graph traces available
- **WHEN** a GET request is made to `/api/agents/:agentId/variants` and no graph-based traces exist
- **THEN** the response SHALL be `{ agentId, totalTraces: 0, variants: [] }`

### Requirement: Bottlenecks endpoint
The server SHALL expose `GET /api/agents/:agentId/bottlenecks` that returns bottleneck analysis from `getBottlenecks()`.

#### Scenario: Bottlenecks returned for agent
- **WHEN** a GET request is made to `/api/agents/:agentId/bottlenecks` and graph-based traces exist
- **THEN** the response SHALL contain `{ agentId, bottlenecks[] }` where each bottleneck has `nodeName`, `nodeType`, `occurrences`, and `durations` (with `median`, `p95`, `p99`, `min`, `max`)

#### Scenario: No graph traces
- **WHEN** no graph-based traces exist for the agent
- **THEN** the response SHALL be `{ agentId, bottlenecks: [] }`

### Requirement: Agent profile endpoint
The server SHALL expose `GET /api/agents/:agentId/profile` that returns the agent's accumulated profile from the knowledge store.

#### Scenario: Profile exists
- **WHEN** a GET request is made to `/api/agents/:agentId/profile` and events have been accumulated
- **THEN** the response SHALL contain the `AgentProfile` fields: `agentId`, `totalRuns`, `successCount`, `failureCount`, `failureRate`, `lastConformanceScore`, `knownBottlenecks`, `updatedAt`

#### Scenario: No profile yet
- **WHEN** a GET request is made to `/api/agents/:agentId/profile` and no events exist for the agent
- **THEN** the response SHALL be 404 with `{ error: 'No profile for agent' }`

### Requirement: Knowledge store initialization
The dashboard server SHALL initialize a `KnowledgeStore` on startup. When the watcher emits a new trace that is a valid ExecutionGraph, the server SHALL create an `ExecutionEvent` and append it to the knowledge store.

#### Scenario: Store created on startup
- **WHEN** the dashboard server starts
- **THEN** a KnowledgeStore SHALL be initialized at `{dataDir}/.agentflow/knowledge/`

#### Scenario: Valid trace persisted to store
- **WHEN** the watcher emits a `trace-added` event with a trace containing proper ExecutionGraph nodes
- **THEN** an ExecutionEvent SHALL be created via `createExecutionEvent()` and appended to the knowledge store

#### Scenario: Session-only trace not persisted
- **WHEN** the watcher emits a `trace-added` event with a session-only trace (no proper nodes)
- **THEN** no event SHALL be appended to the knowledge store

### Requirement: Graph trace filtering helper
The server SHALL provide a helper function that filters an agent's traces to only those with valid ExecutionGraph data (non-empty nodes Map or object), and converts them via `loadGraph()` for use with core APIs.

#### Scenario: Mixed trace types filtered
- **WHEN** an agent has 10 graph-based traces and 5 session-based traces
- **THEN** the helper SHALL return only the 10 valid ExecutionGraph objects
