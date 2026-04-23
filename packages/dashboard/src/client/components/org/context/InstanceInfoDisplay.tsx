/**
 * Instance Info Display
 *
 * Displays Claude Code client instance information including
 * client type, version, platform, and technical details for
 * debugging and organizational context.
 */

import { useMemo } from 'react';

// Component props
interface InstanceInfoDisplayProps {
  /** Instance ID for the Claude Code session */
  instanceId?: string;

  /** User agent string containing client information */
  userAgent?: string;

  /** Whether to show compact version */
  compact?: boolean;

  /** Custom CSS class name */
  className?: string;

  /** Whether to show detailed technical information */
  showTechnicalDetails?: boolean;

  /** Whether to show platform and environment details */
  showPlatformDetails?: boolean;

  /** Callback when instance is clicked for filtering */
  onInstanceClick?: (instanceId: string) => void;
}

// Client type configuration
const CLIENT_TYPE_CONFIG = {
  CLI: {
    name: 'Claude Code CLI',
    icon: '💻',
    description: 'Command-line interface',
    color: 'var(--org-cli)',
    priority: 4,
  },
  Desktop: {
    name: 'Claude Code Desktop',
    icon: '🖥️',
    description: 'Desktop application',
    color: 'var(--org-desktop)',
    priority: 3,
  },
  'VS Code': {
    name: 'Claude Code VS Code',
    icon: '📝',
    description: 'VS Code extension',
    color: 'var(--org-vscode)',
    priority: 2,
  },
  Web: {
    name: 'Claude Code Web',
    icon: '🌐',
    description: 'Web browser interface',
    color: 'var(--org-web)',
    priority: 1,
  },
  Unknown: {
    name: 'Unknown Client',
    icon: '🔧',
    description: 'Unidentified client type',
    color: 'var(--t3)',
    priority: 0,
  },
};

// Platform configuration
const PLATFORM_CONFIG = {
  win32: { name: 'Windows', icon: '🪟' },
  darwin: { name: 'macOS', icon: '🍎' },
  linux: { name: 'Linux', icon: '🐧' },
  unknown: { name: 'Unknown', icon: '❓' },
};

// Parsed user agent interface
interface ParsedUserAgent {
  clientType: keyof typeof CLIENT_TYPE_CONFIG;
  version?: string;
  platform?: keyof typeof PLATFORM_CONFIG;
  architecture?: string;
  nodeVersion?: string;
  electronVersion?: string;
  browserName?: string;
  browserVersion?: string;
}

/**
 * Instance Info Display Component
 */
export function InstanceInfoDisplay({
  instanceId,
  userAgent,
  compact = false,
  className = '',
  showTechnicalDetails = false,
  showPlatformDetails = true,
  onInstanceClick,
}: InstanceInfoDisplayProps) {
  // Parse user agent string
  const parsedUserAgent = useMemo((): ParsedUserAgent => {
    if (!userAgent) {
      return { clientType: 'Unknown' };
    }

    const ua = userAgent.toLowerCase();
    const parsed: ParsedUserAgent = { clientType: 'Unknown' };

    // Detect client type
    if (ua.includes('claude-code-cli')) {
      parsed.clientType = 'CLI';
    } else if (ua.includes('claude-code-desktop') || ua.includes('electron')) {
      parsed.clientType = 'Desktop';
    } else if (ua.includes('claude-code-vscode') || ua.includes('vscode')) {
      parsed.clientType = 'VS Code';
    } else if (
      ua.includes('claude-code-web') ||
      ua.includes('mozilla') ||
      ua.includes('chrome') ||
      ua.includes('safari')
    ) {
      parsed.clientType = 'Web';
    }

    // Extract version numbers
    const versionMatch = userAgent.match(
      /claude-code[/-]?(?:cli|desktop|web|vscode)?[/-]?v?([0-9]+\.[0-9]+\.[0-9]+)/i,
    );
    if (versionMatch) {
      parsed.version = versionMatch[1];
    }

    // Extract platform
    if (ua.includes('win32') || ua.includes('windows')) {
      parsed.platform = 'win32';
    } else if (ua.includes('darwin') || ua.includes('macos') || ua.includes('mac os x')) {
      parsed.platform = 'darwin';
    } else if (ua.includes('linux')) {
      parsed.platform = 'linux';
    } else {
      parsed.platform = 'unknown';
    }

    // Extract architecture
    if (ua.includes('x64') || ua.includes('x86_64') || ua.includes('amd64')) {
      parsed.architecture = 'x64';
    } else if (ua.includes('arm64') || ua.includes('aarch64')) {
      parsed.architecture = 'arm64';
    } else if (ua.includes('x86') || ua.includes('i386')) {
      parsed.architecture = 'x86';
    }

    // Extract Node.js version for CLI/Desktop
    const nodeMatch = userAgent.match(/node[/-]?v?([0-9]+\.[0-9]+\.[0-9]+)/i);
    if (nodeMatch) {
      parsed.nodeVersion = nodeMatch[1];
    }

    // Extract Electron version for Desktop
    const electronMatch = userAgent.match(/electron[/-]?v?([0-9]+\.[0-9]+\.[0-9]+)/i);
    if (electronMatch) {
      parsed.electronVersion = electronMatch[1];
    }

    // Extract browser info for Web
    const chromeMatch = userAgent.match(/chrome[/-]?v?([0-9]+\.[0-9]+\.[0-9]+)/i);
    const safariMatch = userAgent.match(/version[/-]?v?([0-9]+\.[0-9]+\.[0-9]+).*safari/i);
    const firefoxMatch = userAgent.match(/firefox[/-]?v?([0-9]+\.[0-9]+)/i);

    if (chromeMatch) {
      parsed.browserName = 'Chrome';
      parsed.browserVersion = chromeMatch[1];
    } else if (safariMatch) {
      parsed.browserName = 'Safari';
      parsed.browserVersion = safariMatch[1];
    } else if (firefoxMatch) {
      parsed.browserName = 'Firefox';
      parsed.browserVersion = firefoxMatch[1];
    }

    return parsed;
  }, [userAgent]);

  // Format instance ID for display
  const formatInstanceId = (id: string): string => {
    return id.length > (compact ? 6 : 12) ? `${id.substring(0, compact ? 6 : 12)}...` : id;
  };

  const clientConfig = CLIENT_TYPE_CONFIG[parsedUserAgent.clientType];
  const platformConfig = parsedUserAgent.platform
    ? PLATFORM_CONFIG[parsedUserAgent.platform]
    : PLATFORM_CONFIG.unknown;

  const cardClasses = ['org-card', 'instance-info-display', compact ? 'compact' : '', className]
    .filter(Boolean)
    .join(' ');

  // No instance information available
  if (!instanceId && !userAgent) {
    return (
      <div className={cardClasses}>
        <div className="org-card__header">
          <div className="org-card__title">
            <span className="instance-info-display__icon">🔧</span>
            Instance Info
          </div>
        </div>
        <div className="org-card__content">
          <div className="instance-info-empty">
            <div className="instance-info-empty__icon">❓</div>
            <div className="instance-info-empty__message">No instance information available</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cardClasses}>
      <div className="org-card__header">
        <div className="org-card__title">
          <span className="instance-info-display__icon">🔧</span>
          Instance Info
        </div>
        {parsedUserAgent.version && !compact && (
          <div className="instance-info-version">v{parsedUserAgent.version}</div>
        )}
      </div>

      <div className="org-card__content">
        {/* Client Type Section */}
        <div className="instance-info-section">
          <div className="instance-info-section__header">
            <div className="instance-info-section__label">Client</div>
          </div>
          <div className="instance-info-section__content">
            <div className="instance-info-client-badge" style={{ borderColor: clientConfig.color }}>
              <span
                className="instance-info-client-badge__icon"
                style={{ color: clientConfig.color }}
              >
                {clientConfig.icon}
              </span>
              <div className="instance-info-client-badge__info">
                <div className="instance-info-client-badge__name">
                  {compact ? parsedUserAgent.clientType : clientConfig.name}
                </div>
                {parsedUserAgent.version && (
                  <div className="instance-info-client-badge__version">
                    v{parsedUserAgent.version}
                  </div>
                )}
              </div>
            </div>
            {!compact && (
              <div className="instance-info-client-description">{clientConfig.description}</div>
            )}
          </div>
        </div>

        {/* Instance ID Section */}
        {instanceId && (
          <div className="instance-info-section">
            <div className="instance-info-section__header">
              <div className="instance-info-section__label">Instance</div>
            </div>
            <div className="instance-info-section__content">
              <div
                className={`instance-info-instance-id ${onInstanceClick ? 'clickable' : ''}`}
                onClick={() => onInstanceClick?.(instanceId)}
                title={instanceId}
              >
                <span className="instance-info-instance-id__icon">🆔</span>
                <code className="instance-info-instance-id__value">
                  {formatInstanceId(instanceId)}
                </code>
              </div>
            </div>
          </div>
        )}

        {/* Platform Section */}
        {showPlatformDetails && parsedUserAgent.platform && (
          <div className="instance-info-section">
            <div className="instance-info-section__header">
              <div className="instance-info-section__label">Platform</div>
            </div>
            <div className="instance-info-section__content">
              <div className="instance-info-platform">
                <span className="instance-info-platform__icon">{platformConfig.icon}</span>
                <span className="instance-info-platform__name">{platformConfig.name}</span>
                {parsedUserAgent.architecture && (
                  <span className="instance-info-platform__arch">
                    {parsedUserAgent.architecture}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Runtime/Browser Details */}
        {!compact &&
          (parsedUserAgent.nodeVersion ||
            parsedUserAgent.electronVersion ||
            parsedUserAgent.browserName) && (
            <div className="instance-info-section">
              <div className="instance-info-section__header">
                <div className="instance-info-section__label">Runtime</div>
              </div>
              <div className="instance-info-section__content">
                <div className="instance-info-runtime">
                  {parsedUserAgent.nodeVersion && (
                    <div className="instance-info-runtime-item">
                      <span className="instance-info-runtime-item__icon">⚡</span>
                      <span className="instance-info-runtime-item__name">Node.js</span>
                      <span className="instance-info-runtime-item__version">
                        v{parsedUserAgent.nodeVersion}
                      </span>
                    </div>
                  )}

                  {parsedUserAgent.electronVersion && (
                    <div className="instance-info-runtime-item">
                      <span className="instance-info-runtime-item__icon">🔬</span>
                      <span className="instance-info-runtime-item__name">Electron</span>
                      <span className="instance-info-runtime-item__version">
                        v{parsedUserAgent.electronVersion}
                      </span>
                    </div>
                  )}

                  {parsedUserAgent.browserName && parsedUserAgent.browserVersion && (
                    <div className="instance-info-runtime-item">
                      <span className="instance-info-runtime-item__icon">🌐</span>
                      <span className="instance-info-runtime-item__name">
                        {parsedUserAgent.browserName}
                      </span>
                      <span className="instance-info-runtime-item__version">
                        v{parsedUserAgent.browserVersion}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

        {/* Technical Details (Development Mode) */}
        {showTechnicalDetails && userAgent && process.env.NODE_ENV === 'development' && (
          <div className="instance-info-section">
            <div className="instance-info-section__header">
              <div className="instance-info-section__label">Debug Info</div>
            </div>
            <div className="instance-info-section__content">
              <details className="instance-info-user-agent">
                <summary className="instance-info-user-agent__summary">Raw User Agent</summary>
                <pre className="instance-info-user-agent__content">{userAgent}</pre>
              </details>
            </div>
          </div>
        )}

        {/* Compact Mode Summary */}
        {compact && (
          <div className="instance-info-compact-summary">
            <div className="instance-info-compact-item">
              <span className="instance-info-compact-icon" style={{ color: clientConfig.color }}>
                {clientConfig.icon}
              </span>
              <span className="instance-info-compact-text">{parsedUserAgent.clientType}</span>
            </div>

            {parsedUserAgent.platform && (
              <div className="instance-info-compact-item">
                <span className="instance-info-compact-icon">{platformConfig.icon}</span>
                <span className="instance-info-compact-text">{platformConfig.name}</span>
              </div>
            )}

            {parsedUserAgent.version && (
              <div className="instance-info-compact-item">
                <span className="instance-info-compact-icon">🏷️</span>
                <span className="instance-info-compact-text">v{parsedUserAgent.version}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Export default for easy importing
export default InstanceInfoDisplay;
