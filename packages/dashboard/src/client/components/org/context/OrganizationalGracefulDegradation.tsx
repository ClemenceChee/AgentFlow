/**
 * Organizational Graceful Degradation
 *
 * Component and utilities for handling graceful degradation when
 * organizational data is missing, incomplete, or temporarily unavailable.
 * Provides fallback experiences while maintaining core functionality.
 */

import React, { type ReactNode, useMemo } from 'react';
import type { OrganizationalTrace } from '../../../types/organizational.js';

// Degradation level enum
export type DegradationLevel =
  | 'none' // All organizational data available
  | 'partial' // Some data missing but core features work
  | 'limited' // Significant data missing, limited functionality
  | 'minimal' // Very limited data, basic fallbacks only
  | 'unavailable'; // No organizational data available

// Data completeness assessment
export interface OrganizationalDataCompleteness {
  level: DegradationLevel;
  score: number; // 0-1 completeness score
  missing: string[];
  available: string[];
  recommendations: string[];
}

// Component props for graceful degradation wrapper
interface OrganizationalGracefulDegradationProps {
  /** Children to render when data is sufficient */
  children: ReactNode;

  /** Trace data to assess */
  trace?: OrganizationalTrace | null;

  /** Minimum degradation level required to show children */
  minimumLevel?: DegradationLevel;

  /** Custom fallback component for insufficient data */
  fallback?: ReactNode;

  /** Whether to show degradation indicators */
  showIndicators?: boolean;

  /** Custom CSS class name */
  className?: string;

  /** Callback when degradation level changes */
  onDegradationChange?: (
    level: DegradationLevel,
    completeness: OrganizationalDataCompleteness,
  ) => void;
}

// Props for individual degradation components
interface DegradationComponentProps {
  completeness: OrganizationalDataCompleteness;
  compact?: boolean;
}

/**
 * Assess organizational data completeness
 */
export function assessOrganizationalDataCompleteness(
  trace?: OrganizationalTrace | null,
): OrganizationalDataCompleteness {
  if (!trace) {
    return {
      level: 'unavailable',
      score: 0,
      missing: ['trace', 'operatorContext', 'sessionCorrelation', 'policyStatus', 'teamMembership'],
      available: [],
      recommendations: [
        'Enable organizational tracing features',
        'Ensure Claude Code session hooks are configured',
      ],
    };
  }

  const available: string[] = [];
  const missing: string[] = [];
  const recommendations: string[] = [];

  // Check operator context
  if (trace.operatorContext) {
    available.push('operatorContext');
    if (trace.operatorContext.operatorId) available.push('operatorId');
    if (trace.operatorContext.sessionId) available.push('sessionId');
    if (trace.operatorContext.teamId) available.push('teamId');
    if (trace.operatorContext.instanceId) available.push('instanceId');
  } else {
    missing.push('operatorContext');
    recommendations.push('Configure operator identity tracking in Claude Code');
  }

  // Check session correlation
  if (trace.sessionCorrelation && trace.sessionCorrelation.correlatedSessions.length > 0) {
    available.push('sessionCorrelation');
  } else {
    missing.push('sessionCorrelation');
    recommendations.push('Enable session correlation features');
  }

  // Check policy status
  if (trace.policyStatus) {
    available.push('policyStatus');
  } else {
    missing.push('policyStatus');
    recommendations.push('Configure organizational policy evaluation');
  }

  // Check session hooks
  if (trace.sessionHooks) {
    available.push('sessionHooks');
    if (trace.sessionHooks.organizationalBriefing) {
      available.push('organizationalBriefing');
    }
  } else {
    missing.push('sessionHooks');
    recommendations.push('Enable SOMA session hooks integration');
  }

  // Calculate completeness score
  const totalFeatures = 5; // operatorContext, sessionCorrelation, policyStatus, sessionHooks, organizationalBriefing
  const availableCount = available.filter((item) =>
    [
      'operatorContext',
      'sessionCorrelation',
      'policyStatus',
      'sessionHooks',
      'organizationalBriefing',
    ].includes(item),
  ).length;
  const score = availableCount / totalFeatures;

  // Determine degradation level
  let level: DegradationLevel;
  if (score >= 0.8) {
    level = 'none';
  } else if (score >= 0.6) {
    level = 'partial';
  } else if (score >= 0.4) {
    level = 'limited';
  } else if (score >= 0.2) {
    level = 'minimal';
  } else {
    level = 'unavailable';
  }

  return { level, score, missing, available, recommendations };
}

/**
 * Minimal organizational context display for degraded state
 */
function MinimalOrganizationalContext({
  completeness,
  compact = false,
}: DegradationComponentProps) {
  return (
    <div className={`org-card degraded minimal ${compact ? 'compact' : ''}`}>
      <div className="org-card__header">
        <div className="org-card__title">
          <span className="degraded-icon">📋</span>
          Organizational Context
          <span className="degraded-badge">Limited</span>
        </div>
      </div>
      <div className="org-card__content">
        <div className="degraded-message">
          <div className="degraded-message__icon">ⓘ</div>
          <div className="degraded-message__text">
            {compact
              ? 'Limited organizational features available'
              : 'Some organizational context features are currently unavailable. Core tracing functionality remains active.'}
          </div>
        </div>

        {!compact && completeness.available.length > 0 && (
          <div className="degraded-available">
            <div className="degraded-available__label">Available:</div>
            <div className="degraded-available__items">
              {completeness.available.slice(0, 3).map((item) => (
                <span key={item} className="degraded-available-item">
                  ✓ {item.replace(/([A-Z])/g, ' $1').toLowerCase()}
                </span>
              ))}
              {completeness.available.length > 3 && (
                <span className="degraded-available-item">
                  +{completeness.available.length - 3} more
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Partial organizational context display for degraded state
 */
function PartialOrganizationalContext({
  completeness,
  compact = false,
}: DegradationComponentProps) {
  const hasOperatorContext = completeness.available.includes('operatorContext');
  const hasSessionCorrelation = completeness.available.includes('sessionCorrelation');

  return (
    <div className={`org-card degraded partial ${compact ? 'compact' : ''}`}>
      <div className="org-card__header">
        <div className="org-card__title">
          <span className="degraded-icon">📋</span>
          Organizational Context
          <div className="degraded-completeness">
            <div
              className="degraded-completeness__bar"
              style={{ width: `${completeness.score * 100}%` }}
            />
            <div className="degraded-completeness__text">
              {Math.round(completeness.score * 100)}%
            </div>
          </div>
        </div>
      </div>

      <div className="org-card__content">
        {hasOperatorContext && (
          <div className="degraded-section">
            <div className="degraded-section__icon">👤</div>
            <div className="degraded-section__content">
              <div className="degraded-section__title">Operator Identity</div>
              <div className="degraded-section__status">Available</div>
            </div>
          </div>
        )}

        {hasSessionCorrelation && (
          <div className="degraded-section">
            <div className="degraded-section__icon">🔗</div>
            <div className="degraded-section__content">
              <div className="degraded-section__title">Session Correlation</div>
              <div className="degraded-section__status">Available</div>
            </div>
          </div>
        )}

        {completeness.missing.length > 0 && !compact && (
          <div className="degraded-missing">
            <div className="degraded-missing__label">
              Missing features ({completeness.missing.length}):
            </div>
            <div className="degraded-missing__items">
              {completeness.missing.slice(0, 2).map((item) => (
                <span key={item} className="degraded-missing-item">
                  {item.replace(/([A-Z])/g, ' $1').toLowerCase()}
                </span>
              ))}
              {completeness.missing.length > 2 && (
                <span className="degraded-missing-item">
                  +{completeness.missing.length - 2} more
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Unavailable organizational context display
 */
function UnavailableOrganizationalContext({
  completeness,
  compact = false,
}: DegradationComponentProps) {
  return (
    <div className={`org-card degraded unavailable ${compact ? 'compact' : ''}`}>
      <div className="org-card__header">
        <div className="org-card__title">
          <span className="degraded-icon">📋</span>
          Organizational Context
          <span className="degraded-badge unavailable">Unavailable</span>
        </div>
      </div>
      <div className="org-card__content">
        <div className="degraded-unavailable">
          <div className="degraded-unavailable__icon">⚠️</div>
          <div className="degraded-unavailable__message">
            <div className="degraded-unavailable__title">Organizational features not available</div>
            <div className="degraded-unavailable__description">
              {compact
                ? 'Enable organizational tracing to see context features'
                : 'This trace was created before organizational features were enabled, or organizational tracing is currently disabled.'}
            </div>
          </div>
        </div>

        {!compact && completeness.recommendations.length > 0 && (
          <div className="degraded-recommendations">
            <div className="degraded-recommendations__label">
              To enable organizational features:
            </div>
            <div className="degraded-recommendations__items">
              {completeness.recommendations.slice(0, 2).map((rec, index) => (
                <div key={index} className="degraded-recommendation-item">
                  <span className="degraded-recommendation-bullet">•</span>
                  <span className="degraded-recommendation-text">{rec}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Main graceful degradation wrapper component
 */
export function OrganizationalGracefulDegradation({
  children,
  trace,
  minimumLevel = 'limited',
  fallback,
  showIndicators = true,
  className = '',
  onDegradationChange,
}: OrganizationalGracefulDegradationProps) {
  const completeness = useMemo(() => {
    return assessOrganizationalDataCompleteness(trace);
  }, [trace]);

  // Notify of degradation level changes
  React.useEffect(() => {
    if (onDegradationChange) {
      onDegradationChange(completeness.level, completeness);
    }
  }, [completeness, onDegradationChange]);

  // Get degradation level priority for comparison
  const getLevelPriority = (level: DegradationLevel): number => {
    switch (level) {
      case 'none':
        return 5;
      case 'partial':
        return 4;
      case 'limited':
        return 3;
      case 'minimal':
        return 2;
      case 'unavailable':
        return 1;
      default:
        return 0;
    }
  };

  const shouldShowChildren = getLevelPriority(completeness.level) >= getLevelPriority(minimumLevel);

  const wrapperClasses = [
    'organizational-graceful-degradation',
    `degradation-${completeness.level}`,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  // Show children if data quality is sufficient
  if (shouldShowChildren) {
    return (
      <div className={wrapperClasses}>
        {children}
        {showIndicators && completeness.level !== 'none' && (
          <div className="degradation-indicator">
            <span className="degradation-indicator__icon">ⓘ</span>
            <span className="degradation-indicator__text">
              Some organizational features limited
            </span>
          </div>
        )}
      </div>
    );
  }

  // Show fallback component
  if (fallback) {
    return <div className={wrapperClasses}>{fallback}</div>;
  }

  // Show appropriate degraded component
  switch (completeness.level) {
    case 'minimal':
      return <MinimalOrganizationalContext completeness={completeness} />;

    case 'partial':
    case 'limited':
      return <PartialOrganizationalContext completeness={completeness} />;
    default:
      return <UnavailableOrganizationalContext completeness={completeness} />;
  }
}

/**
 * Hook for using graceful degradation in functional components
 */
export function useOrganizationalGracefulDegradation(trace?: OrganizationalTrace | null) {
  const completeness = useMemo(() => {
    return assessOrganizationalDataCompleteness(trace);
  }, [trace]);

  const canShowFeature = (minimumLevel: DegradationLevel): boolean => {
    const getLevelPriority = (level: DegradationLevel): number => {
      switch (level) {
        case 'none':
          return 5;
        case 'partial':
          return 4;
        case 'limited':
          return 3;
        case 'minimal':
          return 2;
        case 'unavailable':
          return 1;
        default:
          return 0;
      }
    };

    return getLevelPriority(completeness.level) >= getLevelPriority(minimumLevel);
  };

  const getFeatureStatus = (feature: string): 'available' | 'limited' | 'unavailable' => {
    if (completeness.available.includes(feature)) return 'available';
    if (completeness.level === 'unavailable') return 'unavailable';
    return 'limited';
  };

  return {
    completeness,
    canShowFeature,
    getFeatureStatus,
    isDegraded: completeness.level !== 'none',
    degradationLevel: completeness.level,
  };
}

// Export default for easy importing
export default OrganizationalGracefulDegradation;
