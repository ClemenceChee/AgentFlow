/**
 * OpenClaw trace adapter.
 *
 * Reads cron job definitions from `cron/jobs.json` and run logs from
 * `cron/runs/*.jsonl` to produce normalized traces.
 *
 * Each finished cron run becomes one trace with agentId `openclaw:<jobId>`.
 *
 * @module
 */

import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import type { NormalizedTrace, TraceAdapter } from './types.js';

interface OpenClawJob {
  id: string;
  name?: string;
  agentId?: string;
  description?: string;
  schedule?: string;
  enabled?: boolean;
}

interface OpenClawRunEntry {
  ts: number;
  jobId: string;
  action: string;
  status: string;
  error?: string;
  summary?: string;
  sessionId?: string;
  sessionKey?: string;
  runAtMs?: number;
  durationMs?: number;
  nextRunAtMs?: number;
  model?: string;
  provider?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
  delivered?: boolean;
  deliveryStatus?: string;
}

/** Cache of job definitions per directory. */
const jobCache = new Map<string, Map<string, OpenClawJob>>();

function loadJobs(openclawDir: string): Map<string, OpenClawJob> {
  const cached = jobCache.get(openclawDir);
  if (cached) return cached;

  const jobsPath = join(openclawDir, 'cron', 'jobs.json');
  const map = new Map<string, OpenClawJob>();

  try {
    if (existsSync(jobsPath)) {
      const data = JSON.parse(readFileSync(jobsPath, 'utf-8'));
      const jobs: OpenClawJob[] = Array.isArray(data) ? data : (data.jobs ?? []);
      for (const job of jobs) {
        if (job.id) map.set(job.id, job);
      }
    }
  } catch {
    // Corrupt or missing — proceed without names
  }

  jobCache.set(openclawDir, map);
  return map;
}

/** Find the OpenClaw root directory from a file path. */
function findOpenClawRoot(filePath: string): string | null {
  let dir = dirname(filePath);
  for (let i = 0; i < 5; i++) {
    if (existsSync(join(dir, 'cron', 'jobs.json')) || basename(dir) === '.openclaw') {
      return dir;
    }
    dir = dirname(dir);
  }
  return null;
}

export class OpenClawAdapter implements TraceAdapter {
  readonly name = 'openclaw';

  detect(dirPath: string): boolean {
    return (
      existsSync(join(dirPath, 'cron', 'jobs.json')) ||
      dirPath.includes('.openclaw') ||
      existsSync(join(dirPath, 'cron', 'runs'))
    );
  }

  canHandle(filePath: string): boolean {
    // Handle JSONL files in cron/runs/ directories under an OpenClaw root
    if (!filePath.endsWith('.jsonl')) return false;
    return filePath.includes('/cron/runs/') || filePath.includes('\\cron\\runs\\');
  }

  parse(filePath: string): NormalizedTrace[] {
    const traces: NormalizedTrace[] = [];

    try {
      const content = readFileSync(filePath, 'utf-8');
      const root = findOpenClawRoot(filePath);
      const jobs = root ? loadJobs(root) : new Map<string, OpenClawJob>();

      for (const line of content.split('\n')) {
        if (!line.trim()) continue;

        let entry: OpenClawRunEntry;
        try {
          entry = JSON.parse(line);
        } catch {
          continue;
        }

        // Only process finished runs
        if (entry.action !== 'finished') continue;

        const jobId = entry.jobId ?? basename(filePath, '.jsonl');
        const job = jobs.get(jobId);
        const jobName = job?.name ?? jobId;
        const startTime = entry.runAtMs ?? entry.ts;
        const duration = entry.durationMs ?? 0;

        const trace: NormalizedTrace = {
          id: entry.sessionId ?? `${jobId}-${entry.ts}`,
          agentId: `openclaw:${jobId}`,
          name: jobName,
          status: entry.status === 'ok' ? 'completed' : entry.status === 'error' ? 'failed' : 'unknown',
          startTime,
          endTime: startTime + duration,
          trigger: 'cron',
          source: 'openclaw',
          nodes: {
            root: {
              id: 'root',
              type: 'cron-job',
              name: jobName,
              status: entry.status === 'ok' ? 'completed' : entry.status === 'error' ? 'failed' : 'unknown',
              startTime,
              endTime: startTime + duration,
              parentId: null,
              children: [],
              metadata: {
                jobId,
                summary: entry.summary,
                error: entry.error,
                delivered: entry.delivered,
                deliveryStatus: entry.deliveryStatus,
              },
            },
          },
          metadata: {
            model: entry.model,
            provider: entry.provider,
            usage: entry.usage,
            sessionId: entry.sessionId,
            sessionKey: entry.sessionKey,
            nextRunAtMs: entry.nextRunAtMs,
          },
          filePath,
        };

        traces.push(trace);
      }
    } catch {
      // Skip unparseable files
    }

    return traces;
  }
}
