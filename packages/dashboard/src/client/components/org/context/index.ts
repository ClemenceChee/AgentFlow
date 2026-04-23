/**
 * Organizational Context Components
 *
 * Components for displaying operator context, organizational metadata,
 * and contextual information in trace details and sidebars.
 */

// Main organizational context panel
export { OrganizationalContextPanel } from './OrganizationalContextPanel.js';

// Individual context display components
export { OperatorContextCard } from './OperatorContextCard.js';
export { TeamMembershipDisplay } from './TeamMembershipDisplay.js';
export { InstanceInfoDisplay } from './InstanceInfoDisplay.js';
export { SessionCorrelationView } from './SessionCorrelationView.js';

// Navigation and state preservation
export { SessionNavigationLinks, sessionNavigationUtils } from './SessionNavigationLinks.js';

// Graceful degradation support
export {
  OrganizationalGracefulDegradation,
  useOrganizationalGracefulDegradation,
  assessOrganizationalDataCompleteness
} from './OrganizationalGracefulDegradation.js';

// Context summary and utility components
export { ContextSummary } from './ContextSummary.js';
export { OrganizationalBadge } from './OrganizationalBadge.js';

// Type exports
export type { DegradationLevel, OrganizationalDataCompleteness } from './OrganizationalGracefulDegradation.js';