# AgentFlow Dashboard — Product Requirements Document

**Version:** 1.0
**Date:** 2026-03-19
**Status:** Draft — ready for review

---

## 1. Problem Statement

We run multiple AI agent systems (OpenClaw gateway + agents, Alfred workers) on a single server. These agents produce execution traces, session logs, and cron run records across many directories. We need **one dashboard** that:

- Discovers all agent activity across all data directories
- Shows each agent and its sessions/traces in a navigable sidebar
- Lets us click into any session to see the full transcript, timeline, metrics, and errors
- Updates in real-time as agents run

**Current state:** The dashboard (v0.3.1) loads 934 traces and reports 6 agents, but **OpenClaw agents don't appear as selectable items in the sidebar**, making it impossible to inspect their sessions. Multiple backend fixes have been attempted but the end-to-end flow is broken.

---

## 2. Agent Systems & Data Sources

### 2.1 OpenClaw Agents

| Agent | Session Dir | Format |
|-------|-------------|--------|
| `main` | `~/.openclaw/agents/main/sessions/` | JSONL (Claude Code format) |
| `vault-janitor` | `~/.openclaw/agents/vault-janitor/sessions/` | JSONL |
| `vault-curator` | `~/.openclaw/agents/vault-curator/sessions/` | JSONL |
| `vault-distiller` | `~/.openclaw/agents/vault-distiller/sessions/` | JSONL |

**OpenClaw traces:** `~/.openclaw/workspace/traces/` — AgentFlow JSON format (934 files)

**OpenClaw cron:** `~/.openclaw/cron/` and `~/.openclaw/cron/runs/` — cron job logs

**JSONL session format** (one JSON object per line):
```jsonl
{"type":"session","sessionId":"abc123","startTime":1710800000000}
{"type":"model_change","model":"claude-sonnet-4-20250514"}
{"type":"message","role":"user","content":"..."}
{"type":"message","role":"assistant","content":[...],"usage":{"input":1234,"output":567}}
```

### 2.2 Alfred Workers

| Worker | Data Dir | Format |
|--------|----------|--------|
| curator | `~/.alfred/data/` | PID files, workers.json |
| janitor | `~/.alfred/data/` | PID files, workers.json |
| distiller | `~/.alfred/data/` | PID files, workers.json |
| surveyor | `~/.alfred/data/` | PID files, workers.json |

### 2.3 OpenClaw Gateway

- Process: `openclaw-gateway`
- Logs: `/tmp/openclaw/*.log` (tslog format)
- Monitoring: `clawmetry` process

---

## 3. Requirements

### 3.1 Agent Discovery (P0 — BROKEN)

**What must work:**
1. All OpenClaw agents (`main`, `vault-janitor`, `vault-curator`, `vault-distiller`) appear in the sidebar under an "OpenClaw" group
2. Each agent shows its session count and last activity time
3. Clicking an agent expands its sessions list
4. New sessions detected in real-time via file watcher

**Current bugs:**
- `watcher.ts` loads files but agent ID extraction may not propagate to the frontend trace list
- The sidebar renders traces (execution graphs) but may not render JSONL sessions as separate selectable items
- The mapping from `WatchedTrace` → sidebar item may drop sessions that don't have an `ExecutionGraph` structure

**Root cause hypothesis:** The dashboard was designed for AgentFlow JSON traces (which have `nodes`, `rootNodeId`, etc.). JSONL sessions are a different data shape (flat event list) and the sidebar rendering code may filter them out or fail to display them properly.

### 3.2 Session Timeline & Transcript (P0 — INCOMPLETE)

**What must work:**
1. Click any OpenClaw session → see full conversation transcript
2. User messages, assistant responses, tool calls, thinking blocks all displayed
3. Timeline tab shows waterfall of events with durations
4. Token usage displayed per message and total

**Current bugs:**
- `renderSessionTimeline()` in `dashboard.js` is incomplete or missing
- The `/api/traces/:filename/events` endpoint exists but may not return data in the format the frontend expects
- No transcript rendering for JSONL sessions

### 3.3 Trace Graph Visualization (P1 — MOSTLY WORKS)

**What must work:**
1. AgentFlow JSON traces render as interactive execution graphs (Cytoscape.js)
2. Nodes show type, status, duration
3. Parent-child relationships shown as edges
4. Failed/hung nodes highlighted

**Status:** Works for AgentFlow JSON traces. Not applicable to JSONL sessions.

### 3.4 Metrics & Stats (P1 — MOSTLY WORKS)

**What must work:**
1. Per-agent success rate, execution count, avg duration
2. Global success rate across all agents
3. Active agent count (ran in last hour)
4. Recent activity feed

**Current bugs:**
- Hung node detection missing in fallback path (`stats.ts:104-137`)
- Stats cleanup never auto-called — memory grows unbounded

### 3.5 Process Health (P2 — WORKS BUT FRAGILE)

**What must work:**
1. Show running agent processes with PID, CPU, memory
2. Detect orphaned processes
3. Show OpenClaw gateway status

**Current issues:**
- Process categorization uses brittle substring matching (`dashboard.js:460-586`)
- False positives from generic keywords like "agent"

### 3.6 Error Tab (P1 — UNKNOWN STATUS)

**What must work:**
1. Show all failed executions with error details
2. Show hung nodes (running > threshold)
3. Link to the trace/session for context

---

## 4. Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Data Sources                         │
│  ~/.openclaw/agents/*/sessions/*.jsonl  (JSONL sessions) │
│  ~/.openclaw/workspace/traces/*.json   (AgentFlow JSON)  │
│  ~/.openclaw/cron/                     (cron logs)        │
│  ~/.alfred/data/                       (Alfred workers)   │
│  /tmp/openclaw/*.log                   (gateway logs)     │
└──────────────────────┬──────────────────────────────────┘
                       │
              ┌────────▼────────┐
              │  TraceWatcher    │  chokidar file watching
              │  (watcher.ts)    │  recursive glob patterns
              │                  │  parses JSON + JSONL + LOG
              └────────┬────────┘
                       │
              ┌────────▼────────┐
              │  AgentStats      │  per-agent metrics
              │  (stats.ts)      │  success rates, trends
              └────────┬────────┘
                       │
              ┌────────▼────────┐
              │  Express Server  │  REST API + WebSocket
              │  (server.ts)     │  serves static frontend
              └────────┬────────┘
                       │
              ┌────────▼────────┐
              │  Frontend        │  Single-page app
              │  (dashboard.js)  │  sidebar + tabs + graphs
              │  (index.html)    │  Cytoscape.js for graphs
              └─────────────────┘
```

### 4.1 Key Data Types

```typescript
// AgentFlow JSON trace (existing, works)
interface ExecutionGraph {
  id: string;
  rootNodeId: string;
  nodes: Map<string, ExecutionNode>;
  metadata: { agentId: string; trigger: string; startTime: number; };
}

// JSONL session (needs first-class support)
interface SessionTrace {
  sessionId: string;
  agentId: string;        // e.g., "openclaw-main"
  model: string;
  startTime: number;
  endTime?: number;
  status: 'running' | 'completed' | 'failed';
  events: SessionEvent[];
  tokenUsage: { input: number; output: number; total: number; cost?: number; };
}

// Unified trace wrapper (what the sidebar displays)
interface WatchedTrace {
  filename: string;
  filepath: string;
  agentId: string;
  sourceType: 'agentflow' | 'session' | 'log';
  startTime: number;
  status: string;
  // For agentflow traces:
  graph?: ExecutionGraph;
  // For session traces:
  sessionEvents?: SessionEvent[];
  tokenUsage?: TokenUsage;
}
```

### 4.2 API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/traces` | List all traces (both graph and session) |
| GET | `/api/traces/:filename` | Get single trace with full data |
| GET | `/api/traces/:filename/events` | Get session events + token usage |
| GET | `/api/agents` | List all discovered agents |
| GET | `/api/stats` | Global metrics |
| GET | `/api/process-health` | Running processes |
| WS | `/` | Real-time trace updates |

---

## 5. Implementation Plan

### Phase 1: Fix Agent Discovery (P0)

**Goal:** All OpenClaw agents appear in sidebar, sessions are clickable.

1. **Verify `WatchedTrace` population** — ensure JSONL sessions create `WatchedTrace` objects with correct `agentId` and `sourceType: 'session'`
2. **Fix sidebar rendering** — ensure `dashboard.js` renders both `agentflow` and `session` type traces in the sidebar
3. **Add agent grouping** — group sidebar items by agent system (OpenClaw, Alfred) then by agent name
4. **Test with real data** — verify with actual session files from each agent directory

### Phase 2: Session Transcript & Timeline (P0)

**Goal:** Click a session → see full conversation.

1. **Implement `renderSessionTimeline()`** — render session events as a conversation transcript
2. **Add transcript tab** — user messages, assistant responses, tool calls, thinking blocks
3. **Token usage per message** — show input/output tokens next to each assistant response
4. **Timeline bars** — show duration of each tool call and thinking block

### Phase 3: Reliability & Polish (P1)

1. **Error handling** — fallback parsing for malformed JSON, log warnings for unparseable files
2. **Hung node detection** — add heuristic fallback in stats.ts
3. **Auto-cleanup** — periodic stats cleanup (every hour, 7-day retention)
4. **API documentation** — document all endpoints

### Phase 4: Process Health Improvements (P2)

1. **Refactor process categorization** — use regex patterns instead of substring matching
2. **Add process tree null checks** — handle missing ppid
3. **Add `/api/config` endpoint** — let frontend show monitored directories

---

## 6. File Inventory

All dashboard source files:

```
packages/dashboard/
├── bin/dashboard.js          # Entry point
├── src/
│   ├── cli.ts                # CLI argument parsing, banner
│   ├── server.ts             # Express + WebSocket + API routes
│   ├── watcher.ts            # File discovery, parsing, watching (1200+ lines — largest file)
│   └── stats.ts              # Per-agent and global statistics
├── public/
│   ├── index.html            # SPA shell
│   └── dashboard.js          # Frontend (1900+ lines — largest file)
├── package.json
├── tsconfig.json
└── tsup.config.ts
```

---

## 7. Testing Strategy

- **Unit tests:** Already exist in `tests/dashboard/` — extend for JSONL session parsing edge cases
- **Integration tests:** Test full flow: file on disk → watcher → API → frontend rendering
- **Manual testing:** Start dashboard with all data dirs, verify sidebar shows all agents
- **E2E tests:** Playwright tests exist — extend for session transcript interaction

---

## 8. Launch Checklist

- [ ] All OpenClaw agents visible in sidebar
- [ ] Click any session → transcript renders
- [ ] Click any session → timeline renders
- [ ] Token usage shown per session
- [ ] Real-time updates when new session files appear
- [ ] AgentFlow JSON traces still work (no regression)
- [ ] Alfred workers still show in process health
- [ ] Dashboard starts cleanly with all data dirs
- [ ] No console errors in browser
- [ ] No uncaught exceptions in server logs

---

## 9. Startup Command

```bash
cd /home/trader/agentflow/packages/dashboard && node bin/dashboard.js \
  --host 0.0.0.0 --port 3000 \
  --traces /home/trader/.openclaw/workspace/traces \
  --data-dir /home/trader/.alfred/data \
  --data-dir /home/trader/.openclaw/cron \
  --data-dir /home/trader/.openclaw/cron/runs \
  --data-dir /home/trader/.openclaw/agents/main/sessions \
  --data-dir /home/trader/.openclaw/agents/vault-distiller/sessions \
  --data-dir /home/trader/.openclaw/agents/vault-janitor/sessions \
  --data-dir /home/trader/.openclaw/agents/vault-curator/sessions
```
