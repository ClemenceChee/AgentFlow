## ADDED Requirements

### Requirement: Vite + React + TypeScript project scaffold
The dashboard package SHALL contain a Vite-based React + TypeScript frontend at `src/client/`. The entry point SHALL be `src/client/main.tsx` rendering into a root `<div>`.

#### Scenario: Dev server starts
- **WHEN** `npm run dev:client` is run
- **THEN** Vite SHALL start a dev server with HMR on port 5173

#### Scenario: Production build
- **WHEN** `npm run build:client` is run
- **THEN** Vite SHALL output optimized static files to `dist/client/`

### Requirement: Vite dev proxy to Express
The Vite config SHALL proxy `/api/*` requests and WebSocket connections to the Express server during development.

#### Scenario: API proxy
- **WHEN** the React app fetches `/api/process-health` during development
- **THEN** the request SHALL be proxied to the Express server (default `http://localhost:3000`)

#### Scenario: WebSocket proxy
- **WHEN** the React app opens a WebSocket connection during development
- **THEN** the connection SHALL be proxied to the Express server's WebSocket endpoint

### Requirement: Express serves React build in production
The Express server SHALL serve the Vite build output (`dist/client/`) at the root route `/`. The old dashboard files in `public/` SHALL be served at `/v1`.

#### Scenario: Production root
- **WHEN** a browser requests `/` in production
- **THEN** the React app's `index.html` SHALL be served

#### Scenario: Legacy fallback
- **WHEN** a browser requests `/v1`
- **THEN** the old `public/index.html` SHALL be served

### Requirement: Package dependencies
The dashboard `package.json` SHALL include: `react`, `react-dom` as dependencies; `vite`, `@vitejs/plugin-react`, `@types/react`, `@types/react-dom` as devDependencies.

#### Scenario: Install and build
- **WHEN** `npm install && npm run build:client` is run in a clean environment
- **THEN** the React app SHALL build successfully with zero errors

### Requirement: useProcessHealth hook
The React app SHALL provide a `useProcessHealth()` hook that fetches `/api/process-health` on an interval and returns the current process health state including `services[]`.

#### Scenario: Initial fetch
- **WHEN** a component calls `useProcessHealth()`
- **THEN** it SHALL receive the process health data after the first fetch completes

### Requirement: useWebSocket hook
The React app SHALL provide a `useWebSocket()` hook that connects to the dashboard WebSocket and returns real-time trace/event updates.

#### Scenario: Trace update
- **WHEN** the server pushes a new trace via WebSocket
- **THEN** the hook SHALL update its state and trigger a re-render
