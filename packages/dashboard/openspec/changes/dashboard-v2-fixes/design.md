## Context

Four bugs identified after testing the v2 dashboard rebuild.

## Findings from investigation

**Bug 1 — Process map font**: ProcessMapView.tsx uses `fill="var(--t1)"` for node text, which should be light. The issue is likely the SVG `<text>` not inheriting CSS custom properties properly, or the node background color being too similar. Need to use explicit light color `#e6edf3`.

**Bug 2 — OpenClaw agents missing**: The `/home/trader/.openclaw/workspace/traces/` directory contains 905 files, but they're ALL named `alfred-*` — these are Alfred traces stored in the OpenClaw workspace, not OpenClaw-specific agents. There are no actual OpenClaw agent traces (the `runs.json` has 0 runs). So this isn't a dashboard bug — OpenClaw just doesn't have its own trace data yet. However, the watcher is initialized from CLI args only and doesn't read `~/.agentflow/dashboard-config.json` at startup, so even if OpenClaw traces appeared later, they wouldn't be watched until the server is restarted.

**Bug 3 — Process map zoom**: The SVG viewBox is fixed. Need to add scroll-to-zoom and drag-to-pan, implemented as transform on a `<g>` wrapper inside the SVG.

**Bug 4 — Sidebar not updating**: The ExecSidebar receives `agentId` as a prop from App.tsx. The `useMemo` in ExecSidebar filters traces by `agentId`. If the filtering works correctly, the issue is likely that `useSelectedTrace.clearSelection()` isn't being called, so the old execution stays highlighted even though the list should have changed. Need to verify the prop flow and add a key to force re-render.

## Decisions

### Fix 1: SVG text color
Use hardcoded `#e6edf3` instead of CSS variables in SVG `<text>` elements. CSS custom properties work in inline SVG but can be unreliable across browsers. Hardcoding the resolved value is safer.

### Fix 2: Watcher reads config on startup
On server start, read `~/.agentflow/dashboard-config.json` and merge `extraDirs` into `config.dataDirs` before creating the TraceWatcher. This ensures added directories are watched on restart.

### Fix 3: SVG zoom/pan
Add a `useZoomPan` hook that tracks `scale` and `translate` state. On wheel → adjust scale. On mousedown+mousemove → adjust translate. Apply as `transform` on a `<g>` wrapper. Add +/- buttons and a reset button.

### Fix 4: ExecSidebar key
Add `key={selectedAgent}` to the ExecSidebar component in App.tsx. This forces React to unmount and remount when the agent changes, clearing any stale internal state.
