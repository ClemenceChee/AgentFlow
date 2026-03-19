## Context

AgentFlow reads JSON files produced by AI agents and uses their content in shell commands (`execSync`), HTML rendering (`innerHTML`), SQL queries (string concatenation), recursive graph traversal, and file path construction. The current code treats all agent-produced data as trusted. A security audit confirmed three exploitable vulnerabilities and two defense-in-depth gaps.

The affected components span three packages: `core` (live dashboard, trace store, runner), `dashboard` (web UI), and `storage` (query builder).

## Goals / Non-Goals

**Goals:**
- Eliminate command injection via PID liveness checks
- Prevent XSS via agent-controlled trace fields in the dashboard
- Prevent DoS via circular span references in distributed trace rendering
- Add runtime validation for SQL ORDER BY clauses and file path containment
- Establish a pattern for treating agent-produced JSON as untrusted input

**Non-Goals:**
- Authentication or authorization for the dashboard API
- SSRF protection for webhook URLs (operator-controlled CLI flags)
- Prototype pollution hardening (programmatic API, not external input)
- OOM protection for large JSON files (operational, not security)
- Rewriting the dashboard to use a framework with built-in XSS protection

## Decisions

### 1. Use `process.kill()` instead of `execSync` for PID checks

Replace `execSync(`kill -0 ${pid}`)` with `process.kill(Number(pid), 0)`.

**Why over alternatives:**
- `Number(pid)` returns `NaN` for non-numeric strings; `process.kill(NaN, 0)` throws, which the existing catch block handles
- No shell spawned = no injection vector, and better performance
- `parseInt` was considered but `Number()` is stricter (rejects `"123abc"`)

### 2. HTML escape via helper function in dashboard.js

Add a simple `escapeHtml()` function that replaces `&`, `<`, `>`, `"`, `'` with HTML entities. Apply it to all interpolated trace fields.

**Why over alternatives:**
- The dashboard is a single vanilla JS file — adding a templating library or DOMParser for this is overkill
- `textContent` would require restructuring the template literal approach; escaping is a smaller, targeted fix
- A helper function is reusable for any future template additions

### 3. Visited-set guard for recursive traversal

Pass a `Set<string>` through `getDistDepth` recursion. If a spanId is already visited, return current depth.

**Why over alternatives:**
- A max-depth cap was considered but it masks data corruption — a visited set correctly identifies cycles
- Iterative rewrite was considered but the function is simple enough that adding a set parameter is cleaner

### 4. Runtime allowlist for ORDER BY

Check `orderBy` against `['timestamp', 'executionTime', 'agentId']` and `orderDirection` against `['ASC', 'DESC']` at runtime, falling back to defaults on mismatch.

**Why over alternatives:**
- TypeScript union types only enforce at compile time; a direct JS caller or deserialized input bypasses them
- Parameterized queries can't be used for ORDER BY column names in SQL
- Throwing on invalid input was considered, but silently defaulting is safer for a query builder that might receive external filters

### 5. Path containment via `resolve` + `startsWith`

After constructing the file path with `join()`, resolve it to an absolute path and verify it starts with the resolved base directory.

**Why over alternatives:**
- `path.resolve()` + `startsWith()` is the standard Node.js pattern for path containment
- Sanitizing characters in the ID is fragile (must maintain an exclusion list)
- Throwing an error on traversal attempts is appropriate — this should never happen in normal operation

## Risks / Trade-offs

- **[Risk] `process.kill(Number(pid), 0)` may behave differently across platforms** → Mitigation: Node.js documents this as cross-platform for signal 0. Linux and macOS both support it. Windows support is limited but AgentFlow targets Unix.
- **[Risk] HTML escaping may break legitimate display of special characters in agent names** → Mitigation: Standard HTML entity escaping is reversible by the browser; `&amp;` renders as `&`. No data loss.
- **[Risk] Silent ORDER BY fallback may confuse users** → Mitigation: Log a warning when an invalid value is received. The TypeScript types already prevent this in normal usage.
