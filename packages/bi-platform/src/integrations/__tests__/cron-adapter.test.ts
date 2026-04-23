import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CronAdapter } from '../cron-adapter.js';

vi.mock('node:fs/promises', async () => {
  const actual = await vi.importActual('node:fs/promises');
  return { ...actual, readdir: vi.fn(), readFile: vi.fn(), stat: vi.fn() };
});

const { readdir, readFile, stat } = await import('node:fs/promises');

describe('CronAdapter', () => {
  let adapter: CronAdapter;

  beforeEach(() => {
    vi.resetAllMocks();
    adapter = new CronAdapter({ cronRunsDir: '/mock/cron/runs' });
  });

  it('parses cron run events and computes metrics', async () => {
    const lines = [
      JSON.stringify({
        ts: 1000,
        jobId: 'heartbeat',
        action: 'finished',
        status: 'ok',
        durationMs: 50000,
        usage: { total_tokens: 20000 },
      }),
      JSON.stringify({
        ts: 2000,
        jobId: 'heartbeat',
        action: 'finished',
        status: 'ok',
        durationMs: 60000,
        usage: { total_tokens: 25000 },
      }),
      JSON.stringify({
        ts: 3000,
        jobId: 'heartbeat',
        action: 'finished',
        status: 'error',
        error: 'timeout',
        durationMs: 120000,
        usage: { total_tokens: 15000 },
      }),
    ].join('\n');

    (stat as any).mockResolvedValue({ mtime: new Date() });
    (readdir as any).mockResolvedValue(['heartbeat.jsonl']);
    (readFile as any).mockResolvedValue(lines);

    const overview = await adapter.getOverview();
    expect(overview.totalJobs).toBe(1);
    expect(overview.totalRuns).toBe(3);
    expect(overview.overallSuccessRate).toBeCloseTo(2 / 3);

    const job = overview.jobs[0];
    expect(job.jobId).toBe('heartbeat');
    expect(job.successfulRuns).toBe(2);
    expect(job.failedRuns).toBe(1);
    expect(job.totalTokens).toBe(60000);
    expect(job.lastStatus).toBe('error');
    expect(job.lastError).toBe('timeout');
  });

  it('computes duration anomaly', async () => {
    const lines = Array.from({ length: 8 }, (_, i) => {
      const duration = i < 5 ? 50000 : 300000; // last 3 are 6x base — avg ~143K, recent3 avg 300K > 2x avg
      return JSON.stringify({
        ts: i * 1000,
        jobId: 'slow-job',
        action: 'finished',
        status: 'ok',
        durationMs: duration,
      });
    }).join('\n');

    (stat as any).mockResolvedValue({ mtime: new Date() });
    (readdir as any).mockResolvedValue(['slow-job.jsonl']);
    (readFile as any).mockResolvedValue(lines);

    const overview = await adapter.getOverview();
    expect(overview.jobs[0].durationAnomaly).toBe(true);
  });

  it('handles empty cron directory', async () => {
    (stat as any).mockResolvedValue({ mtime: new Date() });
    (readdir as any).mockResolvedValue([]);

    const overview = await adapter.getOverview();
    expect(overview.totalJobs).toBe(0);
    expect(overview.totalRuns).toBe(0);
  });

  it('health returns failing when dir missing', async () => {
    (stat as any).mockRejectedValue(new Error('ENOENT'));

    const health = await adapter.health();
    expect(health.status).toBe('failing');
  });

  it('skips non-finished events', async () => {
    const lines = [
      JSON.stringify({ ts: 1000, jobId: 'test', action: 'started', status: 'ok', durationMs: 0 }),
      JSON.stringify({
        ts: 2000,
        jobId: 'test',
        action: 'finished',
        status: 'ok',
        durationMs: 5000,
      }),
    ].join('\n');

    (stat as any).mockResolvedValue({ mtime: new Date() });
    (readdir as any).mockResolvedValue(['test.jsonl']);
    (readFile as any).mockResolvedValue(lines);

    const overview = await adapter.getOverview();
    expect(overview.totalRuns).toBe(1);
  });
});
