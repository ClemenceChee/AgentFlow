---
sidebar_position: 5
title: Storage
---

# Storage

`agentflow-storage` persists execution traces to a SQLite database and exposes a rich querying and analytics API. Use it when you need historical queries, trend analysis, anomaly detection, or data export beyond what the dashboard's file-based view provides.

## Installation

```bash
npm install agentflow-storage
```

Requirements: Node.js 18+. SQLite is bundled via `better-sqlite3`.

---

## CLI Quick Start

```bash
# Start ingesting trace files into SQLite
agentflow-query ingest --traces ./traces

# Query recent executions
agentflow-query query --limit 50

# Agent statistics for the last 7 days
agentflow-query stats --agent my-agent --days 7

# Health score for an agent
agentflow-query analyze --type health --agent my-agent
```

---

## CLI Reference

### Query

```bash
# All recent executions
agentflow-query query --limit 50

# Filter by agent
agentflow-query query --agent my-agent --days 7

# Failed executions only
agentflow-query query --success false --limit 20

# Filter by trigger type
agentflow-query query --trigger cron_job

# Date range
agentflow-query query --since "2024-01-01" --until "2024-01-31"
```

### Statistics

```bash
# Global stats
agentflow-query stats

# Per-agent stats
agentflow-query stats --agent my-agent --days 30
```

### Analytics

```bash
# Health score (0–100)
agentflow-query analyze --type health --agent my-agent

# Statistical anomaly detection
agentflow-query analyze --type anomalies --agent my-agent --days 30

# Trend direction (volume, duration, success rate)
agentflow-query analyze --type trends --agent my-agent

# Failure pattern distribution
agentflow-query analyze --type failures --days 30
```

### Export

```bash
# JSON export
agentflow-query export --format json --output all-data.json

# CSV export for a specific agent
agentflow-query export --format csv --agent my-agent --output agent-data.csv

# Recent data only
agentflow-query export --since "2024-01-01" --limit 5000
```

### Maintenance

```bash
# Remove data older than 30 days
agentflow-query cleanup --days 30

# Dry run (preview what would be deleted)
agentflow-query cleanup --days 7 --dry-run
```

---

## Programmatic API

### Initialize

```typescript
import { AgentFlowStorage } from 'agentflow-storage';

const storage = new AgentFlowStorage({
  dbPath: './agentflow.db',
  tracesDir: './traces',
  autoIngest: true,        // Watch for new files automatically
  retentionDays: 30,       // Auto-cleanup threshold
});
```

### Query executions

```typescript
const executions = storage.getExecutions({
  agentId: 'my-agent',
  since: Date.now() - 24 * 60 * 60 * 1000,  // Last 24 hours
  success: true,
  limit: 100,
  offset: 0,
});
```

### Agent summary

```typescript
const summary = storage.query().getAgentSummary('my-agent', 7);
// Returns: total/successful/failed executions, success rate, avg duration, recent activity
```

### System overview

```typescript
const overview = storage.query().getSystemOverview(30);
// Returns: global stats, top agents, daily trends, trigger statistics
```

### Advanced filtering

```typescript
const executions = storage.query().findExecutions({
  agentId: ['agent1', 'agent2'],
  trigger: 'api_request',
  minExecutionTime: 1000,
  maxExecutionTime: 5000,
  hasFailures: false,
  orderBy: 'executionTime',
  orderDirection: 'DESC',
  limit: 50,
});
```

### Aggregations

```typescript
// Daily aggregations for the last week
const dailyStats = storage.query().aggregate({
  groupBy: 'day',
  metrics: ['count', 'successRate', 'avgExecutionTime'],
  since: Date.now() - 7 * 24 * 60 * 60 * 1000,
});

// Compare agents over 24 hours
const agentComparison = storage.query().aggregate({
  groupBy: 'agentId',
  metrics: ['count', 'successRate'],
  since: Date.now() - 24 * 60 * 60 * 1000,
});
```

### Analytics

```typescript
const analytics = storage.getAnalytics();

// Health score 0–100 (based on success rate, consistency, performance)
const score = analytics.getHealthScore('my-agent', 7);

// Statistical anomaly detection
const anomalies = analytics.detectAnomalies('my-agent', 30);

// Trend direction for volume, duration, success rate
const trends = analytics.getTrends('my-agent', 30);

// Failure distribution by agent, trigger, time of day
const patterns = analytics.getFailurePatterns(30);
```

### Export and manual ingestion

```typescript
// Export to JSON or CSV
const csv = storage.export('csv', { agentId: 'my-agent' });

// Manually ingest a trace object
await storage.ingestTrace({
  agentId: 'my-agent',
  trigger: 'manual',
  name: 'Test execution',
  timestamp: Date.now(),
  nodes: new Map([...]),
  rootId: 'root',
});

// Clean up old data
const removed = storage.cleanup(30);
```

---

## Database Schema

AgentFlow Storage creates three tables:

```sql
CREATE TABLE executions (
  id              INTEGER PRIMARY KEY,
  agentId         TEXT    NOT NULL,
  trigger         TEXT    NOT NULL,
  name            TEXT    NOT NULL,
  timestamp       INTEGER NOT NULL,
  success         BOOLEAN NOT NULL,
  executionTime   REAL,
  nodeCount       INTEGER,
  failureCount    INTEGER,
  metadata        TEXT,   -- JSON blob
  traceData       TEXT,   -- Full trace JSON
  filename        TEXT,
  createdAt       INTEGER
);

CREATE TABLE agents (
  agentId              TEXT    PRIMARY KEY,
  firstSeen            INTEGER NOT NULL,
  lastSeen             INTEGER NOT NULL,
  totalExecutions      INTEGER,
  successfulExecutions INTEGER,
  failedExecutions     INTEGER,
  avgExecutionTime     REAL
);

CREATE TABLE daily_stats (
  date                 TEXT    NOT NULL,
  agentId              TEXT    NOT NULL,
  totalExecutions      INTEGER,
  successfulExecutions INTEGER,
  failedExecutions     INTEGER,
  avgExecutionTime     REAL,
  PRIMARY KEY(date, agentId)
);
```

---

## Performance Tips

For high-volume ingestion, tune the batch settings:

```typescript
const storage = new AgentFlowStorage({
  dbPath: './agentflow.db',
  batchSize: 100,         // Process files in batches
  processInterval: 5000,  // 5-second intervals between batches
});

// Compact the database file after bulk operations
storage.vacuum();
```

For large datasets, always filter on indexed fields (`agentId`, `timestamp`) and set a `limit` to avoid unbounded result sets. Use `.aggregate()` instead of fetching raw rows when you need counts or averages.
