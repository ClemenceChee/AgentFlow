/**
 * Organizational Hooks - Index
 *
 * Centralized export for all organizational React hooks and utilities.
 */

// Re-export context types for convenience
export type {
  OrganizationalContextInterface,
  OrganizationalContextState,
} from '../../contexts/OrganizationalContext.js';
// Re-export organizational types
export type {
  OperatorActivityPattern,
  OperatorContext,
  OrganizationalIntelligence,
  OrganizationalTrace,
  PolicyStatus,
  SessionCorrelation,
  SessionHookData,
  TeamFilterState,
  TeamMembership,
  TeamPerformanceMetrics,
} from '../../types/organizational.js';
// Core organizational hooks
// Main organizational data hook (combines all functionality)
export {
  useOperatorActivity,
  useOrganizationalContext,
  useOrganizationalData,
  useOrganizationalIntelligence,
  useOrganizationalTraceFilter,
  useSessionCorrelation,
  useTeamFilter,
  useTeamPerformance,
} from './useOrganizationalData.js';
