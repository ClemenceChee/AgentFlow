# External Command Security Guide

AgentFlow's external command execution system is designed with security as a primary concern. This guide covers security considerations, best practices, and implementation details.

## Security Architecture

### Principle: Explicit Allowlist

**No arbitrary command execution**: Only pre-configured commands in `agentflow.config.json` can be executed. This prevents:
- Command injection attacks
- Arbitrary code execution
- Privilege escalation
- Uncontrolled system access

### Multi-Layer Security Model

```
┌─────────────────────────────────────┐
│        AgentFlow Dashboard          │ ← User Interface
├─────────────────────────────────────┤
│     Input Validation Layer         │ ← Command ID & Parameter Validation
├─────────────────────────────────────┤
│    Configuration Validation        │ ← Allowlist Enforcement
├─────────────────────────────────────┤
│     Execution Environment          │ ← Sandboxed Process Execution
├─────────────────────────────────────┤
│        Audit & Monitoring          │ ← Comprehensive Logging
└─────────────────────────────────────┘
```

---

## Input Validation

### Command ID Validation

```typescript
// Only alphanumeric, hyphens, and underscores
const VALID_COMMAND_ID = /^[a-zA-Z0-9_-]+$/;

// Examples:
✅ "soma-harvest"
✅ "status_check"
✅ "worker-01"
❌ "soma; rm -rf /"
❌ "../../../etc/passwd"
❌ "command|malicious"
```

**Protection against**:
- Command injection via crafted IDs
- Path traversal attacks
- Shell metacharacter exploitation

### Argument Sanitization

```typescript
// Arguments are passed as array, never concatenated into shell command
const args = ["-m", "soma.harvester", "--config", userConfigPath];

// Direct execution (secure):
spawn("python", args, options);

// Shell execution (NEVER used):
exec(`python ${args.join(" ")}`); // ❌ Vulnerable to injection
```

**Shell metacharacters blocked**:
- `;` (command chaining)
- `|` (pipes)
- `&` (background execution)
- `$()` (command substitution)
- `` ` `` (backticks)
- `>` `<` (redirection)

---

## Configuration Security

### Secure Configuration Examples

#### ✅ Secure Command Definition
```json
{
  "soma-harvest": {
    "name": "SOMA Harvester",
    "command": "python",
    "args": ["-m", "soma.harvester", "--safe-mode"],
    "cwd": "~/soma",
    "timeout": 120000,
    "allowConcurrent": false
  }
}
```

#### ❌ Insecure Configurations to Avoid

```json
{
  "bad-command": {
    "command": "sh",  // ❌ Shell access
    "args": ["-c", "rm -rf *"]  // ❌ Destructive command
  },

  "another-bad": {
    "command": "python",
    "args": ["-c", "import os; os.system('malicious')"]  // ❌ Code injection
  }
}
```

### Working Directory Security

```json
{
  "secure-cwd": {
    "cwd": "~/safe-workspace"  // ✅ Specific, limited scope
  },

  "insecure-cwd": {
    "cwd": "/"  // ❌ Root filesystem access
  }
}
```

**Best practices**:
- Use specific, limited working directories
- Avoid root (`/`) or system directories (`/etc`, `/usr`)
- Use tilde expansion (`~/`) for user directories
- Ensure directories exist and are accessible

---

## Execution Environment Security

### Process Isolation

```typescript
// Commands execute in isolated processes
const child = spawn(command, args, {
  cwd: sanitizedWorkingDir,
  env: restrictedEnvironment,
  stdio: ['pipe', 'pipe', 'pipe'],
  uid: processUid,  // Specific user context
  gid: processGid,  // Specific group context
  detached: false   // Keep under parent control
});
```

### Environment Variable Control

```json
{
  "globalEnv": {
    "PATH": "/usr/local/bin:/usr/bin:/bin",  // Limited PATH
    "HOME": "/home/agentflow",               // Restricted HOME
    "TMPDIR": "/tmp/agentflow"               // Isolated temp directory
  }
}
```

**Security considerations**:
- **Restricted PATH**: Prevent execution of arbitrary binaries
- **Controlled HOME**: Limit config file access
- **Isolated temp space**: Prevent temp file attacks

### Resource Limits

```json
{
  "globalTimeout": 300000,        // 5 minute maximum
  "maxConcurrentExecutions": 3    // Prevent resource exhaustion
}
```

**Enforced limits**:
- **Execution timeout**: Prevents runaway processes
- **Concurrency limits**: Protects against DoS attacks
- **Memory bounds**: Process memory restrictions
- **CPU limits**: Prevents CPU exhaustion

---

## Audit & Monitoring

### Execution Logging

All command executions are logged with:

```json
{
  "timestamp": "2026-03-24T19:20:00Z",
  "commandId": "soma-harvest",
  "userId": "admin",
  "status": "started|completed|failed|timeout",
  "duration": 45000,
  "exitCode": 0,
  "stderr": "...",
  "resourceUsage": {
    "maxMemory": "64MB",
    "cpuTime": "12.3s"
  }
}
```

### Security Events

Special logging for security-relevant events:

```json
{
  "event": "command_blocked",
  "reason": "invalid_command_id",
  "attempt": "soma; rm -rf /",
  "sourceIP": "192.168.1.100",
  "timestamp": "2026-03-24T19:20:00Z"
}
```

### Monitoring Alerts

Automated alerts for:
- **Repeated failures**: Multiple failed execution attempts
- **Resource exhaustion**: Commands hitting timeout/memory limits
- **Suspicious patterns**: Unusual command frequency or timing
- **Configuration changes**: Modifications to external command config

---

## Deployment Security

### File System Permissions

```bash
# Configuration files should be owner-readable only
chmod 600 agentflow.config.json
chown agentflow:agentflow agentflow.config.json

# Application directories
chmod 750 /opt/agentflow
chown -R agentflow:agentflow /opt/agentflow

# Log directories with appropriate access
chmod 755 /var/log/agentflow
chown agentflow:adm /var/log/agentflow
```

### Network Security

```yaml
# Firewall rules (example)
- port: 3000
  protocol: tcp
  source: internal_network_only

# Reverse proxy configuration
upstream agentflow {
    server 127.0.0.1:3000;
}

server {
    # HTTPS only, no HTTP
    listen 443 ssl http2;
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
}
```

### Container Security

```dockerfile
# Run as non-root user
RUN adduser --disabled-password --gecos "" agentflow
USER agentflow

# Read-only filesystem where possible
VOLUME ["/app/config"]
VOLUME ["/app/logs"]

# Security options
RUN apt-get update && apt-get install -y --no-install-recommends \
    dumb-init \
    && rm -rf /var/lib/apt/lists/*

ENTRYPOINT ["dumb-init", "--"]
```

---

## Incident Response

### Security Event Response

1. **Detection**: Automated monitoring alerts on suspicious activity
2. **Analysis**: Review execution logs and system state
3. **Containment**: Disable affected commands, isolate compromised processes
4. **Recovery**: Restore from known-good configuration
5. **Prevention**: Update security controls, configuration validation

### Common Security Issues

#### Scenario: Malicious Command Injection Attempt

**Detection**:
```json
{
  "event": "validation_failure",
  "commandId": "soma-harvest; rm -rf /",
  "error": "Invalid command ID format",
  "blocked": true
}
```

**Response**:
1. Command automatically blocked by validation layer
2. Security event logged with attempt details
3. Alert sent to administrators
4. Source IP/user investigated for additional suspicious activity

#### Scenario: Resource Exhaustion Attack

**Detection**:
```json
{
  "event": "resource_limit_exceeded",
  "commandId": "soma-heavy-process",
  "limits": {
    "timeout": "300000ms",
    "actual": "300001ms"
  },
  "action": "terminated"
}
```

**Response**:
1. Process automatically terminated at timeout
2. Concurrency limits prevent additional executions
3. Resource usage patterns analyzed
4. Command configuration reviewed for appropriate limits

---

## Best Practices

### Configuration Management

1. **Version control**: Store configurations in git with review process
2. **Environment separation**: Different configs for dev/staging/production
3. **Principle of least privilege**: Minimal necessary permissions only
4. **Regular review**: Periodic audit of configured commands

### Command Design

1. **Idempotent operations**: Commands should be safe to run multiple times
2. **Clear naming**: Command IDs should clearly indicate their purpose
3. **Appropriate timeouts**: Set realistic but not excessive timeout values
4. **Status reporting**: Commands should provide clear success/failure indicators

### Monitoring

1. **Log retention**: Keep execution logs for security analysis
2. **Anomaly detection**: Monitor for unusual patterns in command execution
3. **Resource tracking**: Alert on commands consuming excessive resources
4. **Configuration changes**: Audit all modifications to external command settings

### User Training

1. **Security awareness**: Train users on command execution risks
2. **Proper usage**: Document approved workflows and procedures
3. **Incident reporting**: Clear process for reporting security concerns
4. **Regular updates**: Keep security documentation current

By following these security guidelines, AgentFlow's external command execution provides powerful operational capabilities while maintaining a strong security posture.