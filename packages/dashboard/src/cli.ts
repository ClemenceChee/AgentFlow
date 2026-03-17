import * as fs from 'fs';
import * as path from 'path';
import { type DashboardConfig, DashboardServer } from './server.js';

export async function startDashboard() {
  const args = process.argv.slice(2);

  // Parse command line arguments
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
      case '--cors':
        config.enableCors = true;
        break;
      case '--help':
        printHelp();
        process.exit(0);
    }
  }

  // Validate traces directory
  const tracesPath = path.resolve(config.tracesDir);
  if (!fs.existsSync(tracesPath)) {
    console.log(`Traces directory doesn't exist: ${tracesPath}`);
    console.log('Creating traces directory...');
    fs.mkdirSync(tracesPath, { recursive: true });
  }

  config.tracesDir = tracesPath;

  console.log('🚀 Starting AgentFlow Dashboard...');
  console.log(`   Port: ${config.port}`);
  console.log(`   Host: ${config.host}`);
  console.log(`   Traces: ${config.tracesDir}`);
  console.log(`   CORS: ${config.enableCors ? 'enabled' : 'disabled'}`);

  // Start dashboard
  const dashboard = new DashboardServer(config);

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\\n🛑 Shutting down dashboard...');
    await dashboard.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\\n🛑 Received SIGTERM, shutting down...');
    await dashboard.stop();
    process.exit(0);
  });

  try {
    await dashboard.start();
    console.log('✅ Dashboard started successfully!');
    console.log(`   Open: http://${config.host}:${config.port}`);

    // Show initial stats
    setTimeout(() => {
      const stats = dashboard.getStats();
      const traces = dashboard.getTraces();
      console.log(`\\n📊 Dashboard Status:`);
      console.log(`   Total Traces: ${traces.length}`);
      console.log(`   Total Agents: ${stats.totalAgents}`);
      console.log(`   Success Rate: ${stats.globalSuccessRate.toFixed(1)}%`);
      console.log(`   Active Agents: ${stats.activeAgents}`);
    }, 1000);
  } catch (error) {
    console.error('❌ Failed to start dashboard:', error);
    process.exit(1);
  }
}

function printHelp() {
  console.log(`
🔍 AgentFlow Dashboard - Real-time monitoring for AI agent executions

Usage:
  agentflow-dashboard [options]
  npx agentflow-dashboard [options]

Options:
  -p, --port <number>     Server port (default: 3000)
  -t, --traces <path>     Traces directory (default: ./traces)
  -h, --host <address>    Host address (default: localhost)
  --cors                  Enable CORS headers
  --help                  Show this help message

Examples:
  agentflow-dashboard --port 8080 --traces /var/log/agentflow
  agentflow-dashboard --host 0.0.0.0 --cors
  agentflow-dashboard --traces ./my-agent-traces

Features:
  ✨ Real-time trace monitoring
  📊 Agent performance analytics
  🎯 Execution graph visualization
  📈 Success/failure tracking
  🔍 Multi-agent system overview

Visit: https://github.com/ClemenceChee/AgentFlow
`);
}
