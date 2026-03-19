/**
 * JSON file-based event writer for AgentFlow.
 *
 * Writes each event as an individual JSON file to a configurable directory.
 * Designed for filesystem-as-IPC: Soma's Curator (or any file-watching consumer)
 * picks up events from the output directory.
 *
 * @module
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { EventWriter, ExecutionEvent, ExecutionGraph, PatternEvent } from './types.js';

/**
 * Configuration for the JSON event writer.
 */
export interface JsonEventWriterConfig {
  /** Directory to write event files to. Created if it does not exist. */
  readonly outputDir: string;
}

/**
 * Create a JSON event writer that persists events as individual files.
 *
 * Each event is written to `{eventType}-{agentId}-{timestamp}.json` where
 * dots in the eventType are replaced with dashes. Files are formatted with
 * 2-space indentation for human readability.
 *
 * The `write(graph)` method is a no-op — this writer only handles structured events.
 *
 * @param config - Writer configuration with output directory.
 * @returns An EventWriter that writes JSON files.
 *
 * @example
 * ```ts
 * const writer = createJsonEventWriter({ outputDir: './events' });
 * await writer.writeEvent(executionEvent);
 * // Creates: events/execution-completed-my-agent-1710800000000.json
 * ```
 */
export function createJsonEventWriter(config: JsonEventWriterConfig): EventWriter {
  const { outputDir } = config;

  function ensureDir(): void {
    mkdirSync(outputDir, { recursive: true });
  }

  function eventFileName(event: ExecutionEvent | PatternEvent): string {
    const typePart = event.eventType.replace(/\./g, '-');
    const agentId = 'agentId' in event ? event.agentId : 'unknown';
    return `${typePart}-${agentId}-${event.timestamp}.json`;
  }

  return {
    async write(_graph: ExecutionGraph): Promise<void> {
      // No-op: JsonEventWriter only handles structured events, not raw graphs.
    },

    async writeEvent(event: ExecutionEvent | PatternEvent): Promise<void> {
      ensureDir();
      const fileName = eventFileName(event);
      const filePath = join(outputDir, fileName);
      writeFileSync(filePath, JSON.stringify(event, null, 2), 'utf-8');
    },
  };
}
