# AgentFlow OpenTelemetry Integration

Export AgentFlow execution graphs to OpenTelemetry-compatible backends following GenAI semantic conventions. Integrate with enterprise observability stacks like Datadog, Grafana, Jaeger, and Honeycomb.

## Features

- **GenAI Semantic Conventions** — Follows OpenTelemetry GenAI standards for LLM operations
- **Enterprise Integration** — Works with Datadog, Grafana Tempo, Honeycomb, Jaeger
- **Runtime Safety Telemetry** — Export guard violations and agent safety events
- **Zero-Config Presets** — Pre-configured setups for popular backends
- **Automatic Watching** — Monitor trace directories and export in real-time
- **Cost Tracking** — Token usage and API costs in OTel metrics

## Quick Start

```bash
npm install agentflow-otel
```

### Basic Usage with Jaeger (Local Development)

```typescript
import { setupAgentFlowOTel, exportGraphToOTel } from 'agentflow-otel';
import { createGraphBuilder } from 'agentflow-core';

// Initialize OTel with Jaeger
await setupAgentFlowOTel({
  serviceName: 'my-agent-system',
  backend: 'jaeger'
});

// Create and export a trace
const builder = createGraphBuilder({ agentId: 'portfolio-analyzer' });
const root = builder.startNode({ type: 'agent', name: 'main' });
// ... build your execution graph
const graph = builder.build();

// Export to OpenTelemetry
await exportGraphToOTel(graph);
```

## Enterprise Backends

### Datadog APM

```typescript
await setupAgentFlowOTel({
  serviceName: 'production-agents',
  backend: 'datadog',
  headers: { 'DD-API-KEY': process.env.DATADOG_API_KEY }
});
```

### Grafana Tempo

```typescript
await setupAgentFlowOTel({
  serviceName: 'agent-fleet',
  backend: 'grafana',
  headers: {
    username: process.env.GRAFANA_TEMPO_USERNAME,
    password: process.env.GRAFANA_TEMPO_PASSWORD
  }
});
```

### Honeycomb

```typescript
await setupAgentFlowOTel({
  serviceName: 'ai-workflows',
  backend: 'honeycomb',
  headers: {
    'x-honeycomb-team': process.env.HONEYCOMB_API_KEY,
    'x-honeycomb-dataset': 'agent-traces'
  }
});
```

## Automatic File Watching

Monitor trace directories and export new graphs automatically:

```typescript
import { createOTelWatcher, setupAgentFlowOTel } from 'agentflow-otel';

// Setup OTel backend
await setupAgentFlowOTel({
  serviceName: 'agent-monitor',
  backend: 'datadog'
});

// Watch for new trace files
const watcher = createOTelWatcher(['./traces', './agent-logs']);
watcher.start();

// Traces are automatically exported as they're created
```

## GenAI Semantic Conventions

AgentFlow OTel exports follow OpenTelemetry GenAI semantic conventions:

### LLM Operations
```typescript
// AgentFlow tool call with LLM metadata
{
  type: 'tool',
  name: 'gpt-analysis',
  metadata: {
    model: 'gpt-4',
    provider: 'openai',
    usage: { input_tokens: 150, output_tokens: 75 }
  }
}

// Exported as OTel span
{
  name: 'llm.generation',
  attributes: {
    'llm.vendor': 'openai',
    'llm.request.model': 'gpt-4',
    'llm.usage.input_tokens': 150,
    'llm.usage.output_tokens': 75
  }
}
```

### Runtime Guard Violations
```typescript
// AgentFlow guard violation
{
  metadata: {
    guard_violations: [{
      type: 'reasoning_loop',
      severity: 'high',
      message: 'Detected 25+ consecutive reasoning steps'
    }]
  }
}

// Exported as OTel span attributes
{
  attributes: {
    'agentflow.guard.violated': true,
    'agentflow.guard.violation.0.type': 'reasoning_loop',
    'agentflow.guard.violation.0.severity': 'high'
  }
}
```

## Preset Configurations

Use convenient presets for common backends:

```typescript
import { OTelPresets, setupAgentFlowOTel } from 'agentflow-otel';

// Jaeger (local development)
await setupAgentFlowOTel(OTelPresets.jaeger());

// Datadog with API key
await setupAgentFlowOTel(OTelPresets.datadog('your-api-key'));

// Honeycomb with custom dataset
await setupAgentFlowOTel(OTelPresets.honeycomb('api-key', 'custom-dataset'));

// Generic OTLP endpoint
await setupAgentFlowOTel(OTelPresets.otlp('https://otel.company.com/v1/traces'));
```

## Integration with AgentFlow CLI

Export traces from AgentFlow CLI tools:

```typescript
// Add to your agent code
import { exportGraphToOTel, isOTelInitialized } from 'agentflow-otel';

if (isOTelInitialized()) {
  await exportGraphToOTel(executionGraph);
}
```

Or set up automatic export in your AgentFlow watch configuration:

```bash
# Set environment variable for auto-export
export AGENTFLOW_OTEL_BACKEND=datadog
export AGENTFLOW_OTEL_SERVICE=my-agents

agentflow watch ./data --otel-export
```

## What Gets Exported

### Span Names (Following OTel GenAI Conventions)
- `agent.execution` — Main agent spans
- `agent.subagent` — Subagent executions
- `llm.generation` — LLM API calls
- `llm.embedding` — Embedding operations
- `vectordb.search` — Vector database queries
- `agent.tool` — General tool calls
- `agent.reasoning` — Reasoning steps
- `agent.decision` — Decision points

### Key Attributes
- **Agent Context**: `agentflow.agent.id`, `agentflow.graph.trigger`
- **Node Details**: `agentflow.node.type`, `agentflow.node.name`
- **LLM Metadata**: `llm.vendor`, `llm.request.model`, `llm.usage.*`
- **Guard Violations**: `agentflow.guard.violated`, `agentflow.guard.violation.*`
- **Performance**: `agentflow.duration_ms`, timing information
- **Costs**: `llm.usage.cost.total` for token usage costs

## Environment Variables

Configure OTel export via environment variables:

```bash
# Backend configuration
AGENTFLOW_OTEL_BACKEND=datadog
AGENTFLOW_OTEL_SERVICE=my-agent-system
AGENTFLOW_OTEL_ENDPOINT=https://custom-endpoint.com

# Backend-specific credentials
DD_API_KEY=your-datadog-key
HONEYCOMB_API_KEY=your-honeycomb-key
GRAFANA_TEMPO_USERNAME=your-username
GRAFANA_TEMPO_PASSWORD=your-password

# Optional settings
AGENTFLOW_OTEL_SAMPLING_RATIO=0.1
```

## Enterprise Benefits

### Unified Observability
- **Single Pane of Glass**: Agent traces alongside application metrics
- **Distributed Tracing**: See agent calls in context of larger workflows
- **Cost Monitoring**: Track LLM API costs across agent fleet
- **Performance Analysis**: Identify bottlenecks in agent execution

### Safety & Compliance
- **Guard Violation Alerts**: Get notified of runtime safety issues
- **Audit Trail**: Complete trace of agent decision-making
- **Cost Controls**: Monitor and alert on excessive token usage
- **SLA Monitoring**: Track agent performance against targets

### Integration Examples
- **Datadog**: Agent performance dashboards, cost anomaly detection
- **Grafana**: Custom agent health visualizations, SLA tracking
- **PagerDuty**: Alert on guard violations or agent failures
- **Slack**: Notifications for cost overruns or safety incidents

## License

MIT