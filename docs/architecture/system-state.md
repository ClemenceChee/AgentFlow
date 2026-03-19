# System State Diagrams

## ExecutionNode State Machine

```mermaid
stateDiagram-v2
    [*] --> running: startNode()

    running --> completed: endNode()
    running --> failed: failNode(error)
    running --> hung: Guard detects<br/>no activity > timeout
    running --> timeout: Guard detects<br/>exceeds maxDuration

    completed --> [*]
    failed --> [*]
    hung --> [*]
    timeout --> [*]

    note right of running
        Node is actively executing.
        Has startTime, no endTime.
        Children may be spawned.
    end note

    note right of hung
        Detected by getHungNodes():
        status === 'running' AND
        no endTime set.
        Requires external intervention.
    end note
```

## ExecutionGraph Status Derivation

```mermaid
stateDiagram-v2
    [*] --> running: build() with any node still running

    running --> completed: All nodes completed or failed<br/>AND no failures
    running --> failed: Any node has status 'failed'

    [*] --> completed: build() with all nodes done, no failures
    [*] --> failed: build() with any node failed

    completed --> [*]
    failed --> [*]

    note right of running
        Graph status is derived,
        not explicitly set.
        Aggregated from node statuses.
    end note
```

## Watch System State Machine

```mermaid
stateDiagram-v2
    [*] --> idle: startWatch()

    idle --> scanning: Scan interval fires
    scanning --> evaluating: Files loaded,<br/>agent records built
    evaluating --> alerting: Condition triggered<br/>(error, hung, missing)
    evaluating --> idle: No conditions triggered

    alerting --> cooldown: Alert sent
    cooldown --> idle: Cooldown period expires

    state evaluating {
        [*] --> checkStatus: For each agent
        checkStatus --> statusError: status === 'error'
        checkStatus --> statusHung: status === 'hung'
        checkStatus --> statusMissing: No update within threshold
        checkStatus --> statusOk: status === 'ok'
        statusError --> [*]
        statusHung --> [*]
        statusMissing --> [*]
        statusOk --> [*]
    }
```

## Dashboard Watcher File States

```mermaid
stateDiagram-v2
    [*] --> discovered: chokidar 'add' event

    discovered --> loading: loadTraceFile / loadSessionFile / loadLogFile
    loading --> loaded: Parse successful
    loading --> skipped: Parse failed or unsupported format

    loaded --> updating: chokidar 'change' event
    updating --> loaded: Re-parse successful
    updating --> error: Re-parse failed

    loaded --> removed: chokidar 'unlink' event
    skipped --> [*]
    removed --> [*]
    error --> loaded: Next change event succeeds

    note right of loaded
        Trace is in memory,
        served via API,
        pushed via WebSocket.
    end note
```

## Storage Ingestion Pipeline States

```mermaid
stateDiagram-v2
    [*] --> queued: File detected by watcher

    queued --> processing: Dequeued in batch (50/sec)
    processing --> parsed: Format recognized, data extracted
    processing --> rejected: Unknown format or corrupt

    parsed --> persisted: SQLite transaction committed
    parsed --> duplicate: UNIQUE(filename) conflict → replaced

    persisted --> [*]
    duplicate --> [*]
    rejected --> [*]

    note right of processing
        Supports JSON, JSONL, LOG, TRACE.
        Multi-format auto-detection.
    end note
```
