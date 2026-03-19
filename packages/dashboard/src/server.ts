import express from 'express';
import * as fs from 'fs';
import { createServer } from 'http';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import { discoverProcessConfig, auditProcesses } from 'agentflow-core';
import type { ProcessAuditResult } from 'agentflow-core';
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
  private processHealthCache: { result: ProcessAuditResult | null; ts: number } = { result: null, ts: 0 };

  constructor(private config: DashboardConfig) {
    this.watcher = new TraceWatcher({
      tracesDir: config.tracesDir,
      dataDirs: config.dataDirs,
    });
    this.stats = new AgentStats();
    this.setupExpress();
    this.setupWebSocket();
    this.setupTraceWatcher();

    // Process all existing traces for stats (initial load happens before event listeners)
    for (const trace of this.watcher.getAllTraces()) {
      this.stats.processTrace(trace);
    }
    console.log(`Processed ${this.watcher.getTraceCount()} existing traces for stats`);
  }

  private setupExpress() {
    if (this.config.enableCors) {
      this.app.use((req, res, next) => {
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
    this.app.get('/api/traces', (req, res) => {
      try {
        const traces = this.watcher.getAllTraces().map(serializeTrace);
        res.json(traces);
      } catch (error) {
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
      } catch (error) {
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
      } catch (error) {
        res.status(500).json({ error: 'Failed to load trace events' });
      }
    });

    this.app.get('/api/agents', (req, res) => {
      try {
        const agents = this.stats.getAgentsList();
        res.json(agents);
      } catch (error) {
        res.status(500).json({ error: 'Failed to load agents' });
      }
    });

    this.app.get('/api/stats', (req, res) => {
      try {
        const globalStats = this.stats.getGlobalStats();
        res.json(globalStats);
      } catch (error) {
        res.status(500).json({ error: 'Failed to load statistics' });
      }
    });

    // Agent timeline: all executions for an agent with sub-activities for Gantt view
    this.app.get('/api/agents/:agentId/timeline', (req, res) => {
      try {
        const agentId = req.params.agentId;
        const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
        const rawTraces = this.watcher.getTracesByAgent(agentId);
        if (rawTraces.length === 0) {
          return res.status(404).json({ error: 'No traces for agent' });
        }

        // Sort by startTime descending, take limit
        const traces = rawTraces
          .sort((a, b) => (b.startTime || 0) - (a.startTime || 0))
          .slice(0, limit)
          .reverse(); // chronological for the Gantt

        const executions = traces.map(t => {
          const serialized = serializeTrace(t);
          const nodes = serialized.nodes || {};
          const events = serialized.sessionEvents || [];

          // Build sub-activities from nodes or events
          const activities: Array<{
            id: string; name: string; type: string; status: string;
            startTime: number; endTime: number; parentId?: string;
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
            const sorted = Object.values(nodes).sort((a: any, b: any) =>
              (a.startTime || 0) - (b.startTime || 0));
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
        const allTimes = executions.flatMap(e => [e.startTime, e.endTime]);
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
        const traces = this.watcher.getTracesByAgent(agentId).map(serializeTrace);
        if (traces.length === 0) {
          return res.status(404).json({ error: 'No traces for agent' });
        }

        // Build transition counts: activity → activity
        const activityCounts = new Map<string, number>();
        const transitionCounts = new Map<string, number>();
        const activityDurations = new Map<string, number[]>();
        const activityStatuses = new Map<string, { ok: number; fail: number }>();
        let totalTraces = 0;

        for (const trace of traces) {
          totalTraces++;
          // Extract activity sequence from this trace
          const activities: Array<{ name: string; type: string; status: string; duration: number }> = [];

          if (trace.sessionEvents && trace.sessionEvents.length > 0) {
            // Session-based: use event types as activities
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
            // Graph-based: use nodes sorted by startTime
            const nodes = trace.nodes || {};
            const sorted = Object.values(nodes).sort((a: any, b: any) => (a.startTime || 0) - (b.startTime || 0));
            for (const node of sorted as any[]) {
              activities.push({
                name: node.name || node.type || node.id,
                type: node.type || 'unknown',
                status: node.status || 'completed',
                duration: (node.endTime || node.startTime || 0) - (node.startTime || 0),
              });
            }
          }

          // Count activities and transitions
          // Add virtual START and END nodes
          const seq = ['[START]', ...activities.map(a => a.name), '[END]'];
          for (let i = 0; i < seq.length; i++) {
            const act = seq[i];
            activityCounts.set(act, (activityCounts.get(act) || 0) + 1);

            if (i < seq.length - 1) {
              const key = act + ' → ' + seq[i + 1];
              transitionCounts.set(key, (transitionCounts.get(key) || 0) + 1);
            }
          }

          // Track durations and statuses per activity
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

        // Build response
        const nodes = Array.from(activityCounts.entries()).map(([name, count]) => {
          const durs = activityDurations.get(name) || [];
          const st = activityStatuses.get(name) || { ok: 0, fail: 0 };
          const avgDuration = durs.length > 0 ? durs.reduce((a, b) => a + b, 0) / durs.length : 0;
          return {
            id: name,
            label: name,
            count,
            frequency: count / totalTraces,
            avgDuration,
            failRate: st.ok + st.fail > 0 ? st.fail / (st.ok + st.fail) : 0,
            isVirtual: name === '[START]' || name === '[END]',
          };
        });

        const edges = Array.from(transitionCounts.entries()).map(([key, count]) => {
          const [source, target] = key.split(' → ');
          return { source, target, count, frequency: count / totalTraces };
        });

        // Compute max edge count for relative sizing
        const maxEdgeCount = Math.max(...edges.map(e => e.count), 1);
        const maxNodeCount = Math.max(...nodes.filter(n => !n.isVirtual).map(n => n.count), 1);

        res.json({
          agentId,
          totalTraces,
          nodes,
          edges,
          maxEdgeCount,
          maxNodeCount,
        });
      } catch (error) {
        console.error('Process graph error:', error);
        res.status(500).json({ error: 'Failed to build process graph' });
      }
    });

    this.app.get('/api/stats/:agentId', (req, res) => {
      try {
        const agentStats = this.stats.getAgentStats(req.params.agentId);
        if (!agentStats) {
          return res.status(404).json({ error: 'Agent not found' });
        }
        res.json(agentStats);
      } catch (error) {
        res.status(500).json({ error: 'Failed to load agent statistics' });
      }
    });

    this.app.get('/api/process-health', (req, res) => {
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
        const uniqueProcesses = allOsProcesses.filter((proc, index, arr) =>
          arr.findIndex(p => p.pid === proc.pid) === index
        );

        // Build combined result using Alfred as the base (since it has PID file and workers)
        const result = {
          ...alfredResult,
          osProcesses: uniqueProcesses,
          // Recalculate orphans based on all processes
          orphans: uniqueProcesses.filter(p => {
            // Known PIDs from Alfred system
            const alfredKnownPids = new Set<number>();
            if (alfredResult.pidFile?.pid && !alfredResult.pidFile.stale) alfredKnownPids.add(alfredResult.pidFile.pid);
            if (alfredResult.workers) {
              if (alfredResult.workers.orchestratorPid) alfredKnownPids.add(alfredResult.workers.orchestratorPid);
              for (const w of alfredResult.workers.workers) {
                if (w.pid) alfredKnownPids.add(w.pid);
              }
            }

            // Don't consider OpenClaw processes as orphans
            const isOpenClawProcess = p.cmdline.includes('openclaw') || p.cmdline.includes('clawmetry');

            return !alfredKnownPids.has(p.pid) && !isOpenClawProcess && p.pid !== process.pid && p.pid !== process.ppid;
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
      } catch (error) {
        res.status(500).json({ error: 'Failed to audit processes' });
      }
    });

    // Fallback to serve index.html for SPA routing
    this.app.get('*', (req, res) => {
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

  private setupTraceWatcher() {
    this.watcher.on('trace-added', (trace) => {
      this.stats.processTrace(trace);
      this.broadcast({
        type: 'trace-added',
        data: serializeTrace(trace),
      });
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
