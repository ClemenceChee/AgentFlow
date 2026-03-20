## Context

The AgentFlow dashboard is currently a vanilla JS + CSS single-page app (~3,100 lines JS, ~1,400 lines HTML/CSS) served by an Express backend with REST + WebSocket. The dashboard will evolve into the primary operator surface for both AgentFlow (execution intelligence) and Soma (organizational intelligence), requiring: knowledge engine insights, entity browsers, policy editors, and cross-domain visualization.

The current stack cannot support this growth. This overhaul migrates the frontend to React + TypeScript + Vite while preserving the Express backend exactly as-is.

## Goals / Non-Goals

**Goals:**
- Scaffold a React + TypeScript + Vite frontend within the existing dashboard package
- Implement all 7 dashboard improvements (alerts, identity, metrics, topology, traces, summary, accessibility)
- Keep the Express backend unchanged — Vite builds to static files served by Express in production
- Preserve the old dashboard at `/v1` as a fallback during migration
- Establish a component architecture that scales to Soma views

**Non-Goals:**
- Rewriting the Express backend or API contracts
- Implementing Soma-specific views (future change)
- Adding SSR or Next.js (unnecessary for an operator dashboard)
- Mobile-first design (desktop operator tool)

## Decisions

### 1. Vite + React + TypeScript (not Preact, not vanilla modules)

The dashboard will grow to 30-50 components across AgentFlow + Soma. React provides: component model with hooks for state management, the largest library ecosystem (React Flow for topology, Recharts for metrics), TypeScript support matching the rest of the codebase, and the most hireable frontend stack.

Vite provides: instant dev server with HMR, production builds to static files, dev proxy to the Express API server — no architecture change to the backend.

**Alternative considered**: Preact + htm (no build step) — rejected because the component count and interactivity level will outgrow it within 2-3 months. Also loses TypeScript.

**Alternative considered**: Vanilla JS ES modules — rejected because manual DOM manipulation is what created the god file. No component model means the same problem recurs.

### 2. Colocated client within the dashboard package

```
packages/dashboard/
├── src/
│   ├── server.ts           # Express backend (unchanged)
│   ├── client/             # NEW: React app
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   ├── components/     # UI components
│   │   ├── hooks/          # Data fetching + WebSocket
│   │   └── styles/         # CSS modules or plain CSS
│   └── ...
├── public/                 # OLD: legacy dashboard (kept as /v1)
├── vite.config.ts          # Vite config with proxy
└── package.json
```

The React app is built by Vite into `dist/client/`. The Express server serves this directory for the root route. The old `public/` files continue to be served at `/v1`.

**Why not a separate package**: The dashboard is one product surface. Splitting frontend and backend into separate packages adds deployment complexity for no benefit.

### 3. Dev workflow with Vite proxy

During development, `npm run dev:client` starts Vite's dev server on port 5173 with proxy rules forwarding `/api/*` and WebSocket connections to the Express server on port 3000. Developers run both servers.

In production, `npm run build` compiles the React app to static files. Express serves them directly — same single-process deployment as today.

### 4. React Flow for Process Map topology

React Flow (`@xyflow/react`) is the standard React library for node-based graphs. It provides: interactive panning/zooming, customizable node components, edge routing, and minimap. This avoids writing a custom SVG layout algorithm.

**Why not raw SVG**: The topology needs interactivity (hover details, click-to-inspect, zoom). Raw SVG requires reimplementing all of this. React Flow provides it out of the box.

### 5. Component architecture

```
App
├── AlertBanner          # Persistent alerts for failures/orphans
├── Header               # Navigation tabs
├── ProcessHealth        # Service grid with metrics
│   ├── ServiceCard      # Per-service: name, PID, CPU, mem, uptime
│   └── WorkerCard       # Per-worker: same metrics, compact
├── ProcessMap           # React Flow topology
│   ├── ServiceNode      # Custom node for services
│   └── WorkerNode       # Custom node for workers
├── TraceSidebar         # Grouped traces by agent
│   ├── TraceGroup       # Collapsible agent group
│   └── TraceEntry       # Individual trace with FAIL styling
├── Timeline             # Existing timeline view
├── Metrics              # Existing metrics view
└── SummaryBar           # Bottom bar with all metrics
```

Each component owns its rendering and CSS. State flows down via props. Data fetching is centralized in hooks (`useProcessHealth`, `useTraces`, `useWebSocket`).

### 6. CSS approach

Plain CSS files (one per component or a shared `dashboard.css`) using CSS custom properties for theming — same dark theme as the current dashboard. No Tailwind, no CSS-in-JS. This keeps the CSS approach familiar and avoids new toolchain complexity.

### 7. Migration path

1. Build the React dashboard alongside the old one
2. Serve the React build at `/` and the old dashboard at `/v1`
3. Validate feature parity + improvements
4. Remove `public/dashboard.js` and `public/index.html` once confident

## Risks / Trade-offs

**[New frontend dependencies]** → Adds `react`, `react-dom`, `vite`, `@xyflow/react` to the dashboard package. Mitigation: these are dev/build dependencies for the dashboard only. The core package remains zero-dependency.

**[Learning curve]** → Team needs React + TypeScript frontend knowledge. Mitigation: React is the most widely known frontend framework. The component structure is straightforward.

**[Build step added]** → Dashboard now requires `npm run build` before serving. Mitigation: already true for the server TypeScript. Vite builds are <2 seconds.

**[Dual dashboard during migration]** → Two UIs to maintain briefly. Mitigation: the old dashboard is frozen — no new features added to it. Migration period should be one sprint.
