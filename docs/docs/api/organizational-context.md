---
sidebar_position: 5
title: Organizational Context API
---

# Organizational Context API

:::caution Experimental
Organizational context APIs are experimental. Interfaces may change between minor versions.
:::

## Overview

The Organizational Context API provides comprehensive organizational intelligence capabilities across SOMA and AgentFlow systems. This includes operator authentication, team-scoped memory, session correlation, cross-operator validation, and governance workflows.

## Core Interfaces

### OperatorContext

The foundational interface for tracking operator identity across the system.

```typescript
interface OperatorContext {
  readonly operatorId: string;         // UUID of the human operator - REQUIRED
  readonly sessionId: string;          // Claude Code session ID - REQUIRED  
  readonly teamId?: string;            // Team membership - OPTIONAL
  readonly instanceId?: string;        // Specific tool invocation ID - OPTIONAL
  readonly timestamp?: number;         // When the operator action occurred - OPTIONAL
  readonly userAgent?: string;         // Client/tool information - OPTIONAL
}
```

**Usage:**
```typescript
const context: OperatorContext = {
  operatorId: process.env.OPERATOR_ID!,
  sessionId: process.env.CLAUDE_CODE_SESSION_ID!,
  teamId: process.env.TEAM_ID,
  instanceId: process.env.CLAUDE_CODE_INSTANCE_ID
};
```

### TeamMembershipValidator

Interface for validating team membership and cross-team access permissions.

```typescript
interface TeamMembershipValidator {
  validateTeamMembership(operatorId: string, teamId: string): Promise<boolean>;
  getOperatorTeams(operatorId: string): Promise<string[]>;
  validateCrossTeamAccess(
    operatorId: string, 
    targetTeamId: string, 
    accessType: 'read' | 'write' | 'delete'
  ): Promise<boolean>;
  isOperatorAdmin(operatorId: string): Promise<boolean>;
}
```

**Implementation:**
```typescript
const customValidator: TeamMembershipValidator = {
  async validateTeamMembership(operatorId: string, teamId: string): Promise<boolean> {
    // Custom team membership logic
    return await myTeamService.isMember(operatorId, teamId);
  },

  async getOperatorTeams(operatorId: string): Promise<string[]> {
    return await myTeamService.getOperatorTeams(operatorId);
  },

  async validateCrossTeamAccess(
    operatorId: string, 
    targetTeamId: string, 
    accessType: 'read' | 'write' | 'delete'
  ): Promise<boolean> {
    // Implement cross-team access policies
    return accessType === 'read'; // Example: allow read-only cross-team access
  },

  async isOperatorAdmin(operatorId: string): Promise<boolean> {
    return await myAuthService.isAdmin(operatorId);
  }
};
```

## AgentFlow Integration

### GraphBuilder with Organizational Context

Enhanced GraphBuilder with organizational context support:

```typescript
import { createGraphBuilder } from '@agentflow/core';

const builder = createGraphBuilder({
  agentId: 'data-analysis',
  operatorContext: {
    operatorId: process.env.OPERATOR_ID!,
    sessionId: process.env.CLAUDE_CODE_SESSION_ID!,
    teamId: process.env.TEAM_ID,
    instanceId: process.env.CLAUDE_CODE_INSTANCE_ID
  },
  sessionHooks: {
    onSessionStart: async (context: SessionContext) => {
      console.log('📊 Briefing:', context.briefing);
      console.log('💡 Insights:', context.insights?.length || 0);
      console.log('⚠️ Warnings:', context.warnings?.length || 0);
      
      return { shouldProceed: true };
    },
    
    onSessionInitialized: async (context: SessionContext) => {
      if (context.organizationalContext?.briefingAvailable) {
        console.log('✅ Team:', context.organizationalContext.teamContext?.teamId);
        console.log('📈 Insights:', context.organizationalContext.insightCount);
      }
    },
    
    onSessionEnd: async (results: ExecutionResult) => {
      await soma.captureSessionInsights(results);
    }
  }
});
```

### Organizational Briefing Access

Runtime access to organizational context and briefings:

```typescript
// Access organizational context during execution
const orgContext = builder.getOrganizationalContext();
console.log('Current context:', {
  operator: orgContext.operatorContext?.operatorId,
  team: orgContext.teamContext,
  briefing: orgContext.briefingAvailable,
  insights: orgContext.insightCount,
  warnings: orgContext.warningCount
});

// Get full briefing data
const briefing = builder.getOrganizationalBriefing();
if (briefing?.status === 'available') {
  console.log('Team insights:', briefing.teamContext);
  console.log('Related sessions:', briefing.relatedSessions);
  console.log('Recommendations:', briefing.recommendations);
}
```

### Policy Bridge Integration

Connect AgentFlow executions with SOMA governance policies:

```typescript
import { PolicyBridge } from '@agentflow/core';

const policyBridge = new PolicyBridge({
  somaVault: vault,
  defaultPolicies: {
    operatorAuthentication: true,
    teamBoundaryEnforcement: true,
    crossTeamAccessControl: true,
    sessionCorrelation: true,
    governanceWorkflows: true
  },
  fallbackMode: 'permissive' // 'strict' | 'permissive' | 'disabled'
});

// Evaluate organizational policies for a session
const guidance = await policyBridge.evaluateOrganizationalPolicies(sessionContext);

console.log('Policy Guidance:', {
  recommendations: guidance.recommendations,
  warnings: guidance.warnings,
  approvals: guidance.approvals,
  contextInjections: guidance.contextInjections
});
```

## SOMA Vault Integration

### Team-Scoped Operations

Enhanced vault operations with team membership validation:

```typescript
import { createVault } from 'soma';

const vault = createVault({
  baseDir: '.soma/vault',
  teamValidator: customValidator, // Optional custom validator
  enableDataMasking: true,
  auditDataMasking: true
});

// Team-scoped operations
const operatorContext = { operatorId: 'alice' };

// Read with team validation
const entity = await vault.read('insight', 'entity-id', operatorContext);

// Update with access control
await vault.update('entity-id', { 
  status: 'validated' 
}, operatorContext);

// Team-scoped queries
const teamEntities = await vault.listByTeam('engineering', {
  limit: 50
}, operatorContext);

// Operator-scoped queries
const operatorEntities = await vault.listByOperator('alice', {
  type: 'execution',
  limit: 100
}, operatorContext);
```

### Security Audit Integration

Access security audit functionality:

```typescript
import { getGlobalAuditLogger } from 'soma';

const auditLogger = getGlobalAuditLogger();

// Log custom security events
auditLogger.logSecurityEvent({
  eventType: 'data_access',
  severity: 'info',
  operatorId: 'alice',
  teamId: 'engineering',
  action: 'custom_data_export',
  resource: 'insights',
  result: 'success',
  details: {
    exportType: 'csv',
    recordCount: 150,
    teamScope: 'engineering'
  }
});

// Get audit statistics
const stats = auditLogger.getAuditStatistics(24 * 60 * 60 * 1000); // Last 24 hours
console.log('Audit Statistics:', {
  totalEvents: stats.totalEvents,
  failureRate: stats.failureRate,
  activeAlerts: stats.activeAlertsCount
});
```

## Authentication and Authorization

### Operator Authentication

Comprehensive operator authentication system:

```typescript
import { createOperatorAuthenticator } from 'soma';

const authenticator = createOperatorAuthenticator({
  credentialsDir: '.soma/auth',
  sessionTimeout: 8 * 60 * 60 * 1000, // 8 hours
  maxFailedAttempts: 5,
  requireTwoFactor: false,
  passwordPolicy: {
    minLength: 12,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecialChars: true
  }
});

// Register new operator
await authenticator.registerOperator('alice', {
  credentialType: 'password',
  credential: 'secure-password-123!',
  metadata: {
    created: Date.now(),
    expiresAt: Date.now() + (90 * 24 * 60 * 60 * 1000) // 90 days
  }
}, {
  displayName: 'Alice Johnson',
  email: 'alice@company.com',
  teamIds: ['engineering', 'data-science'],
  roles: ['analyst', 'reviewer'],
  permissions: [
    { resource: 'vault', actions: ['read', 'write'] },
    { resource: 'governance', actions: ['review', 'approve'] }
  ],
  isAdmin: false,
  isActive: true,
  metadata: {
    created: Date.now(),
    updated: Date.now(),
    loginCount: 0,
    failedLoginCount: 0,
    twoFactorEnabled: false
  }
});

// Authenticate operator
const authResult = await authenticator.authenticateOperator({
  operatorId: 'alice',
  credentialType: 'password',
  credential: 'secure-password-123!',
  clientInfo: {
    instanceId: 'vscode',
    userAgent: 'Claude Code VS Code Extension',
    ipAddress: '192.168.1.100'
  }
});

if (authResult.success) {
  console.log('Authentication successful:', {
    sessionToken: authResult.sessionToken,
    expiresAt: authResult.expiresAt,
    permissions: authResult.permissions,
    teamIds: authResult.teamIds
  });
}
```

### Session Management

Validate and manage authentication sessions:

```typescript
// Validate active session
const sessionValidation = await authenticator.validateSession(sessionToken);

if (sessionValidation.valid) {
  console.log('Valid session:', {
    operatorId: sessionValidation.session?.operatorId,
    teamIds: sessionValidation.session?.teamIds,
    permissions: sessionValidation.session?.permissions
  });
}

// Revoke session (logout)
await authenticator.revokeSession(sessionId, 'logout');

// Revoke all sessions for operator (security incident)
const revokedCount = await authenticator.revokeAllOperatorSessions('alice', 'security_breach');
```

## Privacy and Security Testing

### Privacy Boundary Testing

Comprehensive privacy boundary testing framework:

```typescript
import { createPrivacyBoundaryTester } from 'soma';

const tester = createPrivacyBoundaryTester(vault, auditLogger, {
  enableDestructiveTesting: false,
  maxTestEntities: 100,
  timeoutMs: 30000,
  cleanupAfterTests: true
});

// Execute all privacy tests
const report = await tester.executeAllTests();

console.log('Privacy Test Report:', {
  overallScore: report.overallScore,
  riskLevel: report.riskLevel,
  passedTests: report.passedTests,
  failedTests: report.failedTests,
  violations: report.violations.length,
  recommendations: report.recommendations
});

// Add custom test suite
tester.addTestSuite({
  name: 'custom_privacy_tests',
  description: 'Custom privacy validation tests',
  tests: [
    {
      name: 'api_key_masking_test',
      description: 'Verify API keys are masked in audit logs',
      category: 'data_masking',
      severity: 'high',
      execute: async (context) => {
        // Custom test implementation
        return {
          testName: 'api_key_masking_test',
          category: 'data_masking',
          passed: true,
          severity: 'high',
          description: 'API keys properly masked',
          details: {},
          violations: [],
          recommendations: [],
          executionTimeMs: 0
        };
      }
    }
  ]
});
```

## Incident Response Integration

### Security Incident Management

Comprehensive incident response coordination:

```typescript
import { createSecurityIncidentResponse } from 'soma';

const incidentResponse = createSecurityIncidentResponse({
  incidentsDir: '.soma/incidents',
  responseTeam: [
    {
      id: 'alice',
      name: 'Alice Johnson',
      role: 'incident_commander',
      contactInfo: 'alice@company.com',
      expertise: ['forensics', 'containment'],
      availability: 'always'
    }
  ],
  escalationMatrix: [
    {
      condition: { severity: 'critical' },
      action: {
        escalateTo: ['alice'],
        notificationMethod: 'all',
        additionalSteps: ['Activate emergency response']
      }
    }
  ]
});

// Create incident from security alert
const incident = await incidentResponse.createIncident(
  'Unauthorized Cross-Team Data Access',
  'Operator attempted to access data from unauthorized team',
  'high',
  'unauthorized_access',
  'system_monitoring',
  ['alert_12345', 'alert_12346']
);

// Add evidence
await incidentResponse.addEvidence(incident.id, {
  type: 'log_entry',
  description: 'Audit log showing unauthorized access attempt',
  source: 'security_audit_logger',
  collectedAt: Date.now(),
  location: '.soma/security-audit/security-audit-2024-04-17.jsonl'
}, 'security_analyst');

// Implement containment
await incidentResponse.implementContainment(incident.id, {
  type: 'account_disable',
  description: 'Temporarily disable operator account pending investigation',
  impactAssessment: 'Low impact - single operator affected',
  automated: false
}, 'incident_commander');

// Get incident statistics
const stats = incidentResponse.getIncidentStatistics();
console.log('Incident Statistics:', {
  activeIncidents: stats.activeIncidentsCount,
  criticalIncidents: stats.criticalIncidentsCount,
  averageResolutionTime: stats.averageResolutionTime
});
```

## Performance Monitoring

### Organizational Context Performance

Monitor performance of organizational context operations:

```typescript
// Access performance metrics from vault
const vault = createVault({ baseDir: '.soma/vault' });

// Get team statistics
const teamStats = vault.getTeamStats();
console.log('Team Statistics:', teamStats);

// Monitor cache performance
const cacheStats = vault.getCacheStatistics();
console.log('Cache Performance:', {
  hitRate: cacheStats.hitRate,
  memoryUsage: cacheStats.memoryUsage,
  entryCount: cacheStats.entryCount
});

// Get benchmarking results
const benchmarks = vault.getBenchmarkResults();
console.log('Performance Benchmarks:', {
  teamQueryLatency: benchmarks.averageTeamQueryLatency,
  operatorQueryLatency: benchmarks.averageOperatorQueryLatency,
  cacheHitRate: benchmarks.cacheHitRate,
  systemPerformanceScore: benchmarks.overallSystemBenchmarks.performanceScore
});
```

### Alert Configuration

Configure performance alerts and thresholds:

```typescript
// Configure performance monitoring
const vault = createVault({
  baseDir: '.soma/vault',
  performanceConfig: {
    enabled: true,
    benchmarkInterval: 5 * 60 * 1000, // 5 minutes
    alertThresholds: {
      teamQueryLatencyMs: 100,
      operatorQueryLatencyMs: 100,
      cacheHitRatePercent: 80,
      memoryUsageMaxMB: 100,
      errorRateMaxPercent: 5
    }
  }
});

// Listen for performance alerts
vault.onPerformanceAlert((alert) => {
  console.log('Performance Alert:', {
    type: alert.alertType,
    severity: alert.severity,
    threshold: alert.threshold,
    currentValue: alert.currentValue,
    recommendations: alert.recommendations
  });
});
```

## Error Handling

### Common Error Patterns

Handle organizational context errors appropriately:

```typescript
try {
  const entity = await vault.read('insight', 'entity-id', operatorContext);
} catch (error) {
  if (error.message.includes('Access denied')) {
    // Handle authorization errors
    console.error('Insufficient permissions:', error.message);
    // Redirect to access request workflow
  } else if (error.message.includes('Team membership')) {
    // Handle team membership validation errors
    console.error('Team membership issue:', error.message);
    // Show team membership help
  } else {
    // Handle other errors
    console.error('Vault operation failed:', error.message);
  }
}

// Authentication error handling
try {
  const authResult = await authenticator.authenticateOperator(request);
  if (!authResult.success) {
    console.error('Authentication failed:', authResult.errors);
    
    // Handle specific error types
    if (authResult.errors.includes('Account is locked')) {
      // Show account lockout message
    } else if (authResult.errors.includes('Two-factor authentication')) {
      // Prompt for 2FA token
    }
  }
} catch (error) {
  console.error('Authentication system error:', error.message);
}
```

## Configuration

### Environment Variables

Required environment variables for organizational context:

```bash
# Operator identification
OPERATOR_ID=alice_uuid_123
CLAUDE_CODE_SESSION_ID=session_456
TEAM_ID=engineering
CLAUDE_CODE_INSTANCE_ID=vscode
CLAUDE_CODE_USER_AGENT="Claude Code VS Code Extension"

# SOMA configuration
SOMA_VAULT_DIR=.soma/vault
SOMA_ENABLE_ORGANIZATIONAL_CONTEXT=true
SOMA_TEAM_VALIDATION=strict

# Security configuration
SOMA_ENABLE_DATA_MASKING=true
SOMA_AUDIT_DATA_MASKING=true
SOMA_SECURITY_AUDIT_DIR=.soma/security-audit

# Performance monitoring
SOMA_ENABLE_PERFORMANCE_MONITORING=true
SOMA_BENCHMARK_INTERVAL=300000
```

### Configuration Files

Example organizational context configuration:

```typescript
// agentflow.config.ts
export default {
  organizationalContext: {
    enabled: true,
    teamValidation: 'strict', // 'strict' | 'permissive' | 'disabled'
    sessionCorrelation: {
      enabled: true,
      correlationWindow: 3600000, // 1 hour
      maxCorrelatedSessions: 10
    },
    briefing: {
      enabled: true,
      verbosity: 'medium', // 'low' | 'medium' | 'high'
      includePatterns: ['workflow', 'anti-pattern'],
      timeWindow: '7d'
    },
    governance: {
      enabled: true,
      autoPromote: false,
      validationWorkflows: true
    }
  }
};
```

## Migration Guide

### Upgrading Existing Systems

Steps to add organizational context to existing AgentFlow/SOMA installations:

1. **Update Dependencies**
   ```bash
   npm install @agentflow/core@latest soma@latest
   ```

2. **Configure Environment Variables**
   ```bash
   export OPERATOR_ID=$(uuidgen)
   export CLAUDE_CODE_SESSION_ID=$(uuidgen)
   export TEAM_ID="your-team-id"
   ```

3. **Update GraphBuilder Usage**
   ```typescript
   // Before
   const builder = createGraphBuilder({ agentId: 'main' });
   
   // After
   const builder = createGraphBuilder({
     agentId: 'main',
     operatorContext: {
       operatorId: process.env.OPERATOR_ID!,
       sessionId: process.env.CLAUDE_CODE_SESSION_ID!,
       teamId: process.env.TEAM_ID
     }
   });
   ```

4. **Add Session Hooks** (Optional)
   ```typescript
   const builder = createGraphBuilder({
     // ... existing config
     sessionHooks: {
       onSessionStart: async (context) => {
         console.log('Session started with briefing:', context.briefing);
         return { shouldProceed: true };
       }
     }
   });
   ```

5. **Configure Team Validation** (Optional)
   ```typescript
   const vault = createVault({
     baseDir: '.soma/vault',
     teamValidator: customValidator
   });
   ```

### Backward Compatibility

The organizational context features are designed to be backward compatible:

- **Existing code** continues to work without modification
- **New features** are opt-in through configuration
- **Default behavior** maintains current functionality
- **Gradual adoption** is supported through feature flags

## Best Practices

### Security Recommendations

1. **Operator Authentication**: Always validate operator identity before sensitive operations
2. **Team Boundaries**: Enforce strict team isolation for confidential data
3. **Audit Logging**: Enable comprehensive audit logging for compliance
4. **Access Control**: Use least-privilege access policies
5. **Session Management**: Implement appropriate session timeouts

### Performance Optimization

1. **Caching**: Enable organizational pattern caching for frequently accessed data
2. **Batching**: Use session-aware batching for bulk operations
3. **Indexes**: Leverage materialized indexes for team and operator queries
4. **Monitoring**: Monitor performance metrics and configure alerts

### Development Workflow

1. **Testing**: Use privacy boundary testing framework during development
2. **Documentation**: Document team structures and access policies
3. **Validation**: Validate organizational context in CI/CD pipelines
4. **Monitoring**: Set up monitoring dashboards for organizational features

## API Reference Summary

### Core Classes and Functions

| Class/Function | Purpose | Import Path |
|---|---|---|
| `createGraphBuilder()` | Create AgentFlow execution graphs with organizational context | `@agentflow/core` |
| `PolicyBridge` | Integrate governance policies with AgentFlow | `@agentflow/core` |
| `createVault()` | Create SOMA vault with team validation | `soma` |
| `createOperatorAuthenticator()` | Operator authentication and session management | `soma` |
| `createSecurityIncidentResponse()` | Security incident response coordination | `soma` |
| `createPrivacyBoundaryTester()` | Privacy boundary testing framework | `soma` |
| `getGlobalAuditLogger()` | Access security audit logging | `soma` |

### Environment Variables

| Variable | Description | Required |
|---|---|---|
| `OPERATOR_ID` | Unique operator identifier | Yes |
| `CLAUDE_CODE_SESSION_ID` | Session correlation ID | Yes |
| `TEAM_ID` | Team membership identifier | No |
| `CLAUDE_CODE_INSTANCE_ID` | Tool instance identifier | No |
| `SOMA_VAULT_DIR` | SOMA vault directory | No |
| `SOMA_ENABLE_ORGANIZATIONAL_CONTEXT` | Enable organizational features | No |

For complete API documentation, see the individual module documentation and TypeScript type definitions.