/**
 * Compliance monitoring API endpoints.
 * GET /api/v1/compliance — overall compliance status
 * GET /api/v1/compliance/:regulation — regulation-specific compliance
 * GET /api/v1/compliance/violations — active violations
 *
 * Task: 3.3
 */

import type { CacheClient } from '../../cache/cache.js';
import type { DbPool } from '../../db/pool.js';
import type { Router } from '../router.js';
import { sendJson } from '../router.js';

export function registerComplianceRoutes(router: Router, db: DbPool, cache: CacheClient): void {
  // Overall compliance status
  router.get('/api/v1/compliance', async (ctx) => {
    const cacheKey = 'api:compliance:overview';
    const cached = await cache.get(cacheKey);
    if (cached) {
      sendJson(ctx.res, 200, cached);
      return;
    }

    const { rows } = await db.query<{
      regulation: string;
      total_records: string;
      compliant_count: string;
      violation_count: string;
      remediation_count: string;
      compliance_pct: string;
    }>(
      `SELECT
        regulation,
        COUNT(*) AS total_records,
        COUNT(*) FILTER (WHERE status = 'compliant') AS compliant_count,
        COUNT(*) FILTER (WHERE status = 'violation') AS violation_count,
        COUNT(*) FILTER (WHERE status = 'remediation') AS remediation_count,
        CASE WHEN COUNT(*) > 0
          THEN ROUND((COUNT(*) FILTER (WHERE status = 'compliant'))::numeric / COUNT(*) * 100, 1)
          ELSE 100
        END AS compliance_pct
       FROM compliance_records
       WHERE detected_at > NOW() - INTERVAL '90 days'
       GROUP BY regulation
       ORDER BY compliance_pct ASC`,
    );

    const totalRecords = rows.reduce((s, r) => s + Number(r.total_records), 0);
    const totalCompliant = rows.reduce((s, r) => s + Number(r.compliant_count), 0);
    const overallScore =
      totalRecords > 0 ? Math.round((totalCompliant / totalRecords) * 1000) / 10 : 100;

    const response = {
      overallComplianceScore: overallScore,
      regulations: rows.map((r) => ({
        regulation: r.regulation,
        compliancePct: Number(r.compliance_pct),
        totalRecords: Number(r.total_records),
        violations: Number(r.violation_count),
        remediations: Number(r.remediation_count),
      })),
      timestamp: new Date().toISOString(),
    };

    await cache.set(cacheKey, response, 60);
    sendJson(ctx.res, 200, response);
  });

  // Regulation-specific compliance
  router.get('/api/v1/compliance/:regulation', async (ctx) => {
    const { regulation } = ctx.params;

    const { rows } = await db.query<{
      id: string;
      agent_id: string;
      status: string;
      severity: string;
      description: string;
      detected_at: string;
      resolved_at: string;
    }>(
      `SELECT id, agent_id, status, severity, description, detected_at, resolved_at
       FROM compliance_records
       WHERE regulation = $1 AND detected_at > NOW() - INTERVAL '90 days'
       ORDER BY detected_at DESC
       LIMIT 100`,
      [regulation.toUpperCase()],
    );

    if (rows.length === 0) {
      sendJson(ctx.res, 200, {
        regulation: regulation.toUpperCase(),
        status: 'no_data',
        message: `No compliance records found for ${regulation.toUpperCase()}.`,
        records: [],
      });
      return;
    }

    const violations = rows.filter((r) => r.status === 'violation');
    sendJson(ctx.res, 200, {
      regulation: regulation.toUpperCase(),
      totalRecords: rows.length,
      activeViolations: violations.length,
      records: rows.map((r) => ({
        id: r.id,
        agentId: r.agent_id,
        status: r.status,
        severity: r.severity,
        description: r.description,
        detectedAt: r.detected_at,
        resolvedAt: r.resolved_at,
      })),
      timestamp: new Date().toISOString(),
    });
  });

  // Active violations
  router.get('/api/v1/compliance/violations', async (ctx) => {
    const { rows } = await db.query<{
      id: string;
      regulation: string;
      agent_id: string;
      severity: string;
      description: string;
      detected_at: string;
    }>(
      `SELECT id, regulation, agent_id, severity, description, detected_at
       FROM compliance_records
       WHERE status = 'violation' AND resolved_at IS NULL
       ORDER BY
         CASE severity
           WHEN 'critical' THEN 1
           WHEN 'high' THEN 2
           WHEN 'medium' THEN 3
           ELSE 4
         END,
         detected_at DESC
       LIMIT 50`,
    );

    sendJson(ctx.res, 200, {
      activeViolations: rows.length,
      violations: rows.map((r) => ({
        id: r.id,
        regulation: r.regulation,
        agentId: r.agent_id,
        severity: r.severity,
        description: r.description,
        detectedAt: r.detected_at,
      })),
      timestamp: new Date().toISOString(),
    });
  });
}
