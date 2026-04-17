/**
 * Soma-compatible event writer for AgentFlow.
 *
 * Converts AgentFlow events (ExecutionEvent, PatternEvent) into Markdown files
 * with YAML frontmatter that Soma's Curator can ingest from its inbox directory.
 *
 * @module
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { EventWriter, ExecutionEvent, ExecutionGraph, PatternEvent } from './types.js';

/**
 * Configuration for the Soma event writer.
 */
export interface SomaEventWriterConfig {
  /** Directory to write event files to (Soma's inbox). Created if it does not exist. */
  readonly inboxDir: string;
}

/**
 * Format an epoch-ms timestamp as a compact ISO string (no colons, no ms).
 *
 * @example compactIso(1773671702828) → "2026-03-14T083502"
 */
function compactIso(epochMs: number): string {
  return new Date(epochMs).toISOString().slice(0, 19).replace(/:/g, '');
}

/**
 * Format an epoch-ms timestamp as an ISO date string.
 *
 * @example isoDate(1773671702828) → "2026-03-14"
 */
function isoDate(epochMs: number): string {
  return new Date(epochMs).toISOString().slice(0, 10);
}

/**
 * Render a YAML frontmatter block from key-value pairs.
 * Arrays are rendered as YAML flow sequences. Undefined values are omitted.
 */
function renderFrontmatter(
  fields: Record<string, string | number | boolean | string[] | undefined>,
): string {
  const lines = ['---'];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      lines.push(`${key}: [${value.map((v) => `'${v}'`).join(', ')}]`);
    } else if (typeof value === 'string') {
      lines.push(`${key}: '${value}'`);
    } else {
      lines.push(`${key}: ${String(value)}`);
    }
  }
  lines.push('---');
  return lines.join('\n');
}

/**
 * Format duration in ms to a human-readable string.
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}min`;
}

/**
 * Convert an ExecutionEvent to Markdown with YAML frontmatter.
 */
function executionEventToMarkdown(event: ExecutionEvent): string {
  const isCompleted = event.eventType === 'execution.completed';
  const subtype = isCompleted ? 'completed' : 'failed';

  const tags: string[] = ['agentflow/execution', `agent/${event.agentId}`, `status/${subtype}`];

  if (event.processContext?.isAnomaly) {
    tags.push('agentflow/anomaly');
  }

  const frontmatter: Record<string, string | number | boolean | string[] | undefined> = {
    type: 'execution',
    subtype,
    name: `Execution: ${event.agentId} — ${subtype}`,
    source: 'agentflow',
    created: isoDate(event.timestamp),
    alfred_tags: tags,
    agentflow_graph_id: event.graphId,
    duration_ms: event.duration,
    node_count: event.nodeCount,
    operator_id: event.operatorId,
    operator_session_id: event.operatorContext?.sessionId,
    operator_team_id: event.operatorContext?.teamId,
    operator_instance_id: event.operatorContext?.instanceId,
  };

  if (event.processContext) {
    frontmatter.conformance_score = event.processContext.conformanceScore;
    frontmatter.is_anomaly = event.processContext.isAnomaly;
  }

  const body: string[] = [];
  body.push(`# Execution: ${event.agentId} — ${subtype}\n`);
  body.push(`**Duration:** ${formatDuration(event.duration)}  `);
  body.push(`**Nodes:** ${event.nodeCount}  `);
  body.push(`**Status:** ${event.status}\n`);

  if (event.pathSignature) {
    body.push(`## Path\n`);
    body.push(`\`${event.pathSignature}\`\n`);
  }

  if (!isCompleted && event.failurePoint) {
    const fp = event.failurePoint;
    body.push(`## Failure Point\n`);
    body.push(`**Node:** ${fp.nodeType}:${fp.nodeName} (\`${fp.nodeId}\`)  `);
    if (fp.error) {
      body.push(`**Error:** ${fp.error}\n`);
    }
  }

  if (event.processContext) {
    body.push(`## Process Context\n`);
    body.push(`**Conformance:** ${(event.processContext.conformanceScore * 100).toFixed(0)}%  `);
    body.push(`**Anomaly:** ${event.processContext.isAnomaly ? 'yes' : 'no'}\n`);
  }

  body.push(`## Related\n`);
  body.push(`- [[agent/${event.agentId}]]`);

  return `${renderFrontmatter(frontmatter)}\n\n${body.join('\n')}`;
}

/**
 * Convert a PatternEvent to Markdown with YAML frontmatter.
 */
function patternEventToMarkdown(event: PatternEvent): string {
  const { pattern } = event;

  const tags: string[] = ['agentflow/pattern', `agent/${event.agentId}`];

  const frontmatter: Record<string, string | number | boolean | string[] | undefined> = {
    type: 'synthesis',
    subtype: 'pattern-discovery',
    name: `Pattern: ${event.agentId} — ${pattern.variantCount} variants across ${pattern.totalGraphs} runs`,
    source: 'agentflow',
    created: isoDate(event.timestamp),
    alfred_tags: tags,
    variant_count: pattern.variantCount,
    total_graphs: pattern.totalGraphs,
    operator_id: event.operatorId,
    operator_session_id: event.operatorContext?.sessionId,
    operator_team_id: event.operatorContext?.teamId,
    operator_instance_id: event.operatorContext?.instanceId,
  };

  const body: string[] = [];
  body.push(`# Pattern: ${event.agentId}\n`);
  body.push(`**Variants:** ${pattern.variantCount}  `);
  body.push(`**Total Runs:** ${pattern.totalGraphs}\n`);

  if (pattern.topVariants.length > 0) {
    body.push(`## Top Variants\n`);
    body.push(`| Path | Count | % |`);
    body.push(`|------|-------|---|`);
    for (const v of pattern.topVariants) {
      const sig =
        v.pathSignature.length > 60 ? `${v.pathSignature.slice(0, 57)}...` : v.pathSignature;
      body.push(`| \`${sig}\` | ${v.count} | ${v.percentage.toFixed(1)}% |`);
    }
    body.push('');
  }

  if (pattern.topBottlenecks.length > 0) {
    body.push(`## Top Bottlenecks\n`);
    body.push(`| Node | Type | p95 |`);
    body.push(`|------|------|-----|`);
    for (const b of pattern.topBottlenecks) {
      body.push(`| ${b.nodeName} | ${b.nodeType} | ${formatDuration(b.p95)} |`);
    }
    body.push('');
  }

  body.push(`## Related\n`);
  body.push(`- [[agent/${event.agentId}]]`);

  return `${renderFrontmatter(frontmatter)}\n\n${body.join('\n')}`;
}

/**
 * Create a Soma event writer that persists events as Curator-compatible Markdown files.
 *
 * Each event is written to `{type}-{agentId}-{compact-ISO-timestamp}.md` in the
 * configured inbox directory. The Curator picks up these files on its 60-second cycle.
 *
 * @param config - Writer configuration with inbox directory path.
 * @returns An EventWriter that writes Markdown files to the Soma inbox.
 *
 * @example
 * ```ts
 * const writer = createSomaEventWriter({ inboxDir: '~/.openclaw/workspace/inbox' });
 * const emitter = createEventEmitter({ writers: [writer] });
 * await emitter.emit(createExecutionEvent(graph));
 * // Creates: ~/.openclaw/workspace/inbox/execution-alfred-20260314T083502.md
 * ```
 */
export function createSomaEventWriter(config: SomaEventWriterConfig): EventWriter {
  const { inboxDir } = config;

  function ensureDir(): void {
    mkdirSync(inboxDir, { recursive: true });
  }

  function eventFileName(event: ExecutionEvent | PatternEvent): string {
    const agentId = event.agentId;
    const ts = compactIso(event.timestamp);

    if (event.eventType === 'pattern.discovered' || event.eventType === 'pattern.updated') {
      return `synthesis-${agentId}-${ts}.md`;
    }
    return `execution-${agentId}-${ts}.md`;
  }

  return {
    async write(_graph: ExecutionGraph): Promise<void> {
      // No-op: SomaEventWriter only handles structured events.
    },

    async writeEvent(event: ExecutionEvent | PatternEvent): Promise<void> {
      ensureDir();

      const markdown =
        event.eventType === 'pattern.discovered' || event.eventType === 'pattern.updated'
          ? patternEventToMarkdown(event as PatternEvent)
          : executionEventToMarkdown(event as ExecutionEvent);

      const fileName = eventFileName(event);
      writeFileSync(join(inboxDir, fileName), markdown, 'utf-8');
    },
  };
}
