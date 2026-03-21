import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ExecutionGraph, ExecutionNode } from 'agentflow-core';
import { loadGraph } from 'agentflow-core';
import chokidar from 'chokidar';
import { findAdapter, type NormalizedTrace } from './adapters/index.js';
import type { DashboardUserConfig } from './config.js';
import { getAgentDetection, getAliases, getSkipDirectories, getSkipFiles } from './config.js';
import {
  detectActivityPattern,
  detectTrigger,
  extractSessionIdentifier,
  getUniversalNodeStatus,
  openClawSessionIdToAgent,
} from './parsers/index.js';

/** Parsed event from a JSONL session for rich timeline rendering. */
export interface SessionEvent {
  type:
    | 'user'
    | 'assistant'
    | 'tool_call'
    | 'tool_result'
    | 'thinking'
    | 'spawn'
    | 'model_change'
    | 'system';
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
  /** Maximum age of trace files to load at startup (in ms). Default: 48 hours. */
  maxAgeMs?: number;
  /** User config for aliases, skip files, agent detection, etc. */
  userConfig?: DashboardUserConfig;
}

export class TraceWatcher extends EventEmitter {
  private watchers: chokidar.FSWatcher[] = [];
  private traces = new Map<string, WatchedTrace>();
  private tracesDir: string;
  private dataDirs: string[];
  private allWatchDirs: string[];
  private maxAgeMs: number;
  private userConfig: DashboardUserConfig;

  constructor(tracesDirOrOptions: string | TraceWatcherOptions) {
    super();
    const defaultMaxAgeMs = 48 * 60 * 60 * 1000;
    const envHours = process.env.AGENTFLOW_TRACE_WINDOW_HOURS;
    const envMaxAgeMs = envHours ? parseFloat(envHours) * 60 * 60 * 1000 : undefined;

    if (typeof tracesDirOrOptions === 'string') {
      this.tracesDir = path.resolve(tracesDirOrOptions);
      this.dataDirs = [];
      this.maxAgeMs = envMaxAgeMs ?? defaultMaxAgeMs;
      this.userConfig = {};
    } else {
      this.tracesDir = path.resolve(tracesDirOrOptions.tracesDir);
      this.dataDirs = (tracesDirOrOptions.dataDirs || []).map((d) => path.resolve(d));
      this.maxAgeMs = envMaxAgeMs ?? tracesDirOrOptions.maxAgeMs ?? defaultMaxAgeMs;
      this.userConfig = tracesDirOrOptions.userConfig ?? {};
    }
    // Merge structural skip files with user-configured ones
    this.skipFiles = new Set([
      ...TraceWatcher.STRUCTURAL_SKIP_FILES,
      ...getSkipFiles(this.userConfig),
    ]);
    this.userSkipDirs = new Set(getSkipDirectories(this.userConfig));
    this.allWatchDirs = [this.tracesDir, ...this.dataDirs];
    this.ensureTracesDir();
    this.loadExistingFiles();
    this.archiveOldTraces();
    this.startWatching();
    // Schedule periodic archival every 6 hours
    setInterval(() => this.archiveOldTraces(), 6 * 60 * 60 * 1000);
  }

  /** Move trace files older than maxAgeMs into archive/YYYY-MM/ subdirectories. */
  private archiveOldTraces() {
    const cutoff = Date.now() - this.maxAgeMs;
    let archived = 0;

    for (const dir of this.allWatchDirs) {
      if (!fs.existsSync(dir)) continue;
      try {
        this.archiveDirectory(dir, cutoff, 0);
      } catch (error) {
        console.warn(`Archival error in ${dir}:`, (error as Error).message);
      }
    }
  }

  private archiveDirectory(dir: string, cutoff: number, depth: number): number {
    if (depth > 10) return 0;
    // Never recurse into archive directories
    if (path.basename(dir) === 'archive') return 0;

    let archived = 0;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'archive' || this.userSkipDirs.has(entry.name)) continue;
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          archived += this.archiveDirectory(fullPath, cutoff, depth + 1);
          continue;
        }

        if (!entry.isFile() || !this.isSupportedFile(entry.name)) continue;

        try {
          const stats = fs.statSync(fullPath);
          if (stats.mtimeMs >= cutoff) continue;

          // Determine archive destination: <tracesDir>/archive/YYYY-MM/
          const mtime = new Date(stats.mtimeMs);
          const yearMonth = `${mtime.getFullYear()}-${String(mtime.getMonth() + 1).padStart(2, '0')}`;
          const archiveDir = path.join(this.tracesDir, 'archive', yearMonth);
          fs.mkdirSync(archiveDir, { recursive: true });

          const dest = path.join(archiveDir, entry.name);
          fs.renameSync(fullPath, dest);

          // Remove from in-memory traces map
          const key = this.traceKey(fullPath);
          this.traces.delete(key);
          archived++;
        } catch {
          // File may have been removed or is locked — skip
        }
      }
    } catch {
      // Directory unreadable — skip
    }
    return archived;
  }

  private ensureTracesDir() {
    if (!fs.existsSync(this.tracesDir)) {
      fs.mkdirSync(this.tracesDir, { recursive: true });
      console.log(`Created traces directory: ${this.tracesDir}`);
    }
  }

  private loadExistingFiles() {
    let totalFiles = 0;
    let totalDirectories = 0;

    for (const dir of this.allWatchDirs) {
      if (!fs.existsSync(dir)) continue;

      try {
        totalDirectories++;
        const loadedFiles = this.scanDirectoryRecursive(dir);
        totalFiles += loadedFiles;
      } catch (error) {
        console.error(`Error scanning directory ${dir}:`, error);
      }
    }

    console.log(
      `Scanned ${totalDirectories} directories (recursive), loaded ${this.traces.size} items from ${totalFiles} files`,
    );
  }

  /** Recursively scan directory for supported file types */
  private scanDirectoryRecursive(dir: string, depth: number = 0): number {
    if (depth > 10) return 0; // Prevent infinite recursion

    let fileCount = 0;

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue; // Skip hidden files/dirs
        if (entry.name === 'archive') continue; // Skip archive directories (structural)
        if (this.userSkipDirs.has(entry.name)) continue; // Skip user-configured directories

        const fullPath = path.join(dir, entry.name);

        if (entry.isFile()) {
          if (this.isSupportedFile(entry.name)) {
            // Skip files older than the configured time window
            try {
              const mtime = fs.statSync(fullPath).mtimeMs;
              if (Date.now() - mtime > this.maxAgeMs) continue;
            } catch {
              continue;
            }
            if (this.loadFile(fullPath)) {
              fileCount++;
            }
          }
        } else if (entry.isDirectory()) {
          // Recurse into subdirectories
          fileCount += this.scanDirectoryRecursive(fullPath, depth + 1);
        }
      }
    } catch (error) {
      console.warn(`Cannot read directory ${dir}:`, error.message);
    }

    return fileCount;
  }

  /** Check if file type is supported */
  private isSupportedFile(filename: string): boolean {
    return (
      filename.endsWith('.json') ||
      filename.endsWith('.jsonl') ||
      filename.endsWith('.log') ||
      filename.endsWith('.trace')
    );
  }

  /** Structural file names that are never trace data — always skipped. */
  private static STRUCTURAL_SKIP_FILES = new Set([
    'workers.json',
    'package.json',
    'package-lock.json',
    'tsconfig.json',
    'biome.json',
    'auth.json',
    'models.json',
    'config.json',
    'runs.json',
    'sessions.json',
    'containers.json',
    'update-check.json',
    'exec-approvals.json',
  ]);
  /** Skip files = structural + user config */
  private skipFiles: Set<string>;
  /** Skip directories from user config */
  private userSkipDirs: Set<string>;
  private static SKIP_SUFFIXES = [
    '-state.json',
    '-config.json',
    '-watch-state.json',
    '.tmp',
    '.bak',
    '.backup',
  ];

  /** Load a file using the adapter registry, falling back to built-in parsing. */
  private loadFile(filePath: string): boolean {
    const filename = path.basename(filePath);

    // Skip known non-trace files
    if (this.skipFiles.has(filename)) return false;
    if (TraceWatcher.SKIP_SUFFIXES.some((s) => filename.endsWith(s))) return false;

    // Try adapter registry — non-agentflow adapters handle their own parsing
    const adapter = findAdapter(filePath);
    if (adapter && adapter.name !== 'agentflow') {
      return this.loadViaAdapter(filePath, adapter.name);
    }

    // Fallback: existing AgentFlow parsing
    if (filePath.endsWith('.jsonl')) {
      return this.loadSessionFile(filePath);
    }
    if (filePath.endsWith('.log') || filePath.endsWith('.trace')) {
      return this.loadLogFile(filePath);
    }
    return this.loadTraceFile(filePath);
  }

  /** Load a file using a specific adapter and store normalized traces. */
  private loadViaAdapter(filePath: string, adapterName: string): boolean {
    try {
      const adapter = findAdapter(filePath);
      if (!adapter) return false;

      const normalized = adapter.parse(filePath);
      if (normalized.length === 0) return false;

      for (const trace of normalized) {
        // Convert NormalizedTrace to WatchedTrace shape
        const nodes = new Map<string, any>();
        for (const [id, node] of Object.entries(trace.nodes)) {
          nodes.set(id, {
            id: node.id,
            type: node.type,
            name: node.name,
            status: node.status,
            startTime: node.startTime,
            endTime: node.endTime,
            parentId: node.parentId,
            children: node.children,
            metadata: node.metadata,
            state: {},
          });
        }

        const watched: WatchedTrace = {
          id: trace.id,
          rootNodeId: Object.keys(trace.nodes)[0] ?? '',
          agentId: trace.agentId,
          name: trace.name,
          trigger: trace.trigger,
          startTime: trace.startTime,
          endTime: trace.endTime,
          status: trace.status as any,
          nodes: nodes as any,
          edges: [],
          events: [],
          metadata: { ...trace.metadata, adapterSource: adapterName },
          sessionEvents: trace.sessionEvents ?? [],
          sourceType: 'session',
          filename: path.basename(filePath),
          lastModified: Date.now(),
          sourceDir: path.dirname(filePath),
        };

        const key = `${adapterName}:${trace.id}`;
        this.traces.set(key, watched);
      }

      return true;
    } catch (error) {
      console.error(`Adapter ${adapterName} failed for ${filePath}:`, error);
      return false;
    }
  }

  private loadLogFile(filePath: string): boolean {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const filename = path.basename(filePath);
      const stats = fs.statSync(filePath);

      // Try OpenClaw log format first
      if (filename.startsWith('openclaw-') || filePath.includes('openclaw')) {
        const result = this.loadOpenClawLogFile(content, filename, filePath, stats);
        if (result) return true;
        // Fall through to universal parser if OpenClaw parsing found nothing
      }

      // Universal log parsing - detect any agent activities
      const traces = this.parseUniversalLog(content, filename, filePath);

      for (let i = 0; i < traces.length; i++) {
        const trace = traces[i];

        // Ensure nodes is a Map (parseUniversalLog creates plain objects)
        if (trace.nodes && !(trace.nodes instanceof Map)) {
          const nodeMap = new Map<string, any>();
          for (const [key, value] of Object.entries(trace.nodes)) {
            nodeMap.set(key, value);
          }
          trace.nodes = nodeMap;
        }

        trace.filename = filename;
        trace.lastModified = stats.mtime.getTime();
        trace.sourceType = trace.sourceType || 'trace';
        trace.sourceDir = path.dirname(filePath);

        // Create unique key for each trace from the same file
        const key =
          traces.length === 1 ? this.traceKey(filePath) : `${this.traceKey(filePath)}-${i}`;
        this.traces.set(key, trace as WatchedTrace);
      }

      return traces.length > 0;
    } catch (error) {
      console.error(`Error loading log file ${filePath}:`, error);
      return false;
    }
  }

  /** Universal log parser - detects agent activities from any system */
  private parseUniversalLog(content: string, filename: string, filePath: string): WatchedTrace[] {
    const lines = content.split('\n').filter((line) => line.trim());
    const activities = new Map<string, any>();

    // Pattern detection - identify structured entries
    for (const line of lines) {
      const activity = detectActivityPattern(line);
      if (!activity) continue;

      const sessionId = extractSessionIdentifier(activity);

      if (!activities.has(sessionId)) {
        activities.set(sessionId, {
          id: sessionId,
          rootNodeId: '',
          agentId: this.detectAgentIdentifier(activity, filename, filePath),
          name: this.generateActivityName(activity, sessionId),
          trigger: detectTrigger(activity),
          startTime: activity.timestamp,
          endTime: activity.timestamp,
          status: 'completed',
          nodes: {},
          edges: [],
          events: [],
          metadata: { sessionId, source: filename },
        });
      }

      const session = activities.get(sessionId);
      this.addActivityNode(session, activity);

      // Update session end time
      if (activity.timestamp > session.endTime) {
        session.endTime = activity.timestamp;
      }

      // Update status from errors
      if (activity.level === 'error' || activity.level === 'fatal') {
        session.status = 'failed';
      }
    }

    const traces = Array.from(activities.values()).filter(
      (session) => Object.keys(session.nodes).length > 0,
    );

    // Convert log entries to sessionEvents for transcript tab
    for (const trace of traces) {
      const sortedNodes = Object.values(trace.nodes).sort(
        (a: any, b: any) => a.startTime - b.startTime,
      );
      trace.sessionEvents = sortedNodes.map((node: any) => ({
        type: node.status === 'failed' ? 'tool_result' : ('system' as const),
        timestamp: node.startTime,
        name: node.name,
        content:
          node.metadata.count > 1
            ? `${node.name} (${node.metadata.count} occurrences, ${node.metadata.errorCount || 0} errors)`
            : node.name,
        duration: node.endTime - node.startTime,
        toolError:
          node.status === 'failed' ? `${node.metadata.errorCount || 1} error(s)` : undefined,
        id: node.id,
      }));
      trace.sourceType = 'session'; // Enable transcript/timeline tabs
    }

    // If no structured activities found, create a basic file trace
    if (traces.length === 0) {
      const stats = fs.statSync(filePath);
      traces.push({
        id: '',
        rootNodeId: 'root',
        nodes: {
          root: {
            id: 'root',
            type: 'log-file',
            name: filename,
            status: 'completed',
            startTime: stats.mtime.getTime(),
            endTime: stats.mtime.getTime(),
            children: [],
            metadata: { lineCount: lines.length, path: filePath },
          },
        },
        edges: [],
        startTime: stats.mtime.getTime(),
        endTime: stats.mtime.getTime(),
        status: 'completed',
        trigger: 'file',
        agentId: this.extractAgentFromPath(filePath),
        events: [],
        metadata: { type: 'file-trace' },
      });
    }

    return traces;
  }

  /** Normalise agent identifiers using config-driven alias map. */
  private normaliseAgentId(raw: string): string {
    const aliases = getAliases(this.userConfig);
    return aliases[raw] ?? raw;
  }

  private detectAgentIdentifier(activity: any, _filename: string, filePath: string): string {
    // Use agent_id from log fields if available
    if (activity.agent_id) {
      return this.normaliseAgentId(activity.agent_id);
    }

    // Use path-based detection as primary
    const pathAgent = this.extractAgentFromPath(filePath);

    // Apply config-driven file pattern matching
    const detection = getAgentDetection(this.userConfig);
    if (detection.filePatterns) {
      const basename = path.basename(filePath, path.extname(filePath));
      for (const [pattern, template] of Object.entries(detection.filePatterns)) {
        const re = new RegExp(`^(${pattern})$`);
        const match = basename.match(re);
        if (match) {
          const resolved = template.replace('${match}', match[1]);
          return this.normaliseAgentId(resolved);
        }
      }
    }

    return this.normaliseAgentId(pathAgent);
  }

  private extractAgentFromPath(filePath: string): string {
    const filename = path.basename(filePath, path.extname(filePath));
    const pathParts = filePath.split(path.sep);

    // Config-driven path pattern matching — determines a prefix or flat agent ID
    const detection = getAgentDetection(this.userConfig);
    let pathPrefix = '';
    if (detection.pathPatterns) {
      for (const [pathSubstring, agentId] of Object.entries(detection.pathPatterns)) {
        if (filePath.includes(pathSubstring)) {
          pathPrefix = agentId;
          break;
        }
      }
    }

    // Generic: look for agents/AGENT_NAME/sessions/ pattern (common convention)
    const agentsIndex = pathParts.lastIndexOf('agents');
    if (agentsIndex !== -1 && agentsIndex + 1 < pathParts.length) {
      const agentName = pathParts[agentsIndex + 1];
      // If a path pattern matched, use it as prefix (e.g. "openclaw" + "main" → "openclaw-main")
      return pathPrefix ? `${pathPrefix}-${agentName}` : agentName;
    }

    // If path pattern matched but no agents/ dir found, return it as the agent ID
    if (pathPrefix) return pathPrefix;

    // Look for agent-related terms in path (reversed for inner-most first)
    for (const part of [...pathParts].reverse()) {
      if (part.match(/agent|worker|service|daemon|bot|ai|llm/i)) {
        return part;
      }
    }

    return filename;
  }

  private generateActivityName(activity: any, sessionId: string): string {
    const component = activity.component !== 'unknown' ? activity.component : 'Activity';
    const operation = activity.operation !== 'activity' ? `: ${activity.operation}` : '';
    return `${component}${operation} (${sessionId})`;
  }

  private addActivityNode(session: any, activity: any): void {
    // Group by component.operation to avoid creating thousands of nodes per log file
    const nodeId = `${activity.component}-${activity.operation}`;

    if (session.nodes[nodeId]) {
      // Update existing node — extend time range and count
      const node = session.nodes[nodeId];
      node.endTime = Math.max(node.endTime, activity.timestamp);
      node.startTime = Math.min(node.startTime, activity.timestamp);
      node.metadata.count = (node.metadata.count || 1) + 1;
      // Track errors
      if (activity.level === 'error' || activity.level === 'fatal') {
        node.status = 'failed';
        node.metadata.errorCount = (node.metadata.errorCount || 0) + 1;
      }
      return;
    }

    const node = {
      id: nodeId,
      type: activity.component,
      name: `${activity.component}: ${activity.operation}`,
      status: getUniversalNodeStatus(activity),
      startTime: activity.timestamp,
      endTime: activity.timestamp,
      children: [],
      metadata: { ...activity, count: 1 },
    };

    session.nodes[nodeId] = node;

    // Set root node if not set
    if (!session.rootNodeId) {
      session.rootNodeId = nodeId;
    }
  }

  /** Parse OpenClaw tslog-format log files with session run results. */
  private loadOpenClawLogFile(
    content: string,
    filename: string,
    filePath: string,
    stats: fs.Stats,
  ): boolean {
    const lines = content.split('\n').filter((l) => l.trim());
    const sessions = new Map<
      string,
      {
        entries: Array<{
          text: string;
          timestamp: number;
          sessionId: string;
          provider: string;
          model: string;
          usage: any;
          durationMs: number;
          agentName: string;
        }>;
      }
    >();

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        // Detect entries with payloads + agentMeta (session run results)
        if (parsed['0'] && typeof parsed['0'] === 'string') {
          // tslog format - the "0" field contains the logged object as a string or the actual content
          // Check if it's a JSON string containing payloads/agentMeta
          try {
            const inner =
              typeof parsed['0'] === 'string' && parsed['0'].startsWith('{')
                ? JSON.parse(parsed['0'])
                : null;
            if (inner?.payloads && inner?.meta?.agentMeta) {
              const agentMeta = inner.meta.agentMeta;
              const sessionId = agentMeta.sessionId || 'unknown';
              const agentName = openClawSessionIdToAgent(sessionId);
              const timestamp = parsed.time
                ? new Date(parsed.time).getTime()
                : parsed._meta?.date
                  ? new Date(parsed._meta.date).getTime()
                  : stats.mtime.getTime();
              const texts = (inner.payloads || []).map((p: any) => p.text || '').filter(Boolean);

              if (!sessions.has(sessionId)) {
                sessions.set(sessionId, { entries: [] });
              }
              sessions.get(sessionId)?.entries.push({
                text: texts.join('\n'),
                timestamp,
                sessionId,
                provider: agentMeta.provider || '',
                model: agentMeta.model || '',
                usage: agentMeta.usage || {},
                durationMs: inner.meta.durationMs || 0,
                agentName,
              });
              continue;
            }
          } catch {
            /* not a JSON string in "0" field */
          }
        }

        // Direct payloads/agentMeta format (non-tslog wrapped)
        if (parsed.payloads && parsed.meta?.agentMeta) {
          const agentMeta = parsed.meta.agentMeta;
          const sessionId = agentMeta.sessionId || 'unknown';
          const agentName = openClawSessionIdToAgent(sessionId);
          const timestamp = parsed.time
            ? new Date(parsed.time).getTime()
            : parsed._meta?.date
              ? new Date(parsed._meta.date).getTime()
              : stats.mtime.getTime();
          const texts = (parsed.payloads || []).map((p: any) => p.text || '').filter(Boolean);

          if (!sessions.has(sessionId)) {
            sessions.set(sessionId, { entries: [] });
          }
          sessions.get(sessionId)?.entries.push({
            text: texts.join('\n'),
            timestamp,
            sessionId,
            provider: agentMeta.provider || '',
            model: agentMeta.model || '',
            usage: agentMeta.usage || {},
            durationMs: parsed.meta.durationMs || 0,
            agentName,
          });
        }
      } catch {
        /* skip unparseable lines */
      }
    }

    if (sessions.size === 0) return false;

    let traceIndex = 0;
    for (const [sessionId, session] of sessions) {
      const entries = session.entries;
      if (entries.length === 0) continue;

      const firstEntry = entries[0];
      const lastEntry = entries[entries.length - 1];
      const agentId = firstEntry.agentName;

      // Aggregate usage
      let totalInput = 0,
        totalOutput = 0,
        totalTokens = 0;
      let totalDuration = 0;
      for (const entry of entries) {
        totalInput += entry.usage.input || 0;
        totalOutput += entry.usage.output || 0;
        totalTokens += entry.usage.total || 0;
        totalDuration += entry.durationMs;
      }

      const nodes = new Map<string, any>();
      const rootId = `openclaw-${sessionId.slice(0, 12)}`;

      // Create nodes for each entry
      for (let j = 0; j < entries.length; j++) {
        const e = entries[j];
        const nodeId = `entry-${j}`;
        nodes.set(nodeId, {
          id: nodeId,
          type: 'tool',
          name: `${e.model}: ${e.sessionId}`,
          startTime: e.timestamp - e.durationMs,
          endTime: e.timestamp,
          status: 'completed',
          parentId: rootId,
          children: [],
          metadata: {
            provider: e.provider,
            model: e.model,
            durationMs: e.durationMs,
            usage: e.usage,
            preview: e.text.slice(0, 200),
          },
        });
      }

      // Root node
      nodes.set(rootId, {
        id: rootId,
        type: 'agent',
        name: sessionId,
        startTime: firstEntry.timestamp - (firstEntry.durationMs || 0),
        endTime: lastEntry.timestamp,
        status: 'completed',
        parentId: undefined,
        children: Array.from(nodes.keys()).filter((k) => k !== rootId),
        metadata: {
          provider: firstEntry.provider,
          model: firstEntry.model,
          sessionId,
          totalTokens,
          inputTokens: totalInput,
          outputTokens: totalOutput,
          durationMs: totalDuration,
        },
      });

      // Build session events for timeline
      const sessionEvents: SessionEvent[] = entries.map((e, idx) => ({
        type: 'assistant' as const,
        timestamp: e.timestamp,
        name: e.model,
        content: e.text,
        model: e.model,
        provider: e.provider,
        tokens: {
          input: e.usage.input || 0,
          output: e.usage.output || 0,
          total: e.usage.total || 0,
        },
        duration: e.durationMs,
        id: `entry-${idx}`,
      }));

      const trace: WatchedTrace = {
        id: sessionId,
        nodes,
        edges: [],
        events: [],
        startTime: firstEntry.timestamp - (firstEntry.durationMs || 0),
        endTime: lastEntry.timestamp,
        agentId,
        trigger: 'cron',
        name: sessionId,
        traceId: sessionId,
        spanId: sessionId,
        filename,
        lastModified: stats.mtime.getTime(),
        sourceType: 'session',
        sourceDir: path.dirname(filePath),
        sessionEvents,
        tokenUsage: {
          input: totalInput,
          output: totalOutput,
          total: totalTokens || totalInput + totalOutput,
          cost: 0,
        },
        metadata: {
          provider: firstEntry.provider,
          model: firstEntry.model,
          durationMs: totalDuration,
          source: 'openclaw-log',
        },
      } as WatchedTrace;

      const key =
        sessions.size === 1 ? this.traceKey(filePath) : `${this.traceKey(filePath)}-${traceIndex}`;
      this.traces.set(key, trace);
      traceIndex++;
    }

    return traceIndex > 0;
  }

  private loadTraceFile(filePath: string): boolean {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const filename = path.basename(filePath);

      // Skip sessions.json index files — parse them separately for agent discovery
      if (filename === 'sessions.json') {
        return this.loadSessionsIndex(filePath, content);
      }

      const graph = loadGraph(content) as WatchedTrace;
      const stats = fs.statSync(filePath);

      graph.filename = filename;
      graph.lastModified = stats.mtime.getTime();
      graph.sourceType = 'trace';
      graph.sourceDir = path.dirname(filePath);

      // Ensure all nodes have children arrays (prevents getStats() crash)
      if (graph.nodes instanceof Map) {
        for (const node of graph.nodes.values()) {
          if (!node.children) (node as any).children = [];
        }
      }

      this.traces.set(this.traceKey(filePath), graph);
      return true;
    } catch {
      // Silently skip malformed trace files
      return false;
    }
  }

  /** Parse sessions.json index to discover agents and their sessions. */
  private loadSessionsIndex(filePath: string, content: string): boolean {
    try {
      const data = JSON.parse(content);
      if (typeof data !== 'object' || data === null) return false;

      const stats = fs.statSync(filePath);
      const pathParts = filePath.split(path.sep);

      // Detect agent name from path: .../agents/{agentName}/sessions/sessions.json
      const agentsIndex = pathParts.lastIndexOf('agents');
      if (agentsIndex === -1 || agentsIndex + 1 >= pathParts.length) return false;
      const agentName = pathParts[agentsIndex + 1];
      const agentId = filePath.includes('.openclaw/') ? `openclaw-${agentName}` : agentName;

      let loaded = 0;
      for (const [sessionKey, sessionData] of Object.entries(data)) {
        if (!sessionData || typeof sessionData !== 'object') continue;
        const session = sessionData as Record<string, any>;
        const sessionId = session.sessionId;
        if (!sessionId) continue;

        // Check if we already have a JSONL file for this session
        const existingKey = Array.from(this.traces.keys()).find((k) => {
          const t = this.traces.get(k);
          return t?.id === sessionId || t?.traceId === sessionId;
        });
        if (existingKey) continue;

        // Create a lightweight trace entry from the index metadata
        const updatedAt = session.updatedAt || stats.mtime.getTime();
        const label = session.label || sessionKey.split(':').pop() || sessionId;
        const chatType = session.chatType || (sessionKey.includes('cron') ? 'cron' : 'direct');
        const trigger = sessionKey.includes('cron') ? 'cron' : 'message';

        const rootId = `idx-${sessionId.slice(0, 12)}`;
        const nodes = new Map<string, any>();
        nodes.set(rootId, {
          id: rootId,
          type: 'agent',
          name: label,
          startTime: updatedAt,
          endTime: updatedAt,
          status: 'completed',
          parentId: undefined,
          children: [],
          metadata: {
            sessionId,
            sessionKey,
            chatType,
            source: 'sessions-index',
          },
        });

        const trace: WatchedTrace = {
          id: sessionId,
          nodes,
          edges: [],
          events: [],
          startTime: updatedAt,
          agentId,
          trigger,
          name: label,
          traceId: sessionId,
          spanId: sessionId,
          filename: `${agentName}-${sessionId.slice(0, 8)}.index`,
          lastModified: updatedAt,
          sourceType: 'session',
          sourceDir: path.dirname(filePath),
          sessionEvents: [],
          tokenUsage: { input: 0, output: 0, total: 0, cost: 0 },
          metadata: {
            sessionKey,
            chatType,
            source: 'sessions-index',
            agentName,
          },
        } as WatchedTrace;

        const key = `${this.traceKey(filePath)}-${sessionId.slice(0, 12)}`;
        this.traces.set(key, trace);
        loaded++;
      }

      return loaded > 0;
    } catch {
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

      // Detect cron run JSONL format (has ts, jobId, action fields instead of type: 'session')
      const firstEvent = rawEvents[0];
      if (firstEvent?.jobId && firstEvent?.action && !firstEvent?.type) {
        return this.loadCronRunFile(rawEvents, filePath);
      }

      const sessionEvent = rawEvents.find((e) => e.type === 'session');
      const sessionId = sessionEvent?.id || path.basename(filePath, '.jsonl');
      const sessionTimestamp = sessionEvent?.timestamp || rawEvents[0]?.timestamp;
      const startTime = sessionTimestamp ? new Date(sessionTimestamp).getTime() : 0;
      if (!startTime) return false;

      // Extract agent ID from directory structure
      const parentDir = path.basename(path.dirname(filePath));
      const grandParentDir = path.basename(path.dirname(path.dirname(filePath)));
      const greatGrandParentDir = path.basename(path.dirname(path.dirname(path.dirname(filePath))));

      // Determine agent ID from directory structure
      let agentName: string;
      if (parentDir === 'sessions' && greatGrandParentDir === 'agents') {
        agentName = grandParentDir; // .../agents/{agentName}/sessions/file.jsonl
      } else if (grandParentDir === 'agents') {
        agentName = parentDir;
      } else {
        agentName = parentDir;
      }

      // Apply config-driven path prefix (e.g. .openclaw/ → "openclaw-main")
      let agentId = agentName;
      const detection = getAgentDetection(this.userConfig);
      if (detection.pathPatterns) {
        for (const [pathSubstring, prefix] of Object.entries(detection.pathPatterns)) {
          if (filePath.includes(pathSubstring)) {
            agentId = `${prefix}-${agentName}`;
            break;
          }
        }
      }

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
      const firstMessage = rawEvents.find(
        (e) => e.type === 'message' && e.message?.role === 'user',
      );
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
      const rootName =
        triggerName || userPrompt.slice(0, 80) + (userPrompt.length > 80 ? '...' : '') || sessionId;

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
            name: `Subagent: ${(evt.data?.sessionId || '').slice(0, 12)}`,
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
                  tokens: msg.usage
                    ? {
                        input: msg.usage.input || 0,
                        output: msg.usage.output || 0,
                        total: msg.usage.totalTokens || 0,
                        cost: msg.usage.cost?.total,
                      }
                    : undefined,
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
            for (const [_nodeId, node] of nodes) {
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
        total: totalTokensSum || totalInputTokens + totalOutputTokens,
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

  /** Parse cron run JSONL files (ts, jobId, action, status format). */
  private loadCronRunFile(rawEvents: Array<Record<string, any>>, filePath: string): boolean {
    try {
      const filename = path.basename(filePath);
      const jobId = rawEvents[0]?.jobId || path.basename(filePath, '.jsonl');
      const fileStat = fs.statSync(filePath);

      const sessionEvents: SessionEvent[] = [];
      let lastStatus = 'completed';

      for (const evt of rawEvents) {
        const ts = evt.ts || Date.now();
        const action = evt.action || 'unknown';
        const status = evt.status || 'ok';

        if (status !== 'ok') lastStatus = 'failed';

        sessionEvents.push({
          type: action === 'finished' ? 'assistant' : 'system',
          timestamp: ts,
          name: `${jobId}: ${action}`,
          content: evt.summary || evt.error || `${action} (${status})`,
          id: `cron-${ts}`,
        });
      }

      const firstTs = rawEvents[0]?.ts || fileStat.mtime.getTime();
      const lastTs = rawEvents[rawEvents.length - 1]?.ts || fileStat.mtime.getTime();
      const rootId = `cron-${jobId.slice(0, 12)}`;
      const nodes = new Map<string, any>();

      nodes.set(rootId, {
        id: rootId,
        type: 'agent',
        name: jobId,
        startTime: firstTs,
        endTime: lastTs,
        status: lastStatus,
        parentId: undefined,
        children: [],
        metadata: { jobId, runs: rawEvents.length },
      });

      const trace: WatchedTrace = {
        id: jobId,
        nodes,
        edges: [],
        events: [],
        startTime: firstTs,
        agentId: 'openclaw-cron',
        trigger: 'cron',
        name: jobId,
        traceId: jobId,
        spanId: jobId,
        filename,
        lastModified: fileStat.mtime.getTime(),
        sourceType: 'session',
        sourceDir: path.dirname(filePath),
        sessionEvents,
        tokenUsage: { input: 0, output: 0, total: 0, cost: 0 },
        metadata: { jobId, source: 'cron-run' },
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
        // Use last 2 path segments of dir to avoid collisions
        // e.g., agents/main/sessions → "main/sessions" instead of just "sessions"
        const dirParts = dir.split(path.sep).filter(Boolean);
        const dirSuffix = dirParts.slice(-2).join('/');
        return `${path.relative(dir, filePath).replace(/\\/g, '/')}@${dirSuffix}`;
      }
    }
    return filePath;
  }

  private startWatching() {
    for (const dir of this.allWatchDirs) {
      if (!fs.existsSync(dir)) continue;

      // Use glob patterns to watch specific file types recursively
      const patterns = [
        path.join(dir, '**/*.json'),
        path.join(dir, '**/*.jsonl'),
        path.join(dir, '**/*.log'),
        path.join(dir, '**/*.trace'),
      ];

      const watcher = chokidar.watch(patterns, {
        ignored: [
          /^\./, // Ignore hidden files
          /node_modules/, // Ignore node_modules
          /\.git/, // Ignore git directories
          /\.vscode/, // Ignore vscode
          /\.idea/, // Ignore idea
          /\/archive\//, // Ignore archived trace files
          // Ignore user-configured skip directories
          ...getSkipDirectories(this.userConfig).map((d) => new RegExp(`/${d}/`)),
        ],
        persistent: true,
        ignoreInitial: true,
        followSymlinks: false,
        depth: 10, // Allow deep nesting for OpenClaw agents/*/sessions/
      });

      watcher.on('add', (filePath) => {
        if (this.isSupportedFile(path.basename(filePath))) {
          const relativePath = path.relative(dir, filePath);
          console.log(`New file: ${relativePath} (in ${path.basename(dir)})`);
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
        if (this.isSupportedFile(path.basename(filePath))) {
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
        if (this.isSupportedFile(path.basename(filePath))) {
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

    console.log(
      `Watching ${this.allWatchDirs.length} directories recursively for JSON/JSONL/LOG/TRACE files`,
    );
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

    // Handle composite key: "filename::startTime"
    if (filename.includes('::')) {
      const [fname, startTimeStr] = filename.split('::');
      const startTime = Number(startTimeStr);
      if (fname && !Number.isNaN(startTime)) {
        for (const trace of this.traces.values()) {
          if (trace.filename === fname && trace.startTime === startTime) {
            return trace;
          }
        }
      }
    }

    // Try with adapter prefixes
    for (const prefix of ['openclaw:', 'otel:', '']) {
      const prefixed = this.traces.get(prefix + filename);
      if (prefixed) return prefixed;
    }

    // Fallback: search by filename or id across all keys
    for (const [key, trace] of this.traces) {
      if (trace.filename === filename || trace.id === filename || key.endsWith(filename)) {
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
