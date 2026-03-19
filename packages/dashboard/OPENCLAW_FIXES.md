# OpenClaw Agent Discovery Fixes

This document outlines the comprehensive fixes applied to the AgentFlow Dashboard to enable proper discovery and monitoring of OpenClaw agents.

## Problems Identified

### 1. Depth Limitation (CRITICAL)
- **Issue**: `TraceWatcher` used `depth: 0` which prevented recursive directory watching
- **Impact**: OpenClaw session files in `/home/trader/.openclaw/agents/*/sessions/` were never discovered
- **Files affected**: `/src/watcher.ts` line 882

### 2. Missing Recursive File Discovery
- **Issue**: `loadExistingFiles()` only scanned top-level directories
- **Impact**: Existing OpenClaw session files were missed during startup
- **Files affected**: `/src/watcher.ts` lines 77-92

### 3. Poor Agent Identification
- **Issue**: Agent ID extraction didn't understand OpenClaw directory structure
- **Impact**: OpenClaw agents appeared with generic names instead of proper identifiers
- **Files affected**: `/src/watcher.ts` lines 484-487, 410-427

## Fixes Applied

### 1. Enhanced Recursive Directory Scanning

**Before:**
```typescript
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json') || f.endsWith('.jsonl'));
```

**After:**
```typescript
private scanDirectoryRecursive(dir: string, depth: number = 0): number {
  if (depth > 10) return 0; // Prevent infinite recursion

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile() && this.isSupportedFile(entry.name)) {
      this.loadFile(fullPath);
    } else if (entry.isDirectory()) {
      fileCount += this.scanDirectoryRecursive(fullPath, depth + 1);
    }
  }
}
```

### 2. Recursive File Watching with Glob Patterns

**Before:**
```typescript
const watcher = chokidar.watch(dir, {
  ignored: /^\./,
  persistent: true,
  ignoreInitial: true,
  depth: 0, // NO RECURSION!
});
```

**After:**
```typescript
const patterns = [
  path.join(dir, '**/*.json'),
  path.join(dir, '**/*.jsonl'),
  path.join(dir, '**/*.log'),
  path.join(dir, '**/*.trace'),
];

const watcher = chokidar.watch(patterns, {
  ignored: [/^\./, /node_modules/, /\.git/],
  persistent: true,
  ignoreInitial: true,
  followSymlinks: false,
  depth: 10, // Deep nesting for OpenClaw
});
```

### 3. OpenClaw-Aware Agent Identification

**Before:**
```typescript
const parentDir = path.basename(path.dirname(filePath));
const agentId = grandParentDir === 'agents' ? parentDir : parentDir;
```

**After:**
```typescript
// OpenClaw agent structure: /home/trader/.openclaw/agents/AGENT_NAME/sessions/SESSION.jsonl
const pathParts = filePath.split(path.sep);
const agentsIndex = pathParts.lastIndexOf('agents');
if (agentsIndex !== -1 && agentsIndex + 1 < pathParts.length) {
  const agentName = pathParts[agentsIndex + 1];
  agentId = `openclaw-${agentName}`;
}
```

### 4. Enhanced Log File Detection

```typescript
private extractAgentFromPath(filePath: string): string {
  // OpenClaw-specific detection
  if (filePath.includes('.openclaw/')) {
    const agentsIndex = pathParts.lastIndexOf('agents');
    if (agentsIndex !== -1) {
      return `openclaw-${pathParts[agentsIndex + 1]}`;
    }
    if (filename.startsWith('openclaw-')) {
      return 'openclaw-gateway';
    }
    return 'openclaw';
  }
  // ... other agent types
}
```

## Directories Now Monitored

The dashboard now properly monitors these OpenClaw directories:

### Primary Traces
- `/home/trader/.openclaw/workspace/traces/` - AgentFlow JSON traces

### Session Files (Recursive)
- `/home/trader/.openclaw/agents/main/sessions/`
- `/home/trader/.openclaw/agents/vault-curator/sessions/`
- `/home/trader/.openclaw/agents/vault-janitor/sessions/`
- `/home/trader/.openclaw/agents/vault-distiller/sessions/`
- `/home/trader/.openclaw/agents/claude-code/sessions/`

### Log Files
- `/tmp/openclaw/` - OpenClaw gateway logs
- `/home/trader/.openclaw/cron/` - Cron job logs

## Expected Results

After these fixes, the AgentFlow Dashboard should:

1. **Discover OpenClaw Agents**: All OpenClaw agents appear in the left sidebar
2. **Real-time Updates**: New OpenClaw sessions are detected immediately
3. **Proper Agent Names**: Agents show as `openclaw-main`, `openclaw-vault-curator`, etc.
4. **Full Session Inspection**: Click any OpenClaw session to view:
   - Complete conversation timeline
   - Token usage and costs
   - Tool call details
   - Thinking blocks
   - Model changes

## Verification

### Test Coverage
- ✅ Recursive directory discovery
- ✅ OpenClaw session file parsing
- ✅ Agent ID extraction from paths
- ✅ Real-time file watching
- ✅ Log file parsing
- ✅ Statistics aggregation

### Manual Testing
Run the test discovery script:
```bash
node test-openclaw-discovery.js
```

### Dashboard Verification
1. Start dashboard: `./bin/dashboard.js --host 0.0.0.0 --port 3000 --traces /home/trader/.openclaw/workspace/traces --data-dir /home/trader/.openclaw/agents/main/sessions ...`
2. Open http://localhost:3000
3. Check left sidebar for OpenClaw agents
4. Click any OpenClaw session to inspect timeline

## Performance Improvements

### Efficiency Gains
- **Lazy Loading**: Session events parsed only when requested
- **Smart Filtering**: Ignores `.git`, `node_modules`, hidden files
- **Depth Limiting**: Prevents infinite recursion
- **Caching**: File stats cached to avoid redundant parsing

### Resource Usage
- **Memory**: Minimal increase due to efficient event parsing
- **CPU**: File watching uses OS-native events (inotify on Linux)
- **I/O**: Batch processing of file changes

## Compatibility

These changes maintain full backward compatibility with:
- ✅ Existing Alfred agent discovery
- ✅ AgentFlow JSON trace format
- ✅ Alfred JSONL session logs
- ✅ Generic log file parsing
- ✅ WebSocket real-time updates
- ✅ All existing API endpoints

## Future Enhancements

### Potential Improvements
1. **Agent Health Monitoring**: Parse OpenClaw heartbeat checks
2. **Cron Job Tracking**: Monitor scheduled tasks from cron directory
3. **Subagent Relationships**: Visualize parent-child agent spawning
4. **Cost Tracking**: Aggregate token costs across agent families
5. **Alert System**: Notify on failed OpenClaw operations

The fixes ensure OpenClaw agents are now fully integrated into the AgentFlow monitoring ecosystem with comprehensive visibility into their execution patterns and performance metrics.