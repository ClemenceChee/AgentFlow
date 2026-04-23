/**
 * Materialized views for business metric performance optimization.
 *
 * Tasks: 2.3 (materialized views)
 */

import type { DbPool } from '../db/pool.js';
import type { Logger } from '../monitoring/logger.js';

/** SQL definitions for materialized views. */
const MATERIALIZED_VIEWS = {
  mv_agent_daily_summary: `
    CREATE MATERIALIZED VIEW IF NOT EXISTS mv_agent_daily_summary AS
    SELECT
      agent_id,
      agent_name,
      DATE(period_start) AS day,
      SUM(total_executions) AS total_executions,
      SUM(successful) AS total_successful,
      SUM(failed) AS total_failed,
      AVG(avg_duration_ms) AS avg_duration_ms,
      AVG(error_rate) AS avg_error_rate,
      MAX(updated_at) AS last_updated
    FROM agent_metrics
    GROUP BY agent_id, agent_name, DATE(period_start)
    WITH DATA
  `,

  mv_compliance_summary: `
    CREATE MATERIALIZED VIEW IF NOT EXISTS mv_compliance_summary AS
    SELECT
      regulation,
      COUNT(*) AS total_records,
      COUNT(*) FILTER (WHERE status = 'compliant') AS compliant_count,
      COUNT(*) FILTER (WHERE status = 'violation') AS violation_count,
      COUNT(*) FILTER (WHERE status = 'remediation') AS remediation_count,
      CASE
        WHEN COUNT(*) > 0
        THEN ROUND((COUNT(*) FILTER (WHERE status = 'compliant'))::numeric / COUNT(*) * 100, 1)
        ELSE 100
      END AS compliance_pct,
      MAX(detected_at) AS last_activity
    FROM compliance_records
    GROUP BY regulation
    WITH DATA
  `,

  mv_financial_summary: `
    CREATE MATERIALIZED VIEW IF NOT EXISTS mv_financial_summary AS
    SELECT
      category,
      DATE(period_start) AS day,
      SUM(amount) AS total_amount,
      AVG(amount) AS avg_amount,
      COUNT(*) AS record_count,
      currency
    FROM financial_metrics
    GROUP BY category, DATE(period_start), currency
    WITH DATA
  `,

  mv_anomaly_summary: `
    CREATE MATERIALIZED VIEW IF NOT EXISTS mv_anomaly_summary AS
    SELECT
      source_system,
      severity,
      COUNT(*) AS total_count,
      COUNT(*) FILTER (WHERE NOT acknowledged) AS unacknowledged,
      COUNT(*) FILTER (WHERE resolved_at IS NOT NULL) AS resolved,
      AVG(deviation_pct) AS avg_deviation_pct,
      MAX(detected_at) AS last_detected
    FROM anomalies
    GROUP BY source_system, severity
    WITH DATA
  `,
} as const;

/** Indexes for materialized views. */
const VIEW_INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_mv_agent_daily_agent ON mv_agent_daily_summary (agent_id)',
  'CREATE INDEX IF NOT EXISTS idx_mv_agent_daily_day ON mv_agent_daily_summary (day)',
  'CREATE INDEX IF NOT EXISTS idx_mv_compliance_reg ON mv_compliance_summary (regulation)',
  'CREATE INDEX IF NOT EXISTS idx_mv_financial_day ON mv_financial_summary (day)',
  'CREATE INDEX IF NOT EXISTS idx_mv_financial_cat ON mv_financial_summary (category)',
];

export class MaterializedViewManager {
  constructor(
    private db: DbPool,
    private logger: Logger,
  ) {}

  /** Create all materialized views. */
  async createViews(): Promise<void> {
    for (const [name, sql] of Object.entries(MATERIALIZED_VIEWS)) {
      try {
        await this.db.query(sql);
        this.logger.info(`Created materialized view: ${name}`);
      } catch (err) {
        this.logger.error(`Failed to create view: ${name}`, { error: String(err) });
      }
    }

    for (const indexSql of VIEW_INDEXES) {
      try {
        await this.db.query(indexSql);
      } catch {
        // Index may already exist
      }
    }
  }

  /** Refresh all materialized views. */
  async refreshAll(): Promise<{ refreshed: string[]; failed: string[] }> {
    const refreshed: string[] = [];
    const failed: string[] = [];

    for (const name of Object.keys(MATERIALIZED_VIEWS)) {
      try {
        const start = Date.now();
        await this.db.query(`REFRESH MATERIALIZED VIEW CONCURRENTLY ${name}`);
        refreshed.push(name);
        this.logger.info(`Refreshed ${name}`, { durationMs: Date.now() - start });
      } catch {
        // CONCURRENTLY requires a unique index; fall back to non-concurrent
        try {
          await this.db.query(`REFRESH MATERIALIZED VIEW ${name}`);
          refreshed.push(name);
        } catch (err) {
          failed.push(name);
          this.logger.error(`Failed to refresh ${name}`, { error: String(err) });
        }
      }
    }

    return { refreshed, failed };
  }

  /** Refresh a single view by name. */
  async refresh(viewName: string): Promise<void> {
    if (!(viewName in MATERIALIZED_VIEWS)) {
      throw new Error(`Unknown materialized view: ${viewName}`);
    }
    await this.db.query(`REFRESH MATERIALIZED VIEW ${viewName}`);
  }

  /** Start periodic refresh. */
  startPeriodicRefresh(intervalMs = 60_000): () => void {
    const timer = setInterval(() => {
      this.refreshAll().catch((err) => {
        this.logger.error('Periodic refresh failed', { error: String(err) });
      });
    }, intervalMs);
    timer.unref();
    return () => clearInterval(timer);
  }
}
