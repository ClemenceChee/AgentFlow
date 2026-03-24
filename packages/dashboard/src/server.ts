import { execFileSync, execSync } from 'node:child_process';
import * as fs from 'node:fs';
import { createServer } from 'node:http';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ExecutionGraph, KnowledgeStore, ProcessAuditResult } from 'agentflow-core';
import {
  auditProcesses,
  createExecutionEvent,
  createKnowledgeStore,
  discoverAllProcessConfigs,
  discoverProcess,
  findVariants,
  getBottlenecks,
  loadGraph,
  toReceipt,
} from 'agentflow-core';
import chokidar from 'chokidar';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { WebSocketServer } from 'ws';
import {
  type DashboardUserConfig,
  getDiscoveryPaths,
  getProcessPreference,
  getSystemdServices,
  loadConfig,
} from './config.js';
import './adapters/index.js'; // Register all adapters
import { parseOtlpPayload } from './adapters/otel.js';
import { deduplicateAgents, groupAgents } from './agent-clustering.js';
import { AgentStats } from './stats.js';
import { TraceWatcher, type WatchedTrace } from './watcher.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Sanitize a user-supplied path segment to prevent path traversal.
 * Strips directory separators and traversal sequences, keeping only the basename.
 */
function safePath(segment: string): string {
  return path.basename(segment.replace(/\.\./g, ''));
}

export interface DashboardConfig {
  port: number;
  tracesDir: string;
  host?: string;
  enableCors?: boolean;
  dataDirs?: string[];
  /** Enable OTLP trace collector at POST /v1/traces. Default: true */
  enableCollector?: boolean;
  /** Auth token for OTLP collector. If set, requests must include Authorization: Bearer <token> */
  collectorAuthToken?: string;
  /** Path to Soma vault directory. Enables Intelligence tab in dashboard. */
  somaVault?: string;
  /** Explicit path to agentflow.config.json */
  configPath?: string;
}

import { startDashboard } from './cli.js';

/** Convert a WatchedTrace for JSON serialization (Map → Object). */
/** Parse YAML frontmatter from a vault markdown file into a plain object. */
function parseVaultFrontmatter(content: string): Record<string, unknown> | null {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) return null;
  const fm: Record<string, unknown> = {};
  const lines = fmMatch[1]!.split('\n');
  let currentKey = '';
  let collectingList: string[] | null = null;

  for (const line of lines) {
    // YAML list item (- value)
    if (line.match(/^\s*-\s/) && currentKey) {
      if (!collectingList) collectingList = [];
      const val = line
        .replace(/^\s*-\s*/, '')
        .trim()
        .replace(/^["']|["']$/g, '');
      collectingList.push(val);
      continue;
    }

    // Flush any collected list
    if (collectingList && currentKey) {
      fm[currentKey] = collectingList;
      collectingList = null;
    }

    const colonIdx = line.indexOf(':');
    if (colonIdx === -1 || line.startsWith(' ')) continue;

    currentKey = line.slice(0, colonIdx).trim();
    let val: string = line.slice(colonIdx + 1).trim();

    if (val === '') continue; // Key with no inline value — next lines may be list items

    // Inline JSON array: ["a", "b"]
    if (val.startsWith('[') && val.endsWith(']')) {
      try {
        fm[currentKey] = JSON.parse(val);
      } catch {
        fm[currentKey] = val;
      }
      currentKey = '';
      continue;
    }

    // Strip quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }

    if (val === 'true') fm[currentKey] = true;
    else if (val === 'false') fm[currentKey] = false;
    else if (/^\d+(\.\d+)?$/.test(val)) fm[currentKey] = Number(val);
    else fm[currentKey] = val;
    currentKey = '';
  }

  // Flush final list
  if (collectingList && currentKey) {
    fm[currentKey] = collectingList;
  }

  // Ensure tags and related are always arrays
  for (const key of ['tags', 'related', 'evidence', 'evidence_links', 'sourceIds']) {
    if (fm[key] && !Array.isArray(fm[key])) {
      const str = String(fm[key]);
      if (str.startsWith('[')) {
        try {
          fm[key] = JSON.parse(str);
        } catch {
          fm[key] = [str];
        }
      } else {
        fm[key] = [str];
      }
    }
    if (!fm[key]) fm[key] = [];
  }

  return fm;
}

function serializeTrace(trace: WatchedTrace): Record<string, unknown> {
  if (!trace) return trace;
  const obj: Record<string, unknown> = { ...trace };
  if (trace.nodes instanceof Map) {
    const nodesObj: Record<string, unknown> = {};
    for (const [key, value] of trace.nodes) {
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

  private userConfig: DashboardUserConfig;
  private configPath: string | null;

  constructor(private config: DashboardConfig) {
    // Load user config
    const { config: userCfg, configPath: cfgPath } = loadConfig(config.configPath);
    this.userConfig = userCfg;
    this.configPath = cfgPath;

    // Merge extra dirs from saved dashboard config (persisted via Settings panel)
    const home = process.env.HOME ?? process.env.USERPROFILE ?? '/tmp';
    const dashConfigPath = path.join(home, '.agentflow/dashboard-config.json');
    if (!config.dataDirs) config.dataDirs = [];
    try {
      if (fs.existsSync(dashConfigPath)) {
        const saved = JSON.parse(fs.readFileSync(dashConfigPath, 'utf-8'));
        const extraDirs: string[] = saved.extraDirs ?? [];
        for (const d of extraDirs) {
          if (!config.dataDirs.includes(d)) config.dataDirs.push(d);
        }
      }
    } catch {
      /* ignore corrupt config, use CLI args only */
    }

    // Auto-discover directories from user config
    for (const p of getDiscoveryPaths(this.userConfig)) {
      if (fs.existsSync(p) && !config.dataDirs.includes(p)) {
        config.dataDirs.push(p);
      }
    }

    this.watcher = new TraceWatcher({
      tracesDir: config.tracesDir,
      dataDirs: config.dataDirs,
      userConfig: this.userConfig,
    });
    this.stats = new AgentStats();
    this.knowledgeStore = createKnowledgeStore({
      baseDir: path.join(config.tracesDir, '..', '.agentflow', 'knowledge'),
    });
    this.setupExpress();
    this.setupWebSocket();
    this.setupTraceWatcher();
    this.setupSomaReportWatcher();

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
    // Rate limit API endpoints to prevent abuse
    this.app.use(
      '/api/',
      rateLimit({
        windowMs: 60 * 1000, // 1 minute
        max: 300, // 300 requests per minute per IP
        standardHeaders: true,
        legacyHeaders: false,
      }),
    );

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

    // Build React client if stale or missing
    const pkgDir = path.join(__dirname, '..');
    const clientDir = path.join(pkgDir, 'dist/client');
    const clientIndex = path.join(clientDir, 'index.html');
    const srcDir = path.join(pkgDir, 'src/client');
    const needsBuild =
      !fs.existsSync(clientIndex) ||
      (fs.existsSync(srcDir) && this.isClientStale(srcDir, clientDir));
    if (needsBuild) {
      try {
        console.log('Building dashboard client...');
        execSync('npm run build:client', { cwd: pkgDir, stdio: 'inherit', timeout: 30_000 });
      } catch (err) {
        console.warn('Client build failed — dashboard UI may be stale:', (err as Error).message);
      }
    }

    // Serve React dashboard
    if (fs.existsSync(clientDir)) {
      this.app.use(express.static(clientDir));
    }

    // API endpoints
    this.app.get('/api/traces', (req, res) => {
      try {
        const limit = Math.min(Math.max(parseInt(req.query.limit as string, 10) || 50, 1), 200);
        const cursor = req.query.cursor ? parseFloat(req.query.cursor as string) : undefined;

        let allTraces = this.watcher.getAllTraces(); // already sorted by lastModified desc
        if (cursor) {
          allTraces = allTraces.filter((t) => (t.lastModified || t.startTime) < cursor);
        }

        const page = allTraces.slice(0, limit);
        const serialized = page.map(serializeTrace);
        const lastTrace = page[page.length - 1];
        const nextCursor =
          page.length === limit && lastTrace ? lastTrace.lastModified || lastTrace.startTime : null;

        res.json({ traces: serialized, nextCursor });
      } catch (_error) {
        res.status(500).json({ error: 'Failed to load traces' });
      }
    });

    this.app.get('/api/traces/:filename', (req, res) => {
      try {
        const agentId = typeof req.query.agent === 'string' ? req.query.agent : undefined;
        const trace = this.watcher.getTrace(req.params.filename, agentId);
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
          events: (trace as WatchedTrace).sessionEvents || [],
          tokenUsage: (trace as WatchedTrace).tokenUsage || null,
          sourceType: (trace as WatchedTrace).sourceType || 'trace',
        });
      } catch (_error) {
        res.status(500).json({ error: 'Failed to load trace events' });
      }
    });

    // Run receipt endpoint — builds receipt from trace graph
    this.app.get('/api/traces/:filename/receipt', (req, res) => {
      try {
        const trace = this.watcher.getTrace(req.params.filename);
        if (!trace) {
          return res.status(404).json({ error: 'Trace not found' });
        }
        const serialized = serializeTrace(trace);
        const graph = loadGraph(serialized);
        const receipt = toReceipt(graph);
        res.json(receipt);
      } catch (_error) {
        res.status(500).json({ error: 'Failed to generate receipt' });
      }
    });

    this.app.get('/api/agents', (req, res) => {
      try {
        const raw = this.stats.getAgentsList();

        // Enrich with display names from trace data
        for (const agent of raw) {
          if (!agent.displayName) {
            // Find the most recent trace for this agent and use its name
            const traces = this.watcher.getTracesByAgent(agent.agentId);
            if (traces.length > 0) {
              const latest = traces[traces.length - 1];
              const name = latest?.name;
              if (
                name &&
                name !== 'default' &&
                name !== agent.agentId &&
                !name.startsWith('pipeline:') &&
                name.length < 40
              ) {
                agent.displayName = name;
              }
            }
            if (!agent.displayName) agent.displayName = agent.agentId;
          }
        }

        // Backward-compatible flat mode
        if (req.query.flat === 'true') {
          return res.json(raw);
        }

        // Deduplicate and group
        const deduped = deduplicateAgents(raw);
        const grouped = groupAgents(deduped);
        res.json(grouped);
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
              (a: Record<string, unknown>, b: Record<string, unknown>) =>
                ((a.startTime as number) || 0) - ((b.startTime as number) || 0),
            );
            for (const node of sorted as Record<string, unknown>[]) {
              activities.push({
                id: node.id as string,
                name: (node.name || node.type || node.id) as string,
                type: (node.type || 'unknown') as string,
                status: (node.status || 'completed') as string,
                startTime: (node.startTime as number) || t.startTime,
                endTime: (node.endTime as number) || (node.startTime as number) || t.startTime,
                parentId: node.parentId as string | undefined,
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

    // Variant analysis endpoint — supports ?by=model for model-aware variants
    this.app.get('/api/agents/:agentId/variants', async (req, res) => {
      try {
        const agentId = req.params.agentId;
        const byModel = req.query.by === 'model';
        const graphs = this.getGraphTraces(agentId);
        if (graphs.length === 0) {
          return res.json({ agentId, totalTraces: 0, variants: [], modelVariants: [] });
        }
        const variants = findVariants(graphs).map((v) => ({
          pathSignature: v.pathSignature,
          count: v.count,
          percentage: v.percentage,
        }));

        // Model-aware variants (SOMA premium)
        let modelVariants: typeof variants = [];
        if (byModel) {
          try {
            const { findVariantsWithModel } = await import(
              /* webpackIgnore: true */ 'soma/ops-intel'
            );
            modelVariants = findVariantsWithModel(graphs, { includeModel: true }).map(
              (v: { pathSignature: string; count: number; percentage: number }) => ({
                pathSignature: v.pathSignature,
                count: v.count,
                percentage: v.percentage,
              }),
            );
          } catch {
            // SOMA not available — return empty model variants
          }
        }

        res.json({ agentId, totalTraces: graphs.length, variants, modelVariants });
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

    // Agent health briefing — synthesizes all SOMA intelligence for an agent
    this.app.get('/api/agents/:agentId/health-briefing', async (req, res) => {
      const somaVault = this.config.somaVault;
      if (!somaVault) return res.status(404).json({ error: 'Soma vault not configured' });
      try {
        const agentId = req.params.agentId;

        // Read agent entity (sanitize to prevent path traversal)
        const agentFile = path.join(
          somaVault,
          'agent',
          `${safePath(agentId.replace(/:/g, '-'))}.md`,
        );
        let agentData: Record<string, unknown> = {};
        if (fs.existsSync(agentFile)) {
          agentData = parseVaultFrontmatter(fs.readFileSync(agentFile, 'utf-8')) ?? {};
        }

        const totalExecutions = Number(agentData.totalExecutions ?? 0);
        const failureRate = Number(agentData.failureRate ?? 0);
        const failureCount = Number(agentData.failureCount ?? 0);
        const status = failureRate > 0.5 ? 'critical' : failureRate > 0.1 ? 'degraded' : 'healthy';

        // Gather related intelligence from vault
        const knowledgeTypes = ['decision', 'insight', 'constraint', 'contradiction', 'policy'];
        const intelligence: { type: string; name: string; claim: string; confidence?: string }[] =
          [];

        for (const kt of knowledgeTypes) {
          const dir = path.join(somaVault, kt);
          if (!fs.existsSync(dir)) continue;
          for (const f of fs.readdirSync(dir)) {
            if (!f.endsWith('.md')) continue;
            try {
              const content = fs.readFileSync(path.join(dir, f), 'utf-8');
              if (!content.includes(agentId) && !content.includes(agentId.replace(/:/g, '-')))
                continue;
              const parsed = parseVaultFrontmatter(content);
              if (!parsed) continue;
              intelligence.push({
                type: String(parsed.type ?? kt),
                name: String(parsed.name ?? f.replace('.md', '')),
                claim: String(parsed.claim ?? '').slice(0, 150),
                confidence: parsed.confidence as string | undefined,
              });
            } catch {
              /* skip */
            }
          }
        }

        // Peer comparison
        const agentDir = path.join(somaVault, 'agent');
        const peers: { name: string; successRate: number; runs: number }[] = [];
        if (fs.existsSync(agentDir)) {
          for (const f of fs.readdirSync(agentDir)) {
            if (!f.endsWith('.md')) continue;
            const p = parseVaultFrontmatter(fs.readFileSync(path.join(agentDir, f), 'utf-8'));
            if (!p) continue;
            const runs = Number(p.totalExecutions ?? 0);
            if (runs > 0) {
              peers.push({
                name: String(p.name ?? p.agentId ?? f.replace('.md', '')),
                successRate: 1 - Number(p.failureRate ?? 0),
                runs,
              });
            }
          }
        }
        peers.sort((a, b) => b.successRate - a.successRate);

        // Read drift data
        let drift = null;
        try {
          const historyPath = path.join(somaVault, '..', 'conformance-history.json');
          if (fs.existsSync(historyPath)) {
            const history = JSON.parse(fs.readFileSync(historyPath, 'utf-8'));
            const agentHistory = history.filter((e: { agentId: string }) => e.agentId === agentId);
            if (agentHistory.length >= 10) {
              try {
                const { detectDrift: dd } = await import(
                  /* webpackIgnore: true */ 'soma/ops-intel'
                );
                drift = dd(agentHistory);
              } catch {
                drift = { status: 'stable', dataPoints: agentHistory.length };
              }
            } else {
              drift = { status: 'insufficient_data', dataPoints: agentHistory.length };
            }
          }
        } catch {
          /* no drift data */
        }

        res.json({
          agentId,
          status,
          totalExecutions,
          failureRate,
          failureCount,
          intelligence: {
            total: intelligence.length,
            byType: Object.fromEntries(
              knowledgeTypes.map((t) => [t, intelligence.filter((i) => i.type === t)]),
            ),
          },
          peers,
          drift,
        });
      } catch (error) {
        console.error('Health briefing error:', error);
        res.status(500).json({ error: 'Failed to generate briefing' });
      }
    });

    // Agent decisions endpoint — returns NormalizedDecision[] for a trace
    this.app.get('/api/traces/:filename/decisions', (req, res) => {
      try {
        const trace = this.watcher.getTrace(req.params.filename);
        if (!trace) return res.status(404).json({ error: 'Trace not found' });

        const serialized = serializeTrace(trace);
        const sessionEvents = (trace as Record<string, unknown>).sessionEvents as unknown[];

        let decisions: unknown[] = [];

        if (sessionEvents && sessionEvents.length > 0) {
          // Session trace — extract from session events
          try {
            import('soma/ops-intel')
              .then(({ extractDecisionsFromSession, computePatternSignature }) => {
                decisions = extractDecisionsFromSession(sessionEvents as Record<string, unknown>[]);
                res.json({
                  decisions,
                  pattern: computePatternSignature(
                    decisions as { action: string; index: number; outcome: string }[],
                  ),
                });
              })
              .catch(() => {
                res.json({ decisions: [], pattern: '' });
              });
            return;
          } catch {
            /* fallback */
          }
        }

        // JSON trace — extract from nodes
        const graph = loadGraph(serialized);
        const nodes = [...graph.nodes.values()];
        const toolNodes = nodes
          .filter((n) => n.type === 'tool' || n.type === 'action')
          .sort((a, b) => (a.startTime ?? 0) - (b.startTime ?? 0));

        decisions = toolNodes.map((n, i) => ({
          action: n.name,
          tool: n.name,
          outcome: n.status === 'failed' ? 'failed' : 'ok',
          durationMs: n.endTime != null ? n.endTime - n.startTime : undefined,
          index: i,
        }));

        const pattern = decisions
          .map((d: unknown) => (d as { action: string }).action)
          .join('\u2192');
        res.json({ decisions, pattern });
      } catch {
        res.status(500).json({ error: 'Failed to extract decisions' });
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

    // Combined process model endpoint (process graph + variants + bottlenecks)
    this.app.get('/api/process-model/:agentId', (req, res) => {
      try {
        const agentId = req.params.agentId;
        const allTraces = this.watcher.getTracesByAgent(agentId);
        if (allTraces.length === 0) {
          return res.status(404).json({ error: 'No traces for agent' });
        }

        // Build process model from all traces (session-based or graph-based)
        const transMap = new Map<string, number>();
        const nodeTypeMap = new Map<string, string>();
        const variantMap = new Map<string, number>();
        const durationMap = new Map<string, number[]>();

        for (const trace of allTraces) {
          const serialized = serializeTrace(trace);
          const nodes = serialized.nodes;
          if (!nodes || typeof nodes !== 'object') continue;

          const nodeArr = Object.values(nodes) as {
            name?: string;
            type?: string;
            startTime?: number;
            endTime?: number;
            status?: string;
          }[];
          const sorted = nodeArr
            .filter((n) => n.name && typeof n.startTime === 'number' && n.startTime > 0)
            .sort((a, b) => (a.startTime ?? 0) - (b.startTime ?? 0));

          // Transitions (directly-follows)
          for (let i = 0; i < sorted.length - 1; i++) {
            const from = sorted[i]?.name ?? '';
            const to = sorted[i + 1]?.name ?? '';
            const key = `${from}|||${to}`;
            transMap.set(key, (transMap.get(key) ?? 0) + 1);
          }

          // Node types
          for (const n of sorted) {
            if (n.name && n.type) nodeTypeMap.set(n.name, n.type);
          }

          // Variant (path signature)
          const sig = sorted.map((n) => n.name).join('\u2192');
          if (sig) variantMap.set(sig, (variantMap.get(sig) ?? 0) + 1);

          // Durations for bottleneck detection
          for (const n of sorted) {
            if (n.name && n.endTime && n.startTime) {
              const dur = n.endTime - n.startTime;
              if (dur > 0) {
                const arr = durationMap.get(n.name) ?? [];
                arr.push(dur);
                durationMap.set(n.name, arr);
              }
            }
          }
        }

        // Build model
        const model = {
          transitions: [...transMap.entries()].map(([key, count]) => {
            const [from, to] = key.split('|||');
            return { from: from ?? '', to: to ?? '', count };
          }),
          nodeTypes: Object.fromEntries(nodeTypeMap),
        };

        // Build variants (top 20)
        const totalTraces = allTraces.length;
        const variants = [...variantMap.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 20)
          .map(([sig, count]) => ({
            pathSignature: sig,
            count,
            percentage: totalTraces > 0 ? (count / totalTraces) * 100 : 0,
          }));

        // Build bottlenecks (top 15 by p95)
        const bottlenecks = [...durationMap.entries()]
          .map(([name, durations]) => {
            const sorted = durations.sort((a, b) => a - b);
            const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
            return { nodeName: name, nodeType: nodeTypeMap.get(name) ?? 'unknown', p95 };
          })
          .sort((a, b) => b.p95 - a.p95)
          .slice(0, 15);

        // Also try core API for graph-based traces
        const graphs = this.getGraphTraces(agentId);
        if (graphs.length > 0) {
          // Enrich with core results if available
          try {
            const coreBottlenecks = getBottlenecks(graphs).map((b) => ({
              nodeName: b.nodeName,
              nodeType: b.nodeType,
              p95:
                b.durations.sort((a: number, b2: number) => a - b2)[
                  Math.floor(b.durations.length * 0.95)
                ] ?? 0,
            }));
            if (coreBottlenecks.length > bottlenecks.length) {
              bottlenecks.length = 0;
              bottlenecks.push(...coreBottlenecks);
            }
          } catch {
            /* use fallback */
          }
        }

        res.json({ model, variants, bottlenecks });
      } catch (error) {
        console.error('Process model error:', error);
        res.status(500).json({ error: 'Failed to compute process model' });
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

    // Soma tier detection — determines free/paid feature gating
    this.app.get('/api/soma/tier', (_req, res) => {
      const somaVault = this.config.somaVault;
      if (!somaVault) {
        return res.json({ tier: 'teaser', somaVault: false, governanceAvailable: false });
      }
      try {
        const reportPath = path.join(somaVault, '..', 'soma-report.json');
        if (!fs.existsSync(reportPath)) {
          return res.json({ tier: 'free', somaVault: true, governanceAvailable: false });
        }
        const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
        const hasGovernance = report.governance && typeof report.governance.pending === 'number';
        return res.json({
          tier: hasGovernance ? 'pro' : 'free',
          somaVault: true,
          governanceAvailable: !!hasGovernance,
        });
      } catch {
        return res.json({ tier: 'free', somaVault: true, governanceAvailable: false });
      }
    });

    // Soma Intelligence API
    this.app.get('/api/soma/report', (_req, res) => {
      const somaVault = this.config.somaVault;
      if (!somaVault) {
        return res.json({ available: false, teaser: true });
      }
      try {
        const reportPath = path.join(somaVault, '..', 'soma-report.json');
        if (!fs.existsSync(reportPath)) {
          return res.json({
            available: false,
            teaser: false,
            message: 'No report file yet. Run soma watch.',
          });
        }
        const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
        res.json(report);
      } catch (error) {
        console.error('Soma report error:', error);
        res.json({ available: false, teaser: false, message: 'Failed to read report' });
      }
    });

    // Soma Governance API
    this.app.get('/api/soma/governance', (_req, res) => {
      const somaVault = this.config.somaVault;
      if (!somaVault) {
        return res.json({ available: false });
      }
      try {
        // Read governance data from soma-report.json (which now includes layer/governance fields)
        const reportPath = path.join(somaVault, '..', 'soma-report.json');
        if (!fs.existsSync(reportPath)) {
          return res.json({ available: false, message: 'No report file. Run soma report.' });
        }
        const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
        res.json({
          available: true,
          layers: report.layers ?? { archive: 0, working: 0, emerging: 0, canon: 0 },
          governance: report.governance ?? { pending: 0, promoted: 0, rejected: 0 },
          insights: (report.insights ?? []).filter(
            (i: Record<string, unknown>) =>
              i.layer === 'emerging' && i.proposal_status === 'pending',
          ),
          canon: (report.insights ?? []).filter(
            (i: Record<string, unknown>) => i.layer === 'canon',
          ),
          generatedAt: report.generatedAt,
        });
      } catch (error) {
        console.error('Soma governance error:', error);
        res.status(500).json({ available: false, message: 'Failed to read governance data' });
      }
    });

    // Validate string contains only safe identifier characters
    const isValidId = (s: string) => /^[a-zA-Z0-9_\-.:]+$/.test(s);

    this.app.post('/api/soma/governance/promote', (req, res) => {
      const somaVault = this.config.somaVault;
      if (!somaVault) return res.status(400).json({ error: 'Soma vault not configured' });
      const { entryId } = req.body ?? {};
      if (!entryId || !isValidId(String(entryId)))
        return res.status(400).json({ error: 'Invalid entryId' });
      try {
        const result = execFileSync(
          'npx',
          ['soma', 'governance', 'promote', String(entryId), '--vault', somaVault],
          {
            encoding: 'utf-8',
            timeout: 10000,
          },
        );
        res.json({ success: true, message: result.trim() });
      } catch (error: unknown) {
        res.status(400).json({
          error: (error as { stderr?: string }).stderr?.trim() || (error as Error).message,
        });
      }
    });

    this.app.post('/api/soma/governance/reject', (req, res) => {
      const somaVault = this.config.somaVault;
      if (!somaVault) return res.status(400).json({ error: 'Soma vault not configured' });
      const { entryId, reason } = req.body ?? {};
      if (!entryId || !isValidId(String(entryId)))
        return res.status(400).json({ error: 'Invalid entryId' });
      if (!reason || typeof reason !== 'string')
        return res.status(400).json({ error: 'reason required' });
      try {
        const result = execFileSync(
          'npx',
          [
            'soma',
            'governance',
            'reject',
            String(entryId),
            String(reason).slice(0, 500),
            '--vault',
            somaVault,
          ],
          {
            encoding: 'utf-8',
            timeout: 10000,
          },
        );
        res.json({ success: true, message: result.trim() });
      } catch (error: unknown) {
        res.status(400).json({
          error: (error as { stderr?: string }).stderr?.trim() || (error as Error).message,
        });
      }
    });

    this.app.get('/api/soma/governance/evidence/:id', (req, res) => {
      const somaVault = this.config.somaVault;
      if (!somaVault) return res.status(400).json({ error: 'Soma vault not configured' });
      if (!isValidId(String(req.params.id))) return res.status(400).json({ error: 'Invalid id' });
      try {
        const result = execFileSync(
          'npx',
          ['soma', 'governance', 'show', String(req.params.id), '--vault', somaVault],
          {
            encoding: 'utf-8',
            timeout: 10000,
          },
        );
        res.json({ available: true, output: result.trim() });
      } catch (error: unknown) {
        res.status(404).json({
          error: (error as { stderr?: string }).stderr?.trim() || (error as Error).message,
        });
      }
    });

    // Soma Policy CRUD
    this.app.get('/api/soma/policies', (_req, res) => {
      const somaVault = this.config.somaVault;
      if (!somaVault) return res.json({ policies: [] });
      try {
        const reportPath = path.join(somaVault, '..', 'soma-report.json');
        if (!fs.existsSync(reportPath)) return res.json({ policies: [] });
        const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
        res.json({ policies: report.policies ?? [] });
      } catch {
        res.json({ policies: [] });
      }
    });

    this.app.post('/api/soma/policies', express.json(), (req, res) => {
      const somaVault = this.config.somaVault;
      if (!somaVault) return res.status(400).json({ error: 'Soma vault not configured' });
      const { name, enforcement, scope, conditions } = req.body ?? {};
      if (!name || !isValidId(String(name)))
        return res.status(400).json({ error: 'Invalid policy name' });
      const enf = String(enforcement || 'warn');
      if (!isValidId(enf)) return res.status(400).json({ error: 'Invalid enforcement value' });
      try {
        const args = [
          'soma',
          'policy',
          'create',
          String(name),
          '--enforcement',
          enf,
          '--vault',
          somaVault,
        ];
        if (scope) args.push('--scope', String(scope).slice(0, 500));
        if (conditions) args.push('--conditions', String(conditions).slice(0, 500));
        const result = execFileSync('npx', args, { encoding: 'utf-8', timeout: 10000 });
        res.json({ success: true, message: result.trim() });
      } catch (error: unknown) {
        res.status(400).json({
          error: (error as { stderr?: string }).stderr?.trim() || (error as Error).message,
        });
      }
    });

    this.app.delete('/api/soma/policies/:name', (req, res) => {
      const somaVault = this.config.somaVault;
      if (!somaVault) return res.status(400).json({ error: 'Soma vault not configured' });
      if (!isValidId(String(req.params.name)))
        return res.status(400).json({ error: 'Invalid policy name' });
      try {
        const result = execFileSync(
          'npx',
          ['soma', 'policy', 'delete', String(req.params.name), '--vault', somaVault],
          {
            encoding: 'utf-8',
            timeout: 10000,
          },
        );
        res.json({ success: true, message: result.trim() });
      } catch (error: unknown) {
        res.status(400).json({
          error: (error as { stderr?: string }).stderr?.trim() || (error as Error).message,
        });
      }
    });

    // Soma Vault Entity browsing
    this.app.get('/api/soma/vault/entities', (req, res) => {
      const somaVault = this.config.somaVault;
      if (!somaVault) return res.json({ entities: [], total: 0 });
      try {
        // Read entities directly from vault directory (markdown files with YAML frontmatter)
        const entityTypes = [
          'agent',
          'decision',
          'insight',
          'constraint',
          'contradiction',
          'policy',
          'archetype',
        ];
        let entities: Record<string, unknown>[] = [];

        for (const entityType of entityTypes) {
          const dir = path.join(somaVault, entityType);
          if (!fs.existsSync(dir)) continue;
          for (const file of fs.readdirSync(dir)) {
            if (!file.endsWith('.md')) continue;
            try {
              const content = fs.readFileSync(path.join(dir, file), 'utf-8');
              const parsed = parseVaultFrontmatter(content);
              if (!parsed) continue;
              const body = content
                .slice(content.indexOf('---', 4) + 3)
                .trim()
                .slice(0, 500);
              entities.push({
                ...parsed,
                type: parsed.type || entityType,
                id: parsed.id || file.replace('.md', ''),
                name: parsed.name || file.replace('.md', ''),
                body,
              });
            } catch {
              /* skip unparseable files */
            }
          }
        }

        const {
          type,
          layer,
          q,
          limit: limitStr,
          offset: offsetStr,
        } = req.query as Record<string, string>;
        if (type) entities = entities.filter((e) => e.type === type);
        if (layer) entities = entities.filter((e) => e.layer === layer);
        if (q) {
          const lq = q.toLowerCase();
          entities = entities.filter(
            (e) =>
              (e.name || e.title || '').toLowerCase().includes(lq) ||
              (e.claim || e.body || '').toLowerCase().includes(lq),
          );
        }

        const total = entities.length;
        const offset = parseInt(offsetStr || '0', 10);
        const limit = Math.min(parseInt(limitStr || '50', 10), 200);
        entities = entities.slice(offset, offset + limit);

        res.json({ entities, total });
      } catch (error) {
        console.error('Vault entities error:', error);
        res.json({ entities: [], total: 0 });
      }
    });

    this.app.get('/api/soma/vault/entities/:type/:id', (req, res) => {
      const somaVault = this.config.somaVault;
      if (!somaVault) return res.status(404).json({ error: 'Soma vault not configured' });
      try {
        const type = safePath(req.params.type);
        const id = safePath(req.params.id);
        const filePath = path.join(somaVault, type, `${id}.md`);
        if (!path.resolve(filePath).startsWith(path.resolve(somaVault))) {
          return res.status(400).json({ error: 'Invalid path' });
        }
        if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Entity not found' });

        const content = fs.readFileSync(filePath, 'utf-8');
        const fm = parseVaultFrontmatter(content);
        if (!fm) return res.status(404).json({ error: 'Entity not found' });
        const body = content.slice(content.indexOf('---', 4) + 3).trim();

        // For agent entities, gather related intelligence from the vault
        const agentKnowledge: Record<string, unknown>[] = [];
        if (type === 'agent') {
          const agentName = fm.name || fm.agentId || id;
          const knowledgeTypes = ['decision', 'insight', 'constraint', 'contradiction', 'policy'];
          for (const kt of knowledgeTypes) {
            const ktDir = path.join(somaVault, kt);
            if (!fs.existsSync(ktDir)) continue;
            for (const f of fs.readdirSync(ktDir)) {
              if (!f.endsWith('.md')) continue;
              try {
                const c = fs.readFileSync(path.join(ktDir, f), 'utf-8');
                // Quick check: does this file mention the agent?
                if (!c.includes(String(agentName))) continue;
                const parsed = parseVaultFrontmatter(c);
                if (!parsed) continue;
                agentKnowledge.push({
                  type: parsed.type || kt,
                  id: parsed.id || f.replace('.md', ''),
                  name: parsed.name || f.replace('.md', ''),
                  claim: parsed.claim || '',
                  confidence: parsed.confidence || '',
                  layer: parsed.layer || '',
                });
              } catch {
                /* skip */
              }
            }
          }
        }

        res.json({
          ...fm,
          type,
          id,
          name: fm.name || id,
          body:
            type === 'agent' && !body
              ? `Agent with ${fm.totalExecutions ?? 0} executions, ${((1 - Number(fm.failureRate || 0)) * 100).toFixed(1)}% success rate.`
              : body,
          knowledge: agentKnowledge,
        });
      } catch {
        res.status(404).json({ error: 'Entity not found' });
      }
    });

    // AICP: Preflight authorization endpoint
    this.app.get('/api/aicp/preflight', async (req, res) => {
      const agentId = req.query.agentId as string;
      if (!agentId) {
        return res.status(400).json({ error: 'agentId query parameter required' });
      }
      const somaVault = this.config.somaVault;
      if (!somaVault) {
        return res.json({
          proceed: true,
          warnings: [],
          recommendations: [],
          available: false,
          _meta: { durationMs: 0 },
        });
      }
      try {
        const { evaluatePreflight } = await import(/* webpackIgnore: true */ 'soma');
        const { createVault } = await import(/* webpackIgnore: true */ 'soma');
        const vault = createVault({ baseDir: somaVault });
        const result = evaluatePreflight(vault, safePath(agentId));
        res.json(result);
      } catch {
        res.json({
          proceed: true,
          warnings: [],
          recommendations: [],
          available: false,
          _meta: { durationMs: 0 },
        });
      }
    });

    // Ops-Intel: Efficiency (premium — calls SOMA getEfficiency with fallback)
    this.app.get('/api/soma/efficiency', async (_req, res) => {
      try {
        // Try SOMA ops-intel library first — collect all graph traces across agents
        const allTraces = this.watcher.getAllTraces().map(serializeTrace);
        const graphs: ExecutionGraph[] = [];
        for (const t of allTraces) {
          try {
            if (t.sourceType === 'session' || t.sourceType === 'log') continue;
            if (!t.rootNodeId && !t.rootId) continue;
            const nodes = t.nodes;
            if (!nodes || (typeof nodes === 'object' && Object.keys(nodes).length === 0)) continue;
            graphs.push(loadGraph(t));
          } catch {
            /* skip non-graph traces */
          }
        }
        try {
          const { getEfficiency } = await import(/* webpackIgnore: true */ 'soma/ops-intel');
          const report = getEfficiency(graphs);
          return res.json(report);
        } catch {
          // SOMA not available — fallback to inline computation from report
        }

        // Fallback: read from soma-report.json
        const somaVault = this.config.somaVault;
        if (!somaVault) return res.status(404).json({ error: 'Soma vault not configured' });
        const reportPath = path.join(somaVault, '..', 'soma-report.json');
        if (!fs.existsSync(reportPath)) {
          return res.status(404).json({ error: 'No SOMA report found' });
        }
        const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
        const agents = report.agents ?? [];
        const runs = agents.map((a: Record<string, unknown>) => ({
          graphId: a.name,
          agentId: a.name,
          totalTokenCost: (a.totalTokenCost as number) ?? 0,
          completedNodes: (a.totalRuns as number) ?? 0,
          costPerNode:
            ((a.totalTokenCost as number) ?? 0) / Math.max(1, (a.totalRuns as number) ?? 1),
        }));
        const costs = runs
          .map((r: { costPerNode: number }) => r.costPerNode)
          .filter((c: number) => c > 0)
          .sort((a: number, b: number) => a - b);
        const mean =
          costs.length > 0 ? costs.reduce((a: number, b: number) => a + b, 0) / costs.length : 0;
        const median = costs.length > 0 ? costs[Math.floor(costs.length / 2)] : 0;
        const p95 =
          costs.length > 0
            ? costs[Math.min(costs.length - 1, Math.ceil(costs.length * 0.95) - 1)]
            : 0;
        res.json({
          runs,
          aggregate: { mean, median, p95 },
          flags: [],
          nodeCosts: [],
          dataCoverage: agents.length > 0 ? 1 : 0,
        });
      } catch {
        res.status(500).json({ error: 'Failed to compute efficiency' });
      }
    });

    // Ops-Intel: Drift (premium — calls SOMA detectDrift with fallback)
    this.app.get('/api/soma/drift', async (req, res) => {
      const agentId = req.query.agentId as string;
      if (!agentId) return res.status(400).json({ error: 'agentId query parameter required' });
      try {
        const somaVault = this.config.somaVault;
        if (!somaVault) return res.status(404).json({ error: 'Soma vault not configured' });

        // Read conformance history
        const historyPath = path.join(somaVault, '..', 'conformance-history.json');
        let history: { agentId: string; timestamp: number; score: number; runId: string }[] = [];
        if (fs.existsSync(historyPath)) {
          history = JSON.parse(fs.readFileSync(historyPath, 'utf-8'));
        }

        const agentHistory = history.filter((e: { agentId: string }) => e.agentId === agentId);

        // Try SOMA ops-intel library
        try {
          const { detectDrift } = await import(/* webpackIgnore: true */ 'soma/ops-intel');
          const driftReport = detectDrift(agentHistory);
          return res.json({ drift: driftReport, points: agentHistory });
        } catch {
          // SOMA not available — fallback to inline
        }

        // Fallback: inline regression
        const n = agentHistory.length;
        if (n < 10) {
          return res.json({
            drift: { status: 'insufficient_data', slope: 0, r2: 0, windowSize: n, dataPoints: n },
            points: agentHistory,
          });
        }
        let sumX = 0,
          sumY = 0,
          sumXY = 0,
          sumX2 = 0;
        for (let i = 0; i < n; i++) {
          const y = agentHistory[i]!.score;
          sumX += i;
          sumY += y;
          sumXY += i * y;
          sumX2 += i * i;
        }
        const denom = n * sumX2 - sumX * sumX;
        const slope = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0;
        const intercept = (sumY - slope * sumX) / n;
        const meanY = sumY / n;
        let ssRes = 0,
          ssTot = 0;
        for (let i = 0; i < n; i++) {
          const y = agentHistory[i]!.score;
          ssRes += (y - (intercept + slope * i)) ** 2;
          ssTot += (y - meanY) ** 2;
        }
        const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
        const status = r2 > 0.3 ? (slope < 0 ? 'degrading' : 'improving') : 'stable';
        res.json({
          drift: { status, slope, r2, windowSize: n, dataPoints: n },
          points: agentHistory,
        });
      } catch {
        res.status(404).json({ error: 'Drift detection not available' });
      }
    });

    // Cross-agent knowledge flow — insights with source_agents from 2+ agents
    this.app.get('/api/soma/cross-agent', (_req, res) => {
      const somaVault = this.config.somaVault;
      if (!somaVault) return res.json({ insights: [], pairs: [] });
      try {
        const insightDir = path.join(somaVault, 'insight');
        if (!fs.existsSync(insightDir)) return res.json({ insights: [], pairs: [] });

        const crossAgent: {
          name: string;
          claim: string;
          sourceAgents: string[];
          tags: string[];
        }[] = [];

        for (const file of fs.readdirSync(insightDir)) {
          if (!file.endsWith('.md')) continue;
          try {
            const content = fs.readFileSync(path.join(insightDir, file), 'utf-8');
            const parsed = parseVaultFrontmatter(content);
            if (!parsed) continue;
            const sa = parsed.source_agents as string[] | undefined;
            if (!sa || !Array.isArray(sa) || sa.length < 2) continue;

            crossAgent.push({
              name: String(parsed.name ?? file.replace('.md', '')),
              claim: String(parsed.claim ?? '').slice(0, 200),
              sourceAgents: sa,
              tags: (parsed.tags as string[]) ?? [],
            });
          } catch {
            /* skip */
          }
        }

        // Group by agent pair
        const pairMap = new Map<string, typeof crossAgent>();
        for (const insight of crossAgent) {
          const key = [...insight.sourceAgents].sort().join(' \u2194 ');
          if (!pairMap.has(key)) pairMap.set(key, []);
          pairMap.get(key)!.push(insight);
        }

        const pairs = [...pairMap.entries()].map(([agents, insights]) => ({
          agents,
          count: insights.length,
          insights: insights.slice(0, 5),
        }));

        res.json({ total: crossAgent.length, pairs });
      } catch {
        res.json({ insights: [], pairs: [] });
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

        // Discover all services (PID files + systemd units)
        let configs = discoverAllProcessConfigs(discoveryDirs);
        // Apply config-driven process preference (e.g. prefer soma over alfred)
        const pref = getProcessPreference(this.userConfig);
        if (pref) {
          const hasPreferred = configs.some((c) => c.processName === pref.prefer);
          if (hasPreferred) {
            configs = configs.filter((c) => c.processName !== pref.over);
          }
        }
        if (configs.length === 0) {
          return res.json(null);
        }

        // Audit each discovered service
        const services: { name: string; audit: ProcessAuditResult }[] = [];
        const allKnownPids = new Set<number>();

        for (const config of configs) {
          const audit = auditProcesses(config);
          services.push({ name: config.processName, audit });

          // Track known PIDs across all services
          if (audit.pidFile?.pid && !audit.pidFile.stale) allKnownPids.add(audit.pidFile.pid);
          if (audit.systemd?.mainPid) allKnownPids.add(audit.systemd.mainPid);
          if (audit.workers) {
            if (audit.workers.orchestratorPid) allKnownPids.add(audit.workers.orchestratorPid);
            for (const w of audit.workers.workers) {
              if (w.pid) allKnownPids.add(w.pid);
            }
          }
          for (const p of audit.osProcesses) allKnownPids.add(p.pid);
        }

        // Use first service with a PID file as the "primary" for backward compat
        const primary = services.find((s) => s.audit.pidFile) ?? services[0];

        // Merge all OS processes, deduplicate
        const allOsProcesses = services.flatMap((s) => s.audit.osProcesses);
        const uniqueProcesses = allOsProcesses.filter(
          (proc, index, arr) => arr.findIndex((p) => p.pid === proc.pid) === index,
        );

        // Global orphans: not tracked by ANY service
        const orphans = uniqueProcesses.filter(
          (p) => !allKnownPids.has(p.pid) && p.pid !== process.pid && p.pid !== process.ppid,
        );

        // Collect all problems
        const problems = services.flatMap((s) => s.audit.problems.map((p) => `[${s.name}] ${p}`));

        const result = {
          // Backward-compatible fields from primary service
          pidFile: primary?.audit.pidFile ?? null,
          systemd: primary?.audit.systemd ?? null,
          workers: primary?.audit.workers ?? null,
          osProcesses: uniqueProcesses,
          orphans,
          problems,
          // All discovered services with their individual audit results + metrics
          services: services.map((s) => {
            // Match OS process metrics to this service by PID
            const mainPid = s.audit.pidFile?.pid ?? s.audit.systemd?.mainPid;
            const osProc = mainPid ? uniqueProcesses.find((p) => p.pid === mainPid) : undefined;

            return {
              name: s.name,
              pidFile: s.audit.pidFile,
              systemd: s.audit.systemd,
              workers: s.audit.workers,
              problems: s.audit.problems,
              metrics: osProc
                ? { cpu: osProc.cpu, mem: osProc.mem, elapsed: osProc.elapsed }
                : undefined,
            };
          }),

          // Topology edges: parent-child relationships from process ppid
          topology: uniqueProcesses
            .map((p) => {
              try {
                const statusContent = fs.readFileSync(`/proc/${p.pid}/status`, 'utf8');
                const ppidMatch = statusContent.match(/^PPid:\s+(\d+)/m);
                const ppid = ppidMatch ? parseInt(ppidMatch[1] ?? '0', 10) : 0;
                if (ppid > 1 && allKnownPids.has(ppid)) {
                  return { source: ppid, target: p.pid };
                }
              } catch {
                // process may have exited
              }
              return null;
            })
            .filter(Boolean),
        };

        this.processHealthCache = { result, ts: now };
        res.json(result);
      } catch (_error) {
        res.status(500).json({ error: 'Failed to audit processes' });
      }
    });

    // Directory discovery endpoint
    this.app.get('/api/directories', (_req, res) => {
      try {
        // Read extra dirs from saved config
        const home = process.env.HOME ?? '/home/trader';
        const configPath = path.join(home, '.agentflow/dashboard-config.json');
        let extraDirs: string[] = [];
        try {
          if (fs.existsSync(configPath)) {
            const cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
            extraDirs = cfg.extraDirs ?? [];
          }
        } catch {
          /* fresh */
        }

        const watched = [
          ...new Set(
            [this.config.tracesDir, ...(this.config.dataDirs || []), ...extraDirs].map((w) =>
              path.resolve(w),
            ),
          ),
        ];

        // Discover from systemd (config-driven service names)
        const discovered: string[] = [];
        const svcNames = getSystemdServices(this.userConfig);
        if (svcNames.length > 0) {
          try {
            const raw = execFileSync(
              'systemctl',
              ['--user', 'show', '--property=ExecStart', '--no-pager', ...svcNames],
              {
                encoding: 'utf8',
                timeout: 5000,
              },
            );
            for (const line of raw.split('\n')) {
              const match = line.match(/path=([^\s;]+)/);
              if (match?.[1]) {
                const dir = path.dirname(match[1]);
                if (fs.existsSync(dir)) discovered.push(dir);
              }
            }
          } catch {
            /* ignore */
          }
        }

        // Check config-driven discovery paths + generic agentflow location
        const commonPaths = [
          ...getDiscoveryPaths(this.userConfig),
          path.join(home, '.agentflow/traces'),
        ];
        for (const p of commonPaths) {
          if (fs.existsSync(p) && !discovered.includes(p)) {
            discovered.push(p);
          }
        }

        // Suggested = discovered but not watched
        const watchedSet = new Set(watched.map((w) => path.resolve(w)));
        const suggested = discovered.filter((d) => !watchedSet.has(path.resolve(d)));

        res.json({ watched, discovered, suggested });
      } catch (error) {
        console.error('Directory discovery error:', error);
        res.status(500).json({ error: 'Failed to discover directories' });
      }
    });

    this.app.post('/api/directories', express.json(), (req, res) => {
      try {
        const { add, remove } = req.body as { add?: string; remove?: string };

        // Validate path: must be absolute, no traversal
        if (add) {
          const resolved = path.resolve(add);
          if (resolved !== add || add.includes('..')) {
            return res.status(400).json({ error: 'Invalid directory path' });
          }
          if (!fs.existsSync(resolved)) {
            return res.status(400).json({ error: `Directory does not exist: ${add}` });
          }
        }

        const configPath = path.join(
          process.env.HOME ?? '/home/trader',
          '.agentflow/dashboard-config.json',
        );

        let config: { extraDirs?: string[] } = {};
        try {
          if (fs.existsSync(configPath)) {
            config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
          }
        } catch {
          /* fresh config */
        }

        if (!config.extraDirs) config.extraDirs = [];

        if (add && !config.extraDirs.includes(add)) {
          config.extraDirs.push(add);
        }
        if (remove) {
          config.extraDirs = config.extraDirs.filter((d) => d !== remove);
        }

        fs.mkdirSync(path.dirname(configPath), { recursive: true });
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

        res.json({ ok: true, extraDirs: config.extraDirs });
      } catch (error) {
        console.error('Directory config error:', error);
        res.status(500).json({ error: 'Failed to update directory config' });
      }
    });

    // OTLP trace collector endpoint
    if (this.config.enableCollector !== false) {
      this.app.post('/v1/traces', express.json({ limit: '10mb' }), (req, res) => {
        try {
          // Auth check
          if (this.config.collectorAuthToken) {
            const auth = req.headers.authorization;
            if (!auth || auth !== `Bearer ${this.config.collectorAuthToken}`) {
              return res
                .status(401)
                .json({ error: 'Unauthorized — provide Authorization: Bearer <token>' });
            }
          }

          const traces = parseOtlpPayload(req.body);
          let ingested = 0;

          for (const trace of traces) {
            // Convert to WatchedTrace and store
            const nodes = new Map<string, Record<string, unknown>>();
            for (const [id, node] of Object.entries(trace.nodes)) {
              nodes.set(id, { ...node, state: {} });
            }

            const watched = {
              id: trace.id,
              rootNodeId: Object.keys(trace.nodes)[0] ?? '',
              agentId: trace.agentId,
              name: trace.name,
              trigger: trace.trigger,
              startTime: trace.startTime,
              endTime: trace.endTime,
              status: trace.status,
              nodes,
              edges: [],
              events: [],
              metadata: { ...trace.metadata, adapterSource: 'otel' },
              sessionEvents: [],
              sourceType: 'session',
              filename: `otel-${trace.id}`,
              lastModified: Date.now(),
              sourceDir: 'http-collector',
            };

            (this.watcher as unknown as { traces: Map<string, unknown> }).traces.set(
              `otel:${trace.id}`,
              watched,
            );
            ingested++;
          }

          // Notify connected WebSocket clients
          if (ingested > 0) {
            this.broadcast({ type: 'traces-updated', count: ingested });
          }

          res.json({ ok: true, tracesIngested: ingested });
        } catch (error) {
          console.error('OTLP collector error:', error);
          res.status(400).json({ error: 'Failed to parse OTLP payload' });
        }
      });
    } // end enableCollector

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

    // SPA fallback — serve React dashboard
    this.app.get(
      '*',
      rateLimit({ windowMs: 60 * 1000, max: 600, standardHeaders: true, legacyHeaders: false }),
      (_req, res) => {
        const clientIndex = path.join(__dirname, '../dist/client/index.html');
        if (fs.existsSync(clientIndex)) {
          res.sendFile(clientIndex);
        } else {
          res.status(404).send('Dashboard not found - public files may not be built');
        }
      },
    );
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

  /** Watch soma-report.json for changes and broadcast updates via WebSocket. */
  private setupSomaReportWatcher() {
    const somaVault = this.config.somaVault;
    if (!somaVault) return;

    const reportPath = path.join(somaVault, '..', 'soma-report.json');
    const reportDir = path.dirname(reportPath);
    if (!fs.existsSync(reportDir)) return;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const watcher = chokidar.watch(reportPath, {
      ignoreInitial: true,
      persistent: true,
      awaitWriteFinish: { stabilityThreshold: 500 },
    });

    watcher.on('change', () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        try {
          const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
          this.broadcast({ type: 'soma-report-updated', data: report });

          // Extract activity events from report changes
          if (report.generatedAt) {
            this.broadcast({
              type: 'soma-activity',
              data: {
                action: 'report-updated',
                description: `Report updated: ${report.totals?.agents ?? 0} agents, ${report.totals?.insights ?? 0} insights`,
                timestamp: report.generatedAt,
              },
            });
          }
        } catch {
          /* ignore parse errors during write */
        }
      }, 500);
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
        const nodeValues = Object.values(nodes) as Record<string, unknown>[];
        if (
          nodeValues.some(
            (n: Record<string, unknown>) => n.type === 'log-file' || n.type === 'log-entry',
          )
        )
          continue;
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
    const nodes: {
      id: string;
      label: string;
      count: number;
      frequency: number;
      avgDuration: number;
      failRate: number;
      p95Duration: number;
      isVirtual: boolean;
    }[] = [];
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
    const _rootSteps = new Set(model.steps);
    const _childSteps = new Set(model.transitions.map((t) => t.to));
    const _leafSteps = new Set(model.steps);
    for (const _t of model.transitions) {
      // A step that appears as a target is not a root
      // A step that appears as a source is not a leaf (simplified)
    }

    nodes.push({
      id: '[START]',
      label: '[START]',
      count: model.totalGraphs,
      frequency: 1,
      avgDuration: 0,
      failRate: 0,
      p95Duration: 0,
      isVirtual: true,
    });
    nodes.push({
      id: '[END]',
      label: '[END]',
      count: model.totalGraphs,
      frequency: 1,
      avgDuration: 0,
      failRate: 0,
      p95Duration: 0,
      isVirtual: true,
    });

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
    const maxNodeCount = Math.max(...nodes.filter((n) => !n.isVirtual).map((n) => n.count), 1);

    return { agentId, totalTraces: model.totalGraphs, nodes, edges, maxEdgeCount, maxNodeCount };
  }

  /**
   * Legacy process graph computation for session-based traces.
   * Preserved for backward compatibility with JSONL/LOG traces.
   */
  private buildProcessGraphLegacy(agentId: string, allTraces: WatchedTrace[]) {
    const traces = allTraces.map(serializeTrace);
    const activityCounts = new Map<string, number>();
    const transitionCounts = new Map<string, number>();
    const activityDurations = new Map<string, number[]>();
    const activityStatuses = new Map<string, { ok: number; fail: number }>();
    let totalTraces = 0;

    for (const trace of traces) {
      totalTraces++;
      const activities: Array<{ name: string; type: string; status: string; duration: number }> =
        [];

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
          (a: Record<string, unknown>, b: Record<string, unknown>) =>
            ((a.startTime as number) || 0) - ((b.startTime as number) || 0),
        );
        for (const node of sorted as Record<string, unknown>[]) {
          activities.push({
            name: (node.name || node.type || node.id) as string,
            type: (node.type || 'unknown') as string,
            status: (node.status || 'completed') as string,
            duration:
              ((node.endTime as number) || (node.startTime as number) || 0) -
              ((node.startTime as number) || 0),
          });
        }
      }

      const seq = ['[START]', ...activities.map((a) => a.name), '[END]'];
      for (let i = 0; i < seq.length; i++) {
        const act = seq[i] ?? '';
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
        id: name,
        label: name,
        count,
        frequency: count / totalTraces,
        avgDuration,
        failRate: st.ok + st.fail > 0 ? st.fail / (st.ok + st.fail) : 0,
        p95Duration: 0,
        isVirtual: name === '[START]' || name === '[END]',
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
  private isGraphTrace(trace: WatchedTrace): boolean {
    if (trace.sourceType === 'session' || trace.sourceType === 'log') return false;
    if (!trace.rootNodeId && !(trace as unknown as Record<string, unknown>).rootId) return false;
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

  private broadcast(message: Record<string, unknown>) {
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

  /** Check if any src/client file is newer than the built bundle. */
  private isClientStale(srcDir: string, distDir: string): boolean {
    try {
      const distIndex = path.join(distDir, 'index.html');
      if (!fs.existsSync(distIndex)) return true;
      const distMtime = fs.statSync(distIndex).mtimeMs;
      const check = (dir: string): boolean => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            if (check(full)) return true;
          } else if (fs.statSync(full).mtimeMs > distMtime) {
            return true;
          }
        }
        return false;
      };
      return check(srcDir);
    } catch {
      return false;
    }
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

  public getConfigPath(): string | null {
    return this.configPath;
  }

  public getStats() {
    return this.stats.getGlobalStats();
  }

  public getTrace(filename: string) {
    return this.watcher.getTrace(filename);
  }

  public getTraces() {
    return this.watcher.getAllTraces();
  }
}

// Start dashboard if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startDashboard().catch(console.error);
}
