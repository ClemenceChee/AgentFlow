## Why

The dashboard has operational blind spots that make it harder to act on failures: agent labels are hardcoded instead of pulled from process metadata, critical FAIL states are buried in small badges instead of being prominent, the Process Map tab is empty, orphan warnings lack actionable options, and worker cards don't show the same health metrics as service rows. Operators need to glance and act — the current layout requires too much digging.

Beyond these immediate issues, the dashboard is built as a 3,100-line vanilla JS god file with inline CSS — a stack that won't scale to the full AgentFlow + Soma vision (knowledge engine insights, Soma entity browser, policy editor, cross-domain visualization). This overhaul rebuilds the frontend as a React + TypeScript app using Vite, while keeping the Express backend unchanged.

## What Changes

- **React + TypeScript + Vite frontend**: Replace `public/dashboard.js` and `public/index.html` with a proper React app in `src/client/`. The Express server continues serving the API and WebSocket — Vite builds to static files served from the same server.
- **Dynamic agent identity**: All agent/service/worker labels pulled from process metadata or service registry. No hardcoded names. Unnamed agents fall back to `unnamed (PID: <pid>)`.
- **Alert hierarchy**: FAIL states and critical issues rendered as persistent alert banners at the top. Orphan warnings elevated to dismissable alert cards with action buttons.
- **Unified service metrics**: Every service row and worker card shows name, PID, CPU, memory, uptime with consistent color thresholds. Visible legend explaining green/amber/red.
- **Process topology**: The Process Map tab renders a dependency/topology visualization using React Flow.
- **Trace sidebar improvements**: Traces linked to named agents, grouped under collapsible headers by agent/type, FAIL traces visually differentiated.
- **Summary bar additions**: Add current failure count, orphan process count, and average agent uptime alongside existing metrics.
- **Accessibility**: Pair every color indicator with an icon or text label. Ensure sufficient contrast.

## Capabilities

### New Capabilities
- `dashboard-react-scaffold`: Vite + React + TypeScript project scaffold, dev proxy to Express, production build to static files, migration path from old dashboard
- `dashboard-alerts`: Persistent alert banners for FAIL states and dismissable orphan/issue cards with action buttons
- `dashboard-dynamic-identity`: Dynamic agent/worker naming from process metadata with PID fallback
- `dashboard-service-metrics`: Unified health metrics (CPU, mem, uptime) on all service rows and worker cards with color legend
- `dashboard-process-topology`: Process Map tab visualization showing service relationships and dependencies
- `dashboard-trace-groups`: Collapsible trace grouping by agent/type with named agent links and prominent FAIL styling

### Modified Capabilities
- `dashboard-mining-ui`: Add failure count, orphan count, and average uptime to the summary bar

## Impact

- **New files**: `src/client/` directory with React components, hooks, and entry point. `vite.config.ts` for build configuration.
- **Modified files**: `packages/dashboard/src/server.ts` (serve Vite build output, API enrichments), `packages/dashboard/package.json` (add react, react-dom, vite, @types)
- **Preserved files**: `public/dashboard.js` and `public/index.html` kept as legacy fallback at `/v1` during migration
- **New dependencies**: `react`, `react-dom`, `vite`, `@vitejs/plugin-react`, `@types/react`, `@types/react-dom`. Optional: `@xyflow/react` (React Flow) for topology.
- **Breaking changes**: None. New dashboard served alongside old. Cut over when ready.
- **API changes**: `/api/process-health` response enriched with per-service OS metrics and topology edges. All existing fields preserved.
