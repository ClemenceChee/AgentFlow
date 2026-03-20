## Context

The watcher (`src/watcher.ts`, 1,472 lines) handles: `.json` traces (AgentFlow ExecutionGraph), `.jsonl` session files (Alfred logs), `.log` files (systemd + OpenClaw logs). Format detection is inline with `if/else` chains. No extension mechanism.

OpenClaw stores agent runs at `~/.openclaw/cron/runs/*.jsonl` with schema: `{ts, jobId, action, status, summary, model, provider, usage, durationMs, sessionId}`. There are 12 run files with 10+ jobs (email processors, monitors, digest compilers). These are invisible to the current watcher.

The `packages/otel` package exports AgentFlow→OTel. We need the reverse: OTel→AgentFlow for inbound traces.

## Goals / Non-Goals

**Goals:**
- Pluggable adapter interface so new formats require only a new adapter file
- OpenClaw cron jobs visible in dashboard as agents
- OTel spans importable via file or HTTP push
- Zero behavior change for existing AgentFlow trace ingestion
- Watcher refactored from monolith to adapter orchestrator

**Non-Goals:**
- Full OTLP protocol compliance (accept JSON only, not protobuf/gRPC)
- Live SDK adapters for LangChain/CrewAI (Phase 3, deferred for Soma)
- OTel span sampling or tail-based sampling
- Authentication on the HTTP collector (localhost-only for now)

## Decisions

### 1. TraceAdapter Interface

```typescript
interface NormalizedTrace {
  id: string;
  agentId: string;
  name: string;
  status: 'completed' | 'failed' | 'running' | 'unknown';
  startTime: number;
  endTime: number;
  trigger: string;
  source: string;  // adapter name
  nodes: Record<string, NormalizedNode>;
  metadata: Record<string, unknown>;
  sessionEvents?: unknown[];
}

interface NormalizedNode {
  id: string;
  type: string;
  name: string;
  status: string;
  startTime: number;
  endTime: number | null;
  parentId: string | null;
  children: string[];
  metadata: Record<string, unknown>;
}

interface TraceAdapter {
  name: string;
  detect(dirPath: string): boolean;
  canHandle(filePath: string): boolean;
  parse(filePath: string): NormalizedTrace[];
}
```

### 2. Adapter Registry

```typescript
// src/adapters/registry.ts
const adapters: TraceAdapter[] = [
  new OpenClawAdapter(),   // Check first (specific)
  new OTelAdapter(),       // Check second (specific)
  new AgentFlowAdapter(),  // Fallback (handles .json/.jsonl/.log)
];

function findAdapter(filePath: string): TraceAdapter | null {
  return adapters.find(a => a.canHandle(filePath)) ?? null;
}

function detectAdapters(dirPath: string): TraceAdapter[] {
  return adapters.filter(a => a.detect(dirPath));
}
```

Order matters — more specific adapters first, AgentFlow as fallback.

### 3. OpenClaw Adapter

**detect**: returns true if directory contains `cron/jobs.json` or parent is `.openclaw`

**canHandle**: returns true for files matching `cron/runs/*.jsonl`

**parse**: reads JSONL, maps each line:
```
{ ts, jobId, status, model, usage, durationMs }
  ↓
NormalizedTrace {
  id: sessionId,
  agentId: `openclaw:${jobId}`,
  name: job.name (from jobs.json lookup),
  status: status === 'ok' ? 'completed' : 'failed',
  startTime: runAtMs,
  endTime: runAtMs + durationMs,
  source: 'openclaw',
  nodes: { root: { type: 'cron-job', name: jobId, ... } },
  metadata: { model, provider, usage, summary }
}
```

### 4. OTel Adapter

**detect**: returns true if directory contains `*.otlp.json` or `traces/` with OTLP files

**canHandle**: returns true for `.otlp.json` files

**parse**: reads OTLP JSON export format:
```
{ resourceSpans: [{ scopeSpans: [{ spans: [...] }] }] }
  ↓
For each span:
  NormalizedNode {
    id: spanId,
    name: span.name,
    type: mapSpanKind(span),  // gen_ai.chat → 'llm', etc.
    parentId: parentSpanId,
    metadata: { model, tokens, etc from attributes }
  }
```

Group spans by traceId → one NormalizedTrace per traceId.

### 5. HTTP Collector Endpoint

```
POST /v1/traces
Content-Type: application/json
Body: OTLP JSON format

→ Parsed by OTelAdapter.parsePayload(body)
→ Stored in trace store
→ WebSocket notification to dashboard
```

Bound to `localhost:3000` by default. Can be exposed externally with `--collector-host 0.0.0.0`.

### 6. Watcher Refactoring Strategy

The current `loadFile()` method becomes:
```typescript
private loadFile(filePath: string): boolean {
  const adapter = findAdapter(filePath);
  if (!adapter) return false;

  const traces = adapter.parse(filePath);
  for (const trace of traces) {
    this.traces.set(trace.id, this.toWatchedTrace(trace));
  }
  return traces.length > 0;
}
```

The existing 1,000+ lines of format-specific parsing move into `AgentFlowAdapter`. The watcher shrinks to ~300 lines of orchestration code.

## Risks / Trade-offs

**[Large refactor of watcher.ts]** → Moving 1,000+ lines into an adapter. Risk of breaking existing parsing. Mitigation: the AgentFlow adapter wraps the existing code with minimal changes. Run all existing tests to verify.

**[OpenClaw JSONL schema may change]** → OpenClaw is actively developed. Mitigation: adapter checks for expected fields, skips entries it can't parse. Version field in jobs.json.

**[OTLP JSON is verbose]** → A single trace can be 100KB+ in OTLP format. Mitigation: parse streaming, don't load entire file into memory for large exports. Limit HTTP payload size.
