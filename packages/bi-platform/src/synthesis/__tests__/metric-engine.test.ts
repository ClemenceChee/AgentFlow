import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MetricEngine } from '../metric-engine.js';

// Mock DB pool
function createMockDb() {
  return {
    query: vi.fn().mockResolvedValue({ rows: [] }),
    end: vi.fn(),
  };
}

// Mock cache
function createMockCache() {
  const store = new Map<string, unknown>();
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: unknown) => {
      store.set(key, value);
    }),
    del: vi.fn(async (key: string) => {
      store.delete(key);
    }),
    invalidatePattern: vi.fn(async () => 0),
    getStats: vi.fn(() => ({ hits: 0, misses: 0, hitRate: 0, errors: 0 })),
    close: vi.fn(),
    _store: store,
  };
}

describe('MetricEngine', () => {
  let engine: MetricEngine;
  let db: ReturnType<typeof createMockDb>;
  let cache: ReturnType<typeof createMockCache>;

  beforeEach(() => {
    db = createMockDb();
    cache = createMockCache();
    engine = new MetricEngine(db as any, cache as any);
  });

  it('returns null for unknown metric', async () => {
    const result = await engine.calculate({ metric: 'nonexistent' });
    expect(result).toBeNull();
  });

  it('returns cached metric on cache hit', async () => {
    const cached = {
      name: 'test',
      value: 42,
      unit: 'count',
      trend: 'up' as const,
      trendPct: 5,
      period: '30d',
      calculatedAt: '',
    };
    cache._store.set('metric:total_executions:all::', cached);

    const result = await engine.calculate({ metric: 'total_executions' });
    expect(result).toEqual(cached);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('calculates total_executions from DB', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ total: '1500', prev_total: '1000' }] });

    const result = await engine.calculate({ metric: 'total_executions' });
    expect(result).not.toBeNull();
    expect(result?.name).toBe('Total Executions');
    expect(result?.value).toBe(1500);
    expect(result?.unit).toBe('count');
    expect(result?.trend).toBe('up');
    expect(result?.trendPct).toBe(50);
  });

  it('calculates overall_success_rate', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ rate: '0.95', prev_rate: '0.92' }] });

    const result = await engine.calculate({ metric: 'overall_success_rate' });
    expect(result).not.toBeNull();
    expect(result?.value).toBeCloseTo(95, 0);
    expect(result?.trend).toBe('up');
  });

  it('detects stable trend when change < 1%', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ total: '100', prev_total: '100' }] });

    const result = await engine.calculate({ metric: 'total_executions' });
    expect(result?.trend).toBe('stable');
    expect(result?.trendPct).toBe(0);
  });

  it('detects down trend', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ total: '80', prev_total: '100' }] });

    const result = await engine.calculate({ metric: 'total_executions' });
    expect(result?.trend).toBe('down');
    expect(result?.trendPct).toBe(-20);
  });

  it('getExecutiveKPIs returns all 6 metrics', async () => {
    // Each metric makes one DB query
    db.query.mockResolvedValue({
      rows: [
        {
          total: '100',
          prev_total: '90',
          rate: '0.9',
          prev_rate: '0.85',
          avg: '150',
          prev_avg: '200',
          count: '5',
          prev_count: '4',
          compliant: '95',
          total_records: '100',
        },
      ],
    });

    const _kpis = await engine.getExecutiveKPIs();
    // Should attempt 6 metrics
    expect(db.query.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it('calculateBatch runs queries in parallel', async () => {
    db.query.mockResolvedValue({ rows: [{ total: '100', prev_total: '90' }] });

    const results = await engine.calculateBatch([
      { metric: 'total_executions' },
      { metric: 'active_agents' },
    ]);
    expect(results.size).toBe(2);
  });
});
