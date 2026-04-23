/**
 * Organizational Data Validators
 *
 * Utility functions for validating organizational context data
 * and ensuring data integrity across the dashboard.
 */

import type {
  OperatorContext,
  OrganizationalTrace,
  PolicyStatus,
  SessionCorrelation,
  TeamFilterState,
  TeamMembership,
} from '../../types/organizational.js';

/**
 * Validate operator context data
 */
export function validateOperatorContext(
  operatorContext: unknown,
): operatorContext is OperatorContext {
  if (!operatorContext || typeof operatorContext !== 'object') {
    return false;
  }

  const ctx = operatorContext as Partial<OperatorContext>;

  // Required fields
  if (!ctx.operatorId || typeof ctx.operatorId !== 'string') return false;
  if (!ctx.sessionId || typeof ctx.sessionId !== 'string') return false;

  // Optional fields type checking
  if (ctx.teamId !== undefined && typeof ctx.teamId !== 'string') return false;
  if (ctx.instanceId !== undefined && typeof ctx.instanceId !== 'string') return false;
  if (ctx.timestamp !== undefined && typeof ctx.timestamp !== 'number') return false;
  if (ctx.userAgent !== undefined && typeof ctx.userAgent !== 'string') return false;

  return true;
}

/**
 * Validate policy status data
 */
export function validatePolicyStatus(policyStatus: unknown): policyStatus is PolicyStatus {
  if (!policyStatus || typeof policyStatus !== 'object') {
    return false;
  }

  const status = policyStatus as Partial<PolicyStatus>;

  // Required fields
  if (
    !status.compliance ||
    !['compliant', 'warning', 'violation', 'pending'].includes(status.compliance)
  ) {
    return false;
  }

  if (!Array.isArray(status.evaluations)) return false;
  if (!Array.isArray(status.recommendations)) return false;

  // Validate evaluation structure
  for (const evaluation of status.evaluations) {
    if (!evaluation.policyId || typeof evaluation.policyId !== 'string') return false;
    if (!evaluation.status || !['pass', 'fail', 'warning'].includes(evaluation.status))
      return false;
  }

  return true;
}

/**
 * Validate session correlation data
 */
export function validateSessionCorrelation(
  correlation: unknown,
): correlation is SessionCorrelation {
  if (!correlation || typeof correlation !== 'object') {
    return false;
  }

  const corr = correlation as Partial<SessionCorrelation>;

  if (!Array.isArray(corr.relatedSessions)) return false;

  // Validate related sessions structure
  for (const session of corr.relatedSessions) {
    if (!session.sessionId || typeof session.sessionId !== 'string') return false;
    if (typeof session.confidence !== 'number' || session.confidence < 0 || session.confidence > 1)
      return false;
    if (
      !session.relationshipType ||
      !['continuation', 'similar-problem', 'handoff', 'collaboration'].includes(
        session.relationshipType,
      )
    ) {
      return false;
    }
    if (typeof session.timestamp !== 'number') return false;
  }

  return true;
}

/**
 * Validate team membership data
 */
export function validateTeamMembership(membership: unknown): membership is TeamMembership {
  if (!membership || typeof membership !== 'object') {
    return false;
  }

  const team = membership as Partial<TeamMembership>;

  // Required fields
  if (!team.teamId || typeof team.teamId !== 'string') return false;
  if (!team.teamName || typeof team.teamName !== 'string') return false;
  if (!Array.isArray(team.permissions)) return false;

  // Optional fields
  if (team.role !== undefined && typeof team.role !== 'string') return false;
  if (team.memberSince !== undefined && typeof team.memberSince !== 'number') return false;
  if (team.isPrimary !== undefined && typeof team.isPrimary !== 'boolean') return false;

  return true;
}

/**
 * Validate organizational trace data
 */
export function validateOrganizationalTrace(trace: unknown): trace is OrganizationalTrace {
  if (!trace || typeof trace !== 'object') {
    return false;
  }

  const orgTrace = trace as Partial<OrganizationalTrace>;

  // Required basic trace fields
  if (!orgTrace.id || typeof orgTrace.id !== 'string') return false;
  if (!orgTrace.agentId || typeof orgTrace.agentId !== 'string') return false;
  if (!orgTrace.name || typeof orgTrace.name !== 'string') return false;
  if (!orgTrace.status || typeof orgTrace.status !== 'string') return false;
  if (typeof orgTrace.startTime !== 'number') return false;
  if (typeof orgTrace.endTime !== 'number') return false;

  // Validate organizational extensions if present
  if (orgTrace.operatorContext && !validateOperatorContext(orgTrace.operatorContext)) return false;
  if (orgTrace.policyStatus && !validatePolicyStatus(orgTrace.policyStatus)) return false;
  if (orgTrace.sessionCorrelation && !validateSessionCorrelation(orgTrace.sessionCorrelation))
    return false;

  return true;
}

/**
 * Validate team filter state
 */
export function validateTeamFilterState(filterState: unknown): filterState is TeamFilterState {
  if (!filterState || typeof filterState !== 'object') {
    return false;
  }

  const filter = filterState as Partial<TeamFilterState>;

  if (filter.selectedTeamId !== undefined && typeof filter.selectedTeamId !== 'string')
    return false;
  if (!Array.isArray(filter.availableTeams)) return false;
  if (typeof filter.filterActive !== 'boolean') return false;

  // Validate available teams structure
  for (const team of filter.availableTeams) {
    if (!team.teamId || typeof team.teamId !== 'string') return false;
    if (!team.teamName || typeof team.teamName !== 'string') return false;
    if (typeof team.memberCount !== 'number') return false;
    if (typeof team.isAccessible !== 'boolean') return false;
  }

  return true;
}

/**
 * Check if operator has access to team data
 */
export function hasTeamAccess(
  _operatorId: string,
  teamId: string,
  allowedTeams: string[] = [],
  isSuperUser: boolean = false,
): boolean {
  if (isSuperUser) return true;
  if (!teamId) return true; // No team restrictions
  return allowedTeams.includes(teamId);
}

/**
 * Check if trace should be visible to operator
 */
export function isTraceVisible(
  trace: OrganizationalTrace,
  operatorId: string,
  allowedTeams: string[] = [],
  isSuperUser: boolean = false,
): boolean {
  // Super users can see everything
  if (isSuperUser) return true;

  // Traces without operator context are visible (backward compatibility)
  if (!trace.operatorContext) return true;

  // Same operator can always see their own traces
  if (trace.operatorContext.operatorId === operatorId) return true;

  // Check team access
  if (trace.operatorContext.teamId) {
    return allowedTeams.includes(trace.operatorContext.teamId);
  }

  // Default to visible if no team restrictions
  return true;
}

/**
 * Sanitize operator context for display (remove sensitive data)
 */
export function sanitizeOperatorContext(operatorContext: OperatorContext): OperatorContext {
  return {
    operatorId: operatorContext.operatorId,
    sessionId: operatorContext.sessionId,
    teamId: operatorContext.teamId,
    instanceId: operatorContext.instanceId,
    timestamp: operatorContext.timestamp,
    // Remove potentially sensitive user agent details
    userAgent: operatorContext.userAgent?.split(' ')[0] || operatorContext.userAgent,
  };
}

/**
 * Check data completeness for organizational features
 */
export function checkOrganizationalDataCompleteness(trace: OrganizationalTrace): {
  hasOperatorContext: boolean;
  hasTeamContext: boolean;
  hasPolicyStatus: boolean;
  hasSessionCorrelation: boolean;
  completeness: number; // 0-1 scale
} {
  const checks = {
    hasOperatorContext: !!trace.operatorContext,
    hasTeamContext: !!trace.operatorContext?.teamId,
    hasPolicyStatus: !!trace.policyStatus,
    hasSessionCorrelation: !!trace.sessionCorrelation,
  };

  const totalChecks = Object.keys(checks).length;
  const passedChecks = Object.values(checks).filter(Boolean).length;
  const completeness = passedChecks / totalChecks;

  return {
    ...checks,
    completeness,
  };
}

/**
 * Validate API response structure
 */
export function validateApiResponse<T>(
  response: unknown,
  validator: (data: unknown) => data is T,
): { valid: boolean; data?: T; error?: string } {
  try {
    if (!response || typeof response !== 'object') {
      return { valid: false, error: 'Invalid response format' };
    }

    if (validator(response)) {
      return { valid: true, data: response };
    }

    return { valid: false, error: 'Response data validation failed' };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Validation error',
    };
  }
}

/**
 * Type guards for runtime type checking
 */
export const TypeGuards = {
  isOperatorContext: validateOperatorContext,
  isPolicyStatus: validatePolicyStatus,
  isSessionCorrelation: validateSessionCorrelation,
  isTeamMembership: validateTeamMembership,
  isOrganizationalTrace: validateOrganizationalTrace,
  isTeamFilterState: validateTeamFilterState,
} as const;
