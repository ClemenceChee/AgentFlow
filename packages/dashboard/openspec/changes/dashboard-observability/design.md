## Context

This change builds on `dashboard-overhaul` which provides the React + TypeScript + Vite scaffold, data-fetching hooks, and design system. All new views are React components added to the existing tab structure.

The data sources are: AgentFlow execution events (via knowledge store + event emitter), process audit data (via `/api/process-health`), and systemd timer/cron state (new discovery). Session/model/token data comes from `ExecutionEvent.semantic` (SemanticContext) which already contains model, token, and cost fields when available.

## Goals / Non-Goals

**Goals:**
- Live operational visibility: see what agents are doing right now
- Cost awareness: token usage and USD cost per session and aggregate
- Scheduled job monitoring: cron/timer health at a glance
- Log streaming: replace SSH + tail for operational debugging
- All views use the design system from dashboard-overhaul

**Non-Goals:**
- Historical analytics (Tier 3 / Soma scope — archetype discovery, trend analysis)
- Log aggregation or storage (just streaming live output)
- Job scheduling or management (read-only view of existing schedulers)
- Alert configuration UI (alerts are derived from data, not user-configured)

## Decisions

### 1. Live flow as an animated directed graph

Use React Flow (already added in dashboard-overhaul) with animated edges. Nodes represent agents/tools/channels. When a WebSocket event arrives, the corresponding edge briefly animates (pulse + color). This reuses existing infrastructure rather than building a custom canvas renderer.

The flow layout is derived from the trace graph: each execution graph's parent-child relationships become edges. New events light up the relevant path.

### 2. Activity heatmap as CSS grid

A simple CSS grid where each cell represents a time bucket (15-minute or 1-hour intervals). Cell color intensity maps to execution count. A red overlay indicates failure density. No charting library needed — CSS `background-color` with opacity based on count/max.

Data source: aggregate execution events by timestamp bucket from the knowledge store via a new `/api/activity?hours=24&bucket=15m` endpoint.

### 3. Sessions from ExecutionEvent.semantic

The `SemanticContext` on `ExecutionEvent` already has optional `model`, `tokenCount`, and `cost` fields. The server aggregates active/recent sessions by scanning recent events, grouping by `graphId`, and extracting semantic context.

The session panel shows: agent name, model (e.g., "claude-sonnet-4-20250514"), total tokens, estimated cost, last activity timestamp, and status. Clicking a session drills down to the execution graph tree showing subagent hierarchy.

### 4. Scheduled jobs from systemd timers

Extend `discoverAllProcessConfigs` to also scan systemd timer units (`*.timer`). For each timer, query: `LastTriggerUSec`, `NextElapseUSec`, `Result`, associated service unit. Return as a `timers[]` array alongside `services[]` in the process health response.

### 5. Log streaming via WebSocket channel

Add a `logs` channel to the existing WebSocket connection. The server tails log files (discovered via systemd unit `LogPath` or standard locations like `/var/log/`, `~/.alfred/logs/`). Each log line is sent as a WebSocket message with fields: `source`, `severity`, `timestamp`, `message`.

The frontend renders logs in a virtual-scrolling list with auto-scroll. Pause on hover, resume on click. Filter by agent name and severity level.

## Risks / Trade-offs

**[Log file discovery is fragile]** → Different services log to different locations. Mitigation: discover from systemd `LogPath`, fall back to common patterns. Users can configure paths.

**[Token/cost data is optional]** → Not all execution events have SemanticContext. Mitigation: show "N/A" for sessions without model data. Don't hide the panel — show what's available.

**[Heatmap aggregation cost]** → Scanning all events for 24h of history on each request. Mitigation: cache the aggregation server-side with 60s TTL. The knowledge store's date-partitioned layout makes this efficient.
