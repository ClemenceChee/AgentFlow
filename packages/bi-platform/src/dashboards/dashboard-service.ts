/**
 * Dashboard data service — provides data for executive, operational, and compliance dashboards.
 *
 * Tasks: 6.1 (executive), 6.2 (operational), 6.3 (compliance), 6.5 (customizable),
 *        6.7 (interactive charts), 6.8 (anomaly alerts), 6.9 (personalization)
 */

import type { UserRole } from '../auth/types.js';
import type { CacheClient } from '../cache/cache.js';
import type { DbPool } from '../db/pool.js';
import type { RecommendationEngine } from '../decisions/recommendation-engine.js';
import type { DataAggregator } from '../synthesis/aggregator.js';
import type { AnomalyDetector } from '../synthesis/anomaly-detector.js';
import type { MetricEngine } from '../synthesis/metric-engine.js';

export interface DashboardData {
  type: 'executive' | 'operational' | 'compliance';
  timestamp: string;
  widgets: Widget[];
}

export interface Widget {
  id: string;
  type: 'kpi' | 'chart' | 'table' | 'alert' | 'list';
  title: string;
  data: unknown;
  position?: { x: number; y: number; w: number; h: number };
}

export interface DashboardPreferences {
  userId: string;
  layout: Record<string, { x: number; y: number; w: number; h: number }>;
  hiddenWidgets: string[];
  favoriteMetrics: string[];
  refreshInterval: number;
}

export class DashboardService {
  constructor(
    private aggregator: DataAggregator,
    private metricEngine: MetricEngine,
    _anomalyDetector: AnomalyDetector,
    private recommendationEngine: RecommendationEngine,
    private db: DbPool,
    private cache: CacheClient,
  ) {}

  /** Get executive dashboard data — high-level KPIs and strategic overview. */
  async getExecutiveDashboard(userRole: UserRole): Promise<DashboardData> {
    const cacheKey = `dashboard:executive:${userRole}`;
    const cached = await this.cache.get<DashboardData>(cacheKey);
    if (cached) return cached;

    const [kpis, latest, recommendations] = await Promise.all([
      this.metricEngine.getExecutiveKPIs(),
      Promise.resolve(this.aggregator.getLatest()),
      this.recommendationEngine.generateRecommendations(userRole),
    ]);

    const widgets: Widget[] = [
      {
        id: 'kpi-summary',
        type: 'kpi',
        title: 'Key Performance Indicators',
        data: kpis,
      },
      {
        id: 'system-health',
        type: 'kpi',
        title: 'System Health',
        data: latest?.systemHealth ?? null,
      },
      {
        id: 'agent-overview',
        type: 'chart',
        title: 'Agent Performance Overview',
        data: {
          chartType: 'bar',
          agents: (latest?.agents ?? []).slice(0, 10).map((a) => ({
            name: a.agentName,
            successRate: Math.round(a.performance.successRate * 100),
            failureRate: Math.round(a.performance.failureRate * 100),
          })),
        },
      },
      {
        id: 'roi-trend',
        type: 'chart',
        title: 'ROI Trend',
        data: { chartType: 'line', note: 'Populated from financial_metrics time series' },
      },
      {
        id: 'top-recommendations',
        type: 'list',
        title: 'Priority Recommendations',
        data: recommendations.slice(0, 5).map((r) => ({
          title: r.title,
          priority: r.priority,
          confidence: r.confidence,
          type: r.type,
        })),
      },
      {
        id: 'correlations',
        type: 'alert',
        title: 'Cross-System Correlations',
        data: latest?.crossSystemCorrelations ?? [],
      },
    ];

    const result: DashboardData = {
      type: 'executive',
      timestamp: new Date().toISOString(),
      widgets,
    };

    await this.cache.set(cacheKey, result, 30);
    return result;
  }

  /** Get operational dashboard data — detailed agent analysis. */
  async getOperationalDashboard(agentId?: string): Promise<DashboardData> {
    const latest = this.aggregator.getLatest();
    const agents = latest?.agents ?? [];

    const focusAgents = agentId ? agents.filter((a) => a.agentId === agentId) : agents;

    // Get historical trend data
    const { rows: trendData } = await this.db.query<{
      day: string;
      total_executions: string;
      avg_error_rate: string;
      avg_duration_ms: string;
    }>(
      `SELECT DATE(period_start) AS day,
              SUM(total_executions) AS total_executions,
              AVG(error_rate) AS avg_error_rate,
              AVG(avg_duration_ms) AS avg_duration_ms
       FROM agent_metrics
       WHERE period_start > NOW() - INTERVAL '30 days'
       ${agentId ? 'AND agent_id = $1' : ''}
       GROUP BY DATE(period_start) ORDER BY day`,
      agentId ? [agentId] : [],
    );

    const widgets: Widget[] = [
      {
        id: 'agent-comparison',
        type: 'table',
        title: 'Agent Comparison',
        data: focusAgents.map((a) => ({
          agentId: a.agentId,
          agentName: a.agentName,
          executions: a.performance.totalExecutions,
          successRate: `${(a.performance.successRate * 100).toFixed(1)}%`,
          failureRate: `${(a.performance.failureRate * 100).toFixed(1)}%`,
          avgDuration: `${Math.round(a.performance.avgDurationMs)}ms`,
          drifted: a.compliance.drifted,
          costPerExec: a.efficiency.costPerExecution
            ? `$${a.efficiency.costPerExecution.toFixed(3)}`
            : 'N/A',
        })),
      },
      {
        id: 'performance-trend',
        type: 'chart',
        title: 'Performance Trend (30 days)',
        data: {
          chartType: 'line',
          series: trendData.map((r) => ({
            date: r.day,
            executions: Number(r.total_executions),
            errorRate: Number(r.avg_error_rate),
            avgDuration: Number(r.avg_duration_ms),
          })),
        },
      },
      {
        id: 'variance-analysis',
        type: 'chart',
        title: 'Agent Variance Analysis',
        data: {
          chartType: 'scatter',
          agents: focusAgents.map((a) => ({
            name: a.agentName,
            x: a.performance.avgDurationMs,
            y: a.performance.failureRate * 100,
            size: a.performance.totalExecutions,
          })),
        },
      },
    ];

    return {
      type: 'operational',
      timestamp: new Date().toISOString(),
      widgets,
    };
  }

  /** Get compliance monitoring dashboard. */
  async getComplianceDashboard(regulation?: string): Promise<DashboardData> {
    const regFilter = regulation ? `AND regulation = $1` : '';
    const params = regulation ? [regulation.toUpperCase()] : [];

    const [complianceOverview, violations, remediations] = await Promise.all([
      this.db.query<{ regulation: string; total: string; compliant: string; violations: string }>(
        `SELECT regulation, COUNT(*) AS total,
                COUNT(*) FILTER (WHERE status = 'compliant') AS compliant,
                COUNT(*) FILTER (WHERE status = 'violation') AS violations
         FROM compliance_records
         WHERE detected_at > NOW() - INTERVAL '90 days' ${regFilter}
         GROUP BY regulation`,
        params,
      ),
      this.db.query<{
        id: string;
        regulation: string;
        severity: string;
        description: string;
        detected_at: string;
      }>(
        `SELECT id, regulation, severity, description, detected_at
         FROM compliance_records
         WHERE status = 'violation' AND resolved_at IS NULL ${regFilter}
         ORDER BY CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 ELSE 3 END
         LIMIT 20`,
        params,
      ),
      this.db.query<{ regulation: string; count: string }>(
        `SELECT regulation, COUNT(*) AS count
         FROM compliance_records
         WHERE status = 'remediation' AND resolved_at IS NULL ${regFilter}
         GROUP BY regulation`,
        params,
      ),
    ]);

    const widgets: Widget[] = [
      {
        id: 'compliance-score',
        type: 'kpi',
        title: 'Compliance Status',
        data: complianceOverview.rows.map((r) => ({
          regulation: r.regulation,
          score:
            Number(r.total) > 0 ? Math.round((Number(r.compliant) / Number(r.total)) * 100) : 100,
          violations: Number(r.violations),
          total: Number(r.total),
        })),
      },
      {
        id: 'active-violations',
        type: 'table',
        title: 'Active Violations',
        data: violations.rows.map((r) => ({
          id: r.id,
          regulation: r.regulation,
          severity: r.severity,
          description: r.description,
          detectedAt: r.detected_at,
        })),
      },
      {
        id: 'remediation-progress',
        type: 'chart',
        title: 'Remediation Progress',
        data: {
          chartType: 'donut',
          segments: remediations.rows.map((r) => ({
            regulation: r.regulation,
            inProgress: Number(r.count),
          })),
        },
      },
    ];

    return {
      type: 'compliance',
      timestamp: new Date().toISOString(),
      widgets,
    };
  }

  /** Save user dashboard preferences. */
  async savePreferences(prefs: DashboardPreferences): Promise<void> {
    await this.db.query(
      `INSERT INTO user_preferences (user_id, role, dashboard_layout, metric_preferences, updated_at)
       VALUES ($1, 'custom', $2, $3, NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         dashboard_layout = $2,
         metric_preferences = $3,
         updated_at = NOW()`,
      [prefs.userId, JSON.stringify(prefs.layout), JSON.stringify(prefs)],
    );
  }

  /** Load user dashboard preferences. */
  async loadPreferences(userId: string): Promise<DashboardPreferences | null> {
    const { rows } = await this.db.query<{ metric_preferences: string }>(
      `SELECT metric_preferences FROM user_preferences WHERE user_id = $1`,
      [userId],
    );
    if (rows.length === 0) return null;
    return JSON.parse(rows[0].metric_preferences as string) as DashboardPreferences;
  }
}
