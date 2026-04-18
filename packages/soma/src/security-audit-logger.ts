/**
 * Comprehensive security audit logging for organizational intelligence operations.
 *
 * Tracks all security-relevant events including:
 * - Operator authentication and authorization
 * - Team membership validation
 * - Cross-team data access
 * - Policy violations
 * - Governance workflow events
 * - Sensitive data access patterns
 *
 * @module
 */

import { writeFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

export interface SecurityAuditEvent {
  readonly id: string;
  readonly timestamp: number;
  readonly eventType: SecurityEventType;
  readonly severity: SecurityEventSeverity;
  readonly operatorId?: string;
  readonly sessionId?: string;
  readonly teamId?: string;
  readonly targetEntityId?: string;
  readonly action: string;
  readonly resource: string;
  readonly result: 'success' | 'failure' | 'warning' | 'blocked';
  readonly details: Record<string, unknown>;
  readonly clientInfo?: {
    instanceId?: string;
    userAgent?: string;
    ipAddress?: string;
  };
  readonly correlationId?: string;
  readonly policyViolation?: {
    policyId: string;
    violationType: string;
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
  };
}

export type SecurityEventType =
  | 'authentication'
  | 'authorization'
  | 'data_access'
  | 'data_modification'
  | 'team_validation'
  | 'cross_team_access'
  | 'policy_violation'
  | 'governance_decision'
  | 'sensitive_data_exposure'
  | 'anomalous_behavior'
  | 'system_configuration'
  | 'audit_tampering';

export type SecurityEventSeverity = 'info' | 'warning' | 'error' | 'critical';

export interface SecurityAuditConfig {
  readonly auditDir: string;
  readonly maxLogFileSize: number; // bytes
  readonly maxRetentionDays: number;
  readonly enableIntegrityCheck: boolean;
  readonly enableRealTimeAlerting: boolean;
  readonly sensitiveFieldMasking: boolean;
  readonly alertThresholds: {
    readonly failedAuthsPerMinute: number;
    readonly crossTeamAccessPerHour: number;
    readonly policyViolationsPerHour: number;
    readonly anomalousPatternScore: number;
  };
}

export interface SecurityAlert {
  readonly id: string;
  readonly timestamp: number;
  readonly alertType: string;
  readonly severity: SecurityEventSeverity;
  readonly description: string;
  readonly triggeringEvents: string[]; // Event IDs
  readonly recommendedActions: string[];
  readonly autoMitigated: boolean;
}

const DEFAULT_CONFIG: SecurityAuditConfig = {
  auditDir: '.soma/security-audit',
  maxLogFileSize: 100 * 1024 * 1024, // 100MB
  maxRetentionDays: 365,
  enableIntegrityCheck: true,
  enableRealTimeAlerting: true,
  sensitiveFieldMasking: true,
  alertThresholds: {
    failedAuthsPerMinute: 10,
    crossTeamAccessPerHour: 50,
    policyViolationsPerHour: 5,
    anomalousPatternScore: 0.8
  }
};

/**
 * Comprehensive security audit logger for organizational intelligence operations.
 */
export class SecurityAuditLogger {
  private readonly config: SecurityAuditConfig;
  private readonly currentLogFile: string;
  private readonly alertsFile: string;
  private readonly integrityFile: string;
  private eventCounter = 0;
  private readonly recentEvents: Map<string, SecurityAuditEvent[]> = new Map(); // For anomaly detection
  private readonly activeAlerts: Map<string, SecurityAlert> = new Map();

  constructor(config?: Partial<SecurityAuditConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.ensureAuditDirectory();

    const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    this.currentLogFile = join(this.config.auditDir, `security-audit-${timestamp}.jsonl`);
    this.alertsFile = join(this.config.auditDir, 'security-alerts.jsonl');
    this.integrityFile = join(this.config.auditDir, 'integrity.json');

    this.initializeIntegrityTracking();
    this.startPeriodicMaintenance();
  }

  private ensureAuditDirectory(): void {
    if (!existsSync(this.config.auditDir)) {
      mkdirSync(this.config.auditDir, { recursive: true });
    }
  }

  private initializeIntegrityTracking(): void {
    if (!this.config.enableIntegrityCheck) return;

    const integrityData = {
      initialized: Date.now(),
      logFileHashes: new Map<string, string>(),
      lastVerification: Date.now()
    };

    writeFileSync(this.integrityFile, JSON.stringify(integrityData, null, 2));
  }

  private startPeriodicMaintenance(): void {
    // Run maintenance every hour
    setInterval(() => {
      this.performMaintenance();
    }, 60 * 60 * 1000);
  }

  private performMaintenance(): void {
    this.rotateLogsIfNeeded();
    this.cleanupOldLogs();
    this.verifyIntegrity();
    this.detectAnomalousPatterns();
  }

  /**
   * Log a security audit event.
   */
  logSecurityEvent(event: Omit<SecurityAuditEvent, 'id' | 'timestamp'>): void {
    const auditEvent: SecurityAuditEvent = {
      id: this.generateEventId(),
      timestamp: Date.now(),
      ...event
    };

    // Apply sensitive data masking if enabled
    const maskedEvent = this.config.sensitiveFieldMasking
      ? this.maskSensitiveData(auditEvent)
      : auditEvent;

    // Write to audit log
    this.writeAuditEvent(maskedEvent);

    // Track for anomaly detection
    this.trackEventForAnomalyDetection(auditEvent);

    // Check for real-time alerts
    if (this.config.enableRealTimeAlerting) {
      this.evaluateRealTimeAlerts(auditEvent);
    }

    // Update integrity tracking
    if (this.config.enableIntegrityCheck) {
      this.updateIntegrityHash();
    }
  }

  private generateEventId(): string {
    return `audit_${Date.now()}_${++this.eventCounter}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private writeAuditEvent(event: SecurityAuditEvent): void {
    const logEntry = JSON.stringify(event);
    writeFileSync(this.currentLogFile, `${logEntry}\n`, { flag: 'a' });
  }

  private maskSensitiveData(event: SecurityAuditEvent): SecurityAuditEvent {
    const maskedDetails: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(event.details)) {
      if (this.isSensitiveField(key)) {
        maskedDetails[key] = '[MASKED]';
      } else if (typeof value === 'string' && this.containsSensitiveData(value)) {
        maskedDetails[key] = this.maskSensitiveContent(value);
      } else {
        maskedDetails[key] = value;
      }
    }

    return {
      ...event,
      details: maskedDetails
    };
  }

  private isSensitiveField(fieldName: string): boolean {
    const sensitiveFields = [
      'password', 'token', 'secret', 'key', 'auth', 'credential',
      'ssn', 'social', 'email', 'phone', 'address', 'location'
    ];

    const lowerField = fieldName.toLowerCase();
    return sensitiveFields.some(sensitive => lowerField.includes(sensitive));
  }

  private containsSensitiveData(text: string): boolean {
    const patterns = [
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, // email
      /\b(?:\d{3}-?\d{2}-?\d{4})\b/g, // SSN
      /\b(?:\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4})\b/g, // credit card
      /[A-Za-z0-9_-]{32,}/g, // API keys/tokens
    ];

    return patterns.some(pattern => pattern.test(text));
  }

  private maskSensitiveContent(text: string): string {
    return text
      .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL_MASKED]')
      .replace(/\b(?:\d{3}-?\d{2}-?\d{4})\b/g, '[SSN_MASKED]')
      .replace(/\b(?:\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4})\b/g, '[CARD_MASKED]')
      .replace(/[A-Za-z0-9_-]{32,}/g, '[TOKEN_MASKED]');
  }

  private trackEventForAnomalyDetection(event: SecurityAuditEvent): void {
    const key = event.operatorId || event.sessionId || 'system';
    if (!this.recentEvents.has(key)) {
      this.recentEvents.set(key, []);
    }

    const events = this.recentEvents.get(key)!;
    events.push(event);

    // Keep only last hour of events for anomaly detection
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    const recentEvents = events.filter(e => e.timestamp > oneHourAgo);
    this.recentEvents.set(key, recentEvents);
  }

  private evaluateRealTimeAlerts(event: SecurityAuditEvent): void {
    // Check for authentication failures
    if (event.eventType === 'authentication' && event.result === 'failure') {
      this.checkAuthenticationFailurePattern(event);
    }

    // Check for excessive cross-team access
    if (event.eventType === 'cross_team_access') {
      this.checkCrossTeamAccessPattern(event);
    }

    // Check for policy violations
    if (event.policyViolation) {
      this.handlePolicyViolation(event);
    }

    // Check for anomalous behavior
    if (event.severity === 'critical' || event.result === 'blocked') {
      this.handleCriticalEvent(event);
    }
  }

  private checkAuthenticationFailurePattern(event: SecurityAuditEvent): void {
    const operatorId = event.operatorId || 'unknown';
    const recentEvents = this.recentEvents.get(operatorId) || [];

    const recentFailures = recentEvents.filter(e =>
      e.eventType === 'authentication' &&
      e.result === 'failure' &&
      e.timestamp > Date.now() - (60 * 1000) // Last minute
    );

    if (recentFailures.length >= this.config.alertThresholds.failedAuthsPerMinute) {
      this.createAlert({
        alertType: 'authentication_failure_pattern',
        severity: 'error',
        description: `Excessive authentication failures for operator ${operatorId}`,
        triggeringEvents: recentFailures.map(e => e.id),
        recommendedActions: [
          'Investigate potential brute force attack',
          'Consider temporary account lockout',
          'Review operator credentials',
          'Check for automated attacks'
        ],
        autoMitigated: false
      });
    }
  }

  private checkCrossTeamAccessPattern(event: SecurityAuditEvent): void {
    const operatorId = event.operatorId || 'unknown';
    const recentEvents = this.recentEvents.get(operatorId) || [];

    const crossTeamAccesses = recentEvents.filter(e =>
      e.eventType === 'cross_team_access' &&
      e.timestamp > Date.now() - (60 * 60 * 1000) // Last hour
    );

    if (crossTeamAccesses.length >= this.config.alertThresholds.crossTeamAccessPerHour) {
      this.createAlert({
        alertType: 'excessive_cross_team_access',
        severity: 'warning',
        description: `Excessive cross-team access attempts by operator ${operatorId}`,
        triggeringEvents: crossTeamAccesses.map(e => e.id),
        recommendedActions: [
          'Review operator team permissions',
          'Validate legitimate business need for cross-team access',
          'Consider restricting cross-team access permissions',
          'Monitor for data exfiltration patterns'
        ],
        autoMitigated: false
      });
    }
  }

  private handlePolicyViolation(event: SecurityAuditEvent): void {
    if (event.policyViolation!.riskLevel === 'critical') {
      this.createAlert({
        alertType: 'critical_policy_violation',
        severity: 'critical',
        description: `Critical policy violation: ${event.policyViolation!.violationType}`,
        triggeringEvents: [event.id],
        recommendedActions: [
          'Immediate investigation required',
          'Review and validate policy compliance',
          'Consider temporary access restriction',
          'Escalate to security team'
        ],
        autoMitigated: false
      });
    }
  }

  private handleCriticalEvent(event: SecurityAuditEvent): void {
    this.createAlert({
      alertType: 'critical_security_event',
      severity: 'critical',
      description: `Critical security event: ${event.action} on ${event.resource}`,
      triggeringEvents: [event.id],
      recommendedActions: [
        'Immediate security assessment required',
        'Review event context and impact',
        'Check for compromise indicators',
        'Consider incident response procedures'
      ],
      autoMitigated: false
    });
  }

  private createAlert(alertData: Omit<SecurityAlert, 'id' | 'timestamp'>): void {
    const alert: SecurityAlert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      ...alertData
    };

    this.activeAlerts.set(alert.id, alert);
    writeFileSync(this.alertsFile, `${JSON.stringify(alert)}\n`, { flag: 'a' });

    // Log the alert creation as a security event
    this.logSecurityEvent({
      eventType: 'system_configuration',
      severity: alert.severity,
      action: 'security_alert_created',
      resource: 'security_monitoring_system',
      result: 'success',
      details: {
        alertId: alert.id,
        alertType: alert.alertType,
        description: alert.description
      }
    });
  }

  private detectAnomalousPatterns(): void {
    // Implement anomaly detection algorithms
    // This could include statistical analysis, machine learning models, etc.

    for (const [operatorId, events] of this.recentEvents.entries()) {
      const anomalyScore = this.calculateAnomalyScore(events);

      if (anomalyScore >= this.config.alertThresholds.anomalousPatternScore) {
        this.createAlert({
          alertType: 'anomalous_behavior_pattern',
          severity: 'warning',
          description: `Anomalous behavior pattern detected for operator ${operatorId}`,
          triggeringEvents: events.slice(-10).map(e => e.id), // Last 10 events
          recommendedActions: [
            'Review recent operator activity',
            'Validate operator identity',
            'Check for account compromise',
            'Monitor for continued anomalous behavior'
          ],
          autoMitigated: false
        });
      }
    }
  }

  private calculateAnomalyScore(events: SecurityAuditEvent[]): number {
    if (events.length === 0) return 0;

    let score = 0;
    let factors = 0;

    // Factor: Failure rate
    const failures = events.filter(e => e.result === 'failure').length;
    const failureRate = failures / events.length;
    if (failureRate > 0.3) score += failureRate;
    factors++;

    // Factor: Event diversity (rapid switching between different actions)
    const actionTypes = new Set(events.map(e => e.action));
    const diversity = actionTypes.size / events.length;
    if (diversity > 0.7) score += diversity * 0.5;
    factors++;

    // Factor: Off-hours activity (assuming business hours 9-17)
    const offHoursEvents = events.filter(e => {
      const hour = new Date(e.timestamp).getHours();
      return hour < 9 || hour > 17;
    });
    const offHoursRate = offHoursEvents.length / events.length;
    if (offHoursRate > 0.5) score += offHoursRate * 0.3;
    factors++;

    // Factor: High-severity events
    const criticalEvents = events.filter(e => e.severity === 'critical' || e.severity === 'error');
    const criticalRate = criticalEvents.length / events.length;
    if (criticalRate > 0.2) score += criticalRate;
    factors++;

    return factors > 0 ? score / factors : 0;
  }

  private rotateLogsIfNeeded(): void {
    try {
      const stats = statSync(this.currentLogFile);
      if (stats.size >= this.config.maxLogFileSize) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const rotatedFile = this.currentLogFile.replace('.jsonl', `_rotated_${timestamp}.jsonl`);
        // In a real implementation, you would rename/move the file
        // For now, we'll just start a new log file
      }
    } catch (error) {
      // File doesn't exist yet, which is fine
    }
  }

  private cleanupOldLogs(): void {
    // Implementation would scan the audit directory and remove files older than maxRetentionDays
    // This is a placeholder for the cleanup logic
  }

  private verifyIntegrity(): void {
    if (!this.config.enableIntegrityCheck) return;

    try {
      const content = this.readCurrentLogContent();
      const hash = createHash('sha256').update(content).digest('hex');

      // Update integrity file with current hash
      const integrityData = {
        lastVerification: Date.now(),
        currentHash: hash,
        logFile: this.currentLogFile
      };

      writeFileSync(this.integrityFile, JSON.stringify(integrityData, null, 2));
    } catch (error) {
      this.logSecurityEvent({
        eventType: 'audit_tampering',
        severity: 'critical',
        action: 'integrity_check_failed',
        resource: 'security_audit_logs',
        result: 'failure',
        details: { error: String(error) }
      });
    }
  }

  private updateIntegrityHash(): void {
    if (!this.config.enableIntegrityCheck) return;

    try {
      const content = this.readCurrentLogContent();
      const hash = createHash('sha256').update(content).digest('hex');

      const integrityData = {
        lastUpdate: Date.now(),
        currentHash: hash,
        logFile: this.currentLogFile
      };

      writeFileSync(this.integrityFile, JSON.stringify(integrityData, null, 2));
    } catch (error) {
      // Don't log this error to avoid infinite recursion
    }
  }

  private readCurrentLogContent(): string {
    try {
      const fs = require('node:fs');
      return fs.readFileSync(this.currentLogFile, 'utf8');
    } catch {
      return '';
    }
  }

  /**
   * Get active security alerts.
   */
  getActiveAlerts(): SecurityAlert[] {
    return Array.from(this.activeAlerts.values());
  }

  /**
   * Acknowledge and clear a security alert.
   */
  acknowledgeAlert(alertId: string, operatorId: string, notes?: string): void {
    const alert = this.activeAlerts.get(alertId);
    if (alert) {
      this.activeAlerts.delete(alertId);

      this.logSecurityEvent({
        eventType: 'system_configuration',
        severity: 'info',
        operatorId,
        action: 'security_alert_acknowledged',
        resource: 'security_monitoring_system',
        result: 'success',
        details: {
          alertId,
          alertType: alert.alertType,
          notes: notes || 'No notes provided'
        }
      });
    }
  }

  /**
   * Get audit statistics for monitoring dashboard.
   */
  getAuditStatistics(timeWindowMs: number = 24 * 60 * 60 * 1000): {
    totalEvents: number;
    eventsByType: Record<SecurityEventType, number>;
    eventsBySeverity: Record<SecurityEventSeverity, number>;
    failureRate: number;
    activeAlertsCount: number;
    topOperators: Array<{ operatorId: string; eventCount: number }>;
  } {
    const cutoff = Date.now() - timeWindowMs;
    const allEvents: SecurityAuditEvent[] = [];

    // In a real implementation, you would read from the audit log files
    // For now, we'll use the in-memory recent events
    for (const events of this.recentEvents.values()) {
      allEvents.push(...events.filter(e => e.timestamp > cutoff));
    }

    const eventsByType: Record<string, number> = {};
    const eventsBySeverity: Record<string, number> = {};
    const operatorCounts: Record<string, number> = {};
    let failures = 0;

    for (const event of allEvents) {
      eventsByType[event.eventType] = (eventsByType[event.eventType] || 0) + 1;
      eventsBySeverity[event.severity] = (eventsBySeverity[event.severity] || 0) + 1;

      if (event.operatorId) {
        operatorCounts[event.operatorId] = (operatorCounts[event.operatorId] || 0) + 1;
      }

      if (event.result === 'failure' || event.result === 'blocked') {
        failures++;
      }
    }

    const topOperators = Object.entries(operatorCounts)
      .map(([operatorId, eventCount]) => ({ operatorId, eventCount }))
      .sort((a, b) => b.eventCount - a.eventCount)
      .slice(0, 10);

    return {
      totalEvents: allEvents.length,
      eventsByType: eventsByType as Record<SecurityEventType, number>,
      eventsBySeverity: eventsBySeverity as Record<SecurityEventSeverity, number>,
      failureRate: allEvents.length > 0 ? failures / allEvents.length : 0,
      activeAlertsCount: this.activeAlerts.size,
      topOperators
    };
  }
}

/**
 * Create a security audit logger with default configuration.
 */
export function createSecurityAuditLogger(config?: Partial<SecurityAuditConfig>): SecurityAuditLogger {
  return new SecurityAuditLogger(config);
}

/**
 * Global security audit logger instance (singleton).
 */
let globalAuditLogger: SecurityAuditLogger | null = null;

/**
 * Get the global security audit logger instance.
 */
export function getGlobalAuditLogger(): SecurityAuditLogger {
  if (!globalAuditLogger) {
    globalAuditLogger = new SecurityAuditLogger();
  }
  return globalAuditLogger;
}

/**
 * Initialize the global security audit logger with custom configuration.
 */
export function initializeGlobalAuditLogger(config?: Partial<SecurityAuditConfig>): SecurityAuditLogger {
  globalAuditLogger = new SecurityAuditLogger(config);
  return globalAuditLogger;
}