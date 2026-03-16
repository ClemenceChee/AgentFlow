# AgentFlow Storage

Persistent storage and querying for AgentFlow - Store and analyze agent execution history with SQLite-powered performance and rich analytics.

## Features

- **SQLite-based Storage** - Fast, embedded database for agent execution history
- **Automatic Ingestion** - Watch trace directories and ingest files automatically
- **Rich Querying API** - Filter, sort, and analyze execution data
- **Advanced Analytics** - Health scores, anomaly detection, trend analysis
- **Performance Metrics** - Execution time analysis and optimization insights
- **Data Export** - Export to JSON/CSV for external analysis
- **CLI Tools** - Command-line interface for operations and queries

## Quick Start

```bash
# Install
npm install @agentflow/storage

# Start ingesting traces
agentflow-query ingest --traces ./traces

# Query recent executions
agentflow-query query --limit 50

# Show agent statistics
agentflow-query stats --agent my-agent --days 7

# Analyze agent health
agentflow-query analyze --type health --agent my-agent
```

## Installation

```bash
npm install @agentflow/storage
```

**Requirements:**
- Node.js 18+
- SQLite3 (included with better-sqlite3)

## Usage

### Programmatic API

```typescript
import { AgentFlowStorage } from '@agentflow/storage';

// Initialize storage
const storage = new AgentFlowStorage({
    dbPath: './agentflow.db',
    tracesDir: './traces',
    autoIngest: true
});

// Query executions
const executions = storage.getExecutions({
    agentId: 'my-agent',
    since: Date.now() - 24 * 60 * 60 * 1000, // Last 24 hours
    success: true,
    limit: 100
});

// Get agent summary
const summary = storage.query().getAgentSummary('my-agent', 7);

// Analyze performance
const analytics = storage.getAnalytics();
const healthScore = analytics.getHealthScore('my-agent');
const anomalies = analytics.detectAnomalies('my-agent');

// Export data
const csvData = storage.export('csv', { agentId: 'my-agent' });
```

### Command Line Interface

```bash
# Query executions
agentflow-query query [options]

# Start live ingestion
agentflow-query ingest --traces ./traces

# Show statistics
agentflow-query stats [options]

# Run analytics
agentflow-query analyze --type <type> [options]

# Export data
agentflow-query export --format csv --output data.csv

# Clean up old data
agentflow-query cleanup --days 30
```

## Configuration

### Storage Options

```typescript
const storage = new AgentFlowStorage({
    dbPath: './agentflow.db',           // SQLite database file
    tracesDir: './traces',              // Directory to watch for traces
    autoIngest: true,                   // Automatically ingest new files
    retentionDays: 30                   // Data retention period
});
```

### Database Schema

AgentFlow Storage creates these tables:

```sql
-- Execution records
CREATE TABLE executions (
    id INTEGER PRIMARY KEY,
    agentId TEXT NOT NULL,
    trigger TEXT NOT NULL,
    name TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    success BOOLEAN NOT NULL,
    executionTime REAL,
    nodeCount INTEGER,
    failureCount INTEGER,
    metadata TEXT,      -- JSON
    traceData TEXT,     -- Full trace JSON
    filename TEXT,
    createdAt INTEGER
);

-- Agent summaries
CREATE TABLE agents (
    agentId TEXT PRIMARY KEY,
    firstSeen INTEGER NOT NULL,
    lastSeen INTEGER NOT NULL,
    totalExecutions INTEGER,
    successfulExecutions INTEGER,
    failedExecutions INTEGER,
    avgExecutionTime REAL
);

-- Daily aggregations
CREATE TABLE daily_stats (
    date TEXT NOT NULL,
    agentId TEXT NOT NULL,
    totalExecutions INTEGER,
    successfulExecutions INTEGER,
    failedExecutions INTEGER,
    avgExecutionTime REAL,
    PRIMARY KEY(date, agentId)
);
```

## API Reference

### AgentFlowStorage

Main storage interface for managing agent execution data.

#### `new AgentFlowStorage(config)`

**Parameters:**
- `config.dbPath` (string): Path to SQLite database file
- `config.tracesDir` (string, optional): Directory to watch for trace files
- `config.autoIngest` (boolean, optional): Enable automatic file ingestion
- `config.retentionDays` (number, optional): Data retention period

#### `ingestTrace(trace)`

Manually ingest a trace object.

```typescript
await storage.ingestTrace({
    agentId: 'my-agent',
    trigger: 'manual',
    name: 'Test execution',
    timestamp: Date.now(),
    nodes: new Map([...]),
    rootId: 'root'
});
```

#### `getExecutions(filters)`

Query execution records with filters.

```typescript
const executions = storage.getExecutions({
    agentId: 'my-agent',        // Filter by agent
    trigger: 'cron',            // Filter by trigger type
    success: true,              // Filter by success status
    since: Date.now() - 86400000, // Since timestamp
    until: Date.now(),          // Until timestamp
    limit: 100,                 // Limit results
    offset: 0                   // Offset for pagination
});
```

#### `getAgents()`

Get all known agents with summary statistics.

```typescript
const agents = storage.getAgents();
// Returns array of agent objects with execution counts, success rates, etc.
```

#### `getDailyStats(agentId?, days?)`

Get daily aggregated statistics.

```typescript
// All agents, last 30 days
const globalStats = storage.getDailyStats();

// Specific agent, last 7 days
const agentStats = storage.getDailyStats('my-agent', 7);
```

#### `cleanup(retentionDays)`

Remove old execution records.

```typescript
const removed = storage.cleanup(30); // Remove data older than 30 days
```

#### `export(format, filters)`

Export data in JSON or CSV format.

```typescript
const jsonData = storage.export('json', { agentId: 'my-agent' });
const csvData = storage.export('csv', { since: Date.now() - 86400000 });
```

### QueryBuilder

Advanced querying interface with filters and aggregations.

#### `query().findExecutions(filters)`

Find executions with detailed filtering.

```typescript
const executions = storage.query().findExecutions({
    agentId: ['agent1', 'agent2'],      // Multiple agents
    trigger: 'api_request',             // Specific trigger
    minExecutionTime: 1000,             // Minimum execution time (ms)
    maxExecutionTime: 5000,             // Maximum execution time (ms)
    hasFailures: false,                 // Only successful executions
    orderBy: 'executionTime',           // Sort by execution time
    orderDirection: 'DESC',             // Descending order
    limit: 50
});
```

#### `query().aggregate(options)`

Aggregate data by time periods or dimensions.

```typescript
// Daily aggregations for the last week
const dailyStats = storage.query().aggregate({
    groupBy: 'day',
    metrics: ['count', 'successRate', 'avgExecutionTime'],
    since: Date.now() - 7 * 24 * 60 * 60 * 1000
});

// Agent performance comparison
const agentStats = storage.query().aggregate({
    groupBy: 'agentId',
    metrics: ['count', 'successRate'],
    since: Date.now() - 24 * 60 * 60 * 1000
});
```

#### `query().getAgentSummary(agentId, days)`

Get comprehensive agent summary.

```typescript
const summary = storage.query().getAgentSummary('my-agent', 7);
// Returns: total/successful/failed executions, success rate, avg time, recent activity
```

#### `query().getSystemOverview(days)`

Get system-wide overview and top agents.

```typescript
const overview = storage.query().getSystemOverview(30);
// Returns: global stats, top agents, daily trends, trigger statistics
```

### StorageAnalytics

Advanced analytics and insights.

#### `getAnalytics().getHealthScore(agentId?, days?)`

Calculate health score (0-100) based on success rate, consistency, and performance.

```typescript
const healthScore = storage.getAnalytics().getHealthScore('my-agent', 7);
// Returns: 0-100 score (higher is better)
```

#### `getAnalytics().detectAnomalies(agentId, days?)`

Detect execution anomalies using statistical analysis.

```typescript
const anomalies = storage.getAnalytics().detectAnomalies('my-agent', 30);
// Returns: array of anomalies with type, severity, and description
```

#### `getAnalytics().getTrends(agentId?, days?)`

Analyze execution trends and patterns.

```typescript
const trends = storage.getAnalytics().getTrends('my-agent', 30);
// Returns: trend direction and slope for volume, time, success rate
```

#### `getAnalytics().getFailurePatterns(days?)`

Analyze failure patterns across agents and triggers.

```typescript
const patterns = storage.getAnalytics().getFailurePatterns(30);
// Returns: failure distribution by agent, trigger, time of day
```

## Command Line Examples

### Query Operations

```bash
# Recent executions
agentflow-query query --limit 50

# Agent-specific executions
agentflow-query query --agent my-agent --days 7

# Failed executions only
agentflow-query query --success false --limit 20

# Executions by trigger type
agentflow-query query --trigger cron_job

# Date range query
agentflow-query query --since "2024-01-01" --until "2024-01-31"
```

### Statistics and Analytics

```bash
# Global system stats
agentflow-query stats

# Agent-specific stats
agentflow-query stats --agent my-agent --days 30

# Health analysis
agentflow-query analyze --type health --agent my-agent

# Anomaly detection
agentflow-query analyze --type anomalies --agent my-agent --days 30

# Trend analysis
agentflow-query analyze --type trends --agent my-agent

# Failure pattern analysis
agentflow-query analyze --type failures --days 30
```

### Data Export

```bash
# Export all data as JSON
agentflow-query export --format json --output all-data.json

# Export agent data as CSV
agentflow-query export --format csv --agent my-agent --output agent-data.csv

# Export recent data
agentflow-query export --since "2024-01-01" --limit 5000
```

### Maintenance

```bash
# Clean up data older than 30 days
agentflow-query cleanup --days 30

# Dry run cleanup (simulate only)
agentflow-query cleanup --days 7 --dry-run

# Start live ingestion
agentflow-query ingest --traces ./my-traces
```

## Integration Examples

### Docker Deployment

```dockerfile
FROM node:18-alpine

RUN npm install -g @agentflow/storage

WORKDIR /app
VOLUME ["/app/traces", "/app/data"]

CMD ["agentflow-query", "ingest", "--traces", "/app/traces", "--db", "/app/data/agentflow.db"]
```

### Docker Compose

```yaml
version: '3.8'
services:
  agentflow-storage:
    image: node:18-alpine
    command: >
      sh -c "npm install -g @agentflow/storage &&
             agentflow-query ingest --traces /traces --db /data/agentflow.db"
    volumes:
      - ./traces:/traces
      - ./data:/data
    restart: unless-stopped

  agentflow-dashboard:
    image: node:18-alpine
    command: >
      sh -c "npm install -g @agentflow/dashboard &&
             agentflow-dashboard --traces /traces --port 3000"
    ports:
      - "3000:3000"
    volumes:
      - ./traces:/traces
    depends_on:
      - agentflow-storage
```

### Kubernetes CronJob for Cleanup

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: agentflow-cleanup
spec:
  schedule: "0 2 * * *"  # Daily at 2 AM
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: cleanup
            image: node:18-alpine
            command:
            - sh
            - -c
            - "npm install -g @agentflow/storage && agentflow-query cleanup --days 30 --db /data/agentflow.db"
            volumeMounts:
            - name: data
              mountPath: /data
          restartPolicy: OnFailure
          volumes:
          - name: data
            persistentVolumeClaim:
              claimName: agentflow-data
```

### Systemd Service

```ini
# /etc/systemd/system/agentflow-storage.service
[Unit]
Description=AgentFlow Storage Ingestion
After=network.target

[Service]
Type=simple
User=agentflow
WorkingDirectory=/opt/agentflow
ExecStart=/usr/local/bin/agentflow-query ingest --traces /var/log/agentflow --db /var/lib/agentflow/storage.db
Restart=always
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

## Performance Optimization

### Database Tuning

```typescript
// Batch ingestion for high volume
const storage = new AgentFlowStorage({
    dbPath: './agentflow.db',
    batchSize: 100,           // Process files in batches
    processInterval: 5000     // 5 second intervals
});

// Manual optimization
storage.vacuum();  // Optimize database file
```

### Query Optimization

```typescript
// Use indexes effectively
const executions = storage.getExecutions({
    agentId: 'my-agent',     // Indexed field
    since: timestamp,        // Indexed field
    limit: 1000             // Prevent large result sets
});

// Aggregate for large datasets
const stats = storage.query().aggregate({
    groupBy: 'day',
    metrics: ['count'],
    since: timestamp
});
```

### Memory Management

```bash
# Increase Node.js memory for large datasets
NODE_OPTIONS="--max-old-space-size=4096" agentflow-query ingest

# Regular cleanup
agentflow-query cleanup --days 30
```

## Troubleshooting

### Database Issues

```bash
# Check database size
ls -lh agentflow.db

# Verify database integrity
sqlite3 agentflow.db "PRAGMA integrity_check;"

# Optimize database
agentflow-query cleanup --days 30
```

### Performance Issues

```bash
# Check ingestion stats
agentflow-query stats

# Monitor file processing
agentflow-query ingest --traces ./traces --verbose

# Analyze slow queries
agentflow-query analyze --type performance
```

### Data Validation

```bash
# Verify trace format
agentflow-query query --agent test-agent --limit 1

# Check for data gaps
agentflow-query analyze --type trends --agent my-agent

# Validate recent ingestion
agentflow-query stats --days 1
```

## Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for development guidelines.

## License

MIT - See [LICENSE](../../LICENSE) for details.