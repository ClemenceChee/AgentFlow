/**
 * Policy Bridge Integration for Organizational Intelligence
 *
 * Connects AgentFlow execution with SOMA governance policies to provide
 * intelligent organizational guidance, compliance validation, and
 * policy-driven execution recommendations.
 *
 * @module
 */

import type { OperatorContext, ExecutionGraph, TraceEvent } from './types.js';

// ---------------------------------------------------------------------------
// Policy Bridge Interfaces
// ---------------------------------------------------------------------------

export interface PolicyBridgeConfig {
  readonly enabled: boolean;
  readonly somaIntegration: {
    enabled: boolean;
    vaultPath?: string;
    governanceEnabled: boolean;
  };
  readonly policyEvaluation: {
    enablePreExecution: boolean;
    enableDuringExecution: boolean;
    enablePostExecution: boolean;
    timeoutMs: number;
  };
  readonly recommendations: {
    enableBriefings: boolean;
    enableRealTimeGuidance: boolean;
    verbosity: 'minimal' | 'normal' | 'detailed';
  };
  readonly compliance: {
    enforceTeamBoundaries: boolean;
    requireOperatorValidation: boolean;
    auditAllActions: boolean;
  };
}

export interface OrganizationalPolicy {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly type: 'access_control' | 'data_privacy' | 'governance' | 'workflow' | 'compliance';
  readonly scope: 'operator' | 'team' | 'organization';
  readonly priority: number;
  readonly enabled: boolean;
  readonly conditions: PolicyCondition[];
  readonly actions: PolicyAction[];
  readonly metadata: {
    readonly createdBy: string;
    readonly approvedBy?: string[];
    readonly version: number;
    readonly effectiveDate: number;
    readonly expirationDate?: number;
  };
}

export interface PolicyCondition {
  readonly field: string;
  readonly operator: 'equals' | 'not_equals' | 'contains' | 'matches' | 'in' | 'greater_than' | 'less_than';
  readonly value: unknown;
  readonly weight: number;
}

export interface PolicyAction {
  readonly type: 'allow' | 'deny' | 'warn' | 'audit' | 'require_approval' | 'inject_context';
  readonly parameters: Record<string, unknown>;
  readonly message?: string;
}

export interface PolicyEvaluationContext {
  readonly operatorContext?: OperatorContext;
  readonly executionContext: {
    readonly agentId: string;
    readonly trigger: string;
    readonly graphId: string;
    readonly traceId: string;
  };
  readonly sessionContext?: {
    readonly relatedSessions: string[];
    readonly teamActivity: unknown;
    readonly crossTeamAccess: boolean;
  };
  readonly metadata: Record<string, unknown>;
}

export interface PolicyEvaluationResult {
  readonly policyId: string;
  readonly result: 'allow' | 'deny' | 'warn' | 'require_approval';
  readonly confidence: number;
  readonly reasoning: string;
  readonly appliedConditions: PolicyCondition[];
  readonly recommendations: string[];
  readonly auditRequired: boolean;
  readonly metadata: Record<string, unknown>;
}

export interface OrganizationalGuidance {
  readonly status: 'available' | 'limited' | 'unavailable';
  readonly briefing: string;
  readonly recommendations: Recommendation[];
  readonly warnings: PolicyWarning[];
  readonly approvals: ApprovalRequirement[];
  readonly contextInjections: ContextInjection[];
  readonly complianceStatus: ComplianceStatus;
}

export interface Recommendation {
  readonly id: string;
  readonly type: 'workflow' | 'performance' | 'security' | 'collaboration' | 'learning';
  readonly title: string;
  readonly description: string;
  readonly priority: 'low' | 'medium' | 'high' | 'critical';
  readonly actionable: boolean;
  readonly estimatedImpact: string;
  readonly relatedPolicies: string[];
  readonly expiresAt?: number;
}

export interface PolicyWarning {
  readonly id: string;
  readonly severity: 'info' | 'warning' | 'error' | 'critical';
  readonly title: string;
  readonly description: string;
  readonly policyId: string;
  readonly requiresAction: boolean;
  readonly suggestedActions: string[];
  readonly deadline?: number;
}

export interface ApprovalRequirement {
  readonly id: string;
  readonly type: 'operator_approval' | 'team_lead_approval' | 'cross_team_approval' | 'governance_approval';
  readonly description: string;
  readonly requiredApprovers: string[];
  readonly currentApprovals: string[];
  readonly deadline: number;
  readonly blockingExecution: boolean;
}

export interface ContextInjection {
  readonly id: string;
  readonly type: 'team_knowledge' | 'operator_history' | 'related_patterns' | 'governance_context';
  readonly title: string;
  readonly content: unknown;
  readonly priority: number;
  readonly persistent: boolean;
}

export interface ComplianceStatus {
  readonly compliant: boolean;
  readonly score: number;
  readonly violations: ComplianceViolation[];
  readonly requirements: ComplianceRequirement[];
  readonly auditTrail: AuditEntry[];
}

export interface ComplianceViolation {
  readonly id: string;
  readonly policyId: string;
  readonly severity: 'minor' | 'major' | 'critical';
  readonly description: string;
  readonly remediation: string[];
  readonly reportRequired: boolean;
}

export interface ComplianceRequirement {
  readonly id: string;
  readonly type: 'documentation' | 'approval' | 'validation' | 'audit';
  readonly description: string;
  readonly fulfilled: boolean;
  readonly evidence?: unknown;
}

export interface AuditEntry {
  readonly id: string;
  readonly action: string;
  readonly operatorId: string;
  readonly timestamp: number;
  readonly context: unknown;
  readonly result: 'success' | 'failure' | 'partial';
}

// ---------------------------------------------------------------------------
// Policy Bridge Implementation
// ---------------------------------------------------------------------------

export class PolicyBridge {
  private config: PolicyBridgeConfig;
  private policies: Map<string, OrganizationalPolicy> = new Map();
  private somaVault: any = null;
  private initialized = false;

  constructor(config: PolicyBridgeConfig) {
    this.config = config;
  }

  /**
   * Initialize the policy bridge with SOMA integration.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Initialize SOMA integration if enabled
    if (this.config.somaIntegration.enabled) {
      try {
        await this.initializeSOMAIntegration();
      } catch (error) {
        console.warn('[PolicyBridge] SOMA integration failed:', error);
        // Continue with limited functionality
      }
    }

    // Load default organizational policies
    this.loadDefaultPolicies();

    this.initialized = true;
  }

  /**
   * Initialize SOMA vault integration.
   */
  private async initializeSOMAIntegration(): Promise<void> {
    try {
      // Dynamic import to avoid hard dependency
      const { createVault } = await import('../../soma/src/vault.js');
      this.somaVault = createVault({
        baseDir: this.config.somaIntegration.vaultPath || '.soma/vault'
      });
    } catch (error) {
      // Try alternative import paths
      try {
        const { createVault } = await import('../../../soma/src/vault.js');
        this.somaVault = createVault({
          baseDir: this.config.somaIntegration.vaultPath || '.soma/vault'
        });
      } catch (altError) {
        throw new Error(`SOMA integration failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  /**
   * Load default organizational policies.
   */
  private loadDefaultPolicies(): void {
    // Operator Authentication Policy
    this.policies.set('operator_auth', {
      id: 'operator_auth',
      name: 'Operator Authentication Policy',
      description: 'Ensures proper operator authentication and context validation',
      type: 'access_control',
      scope: 'organization',
      priority: 100,
      enabled: true,
      conditions: [
        {
          field: 'operatorContext.operatorId',
          operator: 'not_equals',
          value: null,
          weight: 1.0
        },
        {
          field: 'operatorContext.sessionId',
          operator: 'not_equals',
          value: null,
          weight: 1.0
        }
      ],
      actions: [
        {
          type: 'audit',
          parameters: { category: 'authentication' },
          message: 'Operator authentication validated'
        }
      ],
      metadata: {
        createdBy: 'system',
        version: 1,
        effectiveDate: Date.now()
      }
    });

    // Team Boundary Policy
    this.policies.set('team_boundaries', {
      id: 'team_boundaries',
      name: 'Team Data Boundary Policy',
      description: 'Enforces team-scoped data access and privacy boundaries',
      type: 'data_privacy',
      scope: 'team',
      priority: 90,
      enabled: true,
      conditions: [
        {
          field: 'operatorContext.teamId',
          operator: 'not_equals',
          value: null,
          weight: 0.8
        }
      ],
      actions: [
        {
          type: 'inject_context',
          parameters: { contextType: 'team_scope' },
          message: 'Team context injected for privacy compliance'
        },
        {
          type: 'audit',
          parameters: { category: 'data_access' }
        }
      ],
      metadata: {
        createdBy: 'system',
        version: 1,
        effectiveDate: Date.now()
      }
    });

    // Cross-Team Access Policy
    this.policies.set('cross_team_access', {
      id: 'cross_team_access',
      name: 'Cross-Team Access Control Policy',
      description: 'Governs access to data and patterns across team boundaries',
      type: 'governance',
      scope: 'organization',
      priority: 80,
      enabled: true,
      conditions: [
        {
          field: 'sessionContext.crossTeamAccess',
          operator: 'equals',
          value: true,
          weight: 1.0
        }
      ],
      actions: [
        {
          type: 'warn',
          parameters: {},
          message: 'Cross-team access detected - ensure proper authorization'
        },
        {
          type: 'audit',
          parameters: { category: 'cross_team_access', priority: 'high' }
        }
      ],
      metadata: {
        createdBy: 'system',
        version: 1,
        effectiveDate: Date.now()
      }
    });

    // Session Correlation Policy
    this.policies.set('session_correlation', {
      id: 'session_correlation',
      name: 'Session Correlation Policy',
      description: 'Manages session correlation and continuity across instances',
      type: 'workflow',
      scope: 'operator',
      priority: 70,
      enabled: true,
      conditions: [
        {
          field: 'sessionContext.relatedSessions.length',
          operator: 'greater_than',
          value: 0,
          weight: 0.6
        }
      ],
      actions: [
        {
          type: 'inject_context',
          parameters: { contextType: 'session_correlation' },
          message: 'Related session context available for continuity'
        }
      ],
      metadata: {
        createdBy: 'system',
        version: 1,
        effectiveDate: Date.now()
      }
    });

    // Governance Workflow Policy
    this.policies.set('governance_workflow', {
      id: 'governance_workflow',
      name: 'Governance Workflow Policy',
      description: 'Enforces governance workflows for high-risk or complex operations',
      type: 'governance',
      scope: 'organization',
      priority: 85,
      enabled: this.config.somaIntegration.governanceEnabled,
      conditions: [
        {
          field: 'metadata.complexity',
          operator: 'greater_than',
          value: 0.8,
          weight: 0.7
        }
      ],
      actions: [
        {
          type: 'require_approval',
          parameters: { approverRole: 'senior_operator' },
          message: 'High-complexity operation requires senior operator approval'
        }
      ],
      metadata: {
        createdBy: 'system',
        version: 1,
        effectiveDate: Date.now()
      }
    });
  }

  /**
   * Evaluate organizational policies for a given context.
   */
  async evaluatePolicies(context: PolicyEvaluationContext): Promise<PolicyEvaluationResult[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    const results: PolicyEvaluationResult[] = [];

    for (const policy of this.policies.values()) {
      if (!policy.enabled) continue;

      try {
        const result = await this.evaluatePolicy(policy, context);
        results.push(result);
      } catch (error) {
        console.warn(`[PolicyBridge] Policy evaluation failed for ${policy.id}:`, error);

        // Add error result
        results.push({
          policyId: policy.id,
          result: 'warn',
          confidence: 0.0,
          reasoning: `Policy evaluation failed: ${error instanceof Error ? error.message : String(error)}`,
          appliedConditions: [],
          recommendations: ['Review policy configuration'],
          auditRequired: true,
          metadata: { error: true }
        });
      }
    }

    return results;
  }

  /**
   * Evaluate a single policy against the context.
   */
  private async evaluatePolicy(
    policy: OrganizationalPolicy,
    context: PolicyEvaluationContext
  ): Promise<PolicyEvaluationResult> {
    let score = 0;
    let totalWeight = 0;
    const appliedConditions: PolicyCondition[] = [];

    // Evaluate conditions
    for (const condition of policy.conditions) {
      const conditionMet = this.evaluateCondition(condition, context);

      if (conditionMet) {
        score += condition.weight;
        appliedConditions.push(condition);
      }

      totalWeight += condition.weight;
    }

    const confidence = totalWeight > 0 ? score / totalWeight : 0;

    // Determine result based on actions and confidence
    let result: PolicyEvaluationResult['result'] = 'allow';
    const recommendations: string[] = [];
    let auditRequired = false;

    for (const action of policy.actions) {
      switch (action.type) {
        case 'deny':
          if (confidence > 0.7) result = 'deny';
          break;
        case 'warn':
          if (confidence > 0.5) result = 'warn';
          break;
        case 'require_approval':
          if (confidence > 0.6) result = 'require_approval';
          break;
        case 'audit':
          auditRequired = true;
          break;
        case 'inject_context':
          recommendations.push(action.message || 'Context injection recommended');
          break;
      }
    }

    // Generate reasoning
    const reasoning = this.generatePolicyReasoning(policy, appliedConditions, confidence, result);

    return {
      policyId: policy.id,
      result,
      confidence,
      reasoning,
      appliedConditions,
      recommendations,
      auditRequired,
      metadata: {
        policyType: policy.type,
        policyScope: policy.scope,
        priority: policy.priority
      }
    };
  }

  /**
   * Evaluate a single policy condition.
   */
  private evaluateCondition(condition: PolicyCondition, context: PolicyEvaluationContext): boolean {
    const contextValue = this.getContextValue(condition.field, context);

    switch (condition.operator) {
      case 'equals':
        return contextValue === condition.value;
      case 'not_equals':
        return contextValue !== condition.value;
      case 'contains':
        return typeof contextValue === 'string' &&
               typeof condition.value === 'string' &&
               contextValue.includes(condition.value);
      case 'matches':
        return typeof contextValue === 'string' &&
               typeof condition.value === 'string' &&
               new RegExp(condition.value).test(contextValue);
      case 'in':
        return Array.isArray(condition.value) && condition.value.includes(contextValue);
      case 'greater_than':
        return typeof contextValue === 'number' &&
               typeof condition.value === 'number' &&
               contextValue > condition.value;
      case 'less_than':
        return typeof contextValue === 'number' &&
               typeof condition.value === 'number' &&
               contextValue < condition.value;
      default:
        return false;
    }
  }

  /**
   * Get value from context using dot notation path.
   */
  private getContextValue(path: string, context: PolicyEvaluationContext): unknown {
    const parts = path.split('.');
    let current: any = context;

    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = current[part];
      } else {
        return null;
      }
    }

    return current;
  }

  /**
   * Generate human-readable reasoning for policy evaluation.
   */
  private generatePolicyReasoning(
    policy: OrganizationalPolicy,
    appliedConditions: PolicyCondition[],
    confidence: number,
    result: PolicyEvaluationResult['result']
  ): string {
    if (appliedConditions.length === 0) {
      return `Policy "${policy.name}" conditions not met`;
    }

    const conditionDescriptions = appliedConditions.map(c =>
      `${c.field} ${c.operator} ${JSON.stringify(c.value)}`
    );

    return `Policy "${policy.name}" ${result} (confidence: ${(confidence * 100).toFixed(1)}%) - Conditions: ${conditionDescriptions.join(', ')}`;
  }

  /**
   * Generate organizational guidance based on policy evaluation.
   */
  async generateOrganizationalGuidance(
    context: PolicyEvaluationContext,
    policyResults: PolicyEvaluationResult[]
  ): Promise<OrganizationalGuidance> {
    const recommendations: Recommendation[] = [];
    const warnings: PolicyWarning[] = [];
    const approvals: ApprovalRequirement[] = [];
    const contextInjections: ContextInjection[] = [];
    const violations: ComplianceViolation[] = [];
    const auditEntries: AuditEntry[] = [];

    let complianceScore = 1.0;
    let briefingParts: string[] = [];

    // Process policy results
    for (const result of policyResults) {
      briefingParts.push(`${result.policyId}: ${result.result}`);

      if (result.result === 'deny') {
        complianceScore -= 0.3;
        violations.push({
          id: `violation_${result.policyId}`,
          policyId: result.policyId,
          severity: 'critical',
          description: result.reasoning,
          remediation: result.recommendations,
          reportRequired: true
        });
      } else if (result.result === 'warn') {
        complianceScore -= 0.1;
        warnings.push({
          id: `warning_${result.policyId}`,
          severity: 'warning',
          title: `Policy Warning: ${result.policyId}`,
          description: result.reasoning,
          policyId: result.policyId,
          requiresAction: false,
          suggestedActions: result.recommendations
        });
      } else if (result.result === 'require_approval') {
        approvals.push({
          id: `approval_${result.policyId}`,
          type: 'governance_approval',
          description: result.reasoning,
          requiredApprovers: ['senior_operator'],
          currentApprovals: [],
          deadline: Date.now() + (24 * 60 * 60 * 1000), // 24 hours
          blockingExecution: true
        });
      }

      // Generate recommendations based on policy results
      if (result.recommendations.length > 0) {
        recommendations.push({
          id: `rec_${result.policyId}`,
          type: 'workflow',
          title: `Policy Recommendation: ${result.policyId}`,
          description: result.recommendations[0],
          priority: result.confidence > 0.8 ? 'high' : 'medium',
          actionable: true,
          estimatedImpact: 'Improved compliance and workflow efficiency',
          relatedPolicies: [result.policyId]
        });
      }

      // Create audit entries for significant policy actions
      if (result.auditRequired) {
        auditEntries.push({
          id: `audit_${Date.now()}_${result.policyId}`,
          action: `policy_evaluation_${result.result}`,
          operatorId: context.operatorContext?.operatorId || 'unknown',
          timestamp: Date.now(),
          context: {
            policyId: result.policyId,
            confidence: result.confidence,
            appliedConditions: result.appliedConditions
          },
          result: 'success'
        });
      }
    }

    // Add SOMA-based context injections if available
    if (this.somaVault && context.operatorContext?.teamId) {
      try {
        const teamContext = await this.getTeamContextInjection(context.operatorContext.teamId);
        if (teamContext) {
          contextInjections.push(teamContext);
        }
      } catch (error) {
        console.warn('[PolicyBridge] Team context injection failed:', error);
      }
    }

    const briefing = briefingParts.length > 0
      ? `Policy evaluation completed: ${briefingParts.join(', ')}`
      : 'No significant policy actions required';

    const compliant = violations.length === 0 && approvals.length === 0;

    return {
      status: this.somaVault ? 'available' : 'limited',
      briefing,
      recommendations,
      warnings,
      approvals,
      contextInjections,
      complianceStatus: {
        compliant,
        score: Math.max(0, Math.min(1, complianceScore)),
        violations,
        requirements: approvals.map(a => ({
          id: a.id,
          type: 'approval',
          description: a.description,
          fulfilled: a.currentApprovals.length >= a.requiredApprovers.length
        })),
        auditTrail: auditEntries
      }
    };
  }

  /**
   * Get team context injection from SOMA vault.
   */
  private async getTeamContextInjection(teamId: string): Promise<ContextInjection | null> {
    if (!this.somaVault) return null;

    try {
      const teamEntities = this.somaVault.listByTeam(teamId, { limit: 5 });

      if (teamEntities.length > 0) {
        return {
          id: `team_context_${teamId}`,
          type: 'team_knowledge',
          title: `Team ${teamId} Recent Activity`,
          content: {
            recentActivities: teamEntities.map((e: any) => ({
              id: e.id,
              name: e.name,
              type: e.type,
              updated: e.updated
            })),
            activityCount: teamEntities.length,
            lastActivity: teamEntities[0]?.updated
          },
          priority: 5,
          persistent: false
        };
      }
    } catch (error) {
      console.warn('[PolicyBridge] Team context retrieval failed:', error);
    }

    return null;
  }

  /**
   * Add a custom policy to the policy bridge.
   */
  addPolicy(policy: OrganizationalPolicy): void {
    this.policies.set(policy.id, policy);
  }

  /**
   * Remove a policy from the policy bridge.
   */
  removePolicy(policyId: string): boolean {
    return this.policies.delete(policyId);
  }

  /**
   * Get current policy configuration.
   */
  getPolicies(): OrganizationalPolicy[] {
    return Array.from(this.policies.values());
  }

  /**
   * Update policy bridge configuration.
   */
  updateConfig(config: Partial<PolicyBridgeConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// ---------------------------------------------------------------------------
// Default Policy Bridge Factory
// ---------------------------------------------------------------------------

/**
 * Create a default policy bridge with standard organizational policies.
 */
export function createPolicyBridge(config?: Partial<PolicyBridgeConfig>): PolicyBridge {
  const defaultConfig: PolicyBridgeConfig = {
    enabled: true,
    somaIntegration: {
      enabled: true,
      vaultPath: '.soma/vault',
      governanceEnabled: true
    },
    policyEvaluation: {
      enablePreExecution: true,
      enableDuringExecution: false,
      enablePostExecution: true,
      timeoutMs: 1000
    },
    recommendations: {
      enableBriefings: true,
      enableRealTimeGuidance: false,
      verbosity: 'normal'
    },
    compliance: {
      enforceTeamBoundaries: true,
      requireOperatorValidation: true,
      auditAllActions: true
    }
  };

  const mergedConfig = { ...defaultConfig, ...config };
  return new PolicyBridge(mergedConfig);
}

// ---------------------------------------------------------------------------
// Export Types
// ---------------------------------------------------------------------------

export type {
  PolicyBridgeConfig,
  OrganizationalPolicy,
  PolicyCondition,
  PolicyAction,
  PolicyEvaluationContext,
  PolicyEvaluationResult,
  OrganizationalGuidance,
  Recommendation,
  PolicyWarning,
  ApprovalRequirement,
  ContextInjection,
  ComplianceStatus
};