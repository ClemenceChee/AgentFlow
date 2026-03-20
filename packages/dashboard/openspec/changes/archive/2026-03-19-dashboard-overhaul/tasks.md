## 1. React Scaffold

- [x] 1.1 Add `react`, `react-dom` to dependencies; `vite`, `@vitejs/plugin-react`, `@types/react`, `@types/react-dom` to devDependencies
- [x] 1.2 Create `vite.config.ts` with React plugin, dev proxy to Express (`/api/*`, WebSocket), build output to `dist/client/`
- [x] 1.3 Create `src/client/main.tsx` entry point and `src/client/App.tsx` shell with tab routing
- [x] 1.4 Create minimal `index.html` Vite entry (just a `<div id="root">`)
- [x] 1.5 Add `dev:client` and `build:client` scripts to package.json
- [x] 1.6 Update Express server to serve `dist/client/` at `/` and old `public/` at `/v1`
- [x] 1.7 Create `src/client/hooks/useProcessHealth.ts` — fetch `/api/process-health` on interval
- [x] 1.8 Create `src/client/hooks/useWebSocket.ts` — connect to WebSocket, return real-time updates
- [x] 1.9 Create `src/client/hooks/useTraces.ts` — fetch `/api/traces` and merge WebSocket updates
- [x] 1.10 Create design system: `src/client/styles/dashboard.css` with dark theme tokens (bg, surface, border, text colors), spacing scale (4/8/12/16/24px), typography (mono headers, system body), card/grid patterns, information density tuned for operator glance-and-act (Grafana-meets-Datadog density)
- [x] 1.11 Create `src/client/styles/status.css` with status color classes (ok/warn/critical/inactive), paired icon+text patterns, contrast-safe badge styles
- [x] 1.12 Create dev fixture: `src/client/mock-data.ts` with representative mock process health data — agents named "extraction-worker-1", "sweep-handler-alpha", "digest-compiler", one unnamed agent with PID fallback, mixed statuses (active/failed/inactive), workers, orphans, traces with failures

## 2. API Enrichments (server.ts)

- [x] 2.1 Attach matched OS process metrics (cpu, mem, elapsed) to each service in the `services[]` response
- [x] 2.2 Add `topology` field to `/api/process-health` with parent-child edges derived from process ppid relationships
- [x] 2.3 Ensure all existing API contracts are preserved (backward compatible)

## 3. Alert System

- [x] 3.1 Create `src/client/components/AlertBanner.tsx` — scans process health for failed services, stale PIDs, orphans
- [x] 3.2 Render alert cards with severity icon, service name, description, and action hints (copyable shell commands)
- [x] 3.3 Implement dismiss with sessionStorage tracking
- [x] 3.4 Order alerts by severity: failed > stale PID > orphans > warnings
- [x] 3.5 Hide alert area when no issues exist

## 4. Dynamic Identity

- [x] 4.1 Create `src/client/components/ServiceCard.tsx` — renders service name from `service.name`, PID fallback for unnamed
- [x] 4.2 Create `src/client/components/WorkerCard.tsx` — renders worker name from `worker.name`
- [x] 4.3 Ensure zero hardcoded agent/service names anywhere in client code

## 5. Unified Service Metrics

- [x] 5.1 Create `src/client/components/ProcessHealth.tsx` — grid of ServiceCard and WorkerCard components
- [x] 5.2 Display name, PID, CPU, memory, uptime on every ServiceCard
- [x] 5.3 Display CPU, memory on every WorkerCard matching ServiceCard format
- [x] 5.4 Implement color threshold logic: green (<70%), amber (70-90%), red (>90%) for CPU/memory
- [x] 5.5 Add status icon/text alongside every color indicator (checkmark, warning triangle, X)
- [x] 5.6 Create `src/client/components/StatusLegend.tsx` — collapsible legend explaining thresholds

## 6. Process Map Topology

- [x] 6.1 Add `@xyflow/react` to dependencies
- [x] 6.2 Create `src/client/components/ProcessMap.tsx` — React Flow canvas with service nodes
- [x] 6.3 Create `src/client/components/ServiceNode.tsx` — custom React Flow node (rounded rect, status color, name, metrics)
- [x] 6.4 Create `src/client/components/WorkerNode.tsx` — smaller custom node for workers connected to parent
- [x] 6.5 Layout services as top-level nodes with workers as sub-nodes, edges from topology data
- [x] 6.6 Add click handler to show detail panel with full service info
- [x] 6.7 Handle empty state ("No services discovered")

## 7. Trace Sidebar

- [x] 7.1 Create `src/client/components/TraceSidebar.tsx` — groups traces by agentId
- [x] 7.2 Create `src/client/components/TraceGroup.tsx` — collapsible header with agent name, trace count, failure count
- [x] 7.3 Create `src/client/components/TraceEntry.tsx` — individual trace with agent name prominent, graph ID secondary
- [x] 7.4 Style FAIL traces with bold red left border, bold text, and failure icon
- [x] 7.5 Sort failed traces to top within each agent group

## 8. Summary Bar

- [x] 8.1 Create `src/client/components/SummaryBar.tsx` — bottom bar with all metrics
- [x] 8.2 Include: total agents, total executions, success rate, active count (existing)
- [x] 8.3 Add: failure count, orphan process count, average agent uptime (new)
- [x] 8.4 Color-code new metrics (green for 0, red for >0)
- [x] 8.5 Add status icons alongside colors for accessibility
