## 1. Clean Slate

- [x] 1.1 Delete dead component files: AgentDetail, AgentView, ExecutionDetail, MasterList, Overview, OverviewCards, OverviewPage, TraceSidebar, TraceGroup, TraceEntry, ServiceNode, WorkerNode, ProcessHealth, ServiceCard, WorkerCard, StatusLegend
- [x] 1.2 Delete unused hooks: useWebSocket (not used by current architecture)
- [x] 1.3 Verify remaining files: App.tsx, main.tsx, mock-data.ts, 4 hooks, 6 components (clean base)

## 2. State Model

- [x] 2.1 Create `src/client/state.ts` with types: `DashboardState = { selectedAgent, selectedExecution }` and transition rules as pure functions
- [x] 2.2 Rewrite App.tsx with centralized state: `selectedAgent` + `selectedExecution`, auto-select on load (first failed agent → first failed execution)
- [x] 2.3 When `selectedAgent` changes: clear `selectedExecution`, auto-select first failed execution for new agent
- [x] 2.4 Workspace shows AgentProfile when `selectedExecution` is null, ExecutionDetail when set

## 3. Layout & Shell

- [x] 3.1 Rewrite App layout: HealthBanner → AlertBanner → TopSection (max 33vh) → Workspace (flex:1) → SummaryBar
- [x] 3.2 TopSection: ServiceRow (compact chips) + AgentCards (horizontal flow, compact)
- [x] 3.3 Workspace split: ExecSidebar (240px left) + WorkspaceMain (fills right)
- [x] 3.4 ExecSidebar: scrollable list of executions for selectedAgent, failed first, with timestamp/nodes/duration/bar
- [x] 3.5 Rewrite HealthBanner: 40px stat cells (services, agents, executions, success%, failures)
- [x] 3.6 Rewrite AlertBanner: failure/orphan/stale alerts with dismiss and action commands
- [x] 3.7 Rewrite SummaryBar: compact bottom bar with key metrics
- [x] 3.8 Settings gear icon in HealthBanner → opens directory settings panel

## 4. Agent Cards (TopSection)

- [x] 4.1 Compact agent card: status dot, name, exec count, success%, avg time, last activity, sparkline — max 200px wide
- [x] 4.2 Service chips row: compact pills with status dot, name, PID, systemd state — one row, wrapping
- [x] 4.3 Infrastructure chips: non-service processes (milvus, etc.) as compact pills
- [x] 4.4 Highlight selected agent card with border

## 5. API: Process Mining Endpoints

- [x] 5.1 Add `GET /api/process-model/:agentId` — load agent's traces, call `discoverProcess`, `findVariants`, `getBottlenecks`, return `{ model, variants, bottlenecks }`
- [ ] 5.2 Cache results server-side with 60s TTL, invalidate on new trace
- [ ] 5.3 Add `GET /api/conformance/:agentId/:filename` — load trace + model, call `checkConformance`, return report

## 6. API: Directory Discovery

- [x] 6.1 Implement directory discovery: scan systemd user services for ExecStart paths, check common locations (~/.alfred, ~/.openclaw, ~/.agentflow)
- [x] 6.2 Add `GET /api/directories` returning `{ watched, discovered, suggested }`
- [x] 6.3 Add `POST /api/directories` to add/remove watched dirs, persist to `~/.agentflow/dashboard-config.json`
- [ ] 6.4 Restart watcher when directories change

## 7. AgentProfile Views (no execution selected)

- [x] 7.1 Create `src/client/components/AgentProfile.tsx` — container with tabs: Process Map | Variants | Bottlenecks
- [x] 7.2 Create `src/client/hooks/useProcessModel.ts` — fetch `/api/process-model/:agentId`
- [x] 7.3 Create `src/client/components/ProcessMapView.tsx` — SVG directed graph: nodes = steps, edges = transitions, thickness = frequency, color = duration, frequency filter slider
- [x] 7.4 Create `src/client/components/VariantExplorer.tsx` — ranked list of variants as horizontal step sequences, happy path labeled, percentage bars
- [x] 7.5 Create `src/client/components/BottleneckView.tsx` — process map with thermal duration overlay (blue → red), glow on hot nodes, heat legend, bottleneck ranking
- [x] 7.6 Create `src/client/components/DottedChart.tsx` — SVG scatter plot: X = time, Y = execution index, dot color = node type

## 8. ExecutionDetail Views (execution selected)

- [x] 8.1 Create `src/client/components/ExecutionDetail.tsx` — container with tabs: Flame Chart | Agent Flow | Metrics | Dependencies | Summary
- [x] 8.2 Create `src/client/components/FlameChart.tsx` — nested time bars: rows = depth levels, bars positioned by actual time, width = duration, colors by node type, failed nodes red. Failure callout above. Hover tooltips with details.
- [x] 8.3 Create `src/client/components/AgentFlow.tsx` — categorized step sequence: icon, category, name, duration, timestamp. Indented by depth. Connecting lines. Failed steps highlighted.
- [x] 8.4 Create `src/client/components/MetricsView.tsx` — node counts, success rate, duration distribution (avg/p95/max/min), node type breakdown with bars, LLM usage
- [x] 8.5 Create `src/client/components/DependencyTree.tsx` — parent-child tree with color-coded nodes, error messages inline
- [x] 8.6 Create `src/client/components/StateMachine.tsx` — Pending → Running → Completed → Failed flow with counts and proportional bars
- [x] 8.7 Create `src/client/components/SummaryView.tsx` — confidence bar, agent/tool lists, failure details, recommendations (inline in ExecutionDetail)
- [x] 8.8 Create `src/client/components/TranscriptView.tsx` — session events as message rows, categorized by role

## 9. Directory Settings UI

- [x] 9.1 Create `src/client/components/SettingsPanel.tsx` — modal/slide-over showing watched/suggested directories with toggles
- [x] 9.2 Fetch directories from `GET /api/directories`
- [x] 9.3 Add/remove via `POST /api/directories`
- [x] 9.4 Show suggested directories with "Add" button

## 10. CSS & Polish

- [x] 10.1 Rewrite `dashboard.css` with final layout (no leftover styles from dead components)
- [x] 10.2 Process map SVG styles (nodes, edges, frequency slider)
- [x] 10.3 Flame chart styles (nested bars, hover tooltips, failure callout)
- [x] 10.4 Agent flow styles (step sequence, connecting lines, category colors)
- [x] 10.5 Dotted chart styles
- [ ] 10.6 Verify: no blank workspace states, all tabs render content, all transitions work
