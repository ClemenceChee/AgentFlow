import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TraceWatcher } from '../src/watcher.js';

describe('OpenClaw Trace Discovery', () => {
  let tempDir: string;
  let watcher: TraceWatcher;

  beforeEach(() => {
    // Create temporary directory structure
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentflow-test-'));
  });

  afterEach(() => {
    if (watcher) {
      watcher.stop();
    }
    // Clean up temp directory
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should discover OpenClaw session files in nested directories', async () => {
    // Create OpenClaw-style directory structure
    const openclawDir = path.join(tempDir, '.openclaw');
    const agentsDir = path.join(openclawDir, 'agents');
    const mainAgentDir = path.join(agentsDir, 'main');
    const sessionsDir = path.join(mainAgentDir, 'sessions');

    fs.mkdirSync(sessionsDir, { recursive: true });

    // Create a sample OpenClaw session file
    const sessionId = 'test-session-123';
    const sessionFile = path.join(sessionsDir, `${sessionId}.jsonl`);

    const sessionContent = [
      JSON.stringify({
        type: 'session',
        version: 3,
        id: sessionId,
        timestamp: new Date().toISOString(),
        cwd: '/home/trader/.openclaw/workspace',
      }),
      JSON.stringify({
        type: 'model_change',
        id: 'model-1',
        parentId: null,
        timestamp: new Date().toISOString(),
        provider: 'openrouter',
        modelId: 'anthropic/claude-sonnet-3',
      }),
      JSON.stringify({
        type: 'message',
        id: 'msg-1',
        parentId: 'model-1',
        timestamp: new Date().toISOString(),
        message: {
          role: 'user',
          content: [{ type: 'text', text: 'Hello, world!' }],
        },
      }),
      JSON.stringify({
        type: 'message',
        id: 'msg-2',
        parentId: 'msg-1',
        timestamp: new Date().toISOString(),
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Hello! How can I help you today?' }],
          usage: { input: 10, output: 15, totalTokens: 25, cost: { total: 0.001 } },
        },
      }),
    ].join('\n');

    fs.writeFileSync(sessionFile, sessionContent);

    // Create watcher with the temporary directory
    watcher = new TraceWatcher({
      tracesDir: path.join(tempDir, 'traces'),
      dataDirs: [openclawDir],
    });

    // Give watcher time to discover files
    await new Promise((resolve) => setTimeout(resolve, 100));

    const traces = watcher.getAllTraces();
    expect(traces.length).toBeGreaterThan(0);

    const openclawTrace = traces.find((t) => t.agentId?.includes('main'));
    expect(openclawTrace).toBeDefined();
    expect(openclawTrace?.sourceType).toBe('session');
    expect(openclawTrace?.filename).toBe(`${sessionId}.jsonl`);
  });

  it('should extract correct agent ID from OpenClaw session file path', async () => {
    const testCases = [
      {
        agent: 'main',
        expected: 'main',
      },
      {
        agent: 'vault-curator',
        expected: 'vault-curator',
      },
      {
        agent: 'claude-code',
        expected: 'claude-code',
      },
    ];

    for (const testCase of testCases) {
      // Create OpenClaw directory structure properly
      const openclawDir = path.join(tempDir, '.openclaw');
      const agentsDir = path.join(openclawDir, 'agents');
      const agentDir = path.join(agentsDir, testCase.agent);
      const sessionsDir = path.join(agentDir, 'sessions');

      fs.mkdirSync(sessionsDir, { recursive: true });

      // Create a complete session file with proper structure
      const now = new Date().toISOString();
      const sessionContent = [
        JSON.stringify({
          type: 'session',
          version: 3,
          id: 'test-session',
          timestamp: now,
          cwd: '/test/workspace',
        }),
        JSON.stringify({
          type: 'message',
          id: 'msg-1',
          parentId: null,
          timestamp: now,
          message: {
            role: 'user',
            content: [{ type: 'text', text: 'Test message' }],
          },
        }),
        JSON.stringify({
          type: 'message',
          id: 'msg-2',
          parentId: 'msg-1',
          timestamp: now,
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: 'Hello' }],
          },
        }),
      ].join('\n');

      const sessionFile = path.join(sessionsDir, 'test.jsonl');
      fs.writeFileSync(sessionFile, sessionContent);

      // Create watcher with proper data directory
      watcher = new TraceWatcher({
        tracesDir: path.join(tempDir, 'traces'),
        dataDirs: [openclawDir],
      });

      // Give watcher time to discover files
      await new Promise((resolve) => setTimeout(resolve, 150));

      const traces = watcher.getAllTraces();
      console.log(`Test case ${testCase.agent}: Found ${traces.length} traces`);
      if (traces.length > 0) {
        console.log(`  Agent IDs: ${traces.map((t) => t.agentId).join(', ')}`);
        console.log(`  Filenames: ${traces.map((t) => t.filename).join(', ')}`);
      }

      const trace = traces.find((t) => t.filename === 'test.jsonl');
      expect(trace).toBeDefined();
      expect(trace?.agentId).toBe(testCase.expected);

      watcher.stop();
      // Clean up for next iteration
      fs.rmSync(openclawDir, { recursive: true, force: true });
    }
  });

  it('should handle OpenClaw log files from temp directory', async () => {
    // Create OpenClaw log file structure
    const logDir = path.join(tempDir, 'tmp', 'openclaw');
    fs.mkdirSync(logDir, { recursive: true });

    const logFile = path.join(logDir, 'openclaw-2026-03-19.log');
    const logContent = `
[2m2026-03-19T00:40:59.601Z[0m [[32m[1mINFO [0m] [1mGateway starting[0m [36mport[0m=8080 [36mversion[0m=2.1.0
[2m2026-03-19T00:41:09.409Z[0m [[34m[1mDEBUG[0m] [1mSession created[0m [36msession_id[0m=d368ece8-ca07-4c08-86ab-44a10a82f374 [36magent[0m=main
[2m2026-03-19T00:41:23.000Z[0m [[32m[1mINFO [0m] [1mMessage processed[0m [36msession_id[0m=d368ece8-ca07-4c08-86ab-44a10a82f374 [36mtype[0m=user
    `;

    fs.writeFileSync(logFile, logContent.trim());

    // Create watcher
    watcher = new TraceWatcher({
      tracesDir: path.join(tempDir, 'traces'),
      dataDirs: [logDir],
    });

    // Give watcher time to process
    await new Promise((resolve) => setTimeout(resolve, 100));

    const traces = watcher.getAllTraces();
    expect(traces.length).toBeGreaterThan(0);

    const openclawLogTrace = traces.find(
      (t) => t.filename === 'openclaw-2026-03-19.log' || t.agentId?.includes('openclaw'),
    );

    expect(openclawLogTrace).toBeDefined();
  });

  it('should watch for new OpenClaw session files in real-time', async () => {
    const agentsDir = path.join(tempDir, '.openclaw', 'agents', 'test-agent', 'sessions');
    fs.mkdirSync(agentsDir, { recursive: true });

    watcher = new TraceWatcher({
      tracesDir: path.join(tempDir, 'traces'),
      dataDirs: [path.join(tempDir, '.openclaw')],
    });

    let traceAdded = false;
    watcher.on('trace-added', (trace) => {
      if (trace.agentId?.includes('test-agent')) {
        traceAdded = true;
      }
    });

    // Give watcher time to start watching
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Create a new session file
    const newSessionFile = path.join(agentsDir, 'new-session.jsonl');
    const sessionContent = JSON.stringify({
      type: 'session',
      version: 3,
      id: 'new-session',
      timestamp: new Date().toISOString(),
    });

    fs.writeFileSync(newSessionFile, sessionContent);

    // Give file watcher time to detect the new file
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(traceAdded).toBe(true);

    const traces = watcher.getAllTraces();
    const newTrace = traces.find((t) => t.filename === 'new-session.jsonl');
    expect(newTrace).toBeDefined();
    expect(newTrace?.agentId).toBe('test-agent');
  });

  it('should provide comprehensive stats for OpenClaw agents', async () => {
    // Create multiple OpenClaw agent directories with session files
    const agents = ['main', 'vault-curator', 'vault-janitor'];

    for (const agent of agents) {
      const sessionsDir = path.join(tempDir, '.openclaw', 'agents', agent, 'sessions');
      fs.mkdirSync(sessionsDir, { recursive: true });

      // Create multiple session files for each agent
      for (let i = 0; i < 3; i++) {
        const sessionFile = path.join(sessionsDir, `session-${i}.jsonl`);
        const sessionContent = JSON.stringify({
          type: 'session',
          version: 3,
          id: `session-${agent}-${i}`,
          timestamp: new Date(Date.now() - i * 60000).toISOString(), // Different timestamps
        });
        fs.writeFileSync(sessionFile, sessionContent);
      }
    }

    watcher = new TraceWatcher({
      tracesDir: path.join(tempDir, 'traces'),
      dataDirs: [path.join(tempDir, '.openclaw')],
    });

    // Give watcher time to discover all files
    await new Promise((resolve) => setTimeout(resolve, 100));

    const stats = watcher.getTraceStats();
    const agentIds = watcher.getAgentIds();

    expect(stats.total).toBe(9); // 3 agents × 3 sessions each
    expect(stats.agentCount).toBe(3);

    // Check that all OpenClaw agents are discovered
    expect(agentIds).toContain('main');
    expect(agentIds).toContain('vault-curator');
    expect(agentIds).toContain('vault-janitor');

    // Test agent-specific trace retrieval
    const mainAgentTraces = watcher.getTracesByAgent('main');
    expect(mainAgentTraces.length).toBe(3);
  });
});
