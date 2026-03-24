# External Commands API

The External Commands API enables execution and monitoring of pre-configured system commands from the AgentFlow dashboard. This API provides secure, audited execution of external operations like SOMA workers, diagnostic tools, and operational scripts.

## Base URL

```
POST/GET /api/external/commands
```

## Authentication

All external command endpoints require appropriate authentication and authorization. Commands are executed with the permissions of the AgentFlow service account.

---

## Endpoints

### List Available Commands

Get all configured external commands and their current execution status.

#### Request
```http
GET /api/external/commands
```

#### Response
```json
{
  "commands": {
    "soma-harvest": {
      "id": "soma-harvest",
      "name": "SOMA Harvester",
      "description": "Scan inbox and ingest new documents into SOMA vault",
      "category": "SOMA Workers",
      "timeout": 120000,
      "allowConcurrent": false,
      "status": "idle",
      "lastExecution": {
        "timestamp": "2026-03-24T19:20:00Z",
        "status": "completed",
        "exitCode": 0,
        "duration": 45000
      }
    },
    "soma-status": {
      "id": "soma-status",
      "name": "SOMA Status Check",
      "description": "Check SOMA vault health and worker operational status",
      "category": "SOMA Diagnostics",
      "timeout": 30000,
      "allowConcurrent": true,
      "status": "idle",
      "lastExecution": null
    }
  },
  "globalConfig": {
    "maxConcurrentExecutions": 3,
    "currentExecutions": 0,
    "globalTimeout": 300000
  }
}
```

#### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `commands` | Object | Map of command ID to command configuration and status |
| `commands[].id` | String | Unique command identifier |
| `commands[].name` | String | Human-readable display name |
| `commands[].description` | String | Command description and purpose |
| `commands[].category` | String | UI grouping category |
| `commands[].timeout` | Number | Command timeout in milliseconds |
| `commands[].allowConcurrent` | Boolean | Whether multiple instances can run |
| `commands[].status` | Enum | `idle` \| `running` \| `failed` |
| `commands[].lastExecution` | Object | Details of most recent execution |
| `globalConfig.maxConcurrentExecutions` | Number | System-wide execution limit |
| `globalConfig.currentExecutions` | Number | Currently running commands |

---

### Execute Command

Execute a pre-configured external command.

#### Request
```http
POST /api/external/commands/{commandId}/execute
```

#### Path Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `commandId` | String | Yes | Unique identifier for the command to execute |

#### Request Body
```json
{
  "// Optional parameters": "Most commands use pre-configured settings",
  "timeout": 180000,
  "env": {
    "CUSTOM_VAR": "override_value"
  }
}
```

#### Request Body Fields
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `timeout` | Number | No | Override default timeout (up to global max) |
| `env` | Object | No | Additional environment variables |

#### Response (Success)
```json
{
  "executionId": "exec_1234567890abcdef",
  "commandId": "soma-harvest",
  "status": "started",
  "startTime": "2026-03-24T19:20:00.123Z",
  "timeout": 120000,
  "pid": 12345
}
```

#### Response (Already Running)
```json
{
  "error": "Command already running",
  "code": "ALREADY_RUNNING",
  "commandId": "soma-harvest",
  "runningExecutionId": "exec_previous123",
  "message": "soma-harvest is already running and does not allow concurrent execution"
}
```

#### Response Fields (Success)
| Field | Type | Description |
|-------|------|-------------|
| `executionId` | String | Unique execution instance identifier |
| `commandId` | String | The command that was started |
| `status` | String | Always `"started"` for successful requests |
| `startTime` | String | ISO timestamp when execution began |
| `timeout` | Number | Effective timeout in milliseconds |
| `pid` | Number | Process ID of the executing command |

---

### Get Execution Status

Get the current status and details of a command execution.

#### Request
```http
GET /api/external/commands/{commandId}/executions/{executionId}
```

#### Path Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `commandId` | String | Yes | Command identifier |
| `executionId` | String | Yes | Execution instance identifier |

#### Response (Running)
```json
{
  "executionId": "exec_1234567890abcdef",
  "commandId": "soma-harvest",
  "status": "running",
  "startTime": "2026-03-24T19:20:00.123Z",
  "duration": 45000,
  "timeout": 120000,
  "pid": 12345,
  "stdout": "Processing documents...\nFound 15 new items\n",
  "stderr": ""
}
```

#### Response (Completed)
```json
{
  "executionId": "exec_1234567890abcdef",
  "commandId": "soma-harvest",
  "status": "completed",
  "startTime": "2026-03-24T19:20:00.123Z",
  "endTime": "2026-03-24T19:21:30.456Z",
  "duration": 90333,
  "exitCode": 0,
  "stdout": "Processing documents...\nFound 15 new items\nIngested 12 documents\nCompleted successfully\n",
  "stderr": "",
  "resourceUsage": {
    "maxMemoryMB": 64,
    "cpuTimeMs": 12300
  }
}
```

#### Response (Failed)
```json
{
  "executionId": "exec_1234567890abcdef",
  "commandId": "soma-harvest",
  "status": "failed",
  "startTime": "2026-03-24T19:20:00.123Z",
  "endTime": "2026-03-24T19:20:45.789Z",
  "duration": 45666,
  "exitCode": 1,
  "stdout": "Starting harvest process...\n",
  "stderr": "ERROR: Failed to connect to SOMA vault\n",
  "error": "Command failed with exit code 1"
}
```

#### Status Values
| Status | Description |
|--------|-------------|
| `running` | Command is currently executing |
| `completed` | Command finished successfully (exit code 0) |
| `failed` | Command finished with non-zero exit code |
| `timeout` | Command was terminated due to timeout |
| `killed` | Command was manually terminated |

---

### List Recent Executions

Get a list of recent command executions with their status and results.

#### Request
```http
GET /api/external/commands/executions?limit=50&status=completed&commandId=soma-harvest
```

#### Query Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `limit` | Number | No | Maximum number of results (default: 20, max: 100) |
| `status` | String | No | Filter by execution status |
| `commandId` | String | No | Filter by specific command |
| `since` | String | No | ISO timestamp - only executions after this time |

#### Response
```json
{
  "executions": [
    {
      "executionId": "exec_latest123",
      "commandId": "soma-harvest",
      "status": "completed",
      "startTime": "2026-03-24T19:20:00.123Z",
      "endTime": "2026-03-24T19:21:30.456Z",
      "duration": 90333,
      "exitCode": 0
    },
    {
      "executionId": "exec_previous456",
      "commandId": "soma-status",
      "status": "completed",
      "startTime": "2026-03-24T19:15:00.000Z",
      "endTime": "2026-03-24T19:15:05.123Z",
      "duration": 5123,
      "exitCode": 0
    }
  ],
  "total": 47,
  "hasMore": true
}
```

---

### Terminate Execution

Stop a currently running command execution.

#### Request
```http
POST /api/external/commands/{commandId}/executions/{executionId}/terminate
```

#### Path Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `commandId` | String | Yes | Command identifier |
| `executionId` | String | Yes | Execution instance to terminate |

#### Response
```json
{
  "executionId": "exec_1234567890abcdef",
  "commandId": "soma-harvest",
  "status": "terminating",
  "message": "Termination signal sent to process 12345"
}
```

---

### Get Execution Logs

Stream or retrieve execution logs in real-time.

#### Request (HTTP)
```http
GET /api/external/commands/{commandId}/executions/{executionId}/logs?stream=true&since=2026-03-24T19:20:00Z
```

#### Query Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `stream` | Boolean | No | Enable streaming logs (Server-Sent Events) |
| `since` | String | No | ISO timestamp - only logs after this time |
| `limit` | Number | No | Maximum log lines to return |

#### Response (Non-streaming)
```json
{
  "logs": [
    {
      "timestamp": "2026-03-24T19:20:00.123Z",
      "stream": "stdout",
      "message": "Starting SOMA harvester process"
    },
    {
      "timestamp": "2026-03-24T19:20:02.456Z",
      "stream": "stdout",
      "message": "Scanning inbox directory: ~/.soma/inbox"
    },
    {
      "timestamp": "2026-03-24T19:20:05.789Z",
      "stream": "stderr",
      "message": "WARNING: Large file detected, may take extra time"
    }
  ]
}
```

#### Response (Streaming - Server-Sent Events)
```
data: {"timestamp":"2026-03-24T19:20:00.123Z","stream":"stdout","message":"Starting process"}

data: {"timestamp":"2026-03-24T19:20:02.456Z","stream":"stdout","message":"Processing item 1/15"}

data: {"timestamp":"2026-03-24T19:20:05.789Z","stream":"stdout","message":"Processing item 2/15"}
```

---

## Error Responses

### Standard Error Format
```json
{
  "error": "Human readable error message",
  "code": "MACHINE_READABLE_CODE",
  "details": {
    "additionalInfo": "contextual information"
  },
  "timestamp": "2026-03-24T19:20:00.123Z"
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `COMMAND_NOT_FOUND` | 404 | Requested command ID is not configured |
| `INVALID_COMMAND_ID` | 400 | Command ID contains invalid characters |
| `ALREADY_RUNNING` | 409 | Command is running and doesn't allow concurrency |
| `EXECUTION_LIMIT_REACHED` | 429 | Maximum concurrent executions exceeded |
| `EXECUTION_NOT_FOUND` | 404 | Execution ID not found |
| `PERMISSION_DENIED` | 403 | Insufficient permissions for command |
| `INVALID_TIMEOUT` | 400 | Timeout value exceeds global maximum |
| `CONFIGURATION_ERROR` | 500 | Command configuration is invalid |
| `SYSTEM_ERROR` | 500 | Unexpected system error during execution |

---

## Usage Examples

### JavaScript/TypeScript

```typescript
// List available commands
const commands = await fetch('/api/external/commands').then(r => r.json());

// Execute a command
const execution = await fetch('/api/external/commands/soma-harvest/execute', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ timeout: 180000 })
}).then(r => r.json());

// Poll for completion
const checkStatus = async () => {
  const status = await fetch(
    `/api/external/commands/soma-harvest/executions/${execution.executionId}`
  ).then(r => r.json());

  if (status.status === 'running') {
    setTimeout(checkStatus, 2000);
  } else {
    console.log('Execution completed:', status);
  }
};

checkStatus();
```

### cURL

```bash
# List commands
curl -X GET http://localhost:3000/api/external/commands

# Execute command
curl -X POST http://localhost:3000/api/external/commands/soma-harvest/execute \
  -H "Content-Type: application/json" \
  -d '{"timeout": 180000}'

# Check status
curl -X GET http://localhost:3000/api/external/commands/soma-harvest/executions/exec_123

# Stream logs
curl -N -H "Accept: text/event-stream" \
  "http://localhost:3000/api/external/commands/soma-harvest/executions/exec_123/logs?stream=true"
```

### Python

```python
import requests
import time

# Execute command
response = requests.post(
    'http://localhost:3000/api/external/commands/soma-harvest/execute',
    json={'timeout': 180000}
)
execution = response.json()

# Wait for completion
while True:
    status_response = requests.get(
        f"http://localhost:3000/api/external/commands/soma-harvest/executions/{execution['executionId']}"
    )
    status = status_response.json()

    if status['status'] in ['completed', 'failed', 'timeout']:
        print(f"Execution finished: {status['status']}")
        print(f"Output: {status['stdout']}")
        break

    time.sleep(2)
```

---

## WebSocket Integration

For real-time updates, the External Commands API integrates with AgentFlow's WebSocket system:

```javascript
const ws = new WebSocket('ws://localhost:3000');

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);

  if (message.type === 'external_command_status') {
    console.log('Command status update:', message.data);
  }
};

// Execute command and receive real-time updates
fetch('/api/external/commands/soma-harvest/execute', { method: 'POST' });
```

WebSocket message format:
```json
{
  "type": "external_command_status",
  "data": {
    "executionId": "exec_123",
    "commandId": "soma-harvest",
    "status": "completed",
    "exitCode": 0,
    "duration": 90333
  }
}
```

This API provides comprehensive control over external command execution while maintaining security, auditability, and real-time monitoring capabilities.