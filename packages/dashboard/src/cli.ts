import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { type DashboardConfig, DashboardServer } from './server.js';

const VERSION = '0.3.1';

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

function printBanner(config: DashboardConfig, traceCount: number, stats: { totalAgents: number; totalExecutions: number; globalSuccessRate: number; activeAgents: number }) {
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

  \u250c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510              \u250c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510              \u250c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510
  \u2502  \ud83e\udd16 Agents          \u2502  TRACE FILES \u2502  \ud83d\udcca AgentFlow      \u2502  SHOWS YOU   \u2502  \ud83c\udf10 Your browser   \u2502
  \u2502  Execute tasks,   \u2502 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500> \u2502  Reads traces,    \u2502 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500> \u2502  Interactive      \u2502
  \u2502  write JSON       \u2502              \u2502  builds graphs,  \u2502              \u2502  graph, timeline, \u2502
  \u2502  trace files.     \u2502              \u2502  serves dashboard.\u2502              \u2502  metrics, health. \u2502
  \u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518              \u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518              \u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518

  Runs locally. Your data never leaves your machine.

  Tabs: \ud83c\udfaf Graph \u00b7 \u23f1\ufe0f  Timeline \u00b7 \ud83d\udcca Metrics \u00b7 \ud83d\udee0\ufe0f  Process Health \u00b7 \u26a0\ufe0f  Errors

  Traces:     ${config.tracesDir}${config.dataDirs?.length ? '\n  Data dirs:  ' + config.dataDirs.join('\n              ') : ''}
  Loaded:     ${traceCount} traces \u00b7 ${stats.totalAgents} agents \u00b7 ${stats.totalExecutions} executions
  Success:    ${stats.globalSuccessRate.toFixed(1)}%${stats.activeAgents > 0 ? ` \u00b7 ${stats.activeAgents} active now` : ''}
  CORS:       ${config.enableCors ? 'enabled' : 'disabled'}
  WebSocket:  live updates enabled

  \u2192 http://localhost:${port}${isPublic && lan ? `\n  \u2192 http://${lan}:${port}  (LAN)` : ''}
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
        config.port = parseInt(args[++i]) || 3000;
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
      case '--help':
        printHelp();
        process.exit(0);
    }
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
      printBanner(config, traces.length, stats);
    }, 1500);
  } catch (error) {
    console.error('\u274c Failed to start dashboard:', error);
    process.exit(1);
  }
}

function printHelp() {
  console.log(`
\ud83d\udcca AgentFlow Dashboard v${VERSION} \u2014 See your agents think.

Usage:
  agentflow-dashboard [options]
  npx agentflow-dashboard [options]

Options:
  -p, --port <number>     Server port (default: 3000)
  -t, --traces <path>     Traces directory (default: ./traces)
  -h, --host <address>    Host address (default: localhost)
  --data-dir <path>       Extra data directory for process discovery (repeatable)
  --cors                  Enable CORS headers
  --help                  Show this help message

Examples:
  agentflow-dashboard --traces ./traces --host 0.0.0.0 --cors
  agentflow-dashboard -p 8080 -t /var/log/agentflow
  agentflow-dashboard --traces ./traces --data-dir ./workers --data-dir ./cron

Tabs:
  \ud83c\udfaf Graph            Interactive Cytoscape.js execution graph
  \u23f1\ufe0f  Timeline          Waterfall view of node durations
  \ud83d\udcca Metrics           Success rates, durations, node breakdown
  \ud83d\udee0\ufe0f  Process Health    PID files, systemd, workers, orphans
  \u26a0\ufe0f  Errors            Failed and hung nodes with metadata
`);
}
