import * as fs from 'node:fs';
import * as path from 'node:path';
import chokidar from 'chokidar';
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
    return supportedExtensions.some((ext) => filePath.endsWith(ext));
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
    const filename = path.basename(filePath);

    switch (extension) {
      case '.json':
        // Check if it's an Alfred workers.json file
        if (filename === 'workers.json') {
          return this.parseAlfredWorkers(content, filePath);
        }
        return [JSON.parse(content)];

      case '.jsonl':
        // Check if it's an Alfred session file
        if (this.isAlfredSessionFile(content, filePath)) {
          return this.parseAlfredSession(content, filePath);
        }
        return content
          .split('\n')
          .filter((line) => line.trim())
          .map((line) => JSON.parse(line));

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

    // Detect if this is OpenClaw log format
    if (this.isOpenClawLog(content, filename)) {
      return this.parseOpenClawLog(content, filename);
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
          root: {
            id: 'root',
            type: 'log-file',
            name: filename,
            status: 'completed',
            startTime: Date.now(),
            endTime: Date.now(),
            metadata: { lineCount: lines.length },
          },
        },
      });
    }

    return traces;
  }

  private isAlfredLog(content: string, filename: string): boolean {
    return (
      filename.includes('alfred') ||
      content.includes('daemon.starting') ||
      content.includes('zo.dispatching') ||
      content.includes('agent_invoke')
    );
  }

  private isOpenClawLog(content: string, filename: string): boolean {
    return (
      filename.includes('openclaw') ||
      content.includes('"name":"openclaw"') ||
      content.includes('sessionId') ||
      content.includes('agentMeta')
    );
  }

  private parseAlfredLog(content: string, _filename: string): any[] {
    const _traces: any[] = [];
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
          metadata: { sessionId, component: logEntry.component },
        });
      }

      const session = sessions.get(sessionId);
      this.addAlfredNodeToSession(session, logEntry);
    }

    return Array.from(sessions.values()).filter((session) => Object.keys(session.nodes).length > 0);
  }

  private parseAlfredLogLine(line: string): any | null {
    // Parse Alfred's structured log format: [timestamp] [level] [action] [key=value pairs]
    const timestampMatch = line.match(/^\[2m(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z)\[0m/);
    if (!timestampMatch) return null;

    const levelMatch = line.match(/\[\[(\d+)m\[\[1m(\w+)\s*\[0m\]/);
    const actionMatch = line.match(/\[1m([^[]+?)\s*\[0m/);

    if (!actionMatch) return null;

    const timestamp = new Date(timestampMatch[1]).getTime();
    const level = levelMatch ? levelMatch[2] : 'info';
    const action = actionMatch[1].trim();

    // Extract key-value pairs
    const kvPairs: any = {};
    const kvRegex = /\[36m(\w+)\[0m=\[35m([^[]+?)\[0m/g;
    let match: RegExpExecArray | null;
    while ((match = kvRegex.exec(line)) !== null) {
      let value: any = match[2];
      // Try to parse as number or remove quotes
      if (value.match(/^\d+$/)) value = parseInt(value, 10);
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
      ...kvPairs,
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
        ...logEntry,
      },
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
        const parsed = JSON.parse(jsonMatch[0]);
        // Skip if it's just timestamp or very small objects
        if (Object.keys(parsed).length < 2) return null;
        // Skip if it contains corrupted data patterns
        if (JSON.stringify(parsed).includes('"ts":') && Object.keys(parsed).length < 3) return null;
        return parsed;
      }
    } catch {
      // Not JSON, continue
    }

    // Look for key=value patterns (but be more restrictive)
    const kvMatches = line.match(/(\w+)=([^\s]+)/g);
    if (kvMatches && kvMatches.length >= 3) {
      // Require at least 3 key-value pairs
      const data: any = { timestamp: Date.now() };
      kvMatches.forEach((match) => {
        const [key, value] = match.split('=', 2);
        // Skip corrupted keys
        if (key.includes('{') || key.includes('"') || value.includes('"ts"')) return;
        data[key] = value;
      });

      // Only return if we have meaningful data
      if (Object.keys(data).length > 2) {
        return data;
      }
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

  // Parse workers.json (soma/alfred orchestrator registry)
  private parseAlfredWorkers(content: string, _filePath: string): any[] {
    const data = JSON.parse(content);
    const trace = {
      agentId: `soma-orchestrator-${data.pid}`,
      name: `SOMA Orchestrator (PID ${data.pid})`,
      trigger: 'worker-status',
      timestamp: new Date(data.started_at).getTime(),
      nodes: {},
    };

    // Add orchestrator node
    const orchestratorId = `orchestrator-${data.pid}`;
    trace.nodes[orchestratorId] = {
      id: orchestratorId,
      type: 'orchestrator',
      name: 'SOMA Orchestrator',
      status: 'running',
      startTime: trace.timestamp,
      endTime: null,
      metadata: {
        pid: data.pid,
        started_at: data.started_at,
        worker_count: Object.keys(data.tools || {}).length,
      },
    };

    // Add worker nodes
    for (const [workerName, workerData] of Object.entries(data.tools || {})) {
      const workerId = `worker-${workerName}-${workerData.pid}`;
      trace.nodes[workerId] = {
        id: workerId,
        type: 'worker',
        name: `SOMA ${workerName}`,
        status: workerData.status === 'running' ? 'running' : 'failed',
        startTime: trace.timestamp,
        endTime: null,
        parentId: orchestratorId,
        metadata: {
          pid: workerData.pid,
          worker_type: workerName,
          restarts: workerData.restarts || 0,
        },
      };
    }

    return [trace];
  }

  // Check if JSONL file is an Alfred session
  private isAlfredSessionFile(content: string, filePath: string): boolean {
    const firstLine = content.split('\n')[0];
    if (!firstLine) return false;

    try {
      const data = JSON.parse(firstLine);
      return (
        data.type === 'session' || filePath.includes('/agents/') || filePath.includes('/sessions/')
      );
    } catch {
      return false;
    }
  }

  // Parse Alfred session JSONL
  private parseAlfredSession(content: string, filePath: string): any[] {
    const lines = content.split('\n').filter((line) => line.trim());
    if (lines.length === 0) return [];

    const events = lines
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    if (events.length === 0) return [];

    // Find session metadata
    const sessionEvent = events.find((e) => e.type === 'session');
    if (!sessionEvent) return [];

    const sessionId = sessionEvent.id;
    const agentPath = filePath.includes('/main/')
      ? 'main'
      : filePath.includes('/vault-curator/') || filePath.includes('/curator/')
        ? 'curator'
        : filePath.includes('/vault-janitor/') || filePath.includes('/janitor/')
          ? 'janitor'
          : filePath.includes('/vault-distiller/') || filePath.includes('/distiller/')
            ? 'distiller'
            : filePath.includes('/vault-surveyor/') || filePath.includes('/surveyor/')
              ? 'surveyor'
              : 'unknown';

    // Use canonical agent IDs consistent with watcher.ts aliases
    // Old workers (curator/janitor/distiller/surveyor) keep alfred- prefix; orchestrator is soma-main
    const canonicalId = agentPath === 'main' ? 'soma-main' : agentPath === 'unknown' ? 'soma-main' : `alfred-${agentPath}`;

    const trace = {
      agentId: canonicalId,
      name: `Alfred ${agentPath} Session`,
      trigger: 'llm-conversation',
      timestamp: new Date(sessionEvent.timestamp).getTime(),
      sessionId: sessionId,
      nodes: {},
    };

    // Process conversation events
    let nodeCounter = 0;
    for (const event of events) {
      const nodeId = `event-${++nodeCounter}`;
      let nodeName = event.type;
      let nodeType = event.type;

      // Categorize event types
      if (event.type === 'message') {
        nodeName = event.message?.role === 'user' ? 'User Message' : 'Assistant Message';
        nodeType = event.message?.role === 'user' ? 'user' : 'assistant';
      } else if (event.type === 'thinking') {
        nodeName = 'AI Thinking';
        nodeType = 'think';
      } else if (event.type === 'tool_call') {
        nodeName = `Tool: ${event.toolName || 'Unknown'}`;
        nodeType = 'tool';
      }

      trace.nodes[nodeId] = {
        id: nodeId,
        type: nodeType,
        name: nodeName,
        status: 'completed',
        startTime: new Date(event.timestamp).getTime(),
        endTime: new Date(event.timestamp).getTime() + 1000,
        metadata: {
          eventType: event.type,
          eventData: event,
          content: event.message?.content || event.content || '',
          model: event.provider || event.modelId,
        },
      };
    }

    return [trace];
  }

  // Parse OpenClaw JSON logs
  private parseOpenClawLog(content: string, _filePath: string): any[] {
    const traces: any[] = [];
    const lines = content.split('\n').filter((line) => line.trim());

    for (const line of lines) {
      try {
        const logEntry = JSON.parse(line);

        // Skip malformed or meta-only entries
        if (!logEntry['0'] || !logEntry._meta) continue;

        const logData = logEntry['0'];
        const meta = logEntry._meta;

        // Try to parse the main log data as JSON (for agent conversations)
        let conversationData = null;
        try {
          conversationData = JSON.parse(logData);
        } catch {
          // Not JSON, treat as text log
          if (logData.length > 1000) continue; // Skip very long text logs to avoid bloat
        }

        if (conversationData?.meta?.agentMeta) {
          // This is an agent conversation
          const agentMeta = conversationData.meta.agentMeta;
          const sessionId = agentMeta.sessionId;
          const agentId = sessionId.split('-')[0] || 'openclaw-unknown';

          const trace = {
            agentId: `openclaw-${agentId}`,
            name: `OpenClaw ${agentId} Session`,
            trigger: 'openclaw-conversation',
            timestamp: new Date(meta.date).getTime(),
            sessionId: sessionId,
            nodes: {},
          };

          // Create conversation node
          const nodeId = `conversation-${sessionId}`;
          trace.nodes[nodeId] = {
            id: nodeId,
            type: 'conversation',
            name: 'OpenClaw LLM Conversation',
            status: conversationData.meta.aborted ? 'failed' : 'completed',
            startTime: trace.timestamp,
            endTime: trace.timestamp + (conversationData.meta.durationMs || 1000),
            metadata: {
              provider: agentMeta.provider,
              model: agentMeta.model,
              usage: agentMeta.usage,
              sessionId: sessionId,
              payloads: conversationData.payloads || [],
              durationMs: conversationData.meta.durationMs,
            },
          };

          traces.push(trace);
        }
      } catch (_error) {}
    }

    return traces;
  }

  // Manual ingestion for testing
  public async ingestTraceData(trace: any): Promise<void> {
    const normalizedTrace = this.normalizeTrace(trace);
    await this.storage.ingestTrace(normalizedTrace);
  }
}
