# Data Flow

## Critical Path 1: Agent Execution → Graph Construction → Persistence

```mermaid
sequenceDiagram
    participant Agent as Agent Process
    participant FS as Filesystem
    participant Builder as GraphBuilder
    participant Store as TraceStore
    participant Loader as Loader

    Agent->>Builder: createGraphBuilder({ agentId, trigger })
    Builder->>Builder: Initialize root node, counter IDs

    loop For each operation
        Agent->>Builder: startNode({ type, name, parentId })
        Builder->>Builder: Create node, link parent, record event
        Agent->>Builder: endNode(nodeId) or failNode(nodeId, error)
        Builder->>Builder: Set endTime, status, error
    end

    Agent->>Builder: build()
    Builder->>Builder: Deep freeze all nodes + edges
    Builder-->>Agent: ExecutionGraph (immutable)

    Agent->>Store: store.save(graph)
    Store->>Loader: graphToJson(graph)
    Loader-->>Store: JSON string (nodes as object, not Map)
    Store->>FS: writeFile(traces/agentId-timestamp.json)
```

## Critical Path 2: Trace File → Dashboard API → Browser

```mermaid
sequenceDiagram
    participant FS as Filesystem
    participant Watcher as TraceWatcher
    participant Server as Express Server
    participant WS as WebSocket
    participant Browser as Browser Client

    Note over Watcher: chokidar watches directories

    FS->>Watcher: inotify: new file added
    Watcher->>Watcher: Detect format (JSON/JSONL/LOG)

    alt JSON trace file
        Watcher->>Watcher: loadTraceFile() → loadGraph()
        Watcher->>Watcher: Convert nodes to Map if Object
    else JSONL session file
        Watcher->>Watcher: loadSessionFile()
        Watcher->>Watcher: parseRichSessionLog()
        Watcher->>Watcher: Build session events + token usage
    else LOG file
        Watcher->>Watcher: loadLogFile()
        Watcher->>Watcher: parseUniversalLog()
        Watcher->>Watcher: Group activities → create aggregated nodes
    end

    Watcher->>Server: emit('trace-added', { filename, graph })
    Server->>WS: broadcast({ type: 'trace-added', data })
    WS->>Browser: WebSocket message

    Browser->>Server: GET /api/traces
    Server->>Server: serializeTrace() (Map → Object)
    Server-->>Browser: JSON response with all traces

    Browser->>Server: GET /api/agents/:agentId/timeline
    Server->>Server: Build Gantt intervals from nodes
    Server-->>Browser: Timeline data

    Browser->>Server: GET /api/agents/:agentId/process-graph
    Server->>Server: Aggregate transitions, durations, fail rates
    Server-->>Browser: Process mining graph
```

## Critical Path 3: Trace File → Storage Ingestion → Analytics Query

```mermaid
sequenceDiagram
    participant FS as Filesystem
    participant Ingester as Batch Ingester
    participant DB as SQLite
    participant Query as Query Builder
    participant CLI as Storage CLI

    Note over Ingester: Watches traces/ directory

    FS->>Ingester: New trace file detected
    Ingester->>Ingester: Queue file for processing

    loop Batch (50 files/sec)
        Ingester->>Ingester: Parse file (JSON/JSONL/LOG)
        Ingester->>Ingester: Normalize: ensure agentId, timestamp, trigger
        Ingester->>Ingester: Extract metrics: nodeCount, failureCount, duration
        Ingester->>DB: BEGIN TRANSACTION
        Ingester->>DB: INSERT INTO executions (UPSERT on filename)
        Ingester->>DB: UPDATE agents SET totalExecutions++, avgTime
        Ingester->>DB: UPDATE daily_stats SET counts, averages
        Ingester->>DB: COMMIT
    end

    CLI->>Query: getExecutions({ agentId, since, success })
    Query->>DB: SELECT ... WHERE agentId = ? AND timestamp > ?
    DB-->>Query: Result rows
    Query-->>CLI: Formatted execution records

    CLI->>DB: Analytics: trends, anomalies
    DB-->>CLI: Time-series data
```

## Error & Retry Flows

```mermaid
flowchart TD
    A[File detected] --> B{Parse succeeds?}
    B -->|Yes| C[Create ExecutionGraph]
    B -->|No| D[Log warning to stderr]
    D --> E[Skip file, continue watching]

    C --> F{loadGraph validates?}
    F -->|Yes| G[Process graph]
    F -->|No| H[Return null / false]
    H --> E

    G --> I{Persist succeeds?}
    I -->|Yes| J[Emit event / update DB]
    I -->|No| K[Log error to stderr]
    K --> E

    style D fill:#ff9
    style H fill:#ff9
    style K fill:#ff9
```

**Current weakness:** All error paths log to stderr and silently continue. No retry mechanism, no dead-letter queue, no alerting on persistent parse failures.
