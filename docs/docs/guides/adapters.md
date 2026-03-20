---
sidebar_position: 6
title: Adapters
---

# Adapters

Adapters are the bridge between a specific agent framework and AgentFlow's execution graph model. They translate framework-specific lifecycle events (a LangChain tool call, a CrewAI agent step, your own custom framework callback) into `startNode` / `endNode` calls on the graph builder.

AgentFlow ships with three built-in adapters:

| Adapter | Ingests | Mechanism |
|---------|---------|-----------|
| **AgentFlow** | JSON traces, JSONL sessions, structured logs | File watcher |
| **OpenClaw** | Cron job runs, interactive sessions | File watcher |
| **OpenTelemetry** | OTLP JSON spans (GenAI semantic conventions) | File watcher + HTTP `POST /v1/traces` |

Any OTel-instrumented agent — LangChain, CrewAI, AutoGen — can push traces to AgentFlow's HTTP collector and gain full process mining support with no custom adapter required.

---

## The Adapter Interface

An adapter implements three methods defined in `agentflow-core`:

```typescript
interface Adapter {
  /** Human-readable name shown in logs and the dashboard. */
  readonly name: string;

  /** Hook into the framework's lifecycle. Call builder methods on events. */
  attach(builder: GraphBuilder): void;

  /** Unhook and clean up resources. */
  detach(): void;
}
```

Adapters are passed to `createGraphBuilder` via the `adapters` option in `AgentFlowConfig`:

```typescript
import { createGraphBuilder } from 'agentflow-core';

const builder = createGraphBuilder({
  agentId: 'my-agent',
  adapters: [myFrameworkAdapter],
});
```

---

## Writing a Custom Adapter

A custom adapter in about 30 lines of TypeScript. This example listens to a hypothetical event emitter from a custom framework:

```typescript
import type { Adapter, GraphBuilder } from 'agentflow-core';
import type { MyFramework } from 'my-framework';

export function createMyFrameworkAdapter(framework: MyFramework): Adapter {
  let builder: GraphBuilder | null = null;
  // Track active node IDs so we can close them on 'end' events
  const activeNodes = new Map<string, string>();

  const onStepStart = (event: { id: string; type: string; name: string }) => {
    if (!builder) return;
    const nodeId = builder.startNode({
      type: event.type as 'tool' | 'agent' | 'reasoning',
      name: event.name,
    });
    activeNodes.set(event.id, nodeId);
  };

  const onStepEnd = (event: { id: string; status: 'completed' | 'failed' }) => {
    if (!builder) return;
    const nodeId = activeNodes.get(event.id);
    if (nodeId) {
      builder.endNode(nodeId, { status: event.status });
      activeNodes.delete(event.id);
    }
  };

  return {
    name: 'my-framework',

    attach(graphBuilder: GraphBuilder) {
      builder = graphBuilder;
      framework.on('step:start', onStepStart);
      framework.on('step:end', onStepEnd);
    },

    detach() {
      framework.off('step:start', onStepStart);
      framework.off('step:end', onStepEnd);
      builder = null;
      activeNodes.clear();
    },
  };
}
```

### Register and use it

```typescript
import { createGraphBuilder } from 'agentflow-core';
import { createMyFrameworkAdapter } from './my-framework-adapter';
import { myFramework } from 'my-framework';

const adapter = createMyFrameworkAdapter(myFramework);

const builder = createGraphBuilder({
  agentId: 'my-agent',
  trigger: 'api-call',
  adapters: [adapter],
});

// Run your agent — the adapter translates framework events into graph nodes
await myFramework.run(task);

const graph = builder.build();
```

---

## Dashboard-Side Trace Adapters

The dashboard has a separate adapter concept for **ingesting file formats**. These are different from the runtime `Adapter` interface above — they parse files on disk rather than hooking into a live runtime.

A dashboard trace adapter implements `TraceAdapter` from `agentflow-dashboard`:

```typescript
import type { TraceAdapter, NormalizedTrace } from 'agentflow-dashboard';
import { existsSync } from 'fs';
import { readFileSync } from 'fs';
import { join } from 'path';

class MyFrameworkAdapter implements TraceAdapter {
  name = 'my-framework';

  detect(dirPath: string): boolean {
    // Return true if this directory contains your framework's traces
    return existsSync(join(dirPath, 'my-framework-index.json'));
  }

  canHandle(filePath: string): boolean {
    return filePath.endsWith('.my-trace');
  }

  parse(filePath: string): NormalizedTrace[] {
    const data = JSON.parse(readFileSync(filePath, 'utf-8'));
    return [{
      id: data.id,
      agentId: data.agent,
      trigger: data.trigger ?? 'unknown',
      startTime: data.ts,
      endTime: data.ts + data.duration,
      status: data.ok ? 'completed' : 'failed',
      nodes: data.steps.reduce((acc: Record<string, unknown>, step: { id: string }) => {
        acc[step.id] = step;
        return acc;
      }, {}),
    }];
  }
}
```

Register it when starting the dashboard server:

```typescript
import { DashboardServer } from 'agentflow-dashboard';

const dashboard = new DashboardServer({
  port: 3000,
  tracesDir: './traces',
  adapters: [new MyFrameworkAdapter()],
});

await dashboard.start();
```

---

## Adapter Roadmap

| Phase | Adapter | Status |
|-------|---------|--------|
| P1 | OpenClaw | Shipped |
| P2 | OpenTelemetry | Shipped |
| P3 | Community adapters | Planned (deferred for Soma) |

To contribute an adapter, see the contributing guidelines in the repository root.
