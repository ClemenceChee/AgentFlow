/**
 * Organizational Hooks - Index
 *
 * Centralized export for all organizational React hooks and utilities.
 */

// Core organizational hooks
export {
  useOrganizationalContext,
  useTeamFilter,
  useOrganizationalIntelligence,
  useOperatorActivity,
  useSessionCorrelation,
  useTeamPerformance,
  useOrganizationalTraceFilter
} from './useOrganizationalData.js';

// Main organizational data hook (combines all functionality)
export { useOrganizationalData } from './useOrganizationalData.js';

// Re-export context types for convenience
export type {
  OrganizationalContextState,
  OrganizationalContextInterface
} from '../../contexts/OrganizationalContext.js';

// Re-export organizational types
export type {
  OperatorContext,
  TeamMembership,
  SessionCorrelation,
  PolicyStatus,
  SessionHookData,
  OperatorActivityPattern,
  TeamPerformanceMetrics,
  OrganizationalTrace,
  TeamFilterState,
  OrganizationalIntelligence
} from '../../types/organizational.js';