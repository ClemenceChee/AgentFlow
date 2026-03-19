import type { ExecutionGraph, ExecutionNode } from 'agentflow-core';
import { loadGraph } from 'agentflow-core';
import chokidar from 'chokidar';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';

/** Parsed event from a JSONL session for rich timeline rendering. */
export interface SessionEvent {
  type: 'user' | 'assistant' | 'tool_call' | 'tool_result' | 'thinking' | 'spawn' | 'model_change' | 'system';
  timestamp: number;
  name?: string;
  content?: string;
  toolName?: string;
  toolArgs?: any;
  toolResult?: string;
  toolError?: string;
  duration?: number;
  tokens?: { input: number; output: number; total: number; cost?: number };
  model?: string;
  provider?: string;
  parentId?: string;
  id?: string;
}

/** Extended graph with file metadata added by the watcher. */
export interface WatchedTrace extends ExecutionGraph {
  filename?: string;
  lastModified?: number;
  /** Source type: 'trace' for AgentFlow JSON, 'session' for JSONL session logs */
  sourceType?: 'trace' | 'session';
  /** Directory the file was loaded from */
  sourceDir?: string;
  /** Parsed session events for rich timeline rendering */
  sessionEvents?: SessionEvent[];
  /** Aggregated token usage from the session */
  tokenUsage?: { input: number; output: number; total: number; cost: number };
}

/** Options for TraceWatcher — scan multiple directories and file formats. */
export interface TraceWatcherOptions {
  /** Primary traces directory (AgentFlow JSON traces) */
  tracesDir: string;
  /** Additional directories to scan for JSON and JSONL files */
  dataDirs?: string[];
}

export class TraceWatcher extends EventEmitter {
  private watchers: chokidar.FSWatcher[] = [];
  private traces = new Map<string, WatchedTrace>();
  private tracesDir: string;
  private dataDirs: string[];
  private allWatchDirs: string[];

  constructor(tracesDirOrOptions: string | TraceWatcherOptions) {
    super();
    if (typeof tracesDirOrOptions === 'string') {
      this.tracesDir = path.resolve(tracesDirOrOptions);
      this.dataDirs = [];
    } else {
      this.tracesDir = path.resolve(tracesDirOrOptions.tracesDir);
      this.dataDirs = (tracesDirOrOptions.dataDirs || []).map((d) => path.resolve(d));
    }
    this.allWatchDirs = [this.tracesDir, ...this.dataDirs];
    this.ensureTracesDir();
    this.loadExistingFiles();
    this.startWatching();
  }

  private ensureTracesDir() {
    if (!fs.existsSync(this.tracesDir)) {
      fs.mkdirSync(this.tracesDir, { recursive: true });
      console.log(`Created traces directory: ${this.tracesDir}`);
    }
  }

  private loadExistingFiles() {
    let totalFiles = 0;
    for (const dir of this.allWatchDirs) {
      if (!fs.existsSync(dir)) continue;
      try {
        const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json') || f.endsWith('.jsonl'));
        totalFiles += files.length;
        for (const file of files) {
          this.loadFile(path.join(dir, file));
        }
      } catch (error) {
        console.error(`Error scanning directory ${dir}:`, error);
      }
    }
    console.log(`Scanned ${this.allWatchDirs.length} directories, loaded ${this.traces.size} items from ${totalFiles} files`);
  }

  /** Load a .json trace or .jsonl session file. */
  private loadFile(filePath: string): boolean {
    if (filePath.endsWith('.jsonl')) {
      return this.loadSessionFile(filePath);
    }
    return this.loadTraceFile(filePath);
  }

  private loadTraceFile(filePath: string): boolean {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const graph = loadGraph(content) as WatchedTrace;

      const filename = path.basename(filePath);
      const stats = fs.statSync(filePath);

      graph.filename = filename;
      graph.lastModified = stats.mtime.getTime();
      graph.sourceType = 'trace';
      graph.sourceDir = path.dirname(filePath);

      this.traces.set(this.traceKey(filePath), graph);
      return true;
    } catch {
      // Silently skip malformed trace files
      return false;
    }
  }

  /** Parse a JSONL session log into a WatchedTrace (best-effort). */
  private loadSessionFile(filePath: string): boolean {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n').filter((l) => l.trim());
      if (lines.length === 0) return false;

      const rawEvents: Array<Record<string, any>> = [];
      for (const line of lines) {
        try {
          rawEvents.push(JSON.parse(line));
        } catch {
          // skip malformed lines
        }
      }
      if (rawEvents.length === 0) return false;

      const sessionEvent = rawEvents.find((e) => e.type === 'session');
      const sessionId = sessionEvent?.id || path.basename(filePath, '.jsonl');
      const sessionTimestamp = sessionEvent?.timestamp || rawEvents[0]?.timestamp;
      const startTime = sessionTimestamp ? new Date(sessionTimestamp).getTime() : 0;
      if (!startTime) return false;

      // Extract agent ID from directory name or cwd
      const parentDir = path.basename(path.dirname(filePath));
      const grandParentDir = path.basename(path.dirname(path.dirname(filePath)));
      const agentId = grandParentDir === 'agents' ? parentDir : parentDir;

      // Extract model info from model_change events
      const modelEvent = rawEvents.find((e) => e.type === 'model_change');
      const provider = modelEvent?.provider || '';
      const modelId = modelEvent?.modelId || '';

      // Build nodes from session events
      const nodes = new Map<string, ExecutionNode>();
      let lastTimestamp = startTime;

      // Find the last event timestamp for endTime
      for (const evt of rawEvents) {
        if (evt.timestamp) {
          const ts = new Date(evt.timestamp).getTime();
          if (ts > lastTimestamp) lastTimestamp = ts;
        }
      }

      // Extract the user prompt (first message)
      const firstMessage = rawEvents.find((e) => e.type === 'message' && e.message?.role === 'user');
      const userPrompt = firstMessage?.message?.content?.[0]?.text || '';
      const cronMatch = userPrompt.match(/\[cron:(\S+)\s+([^\]]+)\]/);
      const triggerName = cronMatch ? cronMatch[2] : '';
      const trigger = cronMatch ? 'cron' : 'message';

      // Aggregate token usage from assistant messages
      let totalInputTokens = 0;
      let totalOutputTokens = 0;
      let totalTokensSum = 0;
      let totalCost = 0;

      // Count messages and content blocks
      let userMessageCount = 0;
      let assistantMessageCount = 0;
      let toolCallCount = 0;
      let thinkingBlockCount = 0;

      // Build session events for the timeline
      const sessionEvents: SessionEvent[] = [];

      // Map of tool call IDs to their event indices (for linking results)
      const toolCallMap = new Map<string, number>();

      // Create root node
      const rootId = `session-${sessionId.slice(0, 8)}`;
      const rootName = triggerName || (userPrompt.slice(0, 80) + (userPrompt.length > 80 ? '...' : '')) || sessionId;

      // Parse ALL events and create nodes/sessionEvents
      for (const evt of rawEvents) {
        const evtTs = evt.timestamp ? new Date(evt.timestamp).getTime() : startTime;

        if (evt.type === 'session') {
          sessionEvents.push({
            type: 'system',
            timestamp: evtTs,
            name: 'Session Started',
            content: `Version: ${evt.version || 'unknown'}, CWD: ${evt.cwd || ''}`,
            id: evt.id,
          });
          continue;
        }

        if (evt.type === 'model_change') {
          sessionEvents.push({
            type: 'model_change',
            timestamp: evtTs,
            name: 'Model Change',
            model: evt.modelId,
            provider: evt.provider,
            content: `${evt.provider}/${evt.modelId}`,
            id: evt.id,
          });
          continue;
        }

        if (evt.type === 'thinking_level_change') {
          sessionEvents.push({
            type: 'system',
            timestamp: evtTs,
            name: 'Thinking Level',
            content: evt.thinkingLevel || '',
            id: evt.id,
          });
          continue;
        }

        if (evt.type === 'custom' && evt.customType === 'model-snapshot') {
          sessionEvents.push({
            type: 'system',
            timestamp: evtTs,
            name: 'Model Snapshot',
            content: JSON.stringify(evt.data || {}).slice(0, 200),
            id: evt.id,
          });
          continue;
        }

        // Subagent spawning
        if (evt.type === 'custom_message' && evt.customType === 'openclaw.sessions_yield') {
          sessionEvents.push({
            type: 'spawn',
            timestamp: evtTs,
            name: 'Subagent Spawn',
            content: evt.data?.sessionId || '',
            id: evt.id,
            parentId: evt.parentId,
          });

          // Create a subagent node
          const spawnId = `spawn-${toolCallCount + thinkingBlockCount + 1}`;
          nodes.set(spawnId, {
            id: spawnId,
            type: 'subagent',
            name: 'Subagent: ' + (evt.data?.sessionId || '').slice(0, 12),
            startTime: evtTs,
            endTime: evtTs,
            status: 'completed' as any,
            parentId: rootId,
            children: [],
            metadata: { sessionId: evt.data?.sessionId },
          });
          continue;
        }

        // Message events — the main content
        if (evt.type === 'message' && evt.message) {
          const msg = evt.message;
          const role = msg.role;
          const contentBlocks: any[] = Array.isArray(msg.content) ? msg.content : [];

          if (role === 'user') {
            userMessageCount++;
            const textContent = contentBlocks
              .filter((b: any) => b.type === 'text')
              .map((b: any) => b.text || '')
              .join('\n');
            sessionEvents.push({
              type: 'user',
              timestamp: evtTs,
              name: 'User Message',
              content: textContent,
              id: evt.id,
              parentId: evt.parentId,
            });
          }

          if (role === 'assistant') {
            assistantMessageCount++;

            // Extract token usage
            if (msg.usage) {
              const u = msg.usage;
              totalInputTokens += u.input || 0;
              totalOutputTokens += u.output || 0;
              totalTokensSum += u.totalTokens || 0;
              if (u.cost?.total) totalCost += u.cost.total;
            }

            // Process content blocks
            for (const block of contentBlocks) {
              if (block.type === 'text' && block.text) {
                sessionEvents.push({
                  type: 'assistant',
                  timestamp: evtTs,
                  name: 'Assistant',
                  content: block.text,
                  id: evt.id,
                  parentId: evt.parentId,
                  tokens: msg.usage ? {
                    input: msg.usage.input || 0,
                    output: msg.usage.output || 0,
                    total: msg.usage.totalTokens || 0,
                    cost: msg.usage.cost?.total,
                  } : undefined,
                  model: modelId,
                  provider,
                });
              }

              if (block.type === 'thinking' && block.thinking) {
                thinkingBlockCount++;
                const thinkId = `thinking-${thinkingBlockCount}`;
                sessionEvents.push({
                  type: 'thinking',
                  timestamp: evtTs,
                  name: 'Thinking',
                  content: block.thinking,
                  id: thinkId,
                  parentId: evt.id,
                });

                // Create a decision node for thinking
                nodes.set(thinkId, {
                  id: thinkId,
                  type: 'decision',
                  name: 'Thinking',
                  startTime: evtTs,
                  endTime: evtTs,
                  status: 'completed' as any,
                  parentId: rootId,
                  children: [],
                  metadata: { preview: block.thinking.slice(0, 100) },
                });
              }

              if (block.type === 'toolCall') {
                toolCallCount++;
                const toolName = block.name || 'unknown';
                const toolId = `tool-${toolCallCount}`;
                const toolCallId = block.id || toolId;

                sessionEvents.push({
                  type: 'tool_call',
                  timestamp: evtTs,
                  name: toolName,
                  toolName,
                  toolArgs: block.arguments,
                  id: toolCallId,
                  parentId: evt.id,
                });

                // Remember for result linking
                toolCallMap.set(toolCallId, sessionEvents.length - 1);

                // Create a tool node
                nodes.set(toolId, {
                  id: toolId,
                  type: 'tool',
                  name: toolName,
                  startTime: evtTs,
                  endTime: evtTs, // updated when result arrives
                  status: 'running' as any,
                  parentId: rootId,
                  children: [],
                  metadata: {
                    toolCallId,
                    args: block.arguments,
                  },
                });
              }
            }
          }

          if (role === 'toolResult') {
            // Link tool result back to tool call
            const toolCallId = contentBlocks[0]?.toolCallId || evt.parentId;
            const resultContent = contentBlocks
              .map((b: any) => b.text || b.content || '')
              .join('\n');
            const hasError = contentBlocks.some((b: any) => b.isError || b.error);
            const errorText = hasError ? resultContent : undefined;

            sessionEvents.push({
              type: 'tool_result',
              timestamp: evtTs,
              name: 'Tool Result',
              toolResult: resultContent.slice(0, 2000),
              toolError: errorText?.slice(0, 500),
              id: evt.id,
              parentId: toolCallId,
            });

            // Update matching tool node with end time and status
            for (const [nodeId, node] of nodes) {
              if (node.type === 'tool' && node.metadata?.toolCallId === toolCallId) {
                node.endTime = evtTs;
                node.status = hasError ? ('failed' as any) : ('completed' as any);
                if (hasError) node.metadata.error = errorText?.slice(0, 500);
                // Compute duration on the session event
                const callIdx = toolCallMap.get(toolCallId);
                if (callIdx !== undefined && sessionEvents[callIdx]) {
                  const callTs = sessionEvents[callIdx].timestamp;
                  sessionEvents[sessionEvents.length - 1].duration = evtTs - callTs;
                  sessionEvents[callIdx].duration = evtTs - callTs;
                }
                break;
              }
            }
          }
        }
      }

      // Determine session status
      const fileStat = fs.statSync(filePath);
      const fileAge = Date.now() - fileStat.mtime.getTime();
      const lastEvt = rawEvents[rawEvents.length - 1];
      const hasToolError = sessionEvents.some((e) => e.type === 'tool_result' && e.toolError);
      const lastIsAssistant = lastEvt?.type === 'message' && lastEvt?.message?.role === 'assistant';
      const isRecentlyModified = fileAge < 5 * 60 * 1000; // <5 min ago

      let status: string;
      if (hasToolError) {
        status = 'failed';
      } else if (lastIsAssistant) {
        status = 'completed';
      } else if (isRecentlyModified) {
        status = 'running';
      } else {
        status = 'completed';
      }

      // Token usage summary
      const tokenUsage = {
        input: totalInputTokens,
        output: totalOutputTokens,
        total: totalTokensSum || (totalInputTokens + totalOutputTokens),
        cost: totalCost,
      };

      // Create root node with aggregated metadata
      nodes.set(rootId, {
        id: rootId,
        type: 'agent',
        name: rootName,
        startTime,
        endTime: lastTimestamp,
        status: status as any,
        parentId: undefined as any,
        children: Array.from(nodes.keys()).filter((k) => k !== rootId),
        metadata: {
          provider,
          model: modelId,
          sessionId,
          trigger,
          totalTokens: tokenUsage.total,
          inputTokens: tokenUsage.input,
          outputTokens: tokenUsage.output,
          cost: tokenUsage.cost,
          userMessages: userMessageCount,
          assistantMessages: assistantMessageCount,
          toolCalls: toolCallCount,
          thinkingBlocks: thinkingBlockCount,
          'gen_ai.system': provider,
          'gen_ai.request.model': modelId,
        },
      });

      const filename = path.basename(filePath);

      const trace: WatchedTrace = {
        id: sessionId,
        nodes,
        edges: [],
        events: [],
        startTime,
        agentId,
        trigger,
        name: rootName,
        traceId: sessionId,
        spanId: sessionId,
        filename,
        lastModified: fileStat.mtime.getTime(),
        sourceType: 'session',
        sourceDir: path.dirname(filePath),
        sessionEvents,
        tokenUsage,
        metadata: {
          provider,
          model: modelId,
          userMessages: userMessageCount,
          assistantMessages: assistantMessageCount,
          toolCalls: toolCallCount,
          thinkingBlocks: thinkingBlockCount,
          totalEvents: rawEvents.length,
          sessionVersion: sessionEvent?.version,
        },
      } as WatchedTrace;

      this.traces.set(this.traceKey(filePath), trace);
      return true;
    } catch {
      return false;
    }
  }

  /** Unique key for a file across directories. */
  private traceKey(filePath: string): string {
    // Use relative path from any watched dir, or absolute path as fallback
    for (const dir of this.allWatchDirs) {
      if (filePath.startsWith(dir)) {
        return path.relative(dir, filePath).replace(/\\/g, '/') + '@' + path.basename(dir);
      }
    }
    return filePath;
  }

  private startWatching() {
    for (const dir of this.allWatchDirs) {
      if (!fs.existsSync(dir)) continue;

      const watcher = chokidar.watch(dir, {
        ignored: /^\./,
        persistent: true,
        ignoreInitial: true,
        depth: 0, // don't recurse into subdirectories
      });

      watcher.on('add', (filePath) => {
        if (filePath.endsWith('.json') || filePath.endsWith('.jsonl')) {
          console.log(`New file: ${path.basename(filePath)}`);
          if (this.loadFile(filePath)) {
            const key = this.traceKey(filePath);
            const trace = this.traces.get(key);
            if (trace) {
              this.emit('trace-added', trace);
            }
          }
        }
      });

      watcher.on('change', (filePath) => {
        if (filePath.endsWith('.json') || filePath.endsWith('.jsonl')) {
          if (this.loadFile(filePath)) {
            const key = this.traceKey(filePath);
            const trace = this.traces.get(key);
            if (trace) {
              this.emit('trace-updated', trace);
            }
          }
        }
      });

      watcher.on('unlink', (filePath) => {
        if (filePath.endsWith('.json') || filePath.endsWith('.jsonl')) {
          const key = this.traceKey(filePath);
          this.traces.delete(key);
          this.emit('trace-removed', key);
        }
      });

      watcher.on('error', (error) => {
        console.error(`Watcher error on ${dir}:`, error);
      });

      this.watchers.push(watcher);
    }

    console.log(`Watching ${this.allWatchDirs.length} directories for JSON/JSONL files`);
  }

  public getAllTraces(): WatchedTrace[] {
    return Array.from(this.traces.values()).sort((a, b) => {
      return (b.lastModified || b.startTime) - (a.lastModified || a.startTime);
    });
  }

  public getTrace(filename: string): WatchedTrace | undefined {
    // Try exact key match first
    const exact = this.traces.get(filename);
    if (exact) return exact;
    // Fallback: search by filename across all keys
    for (const [key, trace] of this.traces) {
      if (trace.filename === filename || key.endsWith(filename)) {
        return trace;
      }
    }
    return undefined;
  }

  public getTracesByAgent(agentId: string): WatchedTrace[] {
    return this.getAllTraces().filter((trace) => trace.agentId === agentId);
  }

  public getRecentTraces(limit: number = 50): WatchedTrace[] {
    return this.getAllTraces().slice(0, limit);
  }

  public getTraceCount(): number {
    return this.traces.size;
  }

  public getAgentIds(): string[] {
    const agentIds = new Set<string>();
    for (const trace of this.traces.values()) {
      agentIds.add(trace.agentId);
    }
    return Array.from(agentIds).sort();
  }

  public stop() {
    for (const w of this.watchers) {
      w.close();
    }
    this.watchers = [];
    console.log('Stopped watching all directories');
  }

  public getTraceStats() {
    const total = this.traces.size;
    const agentCount = this.getAgentIds().length;
    const recentCount = this.getRecentTraces(24).length;

    const triggers = new Map<string, number>();
    for (const trace of this.traces.values()) {
      const trigger = trace.trigger || 'unknown';
      triggers.set(trigger, (triggers.get(trigger) || 0) + 1);
    }

    return {
      total,
      agentCount,
      recentCount,
      triggers: Object.fromEntries(triggers),
    };
  }
}
