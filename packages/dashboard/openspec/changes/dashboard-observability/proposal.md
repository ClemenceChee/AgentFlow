## Why

The dashboard-overhaul gives us a React scaffold and fixes the broken fundamentals (identity, alerts, metrics, topology, traces). But an agent OS operator surface needs real-time observability — seeing what agents are doing right now, how much they cost, and what's scheduled next. Without this, operators still need to SSH in and tail logs to understand system behavior.

This change adds the live operational views that make the dashboard the single pane of glass for AgentFlow + Soma.

## What Changes

- **Live message flow**: Animated visualization showing messages/events flowing between systems, channels, tools, and agents in real-time via WebSocket. Think: a live sequence diagram that updates as events arrive.
- **Activity heatmap**: Time-bucketed heatmap showing execution volume and failure density over the last N hours. Reveals patterns (peak hours, recurring failures) at a glance.
- **Session management**: Active agent sessions panel showing agent name, model, token count, last activity, cost estimate, and drill-down into subagent trees.
- **Model & cost tracking**: Per-session and aggregate model info, token usage, and USD cost from LLM API calls (when available from execution events with semantic context).
- **Scheduled jobs**: Recurring cron/timer job panel showing job name, schedule, last status, next run, duration history — color-coded by health.
- **Real-time log streaming**: Color-coded log viewer with streaming from WebSocket, filterable by agent/severity, auto-scroll with pause-on-hover.

## Capabilities

### New Capabilities
- `dashboard-live-flow`: Real-time animated message/event flow visualization between agents, tools, and channels
- `dashboard-activity-heatmap`: Time-bucketed execution heatmap showing volume and failure density
- `dashboard-sessions`: Active session panel with agent, model, tokens, cost, subagent drill-down
- `dashboard-scheduled-jobs`: Cron/timer job panel with status, next run, duration, color-coding
- `dashboard-log-stream`: Real-time color-coded log viewer with agent/severity filtering

### Modified Capabilities
_None — all new tabs/panels added to the React dashboard from dashboard-overhaul._

## Impact

- **New files**: 5 new component trees under `src/client/components/`, new API endpoints in `server.ts`
- **API additions**: `/api/sessions` (active sessions with model/token data), `/api/jobs` (cron/timer status), `/api/logs` (streaming endpoint or WebSocket channel), `/api/activity` (heatmap aggregation)
- **Dependencies**: Possibly a lightweight charting lib for the heatmap (Recharts or visx, both React-native). Could also use CSS grid with colored cells for zero-dep approach.
- **Prerequisites**: Requires `dashboard-overhaul` to be complete (React scaffold, hooks, design system).
- **Breaking changes**: None. All additive.
