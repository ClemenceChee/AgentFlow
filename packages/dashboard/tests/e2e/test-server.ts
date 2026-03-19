import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { DashboardServer } from '../../src/server.js';
import { TestDataGenerator } from '../fixtures/test-data-generator.js';

/**
 * E2E test server setup
 * Creates a dashboard server with test data for Playwright tests
 */

let server: DashboardServer | null = null;
let tempDir: string;

async function startTestServer(): Promise<void> {
  console.log('Setting up E2E test server...');

  // Create temporary directory with test data
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-dashboard-'));

  const tracesDir = path.join(tempDir, 'traces');
  const alfredDir = path.join(tempDir, 'alfred');
  const openclawDir = path.join(tempDir, 'openclaw');

  // Create test data
  console.log('Generating test data...');

  // AgentFlow traces
  await TestDataGenerator.createTestFiles(tracesDir, 15);

  // Alfred traces
  fs.mkdirSync(alfredDir, { recursive: true });
  for (let i = 0; i < 3; i++) {
    const alfredTrace = TestDataGenerator.createExecutionGraph({
      agentId: `alfred-e2e-${i}`,
      nodeCount: 8,
      trigger: 'cron',
      includeTimings: true,
    });

    fs.writeFileSync(path.join(alfredDir, `alfred-${i}.json`), JSON.stringify(alfredTrace));
  }

  // OpenClaw sessions
  fs.mkdirSync(openclawDir, { recursive: true });
  for (let i = 0; i < 2; i++) {
    const sessionTrace = TestDataGenerator.createSessionTrace({
      agentId: `openclaw-e2e-${i}`,
      provider: 'anthropic',
      model: 'claude-3-sonnet',
    });

    const jsonlContent = sessionTrace.sessionEvents
      ?.map((event) =>
        JSON.stringify({
          type: event.type === 'system' ? 'session' : 'message',
          timestamp: new Date(event.timestamp).toISOString(),
          id: event.id,
          parentId: event.parentId,
          ...(event.type === 'user' && {
            message: { role: 'user', content: [{ type: 'text', text: event.content }] },
          }),
          ...(event.type === 'assistant' && {
            message: {
              role: 'assistant',
              content: [{ type: 'text', text: event.content }],
              usage: event.tokens,
            },
          }),
        }),
      )
      .join('\n');

    fs.writeFileSync(path.join(openclawDir, `session-${i}.jsonl`), jsonlContent);
  }

  // OpenClaw logs
  TestDataGenerator.createOpenClawLogs(openclawDir);

  console.log('Starting dashboard server...');

  server = new DashboardServer({
    port: 3001,
    tracesDir,
    dataDirs: [alfredDir, openclawDir],
    enableCors: true,
  });

  await server.start();

  // Wait for traces to load
  await new Promise((resolve) => setTimeout(resolve, 2000));

  const traceCount = server.getTraces().length;
  const stats = server.getStats();

  console.log(`E2E test server ready at http://localhost:3001`);
  console.log(`Loaded ${traceCount} traces, ${stats.totalAgents} agents`);
}

async function stopTestServer(): Promise<void> {
  if (server) {
    console.log('Stopping E2E test server...');
    await server.stop();
    server = null;
  }

  if (tempDir && fs.existsSync(tempDir)) {
    console.log('Cleaning up test data...');
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

// Handle process termination
process.on('SIGINT', async () => {
  await stopTestServer();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await stopTestServer();
  process.exit(0);
});

// Start server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startTestServer().catch((error) => {
    console.error('Failed to start E2E test server:', error);
    process.exit(1);
  });
}

export { startTestServer, stopTestServer };
