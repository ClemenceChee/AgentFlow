/**
 * Trace scanner — reads AgentFlow ExecutionGraph JSON files from disk
 * and converts them to ExecutionEvents for Soma ingestion.
 *
 * @module
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
import type { ExecutionEvent } from 'agentflow-core';

export interface ScanResult {
  events: ExecutionEvent[];
  filesScanned: number;
  filesSkipped: number;
  errors: string[];
}

/**
 * Map trace file status values to ExecutionEvent eventType.
 * Real traces use "success"/"completed"/"error", not "failed".
 */
function mapEventType(status: string): 'execution.completed' | 'execution.failed' {
  if (status === 'error' || status === 'failed') return 'execution.failed';
  return 'execution.completed';
}

/**
 * Map trace file status to graph status for the event.
 */
function mapStatus(status: string): 'running' | 'completed' | 'failed' {
  if (status === 'success') return 'completed';
  if (status === 'error' || status === 'failed') return 'failed';
  if (status === 'running') return 'running';
  return 'completed';
}

/**
 * Compute a simple path signature from nodes.
 */
function computePathSignature(nodes: Record<string, unknown>): string {
  const nodeList = Object.values(nodes) as Array<{ type?: string; name?: string; startTime?: number }>;
  nodeList.sort((a, b) => (a.startTime ?? 0) - (b.startTime ?? 0));
  return nodeList.map((n) => `${n.type ?? '?'}:${n.name ?? '?'}`).join('→');
}

/**
 * Convert a raw trace JSON object to an ExecutionEvent.
 * Builds the event directly rather than using createExecutionEvent
 * (which requires a Map-based nodes field and uses Date.now() for timestamp).
 */
function traceToEvent(raw: Record<string, unknown>): ExecutionEvent | null {
  const agentId = raw.agentId as string;
  const status = raw.status as string;
  const startTime = raw.startTime as number;
  const endTime = raw.endTime as number;
  const nodes = (raw.nodes ?? {}) as Record<string, unknown>;
  const graphId = (raw.id as string) ?? `${agentId}-${startTime}`;

  if (!agentId || !startTime) return null;

  const duration = (endTime ?? startTime) - startTime;
  const nodeCount = Object.keys(nodes).length;
  const pathSignature = computePathSignature(nodes);

  return {
    eventType: mapEventType(status),
    graphId,
    agentId,
    timestamp: startTime, // Use original timestamp, not Date.now()
    schemaVersion: 1,
    status: mapStatus(status),
    duration,
    nodeCount,
    pathSignature,
    violations: [],
  } as ExecutionEvent;
}

/**
 * Convert an OpenClaw JSONL cron run entry to an ExecutionEvent.
 * Each "finished" line becomes one event with agentId `openclaw:<jobId>`.
 */
function cronRunToEvent(entry: Record<string, unknown>, filePath: string): ExecutionEvent | null {
  if (entry.action !== 'finished') return null;

  const jobId = (entry.jobId as string) ?? basename(filePath, '.jsonl');
  const agentId = `openclaw:${jobId}`;
  const startTime = (entry.runAtMs as number) ?? (entry.ts as number);
  const duration = (entry.durationMs as number) ?? 0;
  const status = entry.status as string;

  if (!startTime) return null;

  return {
    eventType: status === 'ok' ? 'execution.completed' : 'execution.failed',
    graphId: (entry.sessionId as string) ?? `${jobId}-${startTime}`,
    agentId,
    timestamp: startTime,
    schemaVersion: 1,
    status: status === 'ok' ? 'completed' : 'failed',
    duration,
    nodeCount: 1,
    pathSignature: `cron-job:${jobId}`,
    violations: [],
  } as ExecutionEvent;
}

/**
 * Parse a JSONL file (one JSON object per line) and extract events.
 */
function parseJsonlFile(filePath: string): ExecutionEvent[] {
  const events: ExecutionEvent[] = [];
  try {
    const content = readFileSync(filePath, 'utf-8');
    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line) as Record<string, unknown>;
        const event = cronRunToEvent(entry, filePath);
        if (event) events.push(event);
      } catch { /* skip bad line */ }
    }
  } catch { /* skip unreadable file */ }
  return events;
}

/**
 * Recursively find all .json and .jsonl files in a directory.
 */
function findTraceFiles(dir: string): string[] {
  const results: string[] = [];
  if (!existsSync(dir)) return results;

  const entries = readdirSync(dir);
  for (const entry of entries) {
    if (entry.startsWith('.') || entry.startsWith('_')) continue;
    // Skip renamed/deleted/reset files
    if (entry.includes('.deleted.') || entry.includes('.reset.')) continue;
    const fullPath = join(dir, entry);
    try {
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        results.push(...findTraceFiles(fullPath));
      } else if (extname(entry) === '.json' || extname(entry) === '.jsonl') {
        results.push(fullPath);
      }
    } catch { /* skip inaccessible */ }
  }

  return results;
}

/**
 * Scan one or more directories for trace files (.json and .jsonl)
 * and convert them to ExecutionEvents.
 *
 * - `.json` files: parsed as AgentFlow ExecutionGraph objects
 * - `.jsonl` files: parsed as OpenClaw cron run logs (one entry per line)
 */
export function scanTraces(dirs: string[]): ScanResult {
  const events: ExecutionEvent[] = [];
  const errors: string[] = [];
  let filesScanned = 0;
  let filesSkipped = 0;

  for (const dir of dirs) {
    const files = findTraceFiles(dir);
    for (const file of files) {
      filesScanned++;

      if (extname(file) === '.jsonl') {
        // OpenClaw JSONL cron runs
        const jsonlEvents = parseJsonlFile(file);
        events.push(...jsonlEvents);
        if (jsonlEvents.length === 0) filesSkipped++;
        continue;
      }

      // Standard AgentFlow JSON trace or ExecutionEvent
      try {
        const content = readFileSync(file, 'utf-8');
        const raw = JSON.parse(content) as Record<string, unknown>;

        // Check if it's already an ExecutionEvent (from AgentFlow knowledge store)
        if (raw.eventType && raw.agentId && raw.timestamp) {
          const event: ExecutionEvent = {
            eventType: mapEventType(String(raw.status ?? raw.eventType)),
            graphId: String(raw.graphId ?? ''),
            agentId: String(raw.agentId),
            timestamp: Number(raw.timestamp),
            schemaVersion: Number(raw.schemaVersion ?? 1),
            status: mapStatus(String(raw.status ?? 'completed')),
            duration: Number(raw.duration ?? 0),
            nodeCount: Number(raw.nodeCount ?? 1),
            pathSignature: String(raw.pathSignature ?? ''),
            violations: Array.isArray(raw.violations) ? raw.violations : [],
          };
          events.push(event);
          continue;
        }

        // Full ExecutionGraph object (has nodes map)
        if (!raw.agentId || !raw.nodes) {
          filesSkipped++;
          continue;
        }

        const event = traceToEvent(raw);
        if (event) {
          events.push(event);
        } else {
          filesSkipped++;
        }
      } catch (err) {
        filesSkipped++;
        errors.push(`${file}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  return { events, filesScanned, filesSkipped, errors };
}
