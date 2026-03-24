# External Features Configuration

AgentFlow supports external trace discovery and command execution to integrate with multi-agent environments like SOMA and other agent frameworks.

## External Trace Discovery

### Overview

External trace discovery allows AgentFlow to monitor and load execution traces from directories outside the primary traces directory. This is essential for multi-agent environments where different agents create traces in their own directories.

### Configuration

```json
{
  "discoveryPaths": [
    "~/.soma/traces",
    "/path/to/other/agent/traces",
    "~/custom-agents/*/traces"
  ]
}
```

### Supported Path Features

- **Tilde expansion**: `~/` expands to user home directory
- **Absolute paths**: `/full/path/to/traces`
- **Glob patterns**: `~/agents/*/traces` (matches multiple directories)
- **Nested discovery**: Recursively scans subdirectories for trace files

### Discovery Process

1. **Startup scanning**: All configured paths are scanned for existing trace files
2. **Real-time watching**: File system events detect new/modified/deleted traces
3. **Validation**: Only valid JSON trace files are loaded
4. **Integration**: External traces appear alongside internal traces in the dashboard

### Supported File Formats

- **AgentFlow JSON**: Standard execution graphs with nodes and metadata
- **JSONL sessions**: Claude Code conversation logs
- **Generic JSON**: Any JSON file with basic trace structure

### Example: SOMA Integration

```json
{
  "discoveryPaths": [
    "~/.soma/traces"
  ],
  "aliases": {
    "soma-harvester": "SOMA Harvester",
    "soma-synthesizer": "SOMA Synthesizer",
    "soma-reconciler": "SOMA Reconciler",
    "soma-cartographer": "SOMA Cartographer"
  }
}
```

This configuration:
- Monitors `~/.soma/traces` for SOMA worker execution traces
- Provides friendly display names for SOMA agents
- Automatically discovers traces from all SOMA workers

---

## External Command Execution

### Overview

External command execution allows triggering system commands, scripts, and agent operations directly from the AgentFlow dashboard. This enables manual control of agent workflows and operational tasks.

### Security Model

**Explicit allowlist approach**: Only pre-configured commands can be executed. No arbitrary command execution is permitted.

### Global Configuration

```json
{
  "externalCommands": {
    "globalTimeout": 300000,
    "globalCwd": "~",
    "globalEnv": {
      "PATH": "/usr/local/bin:/usr/bin:/bin",
      "PYTHONPATH": "~/soma"
    },
    "maxConcurrentExecutions": 3
  }
}
```

#### Global Options

- **`globalTimeout`**: Default timeout in milliseconds (default: 5 minutes)
- **`globalCwd`**: Default working directory (supports tilde expansion)
- **`globalEnv`**: Environment variables inherited by all commands
- **`maxConcurrentExecutions`**: Maximum simultaneous command executions

### Command Definitions

```json
{
  "externalCommands": {
    "commands": {
      "command-id": {
        "name": "Display Name",
        "command": "executable",
        "args": ["arg1", "arg2"],
        "cwd": "~/custom/path",
        "description": "Human-readable description",
        "category": "Grouping Category",
        "timeout": 120000,
        "allowConcurrent": false,
        "env": {
          "CUSTOM_VAR": "value"
        }
      }
    }
  }
}
```

#### Command Options

- **`name`**: Display name in the dashboard UI
- **`command`**: Executable name or path
- **`args`**: Array of command arguments
- **`cwd`**: Working directory (inherits from global if not specified)
- **`description`**: Tooltip/help text for the command
- **`category`**: UI grouping (e.g., "SOMA Workers", "Diagnostics")
- **`timeout`**: Command-specific timeout in milliseconds
- **`allowConcurrent`**: Whether multiple instances can run simultaneously
- **`env`**: Additional environment variables (merged with global)

### Security Features

#### Input Validation
- **Command ID validation**: Only alphanumeric, hyphens, underscores allowed
- **Argument sanitization**: No shell metacharacters in arguments
- **Path traversal prevention**: Working directories are validated

#### Execution Controls
- **No shell injection**: Commands are executed directly, not through shell
- **Timeout enforcement**: All commands have mandatory timeouts
- **Concurrency limits**: Global and per-command execution limits
- **Audit logging**: All executions are logged with timestamps and results

#### Resource Protection
- **Memory limits**: Commands run with restricted memory access
- **CPU limits**: Execution time bounds prevent resource exhaustion
- **File system access**: Commands run in specified working directories only

### Example: SOMA Worker Commands

```json
{
  "externalCommands": {
    "globalTimeout": 300000,
    "globalCwd": "~/soma",
    "globalEnv": {
      "PYTHONPATH": "~/soma"
    },
    "maxConcurrentExecutions": 2,

    "commands": {
      "soma-harvest": {
        "name": "SOMA Harvester",
        "command": "python",
        "args": ["-m", "soma.harvester"],
        "description": "Scan inbox and ingest new documents",
        "category": "SOMA Workers",
        "timeout": 120000,
        "allowConcurrent": false
      },

      "soma-status": {
        "name": "SOMA Status",
        "command": "python",
        "args": ["-m", "soma.status", "--detailed"],
        "description": "Check vault health and worker status",
        "category": "SOMA Diagnostics",
        "timeout": 30000,
        "allowConcurrent": true
      }
    }
  }
}
```

---

## Agent Detection

### Overview

Agent detection automatically identifies which agent created a trace based on file paths and naming patterns. This enables proper agent attribution in multi-agent environments.

### Path-based Detection

```json
{
  "agentDetection": {
    "pathPatterns": {
      ".soma/": "soma-worker",
      "/openai-swarm/": "swarm-agent",
      "/custom-agent/": "my-agent"
    }
  }
}
```

Traces found in paths containing the key will be attributed to the specified agent ID.

### File-based Detection

```json
{
  "agentDetection": {
    "filePatterns": {
      "soma-(.+)\\.json$": "soma-${match}",
      "agent-([a-z]+)-trace\\.json$": "${match}-worker"
    }
  }
}
```

Filename patterns use regex with capture groups. The `${match}` placeholder is replaced with the captured content.

### Combined Example

```json
{
  "agentDetection": {
    "pathPatterns": {
      ".soma/": "soma-worker"
    },
    "filePatterns": {
      "soma-(.+)\\.json$": "soma-${match}"
    }
  }
}
```

This configuration:
1. Files in `.soma/` paths default to `soma-worker`
2. Files matching `soma-harvester.json` become `soma-harvester`
3. More specific file patterns override path patterns

---

## Complete Example

```json
{
  "// External trace discovery": "Monitor SOMA and custom agent directories",
  "discoveryPaths": [
    "~/.soma/traces",
    "~/custom-agents/*/traces"
  ],

  "// External command execution": "Manual SOMA operations",
  "externalCommands": {
    "globalTimeout": 300000,
    "globalCwd": "~/soma",
    "maxConcurrentExecutions": 2,

    "commands": {
      "soma-harvest": {
        "name": "SOMA Harvester",
        "command": "python",
        "args": ["-m", "soma.harvester"],
        "description": "Scan inbox and ingest documents",
        "category": "SOMA Workers",
        "allowConcurrent": false
      }
    }
  },

  "// Agent identification": "Automatic agent detection",
  "agentDetection": {
    "pathPatterns": {
      ".soma/": "soma-worker"
    },
    "filePatterns": {
      "soma-(.+)\\.json$": "soma-${match}"
    }
  },

  "// Display names": "Friendly agent names in UI",
  "aliases": {
    "soma-harvester": "SOMA Harvester",
    "soma-synthesizer": "SOMA Synthesizer"
  }
}
```

This provides comprehensive integration between AgentFlow and external agent systems while maintaining security and operational control.