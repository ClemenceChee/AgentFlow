## Why

AgentFlow's core purpose is observing AI agents — systems that produce unpredictable output. A security audit revealed that agent-produced JSON files flow into shell commands, HTML rendering, and recursive graph traversal without validation or sanitization. The most critical issue is a command injection via `execSync` in the PID liveness check, which allows arbitrary code execution if a malicious or compromised agent writes crafted JSON to a watched directory.

## What Changes

- **Remove shell execution for PID checks** — Replace `execSync(`kill -0 ${pid}`)` in `live.ts` with Node's `process.kill(Number(pid), 0)`, eliminating the command injection vector entirely.
- **HTML-escape trace fields in dashboard** — Sanitize `agentId`, `name`, and `trigger` before inserting into `innerHTML` templates in `dashboard.js`, preventing stored XSS.
- **Add cycle detection to distributed trace traversal** — Guard `getDistDepth()` in `live.ts` against circular `parentSpanId` references that cause stack overflow crashes.
- **Add runtime allowlist for SQL ORDER BY** — Validate `orderBy` and `orderDirection` values in `query.ts` against known-safe column names, adding defense-in-depth beyond TypeScript's compile-time checks.
- **Add path containment checks for trace file writes** — Validate that resolved file paths in `trace-store.ts` and `runner.ts` remain within the intended base directory.

## Capabilities

### New Capabilities
- `input-sanitization`: Runtime validation and sanitization of untrusted data from agent-produced JSON files before use in shell commands, HTML, SQL, file paths, and recursive traversal.

### Modified Capabilities

## Impact

- `packages/core/src/live.ts` — PID check logic and `getDistDepth` recursion
- `packages/dashboard/public/dashboard.js` — Trace rendering in `updateTraces()`
- `packages/storage/src/query.ts` — `buildExecutionsQuery` ORDER BY handling
- `packages/core/src/trace-store.ts` — File path construction in `save()`
- `packages/core/src/runner.ts` — File path construction for trace output
