# Module Dependency Graph

## Package-Level Dependencies

```mermaid
graph TD
    Core["agentflow-core<br/>(zero deps)"]
    Dashboard["agentflow-dashboard<br/>(express, ws, chokidar)"]
    Storage["agentflow-storage<br/>(better-sqlite3, chokidar)"]
    OTel["agentflow-otel<br/>(@opentelemetry/*)"]

    Dashboard -->|imports| Core
    OTel -->|imports| Core
    Storage -.->|indirect: loadGraph pattern| Core

    style Core fill:#90EE90
    style Dashboard fill:#87CEEB
    style Storage fill:#DDA0DD
    style OTel fill:#FFD700
```

## Core Module Dependencies (Internal)

```mermaid
graph TD
    types["types.ts<br/>(305 lines)"]
    gb["graph-builder.ts<br/>(334 lines)"]
    gq["graph-query.ts<br/>(269 lines)"]
    gs["graph-stitch.ts<br/>(78 lines)"]
    guards["guards.ts<br/>(274 lines)"]
    viz["visualize.ts<br/>(220 lines)"]
    loader["loader.ts<br/>(118 lines)"]
    ts["trace-store.ts<br/>(176 lines)"]
    runner["runner.ts<br/>(278 lines)"]
    live["live.ts<br/>(1259 lines) ⚠"]
    pa["process-audit.ts<br/>(521 lines)"]
    wt["watch-types.ts<br/>(60 lines)"]
    ws["watch-state.ts<br/>(305 lines)"]
    wa["watch-alerts.ts<br/>(148 lines)"]
    watch["watch.ts<br/>(299 lines)"]
    cli["cli.ts<br/>(379 lines)"]
    tc["trace-cli.ts<br/>(260 lines)"]
    idx["index.ts<br/>(83 lines)"]

    %% type imports
    gb --> types
    gq --> types
    gs --> types
    guards --> gq
    guards --> types
    viz --> gq
    viz --> types
    loader --> types
    ts --> loader
    ts --> types
    runner --> gb
    runner --> loader
    runner --> types

    %% live.ts (god file) imports
    live --> gq
    live --> gs
    live --> loader
    live --> pa
    live --> types

    %% watch system
    ws --> live
    ws --> wt
    wa --> wt
    watch --> live
    watch --> ws
    watch --> wa
    watch --> wt

    %% CLI
    cli --> runner
    cli --> tc
    cli --> watch
    cli --> live
    tc --> ts
    tc --> viz

    %% barrel
    idx --> gb
    idx --> gq
    idx --> gs
    idx --> guards
    idx --> viz
    idx --> loader
    idx --> ts
    idx --> runner
    idx --> watch
    idx --> live
    idx --> pa
    idx --> tc

    style live fill:#FF6B6B
    style pa fill:#FFD93D
    style types fill:#90EE90
```

## Dashboard Module Dependencies

```mermaid
graph TD
    server["server.ts<br/>(551 lines)"]
    watcher["watcher.ts<br/>(1553 lines) ⚠"]
    stats["stats.ts<br/>(265 lines)"]
    dcli["cli.ts<br/>(158 lines)"]
    didx["index.ts<br/>(19 lines)"]

    server --> watcher
    server --> stats
    server -->|"loadGraph, getStats,<br/>getFailures, getHungNodes"| Core["agentflow-core"]
    watcher -->|"loadGraph"| Core
    stats -->|"getStats"| Core
    dcli --> server
    dcli --> watcher
    didx --> server
    didx --> watcher

    style watcher fill:#FF6B6B
```

## Storage Module Dependencies

```mermaid
graph TD
    storage["storage.ts<br/>(399 lines)"]
    ingester["ingester.ts<br/>(683 lines)"]
    query["query.ts<br/>(420 lines)"]
    analytics["analytics.ts<br/>(397 lines)"]
    scli["cli.ts<br/>(372 lines)"]
    sidx["index.ts<br/>(21 lines)"]

    ingester --> storage
    query --> storage
    analytics --> storage
    scli --> storage
    scli --> ingester
    scli --> query
    scli --> analytics
    sidx --> storage
    sidx --> ingester

    style ingester fill:#FFD93D
```

## Circular Dependencies

**None detected.** The dependency graph is a clean DAG (directed acyclic graph) with `types.ts` as the leaf and CLI entry points as roots.

## Dependency Hotspots

| Module | Depended on by | Risk |
|--------|---------------|------|
| `types.ts` | 14 modules | Low (stable, interface-only) |
| `graph-query.ts` | 5 modules | Low (pure functions) |
| `live.ts` | 4 modules | **High** (god file, mutation-heavy) |
| `loader.ts` | 5 modules | Medium (no validation) |
| `watcher.ts` | 3 modules | **High** (god file) |
