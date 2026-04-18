/**
 * Approval Workflow Display
 *
 * Component for displaying and managing organizational approval workflows,
 * pending approvals, authorization requests, and workflow status tracking
 * with interactive approval actions and delegation capabilities.
 */

import React, { useState, useEffect, useMemo } from 'react';
import type { TeamAccessLevel } from '../../../types/organizational.js';

// Component props
interface ApprovalWorkflowDisplayProps {
  /** Team ID to show approvals for (optional, shows all if not provided) */
  teamId?: string;

  /** Current user's operator ID */
  operatorId?: string;

  /** Whether to show only approvals pending for current user */
  showOnlyMyApprovals?: boolean;

  /** Whether to show approval history */
  showHistory?: boolean;

  /** Whether to show delegation options */
  showDelegation?: boolean;

  /** Custom CSS class name */
  className?: string;

  /** Whether to show compact version */
  compact?: boolean;

  /** Callback when approval action is taken */
  onApprovalAction?: (approvalId: string, action: ApprovalAction, comment?: string) => void;

  /** Callback when delegation is requested */
  onDelegationRequest?: (approvalId: string, delegateToOperatorId: string) => void;
}

// Approval interfaces
interface ApprovalWorkflow {
  id: string;
  title: string;
  description: string;
  type: ApprovalType;
  priority: ApprovalPriority;
  status: ApprovalStatus;
  requesterId: string;
  requesterName?: string;
  assignedApprovers: ApprovalAssignment[];
  currentStage: number;
  totalStages: number;
  requestedAt: number;
  dueDate?: number;
  completedAt?: number;
  metadata: {
    resourceType?: string;
    resourceId?: string;
    teamId?: string;
    policyRule?: string;
    riskLevel?: 'low' | 'medium' | 'high' | 'critical';
    businessJustification?: string;
    technicalDetails?: string;
  };
  approvalStages: ApprovalStage[];
  history: ApprovalHistoryEntry[];
  attachments?: ApprovalAttachment[];
}

interface ApprovalAssignment {
  operatorId: string;
  operatorName?: string;
  role: 'primary' | 'fallback' | 'observer';
  requiredAccessLevel: TeamAccessLevel;
  canDelegate: boolean;
}

interface ApprovalStage {
  id: string;
  name: string;
  description: string;
  requiredApprovals: number;
  receivedApprovals: number;
  status: 'pending' | 'approved' | 'rejected' | 'skipped';
  approvers: ApprovalAssignment[];
  completedAt?: number;
  skipConditions?: string[];
}

interface ApprovalHistoryEntry {
  timestamp: number;
  operatorId: string;
  operatorName?: string;
  action: ApprovalAction;
  comment?: string;
  stage: string;
  metadata?: Record<string, any>;
}

interface ApprovalAttachment {
  id: string;
  name: string;
  type: string;
  size: number;
  uploadedAt: number;
  uploadedBy: string;
  url?: string;
}

// Approval enums
type ApprovalType =
  | 'policy_exception'
  | 'access_grant'
  | 'data_access'
  | 'configuration_change'
  | 'team_modification'
  | 'governance_override'
  | 'security_exemption'
  | 'operational_change';

type ApprovalPriority = 'urgent' | 'high' | 'medium' | 'low';
type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'expired';
type ApprovalAction = 'approve' | 'reject' | 'delegate' | 'request_info' | 'cancel';

// Configuration
const APPROVAL_TYPE_CONFIG: Record<ApprovalType, {
  label: string;
  icon: string;
  color: string;
  description: string;
}> = {
  policy_exception: {
    label: 'Policy Exception',
    icon: '🛡️',
    color: 'var(--org-policy)',
    description: 'Request to bypass or modify policy requirements'
  },
  access_grant: {
    label: 'Access Grant',
    icon: '🔐',
    color: 'var(--org-access)',
    description: 'Request for elevated or additional access permissions'
  },
  data_access: {
    label: 'Data Access',
    icon: '📊',
    color: 'var(--org-data)',
    description: 'Request to access restricted or sensitive data'
  },
  configuration_change: {
    label: 'Configuration Change',
    icon: '⚙️',
    color: 'var(--org-config)',
    description: 'Request to modify system or policy configurations'
  },
  team_modification: {
    label: 'Team Modification',
    icon: '👥',
    color: 'var(--org-team)',
    description: 'Request to modify team membership or structure'
  },
  governance_override: {
    label: 'Governance Override',
    icon: '📋',
    color: 'var(--org-governance)',
    description: 'Request to override governance rules or procedures'
  },
  security_exemption: {
    label: 'Security Exemption',
    icon: '🔒',
    color: 'var(--org-security)',
    description: 'Request for security policy exemption'
  },
  operational_change: {
    label: 'Operational Change',
    icon: '🔄',
    color: 'var(--org-operational)',
    description: 'Request to modify operational procedures'
  }
};

const PRIORITY_CONFIG: Record<ApprovalPriority, {
  label: string;
  color: string;
  urgency: number;
}> = {
  urgent: { label: 'Urgent', color: 'var(--fail)', urgency: 4 },
  high: { label: 'High', color: 'var(--warn)', urgency: 3 },
  medium: { label: 'Medium', color: 'var(--org-primary)', urgency: 2 },
  low: { label: 'Low', color: 'var(--t3)', urgency: 1 }
};

/**
 * Approval Workflow Display Component
 */
export function ApprovalWorkflowDisplay({
  teamId,
  operatorId,
  showOnlyMyApprovals = false,
  showHistory = false,
  showDelegation = true,
  className = '',
  compact = false,
  onApprovalAction,
  onDelegationRequest
}: ApprovalWorkflowDisplayProps) {
  const [approvals, setApprovals] = useState<ApprovalWorkflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedApproval, setSelectedApproval] = useState<string | null>(null);
  const [actionComment, setActionComment] = useState('');
  const [showCommentDialog, setShowCommentDialog] = useState<{
    approvalId: string;
    action: ApprovalAction;
  } | null>(null);

  // Load approval workflows
  useEffect(() => {
    const loadApprovals = async () => {
      try {
        setLoading(true);
        setError(null);

        const params = new URLSearchParams({
          ...(teamId && { teamId }),
          ...(operatorId && { operatorId }),
          ...(showOnlyMyApprovals && { assignedTo: operatorId || '' })
        });

        const response = await fetch(`/api/approvals?${params}`);
        if (!response.ok) {
          throw new Error(`Failed to load approvals: ${response.statusText}`);
        }

        const data = await response.json();
        setApprovals(data.approvals || []);

      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load approvals');
        // Generate mock data for development
        const mockApprovals = generateMockApprovals();
        setApprovals(mockApprovals);
      } finally {
        setLoading(false);
      }
    };

    loadApprovals();
  }, [teamId, operatorId, showOnlyMyApprovals]);

  // Generate mock approval data (for development)
  const generateMockApprovals = (): ApprovalWorkflow[] => {
    const types: ApprovalType[] = ['policy_exception', 'access_grant', 'data_access'];
    const priorities: ApprovalPriority[] = ['urgent', 'high', 'medium', 'low'];
    const statuses: ApprovalStatus[] = ['pending', 'approved', 'rejected'];

    return Array.from({ length: 5 }, (_, index) => {
      const type = types[index % types.length];
      const priority = priorities[index % priorities.length];
      const status = index === 0 ? 'pending' : statuses[index % statuses.length];
      const requestedAt = Date.now() - (index * 24 * 60 * 60 * 1000);

      return {
        id: `approval-${index + 1}`,
        title: `${APPROVAL_TYPE_CONFIG[type].label} Request #${index + 1}`,
        description: `Request for ${APPROVAL_TYPE_CONFIG[type].description.toLowerCase()}`,
        type,
        priority,
        status,
        requesterId: `operator-${index + 1}`,
        requesterName: `Operator ${index + 1}`,
        assignedApprovers: [
          {
            operatorId: operatorId || 'current-operator',
            operatorName: 'Current User',
            role: 'primary',
            requiredAccessLevel: 'admin',
            canDelegate: true
          }
        ],
        currentStage: status === 'pending' ? 1 : 2,
        totalStages: 2,
        requestedAt,
        dueDate: requestedAt + (7 * 24 * 60 * 60 * 1000), // 7 days from request
        completedAt: status !== 'pending' ? requestedAt + (2 * 24 * 60 * 60 * 1000) : undefined,
        metadata: {
          resourceType: 'team_data',
          resourceId: `resource-${index}`,
          teamId: teamId || `team-${index}`,
          riskLevel: ['low', 'medium', 'high'][index % 3] as any,
          businessJustification: `Business justification for ${type} request`,
          technicalDetails: 'Technical implementation details and requirements'
        },
        approvalStages: [
          {
            id: 'stage-1',
            name: 'Initial Review',
            description: 'Primary reviewer assessment',
            requiredApprovals: 1,
            receivedApprovals: status === 'pending' ? 0 : 1,
            status: status === 'pending' ? 'pending' : 'approved',
            approvers: [
              {
                operatorId: operatorId || 'current-operator',
                role: 'primary',
                requiredAccessLevel: 'admin',
                canDelegate: true
              }
            ],
            completedAt: status !== 'pending' ? requestedAt + (60 * 60 * 1000) : undefined
          },
          {
            id: 'stage-2',
            name: 'Final Approval',
            description: 'Senior review and final decision',
            requiredApprovals: 1,
            receivedApprovals: status === 'approved' ? 1 : 0,
            status: status === 'approved' ? 'approved' : status === 'rejected' ? 'rejected' : 'pending',
            approvers: [
              {
                operatorId: 'senior-approver',
                operatorName: 'Senior Approver',
                role: 'primary',
                requiredAccessLevel: 'admin',
                canDelegate: false
              }
            ],
            completedAt: status === 'approved' ? requestedAt + (2 * 24 * 60 * 60 * 1000) : undefined
          }
        ],
        history: status !== 'pending' ? [
          {
            timestamp: requestedAt + (60 * 60 * 1000),
            operatorId: operatorId || 'current-operator',
            operatorName: 'Current User',
            action: 'approve',
            comment: 'Initial approval with minor conditions',
            stage: 'stage-1'
          }
        ] : [],
        attachments: [
          {
            id: 'attachment-1',
            name: 'justification_document.pdf',
            type: 'application/pdf',
            size: 256000,
            uploadedAt: requestedAt,
            uploadedBy: `operator-${index + 1}`
          }
        ]
      };
    });
  };

  // Filter and sort approvals
  const filteredApprovals = useMemo(() => {
    let filtered = approvals;

    // Filter by team if specified
    if (teamId) {
      filtered = filtered.filter(approval => approval.metadata.teamId === teamId);
    }

    // Filter by assignments if showOnlyMyApprovals is true
    if (showOnlyMyApprovals && operatorId) {
      filtered = filtered.filter(approval =>
        approval.assignedApprovers.some(approver => approver.operatorId === operatorId)
      );
    }

    // Sort by priority and due date
    return filtered.sort((a, b) => {
      const priorityDiff = PRIORITY_CONFIG[b.priority].urgency - PRIORITY_CONFIG[a.priority].urgency;
      if (priorityDiff !== 0) return priorityDiff;

      const aDue = a.dueDate || Infinity;
      const bDue = b.dueDate || Infinity;
      return aDue - bDue;
    });
  }, [approvals, teamId, operatorId, showOnlyMyApprovals]);

  // Get pending approvals for current user
  const myPendingApprovals = useMemo(() => {
    if (!operatorId) return [];

    return filteredApprovals.filter(approval =>
      approval.status === 'pending' &&
      approval.assignedApprovers.some(approver => approver.operatorId === operatorId)
    );
  }, [filteredApprovals, operatorId]);

  // Handle approval action
  const handleApprovalAction = (approvalId: string, action: ApprovalAction, comment?: string) => {
    if (onApprovalAction) {
      onApprovalAction(approvalId, action, comment);
    }

    // Update local state
    setApprovals(prev => prev.map(approval => {
      if (approval.id !== approvalId) return approval;

      const newHistory: ApprovalHistoryEntry = {
        timestamp: Date.now(),
        operatorId: operatorId || 'unknown',
        operatorName: 'Current User',
        action,
        comment,
        stage: `stage-${approval.currentStage}`
      };

      return {
        ...approval,
        status: action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : approval.status,
        completedAt: action === 'approve' || action === 'reject' ? Date.now() : approval.completedAt,
        history: [...approval.history, newHistory]
      };
    }));

    setShowCommentDialog(null);
    setActionComment('');
  };

  // Show comment dialog for actions that require comments
  const showActionCommentDialog = (approvalId: string, action: ApprovalAction) => {
    setShowCommentDialog({ approvalId, action });
    setActionComment('');
  };

  // Format time remaining
  const formatTimeRemaining = (dueDate: number): string => {
    const now = Date.now();
    const remaining = dueDate - now;

    if (remaining < 0) return 'Overdue';

    const days = Math.floor(remaining / (24 * 60 * 60 * 1000));
    const hours = Math.floor((remaining % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));

    if (days > 0) return `${days}d ${hours}h remaining`;
    if (hours > 0) return `${hours}h remaining`;
    return 'Due soon';
  };

  // Check if current user can approve
  const canCurrentUserApprove = (approval: ApprovalWorkflow): boolean => {
    if (!operatorId || approval.status !== 'pending') return false;

    return approval.assignedApprovers.some(approver =>
      approver.operatorId === operatorId && approver.role === 'primary'
    );
  };

  const containerClasses = [
    'org-card',
    'approval-workflow-display',
    compact ? 'compact' : '',
    className
  ].filter(Boolean).join(' ');

  // Loading state
  if (loading) {
    return (
      <div className={containerClasses}>
        <div className="org-card__header">
          <div className="org-card__title">
            <span className="approval-workflow-display__icon">✅</span>
            Approval Workflows
          </div>
        </div>
        <div className="org-card__content">
          <div className="approval-workflow-loading">
            <div className="approval-workflow-loading-spinner" />
            <div className="approval-workflow-loading-text">
              Loading approval workflows...
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error && filteredApprovals.length === 0) {
    return (
      <div className={containerClasses}>
        <div className="org-card__header">
          <div className="org-card__title">
            <span className="approval-workflow-display__icon">✅</span>
            Approval Workflows
          </div>
        </div>
        <div className="org-card__content">
          <div className="approval-workflow-error">
            <div className="approval-workflow-error__icon">⚠️</div>
            <div className="approval-workflow-error__message">
              {error}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={containerClasses}>
      <div className="org-card__header">
        <div className="org-card__title">
          <span className="approval-workflow-display__icon">✅</span>
          Approval Workflows
          {myPendingApprovals.length > 0 && (
            <span className="approval-workflow-display__pending-count">
              {myPendingApprovals.length} pending
            </span>
          )}
        </div>
        {!compact && (
          <div className="org-card__subtitle">
            {filteredApprovals.length} total workflow{filteredApprovals.length !== 1 ? 's' : ''}
            {teamId && ` for team ${teamId.substring(0, 8)}`}
          </div>
        )}
      </div>

      <div className="org-card__content">
        {/* My Pending Approvals Summary */}
        {myPendingApprovals.length > 0 && !compact && (
          <div className="approval-workflow-pending-summary">
            <div className="approval-workflow-pending-summary__header">
              <div className="approval-workflow-pending-summary__title">
                ⏳ Requires Your Approval ({myPendingApprovals.length})
              </div>
            </div>
            <div className="approval-workflow-pending-list">
              {myPendingApprovals.slice(0, 3).map(approval => {
                const typeConfig = APPROVAL_TYPE_CONFIG[approval.type];
                const priorityConfig = PRIORITY_CONFIG[approval.priority];

                return (
                  <div key={approval.id} className="approval-workflow-pending-item">
                    <div className="approval-workflow-pending-item__header">
                      <div className="approval-workflow-pending-item__type">
                        <span
                          className="approval-workflow-pending-item__icon"
                          style={{ color: typeConfig.color }}
                        >
                          {typeConfig.icon}
                        </span>
                        <span className="approval-workflow-pending-item__title">
                          {approval.title}
                        </span>
                      </div>
                      <div
                        className="approval-workflow-pending-item__priority"
                        style={{ color: priorityConfig.color }}
                      >
                        {priorityConfig.label}
                      </div>
                    </div>

                    {approval.dueDate && (
                      <div className="approval-workflow-pending-item__due">
                        {formatTimeRemaining(approval.dueDate)}
                      </div>
                    )}

                    <div className="approval-workflow-pending-item__actions">
                      <button
                        className="approval-workflow-action approval-workflow-action--approve"
                        onClick={() => showActionCommentDialog(approval.id, 'approve')}
                      >
                        Approve
                      </button>
                      <button
                        className="approval-workflow-action approval-workflow-action--reject"
                        onClick={() => showActionCommentDialog(approval.id, 'reject')}
                      >
                        Reject
                      </button>
                      <button
                        className="approval-workflow-action approval-workflow-action--info"
                        onClick={() => showActionCommentDialog(approval.id, 'request_info')}
                      >
                        Request Info
                      </button>
                    </div>
                  </div>
                );
              })}

              {myPendingApprovals.length > 3 && (
                <div className="approval-workflow-pending-more">
                  +{myPendingApprovals.length - 3} more pending approval{myPendingApprovals.length - 3 !== 1 ? 's' : ''}
                </div>
              )}
            </div>
          </div>
        )}

        {/* All Approvals List */}
        {filteredApprovals.length > 0 ? (
          <div className="approval-workflow-list">
            <div className="approval-workflow-list__header">
              <div className="approval-workflow-list__title">
                All Workflows
              </div>
            </div>

            {filteredApprovals.slice(0, compact ? 5 : 10).map(approval => {
              const typeConfig = APPROVAL_TYPE_CONFIG[approval.type];
              const priorityConfig = PRIORITY_CONFIG[approval.priority];
              const canApprove = canCurrentUserApprove(approval);
              const isExpanded = selectedApproval === approval.id;

              return (
                <div
                  key={approval.id}
                  className={`approval-workflow-item ${approval.status} ${isExpanded ? 'expanded' : ''}`}
                >
                  <button
                    className="approval-workflow-item__header"
                    onClick={() => setSelectedApproval(isExpanded ? null : approval.id)}
                  >
                    <div className="approval-workflow-item__main">
                      <div className="approval-workflow-item__type">
                        <span
                          className="approval-workflow-item__icon"
                          style={{ color: typeConfig.color }}
                        >
                          {typeConfig.icon}
                        </span>
                        <span className="approval-workflow-item__title">
                          {approval.title}
                        </span>
                      </div>

                      <div className="approval-workflow-item__meta">
                        <div
                          className="approval-workflow-item__priority"
                          style={{ color: priorityConfig.color }}
                        >
                          {priorityConfig.label}
                        </div>
                        <div className={`approval-workflow-item__status ${approval.status}`}>
                          {approval.status}
                        </div>
                        <div className="approval-workflow-item__stage">
                          Stage {approval.currentStage}/{approval.totalStages}
                        </div>
                      </div>
                    </div>

                    <div className="approval-workflow-item__arrow">
                      {isExpanded ? '▲' : '▼'}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="approval-workflow-item__details">
                      <div className="approval-workflow-item__description">
                        {approval.description}
                      </div>

                      {approval.metadata.businessJustification && (
                        <div className="approval-workflow-detail-section">
                          <div className="approval-workflow-detail-section__title">
                            Business Justification
                          </div>
                          <div className="approval-workflow-detail-section__content">
                            {approval.metadata.businessJustification}
                          </div>
                        </div>
                      )}

                      {/* Approval Stages */}
                      <div className="approval-workflow-detail-section">
                        <div className="approval-workflow-detail-section__title">
                          Approval Stages
                        </div>
                        <div className="approval-workflow-stages">
                          {approval.approvalStages.map((stage, index) => (
                            <div
                              key={stage.id}
                              className={`approval-workflow-stage ${stage.status}`}
                            >
                              <div className="approval-workflow-stage__header">
                                <div className="approval-workflow-stage__number">
                                  {index + 1}
                                </div>
                                <div className="approval-workflow-stage__info">
                                  <div className="approval-workflow-stage__name">
                                    {stage.name}
                                  </div>
                                  <div className="approval-workflow-stage__description">
                                    {stage.description}
                                  </div>
                                </div>
                                <div className={`approval-workflow-stage__status ${stage.status}`}>
                                  {stage.status}
                                </div>
                              </div>

                              <div className="approval-workflow-stage__progress">
                                {stage.receivedApprovals}/{stage.requiredApprovals} approvals
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Actions for current user */}
                      {canApprove && (
                        <div className="approval-workflow-item__actions">
                          <button
                            className="approval-workflow-action approval-workflow-action--approve"
                            onClick={() => showActionCommentDialog(approval.id, 'approve')}
                          >
                            Approve
                          </button>
                          <button
                            className="approval-workflow-action approval-workflow-action--reject"
                            onClick={() => showActionCommentDialog(approval.id, 'reject')}
                          >
                            Reject
                          </button>
                          <button
                            className="approval-workflow-action approval-workflow-action--info"
                            onClick={() => showActionCommentDialog(approval.id, 'request_info')}
                          >
                            Request Info
                          </button>
                          {showDelegation && (
                            <button
                              className="approval-workflow-action approval-workflow-action--delegate"
                              onClick={() => showActionCommentDialog(approval.id, 'delegate')}
                            >
                              Delegate
                            </button>
                          )}
                        </div>
                      )}

                      {/* History */}
                      {showHistory && approval.history.length > 0 && (
                        <div className="approval-workflow-detail-section">
                          <div className="approval-workflow-detail-section__title">
                            History
                          </div>
                          <div className="approval-workflow-history">
                            {approval.history.slice(0, 5).map((entry, index) => (
                              <div key={index} className="approval-workflow-history-entry">
                                <div className="approval-workflow-history-entry__timestamp">
                                  {new Date(entry.timestamp).toLocaleString()}
                                </div>
                                <div className="approval-workflow-history-entry__action">
                                  {entry.operatorName} {entry.action}d
                                </div>
                                {entry.comment && (
                                  <div className="approval-workflow-history-entry__comment">
                                    "{entry.comment}"
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {filteredApprovals.length > (compact ? 5 : 10) && (
              <div className="approval-workflow-more">
                +{filteredApprovals.length - (compact ? 5 : 10)} more workflow{filteredApprovals.length - (compact ? 5 : 10) !== 1 ? 's' : ''}
              </div>
            )}
          </div>
        ) : (
          <div className="approval-workflow-empty">
            <div className="approval-workflow-empty__icon">✅</div>
            <div className="approval-workflow-empty__message">
              No approval workflows
            </div>
            <div className="approval-workflow-empty__description">
              Approval workflows will appear here when they require your attention.
            </div>
          </div>
        )}
      </div>

      {/* Comment Dialog */}
      {showCommentDialog && (
        <div className="approval-workflow-comment-dialog-overlay">
          <div className="approval-workflow-comment-dialog">
            <div className="approval-workflow-comment-dialog__header">
              <div className="approval-workflow-comment-dialog__title">
                {showCommentDialog.action === 'approve' && 'Approve Request'}
                {showCommentDialog.action === 'reject' && 'Reject Request'}
                {showCommentDialog.action === 'request_info' && 'Request Additional Information'}
                {showCommentDialog.action === 'delegate' && 'Delegate Approval'}
              </div>
              <button
                className="approval-workflow-comment-dialog__close"
                onClick={() => setShowCommentDialog(null)}
              >
                ×
              </button>
            </div>

            <div className="approval-workflow-comment-dialog__content">
              <div className="approval-workflow-comment-dialog__field">
                <label className="approval-workflow-comment-dialog__label">
                  Comment {showCommentDialog.action === 'reject' ? '(required)' : '(optional)'}:
                </label>
                <textarea
                  className="approval-workflow-comment-dialog__textarea"
                  value={actionComment}
                  onChange={(e) => setActionComment(e.target.value)}
                  placeholder={`Add a comment for this ${showCommentDialog.action} action...`}
                  rows={4}
                />
              </div>
            </div>

            <div className="approval-workflow-comment-dialog__actions">
              <button
                className="approval-workflow-comment-dialog__action approval-workflow-comment-dialog__action--cancel"
                onClick={() => setShowCommentDialog(null)}
              >
                Cancel
              </button>
              <button
                className={`approval-workflow-comment-dialog__action approval-workflow-comment-dialog__action--confirm`}
                onClick={() => handleApprovalAction(showCommentDialog.approvalId, showCommentDialog.action, actionComment || undefined)}
                disabled={showCommentDialog.action === 'reject' && !actionComment.trim()}
              >
                {showCommentDialog.action === 'approve' && 'Approve'}
                {showCommentDialog.action === 'reject' && 'Reject'}
                {showCommentDialog.action === 'request_info' && 'Request Info'}
                {showCommentDialog.action === 'delegate' && 'Delegate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Export default for easy importing
export default ApprovalWorkflowDisplay;