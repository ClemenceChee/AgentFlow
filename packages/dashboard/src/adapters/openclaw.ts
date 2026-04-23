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

        const runStatus =
          entry.status === 'ok' ? 'completed' : entry.status === 'error' ? 'failed' : 'unknown';

        // Parse execution steps from summary markdown
        const summary = entry.summary ?? '';
        const nodes: NormalizedTrace['nodes'] = {};
        const rootChildren: string[] = [];
        let stepIdx = 0;
        let m: RegExpExecArray | null;

        // Table format: | **1. Step Name** | ✅ | Details |
        const tableRe = /\|\s*\*?\*?(\d+)\.\s*\*?\*?([^|]+)\*?\*?\s*\|\s*([^|]+)\s*\|\s*([^|]*)\|/g;
        while ((m = tableRe.exec(summary)) !== null) {
          stepIdx++;
          const nodeId = `step-${stepIdx}`;
          rootChildren.push(nodeId);
          nodes[nodeId] = {
            id: nodeId,
            type: 'tool',
            name: m[2]?.trim().replace(/\*+/g, '') || `Step ${stepIdx}`,
            status:
              m[3]?.includes('\u274C') || m[3]?.toLowerCase().includes('fail')
                ? 'failed'
                : 'completed',
            startTime: startTime + (stepIdx - 1) * Math.floor(duration / Math.max(1, stepIdx + 1)),
            endTime: startTime + stepIdx * Math.floor(duration / Math.max(1, stepIdx + 1)),
            parentId: 'root',
            children: [],
            metadata: { detail: m[4]?.trim() || '' },
          };
        }

        // Fallback: numbered list — 1. **Step** — details
        if (stepIdx === 0) {
          const listRe = /^\s*(\d+)\.\s*\*?\*?([^*\n]+)\*?\*?\s*(?:[-\u2014]\s*(.+))?$/gm;
          while ((m = listRe.exec(summary)) !== null) {
            if (m[2]?.trim().startsWith('#')) continue;
            stepIdx++;
            const nodeId = `step-${stepIdx}`;
            const detail = m[3]?.trim() || '';
            rootChildren.push(nodeId);
            nodes[nodeId] = {
              id: nodeId,
              type: 'tool',
              name: m[2]?.trim().replace(/\*+/g, '') || `Step ${stepIdx}`,
              status: detail.toLowerCase().includes('fail') ? 'failed' : 'completed',
              startTime:
                startTime + (stepIdx - 1) * Math.floor(duration / Math.max(1, stepIdx + 1)),
              endTime: startTime + stepIdx * Math.floor(duration / Math.max(1, stepIdx + 1)),
              parentId: 'root',
              children: [],
              metadata: { detail },
            };
          }
        }

        // Fallback: extract markdown section headers as pseudo-steps
        if (stepIdx === 0 && summary.length > 50) {
          const sectionRe = /(?:^|\n)\s*(?:#{1,3}|(?:\*\*[^*\n]{3,50}\*\*))\s*(.+)/g;
          while ((m = sectionRe.exec(summary)) !== null) {
            const heading =
              m[1]
                ?.trim()
                .replace(/\*+/g, '')
                .replace(/^#+\s*/, '') || '';
            if (
              !heading ||
              heading.length < 3 ||
              heading.startsWith('|') ||
              heading.startsWith('---')
            )
              continue;
            stepIdx++;
            const nodeId = `section-${stepIdx}`;
            rootChildren.push(nodeId);
            nodes[nodeId] = {
              id: nodeId,
              type: 'custom',
              name: heading.slice(0, 60),
              status: 'completed',
              startTime:
                startTime + (stepIdx - 1) * Math.floor(duration / Math.max(1, stepIdx + 1)),
              endTime: startTime + stepIdx * Math.floor(duration / Math.max(1, stepIdx + 1)),
              parentId: 'root',
              children: [],
              metadata: {},
            };
            if (stepIdx >= 10) break; // Cap to avoid noise
          }
        }

        nodes.root = {
          id: 'root',
          type: 'cron-job',
          name: jobName,
          status: runStatus,
          startTime,
          endTime: startTime + duration,
          parentId: null,
          children: rootChildren,
          metadata: {
            jobId,
            summary: entry.summary,
            error: entry.error,
            delivered: entry.delivered,
            deliveryStatus: entry.deliveryStatus,
          },
        };

        const trace: NormalizedTrace = {
          id: entry.sessionId ?? `${jobId}-${entry.ts}`,
          agentId: `openclaw:${jobId}`,
          name: jobName,
          status: runStatus,
          startTime,
          endTime: startTime + duration,
          trigger: 'cron',
          source: 'openclaw',
          nodes,
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
