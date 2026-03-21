/**
 * Filesystem-based knowledge store for accumulating execution intelligence.
 *
 * Stores execution and pattern events as individual JSON files, organized by
 * agentId and date. Maintains derived agent profiles that summarize execution
 * history for fast querying by guards and dashboards.
 *
 * Storage layout:
 * ```
 * {baseDir}/
 * ├── events/{agentId}/{YYYY-MM-DD}/{eventType}-{timestamp}.json
 * ├── patterns/{agentId}/{timestamp}.json
 * └── profiles/{agentId}.json
 * ```
 *
 * @module
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import type {
  AgentProfile,
  ExecutionEvent,
  ExecutionGraph,
  InsightEvent,
  KnowledgeStore,
  KnowledgeStoreConfig,
  PatternEvent,
} from './types.js';

const DEFAULT_BASE_DIR = '.agentflow/knowledge';
const MAX_RECENT_DURATIONS = 100;

/** Monotonic counter to avoid filename collisions within the same ms. */
let writeCounter = 0;

/**
 * Format epoch ms to YYYY-MM-DD for date partitioning.
 */
function toDateDir(epochMs: number): string {
  return new Date(epochMs).toISOString().slice(0, 10);
}

/**
 * Read and parse a JSON file, returning null on any error.
 */
function readJson<T>(filePath: string): T | null {
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8')) as T;
  } catch {
    return null;
  }
}

/**
 * Write JSON atomically: write to temp file, then rename.
 */
function writeJsonAtomic(filePath: string, data: unknown): void {
  const tmpPath = `${filePath}.tmp.${Date.now()}`;
  writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
  renameSync(tmpPath, filePath);
}

/**
 * Create an empty agent profile.
 */
function emptyProfile(agentId: string): AgentProfile {
  return {
    agentId,
    totalRuns: 0,
    successCount: 0,
    failureCount: 0,
    failureRate: 0,
    recentDurations: [],
    lastConformanceScore: null,
    knownBottlenecks: [],
    lastPatternTimestamp: null,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Merge an execution event into an existing profile.
 */
function mergeExecutionEvent(profile: AgentProfile, event: ExecutionEvent): AgentProfile {
  const totalRuns = profile.totalRuns + 1;
  const isFailure = event.eventType === 'execution.failed';
  const successCount = profile.successCount + (isFailure ? 0 : 1);
  const failureCount = profile.failureCount + (isFailure ? 1 : 0);

  // Rolling window for recent durations
  const durations = [...profile.recentDurations, event.duration];
  if (durations.length > MAX_RECENT_DURATIONS) {
    durations.shift();
  }

  const conformanceScore = event.processContext?.conformanceScore ?? profile.lastConformanceScore;

  return {
    agentId: profile.agentId,
    totalRuns,
    successCount,
    failureCount,
    failureRate: failureCount / totalRuns,
    recentDurations: durations,
    lastConformanceScore: conformanceScore,
    knownBottlenecks: profile.knownBottlenecks,
    lastPatternTimestamp: profile.lastPatternTimestamp,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Merge a pattern event into an existing profile.
 */
function mergePatternEvent(profile: AgentProfile, event: PatternEvent): AgentProfile {
  const existingBottlenecks = new Set(profile.knownBottlenecks);
  for (const b of event.pattern.topBottlenecks) {
    existingBottlenecks.add(b.nodeName);
  }

  return {
    ...profile,
    knownBottlenecks: [...existingBottlenecks],
    lastPatternTimestamp: event.timestamp,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Create a filesystem-based knowledge store for accumulating execution intelligence.
 *
 * @param config - Optional configuration with base directory path.
 * @returns A KnowledgeStore that persists events and maintains agent profiles.
 *
 * @example
 * ```ts
 * const store = createKnowledgeStore({ baseDir: '.agentflow/knowledge' });
 * store.append(createExecutionEvent(graph));
 * const profile = store.getAgentProfile('my-agent');
 * ```
 */
export function createKnowledgeStore(config?: KnowledgeStoreConfig): KnowledgeStore {
  const baseDir = config?.baseDir ?? DEFAULT_BASE_DIR;

  const eventsDir = join(baseDir, 'events');
  const patternsDir = join(baseDir, 'patterns');
  const profilesDir = join(baseDir, 'profiles');
  const insightsDir = join(baseDir, 'insights');

  function ensureDir(dir: string): void {
    mkdirSync(dir, { recursive: true });
  }

  function profilePath(agentId: string): string {
    // Prevent path traversal: strip directory separators and traversal patterns
    const safe = agentId.replace(/[/\\]/g, '_').replace(/\.\./g, '_');
    return join(profilesDir, `${safe}.json`);
  }

  function appendExecutionEvent(event: ExecutionEvent): void {
    const dateDir = join(eventsDir, event.agentId, toDateDir(event.timestamp));
    ensureDir(dateDir);

    const typePart = event.eventType.replace(/\./g, '-');
    const seq = String(writeCounter++).padStart(4, '0');
    const fileName = `${typePart}-${event.timestamp}-${seq}.json`;
    writeFileSync(join(dateDir, fileName), JSON.stringify(event, null, 2), 'utf-8');

    // Update profile
    ensureDir(profilesDir);
    const existing =
      readJson<AgentProfile>(profilePath(event.agentId)) ?? emptyProfile(event.agentId);
    const updated = mergeExecutionEvent(existing, event);
    writeJsonAtomic(profilePath(event.agentId), updated);
  }

  function appendPatternEvent(event: PatternEvent): void {
    const agentPatternDir = join(patternsDir, event.agentId);
    ensureDir(agentPatternDir);

    const seq = String(writeCounter++).padStart(4, '0');
    const fileName = `${event.timestamp}-${seq}.json`;
    writeFileSync(join(agentPatternDir, fileName), JSON.stringify(event, null, 2), 'utf-8');

    // Update profile
    ensureDir(profilesDir);
    const existing =
      readJson<AgentProfile>(profilePath(event.agentId)) ?? emptyProfile(event.agentId);
    const updated = mergePatternEvent(existing, event);
    writeJsonAtomic(profilePath(event.agentId), updated);
  }

  return {
    baseDir,

    append(event: ExecutionEvent | PatternEvent): void {
      if (event.eventType === 'pattern.discovered' || event.eventType === 'pattern.updated') {
        appendPatternEvent(event as PatternEvent);
      } else {
        appendExecutionEvent(event as ExecutionEvent);
      }
    },

    getRecentEvents(
      agentId: string,
      options?: { limit?: number; since?: number },
    ): ExecutionEvent[] {
      const limit = options?.limit ?? 50;
      const since = options?.since ?? 0;

      const agentDir = join(eventsDir, agentId);
      if (!existsSync(agentDir)) return [];

      const events: ExecutionEvent[] = [];

      // Read all date directories (sorted descending for recent-first)
      const dateDirs = readdirSync(agentDir).sort().reverse();

      for (const dateDir of dateDirs) {
        const fullDateDir = join(agentDir, dateDir);
        let files: string[];
        try {
          files = readdirSync(fullDateDir).filter((f) => f.endsWith('.json'));
        } catch {
          continue;
        }

        for (const file of files) {
          const event = readJson<ExecutionEvent>(join(fullDateDir, file));
          if (event && event.timestamp > since) {
            events.push(event);
          }
        }

        if (events.length >= limit * 2) break; // Early exit with buffer for sorting
      }

      // Sort newest first, apply limit
      events.sort((a, b) => b.timestamp - a.timestamp);
      return events.slice(0, limit);
    },

    getAgentProfile(agentId: string): AgentProfile | null {
      return readJson<AgentProfile>(profilePath(agentId));
    },

    getPatternHistory(agentId: string, options?: { limit?: number }): PatternEvent[] {
      const limit = options?.limit ?? 20;
      const agentPatternDir = join(patternsDir, agentId);

      if (!existsSync(agentPatternDir)) return [];

      const files = readdirSync(agentPatternDir)
        .filter((f) => f.endsWith('.json'))
        .sort()
        .reverse();

      const events: PatternEvent[] = [];
      for (const file of files.slice(0, limit)) {
        const event = readJson<PatternEvent>(join(agentPatternDir, file));
        if (event) events.push(event);
      }

      return events;
    },

    compact(options: { olderThan: number }): { removed: number } {
      let removed = 0;

      // Compact events — check individual file timestamps
      if (existsSync(eventsDir)) {
        for (const agentId of readdirSync(eventsDir)) {
          const agentDir = join(eventsDir, agentId);
          let dateDirs: string[];
          try {
            dateDirs = readdirSync(agentDir);
          } catch {
            continue;
          }

          for (const dateDir of dateDirs) {
            const fullDateDir = join(agentDir, dateDir);
            let files: string[];
            try {
              files = readdirSync(fullDateDir).filter((f) => f.endsWith('.json'));
            } catch {
              continue;
            }

            for (const file of files) {
              // Filename: {eventType}-{timestamp}-{seq}.json — extract timestamp
              const parts = file.replace('.json', '').split('-');
              // timestamp is after the event type parts (execution-completed-{ts}-{seq})
              const tsPart = parts[parts.length - 2];
              const ts = tsPart ? Number.parseInt(tsPart, 10) : 0;
              if (!Number.isNaN(ts) && ts < options.olderThan) {
                try {
                  rmSync(join(fullDateDir, file));
                  removed++;
                } catch {
                  // skip
                }
              }
            }

            // Remove empty date directories
            try {
              if (readdirSync(fullDateDir).length === 0) {
                rmSync(fullDateDir, { recursive: true });
              }
            } catch {
              // skip
            }
          }
        }
      }

      // Compact patterns
      if (existsSync(patternsDir)) {
        for (const agentId of readdirSync(patternsDir)) {
          const agentPatternDir = join(patternsDir, agentId);
          let files: string[];
          try {
            files = readdirSync(agentPatternDir).filter((f) => f.endsWith('.json'));
          } catch {
            continue;
          }

          for (const file of files) {
            // Filename is {timestamp}-{seq}.json
            const ts = Number.parseInt(file.split('-')[0] ?? '', 10);
            if (!Number.isNaN(ts) && ts < options.olderThan) {
              try {
                rmSync(join(agentPatternDir, file));
                removed++;
              } catch {
                // Skip files that can't be removed
              }
            }
          }
        }
      }

      // Compact insights
      if (existsSync(insightsDir)) {
        for (const agentId of readdirSync(insightsDir)) {
          const agentInsightDir = join(insightsDir, agentId);
          let files: string[];
          try {
            files = readdirSync(agentInsightDir).filter((f) => f.endsWith('.json'));
          } catch {
            continue;
          }

          for (const file of files) {
            // Filename: {insightType}-{timestamp}-{seq}.json — extract timestamp
            const parts = file.replace('.json', '').split('-');
            const tsPart = parts[parts.length - 2];
            const ts = tsPart ? Number.parseInt(tsPart, 10) : 0;
            if (!Number.isNaN(ts) && ts < options.olderThan) {
              try {
                rmSync(join(agentInsightDir, file));
                removed++;
              } catch {
                // Skip files that can't be removed
              }
            }
          }
        }
      }

      return { removed };
    },

    appendInsight(event: InsightEvent): void {
      const agentInsightDir = join(insightsDir, event.agentId);
      ensureDir(agentInsightDir);

      const seq = String(writeCounter++).padStart(4, '0');
      const fileName = `${event.insightType}-${event.timestamp}-${seq}.json`;
      writeFileSync(join(agentInsightDir, fileName), JSON.stringify(event, null, 2), 'utf-8');
    },

    getRecentInsights(
      agentId: string,
      options?: { type?: string; limit?: number },
    ): InsightEvent[] {
      const limit = options?.limit ?? 10;
      const typeFilter = options?.type;

      const agentInsightDir = join(insightsDir, agentId);
      if (!existsSync(agentInsightDir)) return [];

      const files = readdirSync(agentInsightDir).filter((f) => f.endsWith('.json'));

      const events: InsightEvent[] = [];
      for (const file of files) {
        const event = readJson<InsightEvent>(join(agentInsightDir, file));
        if (event) {
          if (typeFilter && event.insightType !== typeFilter) continue;
          events.push(event);
        }
      }

      // Sort newest first by timestamp, apply limit
      events.sort((a, b) => b.timestamp - a.timestamp);
      return events.slice(0, limit);
    },

    // EventWriter interface
    async write(_graph: ExecutionGraph): Promise<void> {
      // No-op: KnowledgeStore handles structured events, not raw graphs.
    },

    async writeEvent(event: ExecutionEvent | PatternEvent): Promise<void> {
      this.append(event);
    },
  };
}
