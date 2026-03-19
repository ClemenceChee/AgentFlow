## 1. Command Injection Fix (Critical)

- [x] 1.1 Replace `execSync(`kill -0 ${pid}`)` in `packages/core/src/live.ts:404` with `process.kill(Number(pid), 0)` in a try/catch — treat `NaN` and dead PIDs the same (set `pidAlive = false`)
- [x] 1.2 Add test: valid numeric PID is checked without shell execution
- [x] 1.3 Add test: non-numeric PID string (injection payload) is safely handled as invalid

## 2. XSS Fix (Critical)

- [x] 2.1 Add `escapeHtml()` helper function to `packages/dashboard/public/dashboard.js` that replaces `&`, `<`, `>`, `"`, `'` with HTML entities
- [x] 2.2 Apply `escapeHtml()` to `trace.agentId`, `trace.name`, and `trace.trigger` in the `updateTraces()` template literal
- [x] 2.3 Verify dashboard still renders normal trace data correctly with special characters like `&`

## 3. Stack Overflow Fix

- [x] 3.1 Add `visited: Set<string>` parameter to `getDistDepth()` in `packages/core/src/live.ts:1101` — return current depth if spanId already visited
- [x] 3.2 Update all call sites of `getDistDepth()` to pass a new `Set()` (parameter is optional with default)
- [x] 3.3 Add test: circular parentSpanId references return finite depth without crashing

## 4. SQL ORDER BY Allowlist (Defense-in-Depth)

- [x] 4.1 Add allowlist constants in `packages/storage/src/query.ts`: `VALID_ORDER_COLUMNS = ['timestamp', 'executionTime', 'agentId']` and `VALID_DIRECTIONS = ['ASC', 'DESC']`
- [x] 4.2 Validate `orderBy` and `orderDirection` against allowlists before concatenation, falling back to defaults
- [x] 4.3 Add test: injection payload in `orderBy` falls back to default
- [x] 4.4 Add test: valid `orderBy` and `orderDirection` pass through correctly

## 5. Path Containment (Defense-in-Depth)

- [x] 5.1 Add path containment check in `packages/core/src/trace-store.ts` after `join()` — resolve absolute path and verify it starts with resolved base dir, throw if not
- [x] 5.2 Add path containment check in `packages/core/src/runner.ts` for trace output path construction
- [x] 5.3 Add test: normal agentId/graphId writes to expected location
- [x] 5.4 Add test: `../` in agentId/graphId throws an error
