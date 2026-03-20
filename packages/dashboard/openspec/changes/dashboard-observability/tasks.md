## 1. Activity Heatmap

- [ ] 1.1 Add `/api/activity` endpoint — aggregate execution events by time bucket from knowledge store, return `{ buckets: [{ start, end, total, failures, topAgents }] }`
- [ ] 1.2 Create `src/client/hooks/useActivity.ts` — fetch heatmap data with configurable hours and bucket size
- [ ] 1.3 Create `src/client/components/ActivityHeatmap.tsx` — CSS grid cells with intensity mapped to count, red overlay for failures
- [ ] 1.4 Add hover tooltip showing time range, execution count, failure count, top agents
- [ ] 1.5 Add time range selector (1h / 6h / 24h / 7d)

## 2. Sessions & Cost Tracking

- [ ] 2.1 Add `/api/sessions` endpoint — aggregate recent execution events by graphId, extract SemanticContext (model, tokens, cost), build subagent trees
- [ ] 2.2 Create `src/client/hooks/useSessions.ts` — fetch sessions with WebSocket updates
- [ ] 2.3 Create `src/client/components/SessionsPanel.tsx` — table of active sessions with agent, model, tokens, cost, last activity, status
- [ ] 2.4 Create `src/client/components/SessionDetail.tsx` — drill-down into subagent tree with per-node metrics
- [ ] 2.5 Add aggregate header: total sessions, total tokens, total cost
- [ ] 2.6 Handle sessions without SemanticContext (show "N/A" for model/tokens/cost)

## 3. Scheduled Jobs

- [ ] 3.1 Add systemd timer discovery to server — scan `*.timer` units, query LastTriggerUSec, NextElapseUSec, Result, associated service
- [ ] 3.2 Add `/api/jobs` endpoint — return timer state with name, schedule, lastRun, lastResult, nextRun, lastDuration, recentDurations[]
- [ ] 3.3 Create `src/client/hooks/useJobs.ts` — fetch job data on interval
- [ ] 3.4 Create `src/client/components/ScheduledJobs.tsx` — job table with color-coded rows (green/red/amber/grey)
- [ ] 3.5 Add duration sparkline per job (last 10 runs, inline SVG or CSS)
- [ ] 3.6 Add overdue detection: amber row + "overdue" label when nextRun is in the past

## 4. Live Message Flow

- [ ] 4.1 Extend WebSocket to emit execution events in real-time (agent→tool calls, completions, failures)
- [ ] 4.2 Create `src/client/components/LiveFlow.tsx` — React Flow canvas reusing existing setup
- [ ] 4.3 Create custom animated edge component that pulses when an event flows through
- [ ] 4.4 Build flow graph from execution events: agents as nodes, tools as nodes, parent-child as edges
- [ ] 4.5 Add new nodes dynamically when previously unseen agents/tools appear
- [ ] 4.6 Add flow rate labels on edges when activity exceeds threshold (events/min)

## 5. Real-Time Log Streaming

- [ ] 5.1 Add log file discovery to server — find log paths from systemd units and common locations
- [ ] 5.2 Add file tailing to server — watch discovered log files for new lines, parse severity
- [ ] 5.3 Add `logs` channel to WebSocket — stream log lines with source, severity, timestamp, message
- [ ] 5.4 Create `src/client/hooks/useLogs.ts` — subscribe to logs channel, maintain bounded buffer (last 1000 lines)
- [ ] 5.5 Create `src/client/components/LogViewer.tsx` — virtual-scrolling log list with color-coded severity
- [ ] 5.6 Add agent multi-select filter and severity dropdown filter
- [ ] 5.7 Implement auto-scroll with pause-on-hover and resume button
