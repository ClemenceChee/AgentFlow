#!/usr/bin/env python3
"""
AgentFlow Python Integration
Official Python package for AgentFlow - Universal execution tracing for AI agent systems

Usage:
    from agentflow_python import AgentFlowTracer, traced_execution

    tracer = AgentFlowTracer("my-agent")
    with traced_execution(tracer, "process_task", data) as trace:
        # Your agent logic here
        result = process_data(data)

    # Trace automatically saved with results
"""

import json
import subprocess
import tempfile
import os
import sys
from pathlib import Path
from typing import Dict, List, Any, Optional, Union
from contextlib import contextmanager
import logging

# Configure logging
logging.basicConfig(level=logging.WARNING)
logger = logging.getLogger(__name__)

class AgentFlowTracer:
    """Python interface to AgentFlow execution tracing"""

    def __init__(self, agent_id: str, workspace_dir: Optional[str] = None):
        """
        Initialize AgentFlow tracer for Python agents

        Args:
            agent_id: Unique identifier for this agent
            workspace_dir: Optional workspace directory (auto-detected if not provided)
        """
        self.agent_id = agent_id
        self.workspace_dir = workspace_dir or self._detect_workspace()
        self.wrapper_script = self._find_agentflow_wrapper()
        self.trace_id = os.environ.get('AGENTFLOW_TRACE_ID')
        self.parent_span_id = os.environ.get('AGENTFLOW_PARENT_SPAN_ID')
        self.span_id = None  # Set after first trace execution

    def _detect_workspace(self) -> str:
        """Auto-detect workspace directory containing AgentFlow"""
        # Check common locations for AgentFlow
        common_paths = [
            os.getcwd(),
            os.path.expanduser("~/.agentflow"),
            "/opt/agentflow",
            str(Path(__file__).parent.parent.parent)  # Go up from packages/python/
        ]

        for path in common_paths:
            agentflow_path = Path(path)
            if (agentflow_path / "packages" / "core" / "dist").exists():
                return str(agentflow_path)

        # Default to current directory
        return os.getcwd()

    def _find_agentflow_wrapper(self) -> str:
        """Find the AgentFlow JavaScript wrapper"""
        # Look for the wrapper script
        possible_locations = [
            Path(self.workspace_dir) / "packages" / "python" / "src" / "wrapper.js",
            Path(self.workspace_dir) / "wrapper.js",
            Path(__file__).parent / "src" / "wrapper.js"
        ]

        for location in possible_locations:
            if location.exists():
                return str(location)

        # Create wrapper if it doesn't exist
        return self._create_wrapper()

    def _create_wrapper(self) -> str:
        """Create the JavaScript wrapper for Python calls"""
        wrapper_content = '''#!/usr/bin/env node
/**
 * AgentFlow Python Wrapper - Bridge between Python and AgentFlow core
 * Usage: node wrapper.js <input.json> [agent-id]
 */

import { createGraphBuilder, getStats, getFailures, getHungNodes } from '../core/dist/index.js';
import fs from 'fs';
import path from 'path';

async function main() {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.error('Usage: node wrapper.js <input.json> [agent-id]');
        process.exit(1);
    }

    const inputFile = args[0];
    const agentId = args[1] || 'python-agent';

    try {
        const inputData = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
        const result = await executeTracing(inputData, agentId);

        // Output result as JSON for Python to parse
        console.log(JSON.stringify(result, null, 2));
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

async function executeTracing(inputData, agentId) {
    const { action, data, metadata = {} } = inputData;

    const builder = createGraphBuilder({
        agentId,
        trigger: metadata.trigger || 'python_agent',
        name: `${agentId} ${action} execution`,
        traceId: metadata.traceId || undefined,
        parentSpanId: metadata.parentSpanId || undefined,
    });

    // Root node
    const root = builder.startNode({
        type: 'agent',
        name: agentId,
        metadata: {
            action,
            timestamp: new Date().toISOString(),
            python_pid: metadata.python_pid,
            ...metadata
        }
    });

    // Process based on action type
    let result = { success: false, data: null, error: null };

    try {
        // Generic processing node
        const processNode = builder.startNode({
            type: 'tool',
            name: action,
            parentId: root,
            metadata: {
                data_size: JSON.stringify(data).length,
                action_type: action
            }
        });

        // Simulate processing (in real usage, this would be the actual work)
        builder.endNode(processNode);
        result = { success: true, data: data };

        builder.endNode(root);
    } catch (error) {
        builder.failNode(root, error.message);
        result = { success: false, error: error.message };
    }

    // Build and save execution graph
    const graph = builder.build();
    const tracePath = saveTrace(graph, agentId);

    return {
        ...result,
        traceId: graph.traceId,
        spanId: graph.spanId,
        trace: {
            path: tracePath,
            stats: getStats(graph),
            failures: getFailures(graph),
            hungNodes: getHungNodes(graph)
        }
    };
}

function saveTrace(graph, agentId) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${agentId}-${timestamp}.json`;
    const tracesDir = path.join(process.cwd(), 'traces');

    // Ensure traces directory exists
    if (!fs.existsSync(tracesDir)) {
        fs.mkdirSync(tracesDir, { recursive: true });
    }

    const filepath = path.join(tracesDir, filename);

    // Convert ReadonlyMap to regular object for serialization
    const serialized = {
        agentId: graph.agentId,
        trigger: graph.trigger,
        name: graph.name,
        timestamp: graph.timestamp || Date.now(),
        nodes: graph.nodes instanceof Map ? Array.from(graph.nodes.entries()) : graph.nodes,
        rootId: graph.rootId,
        traceId: graph.traceId,
        spanId: graph.spanId,
        parentSpanId: graph.parentSpanId,
        metadata: graph.metadata || {}
    };

    fs.writeFileSync(filepath, JSON.stringify(serialized, null, 2));
    return filepath;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}
'''

        wrapper_dir = Path(self.workspace_dir) / "packages" / "python" / "src"
        wrapper_dir.mkdir(parents=True, exist_ok=True)
        wrapper_path = wrapper_dir / "wrapper.js"

        with open(wrapper_path, 'w') as f:
            f.write(wrapper_content)

        return str(wrapper_path)

    def trace_execution(
        self,
        action: str,
        data: Any,
        metadata: Optional[Dict] = None,
        timeout: int = 60
    ) -> Dict:
        """
        Trace an agent execution with AgentFlow

        Args:
            action: Type of action (e.g., 'process_emails', 'analyze_data')
            data: The data being processed
            metadata: Additional metadata for tracing
            timeout: Timeout for the tracing process

        Returns:
            Dict with execution results and trace information
        """
        if metadata is None:
            metadata = {}

        # Prepare input data
        trace_context = {}
        if self.trace_id:
            trace_context["traceId"] = self.trace_id
        if self.parent_span_id:
            trace_context["parentSpanId"] = self.parent_span_id

        input_data = {
            "action": action,
            "data": data,
            "metadata": {
                "trigger": "python_agent",
                "python_pid": os.getpid(),
                **trace_context,
                **metadata
            }
        }

        # Write input to temporary file
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            json.dump(input_data, f, indent=2)
            input_file = f.name

        try:
            # Execute AgentFlow wrapper
            result = subprocess.run([
                'node',
                self.wrapper_script,
                input_file,
                self.agent_id
            ], capture_output=True, text=True, timeout=timeout)

            if result.returncode != 0:
                logger.error(f"AgentFlow tracing failed: {result.stderr}")
                raise Exception(f"AgentFlow tracing failed: {result.stderr}")

            result_data = json.loads(result.stdout)
            if 'spanId' in result_data:
                self.span_id = result_data['spanId']
            if 'traceId' in result_data:
                self.trace_id = result_data['traceId']
            return result_data

        except subprocess.TimeoutExpired:
            logger.error(f"AgentFlow tracing timed out after {timeout}s")
            raise Exception(f"AgentFlow tracing timed out after {timeout}s")
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse AgentFlow output: {e}")
            raise Exception(f"Failed to parse AgentFlow output: {e}")
        finally:
            # Clean up temporary file
            try:
                os.unlink(input_file)
            except OSError:
                pass

    def get_child_env(self) -> Dict[str, str]:
        """Get environment variables to propagate trace context to child processes."""
        env = dict(os.environ)
        if self.trace_id:
            env['AGENTFLOW_TRACE_ID'] = self.trace_id
        if self.span_id:
            env['AGENTFLOW_PARENT_SPAN_ID'] = self.span_id
        return env

    def spawn_traced(self, cmd, **kwargs):
        """Spawn a child process with trace context automatically propagated.

        Usage:
            result = tracer.spawn_traced(['python3', 'child_agent.py'])
        """
        child_env = self.get_child_env()
        return subprocess.run(cmd, env=child_env, **kwargs)

    def trace_task(self, task_name: str, data: Any, metadata: Optional[Dict] = None) -> Dict:
        """Trace a generic task execution"""
        return self.trace_execution(task_name, data, metadata)

    def trace_data_processing(self, data: Any, metadata: Optional[Dict] = None) -> Dict:
        """Trace data processing specifically"""
        return self.trace_execution("process_data", data, metadata)

    def trace_analysis(self, config: Dict, metadata: Optional[Dict] = None) -> Dict:
        """Trace analysis execution"""
        return self.trace_execution("run_analysis", config, metadata)


# Context manager for easy tracing
@contextmanager
def traced_execution(tracer: AgentFlowTracer, action: str, data: Any, metadata: Optional[Dict] = None):
    """
    Context manager for automatic execution tracing

    Usage:
        with traced_execution(tracer, "process_data", data) as trace:
            # Your code here
            result = process_data(data)
    """
    trace_result = None
    exception_occurred = None

    try:
        yield None  # Enter the context
    except Exception as e:
        exception_occurred = e
        raise
    finally:
        # Trace the execution regardless of success/failure
        final_metadata = metadata or {}
        if exception_occurred:
            final_metadata.update({
                "status": "failed",
                "error": str(exception_occurred),
                "error_type": type(exception_occurred).__name__
            })
        else:
            final_metadata.update({"status": "success"})

        try:
            trace_result = tracer.trace_execution(action, data, final_metadata)
            # Store result for access after context exit
            if hasattr(traced_execution, '_current_result'):
                traced_execution._current_result = trace_result
        except Exception as trace_error:
            logger.error(f"Failed to trace execution: {trace_error}")


# Convenience functions
def quick_trace(agent_id: str, action: str, data: Any) -> Dict:
    """Quick one-line tracing for simple cases"""
    tracer = AgentFlowTracer(agent_id)
    return tracer.trace_execution(action, data)


# Example usage
if __name__ == "__main__":
    print("AgentFlow Python Integration")
    print("=" * 40)

    # Example 1: Basic tracing
    tracer = AgentFlowTracer("example-agent")

    test_data = [
        {"id": 1, "content": "Process this data"},
        {"id": 2, "content": "Analyze this information"}
    ]

    result = tracer.trace_data_processing(test_data, {
        "processing_type": "batch",
        "item_count": len(test_data)
    })

    print(f"Trace result: {result['trace']['path']}")
    print(f"Stats: {result['trace']['stats']}")

    # Example 2: Context manager usage
    print("\\nTesting context manager...")

    with traced_execution(tracer, "example_task", {"test": True}) as trace:
        # Simulate some work
        import time
        time.sleep(0.1)
        print("Work completed inside trace context")

    print("Context manager tracing complete!")