import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { type DashboardConfig, DashboardServer } from './server.js';

const VERSION = '0.8.0';

function getLanAddress(): string | null {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return null;
}

function printBanner(
  config: DashboardConfig,
  traceCount: number,
  stats: {
    totalAgents: number;
    totalExecutions: number;
    globalSuccessRate: number;
    activeAgents: number;
  },
  configPath: string | null,
) {
  const lan = getLanAddress();
  const host = config.host || 'localhost';
  const port = config.port;
  const isPublic = host === '0.0.0.0';

  console.log(`
   ___                    _   _____ _
  / _ \\  __ _  ___ _ __ | |_|  ___| | _____      __
 | |_| |/ _\` |/ _ \\ '_ \\| __| |_  | |/ _ \\ \\ /\\ / /
 |  _  | (_| |  __/ | | | |_|  _| | | (_) \\ V  V /
 |_| |_|\\__, |\\___|_| |_|\\__|_|   |_|\\___/ \\_/\\_/
        |___/              dashboard v${VERSION}

  See your agents think.

  Traces:     ${config.tracesDir}${config.dataDirs?.length ? `\n  Data dirs:  ${config.dataDirs.join('\n              ')}` : ''}
  Loaded:     ${traceCount} traces \u00b7 ${stats.totalAgents} agents \u00b7 ${stats.totalExecutions} executions
  Success:    ${stats.globalSuccessRate.toFixed(1)}%${stats.activeAgents > 0 ? ` \u00b7 ${stats.activeAgents} active now` : ''}
  Config:     ${configPath ?? 'none (using defaults)'}
  CORS:       ${config.enableCors ? 'enabled' : 'disabled'}
  WebSocket:  live updates enabled
  Window:     ${process.env.AGENTFLOW_TRACE_WINDOW_HOURS ?? '48'}h (set AGENTFLOW_TRACE_WINDOW_HOURS to change)

  \u2192 http://localhost:${port}${isPublic && lan ? `\n  \u2192 http://${lan}:${port}  (LAN)` : ''}

  Pages:  Agents \u00b7 SOMA
  Agent:  Profile \u00b7 Execution Detail
  SOMA:   Intelligence \u00b7 Review \u00b7 Policies \u00b7 Knowledge \u00b7 Activity
  Tabs:   Flame Chart \u00b7 Agent Flow \u00b7 Metrics \u00b7 Dependencies
          State Machine \u00b7 Summary \u00b7 Transcript

  Runs locally. Your data never leaves your machine.
`);
}

export async function startDashboard() {
  const args = process.argv.slice(2);

  const config: DashboardConfig = {
    port: 3000,
    tracesDir: './traces',
    host: 'localhost',
    enableCors: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--port':
      case '-p':
        config.port = parseInt(args[++i], 10) || 3000;
        break;
      case '--traces':
      case '-t':
        config.tracesDir = args[++i];
        break;
      case '--host':
      case '-h':
        config.host = args[++i];
        break;
      case '--data-dir':
        if (!config.dataDirs) config.dataDirs = [];
        config.dataDirs.push(args[++i]);
        break;
      case '--cors':
        config.enableCors = true;
        break;
      case '--no-collector':
        config.enableCollector = false;
        break;
      case '--collector-token':
        config.collectorAuthToken = args[++i];
        break;
      case '--soma-vault':
        config.somaVault = args[++i];
        break;
      case '--config':
        config.configPath = args[++i];
        break;
      case '--help':
        printHelp();
        process.exit(0);
    }
  }

  // Support env vars
  if (!config.collectorAuthToken && process.env.AGENTFLOW_COLLECTOR_TOKEN) {
    config.collectorAuthToken = process.env.AGENTFLOW_COLLECTOR_TOKEN;
  }
  if (process.env.AGENTFLOW_NO_COLLECTOR === 'true') {
    config.enableCollector = false;
  }
  if (!config.somaVault && process.env.SOMA_VAULT) {
    config.somaVault = process.env.SOMA_VAULT;
  }

  const tracesPath = path.resolve(config.tracesDir);
  if (!fs.existsSync(tracesPath)) {
    fs.mkdirSync(tracesPath, { recursive: true });
  }
  config.tracesDir = tracesPath;

  console.log('\nStarting AgentFlow Dashboard...\n');

  const dashboard = new DashboardServer(config);

  process.on('SIGINT', async () => {
    console.log('\n\ud83d\uded1 Shutting down dashboard...');
    await dashboard.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await dashboard.stop();
    process.exit(0);
  });

  try {
    await dashboard.start();

    // Show banner after traces are loaded
    setTimeout(() => {
      const stats = dashboard.getStats();
      const traces = dashboard.getTraces();
      printBanner(config, traces.length, stats, dashboard.getConfigPath());
    }, 1500);
  } catch (error) {
    console.error('\u274c Failed to start dashboard:', error);
    process.exit(1);
  }
}

function printHelp() {
  console.log(`
AgentFlow Dashboard v${VERSION} — See your agents think.

Usage:
  agentflow-dashboard [options]
  npx agentflow-dashboard [options]

Options:
  -p, --port <number>     Server port (default: 3000)
  -t, --traces <path>     Traces directory (default: ./traces)
  -h, --host <address>    Host address (default: localhost)
  --data-dir <path>       Extra data directory for process discovery (repeatable)
  --config <path>         Path to agentflow.config.json (aliases, skip files, etc.)
  --soma-vault <path>     SOMA vault directory for intelligence data
  --cors                  Enable CORS headers
  --no-collector          Disable OTLP trace collector (POST /v1/traces)
  --collector-token <tok> Require auth token for collector (or set AGENTFLOW_COLLECTOR_TOKEN)
  --help                  Show this help message

Config file:
  The dashboard loads agentflow.config.json for agent aliases, skip files,
  discovery paths, and systemd services. Resolution order:
    1. --config flag
    2. AGENTFLOW_CONFIG env var
    3. ./agentflow.config.json
    4. ~/.config/agentflow/config.json

  See agentflow.config.example.json for a complete reference.

Environment:
  AGENTFLOW_CONFIG               Path to config file
  AGENTFLOW_TRACE_WINDOW_HOURS   Max age of traces to load (default: 48)
  AGENTFLOW_COLLECTOR_TOKEN      Auth token for OTLP collector
  AGENTFLOW_NO_COLLECTOR=true    Disable OTLP collector
  SOMA_VAULT                     SOMA vault directory

Examples:
  agentflow-dashboard --traces ./traces --host 0.0.0.0
  agentflow-dashboard --traces ./traces --config ./agentflow.config.json
  agentflow-dashboard -p 8080 -t /var/log/agentflow --cors
`);
}
