---
sidebar_position: 4
title: Organizational Context Continuity
---

# Organizational Context Continuity

:::caution Experimental
Organizational context features are experimental. APIs may change between minor versions.
:::

## Overview

AgentFlow now supports organizational context continuity through enhanced SOMA integration. This enables seamless knowledge sharing and context preservation across different operators, sessions, and Claude Code instances (CLI, desktop, web, VS Code).

## Session Hooks Integration

AgentFlow's execution framework now includes session lifecycle hooks that enable organizational context tracking:

```typescript
const agentflow = createAgentFlow({
  sessionHooks: {
    onSessionStart: async (context: SessionContext) => {
      // Initialize organizational context for the session
      await soma.startOperatorSession(context);
    },
    
    onSessionInitialized: async (graph: ExecutionGraph) => {
      // Inject relevant organizational context
      const context = await soma.getRelevantContext(graph.metadata);
      graph.organizationalContext = context;
    },
    
    onSessionEnd: async (results: ExecutionResult) => {
      // Capture session insights for organizational learning
      await soma.captureSessionInsights(results);
    }
  }
});
```

## Operator Context Propagation

Every AgentFlow execution now includes operator context that flows through the entire execution graph:

```typescript
interface OperatorContext {
  operatorId: string;      // Unique operator identifier
  sessionId: string;       // Session correlation ID
  teamId?: string;         // Team membership for access control
  instanceId?: string;     // CLI, desktop, web, vscode
}
```

This context enables:
- **Attribution** - Know which operator initiated which executions
- **Correlation** - Link related sessions across time and instances
- **Access Control** - Enforce team-based privacy boundaries
- **Learning** - Build operator-specific and team-specific patterns

## Enhanced Event Capture

AgentFlow's SOMA event writer now captures comprehensive organizational metadata:

```typescript
// Enhanced execution events include operator context
interface ExecutionEvent {
  // ... existing fields
  operatorContext?: {
    operatorId: string;
    sessionId: string;
    teamId?: string;
    instanceId?: string;
    userAgent?: string;
  };
  organizationalTags?: string[];
  teamScope?: string;
}
```

## Multi-Instance Session Correlation

The system automatically correlates related work across different Claude Code instances:

### Continuity Strategies

1. **Explicit Handoffs** - Operators can explicitly link sessions
2. **Temporal Correlation** - Sessions within configurable time windows  
3. **Problem Similarity** - Sessions working on related challenges
4. **Multi-Instance Tracking** - Same operator across CLI, desktop, web, VS Code

### Example Workflow

```typescript
// CLI session discovers a pattern
const cliResult = await agentflow.run({
  operatorId: 'alice',
  instanceId: 'cli',
  graph: investigationGraph
});

// Desktop session continues the work
const desktopResult = await agentflow.run({
  operatorId: 'alice', 
  instanceId: 'desktop',
  continuesFrom: cliResult.sessionId,
  graph: implementationGraph
});

// SOMA automatically correlates these sessions
const correlation = await soma.getSessionCorrelation('alice');
// Returns linked sessions with shared context
```

## Team-Scoped Working Memory

AgentFlow executions now participate in team-scoped L2 working memory:

### Privacy Boundaries
- Team members see team-specific execution patterns
- Cross-team patterns are elevated to L3 for broader sharing
- Access control enforced at the AgentFlow level

### Context Injection
```typescript
// Pre-execution context briefing
const relevantContext = await policyBridge.briefSession(sessionId, teamId, {
  verbosity: 'medium',
  includePatterns: ['workflow', 'anti-pattern'],
  timeWindow: '7d'
});

// Context automatically injected into execution environment
graph.briefingContext = relevantContext;
```

## Pattern Recognition Integration

AgentFlow executions now contribute to organizational pattern detection:

### Workflow Pattern Capture
- Development workflows (code → test → deploy)
- Debugging patterns (investigate → isolate → fix → verify)  
- Documentation patterns (capture → review → publish)

### Anti-Pattern Detection
- Tool redundancy and inefficient switching
- Context loss between sessions
- Repeated failures with similar root causes

### Cross-Operator Validation
```typescript
// Patterns validated by multiple operators gain higher confidence
const pattern = {
  type: 'workflow',
  steps: ['analyze', 'implement', 'test', 'deploy'],
  observedBy: ['alice', 'bob', 'charlie'],
  confidence: 0.95 // High confidence due to multi-operator validation
};
```

## Configuration

### Session Hooks Setup

```typescript
import { createAgentFlow } from '@agentflow/core';
import { createSoma } from 'soma';

const soma = createSoma({
  vaultDir: '.soma/vault',
  // ... other config
});

const agentflow = createAgentFlow({
  sessionHooks: {
    onSessionStart: soma.sessionHooks.onSessionStart,
    onSessionInitialized: soma.sessionHooks.onSessionInitialized, 
    onSessionEnd: soma.sessionHooks.onSessionEnd,
  }
});
```

### Operator Context Configuration

```typescript
const runConfig = {
  operatorId: 'alice',           // From environment or auth
  teamId: 'engineering',         // From team membership
  instanceId: 'vscode',          // Detected automatically
  sessionTimeout: 300000,       // 5 minutes
  enableCorrelation: true,       // Enable session correlation
  correlationWindow: 3600000,   // 1 hour correlation window
};
```

## Best Practices

### For Operators

1. **Consistent operator IDs** - Use the same operator ID across all instances
2. **Descriptive session context** - Add meaningful tags and descriptions
3. **Explicit handoffs** - Use `continuesFrom` when continuing work
4. **Team alignment** - Ensure correct team membership configuration

### For Teams

1. **Define team boundaries** - Clear team membership and access policies
2. **Configure decay windows** - Appropriate L2 working memory retention
3. **Review patterns** - Regular validation of team-specific patterns
4. **Monitor cross-team sharing** - Watch for patterns that should be elevated

### For Organizations

1. **Operator authentication** - Reliable operator identity management
2. **Team management** - Clear processes for team membership changes
3. **Privacy policies** - Guidelines for cross-team knowledge sharing
4. **Pattern governance** - Validation workflows for organizational patterns

## Security Considerations

- **Operator authentication** - Verify operator identity before session start
- **Team membership validation** - Enforce team boundaries at execution time
- **Sensitive data handling** - Automatic filtering in pattern capture
- **Audit trails** - Complete logging of organizational context changes

## Troubleshooting

### Session Correlation Issues
- Check operator ID consistency across instances
- Verify session metadata is properly set
- Review correlation window configuration

### Context Injection Problems
- Validate team membership and permissions
- Check L2 working memory decay settings
- Review policy bridge configuration

### Pattern Recognition Gaps
- Ensure session hooks are properly configured
- Check operator context propagation
- Verify SOMA harvester is processing AgentFlow events

## Related Documentation

- [SOMA Organizational Context](https://ClemenceChee.github.io/soma/concepts/organizational-context) - Core concepts and system architecture
- [AgentFlow Execution](/getting-started/first-trace) - General execution features
- [AgentFlow Process Mining](/getting-started/process-mining) - Analysis and pattern detection
- [SOMA Policy Bridge](/experimental/soma/concepts#policy-bridge) - Policy integration patterns