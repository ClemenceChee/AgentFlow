## Why

The dashboard-overhaul scaffolded a React + Vite frontend but accumulated 30 component files (15 dead), 3 conflicting layout architectures, and broken state management through ad-hoc iteration. The detail panel doesn't update on agent switch. Agents from OpenClaw don't appear because the dashboard only watches manually-specified directories. Process mining visualizations (the core AgentFlow differentiator) are absent — the dashboard shows raw execution data but not the discovered processes, variants, or bottlenecks that AgentFlow's core can compute.

This rebuild cleans the slate: proper state model, process mining visualizations inspired by Celonis/Disco, auto-discovery of agent directories, and a clear component tree.

## What Changes

- **Clean slate**: Delete 15 dead component files from ad-hoc iterations. Establish a canonical component tree with clear ownership.
- **State model**: Two selections (agent, execution) with explicit transition rules. When agent changes, execution clears and auto-selects. No orphaned state.
- **Layout**: Top 1/3 = compact agent cards + service chips. Bottom 2/3 = detail workspace (agent-level OR execution-level, never blank).
- **Process mining views** (agent-level, new):
  - **Process Map**: Directed graph with nodes = steps, edges = transitions. Thickness = frequency, color = duration. Slider to filter low-frequency paths (Disco-style simplification).
  - **Variant Explorer**: Ranked execution paths. Happy path highlighted. Each variant as horizontal step sequence. Percentage breakdown.
  - **Bottleneck Heatmap**: Thermal overlay on process map. Red = slow steps. Toggle between frequency/duration.
  - **Dotted Chart**: All executions for this agent plotted on time axis. Spot patterns, batch behavior, degradation.
- **Execution views** (execution-level, improved):
  - **Flame Chart**: Nested time bars showing parent-child relationships + actual time positioning. Replaces flat timeline.
  - **Agent Flow**: Step-by-step sequence categorized (LLM Call, Tool, Read, Write, Web/Search). Shows what the agent did.
  - **Metrics**: Node counts, success rate, duration distribution (avg/p95/max/min), type breakdown with bars, LLM usage.
  - **Dependencies**: Parent-child tree with color-coded nodes.
  - **State Machine**: Pending → Running → Completed → Failed flow with counts and bars.
  - **Summary**: Text summary, confidence bar, recommendations, failure details.
  - **Transcript**: Session events if available.
- **Directory auto-discovery**: Scan systemd units for WorkingDirectory paths. Check common locations (`~/.alfred/`, `~/.openclaw/`, `~/.agentflow/`). Settings UI to add/remove watched directories. Dashboard suggests discovered directories.
- **Conformance view** (future-ready): Placeholder for guard violation overlay on process map, tying into `checkGuards()` from agentflow-core.

## Capabilities

### New Capabilities
- `dashboard-state-model`: Centralized 2-selection state (agent, execution) with explicit transition rules and URL sync
- `dashboard-process-map`: Directed-follows graph with frequency/duration encoding, path filtering slider
- `dashboard-variant-explorer`: Ranked execution variants with step sequences and percentage breakdown
- `dashboard-bottleneck-heatmap`: Thermal duration overlay on process map
- `dashboard-dotted-chart`: Temporal scatter plot of all executions for an agent
- `dashboard-flame-chart`: Nested time-bar execution profiling view (replaces flat timeline)
- `dashboard-agent-flow`: Categorized step-by-step execution sequence (LLM/Tool/Read/Write)
- `dashboard-directory-discovery`: Auto-discover agent data directories from systemd + common paths, settings UI

### Modified Capabilities
- `dashboard-service-metrics`: Keep service chips and infrastructure detection, fix to show all discovered services
- `dashboard-dynamic-identity`: Keep dynamic naming, ensure no hardcoded labels

## Impact

- **Deleted files**: ~15 dead components from earlier iterations
- **New files**: ~12 new components (process mining views, flame chart, settings)
- **Modified files**: `App.tsx` (new state model), `server.ts` (directory discovery API, process mining endpoints), `DetailPanel.tsx` (rewritten with proper tabs)
- **New API endpoints**: `/api/process-model/:agentId` (discovered process), `/api/variants/:agentId` (execution variants), `/api/directories` (discovered directories), `/api/settings` (watched dirs config)
- **Dependencies**: None new. Uses agentflow-core `discoverProcess`, `findVariants`, `getBottlenecks`, `checkConformance`.
- **Breaking changes**: None. `/v2` is rebuilt, old dashboard at `/` untouched.
