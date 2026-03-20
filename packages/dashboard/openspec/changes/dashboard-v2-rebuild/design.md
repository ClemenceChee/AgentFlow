## Context

The React + Vite scaffold exists and builds (<1s, 70KB gzip). The Express backend serves APIs at `/api/traces`, `/api/agents`, `/api/stats`, `/api/process-health`. AgentFlow core provides process mining functions: `discoverProcess`, `findVariants`, `getBottlenecks`, `checkConformance`. These are unused by the dashboard.

Current problems: 15 dead component files, broken state (detail doesn't update on agent switch), no process mining views, only watches manually-specified directories (misses OpenClaw agents at `~/.openclaw/workspace/traces/`).

## Goals / Non-Goals

**Goals:**
- Clean component tree with zero dead files
- Process mining visualizations using agentflow-core
- Proper state model with 2 selections and clear rules
- Auto-discovery of agent data directories
- Layout: top 1/3 agents, bottom 2/3 workspace

**Non-Goals:**
- Cytoscape.js or React Flow (use inline SVG for process maps — simpler, zero deps)
- Real-time animated flows (dashboard-observability scope)
- Log streaming (dashboard-observability scope)
- Mobile layout

## Decisions

### 1. State model

```
State = {
  selectedAgent: string | null
  selectedExecution: string | null  // filename
  activeView: 'agent' | 'execution'  // derived
}

Rules:
- selectedAgent changes → selectedExecution = null, show AgentProfile
- selectedExecution set → show ExecutionDetail
- On load → auto-select first agent with failures (or first by exec count)
- On agent select → auto-select first failed execution (or most recent)
```

State lives in App.tsx. Passed down via props. No context/Redux needed — it's just 2 values.

### 2. Component tree

```
App (state owner)
├── HealthBanner                    (40px, stats)
├── AlertBanner                     (conditional)
├── TopSection                      (max 33vh)
│   ├── ServiceRow                  (compact chips)
│   └── AgentCards                  (horizontal flow, clickable)
├── Workspace                       (flex: 1)
│   ├── ExecSidebar                 (240px left, scrollable)
│   │   └── ExecRow[]              (status, time, nodes, dur, bar)
│   └── WorkspaceMain              (fills right)
│       ├── AgentProfile           (when no execution selected)
│       │   ├── ProcessMap         (directly-follows graph)
│       │   ├── VariantExplorer    (ranked paths)
│       │   ├── BottleneckView     (heatmap overlay)
│       │   └── DottedChart        (temporal scatter)
│       └── ExecutionDetail        (when execution selected)
│           ├── FlameChart         (nested time bars)
│           ├── AgentFlow          (categorized steps)
│           ├── Metrics            (counts, durations, types)
│           ├── Dependencies       (tree)
│           ├── StateMachine       (state flow)
│           ├── Summary            (text + recommendations)
│           └── Transcript         (if session events exist)
└── SummaryBar                      (28px)
```

Total: ~20 components. Each has one job. No orphans.

### 3. Process mining views use agentflow-core

The server adds 2 new endpoints that call core functions:

```
GET /api/process-model/:agentId
  → Loads all traces for this agent
  → Calls discoverProcess(graphs)
  → Calls findVariants(graphs)
  → Calls getBottlenecks(graphs)
  → Returns { model, variants, bottlenecks }

GET /api/conformance/:agentId/:filename
  → Loads the specific trace + the discovered model
  → Calls checkConformance(graph, model)
  → Returns conformance report
```

The frontend renders these as SVG:

**Process Map**: Nodes positioned with simple layered layout (Sugiyama-lite). Each node is a rounded rect sized by frequency. Edges are arrows with thickness = frequency. Color gradient on edges: blue (fast) → red (slow). A range slider filters edges below a frequency threshold (Disco-style).

**Variant Explorer**: Vertical list of variants sorted by count. Each variant rendered as a horizontal row of colored step boxes. Top variant labeled "Happy Path". Click a variant to highlight its edges on the process map.

**Bottleneck View**: Same process map layout but nodes/edges colored by duration (thermal: blue → yellow → red). Glow effect on the slowest nodes.

**Dotted Chart**: SVG scatter plot. X = time (relative to agent first execution). Y = execution index. Each dot = one node event. Dot color = node type. Hover shows details.

### 4. Flame Chart (replaces flat timeline)

```
Time →  0              25%             50%              75%            100%
        ├───────────────┼───────────────┼────────────────┼───────────────┤
Level 0 │▓▓▓▓▓▓▓▓▓▓▓▓▓▓ daemon:processing ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│
Level 1 │ ▓▓▓ pipeline:start ▓▓▓│        │▓▓▓▓▓▓ watcher:scan ▓▓▓▓▓▓▓│
Level 2 │  ▓ llm_call ▓│▓ embed ▓▓│      │                            │
```

Rows are levels of nesting (depth). Bars are positioned by actual start/end time. Width = duration. Clicking a bar selects it and shows details below.

### 5. Directory auto-discovery

Server-side:
1. Scan all systemd user services for `ExecStart` paths → derive data directories
2. Check common locations: `~/.alfred/`, `~/.openclaw/`, `~/.agentflow/`, `~/*/traces/`
3. Expose via `GET /api/directories` with `{ discovered: [...], watched: [...], suggested: [...] }`
4. `POST /api/directories` to add/remove watched directories
5. Persist config in `~/.agentflow/dashboard-config.json`

Frontend: Settings panel (gear icon in health banner) showing discovered/watched/suggested directories with toggle switches.

### 6. Agent Flow categorization

Each node is categorized by type + name patterns:

| Pattern | Category | Icon | Color |
|---------|----------|------|-------|
| type=tool or name contains "tool" | Tool Call | ⚙ | #d29922 |
| name contains "llm" or "pipeline" | LLM Call | ✦ | #bc8cff |
| name contains "search" or "web" or "fetch" | Web/Search | ⌕ | #58a6ff |
| name contains "embed" | Embedding | ▣ | #f0883e |
| name contains "write" or "save" | Write | ✎ | #56d364 |
| name contains "read" or "scan" or "watch" | Read/Scan | ☰ | #a5d6ff |
| type=agent or type=daemon | Agent | ◉ | #58a6ff |
| default | Other | ○ | #8b949e |

Rendered as a vertical sequence with connecting lines, indented by depth. Each step shows: icon, category, name, duration, timestamp.

## Risks / Trade-offs

**[SVG process map layout is basic]** → Simple layered layout won't look as polished as Celonis. Mitigation: for <50 nodes it's fine. Can add dagre-d3 later if needed.

**[Process mining on every API call]** → `discoverProcess` runs over all traces for an agent. Mitigation: cache results server-side with 60s TTL. Invalidate on new trace arrival.

**[Directory discovery scans filesystem]** → Could be slow on large home directories. Mitigation: only scan known locations + systemd units, not recursive search. Cache results.
