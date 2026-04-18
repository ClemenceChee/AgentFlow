/**
 * Organizational context types for AgentFlow Dashboard.
 *
 * These interfaces define the organizational intelligence data structures
 * that extend the core trace and execution data with operator context,
 * team membership, session correlation, and policy compliance information.
 */

/** Core operator context information */
export interface OperatorContext {
  /** UUID of the human operator */
  readonly operatorId: string;
  /** Claude Code session ID */
  readonly sessionId: string;
  /** Team membership identifier */
  readonly teamId?: string;
  /** Specific tool invocation ID */
  readonly instanceId?: string;
  /** When the operator action occurred */
  readonly timestamp?: number;
  /** Client/tool information (CLI, desktop, web, VS Code) */
  readonly userAgent?: string;
}

/** Team membership and access information */
export interface TeamMembership {
  /** Team identifier */
  teamId: string;
  /** Human-readable team name */
  teamName: string;
  /** Operator's role within the team */
  role?: string;
  /** Team access permissions */
  permissions: string[];
  /** When the membership was established */
  memberSince?: number;
  /** Whether this is the primary team */
  isPrimary?: boolean;
}

/** Session correlation data */
export interface SessionCorrelation {
  /** Related session IDs with confidence scores */
  relatedSessions: Array<{
    sessionId: string;
    confidence: number;
    relationshipType: 'continuation' | 'similar-problem' | 'handoff' | 'collaboration';
    timestamp: number;
  }>;
  /** Session continuation chain */
  continuationChain?: string[];
  /** Similarity analysis results */
  similaritySummary?: {
    problemType: string;
    solutionPattern: string;
    confidence: number;
  };
}

/** Policy compliance and governance status */
export interface PolicyStatus {
  /** Overall compliance status */
  compliance: 'compliant' | 'warning' | 'violation' | 'pending';
  /** Policy evaluations */
  evaluations: Array<{
    policyId: string;
    policyName: string;
    status: 'pass' | 'fail' | 'warning';
    message: string;
    severity: 'info' | 'warning' | 'error';
  }>;
  /** Governance recommendations */
  recommendations: Array<{
    type: 'action' | 'approval' | 'review';
    message: string;
    priority: 'low' | 'medium' | 'high';
    actionRequired?: boolean;
  }>;
  /** Required approvals */
  pendingApprovals?: Array<{
    approvalType: string;
    requiredRole: string;
    reason: string;
    expiresAt?: number;
  }>;
}

/** Session hook execution data */
export interface SessionHookData {
  /** Executed hooks */
  executedHooks: Array<{
    hookName: 'onSessionStart' | 'onSessionInitialized' | 'onSessionEnd';
    executionTime: number;
    status: 'success' | 'error' | 'timeout';
    duration: number;
    error?: string;
  }>;
  /** Organizational briefing data */
  organizationalBriefing?: {
    teamContext?: string;
    sessionCorrelation?: string;
    recommendations?: string[];
    warnings?: string[];
  };
}

/** Operator activity pattern data */
export interface OperatorActivityPattern {
  /** Activity timeline entries */
  timeline: Array<{
    timestamp: number;
    sessionId: string;
    activityType: 'session-start' | 'session-end' | 'collaboration' | 'knowledge-share';
    description: string;
    relatedOperators?: string[];
  }>;
  /** Identified patterns */
  patterns: Array<{
    patternType: 'workflow' | 'problem-solving' | 'collaboration';
    description: string;
    frequency: number;
    confidence: number;
    recommendations?: string[];
  }>;
}

/** Team performance metrics */
export interface TeamPerformanceMetrics {
  /** Team identifier */
  teamId: string;
  /** Performance statistics */
  metrics: {
    successRate: number;
    averageExecutionTime: number;
    totalExecutions: number;
    activeOperators: number;
    collaborationScore: number;
  };
  /** Query performance data */
  queryPerformance: {
    averageLatency: number;
    cacheHitRate: number;
    throughput: number;
  };
  /** Trend data */
  trends: {
    timeframe: 'hour' | 'day' | 'week';
    dataPoints: Array<{
      timestamp: number;
      successRate: number;
      executionTime: number;
      queryLatency: number;
    }>;
  };
}

/** Session correlation with enhanced data */
export interface EnhancedSessionCorrelation {
  readonly correlationId: string;
  readonly relatedSessions: Array<{
    readonly sessionId: string;
    readonly similarity: number;
    readonly relationshipType: 'workflow_similarity' | 'problem_pattern' | 'knowledge_transfer' | 'solution_reuse';
    readonly timestamp: number;
    readonly summary: string;
  }>;
  readonly confidenceScore: number;
  readonly similarityMetrics: {
    readonly workflowSimilarity: number;
    readonly contextOverlap: number;
    readonly problemDomainMatch: number;
    readonly solutionPatternMatch: number;
  };
  readonly crossInstanceTracking: {
    readonly instanceTransitions: Array<{
      readonly fromInstance: string;
      readonly toInstance: string;
      readonly timestamp: number;
      readonly continuityScore: number;
    }>;
    readonly handoffQuality: number;
    readonly continuityScore: number;
  };
}

/** Enhanced policy status with governance information */
export interface EnhancedPolicyStatus {
  readonly evaluationId: string;
  readonly complianceStatus: 'compliant' | 'warning' | 'violation' | 'pending';
  readonly policiesEvaluated: Array<{
    readonly policyId: string;
    readonly policyName: string;
    readonly status: 'compliant' | 'violation' | 'warning';
    readonly severity: 'low' | 'medium' | 'high' | 'critical';
    readonly details: string;
  }>;
  readonly governanceRecommendations: Array<{
    readonly type: 'optimization' | 'reliability' | 'security' | 'compliance';
    readonly priority: 'low' | 'medium' | 'high' | 'urgent';
    readonly title: string;
    readonly description: string;
    readonly actionable: boolean;
    readonly estimatedImpact: 'low' | 'medium' | 'high';
  }>;
  readonly approvalWorkflow: {
    readonly required: boolean;
    readonly approvers: string[];
    readonly status: 'pending' | 'approved' | 'rejected';
  } | null;
  readonly exemptionStatus: {
    readonly granted: boolean;
    readonly reason: string;
    readonly expiresAt: number;
    readonly grantedBy: string;
  } | null;
}

/** Extended trace interface with organizational context - properly extends FullTrace structure */
export interface OrganizationalTrace {
  /** Core trace properties matching FullTrace */
  readonly filename: string;
  readonly agentId: string;
  readonly name?: string;
  readonly status: 'completed' | 'failed' | 'running';
  readonly startTime: number;
  readonly endTime: number;
  readonly trigger?: string;
  readonly nodes: Record<string, any>;

  /** Organizational context data */
  readonly operatorContext?: OperatorContext;
  readonly sessionCorrelation?: EnhancedSessionCorrelation;
  readonly policyStatus?: EnhancedPolicyStatus;
  readonly sessionHooks?: SessionHookData;

  /** Extended metadata */
  readonly metadata?: Record<string, unknown> & {
    organizationalFeatures?: {
      hasOperatorContext: boolean;
      hasTeamContext: boolean;
      hasPolicyStatus: boolean;
      hasSessionCorrelation: boolean;
    };
  };
}

/** Team filter state */
export interface TeamFilterState {
  selectedTeamId?: string;
  availableTeams: Array<{
    teamId: string;
    teamName: string;
    memberCount: number;
    isAccessible: boolean;
  }>;
  filterActive: boolean;
}

/** Organizational intelligence summary */
export interface OrganizationalIntelligence {
  /** Operator insights */
  operatorInsights: {
    totalOperators: number;
    activeOperators: number;
    collaborationEvents: number;
    knowledgeSharing: number;
  };
  /** Team insights */
  teamInsights: {
    totalTeams: number;
    activeTeams: number;
    crossTeamCollaboration: number;
    averageTeamSize: number;
  };
  /** Performance insights */
  performanceInsights: {
    organizationalQueryLatency: number;
    teamScopedCacheHitRate: number;
    sessionCorrelationAccuracy: number;
    policyComplianceRate: number;
  };
}