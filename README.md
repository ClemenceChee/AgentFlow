# AgentFlow

**Universal execution tracing and monitoring for AI agent systems.**

AgentFlow is a comprehensive monitoring platform that captures, stores, and analyzes the full execution graphs of AI agent systems. Monitor single agents or entire multi-agent ecosystems with real-time dashboards, persistent analytics, and cross-language support.

## 🚀 Platform Overview

AgentFlow consists of four integrated packages:

- **🔧 [Core Library](#core-library)** — Zero-dependency graph builder and query engine
- **🐍 [Python Integration](#python-integration)** — Seamless Python ↔ JavaScript agent monitoring
- **📊 [Real-time Dashboard](#dashboard)** — Beautiful web interface with live monitoring
- **🗃️ [Analytics & Storage](#analytics--storage)** — SQLite-powered storage with rich querying

## ✨ What Makes AgentFlow Different

- **Framework-agnostic** — Works with LangChain, CrewAI, Mastra, or custom agent systems
- **Multi-language support** — Monitor Python and JavaScript agents in unified interface
- **Real-time monitoring** — Live dashboard updates as your agents execute
- **Rich analytics** — Health scoring, anomaly detection, trend analysis, failure patterns
- **Production-ready** — Docker support, CLI tools, comprehensive documentation
- **Zero lock-in** — Export your data anytime, run entirely self-hosted

## 🏃‍♂️ Quick Start

### 1. **Installation**

```bash
# Core + Dashboard + Storage
npm install agentflow-core agentflow-dashboard agentflow-storage

# Python integration
pip install agentflow-python
```

### 2. **Start Monitoring**

```bash
# Start the monitoring stack
agentflow-query ingest --traces ./traces &
agentflow-dashboard --traces ./traces --port 3000

# Open http://localhost:3000 for real-time dashboard
```

### 3. **Instrument Your Agents**

**Python agents:**
```python
from agentflow_python import AgentFlowTracer, traced_execution

tracer = AgentFlowTracer("my-ai-agent")

with traced_execution(tracer, "process_request", user_data) as trace:
    # Your agent logic
    result = analyze_data(user_data)
    response = generate_response(result)

# Execution automatically traced and saved
```

**JavaScript/Node.js agents:**
```typescript
import { createGraphBuilder, getStats } from 'agentflow-core';

const builder = createGraphBuilder({
  agentId: 'my-agent',
  trigger: 'api-request'
});

const root = builder.startNode({ type: 'agent', name: 'main' });
// ... build your execution graph
const graph = builder.build();

// Query and analyze
const stats = getStats(graph);
```

## 🔧 Core Library

The foundation of AgentFlow — a zero-dependency TypeScript library for building queryable execution graphs.

### Features

- **Zero dependencies** — Core package has no runtime dependencies
- **Queryable graphs** — Find failures, hung nodes, critical paths, performance bottlenecks
- **Immutable output** — `build()` returns a deeply frozen execution graph
- **Snapshot support** — Inspect graphs mid-flight without finalizing
- **TypeScript-first** — Strict types, full IntelliSense, no `any`

### Basic Usage

```typescript
import { createGraphBuilder, getStats, getFailures } from 'agentflow-core';

// Create builder
const builder = createGraphBuilder({
  agentId: 'portfolio-agent',
  trigger: 'user-request',
});

// Build execution graph
const root = builder.startNode({ type: 'agent', name: 'main' });

const search = builder.startNode({
  type: 'tool',
  name: 'web-search',
  parentId: root
});
builder.endNode(search);

const analysis = builder.startNode({
  type: 'tool',
  name: 'analysis',
  parentId: root
});
builder.endNode(analysis);

builder.endNode(root);

// Query and analyze
const graph = builder.build();
const stats = getStats(graph);
const failures = getFailures(graph);

console.log(`Executed ${stats.totalNodes} nodes in ${stats.duration}ms`);
console.log(`Failures: ${failures.length}`);
```

### Core API Reference

| Function | Description |
|----------|-------------|
| `createGraphBuilder(config)` | Create new graph builder |
| `builder.startNode(options)` | Start execution node |
| `builder.endNode(nodeId)` | Mark node completed |
| `builder.failNode(nodeId, error)` | Mark node failed |
| `builder.build()` | Finalize frozen graph |
| `getStats(graph)` | Get execution statistics |
| `getFailures(graph)` | Get all failed nodes |
| `getHungNodes(graph)` | Get incomplete nodes |
| `getCriticalPath(graph)` | Get longest execution path |

[**📖 Complete Core API Documentation**](packages/core/README.md)

## 🐍 Python Integration

Zero-dependency Python package for monitoring Python-based AI agents.

### Features

- **Zero Python dependencies** — Uses subprocess to call AgentFlow core
- **Auto-discovery** — Automatically finds AgentFlow installation
- **Context managers** — Clean integration with `traced_execution`
- **Full compatibility** — Works with all AgentFlow query functions
- **Error handling** — Traces both successful and failed executions

### Python Usage

```python
from agentflow_python import AgentFlowTracer, traced_execution

# Initialize tracer
tracer = AgentFlowTracer("data-processor")

# Trace individual executions
result = tracer.trace_execution("analyze_data", dataset, {
    "model": "gpt-4",
    "batch_size": 1000
})

# Context manager (recommended)
with traced_execution(tracer, "train_model", training_data) as trace:
    model = train_model(training_data)
    metrics = evaluate_model(model, test_data)

# Integration with AI frameworks
class MyAIAgent:
    def __init__(self):
        self.tracer = AgentFlowTracer("my-ai-agent")

    def process_request(self, user_input):
        with traced_execution(self.tracer, "handle_request", user_input):
            intent = self.parse_intent(user_input)
            context = self.retrieve_context(intent)
            response = self.generate_response(intent, context)
            return response
```

### Installation & Setup

```bash
pip install agentflow-python
```

The Python package automatically detects your AgentFlow installation and requires Node.js 18+ to be available.

[**📖 Complete Python Documentation**](packages/python/README.md)

## 📊 Dashboard

Real-time web interface for monitoring agent executions with live updates and performance insights.

### Features

- **Real-time updates** — WebSocket-powered live monitoring
- **Agent performance metrics** — Success rates, execution times, health scores
- **Interactive visualization** — Execution graphs and performance charts
- **Multi-agent overview** — Monitor entire agent ecosystems
- **Responsive design** — Works on desktop and mobile
- **REST API** — Integrate with external systems

### Dashboard Usage

```bash
# Start dashboard
npx agentflow-dashboard --port 3000 --traces ./agent-traces

# Custom configuration
agentflow-dashboard \
  --port 8080 \
  --traces /var/log/agents \
  --host 0.0.0.0 \
  --cors

# Open http://localhost:3000
```

### Dashboard Features

- 📈 **Real-time metrics** — Live execution counts, success rates, performance trends
- 🎯 **Agent health scoring** — Automated health assessment based on performance patterns
- 📊 **Interactive graphs** — Visual execution flow and dependency tracking
- 🔍 **Filtering & search** — Find specific executions, agents, or time periods
- 📱 **Mobile responsive** — Monitor from anywhere
- 🔗 **API access** — REST endpoints for custom integrations

[**📖 Complete Dashboard Documentation**](packages/dashboard/README.md)

## 🗃️ Analytics & Storage

SQLite-powered persistent storage with advanced analytics, querying, and insights.

### Features

- **Automatic ingestion** — Watch trace directories and ingest files automatically
- **Rich querying** — Filter by agent, time, success/failure, performance metrics
- **Advanced analytics** — Health scoring, anomaly detection, trend analysis
- **Failure pattern analysis** — Identify common failure modes and optimization opportunities
- **Data export** — Export to JSON/CSV for external analysis
- **CLI tools** — Command-line interface for operations and analysis

### Storage Usage

```bash
# Start live ingestion
agentflow-query ingest --traces ./agent-traces

# Query executions
agentflow-query query --agent my-agent --days 7 --limit 100

# Analyze agent health
agentflow-query analyze --type health --agent my-agent

# Export data
agentflow-query export --format csv --agent my-agent --output data.csv

# Performance analysis
agentflow-query analyze --type performance --days 30
```

### Programmatic API

```typescript
import { AgentFlowStorage } from 'agentflow-storage';

const storage = new AgentFlowStorage({
  dbPath: './agentflow.db',
  tracesDir: './traces',
  autoIngest: true
});

// Query executions
const recent = storage.getExecutions({
  since: Date.now() - 24 * 60 * 60 * 1000,
  success: true,
  limit: 100
});

// Advanced analytics
const analytics = storage.getAnalytics();
const healthScore = analytics.getHealthScore('my-agent');
const anomalies = analytics.detectAnomalies('my-agent', 30);
const trends = analytics.getTrends('my-agent', 30);
```

[**📖 Complete Storage Documentation**](packages/storage/README.md)

## 🚀 Production Deployment

### Docker Compose Setup

```yaml
version: '3.8'
services:
  agentflow-storage:
    image: node:18-alpine
    command: >
      sh -c "npm install -g agentflow-storage &&
             agentflow-query ingest --traces /traces --db /data/agentflow.db"
    volumes:
      - ./traces:/traces
      - ./data:/data
    restart: unless-stopped

  agentflow-dashboard:
    image: node:18-alpine
    command: >
      sh -c "npm install -g agentflow-dashboard &&
             agentflow-dashboard --traces /traces --port 3000 --host 0.0.0.0"
    ports:
      - "3000:3000"
    volumes:
      - ./traces:/traces
    depends_on:
      - agentflow-storage
```

### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: agentflow-dashboard
spec:
  replicas: 2
  selector:
    matchLabels:
      app: agentflow-dashboard
  template:
    metadata:
      labels:
        app: agentflow-dashboard
    spec:
      containers:
      - name: dashboard
        image: node:18-alpine
        ports:
        - containerPort: 3000
        command:
        - sh
        - -c
        - "npm install -g agentflow-dashboard && agentflow-dashboard --host 0.0.0.0"
        volumeMounts:
        - name: traces
          mountPath: /traces
      volumes:
      - name: traces
        persistentVolumeClaim:
          claimName: agentflow-traces
```

## 📚 Examples & Use Cases

### AI Chat Agent Monitoring

```python
from agentflow_python import AgentFlowTracer

class ChatAgent:
    def __init__(self):
        self.tracer = AgentFlowTracer("chat-agent")

    def handle_message(self, message):
        with traced_execution(self.tracer, "process_message", message) as trace:
            intent = self.classify_intent(message)
            context = self.retrieve_context(intent)
            response = self.generate_response(intent, context)
            return response
```

### Multi-Agent Workflow

```typescript
// Coordinator agent
const coordinator = createGraphBuilder({ agentId: 'coordinator', trigger: 'workflow' });
const root = coordinator.startNode({ type: 'agent', name: 'coordinator' });

// Spawn sub-agents
const analyst = coordinator.startNode({ type: 'subagent', name: 'analyst', parentId: root });
const researcher = coordinator.startNode({ type: 'subagent', name: 'researcher', parentId: root });

// Each sub-agent creates their own traces
// AgentFlow automatically correlates the execution hierarchy
```

### Scheduled Agent Monitoring

```bash
#!/bin/bash
# scheduled_agent.sh - Cron job wrapper

# Start trace ingestion if not running
pgrep -f "agentflow-query ingest" || agentflow-query ingest --traces ./traces &

# Run your agent with tracing
python my_scheduled_agent.py

# Generate daily report
agentflow-query analyze --type trends --days 1 > daily_report.txt
```

## 🔧 Architecture

AgentFlow is designed as a modular monitoring platform:

```
agentflow/
├── packages/
│   ├── core/           # Zero-dep core: graph builder & query engine
│   ├── python/         # Python integration package
│   ├── dashboard/      # Real-time web monitoring interface
│   └── storage/        # SQLite storage & analytics engine
├── examples/           # Usage examples and tutorials
├── tests/             # Comprehensive test suite
└── docs/              # Architecture and design documentation
```

### Design Principles

- **Zero lock-in** — All data exportable, fully self-hosted
- **Language agnostic** — Support any language via subprocess bridges
- **Real-time capable** — Built for live monitoring and alerts
- **Production ready** — Designed for enterprise agent systems
- **Developer friendly** — Rich APIs, CLI tools, comprehensive docs

## 🤝 Contributing

We welcome contributions! AgentFlow is designed to be extensible and community-driven.

### Development Setup

```bash
# Clone repository
git clone https://github.com/ClemenceChee/AgentFlow.git
cd AgentFlow

# Install dependencies
npm install

# Run tests
npm test

# Build all packages
npm run build

# Start development dashboard
npm run dev --workspace=agentflow-dashboard
```

### Package Structure

- **Core** (`packages/core/`) — TypeScript, zero dependencies, extensive tests
- **Python** (`packages/python/`) — Python package with subprocess bridge
- **Dashboard** (`packages/dashboard/`) — React/TypeScript web interface
- **Storage** (`packages/storage/`) — Node.js with SQLite, CLI tools

## 📋 Roadmap

### Version 0.3.0 (Next)
- [ ] LangChain adapter package
- [ ] CrewAI integration
- [ ] Advanced visualization components
- [ ] Alerting and notification system

### Version 0.4.0 (Future)
- [ ] Distributed tracing across multiple machines
- [ ] Integration with observability platforms (Datadog, Grafana)
- [ ] AI-powered performance optimization suggestions
- [ ] Visual agent workflow designer

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

---

**Ready to monitor your AI agents?**

```bash
npm install agentflow-core agentflow-dashboard agentflow-storage
pip install agentflow-python
```

Start building more reliable, observable AI systems today! 🚀