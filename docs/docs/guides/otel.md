---
sidebar_position: 3
title: OpenTelemetry
---

# OpenTelemetry Integration

`agentflow-otel` exports AgentFlow execution graphs to OpenTelemetry-compatible backends, following GenAI semantic conventions. Use it to view agent traces alongside application metrics in Datadog, Grafana, Jaeger, or Honeycomb.

## Installation

```bash
npm install agentflow-otel
```

---

## Quick Start

```typescript
import { setupAgentFlowOTel, exportGraphToOTel } from 'agentflow-otel';
import { createGraphBuilder } from 'agentflow-core';

// Initialize with a backend
await setupAgentFlowOTel({
  serviceName: 'my-agent-system',
  backend: 'jaeger',
});

// Build an execution graph
const builder = createGraphBuilder({ agentId: 'portfolio-analyzer' });
const root = builder.startNode({ type: 'agent', name: 'main' });
// ... your agent logic ...
builder.endNode(root);
const graph = builder.build();

// Export to OpenTelemetry
await exportGraphToOTel(graph);
```

---

## Backend Presets

Four backends are pre-configured. Use `OTelPresets` for the shortest setup, or pass configuration directly to `setupAgentFlowOTel`.

### Jaeger (local development)

```typescript
import { OTelPresets, setupAgentFlowOTel } from 'agentflow-otel';

await setupAgentFlowOTel(OTelPresets.jaeger());
```

### Datadog APM

```typescript
await setupAgentFlowOTel({
  serviceName: 'production-agents',
  backend: 'datadog',
  headers: { 'DD-API-KEY': process.env.DATADOG_API_KEY },
});

// Or use the preset
await setupAgentFlowOTel(OTelPresets.datadog(process.env.DATADOG_API_KEY));
```

### Grafana Tempo

```typescript
await setupAgentFlowOTel({
  serviceName: 'agent-fleet',
  backend: 'grafana',
  headers: {
    username: process.env.GRAFANA_TEMPO_USERNAME,
    password: process.env.GRAFANA_TEMPO_PASSWORD,
  },
});
```

### Honeycomb

```typescript
await setupAgentFlowOTel({
  serviceName: 'ai-workflows',
  backend: 'honeycomb',
  headers: {
    'x-honeycomb-team': process.env.HONEYCOMB_API_KEY,
    'x-honeycomb-dataset': 'agent-traces',
  },
});

// Or use the preset with a custom dataset
await setupAgentFlowOTel(OTelPresets.honeycomb(process.env.HONEYCOMB_API_KEY, 'agent-traces'));
```

### Generic OTLP endpoint

```typescript
await setupAgentFlowOTel(OTelPresets.otlp('https://otel.company.com/v1/traces'));
```

---

## Automatic File Watching

Watch trace directories and export new graphs automatically as they appear:

```typescript
import { createOTelWatcher, setupAgentFlowOTel } from 'agentflow-otel';

await setupAgentFlowOTel({
  serviceName: 'agent-monitor',
  backend: 'datadog',
});

const watcher = createOTelWatcher(['./traces', './agent-logs']);
watcher.start();
// New trace files are exported as they are written
```

---

## What Gets Exported

### Span Names

AgentFlow maps its node types to OTel GenAI span names:

| AgentFlow node type | OTel span name |
|---------------------|----------------|
| `agent` | `agent.execution` |
| `subagent` | `agent.subagent` |
| `tool` (LLM call) | `llm.generation` |
| `tool` (embedding) | `llm.embedding` |
| `tool` (vector DB) | `vectordb.search` |
| `tool` (general) | `agent.tool` |
| `reasoning` | `agent.reasoning` |
| `decision` | `agent.decision` |

### Key Attributes

- **Agent context**: `agentflow.agent.id`, `agentflow.graph.trigger`
- **Node details**: `agentflow.node.type`, `agentflow.node.name`
- **LLM metadata**: `llm.vendor`, `llm.request.model`, `llm.usage.input_tokens`, `llm.usage.output_tokens`
- **Costs**: `llm.usage.cost.total`
- **Performance**: `agentflow.duration_ms`
- **Guard violations**: `agentflow.guard.violated`, `agentflow.guard.violation.0.type`, `agentflow.guard.violation.0.severity`

### Guard Violation Example

When a runtime guard fires, the violation is exported as span attributes:

```typescript
// AgentFlow guard violation (in trace metadata)
{
  guard_violations: [{
    type: 'reasoning_loop',
    severity: 'high',
    message: 'Detected 25+ consecutive reasoning steps'
  }]
}

// Exported OTel span attributes
{
  'agentflow.guard.violated': true,
  'agentflow.guard.violation.0.type': 'reasoning_loop',
  'agentflow.guard.violation.0.severity': 'high'
}
```

---

## Environment Variables

Configure the OTel exporter entirely via environment variables — useful for containers:

```bash
# Backend selection
AGENTFLOW_OTEL_BACKEND=datadog      # jaeger | datadog | grafana | honeycomb | otlp
AGENTFLOW_OTEL_SERVICE=my-agents
AGENTFLOW_OTEL_ENDPOINT=https://custom-endpoint.com

# Backend-specific credentials
DD_API_KEY=your-datadog-key
HONEYCOMB_API_KEY=your-honeycomb-key
GRAFANA_TEMPO_USERNAME=your-username
GRAFANA_TEMPO_PASSWORD=your-password

# Optional
AGENTFLOW_OTEL_SAMPLING_RATIO=0.1  # Sample 10% of traces
```

---

## Conditional Export

Check initialization state before exporting to avoid errors when OTel is not configured:

```typescript
import { exportGraphToOTel, isOTelInitialized } from 'agentflow-otel';

if (isOTelInitialized()) {
  await exportGraphToOTel(executionGraph);
}
```

---

## Receiving OTel Traces from External Agents

The AgentFlow dashboard also acts as an OTLP-compatible HTTP collector. Any OTel-instrumented agent (LangChain, CrewAI, AutoGen) can push traces directly to it:

```bash
curl -X POST http://localhost:3000/v1/traces \
  -H "Content-Type: application/json" \
  -d '{"resourceSpans": [...]}'
```

AgentFlow maps GenAI semantic conventions (`gen_ai.chat`, `gen_ai.usage.*`) to its execution graph model, so pushed spans gain full process mining support.
