import chokidar from 'chokidar';
import * as fs from 'fs';
import * as path from 'path';
import type { AgentFlowStorage } from './storage.js';

export class TraceIngester {
  private watcher?: chokidar.FSWatcher;
  private processedFiles = new Set<string>();
  private ingestionQueue: string[] = [];
  private isProcessing = false;

  constructor(
    private tracesDir: string,
    private storage: AgentFlowStorage,
    private options: {
      batchSize?: number;
      processInterval?: number;
    } = {},
  ) {
    this.options = {
      batchSize: 50,
      processInterval: 1000,
      ...options,
    };

    this.startWatching();
    this.processExistingFiles();
    this.startProcessingQueue();
  }

  private startWatching() {
    console.log(`Starting trace file ingestion from: ${this.tracesDir}`);

    this.watcher = chokidar.watch(this.tracesDir, {
      ignored: /^\\./,
      persistent: true,
      ignoreInitial: false,
    });

    this.watcher.on('add', (filePath) => {
      if (this.isTraceFile(filePath)) {
        this.queueFile(filePath);
      }
    });

    this.watcher.on('change', (filePath) => {
      if (this.isTraceFile(filePath)) {
        this.queueFile(filePath);
      }
    });

    this.watcher.on('error', (error) => {
      console.error('Trace watcher error:', error);
    });
  }

  private isTraceFile(filePath: string): boolean {
    const supportedExtensions = ['.json', '.jsonl', '.log', '.trace'];
    return supportedExtensions.some(ext => filePath.endsWith(ext));
  }

  private queueFile(filePath: string) {
    const filename = path.basename(filePath);

    if (!this.processedFiles.has(filename)) {
      this.ingestionQueue.push(filePath);
      console.log(`Queued trace file for ingestion: ${filename}`);
    }
  }

  private processExistingFiles() {
    try {
      const files = fs
        .readdirSync(this.tracesDir)
        .filter((file) => this.isTraceFile(file))
        .map((file) => path.join(this.tracesDir, file));

      console.log(`Found ${files.length} existing trace files to process`);

      for (const filePath of files) {
        this.queueFile(filePath);
      }
    } catch (error) {
      console.error('Error scanning existing trace files:', error);
    }
  }

  private startProcessingQueue() {
    setInterval(() => {
      if (!this.isProcessing && this.ingestionQueue.length > 0) {
        this.processQueue();
      }
    }, this.options.processInterval);
  }

  private async processQueue() {
    if (this.isProcessing || this.ingestionQueue.length === 0) {
      return;
    }

    this.isProcessing = true;
    const batchSize = this.options.batchSize!;
    const batch = this.ingestionQueue.splice(0, batchSize);

    console.log(`Processing batch of ${batch.length} trace files...`);

    let processed = 0;
    let errors = 0;

    for (const filePath of batch) {
      try {
        await this.ingestFile(filePath);
        processed++;
      } catch (error) {
        console.error(`Error ingesting ${filePath}:`, error);
        errors++;
      }
    }

    console.log(
      `Batch complete: ${processed} processed, ${errors} errors, ${this.ingestionQueue.length} remaining`,
    );

    this.isProcessing = false;
  }

  private async ingestFile(filePath: string): Promise<void> {
    const filename = path.basename(filePath);

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const traces = this.parseFileContent(content, filePath);

      // Add file metadata
      const stats = fs.statSync(filePath);

      // Process each trace (some formats may yield multiple traces per file)
      for (const trace of traces) {
        trace.filename = filename;
        trace.fileSize = stats.size;
        trace.lastModified = stats.mtime.getTime();

        // Normalize trace format
        const normalizedTrace = this.normalizeTrace(trace);
        await this.storage.ingestTrace(normalizedTrace);
      }

      this.processedFiles.add(filename);
      console.log(`Ingested ${traces.length} traces from ${filename}`);
    } catch (error) {
      console.error(`Error processing file ${filename}:`, error);
      throw error;
    }
  }

  private parseFileContent(content: string, filePath: string): any[] {
    const extension = path.extname(filePath);

    switch (extension) {
      case '.json':
        return [JSON.parse(content)];

      case '.jsonl':
        return content
          .split('\n')
          .filter(line => line.trim())
          .map(line => JSON.parse(line));

      case '.log':
        return this.parseStructuredLog(content, filePath);

      case '.trace':
        // Try JSON first, fall back to structured log parsing
        try {
          return [JSON.parse(content)];
        } catch {
          return this.parseStructuredLog(content, filePath);
        }

      default:
        throw new Error(`Unsupported file format: ${extension}`);
    }
  }

  private parseStructuredLog(content: string, filePath: string): any[] {
    const traces: any[] = [];
    const filename = path.basename(filePath);

    // Detect if this is Alfred's structured log format
    if (this.isAlfredLog(content, filename)) {
      return this.parseAlfredLog(content, filename);
    }

    // Generic structured log parsing - look for JSON-like structured data
    const lines = content.split('\n');
    for (const line of lines) {
      const structuredData = this.extractStructuredData(line);
      if (structuredData) {
        traces.push(structuredData);
      }
    }

    // If no structured data found, create a basic trace for the whole file
    if (traces.length === 0) {
      traces.push({
        agentId: this.extractAgentIdFromPath(filePath),
        name: `Log file: ${filename}`,
        trigger: 'log-file',
        timestamp: Date.now(),
        nodes: {
          'root': {
            id: 'root',
            type: 'log-file',
            name: filename,
            status: 'completed',
            startTime: Date.now(),
            endTime: Date.now(),
            metadata: { lineCount: lines.length }
          }
        }
      });
    }

    return traces;
  }

  private isAlfredLog(content: string, filename: string): boolean {
    return filename.includes('alfred') ||
           content.includes('daemon.starting') ||
           content.includes('zo.dispatching') ||
           content.includes('agent_invoke');
  }

  private parseAlfredLog(content: string, filename: string): any[] {
    const traces: any[] = [];
    const lines = content.split('\n');
    const sessions = new Map<string, any>();

    for (const line of lines) {
      const logEntry = this.parseAlfredLogLine(line);
      if (!logEntry) continue;

      const sessionId = logEntry.runId || logEntry.sweepId || 'default';

      if (!sessions.has(sessionId)) {
        sessions.set(sessionId, {
          agentId: `alfred-${logEntry.component || 'unknown'}`,
          name: `Alfred ${logEntry.component || 'activity'}: ${sessionId}`,
          trigger: logEntry.trigger || 'scheduled',
          timestamp: logEntry.timestamp,
          nodes: {},
          metadata: { sessionId, component: logEntry.component }
        });
      }

      const session = sessions.get(sessionId);
      this.addAlfredNodeToSession(session, logEntry);
    }

    return Array.from(sessions.values()).filter(session => Object.keys(session.nodes).length > 0);
  }

  private parseAlfredLogLine(line: string): any | null {
    // Parse Alfred's structured log format: [timestamp] [level] [action] [key=value pairs]
    const timestampMatch = line.match(/^\[2m(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z)\[0m/);
    if (!timestampMatch) return null;

    const levelMatch = line.match(/\[\[(\d+)m\[\[1m(\w+)\s*\[0m\]/);
    const actionMatch = line.match(/\[1m([^\[]+?)\s*\[0m/);

    if (!actionMatch) return null;

    const timestamp = new Date(timestampMatch[1]).getTime();
    const level = levelMatch ? levelMatch[2] : 'info';
    const action = actionMatch[1].trim();

    // Extract key-value pairs
    const kvPairs: any = {};
    const kvRegex = /\[36m(\w+)\[0m=\[35m([^\[]+?)\[0m/g;
    let match;
    while ((match = kvRegex.exec(line)) !== null) {
      let value: any = match[2];
      // Try to parse as number or remove quotes
      if (value.match(/^\d+$/)) value = parseInt(value);
      else if (value.match(/^\d+\.\d+$/)) value = parseFloat(value);
      else if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
      kvPairs[match[1]] = value;
    }

    return {
      timestamp,
      level,
      action,
      component: action.split('.')[0], // e.g., 'daemon' from 'daemon.starting'
      operation: action.split('.').slice(1).join('.'), // e.g., 'starting'
      runId: kvPairs.run_id,
      sweepId: kvPairs.sweep_id,
      project: kvPairs.project,
      sources: kvPairs.sources,
      method: kvPairs.method,
      url: kvPairs.url,
      ...kvPairs
    };
  }

  private addAlfredNodeToSession(session: any, logEntry: any): void {
    const nodeId = `${logEntry.component}-${logEntry.operation}-${Date.now()}`;

    const node = {
      id: nodeId,
      type: logEntry.component,
      name: `${logEntry.component}: ${logEntry.operation}`,
      status: this.getNodeStatus(logEntry),
      startTime: logEntry.timestamp,
      endTime: logEntry.timestamp, // Single point in time for log events
      metadata: {
        level: logEntry.level,
        action: logEntry.action,
        ...logEntry
      }
    };

    session.nodes[nodeId] = node;
  }

  private getNodeStatus(logEntry: any): string {
    if (logEntry.level === 'error') return 'failed';
    if (logEntry.level === 'warning') return 'warning';
    if (logEntry.operation?.includes('start')) return 'running';
    if (logEntry.operation?.includes('complete')) return 'completed';
    return 'completed'; // Default for log events
  }

  private extractStructuredData(line: string): any | null {
    // Try to extract JSON-like data from log lines
    try {
      const jsonMatch = line.match(/\{.*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch {
      // Not JSON, continue
    }

    // Look for key=value patterns
    const kvMatches = line.match(/(\w+)=([^\s]+)/g);
    if (kvMatches && kvMatches.length >= 2) {
      const data: any = { timestamp: Date.now() };
      kvMatches.forEach(match => {
        const [key, value] = match.split('=', 2);
        data[key] = value;
      });
      return data;
    }

    return null;
  }

  private extractAgentIdFromPath(filePath: string): string {
    const pathParts = filePath.split(path.sep);

    // Look for agent-related directory names
    for (const part of pathParts) {
      if (part.includes('agent') || part.includes('alfred') || part.includes('worker')) {
        return part;
      }
    }

    return path.basename(filePath, path.extname(filePath));
  }

  private normalizeTrace(trace: any): any {
    // Ensure required fields
    if (!trace.agentId) {
      throw new Error('Trace missing agentId');
    }

    if (!trace.timestamp) {
      // Try to extract timestamp from filename or use file modification time
      const timestampMatch = trace.filename?.match(/(\\d{4}-\\d{2}-\\d{2}T\\d{2}-\\d{2}-\\d{2})/);
      if (timestampMatch) {
        trace.timestamp = new Date(timestampMatch[1].replace(/-/g, ':')).getTime();
      } else if (trace.lastModified) {
        trace.timestamp = trace.lastModified;
      } else {
        trace.timestamp = Date.now();
      }
    }

    // Normalize nodes format
    if (Array.isArray(trace.nodes)) {
      // Handle Map serialization format
      const nodesMap = new Map(trace.nodes);
      trace.nodes = nodesMap;
    } else if (trace.nodes && typeof trace.nodes === 'object' && !(trace.nodes instanceof Map)) {
      // Convert plain object to Map
      trace.nodes = new Map(Object.entries(trace.nodes));
    }

    // Ensure basic structure
    trace.trigger = trace.trigger || 'unknown';
    trace.name = trace.name || `${trace.agentId} execution`;
    trace.metadata = trace.metadata || {};

    return trace;
  }

  public getStats() {
    return {
      totalProcessed: this.processedFiles.size,
      queueLength: this.ingestionQueue.length,
      isProcessing: this.isProcessing,
    };
  }

  public reprocessFile(filename: string) {
    const filePath = path.join(this.tracesDir, filename);
    if (fs.existsSync(filePath)) {
      this.processedFiles.delete(filename);
      this.queueFile(filePath);
      console.log(`Queued file for reprocessing: ${filename}`);
    }
  }

  public reprocessAll() {
    console.log('Queuing all files for reprocessing...');
    this.processedFiles.clear();
    this.ingestionQueue = [];
    this.processExistingFiles();
  }

  public stop() {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = undefined;
      console.log('Stopped trace file ingestion');
    }
  }

  // Manual ingestion for testing
  public async ingestTraceData(trace: any): Promise<void> {
    const normalizedTrace = this.normalizeTrace(trace);
    await this.storage.ingestTrace(normalizedTrace);
  }
}
