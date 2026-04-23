/**
 * ROI and financial analytics API endpoints.
 * GET /api/v1/analytics/roi — ROI summary
 * GET /api/v1/analytics/costs — cost breakdown
 * GET /api/v1/analytics/revenue-impact — revenue impact analysis
 *
 * Task: 3.2
 */

import type { Router } from '../router.js';
import { sendJson } from '../router.js';
import type { DbPool } from '../../db/pool.js';
import type { CacheClient } from '../../cache/cache.js';

export function registerFinancialRoutes(
  router: Router,
  db: DbPool,
  cache: CacheClient,
): void {
  // ROI summary
  router.get('/api/v1/analytics/roi', async (ctx) => {
    const period = ctx.query.period ?? '30d';
    const cacheKey = `api:roi:${period}`;
    const cached = await cache.get(cacheKey);
    if (cached) {
      sendJson(ctx.res, 200, cached);
      return;
    }

    const interval = periodToInterval(period);

    const { rows } = await db.query<{
      category: string;
      total: string;
      currency: string;
    }>(
      `SELECT category, SUM(amount) AS total, currency
       FROM financial_metrics
       WHERE period_start > NOW() - INTERVAL '${interval}'
       GROUP BY category, currency`,
    );

    const costs = rows.filter((r) => r.category === 'agent_cost');
    const revenue = rows.filter((r) => r.category === 'revenue_impact');
    const savings = rows.filter((r) => r.category === 'savings');

    const totalCost = costs.reduce((s, r) => s + Number(r.total), 0);
    const totalRevenue = revenue.reduce((s, r) => s + Number(r.total), 0);
    const totalSavings = savings.reduce((s, r) => s + Number(r.total), 0);
    const roi = totalCost > 0 ? ((totalRevenue + totalSavings - totalCost) / totalCost) * 100 : 0;

    const response = {
      roi: Math.round(roi * 10) / 10,
      totalCost,
      totalRevenue,
      totalSavings,
      netBenefit: totalRevenue + totalSavings - totalCost,
      currency: costs[0]?.currency ?? 'USD',
      period,
      breakdown: rows.map((r) => ({
        category: r.category,
        amount: Number(r.total),
        currency: r.currency,
      })),
      timestamp: new Date().toISOString(),
    };

    await cache.set(cacheKey, response, 60);
    sendJson(ctx.res, 200, response);
  });

  // Cost breakdown by agent
  router.get('/api/v1/analytics/costs', async (ctx) => {
    const period = ctx.query.period ?? '30d';
    const interval = periodToInterval(period);

    const { rows } = await db.query<{
      agent_id: string;
      total: string;
      currency: string;
    }>(
      `SELECT agent_id, SUM(amount) AS total, currency
       FROM financial_metrics
       WHERE category = 'agent_cost' AND period_start > NOW() - INTERVAL '${interval}'
       GROUP BY agent_id, currency
       ORDER BY total DESC`,
    );

    sendJson(ctx.res, 200, {
      costs: rows.map((r) => ({
        agentId: r.agent_id,
        totalCost: Number(r.total),
        currency: r.currency,
      })),
      period,
      timestamp: new Date().toISOString(),
    });
  });
}

function periodToInterval(period: string): string {
  const match = period.match(/^(\d+)(d|w|m|y)$/);
  if (!match) return '30 days';
  const [, num, unit] = match;
  const unitMap: Record<string, string> = { d: 'days', w: 'weeks', m: 'months', y: 'years' };
  return `${num} ${unitMap[unit] ?? 'days'}`;
}
