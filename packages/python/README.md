# AgentFlow Python Integration

Official Python package for [AgentFlow](https://github.com/ClemenceChee/AgentFlow) - Universal execution tracing for AI agent systems.

## Quick Start

```python
from agentflow_python import AgentFlowTracer, traced_execution

# Initialize tracer
tracer = AgentFlowTracer("my-agent")

# Trace execution
with traced_execution(tracer, "process_data", data) as trace:
    # Your agent logic here
    result = process_data(data)

# Trace automatically saved with execution graph
```

## Installation

```bash
pip install agentflow-python
```

**Requirements:**
- Python 3.8+
- Node.js 20+ (for AgentFlow core)

## Features

- **Zero Python dependencies** - Uses subprocess to call AgentFlow core
- **Automatic tracing** - Context managers for seamless integration
- **Full compatibility** - Works with all AgentFlow query functions
- **Error handling** - Traces both successful and failed executions
- **Rich metadata** - Capture custom data about your agent executions

## Usage Examples

### Basic Tracing

```python
from agentflow_python import AgentFlowTracer

tracer = AgentFlowTracer("data-processor")

# Trace any function
result = tracer.trace_execution("process_batch", data_batch, {
    "batch_size": len(data_batch),
    "processing_mode": "parallel"
})

print(f"Trace saved: {result['trace']['path']}")
print(f"Success rate: {result['success']}")
print(f"Stats: {result['trace']['stats']}")
```

### Context Manager (Recommended)

```python
from agentflow_python import traced_execution

tracer = AgentFlowTracer("ml-pipeline")

with traced_execution(tracer, "train_model", training_data) as trace:
    # Your ML training code
    model = train_model(training_data)
    evaluate_model(model, test_data)

# Execution automatically traced with success/failure status
```

### AI Agent Integration

```python
class MyAIAgent:
    def __init__(self):
        self.tracer = AgentFlowTracer("my-ai-agent")

    def process_user_request(self, user_input):
        with traced_execution(self.tracer, "handle_request", user_input) as trace:
            # Parse user intent
            intent = self.parse_intent(user_input)

            # Generate response
            response = self.generate_response(intent)

            return response

    def scheduled_task(self, task_data):
        result = self.tracer.trace_execution("scheduled_task", task_data, {
            "trigger": "cron",
            "task_type": task_data.get("type")
        })
        return result
```

### Multi-Step Workflow

```python
tracer = AgentFlowTracer("data-pipeline")

# Step 1: Data ingestion
ingest_result = tracer.trace_execution("ingest_data", sources, {
    "source_count": len(sources)
})

# Step 2: Data processing
with traced_execution(tracer, "process_data", raw_data) as trace:
    cleaned_data = clean_data(raw_data)
    validated_data = validate_data(cleaned_data)

# Step 3: Analysis
analysis_result = tracer.trace_analysis({
    "data_size": len(validated_data),
    "analysis_type": "statistical"
})
```

### Error Handling

```python
tracer = AgentFlowTracer("robust-agent")

try:
    with traced_execution(tracer, "risky_operation", data) as trace:
        # Code that might fail
        result = risky_function(data)
except Exception as e:
    print(f"Operation failed: {e}")
    # Failure automatically captured in trace
```

## Configuration

### Auto-detection

AgentFlow Python automatically detects your AgentFlow installation in these locations:
- Current working directory
- `~/.agentflow/`
- `/opt/agentflow/`
- Relative to the Python package location

### Manual Configuration

```python
tracer = AgentFlowTracer(
    agent_id="my-agent",
    workspace_dir="/path/to/agentflow"  # Custom AgentFlow location
)
```

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

### Query Traces

Use AgentFlow's JavaScript query functions to analyze traces:

```javascript
import { getStats, getFailures } from 'agentflow';

const graph = JSON.parse(fs.readFileSync('traces/my-agent-*.json'));
const stats = getStats(graph);
const failures = getFailures(graph);
```

## Integration Patterns

### Cron Jobs

```python
#!/usr/bin/env python3
# scheduled_agent.py

from agentflow_python import AgentFlowTracer

def main():
    tracer = AgentFlowTracer("scheduled-agent")

    with traced_execution(tracer, "cron_job", {"schedule": "0 */6 * * *"}) as trace:
        # Your scheduled work here
        process_daily_data()

if __name__ == "__main__":
    main()
```

### Daemon Workers

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
                await asyncio.sleep(30)  # Wait 30 seconds

asyncio.run(AgentDaemon().run_forever())
```

### Multi-Agent Systems

```python
class AgentOrchestrator:
    def __init__(self):
        self.tracer = AgentFlowTracer("orchestrator")

    def coordinate_agents(self, task):
        with traced_execution(self.tracer, "coordinate", task) as trace:
            # Spawn multiple agents
            results = []
            for agent_type in ["analyzer", "processor", "validator"]:
                agent_tracer = AgentFlowTracer(f"agent-{agent_type}")
                result = agent_tracer.trace_execution("subtask", task)
                results.append(result)

            return self.combine_results(results)
```

## Troubleshooting

### Node.js Not Found

```bash
# Install Node.js 20+
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Or use nvm
nvm install 20
nvm use 20
```

### AgentFlow Not Found

```python
# Check if AgentFlow is installed
import subprocess
result = subprocess.run(['node', '-e', 'console.log(require("agentflow"))'],
                       capture_output=True, text=True)
if result.returncode != 0:
    print("AgentFlow not installed - run: npm install agentflow")
```

### Trace Files Not Created

- Check write permissions on the working directory
- Ensure `traces/` directory exists or can be created
- Verify Node.js process has sufficient resources

## API Reference

### `AgentFlowTracer(agent_id, workspace_dir=None)`

Main tracer class for Python agents.

**Parameters:**
- `agent_id` (str): Unique identifier for this agent
- `workspace_dir` (str, optional): Path to AgentFlow installation

### `trace_execution(action, data, metadata=None, timeout=60)`

Trace a single execution.

**Parameters:**
- `action` (str): Name of the action being traced
- `data` (Any): Data being processed
- `metadata` (dict, optional): Additional trace metadata
- `timeout` (int): Timeout in seconds

**Returns:**
- Dict with `success`, `data`, `error`, and `trace` keys

### `traced_execution(tracer, action, data, metadata=None)`

Context manager for automatic tracing.

**Usage:**
```python
with traced_execution(tracer, "action", data) as trace:
    # Code to trace
    pass
```

### `quick_trace(agent_id, action, data)`

One-line tracing for simple cases.

## License

MIT - See [LICENSE](../../LICENSE) for details.

## Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for guidelines.