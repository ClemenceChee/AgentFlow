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
        const traces = this.watcher.getAllTraces();
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
        res.json(trace);
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

        const result = auditProcesses(processConfig);
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
            traces: this.watcher.getAllTraces(),
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
        data: trace,
      });
    });

    this.watcher.on('trace-updated', (trace) => {
      this.stats.processTrace(trace);
      this.broadcast({
        type: 'trace-updated',
        data: trace,
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
