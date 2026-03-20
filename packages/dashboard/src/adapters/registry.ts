/**
 * Adapter registry — ordered list of trace adapters.
 * More specific adapters first, AgentFlow as fallback.
 *
 * @module
 */

import type { TraceAdapter } from './types.js';

const adapters: TraceAdapter[] = [];

/** Register an adapter. Earlier registrations have higher priority. */
export function registerAdapter(adapter: TraceAdapter): void {
  adapters.push(adapter);
}

/** Find the first adapter that can handle a file. */
export function findAdapter(filePath: string): TraceAdapter | null {
  for (const adapter of adapters) {
    if (adapter.canHandle(filePath)) return adapter;
  }
  return null;
}

/** Find all adapters that detect traces in a directory. */
export function detectAdapters(dirPath: string): TraceAdapter[] {
  return adapters.filter((a) => a.detect(dirPath));
}

/** Get all registered adapters (for debugging/status). */
export function getAdapters(): readonly TraceAdapter[] {
  return adapters;
}
