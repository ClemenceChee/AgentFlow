## Why

Four usability bugs in the `/v2` dashboard that break core workflows: unreadable process map text, missing OpenClaw agents, no zoom on process map, and sidebar not updating when switching agents.

## What Changes

1. **Process map font contrast**: Node text in ProcessMapView and BottleneckView uses dark font on dark background. Change to light font (`var(--t1)`) or ensure contrast against node fill color.

2. **OpenClaw agents missing from agent cards**: The dashboard watches `~/.openclaw/workspace/traces` (added via settings) but OpenClaw agents don't appear in the agent cards. The `/api/agents` endpoint only returns agents from the watcher's trace data — if OpenClaw traces use a different format or agent ID scheme, they're not being parsed into the agents list.

3. **Process map zoom**: The SVG process maps (ProcessMapView, BottleneckView) render at a fixed viewBox size. When there are many nodes, they're too small to read. Need zoom/pan controls (scroll to zoom, drag to pan, or +/- buttons).

4. **Sidebar not updating on agent switch**: The ExecSidebar shows executions for `selectedAgent`, but when clicking a different agent card, the sidebar continues showing the previous agent's executions. The `agentId` prop isn't triggering a re-render, or the traces filter isn't working correctly.

## Capabilities

### New Capabilities
_None — all bug fixes to existing capabilities._

### Modified Capabilities
- `dashboard-process-map`: Fix font contrast, add zoom/pan
- `dashboard-dynamic-identity`: Fix OpenClaw agent discovery
- `dashboard-state-model`: Fix sidebar not updating on agent switch

## Impact

- **Modified files**: `ProcessMapView.tsx`, `BottleneckView.tsx` (font color + zoom), `ExecSidebar.tsx` or `App.tsx` (sidebar state bug), `server.ts` or `useAgents.ts` (OpenClaw agent discovery)
- **No new dependencies**
