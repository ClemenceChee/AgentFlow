import { watch } from 'fs';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { loadGraph } from 'agentflow-core';
import { exportGraphToOTel } from './index.js';

/**
 * File system watcher that automatically exports AgentFlow traces to OpenTelemetry
 */
export class OTelWatcher {
  private watchers: Array<() => void> = [];
  private processedFiles = new Set<string>();

  constructor(private directories: string[]) {}

  /**
   * Start watching for new AgentFlow trace files
   */
  start(): void {
    console.log(`🔭 Starting OTel watcher for directories: ${this.directories.join(', ')}`);

    for (const dir of this.directories) {
      const watcher = watch(dir, { recursive: true }, async (eventType, filename) => {
        if (eventType === 'rename' && filename?.endsWith('.json')) {
          const filePath = join(dir, filename);
          await this.processTraceFile(filePath);
        }
      });

      this.watchers.push(() => watcher.close());
    }

    // Process existing files
    this.processExistingFiles();
  }

  /**
   * Stop watching
   */
  stop(): void {
    this.watchers.forEach(cleanup => cleanup());
    this.watchers = [];
    console.log('🔭 OTel watcher stopped');
  }

  private async processExistingFiles(): Promise<void> {
    // This would typically scan existing JSON files in the directories
    // For now, just log that we're ready
    console.log('🔭 OTel watcher ready for new traces');
  }

  private async processTraceFile(filePath: string): Promise<void> {
    if (this.processedFiles.has(filePath)) {
      return;
    }

    try {
      const content = await readFile(filePath, 'utf-8');
      const graph = loadGraph(content);

      await exportGraphToOTel(graph);

      this.processedFiles.add(filePath);
      console.log(`📤 Exported trace to OTel: ${filePath}`);
    } catch (error) {
      console.warn(`⚠️ Failed to export trace ${filePath}:`, error);
    }
  }
}

/**
 * Create and start an OTel watcher for AgentFlow trace directories
 */
export function createOTelWatcher(directories: string[]): OTelWatcher {
  return new OTelWatcher(directories);
}