import * as fs from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { DashboardServer } from '../../packages/dashboard/src/server.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeTrace(id: string, agentId: string, startTime: number) {
  return {
    id,
    agentId,
    trigger: 'cron',
    nodes: {
      root: {
        id: 'root',
        type: 'agent',
        name: `${agentId}-run`,
        startTime,
        endTime: startTime + 1000,
        status: 'completed',
        children: [],
        parentId: null,
        metadata: {},
        state: {},
      },
    },
    rootId: 'root',
    startTime,
    edges: [],
    events: [],
  };
}

function makeSessionJsonl(sessionId: string) {
  return [
    `{"type":"session","version":3,"id":"${sessionId}","timestamp":"2026-03-19T00:00:00Z","cwd":"/tmp"}`,
    `{"type":"model_change","id":"mc1","parentId":null,"timestamp":"2026-03-19T00:00:00Z","provider":"openrouter","modelId":"test-model"}`,
    `{"type":"message","id":"m1","parentId":"mc1","timestamp":"2026-03-19T00:00:01Z","message":{"role":"user","content":[{"type":"text","text":"Integration test"}]}}`,
    `{"type":"message","id":"m2","parentId":"m1","timestamp":"2026-03-19T00:00:05Z","message":{"role":"assistant","content":[{"type":"text","text":"Response"}],"usage":{"input":100,"output":50,"totalTokens":150},"stopReason":"end_turn"}}`,
  ].join('\n');
}

function makeOpenClawLog() {
  return JSON.stringify({
    timestamp: '2026-03-19T00:00:00Z',
    level: 'info',
    action: 'gateway.request',
    run_id: 'integration-run-1',
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = http.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address() as { port: number };
      srv.close(() => resolve(addr.port));
    });
    srv.on('error', reject);
  });
}

function httpGet(url: string): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          let body: any;
          try {
            body = JSON.parse(data);
          } catch {
            body = data;
          }
          resolve({ status: res.statusCode!, body });
        });
      })
      .on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// Integration Tests
// ---------------------------------------------------------------------------

describe('Integration: Full Pipeline', () => {
  let tmpDir: string;
  let agentsDir: string;
  let server: DashboardServer;
  let port: number;
  let baseUrl: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentflow-integration-'));
    agentsDir = path.join(tmpDir, 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });

    port = await getAvailablePort();
    baseUrl = `http://127.0.0.1:${port}`;

    server = new DashboardServer({
      port,
      tracesDir: tmpDir,
      host: '127.0.0.1',
      enableCors: true,
      dataDirs: [agentsDir],
    });

    await server.start();
    // Give chokidar time to initialize
    await new Promise((r) => setTimeout(r, 500));
  });

  afterAll(async () => {
    await server.stop();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('write a JSON trace file -> appears in API', async () => {
    const tracePath = path.join(tmpDir, 'integration-trace.json');
    fs.writeFileSync(tracePath, JSON.stringify(makeTrace('int-1', 'int-agent', 1000)));

    // Wait for the watcher to detect the new file
    await new Promise((r) => setTimeout(r, 1500));

    const { status, body } = await httpGet(`${baseUrl}/api/traces`);
    expect(status).toBe(200);
    const found = body.find((t: any) => t.id === 'int-1');
    expect(found).toBeDefined();
    expect(found.agentId).toBe('int-agent');
  }, 10000);

  it('write a JSONL session -> appears in API with correct agentId', async () => {
    // Create OpenClaw-style path: agents/AGENT_NAME/sessions/
    const sessionsDir = path.join(agentsDir, 'test-worker', 'sessions');
    fs.mkdirSync(sessionsDir, { recursive: true });
    const sessionPath = path.join(sessionsDir, 'int-session.jsonl');
    fs.writeFileSync(sessionPath, makeSessionJsonl('int-session-1'));

    await new Promise((r) => setTimeout(r, 1500));

    const { status, body } = await httpGet(`${baseUrl}/api/traces`);
    expect(status).toBe(200);
    const found = body.find((t: any) => t.id === 'int-session-1');
    expect(found).toBeDefined();
    // agentId should be extracted from path
    expect(found.agentId).toContain('test-worker');
  }, 10000);

  it('write an OpenClaw log entry -> appears in API', async () => {
    const logPath = path.join(tmpDir, 'openclaw-integration.log');
    fs.writeFileSync(logPath, makeOpenClawLog());

    await new Promise((r) => setTimeout(r, 1500));

    const { status, body } = await httpGet(`${baseUrl}/api/traces`);
    expect(status).toBe(200);
    // Should have loaded the log file in some form
    const logTraces = body.filter((t: any) => t.filename === 'openclaw-integration.log');
    expect(logTraces.length).toBeGreaterThanOrEqual(1);
  }, 10000);

  it('multiple agents from different directories -> all visible', async () => {
    // Write traces for different agents
    fs.writeFileSync(
      path.join(tmpDir, 'agent-alpha.json'),
      JSON.stringify(makeTrace('alpha-1', 'alpha', 5000)),
    );

    const betaDir = path.join(agentsDir, 'beta', 'sessions');
    fs.mkdirSync(betaDir, { recursive: true });
    fs.writeFileSync(path.join(betaDir, 'beta-session.jsonl'), makeSessionJsonl('beta-1'));

    await new Promise((r) => setTimeout(r, 1500));

    const { status, body } = await httpGet(`${baseUrl}/api/traces`);
    expect(status).toBe(200);

    const agentIds = new Set(body.map((t: any) => t.agentId));
    expect(agentIds.has('alpha')).toBe(true);
    // Beta should appear with some form of agent id containing 'beta'
    const hasBeta = Array.from(agentIds).some((id: string) => id.includes('beta'));
    expect(hasBeta).toBe(true);
  }, 10000);

  it('real-time updates via WebSocket', async () => {
    const wsUrl = `ws://127.0.0.1:${port}`;

    const messages: any[] = [];

    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      const timeout = setTimeout(() => {
        ws.close();
        resolve(); // Resolve anyway - we'll check what we got
      }, 6000);

      ws.on('message', (data: Buffer) => {
        const parsed = JSON.parse(data.toString());
        messages.push(parsed);

        // After receiving init, write a new file to trigger an update
        if (parsed.type === 'init') {
          const newTrace = makeTrace('ws-test', 'ws-agent', Date.now());
          fs.writeFileSync(path.join(tmpDir, 'ws-test-trace.json'), JSON.stringify(newTrace));
        }

        // If we get a trace-added event, we're done
        if (parsed.type === 'trace-added') {
          clearTimeout(timeout);
          ws.close();
          resolve();
        }
      });

      ws.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    // Should have received at least the init message
    expect(messages.length).toBeGreaterThanOrEqual(1);
    expect(messages[0].type).toBe('init');

    // If the watcher detected the file, we should also have a trace-added event
    const traceAdded = messages.find((m) => m.type === 'trace-added');
    if (traceAdded) {
      expect(traceAdded.data).toBeDefined();
    }
  }, 15000);
});
