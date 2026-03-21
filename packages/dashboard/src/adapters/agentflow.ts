/**
 * AgentFlow trace adapter.
 *
 * Handles the native AgentFlow formats:
 * - .json traces (ExecutionGraph objects)
 * - .jsonl session files (Alfred session logs)
 * - .log / .trace files (systemd logs, universal log parsing)
 *
 * This adapter wraps the existing watcher parsing logic so behavior
 * is identical to before the adapter refactor.
 *
 * @module
 */

import type { TraceAdapter } from './types.js';

const SKIP_FILES = new Set([
  'workers.json',
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'biome.json',
  'auth.json',
  'models.json',
  'config.json',
]);

const SKIP_SUFFIXES = [
  '-state.json',
  '-config.json',
  '-watch-state.json',
  '.tmp',
  '.bak',
  '.backup',
];

/**
 * AgentFlow adapter — acts as the fallback adapter.
 *
 * Instead of re-implementing parsing, this adapter signals that a file
 * should be handled by the existing watcher methods. The watcher calls
 * `canHandle()` to check if the file is an AgentFlow format, then uses
 * its own `loadFile()` internally.
 *
 * This design avoids extracting 1,000+ lines of parsing code while still
 * fitting the adapter interface. A future refactor can move the parsing here.
 */
export class AgentFlowAdapter implements TraceAdapter {
  readonly name = 'agentflow';

  detect(_dirPath: string): boolean {
    // AgentFlow is the fallback — it handles any directory
    return true;
  }

  canHandle(filePath: string): boolean {
    const filename = filePath.split('/').pop() ?? '';

    // Skip known non-trace files
    if (SKIP_FILES.has(filename)) return false;
    if (SKIP_SUFFIXES.some((s) => filename.endsWith(s))) return false;

    // Handle standard AgentFlow file types
    return (
      filename.endsWith('.json') ||
      filename.endsWith('.jsonl') ||
      filename.endsWith('.log') ||
      filename.endsWith('.trace')
    );
  }

  parse(_filePath: string) {
    // Parsing delegated to watcher's existing loadFile() method.
    // This adapter is used for canHandle() routing only.
    // The watcher checks: if findAdapter() returns agentflow adapter,
    // it uses its existing internal parsing.
    return [];
  }
}
