# SOMA Integration Setup Guide

This guide walks you through integrating AgentFlow with SOMA (Structured Organizational Memory Architecture) to provide comprehensive visibility into your agent execution pipeline.

## Overview

The AgentFlow + SOMA integration provides:
- **Execution visibility**: See SOMA worker traces alongside other agent executions
- **Manual triggers**: Start SOMA workers directly from the AgentFlow dashboard
- **Operational intelligence**: Enhanced trace details with SOMA operational context
- **Multi-layer monitoring**: Track agent execution AND organizational intelligence processing

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    AgentFlow Dashboard                       │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────┐ │
│  │ Agent Execution │  │ SOMA Intelligence│  │ Manual       │ │
│  │ Monitoring      │  │ & Governance     │  │ Operations   │ │
│  └─────────────────┘  └─────────────────┘  └──────────────┘ │
└─────────────────────────────────────────────────────────────┘
                               │
┌──────────────────────────────┼──────────────────────────────┐
│            External Trace Discovery & Command Execution      │
└──────────────────────────────┼──────────────────────────────┘
                               │
┌─────────────────┐  ┌─────────┴─────────┐  ┌─────────────────┐
│   Agent A       │  │      SOMA         │  │   Agent C       │
│   traces/       │  │   ~/.soma/traces/ │  │   traces/       │
└─────────────────┘  └───────────────────┘  └─────────────────┘
                             │
                  ┌─────────────────────┐
                  │    SOMA Workers     │
                  │ ┌─────────────────┐ │
                  │ │   Harvester     │ │
                  │ │   Synthesizer   │ │
                  │ │   Reconciler    │ │
                  │ │   Cartographer  │ │
                  │ └─────────────────┘ │
                  └─────────────────────┘
```

---

## Prerequisites

### SOMA Installation

Ensure SOMA is installed and configured:

```bash
# Install SOMA (example - adjust for your setup)
pip install soma-intelligence

# Verify installation
python -m soma.status
```

### SOMA Configuration

SOMA should be configured to output traces:

```bash
# SOMA trace directory (default)
mkdir -p ~/.soma/traces

# Verify SOMA workers can write traces
python -m soma.harvester --dry-run
```

### AgentFlow Installation

AgentFlow should be installed with external features enabled:

```bash
# Install AgentFlow
npm install -g agentflow

# Verify external features are available
agentflow --help | grep -E "(data-dir|external)"
```

---

## Configuration Steps

### 1. Configure External Trace Discovery

Create or update your `agentflow.config.json`:

```json
{
  "// SOMA Integration": "Discovery and display configuration",

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

### 2. Configure External Commands

Add SOMA worker commands to enable manual triggers:

```json
{
  "externalCommands": {
    "globalTimeout": 600000,
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
        "description": "Scan inbox and ingest new documents into SOMA vault",
        "category": "SOMA Workers",
        "timeout": 120000,
        "allowConcurrent": false
      },

      "soma-synthesize": {
        "name": "SOMA Synthesizer",
        "command": "python",
        "args": ["-m", "soma.synthesizer"],
        "description": "Analyze candidates and create insights through LLM synthesis",
        "category": "SOMA Workers",
        "timeout": 180000,
        "allowConcurrent": false
      },

      "soma-reconcile": {
        "name": "SOMA Reconciler",
        "command": "python",
        "args": ["-m", "soma.reconciler"],
        "description": "Detect issues and merge duplicate entities in the vault",
        "category": "SOMA Workers",
        "timeout": 240000,
        "allowConcurrent": false
      },

      "soma-cartograph": {
        "name": "SOMA Cartographer",
        "command": "python",
        "args": ["-m", "soma.cartographer"],
        "description": "Generate embeddings and discover entity archetypes",
        "category": "SOMA Workers",
        "timeout": 300000,
        "allowConcurrent": false
      },

      "soma-full-cycle": {
        "name": "SOMA Full Cycle",
        "command": "python",
        "args": ["-m", "soma.run_all"],
        "description": "Run complete SOMA pipeline: harvest → synthesize → reconcile → cartograph",
        "category": "SOMA Workflows",
        "timeout": 900000,
        "allowConcurrent": false
      },

      "soma-status": {
        "name": "SOMA Status Check",
        "command": "python",
        "args": ["-m", "soma.status", "--detailed"],
        "description": "Check SOMA vault health and worker operational status",
        "category": "SOMA Diagnostics",
        "timeout": 30000,
        "allowConcurrent": true
      }
    }
  }
}
```

### 3. Configure Agent Detection

Help AgentFlow automatically identify SOMA traces:

```json
{
  "agentDetection": {
    "pathPatterns": {
      ".soma/": "soma-worker"
    },
    "filePatterns": {
      "soma-(.+)\\.json$": "soma-${match}",
      "harvester-(.+)\\.json$": "soma-harvester",
      "synthesizer-(.+)\\.json$": "soma-synthesizer",
      "reconciler-(.+)\\.json$": "soma-reconciler",
      "cartographer-(.+)\\.json$": "soma-cartographer"
    }
  }
}
```

---

## Complete Configuration Example

```json
{
  "// AgentFlow + SOMA Integration": "Complete setup for operational visibility",

  "discoveryPaths": [
    "~/.soma/traces",
    "~/other-agents/*/traces"
  ],

  "aliases": {
    "soma-harvester": "SOMA Harvester",
    "soma-synthesizer": "SOMA Synthesizer",
    "soma-reconciler": "SOMA Reconciler",
    "soma-cartographer": "SOMA Cartographer"
  },

  "agentDetection": {
    "pathPatterns": {
      ".soma/": "soma-worker"
    },
    "filePatterns": {
      "soma-(.+)\\.json$": "soma-${match}"
    }
  },

  "externalCommands": {
    "globalTimeout": 600000,
    "globalCwd": "~/soma",
    "globalEnv": {
      "PYTHONPATH": "~/soma",
      "SOMA_CONFIG": "~/.soma/config.json"
    },
    "maxConcurrentExecutions": 2,

    "commands": {
      "soma-harvest": {
        "name": "SOMA Harvester",
        "command": "python",
        "args": ["-m", "soma.harvester"],
        "description": "Scan inbox and ingest documents",
        "category": "SOMA Workers",
        "timeout": 120000,
        "allowConcurrent": false
      },

      "soma-synthesize": {
        "name": "SOMA Synthesizer",
        "command": "python",
        "args": ["-m", "soma.synthesizer"],
        "description": "Generate insights through LLM analysis",
        "category": "SOMA Workers",
        "timeout": 180000,
        "allowConcurrent": false
      },

      "soma-reconcile": {
        "name": "SOMA Reconciler",
        "command": "python",
        "args": ["-m", "soma.reconciler"],
        "description": "Merge duplicates and resolve conflicts",
        "category": "SOMA Workers",
        "timeout": 240000,
        "allowConcurrent": false
      },

      "soma-cartograph": {
        "name": "SOMA Cartographer",
        "command": "python",
        "args": ["-m", "soma.cartographer"],
        "description": "Generate embeddings and discover patterns",
        "category": "SOMA Workers",
        "timeout": 300000,
        "allowConcurrent": false
      },

      "soma-full-cycle": {
        "name": "SOMA Full Pipeline",
        "command": "python",
        "args": ["-m", "soma.run_all"],
        "description": "Complete SOMA processing cycle",
        "category": "SOMA Workflows",
        "timeout": 900000,
        "allowConcurrent": false
      },

      "soma-status": {
        "name": "SOMA Health Check",
        "command": "python",
        "args": ["-m", "soma.status", "--detailed"],
        "description": "Check vault and worker status",
        "category": "SOMA Diagnostics",
        "timeout": 30000,
        "allowConcurrent": true
      },

      "soma-vault-stats": {
        "name": "SOMA Vault Statistics",
        "command": "python",
        "args": ["-m", "soma.vault", "--stats"],
        "description": "Show entity counts and vault metrics",
        "category": "SOMA Diagnostics",
        "timeout": 30000,
        "allowConcurrent": true
      }
    }
  },

  "skipFiles": ["*.log", "*.tmp", ".DS_Store"],
  "skipDirectories": ["node_modules", ".git", ".soma/cache"]
}
```

---

## Verification Steps

### 1. Test External Trace Discovery

```bash
# Generate a test SOMA trace
python -m soma.harvester --dry-run

# Start AgentFlow
agentflow start

# Check if SOMA traces are discovered
curl http://localhost:3000/api/traces | jq '.traces[] | select(.agentId | contains("soma"))'
```

### 2. Test External Commands

```bash
# Access AgentFlow dashboard
open http://localhost:3000

# Navigate to "External Commands" or "SOMA Operations"
# Try executing "SOMA Status Check"
# Verify execution completes successfully
```

### 3. Verify Integration Features

1. **SOMA Intelligence View**: Check enhanced trace details with operational context
2. **SOMA Governance View**: Verify agentic governance controls are available
3. **SOMA Activity View**: Confirm real-time operational intelligence dashboard
4. **Manual Triggers**: Test all SOMA worker command executions
5. **Trace Enhancement**: Verify SOMA traces show detailed execution steps

---

## Operational Workflows

### Daily SOMA Operations

1. **Morning Health Check**:
   ```
   Dashboard → External Commands → SOMA Health Check
   ```

2. **Trigger Harvesting** (as needed):
   ```
   Dashboard → External Commands → SOMA Harvester
   ```

3. **Run Full Pipeline** (weekly):
   ```
   Dashboard → External Commands → SOMA Full Pipeline
   ```

### Monitoring Workflow

1. **Check Recent Activity**:
   ```
   Dashboard → SOMA Activity → Recent Operations
   ```

2. **Review Execution Traces**:
   ```
   Dashboard → Traces → Filter: soma-*
   ```

3. **Monitor Performance**:
   ```
   Dashboard → Analytics → Agent Performance → SOMA Workers
   ```

---

## Troubleshooting

### SOMA Traces Not Appearing

**Check discovery paths**:
```bash
# Verify SOMA traces exist
ls -la ~/.soma/traces/

# Check AgentFlow configuration
cat agentflow.config.json | jq '.discoveryPaths'

# Test manual discovery
agentflow scan --data-dir ~/.soma/traces
```

### External Commands Failing

**Check command configuration**:
```bash
# Test SOMA command directly
cd ~/soma && python -m soma.status

# Verify working directory exists
ls -la ~/soma

# Check AgentFlow command config
cat agentflow.config.json | jq '.externalCommands.commands["soma-status"]'
```

### Permission Issues

**Fix file permissions**:
```bash
# SOMA trace directory
chmod 755 ~/.soma/traces
chmod 644 ~/.soma/traces/*.json

# AgentFlow config
chmod 600 agentflow.config.json
```

### SOMA Integration Not Working

**Verify SOMA installation**:
```bash
# Test SOMA directly
python -c "import soma; print(soma.__version__)"

# Check SOMA configuration
python -m soma.config --validate

# Test SOMA worker execution
python -m soma.harvester --help
```

---

## Advanced Configuration

### Custom SOMA Workers

Add custom or experimental SOMA workers:

```json
{
  "commands": {
    "soma-experimental": {
      "name": "SOMA Experimental Worker",
      "command": "python",
      "args": ["-m", "soma.experimental", "--safe-mode"],
      "description": "Experimental SOMA functionality",
      "category": "SOMA Experimental",
      "timeout": 300000,
      "allowConcurrent": false
    }
  }
}
```

### Multi-Environment Setup

Different configurations for development/production:

```json
{
  "// Development": {
    "discoveryPaths": ["./dev-soma/traces"],
    "externalCommands": {
      "globalCwd": "./dev-soma",
      "commands": {
        "soma-dev-harvest": {
          "command": "python",
          "args": ["-m", "soma.harvester", "--dev-mode"]
        }
      }
    }
  }
}
```

### Performance Optimization

For high-volume SOMA environments:

```json
{
  "externalCommands": {
    "maxConcurrentExecutions": 4,
    "commands": {
      "soma-parallel-harvest": {
        "command": "python",
        "args": ["-m", "soma.harvester", "--parallel", "4"],
        "allowConcurrent": true,
        "timeout": 300000
      }
    }
  }
}
```

This completes the SOMA integration setup. You should now have full visibility into SOMA operations through the AgentFlow dashboard, with the ability to manually trigger SOMA workers and monitor their execution alongside other agent activities.