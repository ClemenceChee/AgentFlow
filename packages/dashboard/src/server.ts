import * as fs from 'node:fs';
import { createServer } from 'node:http';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ExecutionGraph, KnowledgeStore, ProcessAuditResult } from 'agentflow-core';
import {
  auditProcesses,
  createExecutionEvent,
  createKnowledgeStore,
  discoverProcess,
  discoverProcessConfig,
  findVariants,
  getBottlenecks,
  loadGraph,
} from 'agentflow-core';
import express from 'express';
import { WebSocketServer } from 'ws';
import { AgentStats } from './stats.js';
import { TraceWatcher } from './watcher.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface DashboardConfig {
  port: number;
  tracesDir: string;
  host?: string;
  enableCors?: boolean;
  dataDirs?: string[];
}

import { startDashboard } from './cli.js';

/** Convert a WatchedTrace for JSON serialization (Map → Object). */
function serializeTrace(trace: any): any {
  if (!trace) return trace;
  const obj = { ...trace };
  if (obj.nodes instanceof Map) {
    const nodesObj: Record<string, any> = {};
    for (const [key, value] of obj.nodes) {
      nodesObj[key] = value;
    }
    obj.nodes = nodesObj;
  }
  return obj;
}

export class DashboardServer {
  private app = express();
  private server = createServer(this.app);
  private wss = new WebSocketServer({ server: this.server });
  private watcher: TraceWatcher;
  private stats: AgentStats;
  private processHealthCache: { result: ProcessAuditResult | null; ts: number } = {
    result: null,
    ts: 0,
  };
  private knowledgeStore: KnowledgeStore;

  constructor(private config: DashboardConfig) {
    this.watcher = new TraceWatcher({
      tracesDir: config.tracesDir,
      dataDirs: config.dataDirs,
    });
    this.stats = new AgentStats();
    this.knowledgeStore = createKnowledgeStore({
      baseDir: path.join(config.tracesDir, '..', '.agentflow', 'knowledge'),
    });
    this.setupExpress();
    this.setupWebSocket();
    this.setupTraceWatcher();

    // Process all existing traces for stats and knowledge store
    let knowledgeCount = 0;
    for (const trace of this.watcher.getAllTraces()) {
      this.stats.processTrace(trace);
      if (this.isGraphTrace(trace)) {
        try {
          const graph = loadGraph(serializeTrace(trace));
          const event = createExecutionEvent(graph);
          this.knowledgeStore.append(event);
          knowledgeCount++;
        } catch {
          // skip
        }
      }
    }
    console.log(`Processed ${this.watcher.getTraceCount()} existing traces for stats`);
    console.log(`Persisted ${knowledgeCount} graph traces to knowledge store`);
  }

  private setupExpress() {
    if (this.config.enableCors) {
      this.app.use((_req, res, next) => {
        res.header('Access-Control-Allow-Origin', '*');
        res.header(
          'Access-Control-Allow-Headers',
          'Origin, X-Requested-With, Content-Type, Accept',
        );
        next();
      });
    }

    // Serve static files
    const publicDir = path.join(__dirname, '../public');
    if (fs.existsSync(publicDir)) {
      this.app.use(express.static(publicDir));
    }

    // API endpoints
    this.app.get('/api/traces', (_req, res) => {
      try {
        const traces = this.watcher.getAllTraces().map(serializeTrace);
        res.json(traces);
      } catch (_error) {
        res.status(500).json({ error: 'Failed to load traces' });
      }
    });

    this.app.get('/api/traces/:filename', (req, res) => {
      try {
        const trace = this.watcher.getTrace(req.params.filename);
        if (!trace) {
          return res.status(404).json({ error: 'Trace not found' });
        }
        res.json(serializeTrace(trace));
      } catch (_error) {
        res.status(500).json({ error: 'Failed to load trace' });
      }
    });

    this.app.get('/api/traces/:filename/events', (req, res) => {
      try {
        const trace = this.watcher.getTrace(req.params.filename);
        if (!trace) {
          return res.status(404).json({ error: 'Trace not found' });
        }
        res.json({
          events: (trace as any).sessionEvents || [],
          tokenUsage: (trace as any).tokenUsage || null,
          sourceType: (trace as any).sourceType || 'trace',
        });
      } catch (_error) {
        res.status(500).json({ error: 'Failed to load trace events' });
      }
    });

    this.app.get('/api/agents', (_req, res) => {
      try {
        const agents = this.stats.getAgentsList();
        res.json(agents);
      } catch (_error) {
        res.status(500).json({ error: 'Failed to load agents' });
      }
    });

    this.app.get('/api/stats', (_req, res) => {
      try {
        const globalStats = this.stats.getGlobalStats();
        res.json(globalStats);
      } catch (_error) {
        res.status(500).json({ error: 'Failed to load statistics' });
      }
    });

    // Agent timeline: all executions for an agent with sub-activities for Gantt view
    this.app.get('/api/agents/:agentId/timeline', (req, res) => {
      try {
        const agentId = req.params.agentId;
        const limit = Math.min(parseInt(req.query.limit as string, 10) || 50, 200);
        const rawTraces = this.watcher.getTracesByAgent(agentId);
        if (rawTraces.length === 0) {
          return res.status(404).json({ error: 'No traces for agent' });
        }

        // Sort by startTime descending, take limit
        const traces = rawTraces
          .sort((a, b) => (b.startTime || 0) - (a.startTime || 0))
          .slice(0, limit)
          .reverse(); // chronological for the Gantt

        const executions = traces.map((t) => {
          const serialized = serializeTrace(t);
          const nodes = serialized.nodes || {};
          const events = serialized.sessionEvents || [];

          // Build sub-activities from nodes or events
          const activities: Array<{
            id: string;
            name: string;
            type: string;
            status: string;
            startTime: number;
            endTime: number;
            parentId?: string;
          }> = [];

          if (events.length > 0) {
            // Session-based: convert events to activities with timing
            // Use gap to next event as implicit duration when no explicit duration
            for (let i = 0; i < events.length; i++) {
              const evt = events[i];
              if (evt.type === 'system' || evt.type === 'model_change') continue;
              const dur = evt.duration || 0;
              const startTs = dur > 0 ? evt.timestamp - dur : evt.timestamp;
              // End time: use explicit duration, or gap to next event, or 1s minimum for visibility
              const nextTs = i + 1 < events.length ? events[i + 1].timestamp : evt.timestamp;
              const endTs = dur > 0 ? evt.timestamp : Math.max(nextTs, startTs + 500);
              activities.push({
                id: evt.id || `evt-${i}`,
                name: evt.toolName || evt.name || evt.type,
                type: evt.type,
                status: evt.toolError ? 'failed' : 'completed',
                startTime: startTs,
                endTime: endTs,
                parentId: evt.parentId,
              });
            }
          } else {
            // Graph-based: use nodes
            const sorted = Object.values(nodes).sort(
              (a: any, b: any) => (a.startTime || 0) - (b.startTime || 0),
            );
            for (const node of sorted as any[]) {
              activities.push({
                id: node.id,
                name: node.name || node.type || node.id,
                type: node.type || 'unknown',
                status: node.status || 'completed',
                startTime: node.startTime || t.startTime,
                endTime: node.endTime || node.startTime || t.startTime,
                parentId: node.parentId,
              });
            }
          }

          return {
            id: serialized.id || serialized.filename,
            filename: serialized.filename,
            name: serialized.name || serialized.filename,
            agentId: serialized.agentId,
            trigger: serialized.trigger,
            status: serialized.status || 'completed',
            sourceType: serialized.sourceType,
            startTime: serialized.startTime,
            endTime: serialized.endTime || serialized.startTime,
            tokenUsage: serialized.tokenUsage,
            activities,
          };
        });

        // Compute global time range
        const allTimes = executions.flatMap((e) => [e.startTime, e.endTime]);
        const minTime = Math.min(...allTimes);
        const maxTime = Math.max(...allTimes);

        res.json({ agentId, totalExecutions: rawTraces.length, executions, minTime, maxTime });
      } catch (error) {
        console.error('Agent timeline error:', error);
        res.status(500).json({ error: 'Failed to build agent timeline' });
      }
    });

    // Process mining graph: aggregate all traces for an agent into a transition graph
    this.app.get('/api/agents/:agentId/process-graph', (req, res) => {
      try {
        const agentId = req.params.agentId;
        const allTraces = this.watcher.getTracesByAgent(agentId);
        if (allTraces.length === 0) {
          return res.status(404).json({ error: 'No traces for agent' });
        }

        // Try core API path for graph-based traces
        const graphs = this.getGraphTraces(agentId);
        if (graphs.length > 0) {
          return res.json(this.buildProcessGraphFromCore(agentId, graphs));
        }

        // Fallback: session-based traces use legacy inline logic
        return res.json(this.buildProcessGraphLegacy(agentId, allTraces));
      } catch (error) {
        console.error('Process graph error:', error);
        res.status(500).json({ error: 'Failed to build process graph' });
      }
    });

    // Variant analysis endpoint
    this.app.get('/api/agents/:agentId/variants', (req, res) => {
      try {
        const agentId = req.params.agentId;
        const graphs = this.getGraphTraces(agentId);
        if (graphs.length === 0) {
          return res.json({ agentId, totalTraces: 0, variants: [] });
        }
        const variants = findVariants(graphs).map((v) => ({
          pathSignature: v.pathSignature,
          count: v.count,
          percentage: v.percentage,
        }));
        res.json({ agentId, totalTraces: graphs.length, variants });
      } catch (error) {
        console.error('Variants error:', error);
        res.status(500).json({ error: 'Failed to compute variants' });
      }
    });

    // Bottleneck analysis endpoint
    this.app.get('/api/agents/:agentId/bottlenecks', (req, res) => {
      try {
        const agentId = req.params.agentId;
        const graphs = this.getGraphTraces(agentId);
        if (graphs.length === 0) {
          return res.json({ agentId, bottlenecks: [] });
        }
        const bottlenecks = getBottlenecks(graphs).map((b) => ({
          nodeName: b.nodeName,
          nodeType: b.nodeType,
          occurrences: b.occurrences,
          durations: b.durations,
        }));
        res.json({ agentId, bottlenecks });
      } catch (error) {
        console.error('Bottlenecks error:', error);
        res.status(500).json({ error: 'Failed to compute bottlenecks' });
      }
    });

    // Agent profile endpoint (from knowledge store)
    this.app.get('/api/agents/:agentId/profile', (req, res) => {
      try {
        const profile = this.knowledgeStore.getAgentProfile(req.params.agentId);
        if (!profile) {
          return res.status(404).json({ error: 'No profile for agent' });
        }
        res.json(profile);
      } catch (error) {
        console.error('Profile error:', error);
        res.status(500).json({ error: 'Failed to load agent profile' });
      }
    });

    this.app.get('/api/stats/:agentId', (req, res) => {
      try {
        const agentStats = this.stats.getAgentStats(req.params.agentId);
        if (!agentStats) {
          return res.status(404).json({ error: 'Agent not found' });
        }
        res.json(agentStats);
      } catch (_error) {
        res.status(500).json({ error: 'Failed to load agent statistics' });
      }
    });

    this.app.get('/api/process-health', (_req, res) => {
      try {
        const now = Date.now();
        if (this.processHealthCache.result && now - this.processHealthCache.ts < 10_000) {
          return res.json(this.processHealthCache.result);
        }

        // Build discovery dirs: tracesDir, its parent, plus any extra dataDirs
        const discoveryDirs = [
          this.config.tracesDir,
          path.dirname(this.config.tracesDir),
          ...(this.config.dataDirs || []),
        ];

        const processConfig = discoverProcessConfig(discoveryDirs);
        if (!processConfig) {
          return res.json(null);
        }

        // Get Alfred processes
        const alfredResult = auditProcesses(processConfig);

        // Also get OpenClaw processes explicitly
        const openclawConfig = {
          processName: 'openclaw',
          pidFile: undefined,
          workersFile: undefined,
          systemdUnit: null,
        };
        const openclawResult = auditProcesses(openclawConfig);

        // Get clawmetry processes
        const clawmetryConfig = {
          processName: 'clawmetry',
          pidFile: undefined,
          workersFile: undefined,
          systemdUnit: null,
        };
        const clawmetryResult = auditProcesses(clawmetryConfig);

        // Combine all OS processes
        const allOsProcesses = [
          ...alfredResult.osProcesses,
          ...openclawResult.osProcesses,
          ...clawmetryResult.osProcesses,
        ];

        // Remove duplicates by PID
        const uniqueProcesses = allOsProcesses.filter(
          (proc, index, arr) => arr.findIndex((p) => p.pid === proc.pid) === index,
        );

        // Build combined result using Alfred as the base (since it has PID file and workers)
        const result = {
          ...alfredResult,
          osProcesses: uniqueProcesses,
          // Recalculate orphans based on all processes
          orphans: uniqueProcesses.filter((p) => {
            // Known PIDs from Alfred system
            const alfredKnownPids = new Set<number>();
            if (alfredResult.pidFile?.pid && !alfredResult.pidFile.stale)
              alfredKnownPids.add(alfredResult.pidFile.pid);
            if (alfredResult.workers) {
              if (alfredResult.workers.orchestratorPid)
                alfredKnownPids.add(alfredResult.workers.orchestratorPid);
              for (const w of alfredResult.workers.workers) {
                if (w.pid) alfredKnownPids.add(w.pid);
              }
            }

            // Don't consider OpenClaw processes as orphans
            const isOpenClawProcess =
              p.cmdline.includes('openclaw') || p.cmdline.includes('clawmetry');

            return (
              !alfredKnownPids.has(p.pid) &&
              !isOpenClawProcess &&
              p.pid !== process.pid &&
              p.pid !== process.ppid
            );
          }),
        };

        // Update problems to include OpenClaw status
        const openclawProblems = [];
        if (openclawResult.osProcesses.length === 0) {
          openclawProblems.push('No OpenClaw gateway processes detected');
        }
        if (clawmetryResult.osProcesses.length === 0) {
          openclawProblems.push('No clawmetry processes detected');
        }

        result.problems = [...(alfredResult.problems || []), ...openclawProblems];

        this.processHealthCache = { result, ts: now };
        res.json(result);
      } catch (_error) {
        res.status(500).json({ error: 'Failed to audit processes' });
      }
    });

    // Health check endpoints
    this.app.get('/health', (_req, res) => {
      res.json({
        status: 'ok',
        uptime: process.uptime(),
        traceCount: this.watcher.getTraceCount(),
        agentCount: this.watcher.getAgentIds().length,
      });
    });

    this.app.get('/ready', (_req, res) => {
      res.json({ status: 'ready' });
    });

    // Fallback to serve index.html for SPA routing
    this.app.get('*', (_req, res) => {
      const indexPath = path.join(__dirname, '../public/index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send('Dashboard not found - public files may not be built');
      }
    });
  }

  private setupWebSocket() {
    this.wss.on('connection', (ws) => {
      console.log('Dashboard client connected');

      // Send initial data
      ws.send(
        JSON.stringify({
          type: 'init',
          data: {
            traces: this.watcher.getAllTraces().map(serializeTrace),
            stats: this.stats.getGlobalStats(),
          },
        }),
      );

      ws.on('close', () => {
        console.log('Dashboard client disconnected');
      });

      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
      });
    });
  }

  /**
   * Filter an agent's traces to valid ExecutionGraphs and convert via loadGraph().
   * Returns only traces with proper nodes (Map or non-empty object), skipping session-only traces.
   */
  private getGraphTraces(agentId: string): ExecutionGraph[] {
    const traces = this.watcher.getTracesByAgent(agentId).map(serializeTrace);
    const graphs: ExecutionGraph[] = [];
    for (const trace of traces) {
      try {
        // Skip session-based and log-based traces — they have synthetic nodes from log parsing
        if (trace.sourceType === 'session' || trace.sourceType === 'log') continue;
        // Must have a rootNodeId to be a proper ExecutionGraph
        if (!trace.rootNodeId && !trace.rootId) continue;
        const nodes = trace.nodes;
        if (!nodes || (typeof nodes === 'object' && Object.keys(nodes).length === 0)) continue;
        // Skip traces with non-standard node types (log-file, etc.)
        const nodeValues = Object.values(nodes) as any[];
        if (nodeValues.some((n: any) => n.type === 'log-file' || n.type === 'log-entry')) continue;
        graphs.push(loadGraph(trace));
      } catch {
        // Skip traces that can't be converted
      }
    }
    return graphs;
  }

  /**
   * Build process graph response using core APIs (discoverProcess + getBottlenecks).
   * Maps core output to the frontend's expected shape with virtual START/END nodes.
   */
  private buildProcessGraphFromCore(agentId: string, graphs: ExecutionGraph[]) {
    const model = discoverProcess(graphs);
    const bottleneckList = getBottlenecks(graphs);

    // Index bottlenecks by step key (type:name)
    const bottleneckMap = new Map<string, { avgDuration: number; failRate: number; p95: number }>();
    for (const b of bottleneckList) {
      const key = `${b.nodeType}:${b.nodeName}`;
      bottleneckMap.set(key, {
        avgDuration: b.durations.median,
        failRate: 0, // Not directly available from bottleneck data
        p95: b.durations.p95,
      });
      // Also index by just nodeName for display
      bottleneckMap.set(b.nodeName, {
        avgDuration: b.durations.median,
        failRate: 0,
        p95: b.durations.p95,
      });
    }

    // Build nodes from steps
    const nodes: any[] = [];
    const stepCounts = new Map<string, number>();

    // Count step occurrences from transitions
    for (const t of model.transitions) {
      stepCounts.set(t.from, (stepCounts.get(t.from) ?? 0) + t.count);
    }

    for (const step of model.steps) {
      const count = stepCounts.get(step) ?? model.totalGraphs;
      const bn = bottleneckMap.get(step);
      // Step format is "type:name" — extract everything after the first colon
      const colonIdx = step.indexOf(':');
      const label = colonIdx >= 0 ? step.slice(colonIdx + 1) : step;
      nodes.push({
        id: step,
        label,
        count,
        frequency: count / model.totalGraphs,
        avgDuration: bn?.avgDuration ?? 0,
        failRate: bn?.failRate ?? 0,
        p95Duration: bn?.p95 ?? 0,
        isVirtual: false,
      });
    }

    // Add virtual START/END nodes
    const rootSteps = new Set(model.steps);
    const childSteps = new Set(model.transitions.map((t) => t.to));
    const leafSteps = new Set(model.steps);
    for (const t of model.transitions) {
      // A step that appears as a target is not a root
      // A step that appears as a source is not a leaf (simplified)
    }

    nodes.push({ id: '[START]', label: '[START]', count: model.totalGraphs, frequency: 1, avgDuration: 0, failRate: 0, p95Duration: 0, isVirtual: true });
    nodes.push({ id: '[END]', label: '[END]', count: model.totalGraphs, frequency: 1, avgDuration: 0, failRate: 0, p95Duration: 0, isVirtual: true });

    // Build edges from transitions
    const edges = model.transitions.map((t) => ({
      source: t.from,
      target: t.to,
      count: t.count,
      frequency: t.count / model.totalGraphs,
    }));

    // Find root nodes (steps that appear as 'from' but never as 'to') for START edges
    const targetSteps = new Set(model.transitions.map((t) => t.to));
    for (const step of model.steps) {
      if (!targetSteps.has(step)) {
        edges.push({ source: '[START]', target: step, count: model.totalGraphs, frequency: 1 });
      }
    }

    // Find leaf nodes (steps that appear as 'from' but have no children-only transitions)
    const sourceSteps = new Set(model.transitions.map((t) => t.from));
    for (const step of model.steps) {
      if (!sourceSteps.has(step)) {
        edges.push({ source: step, target: '[END]', count: model.totalGraphs, frequency: 1 });
      }
    }

    const maxEdgeCount = Math.max(...edges.map((e) => e.count), 1);
    const maxNodeCount = Math.max(...nodes.filter((n: any) => !n.isVirtual).map((n: any) => n.count), 1);

    return { agentId, totalTraces: model.totalGraphs, nodes, edges, maxEdgeCount, maxNodeCount };
  }

  /**
   * Legacy process graph computation for session-based traces.
   * Preserved for backward compatibility with JSONL/LOG traces.
   */
  private buildProcessGraphLegacy(agentId: string, allTraces: any[]) {
    const traces = allTraces.map(serializeTrace);
    const activityCounts = new Map<string, number>();
    const transitionCounts = new Map<string, number>();
    const activityDurations = new Map<string, number[]>();
    const activityStatuses = new Map<string, { ok: number; fail: number }>();
    let totalTraces = 0;

    for (const trace of traces) {
      totalTraces++;
      const activities: Array<{ name: string; type: string; status: string; duration: number }> = [];

      if (trace.sessionEvents && trace.sessionEvents.length > 0) {
        for (const evt of trace.sessionEvents) {
          const name = evt.toolName || evt.name || evt.type;
          if (!name) continue;
          activities.push({
            name,
            type: evt.type,
            status: evt.toolError ? 'failed' : 'completed',
            duration: evt.duration || 0,
          });
        }
      } else {
        const nodes = trace.nodes || {};
        const sorted = Object.values(nodes).sort(
          (a: any, b: any) => (a.startTime || 0) - (b.startTime || 0),
        );
        for (const node of sorted as any[]) {
          activities.push({
            name: node.name || node.type || node.id,
            type: node.type || 'unknown',
            status: node.status || 'completed',
            duration: (node.endTime || node.startTime || 0) - (node.startTime || 0),
          });
        }
      }

      const seq = ['[START]', ...activities.map((a) => a.name), '[END]'];
      for (let i = 0; i < seq.length; i++) {
        const act = seq[i]!;
        activityCounts.set(act, (activityCounts.get(act) || 0) + 1);
        if (i < seq.length - 1) {
          const key = `${act} → ${seq[i + 1]}`;
          transitionCounts.set(key, (transitionCounts.get(key) || 0) + 1);
        }
      }

      for (const act of activities) {
        if (act.duration > 0) {
          const durs = activityDurations.get(act.name) || [];
          durs.push(act.duration);
          activityDurations.set(act.name, durs);
        }
        const st = activityStatuses.get(act.name) || { ok: 0, fail: 0 };
        if (act.status === 'failed') st.fail++;
        else st.ok++;
        activityStatuses.set(act.name, st);
      }
    }

    const nodes = Array.from(activityCounts.entries()).map(([name, count]) => {
      const durs = activityDurations.get(name) || [];
      const st = activityStatuses.get(name) || { ok: 0, fail: 0 };
      const avgDuration = durs.length > 0 ? durs.reduce((a, b) => a + b, 0) / durs.length : 0;
      return {
        id: name, label: name, count, frequency: count / totalTraces,
        avgDuration, failRate: st.ok + st.fail > 0 ? st.fail / (st.ok + st.fail) : 0,
        p95Duration: 0, isVirtual: name === '[START]' || name === '[END]',
      };
    });

    const edges = Array.from(transitionCounts.entries()).map(([key, count]) => {
      const [source, target] = key.split(' → ');
      return { source, target, count, frequency: count / totalTraces };
    });

    const maxEdgeCount = Math.max(...edges.map((e) => e.count), 1);
    const maxNodeCount = Math.max(...nodes.filter((n) => !n.isVirtual).map((n) => n.count), 1);

    return { agentId, totalTraces, nodes, edges, maxEdgeCount, maxNodeCount };
  }

  /** Check if a trace is a proper ExecutionGraph (not a synthetic session-based trace). */
  private isGraphTrace(trace: any): boolean {
    if (trace.sourceType === 'session' || trace.sourceType === 'log') return false;
    if (!trace.rootNodeId && !trace.rootId) return false;
    const nodes = trace.nodes instanceof Map ? Object.fromEntries(trace.nodes) : trace.nodes;
    return nodes && typeof nodes === 'object' && Object.keys(nodes).length > 0;
  }

  private setupTraceWatcher() {
    this.watcher.on('trace-added', (trace) => {
      this.stats.processTrace(trace);
      this.broadcast({
        type: 'trace-added',
        data: serializeTrace(trace),
      });

      // Persist valid graph traces to knowledge store
      if (this.isGraphTrace(trace)) {
        try {
          const graph = loadGraph(serializeTrace(trace));
          const event = createExecutionEvent(graph);
          this.knowledgeStore.append(event);
        } catch {
          // Non-critical: skip traces that can't be converted
        }
      }
    });

    this.watcher.on('trace-updated', (trace) => {
      this.stats.processTrace(trace);
      this.broadcast({
        type: 'trace-updated',
        data: serializeTrace(trace),
      });
    });

    this.watcher.on('stats-updated', () => {
      this.broadcast({
        type: 'stats-updated',
        data: this.stats.getGlobalStats(),
      });
    });
  }

  private broadcast(message: any) {
    this.wss.clients.forEach((client) => {
      if (client.readyState === 1) {
        // WebSocket.OPEN
        client.send(JSON.stringify(message));
      }
    });
  }

  public async start(): Promise<void> {
    return new Promise((resolve) => {
      const host = this.config.host || 'localhost';
      this.server.listen(this.config.port, host, () => {
        console.log(`AgentFlow Dashboard running at http://${host}:${this.config.port}`);
        console.log(`Watching traces in: ${this.config.tracesDir}`);
        resolve();
      });
    });
  }

  public async stop(): Promise<void> {
    return new Promise((resolve) => {
      this.watcher.stop();
      this.server.close(() => {
        console.log('Dashboard server stopped');
        resolve();
      });
    });
  }

  public getStats() {
    return this.stats.getGlobalStats();
  }

  public getTraces() {
    return this.watcher.getAllTraces();
  }
}

// Start dashboard if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startDashboard().catch(console.error);
}
