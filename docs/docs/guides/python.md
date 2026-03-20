---
sidebar_position: 4
title: Python
---

# Python Integration

`agentflow-python` lets Python agents emit AgentFlow execution traces without any Python observability dependencies. It uses a subprocess bridge to call AgentFlow core, so the full process mining pipeline is available from Python.

## Requirements

- Python 3.8+
- Node.js 20+ (for AgentFlow core)
- `agentflow-core` installed via npm

## Installation

```bash
pip install agentflow-python
```

---

## Quick Start

```python
from agentflow_python import AgentFlowTracer, traced_execution

tracer = AgentFlowTracer("my-agent")

with traced_execution(tracer, "process_data", data) as trace:
    result = process_data(data)

# Trace is automatically saved to traces/ as a JSON file
```

---

## Context Manager (Recommended)

The `traced_execution` context manager is the most ergonomic way to trace a block of code. It captures success or failure automatically.

```python
from agentflow_python import AgentFlowTracer, traced_execution

tracer = AgentFlowTracer("ml-pipeline")

with traced_execution(tracer, "train_model", training_data) as trace:
    model = train_model(training_data)
    evaluate_model(model, test_data)

# Whether the block succeeded or raised an exception,
# the outcome is recorded in the trace.
```

### Error handling

Failures inside the context manager are captured without re-raising being required:

```python
tracer = AgentFlowTracer("robust-agent")

try:
    with traced_execution(tracer, "risky_operation", data) as trace:
        result = risky_function(data)
except Exception as e:
    print(f"Operation failed: {e}")
    # Failure status and exception details are already in the trace
```

---

## Explicit Trace Call

For cases where a context manager is inconvenient, call `trace_execution` directly:

```python
from agentflow_python import AgentFlowTracer

tracer = AgentFlowTracer("data-processor")

result = tracer.trace_execution("process_batch", data_batch, {
    "batch_size": len(data_batch),
    "processing_mode": "parallel",
})

print(f"Trace saved: {result['trace']['path']}")
print(f"Success: {result['success']}")
```

`trace_execution` returns a dict with keys `success`, `data`, `error`, and `trace`.

---

## Multi-Agent Systems

Each agent in the system gets its own `AgentFlowTracer` instance. The dashboard clusters them automatically.

```python
class AgentOrchestrator:
    def __init__(self):
        self.tracer = AgentFlowTracer("orchestrator")

    def coordinate_agents(self, task):
        with traced_execution(self.tracer, "coordinate", task) as trace:
            results = []
            for agent_type in ["analyzer", "processor", "validator"]:
                agent_tracer = AgentFlowTracer(f"agent-{agent_type}")
                result = agent_tracer.trace_execution("subtask", task)
                results.append(result)
            return self.combine_results(results)
```

---

## Integration Patterns

### Cron jobs

```python
#!/usr/bin/env python3
from agentflow_python import AgentFlowTracer, traced_execution

def main():
    tracer = AgentFlowTracer("scheduled-agent")
    with traced_execution(tracer, "cron_job", {"schedule": "0 */6 * * *"}) as trace:
        process_daily_data()

if __name__ == "__main__":
    main()
```

### Async daemon workers

```python
import asyncio
from agentflow_python import AgentFlowTracer, traced_execution

class AgentDaemon:
    def __init__(self):
        self.tracer = AgentFlowTracer("daemon-worker")

    async def run_forever(self):
        while True:
            with traced_execution(self.tracer, "daemon_cycle", {}) as trace:
                await self.process_work_queue()
            await asyncio.sleep(30)

asyncio.run(AgentDaemon().run_forever())
```

### AI agent class

```python
class MyAIAgent:
    def __init__(self):
        self.tracer = AgentFlowTracer("my-ai-agent")

    def process_user_request(self, user_input):
        with traced_execution(self.tracer, "handle_request", user_input) as trace:
            intent = self.parse_intent(user_input)
            return self.generate_response(intent)

    def scheduled_task(self, task_data):
        return self.tracer.trace_execution("scheduled_task", task_data, {
            "trigger": "cron",
            "task_type": task_data.get("type"),
        })
```

---

## Configuration

### Auto-detection

`AgentFlowTracer` looks for the AgentFlow installation in these locations, in order:

1. Current working directory
2. `~/.agentflow/`
3. `/opt/agentflow/`
4. Relative to the Python package location

### Manual path

```python
tracer = AgentFlowTracer(
    agent_id="my-agent",
    workspace_dir="/path/to/agentflow",
)
```

---

## Trace Output

Traces are saved as JSON files in the `traces/` directory:

```json
{
  "agentId": "my-agent",
  "trigger": "python_agent",
  "name": "my-agent process_data execution",
  "timestamp": 1234567890,
  "nodes": [...],
  "rootId": "node_1"
}
```

These files are picked up automatically by the dashboard and by `agentflow-storage`.

---

## API Reference

### `AgentFlowTracer(agent_id, workspace_dir=None)`

| Parameter | Type | Description |
|-----------|------|-------------|
| `agent_id` | `str` | Unique identifier for this agent |
| `workspace_dir` | `str` (optional) | Path to AgentFlow installation |

### `trace_execution(action, data, metadata=None, timeout=60)`

| Parameter | Type | Description |
|-----------|------|-------------|
| `action` | `str` | Name of the action being traced |
| `data` | `Any` | Data being processed |
| `metadata` | `dict` (optional) | Additional trace metadata |
| `timeout` | `int` | Timeout in seconds (default: 60) |

Returns a dict: `{ success, data, error, trace }`.

### `traced_execution(tracer, action, data, metadata=None)`

Context manager. Equivalent to wrapping a `trace_execution` call around a `with` block. Automatically records success or failure.

### `quick_trace(agent_id, action, data)`

One-line convenience function for simple cases with no configuration.

---

## Troubleshooting

### Node.js not found

```bash
# Install Node.js 20+ via nvm
nvm install 20 && nvm use 20

# Or via package manager
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### Trace files not created

- Confirm the `traces/` directory exists and is writable
- Check that `agentflow-core` is installed: `npm list -g agentflow-core`
- Verify Node.js is on `PATH`: `node --version`
