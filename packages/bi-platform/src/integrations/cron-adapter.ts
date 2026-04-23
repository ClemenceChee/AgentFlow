/**
 * Cron Monitoring Adapter — reads OpenClaw cron run JSONL logs
 * to track scheduled task execution, success rates, durations, token usage.
 *
 * Tasks: 2.1-2.6
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { SourceAdapter, SystemHealth } from './types.js';

export interface CronAdapterConfig {
  cronRunsDir: string;
}

export function loadCronAdapterConfig(): CronAdapterConfig {
  return {
    cronRunsDir: process.env.BI_OPENCLAW_CRON_DIR ?? `${process.env.HOME}/.openclaw/cron/runs`,
  };
}

export interface CronRunEvent {
  ts: number;
  jobId: string;
  action: string;
  status: 'ok' | 'error';
  error?: string;
  summary?: string;
  durationMs: number;
  deliveryStatus?: string;
  model?: string;
  provider?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
}

export interface CronJobMetrics {
  jobId: string;
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  successRate: number;
  avgDurationMs: number;
  totalTokens: number;
  lastRunAt: string | null;
  lastStatus: 'ok' | 'error';
  lastError: string | null;
  durationAnomaly: boolean;
  recentDurations: number[];
}

export interface CronOverview {
  totalJobs: number;
  totalRuns: number;
  overallSuccessRate: number;
  totalTokens: number;
  jobs: CronJobMetrics[];
}

export class CronAdapter implements SourceAdapter {
  readonly name = 'cron';
  private config: CronAdapterConfig;
  private cachedOverview: CronOverview | null = null;
  private cacheTime = 0;
  private readonly cacheTtlMs = 30_000;

  constructor(config: CronAdapterConfig) {
    this.config = config;
  }

  async health(): Promise<SystemHealth> {
    try {
      const info = await stat(this.config.cronRunsDir);
      const files = await readdir(this.config.cronRunsDir);
      const jsonlFiles = files.filter((f) => f.endsWith('.jsonl'));
      return {
        system: 'cron',
        status: jsonlFiles.length > 0 ? 'healthy' : 'degraded',
        lastSyncAt: info.mtime.toISOString(),
        recordCount: jsonlFiles.length,
      };
    } catch {
      return {
        system: 'cron',
        status: 'failing',
        lastSyncAt: null,
        recordCount: 0,
        errorMessage: 'Cannot access cron runs directory',
      };
    }
  }

  async getOverview(): Promise<CronOverview> {
    const now = Date.now();
    if (this.cachedOverview && now - this.cacheTime < this.cacheTtlMs) {
      return this.cachedOverview;
    }

    const jobs = new Map<string, CronRunEvent[]>();

    try {
      const files = await readdir(this.config.cronRunsDir);
      const jsonlFiles = files.filter((f) => f.endsWith('.jsonl'));

      for (const file of jsonlFiles) {
        const filePath = join(this.config.cronRunsDir, file);
        try {
          const content = await readFile(filePath, 'utf-8');
          for (const line of content.trim().split('\n')) {
            if (!line.trim()) continue;
            try {
              const event = JSON.parse(line) as CronRunEvent;
              if (event.action !== 'finished') continue;
              const jobId = event.jobId ?? file.replace('.jsonl', '');
              const existing = jobs.get(jobId) ?? [];
              existing.push(event);
              jobs.set(jobId, existing);
            } catch {
              // Skip malformed lines
            }
          }
        } catch {
          // Skip unreadable files
        }
      }
    } catch {
      // Dir doesn't exist
    }

    const jobMetrics: CronJobMetrics[] = [];
    let totalRuns = 0;
    let totalSuccess = 0;
    let totalTokens = 0;

    for (const [jobId, events] of jobs) {
      const sorted = events.sort((a, b) => a.ts - b.ts);
      const successful = sorted.filter((e) => e.status === 'ok').length;
      const failed = sorted.filter((e) => e.status === 'error').length;
      const durations = sorted.filter((e) => e.durationMs > 0).map((e) => e.durationMs);
      const avgDuration =
        durations.length > 0 ? durations.reduce((s, d) => s + d, 0) / durations.length : 0;
      const tokens = sorted.reduce((s, e) => s + (e.usage?.total_tokens ?? 0), 0);
      const last = sorted[sorted.length - 1];

      // Duration anomaly: recent 3 runs avg vs overall avg
      const recent3 = durations.slice(-3);
      const recent3Avg =
        recent3.length > 0 ? recent3.reduce((s, d) => s + d, 0) / recent3.length : 0;
      const durationAnomaly = durations.length >= 5 && recent3Avg > avgDuration * 2;

      jobMetrics.push({
        jobId,
        totalRuns: sorted.length,
        successfulRuns: successful,
        failedRuns: failed,
        successRate: sorted.length > 0 ? successful / sorted.length : 0,
        avgDurationMs: Math.round(avgDuration),
        totalTokens: tokens,
        lastRunAt: last ? new Date(last.ts).toISOString() : null,
        lastStatus: last?.status ?? 'error',
        lastError: last?.status === 'error' ? (last.error ?? null) : null,
        durationAnomaly,
        recentDurations: durations.slice(-10),
      });

      totalRuns += sorted.length;
      totalSuccess += successful;
      totalTokens += tokens;
    }

    const overview: CronOverview = {
      totalJobs: jobMetrics.length,
      totalRuns,
      overallSuccessRate: totalRuns > 0 ? totalSuccess / totalRuns : 0,
      totalTokens,
      jobs: jobMetrics.sort((a, b) => (b.lastRunAt ?? '').localeCompare(a.lastRunAt ?? '')),
    };

    this.cachedOverview = overview;
    this.cacheTime = now;
    return overview;
  }
}
