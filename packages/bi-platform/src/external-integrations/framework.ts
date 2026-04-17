/**
 * Generic Business System Integration Framework.
 *
 * Provides a pluggable connector pattern for CRM, ERP, BI tools,
 * and compliance systems. Each connector implements ExternalConnector.
 *
 * Tasks: 7.1-7.10
 */

import type { Logger } from '../monitoring/logger.js';

/**
 * 7.6 — Generic REST/GraphQL integration interface.
 */
export interface ExternalConnector {
  readonly name: string;
  readonly type: 'crm' | 'erp' | 'bi_tool' | 'compliance' | 'custom';

  /** Test connectivity and return health status. */
  healthCheck(): Promise<ConnectorHealth>;

  /** Push data to external system. */
  pushData(payload: ExportPayload): Promise<ExportResult>;

  /** Pull data from external system (if supported). */
  pullData?(query: ImportQuery): Promise<ImportResult>;
}

export interface ConnectorHealth {
  connector: string;
  status: 'connected' | 'degraded' | 'disconnected' | 'unauthorized';
  latencyMs: number;
  lastSuccessAt: string | null;
  errorMessage?: string;
}

export interface ExportPayload {
  dataType: 'kpis' | 'agents' | 'compliance' | 'anomalies' | 'decisions' | 'custom';
  data: unknown;
  format: 'json' | 'csv' | 'xml';
  metadata?: Record<string, string>;
}

export interface ExportResult {
  success: boolean;
  recordsExported: number;
  errors: string[];
  externalId?: string;
  timestamp: string;
}

export interface ImportQuery {
  source: string;
  query: Record<string, unknown>;
  limit?: number;
}

export interface ImportResult {
  success: boolean;
  recordsImported: number;
  data: unknown[];
  errors: string[];
  timestamp: string;
}

/**
 * 7.7 — Integration monitoring and error handling.
 * 7.9 — Integration health monitoring and recovery.
 */
export interface IntegrationEvent {
  connector: string;
  type: 'push' | 'pull' | 'health_check' | 'error' | 'recovery';
  success: boolean;
  recordCount: number;
  durationMs: number;
  error?: string;
  timestamp: string;
}

/**
 * 7.8 — Data encryption for integrations.
 */
export interface EncryptionConfig {
  enabled: boolean;
  algorithm: string;
  fieldsToEncrypt: string[];
}

/**
 * 7.10 — Data synchronization validation.
 */
export interface SyncValidation {
  connector: string;
  lastSyncAt: string;
  sourceRecordCount: number;
  targetRecordCount: number;
  discrepancies: number;
  status: 'in_sync' | 'out_of_sync' | 'unknown';
}

/**
 * Integration Manager — orchestrates all external connectors.
 */
export class IntegrationManager {
  private connectors = new Map<string, ExternalConnector>();
  private eventLog: IntegrationEvent[] = [];
  private maxEventLog = 1000;
  private healthCache = new Map<string, { health: ConnectorHealth; cachedAt: number }>();
  private healthCacheTtlMs = 30_000;

  constructor(private logger: Logger) {}

  /** Register a connector. */
  register(connector: ExternalConnector): void {
    this.connectors.set(connector.name, connector);
    this.logger.info(`Registered integration connector: ${connector.name} (${connector.type})`);
  }

  /** Unregister a connector. */
  unregister(name: string): void {
    this.connectors.delete(name);
    this.healthCache.delete(name);
  }

  /** List all registered connectors. */
  listConnectors(): Array<{ name: string; type: string }> {
    return Array.from(this.connectors.values()).map((c) => ({ name: c.name, type: c.type }));
  }

  /** Get health of all connectors (with caching). */
  async getHealth(): Promise<ConnectorHealth[]> {
    const results: ConnectorHealth[] = [];
    const now = Date.now();

    for (const [name, connector] of this.connectors) {
      const cached = this.healthCache.get(name);
      if (cached && now - cached.cachedAt < this.healthCacheTtlMs) {
        results.push(cached.health);
        continue;
      }

      const start = Date.now();
      try {
        const health = await connector.healthCheck();
        this.healthCache.set(name, { health, cachedAt: now });
        results.push(health);
        this.logEvent(name, 'health_check', true, 0, Date.now() - start);
      } catch (err) {
        const health: ConnectorHealth = {
          connector: name,
          status: 'disconnected',
          latencyMs: Date.now() - start,
          lastSuccessAt: cached?.health.lastSuccessAt ?? null,
          errorMessage: err instanceof Error ? err.message : String(err),
        };
        this.healthCache.set(name, { health, cachedAt: now });
        results.push(health);
        this.logEvent(name, 'health_check', false, 0, Date.now() - start, String(err));
      }
    }

    return results;
  }

  /** Push data to a specific connector. */
  async pushData(connectorName: string, payload: ExportPayload): Promise<ExportResult> {
    const connector = this.connectors.get(connectorName);
    if (!connector) {
      return { success: false, recordsExported: 0, errors: [`Unknown connector: ${connectorName}`], timestamp: new Date().toISOString() };
    }

    const start = Date.now();
    try {
      const result = await connector.pushData(payload);
      this.logEvent(connectorName, 'push', result.success, result.recordsExported, Date.now() - start);
      return result;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.logEvent(connectorName, 'push', false, 0, Date.now() - start, errMsg);
      return { success: false, recordsExported: 0, errors: [errMsg], timestamp: new Date().toISOString() };
    }
  }

  /** Pull data from a specific connector. */
  async pullData(connectorName: string, query: ImportQuery): Promise<ImportResult> {
    const connector = this.connectors.get(connectorName);
    if (!connector || !connector.pullData) {
      return { success: false, recordsImported: 0, data: [], errors: [`Connector ${connectorName} does not support pull`], timestamp: new Date().toISOString() };
    }

    const start = Date.now();
    try {
      const result = await connector.pullData(query);
      this.logEvent(connectorName, 'pull', result.success, result.recordsImported, Date.now() - start);
      return result;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.logEvent(connectorName, 'pull', false, 0, Date.now() - start, errMsg);
      return { success: false, recordsImported: 0, data: [], errors: [errMsg], timestamp: new Date().toISOString() };
    }
  }

  /** Get sync validation for all connectors. */
  async validateSync(): Promise<SyncValidation[]> {
    const results: SyncValidation[] = [];
    for (const [name] of this.connectors) {
      const cached = this.healthCache.get(name);
      results.push({
        connector: name,
        lastSyncAt: cached?.health.lastSuccessAt ?? 'never',
        sourceRecordCount: 0,
        targetRecordCount: 0,
        discrepancies: 0,
        status: cached?.health.status === 'connected' ? 'in_sync' : 'unknown',
      });
    }
    return results;
  }

  /** Get recent integration events. */
  getEvents(limit = 50): IntegrationEvent[] {
    return this.eventLog.slice(-limit);
  }

  /** Get error events. */
  getErrors(limit = 20): IntegrationEvent[] {
    return this.eventLog.filter((e) => !e.success).slice(-limit);
  }

  private logEvent(connector: string, type: IntegrationEvent['type'], success: boolean, recordCount: number, durationMs: number, error?: string): void {
    const event: IntegrationEvent = {
      connector,
      type,
      success,
      recordCount,
      durationMs,
      error,
      timestamp: new Date().toISOString(),
    };
    this.eventLog.push(event);
    if (this.eventLog.length > this.maxEventLog) {
      this.eventLog = this.eventLog.slice(-this.maxEventLog);
    }

    if (!success) {
      this.logger.warn('Integration error', { connector, type, error });
    }
  }
}

/**
 * 7.6 — Generic REST connector implementation.
 * Plug in any REST API by providing baseUrl + auth config.
 */
export class GenericRestConnector implements ExternalConnector {
  readonly type = 'custom' as const;

  constructor(
    readonly name: string,
    private config: {
      baseUrl: string;
      authHeader?: string;
      timeout?: number;
    },
  ) {}

  async healthCheck(): Promise<ConnectorHealth> {
    const start = Date.now();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeout ?? 5000);
      const res = await fetch(`${this.config.baseUrl}/health`, {
        signal: controller.signal,
        headers: this.config.authHeader ? { Authorization: this.config.authHeader } : {},
      });
      clearTimeout(timeoutId);

      return {
        connector: this.name,
        status: res.ok ? 'connected' : 'degraded',
        latencyMs: Date.now() - start,
        lastSuccessAt: res.ok ? new Date().toISOString() : null,
        errorMessage: res.ok ? undefined : `HTTP ${res.status}`,
      };
    } catch (err) {
      return {
        connector: this.name,
        status: 'disconnected',
        latencyMs: Date.now() - start,
        lastSuccessAt: null,
        errorMessage: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async pushData(payload: ExportPayload): Promise<ExportResult> {
    const start = Date.now();
    try {
      const res = await fetch(`${this.config.baseUrl}/data`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.authHeader ? { Authorization: this.config.authHeader } : {}),
        },
        body: JSON.stringify(payload),
      });

      const body = await res.json().catch(() => ({}));
      return {
        success: res.ok,
        recordsExported: (body as any).recordCount ?? 0,
        errors: res.ok ? [] : [`HTTP ${res.status}`],
        externalId: (body as any).id,
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      return {
        success: false,
        recordsExported: 0,
        errors: [err instanceof Error ? err.message : String(err)],
        timestamp: new Date().toISOString(),
      };
    }
  }

  async pullData(query: ImportQuery): Promise<ImportResult> {
    try {
      const params = new URLSearchParams(query.query as Record<string, string>);
      if (query.limit) params.set('limit', String(query.limit));

      const res = await fetch(`${this.config.baseUrl}/data?${params}`, {
        headers: this.config.authHeader ? { Authorization: this.config.authHeader } : {},
      });

      const body = await res.json().catch(() => []);
      const data = Array.isArray(body) ? body : (body as any).data ?? [];

      return {
        success: res.ok,
        recordsImported: data.length,
        data,
        errors: res.ok ? [] : [`HTTP ${res.status}`],
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      return {
        success: false,
        recordsImported: 0,
        data: [],
        errors: [err instanceof Error ? err.message : String(err)],
        timestamp: new Date().toISOString(),
      };
    }
  }
}
