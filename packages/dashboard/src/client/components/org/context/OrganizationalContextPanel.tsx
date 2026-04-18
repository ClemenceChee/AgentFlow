/**
 * Organizational Context Panel
 *
 * Main panel component that displays comprehensive organizational context
 * for traces, including operator context, team information, session correlation,
 * and policy status in a collapsible, user-friendly interface.
 */

import React, { useState, useCallback, useMemo } from 'react';
import { useOrganizationalContext } from '../../../contexts/OrganizationalContext.js';
import type { OrganizationalTrace } from '../../../types/organizational.js';

// Component props
interface OrganizationalContextPanelProps {
  /** The trace to display organizational context for */
  trace?: OrganizationalTrace | null;

  /** Panel position relative to the trace view */
  position?: 'right' | 'left' | 'bottom';

  /** Initial collapsed state */
  defaultCollapsed?: boolean;

  /** Callback when panel collapse state changes */
  onCollapseChange?: (collapsed: boolean) => void;

  /** Whether to show the panel even if no organizational data is available */
  showEmpty?: boolean;

  /** Custom CSS class name */
  className?: string;

  /** Whether to show a compact version of the panel */
  compact?: boolean;
}

/**
 * Main Organizational Context Panel Component
 */
export function OrganizationalContextPanel({
  trace,
  position = 'right',
  defaultCollapsed = false,
  onCollapseChange,
  showEmpty = false,
  className = '',
  compact = false
}: OrganizationalContextPanelProps) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const { state } = useOrganizationalContext();

  // Handle panel collapse/expand
  const handleToggleCollapse = useCallback(() => {
    const newCollapsed = !isCollapsed;
    setIsCollapsed(newCollapsed);
    onCollapseChange?.(newCollapsed);
  }, [isCollapsed, onCollapseChange]);

  // Analyze organizational data completeness
  const dataAnalysis = useMemo(() => {
    if (!trace) {
      return {
        hasOperatorContext: false,
        hasTeamContext: false,
        hasPolicyStatus: false,
        hasSessionCorrelation: false,
        completeness: 0
      };
    }

    // Simple analysis without external utility
    const hasOperatorContext = !!trace.operatorContext;
    const hasTeamContext = !!trace.operatorContext?.teamId;
    const hasPolicyStatus = !!trace.policyStatus;
    const hasSessionCorrelation = !!trace.sessionCorrelation;

    const completeness = [hasOperatorContext, hasTeamContext, hasPolicyStatus, hasSessionCorrelation]
      .filter(Boolean).length / 4;

    return {
      hasOperatorContext,
      hasTeamContext,
      hasPolicyStatus,
      hasSessionCorrelation,
      completeness
    };
  }, [trace]);

  // Determine if panel should be shown
  const shouldShowPanel = useMemo(() => {
    if (showEmpty) return true;
    if (!trace) return false;
    return dataAnalysis.completeness > 0 || trace.operatorContext;
  }, [trace, dataAnalysis.completeness, showEmpty]);

  // Don't render if no data and not forced to show
  if (!shouldShowPanel) {
    return null;
  }

  const panelClasses = [
    'org-context-panel',
    `org-context-panel--${position}`,
    isCollapsed ? 'collapsed' : 'expanded',
    compact ? 'compact' : '',
    className
  ].filter(Boolean).join(' ');

  return (
    <div className={panelClasses}>
      {/* Panel Header */}
      <div className="org-context-panel__header" style={{ padding: '12px', borderBottom: '1px solid #e1e4e8' }}>
        <div className="org-context-panel__title" style={{ display: 'flex', alignItems: 'center' }}>
          <span style={{ fontWeight: 'bold' }}>Organizational Context</span>
          {dataAnalysis.completeness > 0 && (
            <div
              className="org-context-panel__completeness"
              title={`${Math.round(dataAnalysis.completeness * 100)}% data completeness`}
              style={{
                display: 'inline-block',
                width: '40px',
                height: '4px',
                background: '#e1e4e8',
                borderRadius: '2px',
                marginLeft: '8px',
                position: 'relative',
                overflow: 'hidden'
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  height: '100%',
                  width: `${dataAnalysis.completeness * 100}%`,
                  background: '#28a745',
                  borderRadius: '2px',
                  transition: 'width 0.3s ease'
                }}
              />
            </div>
          )}
        </div>

        <button
          className="org-context-panel__toggle"
          onClick={handleToggleCollapse}
          aria-label={isCollapsed ? 'Expand panel' : 'Collapse panel'}
          title={isCollapsed ? 'Show organizational context' : 'Hide organizational context'}
          style={{ background: 'none', border: 'none', cursor: 'pointer' }}
        >
          {isCollapsed ? '▶' : '▼'}
        </button>
      </div>

      {/* Panel Content */}
      {!isCollapsed && (
        <div className="org-context-panel__content" style={{ padding: '12px' }}>
          {trace ? (
            <OrganizationalContextContent
              trace={trace}
              compact={compact}
              dataAnalysis={dataAnalysis}
            />
          ) : (
            <OrganizationalContextEmpty />
          )}
        </div>
      )}

      {/* Collapsed State Indicator */}
      {isCollapsed && dataAnalysis.completeness > 0 && (
        <div className="org-context-panel__collapsed-indicator" style={{ padding: '8px 12px' }}>
          <div className="org-context-panel__collapsed-badges">
            {dataAnalysis.hasOperatorContext && (
              <span className="org-collapsed-badge" title="Operator Context Available" style={{ margin: '0 4px' }}>
                👤
              </span>
            )}
            {dataAnalysis.hasTeamContext && (
              <span className="org-collapsed-badge" title="Team Context Available" style={{ margin: '0 4px' }}>
                👥
              </span>
            )}
            {dataAnalysis.hasPolicyStatus && (
              <span className="org-collapsed-badge" title="Policy Status Available" style={{ margin: '0 4px' }}>
                🛡️
              </span>
            )}
            {dataAnalysis.hasSessionCorrelation && (
              <span className="org-collapsed-badge" title="Session Correlation Available" style={{ margin: '0 4px' }}>
                🔗
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Content component when organizational data is available
 */
function OrganizationalContextContent({
  trace,
  compact,
  dataAnalysis
}: {
  trace: OrganizationalTrace;
  compact: boolean;
  dataAnalysis: any;
}) {
  const cardStyle = {
    border: '1px solid #e1e4e8',
    borderRadius: '6px',
    marginBottom: '12px',
    padding: '12px'
  };

  return (
    <>
      {/* Operator Context Section */}
      {trace.operatorContext && (
        <div style={cardStyle}>
          <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>👤 Operator Context</div>
          <div style={{ fontSize: '14px', lineHeight: '1.4' }}>
            <div><strong>Operator ID:</strong> {trace.operatorContext.operatorId}</div>
            <div><strong>Session ID:</strong> {trace.operatorContext.sessionId}</div>
            {trace.operatorContext.teamId && (
              <div><strong>Team ID:</strong> {trace.operatorContext.teamId}</div>
            )}
            <div><strong>Instance:</strong> {trace.operatorContext.instanceId}</div>
            <div><strong>Timestamp:</strong> {new Date(trace.operatorContext.timestamp).toLocaleString()}</div>
          </div>
        </div>
      )}

      {/* Session Correlation */}
      {trace.sessionCorrelation && (
        <div style={cardStyle}>
          <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>🔗 Session Correlation</div>
          <div style={{ fontSize: '14px', lineHeight: '1.4' }}>
            <div><strong>Correlation ID:</strong> {trace.sessionCorrelation.correlationId}</div>
            <div><strong>Confidence:</strong> {Math.round(trace.sessionCorrelation.confidenceScore * 100)}%</div>
            <div><strong>Related Sessions:</strong> {trace.sessionCorrelation.relatedSessions.length}</div>
            {trace.sessionCorrelation.crossInstanceTracking && (
              <div><strong>Continuity Score:</strong> {Math.round(trace.sessionCorrelation.crossInstanceTracking.continuityScore * 100)}%</div>
            )}
          </div>
        </div>
      )}

      {/* Policy Status Summary */}
      {trace.policyStatus && (
        <div style={cardStyle}>
          <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>🛡️ Policy Status</div>
          <div style={{ fontSize: '14px', lineHeight: '1.4' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              marginBottom: '8px',
              color: trace.policyStatus.complianceStatus === 'compliant' ? '#28a745' :
                    trace.policyStatus.complianceStatus === 'violation' ? '#dc3545' : '#ffc107'
            }}>
              <span style={{ marginRight: '8px' }}>
                {trace.policyStatus.complianceStatus === 'compliant' && '✓'}
                {trace.policyStatus.complianceStatus === 'violation' && '✗'}
                {trace.policyStatus.complianceStatus === 'warning' && '⚠️'}
              </span>
              <span style={{ textTransform: 'capitalize' }}>{trace.policyStatus.complianceStatus}</span>
            </div>
            <div><strong>Evaluation ID:</strong> {trace.policyStatus.evaluationId}</div>
            <div><strong>Policies Evaluated:</strong> {trace.policyStatus.policiesEvaluated.length}</div>
            {trace.policyStatus.governanceRecommendations.length > 0 && (
              <div><strong>Recommendations:</strong> {trace.policyStatus.governanceRecommendations.length}</div>
            )}
          </div>
        </div>
      )}

      {/* Data Completeness Debug Info */}
      <div style={{ ...cardStyle, opacity: 0.7, borderStyle: 'dashed' }}>
        <div style={{ fontWeight: 'bold', marginBottom: '8px', fontSize: '12px' }}>🔍 Debug Info</div>
        <div style={{ fontSize: '12px', lineHeight: '1.4' }}>
          <div>Completeness: {Math.round(dataAnalysis.completeness * 100)}%</div>
          <div>Operator Context: {dataAnalysis.hasOperatorContext ? '✓' : '✗'}</div>
          <div>Team Context: {dataAnalysis.hasTeamContext ? '✓' : '✗'}</div>
          <div>Policy Status: {dataAnalysis.hasPolicyStatus ? '✓' : '✗'}</div>
          <div>Session Correlation: {dataAnalysis.hasSessionCorrelation ? '✓' : '✗'}</div>
        </div>
      </div>
    </>
  );
}

/**
 * Content component when no organizational data is available
 */
function OrganizationalContextEmpty() {
  return (
    <div className="org-context-panel__empty">
      <div style={{
        textAlign: 'center',
        padding: '24px',
        color: '#6a737d',
        fontSize: '14px'
      }}>
        <div style={{ marginBottom: '12px', fontSize: '24px' }}>
          📋
        </div>
        <div style={{ marginBottom: '8px' }}>
          No organizational context available
        </div>
        <div style={{ fontSize: '12px', opacity: 0.7 }}>
          This trace was created before organizational features were enabled
        </div>
      </div>
    </div>
  );
}

// Export with error boundary wrapped
export default OrganizationalContextPanel;