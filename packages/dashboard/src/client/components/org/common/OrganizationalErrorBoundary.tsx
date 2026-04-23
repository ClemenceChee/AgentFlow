/**
 * Organizational Error Boundary
 *
 * React Error Boundary component that gracefully handles failures
 * in organizational features and provides appropriate fallbacks.
 */

import type React from 'react';
import { Component, type ErrorInfo, type ReactNode } from 'react';

// Error types for organizational features
export type OrganizationalErrorType =
  | 'api_error' // API endpoint failures
  | 'data_validation' // Data validation failures
  | 'permission_denied' // Team access permission errors
  | 'component_render' // Component rendering errors
  | 'hook_error' // Custom hook errors
  | 'correlation_error' // Session correlation errors
  | 'policy_error' // Policy evaluation errors
  | 'unknown';

// Error boundary state
interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
  errorType: OrganizationalErrorType;
  errorBoundary: string;
  retryCount: number;
}

// Error boundary props
interface OrganizationalErrorBoundaryProps {
  children: ReactNode;
  fallbackComponent?: React.ComponentType<ErrorBoundaryFallbackProps>;
  onError?: (error: Error, errorInfo: ErrorInfo, errorType: OrganizationalErrorType) => void;
  maxRetries?: number;
  boundaryName?: string;
  gracefulDegradation?: boolean; // Show simplified version instead of error
}

// Fallback component props
export interface ErrorBoundaryFallbackProps {
  error?: Error;
  errorType: OrganizationalErrorType;
  boundaryName: string;
  retryCount: number;
  maxRetries: number;
  onRetry: () => void;
  gracefulDegradation: boolean;
}

// Default fallback component
const DefaultErrorFallback: React.FC<ErrorBoundaryFallbackProps> = ({
  error,
  errorType,
  boundaryName,
  retryCount,
  maxRetries,
  onRetry,
  gracefulDegradation,
}) => {
  if (gracefulDegradation && errorType !== 'component_render') {
    // Show simplified version for non-critical errors
    return (
      <div className="org-card">
        <div className="org-card__header">
          <div className="org-card__title">Organizational Context</div>
          <div className="org-card__subtitle">Limited information available</div>
        </div>
        <div className="org-card__content">
          <p style={{ fontSize: 'var(--xs)', color: 'var(--t3)' }}>
            Some organizational features are currently unavailable. Core functionality remains
            accessible.
          </p>
          {retryCount < maxRetries && (
            <button
              onClick={onRetry}
              style={{
                marginTop: 'var(--s2)',
                padding: 'var(--s1) var(--s2)',
                background: 'var(--org-primary)',
                color: 'white',
                border: 'none',
                borderRadius: 'var(--r)',
                fontSize: 'var(--xs)',
                cursor: 'pointer',
              }}
            >
              Retry
            </button>
          )}
        </div>
      </div>
    );
  }

  // Full error display for critical errors
  const errorMessages: Record<OrganizationalErrorType, string> = {
    api_error: 'Unable to load organizational data from the server',
    data_validation: 'Organizational data format is invalid',
    permission_denied: 'Access denied to organizational information',
    component_render: 'Error displaying organizational component',
    hook_error: 'Error loading organizational state',
    correlation_error: 'Unable to load session correlations',
    policy_error: 'Error evaluating organizational policies',
    unknown: 'An unexpected error occurred',
  };

  const userMessage = errorMessages[errorType] || errorMessages.unknown;

  return (
    <div
      className="org-card"
      style={{
        border: '1px solid var(--fail)',
        background: 'rgba(248, 81, 73, 0.05)',
      }}
    >
      <div className="org-card__header">
        <div className="org-card__title" style={{ color: 'var(--fail)' }}>
          ⚠️ Organizational Feature Error
        </div>
        <div className="org-card__subtitle">{boundaryName}</div>
      </div>
      <div className="org-card__content">
        <p style={{ fontSize: 'var(--xs)', marginBottom: 'var(--s2)' }}>{userMessage}</p>

        {error && process.env.NODE_ENV === 'development' && (
          <details style={{ marginBottom: 'var(--s2)' }}>
            <summary
              style={{
                fontSize: 'var(--xs)',
                color: 'var(--t3)',
                cursor: 'pointer',
                marginBottom: 'var(--s1)',
              }}
            >
              Technical Details
            </summary>
            <pre
              style={{
                fontSize: 'var(--xs)',
                color: 'var(--t3)',
                background: 'var(--bg3)',
                padding: 'var(--s2)',
                borderRadius: 'var(--r)',
                overflow: 'auto',
                maxHeight: '200px',
              }}
            >
              {error.message}
              {error.stack && `\n\n${error.stack}`}
            </pre>
          </details>
        )}

        <div style={{ display: 'flex', gap: 'var(--s2)', alignItems: 'center' }}>
          {retryCount < maxRetries && (
            <button
              onClick={onRetry}
              style={{
                padding: 'var(--s1) var(--s3)',
                background: 'var(--org-primary)',
                color: 'white',
                border: 'none',
                borderRadius: 'var(--r)',
                fontSize: 'var(--xs)',
                cursor: 'pointer',
              }}
            >
              Retry ({maxRetries - retryCount} remaining)
            </button>
          )}

          <button
            onClick={() => window.location.reload()}
            style={{
              padding: 'var(--s1) var(--s3)',
              background: 'var(--bg3)',
              color: 'var(--t2)',
              border: '1px solid var(--bd)',
              borderRadius: 'var(--r)',
              fontSize: 'var(--xs)',
              cursor: 'pointer',
            }}
          >
            Reload Page
          </button>
        </div>
      </div>
    </div>
  );
};

// Utility function to classify errors
function classifyError(error: Error): OrganizationalErrorType {
  const message = error.message.toLowerCase();

  if (message.includes('fetch') || message.includes('network') || message.includes('api')) {
    return 'api_error';
  }

  if (message.includes('validation') || message.includes('invalid')) {
    return 'data_validation';
  }

  if (message.includes('permission') || message.includes('access') || message.includes('denied')) {
    return 'permission_denied';
  }

  if (message.includes('hook') || message.includes('context')) {
    return 'hook_error';
  }

  if (message.includes('correlation') || message.includes('session')) {
    return 'correlation_error';
  }

  if (message.includes('policy') || message.includes('governance')) {
    return 'policy_error';
  }

  return 'component_render';
}

// Main Error Boundary Component
export class OrganizationalErrorBoundary extends Component<
  OrganizationalErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: OrganizationalErrorBoundaryProps) {
    super(props);

    this.state = {
      hasError: false,
      errorType: 'unknown',
      errorBoundary: props.boundaryName || 'Unknown',
      retryCount: 0,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error,
      errorType: classifyError(error),
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const { onError, boundaryName = 'OrganizationalErrorBoundary' } = this.props;
    const errorType = classifyError(error);

    console.error(`[${boundaryName}] Organizational component error:`, {
      error,
      errorInfo,
      errorType,
      componentStack: errorInfo.componentStack,
    });

    if (onError) {
      onError(error, errorInfo, errorType);
    }

    // Report to analytics/monitoring service if available
    if (typeof window !== 'undefined' && (window as any).analytics) {
      (window as any).analytics.track('Organizational Error Boundary Triggered', {
        errorType,
        boundaryName,
        errorMessage: error.message,
        componentStack: errorInfo.componentStack.split('\n').slice(0, 5).join('\n'),
      });
    }
  }

  handleRetry = () => {
    const { maxRetries = 3 } = this.props;

    if (this.state.retryCount < maxRetries) {
      this.setState((prevState) => ({
        hasError: false,
        error: undefined,
        retryCount: prevState.retryCount + 1,
      }));
    }
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const {
      fallbackComponent: FallbackComponent = DefaultErrorFallback,
      maxRetries = 3,
      boundaryName = 'Organizational Component',
      gracefulDegradation = true,
    } = this.props;

    const fallbackProps: ErrorBoundaryFallbackProps = {
      error: this.state.error,
      errorType: this.state.errorType,
      boundaryName,
      retryCount: this.state.retryCount,
      maxRetries,
      onRetry: this.handleRetry,
      gracefulDegradation,
    };

    return <FallbackComponent {...fallbackProps} />;
  }
}

// Higher-order component for wrapping components with error boundary
export function withOrganizationalErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  options?: Omit<OrganizationalErrorBoundaryProps, 'children'>,
) {
  const displayName = WrappedComponent.displayName || WrappedComponent.name || 'Component';

  const WithErrorBoundary: React.FC<P> = (props) => (
    <OrganizationalErrorBoundary
      {...options}
      boundaryName={options?.boundaryName || `${displayName}ErrorBoundary`}
    >
      <WrappedComponent {...props} />
    </OrganizationalErrorBoundary>
  );

  WithErrorBoundary.displayName = `withOrganizationalErrorBoundary(${displayName})`;

  return WithErrorBoundary;
}

// Hook for error reporting from functional components
export function useOrganizationalErrorReporter() {
  const reportError = (
    error: Error,
    context: string,
    errorType: OrganizationalErrorType = 'unknown',
  ) => {
    console.error(`[${context}] Organizational error:`, { error, errorType });

    if (typeof window !== 'undefined' && (window as any).analytics) {
      (window as any).analytics.track('Organizational Error Reported', {
        errorType,
        context,
        errorMessage: error.message,
      });
    }
  };

  return { reportError };
}
