import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import getPort from 'get-port';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DashboardServer } from '../../src/server.js';
import { TestDataGenerator, traceToJson } from '../fixtures/test-data-generator.js';

describe('OpenClaw Integration Tests', () => {
  let tempDir: string;
  let server: DashboardServer;
  let port: number;

  let origHome: string | undefined;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openclaw-test-'));
    port = await getPort();
    TestDataGenerator.resetCounters();
    // Isolate from user config to prevent production data contamination
    origHome = process.env.HOME;
    process.env.HOME = tempDir;
  });

  afterEach(async () => {
    process.env.HOME = origHome;
    if (server) {
      await server.stop();
    }
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Trace discovery and parsing', () => {
    it('should discover and parse OpenClaw session files', async () => {
      const tracesDir = path.join(tempDir, 'traces');
      const openclawDir = path.join(tempDir, 'openclaw-sessions');

      fs.mkdirSync(openclawDir, { recursive: true });

      // Create realistic OpenClaw session structure
      const sessionIds = ['session-abc123', 'session-def456', 'session-ghi789'];

      for (const sessionId of sessionIds) {
        const sessionDir = path.join(openclawDir, 'agents', 'default', sessionId);
        fs.mkdirSync(sessionDir, { recursive: true });

        // Create session JSONL file with realistic content
        const sessionEvents = [
          {
            type: 'session',
            timestamp: new Date().toISOString(),
            id: sessionId,
            version: '1.0.0',
            cwd: '/app/openclaw',
          },
          {
            type: 'model_change',
            timestamp: new Date(Date.now() + 100).toISOString(),
            id: `model-${sessionId}`,
            provider: 'anthropic',
            modelId: 'claude-3-5-sonnet-20241022',
          },
          {
            type: 'message',
            timestamp: new Date(Date.now() + 1000).toISOString(),
            id: `user-${sessionId}`,
            message: {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: `[cron:0 */6 * * * Analyze system metrics] Please analyze the current system metrics and provide recommendations.`,
                },
              ],
            },
          },
          {
            type: 'message',
            timestamp: new Date(Date.now() + 2000).toISOString(),
            id: `thinking-${sessionId}`,
            message: {
              role: 'assistant',
              content: [
                {
                  type: 'thinking',
                  thinking:
                    'I need to analyze the system metrics. Let me start by checking CPU and memory usage.',
                },
              ],
            },
          },
          {
            type: 'message',
            timestamp: new Date(Date.now() + 3000).toISOString(),
            id: `tool-call-${sessionId}`,
            message: {
              role: 'assistant',
              content: [
                {
                  type: 'toolCall',
                  id: `tc-${sessionId}`,
                  name: 'bash',
                  arguments: {
                    command: 'top -bn1 | head -10',
                  },
                },
              ],
            },
          },
          {
            type: 'message',
            timestamp: new Date(Date.now() + 5000).toISOString(),
            id: `tool-result-${sessionId}`,
            message: {
              role: 'toolResult',
              content: [
                {
                  type: 'text',
                  text: 'PID USER      PR  NI    VIRT    RES    SHR S  %CPU %MEM     TIME+ COMMAND\n12345 app       20   0  123456  78901  12345 S   2.5  1.2   0:10.23 openclaw',
                  toolCallId: `tc-${sessionId}`,
                },
              ],
            },
          },
          {
            type: 'message',
            timestamp: new Date(Date.now() + 6000).toISOString(),
            id: `assistant-${sessionId}`,
            message: {
              role: 'assistant',
              content: [
                {
                  type: 'text',
                  text: 'Based on the system metrics analysis, I can see that the system is running normally with low CPU usage (2.5%) and reasonable memory consumption.',
                },
              ],
              usage: {
                input: 245,
                output: 156,
                totalTokens: 401,
                cost: {
                  total: 0.0089,
                },
              },
            },
          },
        ];

        const sessionFile = path.join(sessionDir, `${sessionId}.jsonl`);
        const content = sessionEvents.map((event) => JSON.stringify(event)).join('\n');
        fs.writeFileSync(sessionFile, content);
      }

      server = new DashboardServer({
        port,
        tracesDir,
        dataDirs: [openclawDir],
      });

      await server.start();

      // Wait for session files to be discovered and parsed
      await new Promise((resolve) => setTimeout(resolve, 500));

      const traces = server.getTraces();
      expect(traces.length).toBeGreaterThanOrEqual(3);

      // Verify session traces are properly parsed
      const sessionTraces = traces.filter((t) => t.sourceType === 'session');
      expect(sessionTraces.length).toBe(3);

      for (const trace of sessionTraces) {
        expect(trace.sessionEvents).toBeDefined();
        expect(trace.sessionEvents?.length).toBeGreaterThan(0);
        expect(trace.tokenUsage).toBeDefined();
        expect(trace.tokenUsage?.total).toBeGreaterThan(0);

        // Verify session structure
        expect(trace.nodes.size).toBeGreaterThan(1);
        expect(trace.trigger).toBe('cron');

        // Check for tool nodes
        const nodes = Array.from(trace.nodes.values());
        const toolNodes = nodes.filter((n) => n.type === 'tool');
        expect(toolNodes.length).toBeGreaterThan(0);
      }
    });

    it('should handle OpenClaw gateway logs', async () => {
      const tracesDir = path.join(tempDir, 'traces');
      const openclawDir = path.join(tempDir, 'openclaw-logs');

      fs.mkdirSync(openclawDir, { recursive: true });

      // Create realistic OpenClaw gateway logs
      const gatewayLogs = [
        '[2m2026-03-19T10:30:00.123Z[0m [[32m[[1mINFO [0m] [1mgateway.starting[0m [36mport[0m=[35m8080[0m [36mversion[0m=[35m1.5.2[0m',
        '[2m2026-03-19T10:30:01.456Z[0m [[32m[[1mINFO [0m] [1mworker.spawn[0m [36mworkerId[0m=[35mworker-1[0m [36mpid[0m=[35m12345[0m',
        '[2m2026-03-19T10:30:02.789Z[0m [[32m[[1mINFO [0m] [1mrequest.incoming[0m [36mmethod[0m=[35mPOST[0m [36murl[0m=[35m/api/invoke[0m [36mrequestId[0m=[35mreq-abc123[0m',
        '[2m2026-03-19T10:30:03.012Z[0m [[32m[[1mINFO [0m] [1msession.created[0m [36msessionId[0m=[35msession-abc123[0m [36mworkerId[0m=[35mworker-1[0m [36mrequestId[0m=[35mreq-abc123[0m',
        '[2m2026-03-19T10:30:04.345Z[0m [[32m[[1mINFO [0m] [1mmodel.selected[0m [36msessionId[0m=[35msession-abc123[0m [36mprovider[0m=[35manthropic[0m [36mmodelId[0m=[35mclaude-3-5-sonnet[0m',
        '[2m2026-03-19T10:30:05.678Z[0m [[32m[[1mINFO [0m] [1mtool.executed[0m [36msessionId[0m=[35msession-abc123[0m [36mtoolName[0m=[35mbash[0m [36mduration[0m=[35m2000[0m',
        '[2m2026-03-19T10:30:06.901Z[0m [[32m[[1mINFO [0m] [1mresponse.completed[0m [36msessionId[0m=[35msession-abc123[0m [36mtokens[0m=[35m401[0m [36mcost[0m=[35m0.0089[0m',
        '[2m2026-03-19T10:30:07.234Z[0m [[31m[[1mERROR[0m] [1mworker.timeout[0m [36mworkerId[0m=[35mworker-2[0m [36msessionId[0m=[35msession-def456[0m [36mtimeout[0m=[35m30000[0m',
        '[2m2026-03-19T10:30:08.567Z[0m [[32m[[1mINFO [0m] [1mworker.recovered[0m [36mworkerId[0m=[35mworker-2[0m [36msessionId[0m=[35msession-def456[0m',
      ].join('\n');

      const gatewayLogFile = path.join(openclawDir, 'openclaw-gateway.log');
      fs.writeFileSync(gatewayLogFile, gatewayLogs);

      // Create clawmetry logs
      const clawmetryLogs = [
        '[2m2026-03-19T10:29:00.000Z[0m [[32m[[1mINFO [0m] [1mclawmetry.starting[0m [36mport[0m=[35m9090[0m [36mversion[0m=[35m0.8.1[0m',
        '[2m2026-03-19T10:29:01.111Z[0m [[32m[[1mINFO [0m] [1mmetrics.collection[0m [36minterval[0m=[35m30000[0m [36mretention[0m=[35m7d[0m',
        '[2m2026-03-19T10:30:00.000Z[0m [[32m[[1mINFO [0m] [1mmetric.recorded[0m [36mtype[0m=[35mrequest_duration[0m [36mvalue[0m=[35m1234[0m [36msessionId[0m=[35msession-abc123[0m',
        '[2m2026-03-19T10:30:01.000Z[0m [[32m[[1mINFO [0m] [1mmetric.recorded[0m [36mtype[0m=[35mtoken_usage[0m [36mvalue[0m=[35m401[0m [36msessionId[0m=[35msession-abc123[0m',
        '[2m2026-03-19T10:30:02.000Z[0m [[33m[[1mWARN [0m] [1mmetric.threshold[0m [36mtype[0m=[35mresponse_time[0m [36mvalue[0m=[35m5000[0m [36mthreshold[0m=[35m3000[0m',
      ].join('\n');

      const clawmetryLogFile = path.join(openclawDir, 'clawmetry.log');
      fs.writeFileSync(clawmetryLogFile, clawmetryLogs);

      server = new DashboardServer({
        port,
        tracesDir,
        dataDirs: [openclawDir],
      });

      await server.start();

      // Wait for log files to be parsed
      await new Promise((resolve) => setTimeout(resolve, 400));

      const traces = server.getTraces();
      expect(traces.length).toBeGreaterThanOrEqual(2);

      // Verify gateway log trace was parsed (universal parser creates traces from log activities)
      const gatewayTrace = traces.find((t) => t.filename === 'openclaw-gateway.log');
      expect(gatewayTrace).toBeDefined();
      expect(gatewayTrace?.nodes.size).toBeGreaterThan(0);

      // Verify clawmetry trace was parsed
      const clawmetryTrace = traces.find((t) => t.filename === 'clawmetry.log');
      expect(clawmetryTrace).toBeDefined();
    });

    it('should correlate sessions across logs and JSONL files', async () => {
      const tracesDir = path.join(tempDir, 'traces');
      const openclawDir = path.join(tempDir, 'openclaw-correlated');

      fs.mkdirSync(openclawDir, { recursive: true });

      const sessionId = 'session-correlated-123';

      // Create session JSONL file
      const sessionDir = path.join(openclawDir, 'agents', 'default', sessionId);
      fs.mkdirSync(sessionDir, { recursive: true });

      const sessionEvents = [
        {
          type: 'session',
          timestamp: '2026-03-19T10:30:00.000Z',
          id: sessionId,
          version: '1.0.0',
        },
        {
          type: 'message',
          timestamp: '2026-03-19T10:30:01.000Z',
          id: `user-${sessionId}`,
          message: {
            role: 'user',
            content: [{ type: 'text', text: 'Test correlation between logs and sessions' }],
          },
        },
        {
          type: 'message',
          timestamp: '2026-03-19T10:30:02.000Z',
          id: `assistant-${sessionId}`,
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: 'I understand. Let me analyze this request.' }],
            usage: { input: 50, output: 30, totalTokens: 80, cost: { total: 0.002 } },
          },
        },
      ];

      const sessionFile = path.join(sessionDir, `${sessionId}.jsonl`);
      fs.writeFileSync(sessionFile, sessionEvents.map((e) => JSON.stringify(e)).join('\n'));

      // Create correlated gateway log
      const gatewayLogs = [
        `[2m2026-03-19T10:29:59.000Z[0m [[32m[[1mINFO [0m] [1mrequest.incoming[0m [36mrequestId[0m=[35mreq-corr-123[0m`,
        `[2m2026-03-19T10:30:00.000Z[0m [[32m[[1mINFO [0m] [1msession.created[0m [36msessionId[0m=[35m${sessionId}[0m [36mrequestId[0m=[35mreq-corr-123[0m`,
        `[2m2026-03-19T10:30:02.500Z[0m [[32m[[1mINFO [0m] [1mresponse.completed[0m [36msessionId[0m=[35m${sessionId}[0m [36mtokens[0m=[35m80[0m [36mcost[0m=[35m0.002[0m`,
      ].join('\n');

      const gatewayLogFile = path.join(openclawDir, 'gateway-correlated.log');
      fs.writeFileSync(gatewayLogFile, gatewayLogs);

      server = new DashboardServer({
        port,
        tracesDir,
        dataDirs: [openclawDir],
      });

      await server.start();
      await new Promise((resolve) => setTimeout(resolve, 400));

      const traces = server.getTraces();

      // Find both traces
      const sessionTrace = traces.find(
        (t) => t.sourceType === 'session' && t.filename?.includes(sessionId),
      );
      const gatewayTrace = traces.find((t) => t.filename === 'gateway-correlated.log');

      expect(sessionTrace).toBeDefined();
      expect(gatewayTrace).toBeDefined();

      // Verify session trace has proper structure
      expect(sessionTrace?.sessionEvents).toBeDefined();

      // Verify gateway trace was parsed with nodes
      if (gatewayTrace) {
        expect(gatewayTrace.nodes.size).toBeGreaterThan(0);
      }
    });
  });

  describe('Real-time updates', () => {
    it('should detect new OpenClaw sessions in real-time', async () => {
      const tracesDir = path.join(tempDir, 'traces');
      const openclawDir = path.join(tempDir, 'openclaw-realtime');

      fs.mkdirSync(openclawDir, { recursive: true });

      server = new DashboardServer({
        port,
        tracesDir,
        dataDirs: [openclawDir],
      });

      await server.start();

      const initialCount = server.getTraces().length;

      // Simulate new session creation
      setTimeout(() => {
        const sessionId = 'session-realtime-456';
        const sessionEvents = [
          {
            type: 'session',
            timestamp: new Date().toISOString(),
            id: sessionId,
            version: '1.0.0',
          },
          {
            type: 'message',
            timestamp: new Date(Date.now() + 1000).toISOString(),
            id: `user-${sessionId}`,
            message: {
              role: 'user',
              content: [{ type: 'text', text: 'Real-time session test' }],
            },
          },
        ];

        const sessionFile = path.join(openclawDir, `realtime-${sessionId}.jsonl`);
        fs.writeFileSync(sessionFile, sessionEvents.map((e) => JSON.stringify(e)).join('\n'));
      }, 100);

      // Wait for file to be detected and processed
      await new Promise((resolve) => setTimeout(resolve, 500));

      const finalCount = server.getTraces().length;
      expect(finalCount).toBeGreaterThan(initialCount);

      const newTrace = server.getTraces().find((t) => t.filename?.includes('realtime-session'));

      expect(newTrace).toBeDefined();
      expect(newTrace?.sourceType).toBe('session');
    });

    it('should update session traces when files are modified', async () => {
      const tracesDir = path.join(tempDir, 'traces');
      const openclawDir = path.join(tempDir, 'openclaw-update');

      fs.mkdirSync(openclawDir, { recursive: true });

      const sessionId = 'session-update-789';
      const sessionFile = path.join(openclawDir, `${sessionId}.jsonl`);

      // Create initial session
      const initialEvents = [
        {
          type: 'session',
          timestamp: new Date().toISOString(),
          id: sessionId,
          version: '1.0.0',
        },
        {
          type: 'message',
          timestamp: new Date(Date.now() + 1000).toISOString(),
          id: `user-${sessionId}`,
          message: {
            role: 'user',
            content: [{ type: 'text', text: 'Initial message' }],
          },
        },
      ];

      fs.writeFileSync(sessionFile, initialEvents.map((e) => JSON.stringify(e)).join('\n'));

      server = new DashboardServer({
        port,
        tracesDir,
        dataDirs: [openclawDir],
      });

      await server.start();
      await new Promise((resolve) => setTimeout(resolve, 200));

      const initialTrace = server.getTrace(`${sessionId}.jsonl`);
      expect(initialTrace).toBeDefined();
      expect(initialTrace?.sessionEvents?.length).toBe(2);

      // Append to session (simulate ongoing conversation)
      setTimeout(() => {
        const updatedEvents = [
          ...initialEvents,
          {
            type: 'message',
            timestamp: new Date(Date.now() + 2000).toISOString(),
            id: `assistant-${sessionId}`,
            message: {
              role: 'assistant',
              content: [{ type: 'text', text: 'Assistant response' }],
              usage: { input: 25, output: 15, totalTokens: 40 },
            },
          },
        ];

        fs.writeFileSync(sessionFile, updatedEvents.map((e) => JSON.stringify(e)).join('\n'));
      }, 100);

      // Wait for update to be processed
      await new Promise((resolve) => setTimeout(resolve, 400));

      const updatedTrace = server.getTrace(`${sessionId}.jsonl`);
      expect(updatedTrace?.sessionEvents?.length).toBe(3);

      // Verify token usage is updated
      expect(updatedTrace?.tokenUsage?.total).toBe(40);

      // Check that assistant message is properly parsed
      const assistantEvent = updatedTrace?.sessionEvents?.find((e) => e.type === 'assistant');
      expect(assistantEvent).toBeDefined();
      expect(assistantEvent?.tokens?.total).toBe(40);
    });
  });

  describe('Timeline generation', () => {
    it('should generate accurate timeline from OpenClaw sessions', async () => {
      const tracesDir = path.join(tempDir, 'traces');
      const openclawDir = path.join(tempDir, 'openclaw-timeline');

      fs.mkdirSync(openclawDir, { recursive: true });

      const sessionId = 'session-timeline-321';

      // Create session with precise timestamps for timeline testing
      const baseTime = new Date('2026-03-19T10:30:00.000Z').getTime();
      const sessionEvents = [
        {
          type: 'session',
          timestamp: new Date(baseTime).toISOString(),
          id: sessionId,
          version: '1.0.0',
        },
        {
          type: 'message',
          timestamp: new Date(baseTime + 1000).toISOString(),
          id: `user-${sessionId}`,
          message: {
            role: 'user',
            content: [{ type: 'text', text: 'Generate timeline visualization data' }],
          },
        },
        {
          type: 'message',
          timestamp: new Date(baseTime + 2000).toISOString(),
          id: `thinking-${sessionId}`,
          message: {
            role: 'assistant',
            content: [
              {
                type: 'thinking',
                thinking: 'I need to analyze this request and determine the best approach...',
              },
            ],
          },
        },
        {
          type: 'message',
          timestamp: new Date(baseTime + 3500).toISOString(),
          id: `tool-call-${sessionId}`,
          message: {
            role: 'assistant',
            content: [
              {
                type: 'toolCall',
                id: `tc-${sessionId}`,
                name: 'data_analysis',
                arguments: { query: 'timeline data', format: 'json' },
              },
            ],
          },
        },
        {
          type: 'message',
          timestamp: new Date(baseTime + 6000).toISOString(),
          id: `tool-result-${sessionId}`,
          message: {
            role: 'toolResult',
            content: [
              {
                type: 'text',
                text: '{"timeline": [{"event": "start", "timestamp": "2026-03-19T10:30:00Z"}]}',
                toolCallId: `tc-${sessionId}`,
              },
            ],
          },
        },
        {
          type: 'message',
          timestamp: new Date(baseTime + 7000).toISOString(),
          id: `assistant-${sessionId}`,
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: 'Here is your timeline visualization data...' }],
            usage: { input: 180, output: 95, totalTokens: 275, cost: { total: 0.0075 } },
          },
        },
      ];

      const sessionFile = path.join(openclawDir, `${sessionId}.jsonl`);
      fs.writeFileSync(sessionFile, sessionEvents.map((e) => JSON.stringify(e)).join('\n'));

      server = new DashboardServer({
        port,
        tracesDir,
        dataDirs: [openclawDir],
      });

      await server.start();
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Get session events via API
      const response = await fetch(`http://localhost:${port}/api/traces/${sessionId}.jsonl/events`);
      const eventsData = await response.json();

      expect(eventsData.events).toBeDefined();
      expect(eventsData.events.length).toBeGreaterThan(5);

      // Verify timeline structure
      const events = eventsData.events;

      // Check event types are properly categorized
      const userEvents = events.filter((e: any) => e.type === 'user');
      const assistantEvents = events.filter((e: any) => e.type === 'assistant');
      const thinkingEvents = events.filter((e: any) => e.type === 'thinking');
      const toolCallEvents = events.filter((e: any) => e.type === 'tool_call');
      const toolResultEvents = events.filter((e: any) => e.type === 'tool_result');

      expect(userEvents.length).toBe(1);
      expect(assistantEvents.length).toBe(1);
      expect(thinkingEvents.length).toBe(1);
      expect(toolCallEvents.length).toBe(1);
      expect(toolResultEvents.length).toBe(1);

      // Verify timeline ordering (chronological)
      for (let i = 1; i < events.length; i++) {
        expect(events[i].timestamp).toBeGreaterThanOrEqual(events[i - 1].timestamp);
      }

      // Verify tool call/result linking
      const toolCall = toolCallEvents[0];
      const toolResult = toolResultEvents[0];
      expect(toolResult.parentId).toBe(toolCall.id);

      // Check duration calculation
      expect(toolResult.duration).toBe(2500); // 6000 - 3500 = 2500ms

      // Verify token usage information
      expect(eventsData.tokenUsage.total).toBe(275);
      expect(eventsData.tokenUsage.cost).toBe(0.0075);
    });

    it('should handle complex session timelines with subagents', async () => {
      const tracesDir = path.join(tempDir, 'traces');
      const openclawDir = path.join(tempDir, 'openclaw-complex');

      fs.mkdirSync(openclawDir, { recursive: true });

      const sessionId = 'session-complex-654';
      const subSessionId = 'session-sub-987';

      // Main session that spawns subagent
      const mainSessionEvents = [
        {
          type: 'session',
          timestamp: '2026-03-19T10:30:00.000Z',
          id: sessionId,
          version: '1.0.0',
        },
        {
          type: 'message',
          timestamp: '2026-03-19T10:30:01.000Z',
          id: `user-${sessionId}`,
          message: {
            role: 'user',
            content: [{ type: 'text', text: 'Complex task requiring subagent delegation' }],
          },
        },
        {
          type: 'custom_message',
          timestamp: '2026-03-19T10:30:03.000Z',
          id: `spawn-${sessionId}`,
          customType: 'openclaw.sessions_yield',
          data: { sessionId: subSessionId },
        },
        {
          type: 'message',
          timestamp: '2026-03-19T10:30:10.000Z',
          id: `final-${sessionId}`,
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: 'Task completed with subagent assistance' }],
            usage: { input: 120, output: 80, totalTokens: 200 },
          },
        },
      ];

      // Subagent session
      const subSessionEvents = [
        {
          type: 'session',
          timestamp: '2026-03-19T10:30:03.500Z',
          id: subSessionId,
          version: '1.0.0',
        },
        {
          type: 'message',
          timestamp: '2026-03-19T10:30:04.000Z',
          id: `sub-user-${subSessionId}`,
          message: {
            role: 'user',
            content: [{ type: 'text', text: 'Delegated subtask from main session' }],
          },
        },
        {
          type: 'message',
          timestamp: '2026-03-19T10:30:08.000Z',
          id: `sub-assistant-${subSessionId}`,
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: 'Subtask completed successfully' }],
            usage: { input: 45, output: 30, totalTokens: 75 },
          },
        },
      ];

      fs.writeFileSync(
        path.join(openclawDir, `${sessionId}.jsonl`),
        mainSessionEvents.map((e) => JSON.stringify(e)).join('\n'),
      );

      fs.writeFileSync(
        path.join(openclawDir, `${subSessionId}.jsonl`),
        subSessionEvents.map((e) => JSON.stringify(e)).join('\n'),
      );

      server = new DashboardServer({
        port,
        tracesDir,
        dataDirs: [openclawDir],
      });

      await server.start();
      await new Promise((resolve) => setTimeout(resolve, 400));

      // Get main session events
      const mainResponse = await fetch(
        `http://localhost:${port}/api/traces/${sessionId}.jsonl/events`,
      );
      const mainEventsData = await mainResponse.json();

      // Get sub session events
      const subResponse = await fetch(
        `http://localhost:${port}/api/traces/${subSessionId}.jsonl/events`,
      );
      const subEventsData = await subResponse.json();

      // Verify main session has spawn event
      const spawnEvent = mainEventsData.events.find((e: any) => e.type === 'spawn');
      expect(spawnEvent).toBeDefined();
      expect(spawnEvent.content).toBe(subSessionId);

      // Verify both sessions are properly parsed
      expect(mainEventsData.tokenUsage.total).toBe(200);
      expect(subEventsData.tokenUsage.total).toBe(75);

      // Check execution graph nodes for subagent
      const mainTrace = server.getTrace(`${sessionId}.jsonl`);
      const subagentNodes = Array.from(mainTrace?.nodes.values()).filter(
        (n) => n.type === 'subagent',
      );
      expect(subagentNodes.length).toBeGreaterThan(0);
    });
  });

  describe('Graph visualization', () => {
    it('should create proper execution graphs from OpenClaw sessions', async () => {
      const tracesDir = path.join(tempDir, 'traces');
      const openclawDir = path.join(tempDir, 'openclaw-graph');

      fs.mkdirSync(openclawDir, { recursive: true });

      const sessionId = 'session-graph-111';

      // Create session with multiple tool calls for complex graph
      const sessionEvents = [
        {
          type: 'session',
          timestamp: '2026-03-19T10:30:00.000Z',
          id: sessionId,
        },
        {
          type: 'message',
          timestamp: '2026-03-19T10:30:01.000Z',
          id: `user-${sessionId}`,
          message: {
            role: 'user',
            content: [{ type: 'text', text: 'Multi-step task requiring graph visualization' }],
          },
        },
        // First tool call
        {
          type: 'message',
          timestamp: '2026-03-19T10:30:02.000Z',
          id: `tc1-${sessionId}`,
          message: {
            role: 'assistant',
            content: [
              {
                type: 'toolCall',
                id: `tool1-${sessionId}`,
                name: 'data_fetch',
                arguments: { source: 'database' },
              },
            ],
          },
        },
        {
          type: 'message',
          timestamp: '2026-03-19T10:30:04.000Z',
          id: `tr1-${sessionId}`,
          message: {
            role: 'toolResult',
            content: [
              {
                type: 'text',
                text: 'Data fetched successfully',
                toolCallId: `tool1-${sessionId}`,
              },
            ],
          },
        },
        // Second tool call
        {
          type: 'message',
          timestamp: '2026-03-19T10:30:05.000Z',
          id: `tc2-${sessionId}`,
          message: {
            role: 'assistant',
            content: [
              {
                type: 'toolCall',
                id: `tool2-${sessionId}`,
                name: 'data_process',
                arguments: { algorithm: 'ml_analysis' },
              },
            ],
          },
        },
        {
          type: 'message',
          timestamp: '2026-03-19T10:30:08.000Z',
          id: `tr2-${sessionId}`,
          message: {
            role: 'toolResult',
            content: [
              {
                type: 'text',
                text: 'Processing completed with 95% accuracy',
                toolCallId: `tool2-${sessionId}`,
              },
            ],
          },
        },
        // Final response
        {
          type: 'message',
          timestamp: '2026-03-19T10:30:09.000Z',
          id: `final-${sessionId}`,
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: 'Analysis complete. Results show...' }],
            usage: { input: 200, output: 150, totalTokens: 350 },
          },
        },
      ];

      const sessionFile = path.join(openclawDir, `${sessionId}.jsonl`);
      fs.writeFileSync(sessionFile, sessionEvents.map((e) => JSON.stringify(e)).join('\n'));

      server = new DashboardServer({
        port,
        tracesDir,
        dataDirs: [openclawDir],
      });

      await server.start();
      await new Promise((resolve) => setTimeout(resolve, 300));

      const trace = server.getTrace(`${sessionId}.jsonl`);
      expect(trace).toBeDefined();

      // Verify execution graph structure
      const nodes = Array.from(trace?.nodes.values());

      // Should have root session node
      const rootNode = nodes.find((n) => n.type === 'agent');
      expect(rootNode).toBeDefined();
      expect(rootNode?.name).toContain('Multi-step task');

      // Should have tool nodes
      const toolNodes = nodes.filter((n) => n.type === 'tool');
      expect(toolNodes.length).toBe(2);

      // Verify tool node details
      const fetchTool = toolNodes.find((n) => n.name === 'data_fetch');
      const processTool = toolNodes.find((n) => n.name === 'data_process');

      expect(fetchTool).toBeDefined();
      expect(processTool).toBeDefined();

      // Check timing and status
      expect(fetchTool?.status).toBe('completed');
      expect(processTool?.status).toBe('completed');

      // Verify parent-child relationships
      expect(fetchTool?.parentId).toBe(rootNode?.id);
      expect(processTool?.parentId).toBe(rootNode?.id);

      // Check edges (session-loaded traces may have empty edges)
      expect(trace?.edges).toBeDefined();

      // Verify metadata includes tool information
      expect(fetchTool?.metadata?.args).toEqual({ source: 'database' });
      expect(processTool?.metadata?.args).toEqual({ algorithm: 'ml_analysis' });
    });

    it('should handle failed tool calls in graph visualization', async () => {
      const tracesDir = path.join(tempDir, 'traces');
      const openclawDir = path.join(tempDir, 'openclaw-failed');

      fs.mkdirSync(openclawDir, { recursive: true });

      const sessionId = 'session-failed-222';

      const sessionEvents = [
        {
          type: 'session',
          timestamp: '2026-03-19T10:30:00.000Z',
          id: sessionId,
        },
        {
          type: 'message',
          timestamp: '2026-03-19T10:30:01.000Z',
          id: `user-${sessionId}`,
          message: {
            role: 'user',
            content: [{ type: 'text', text: 'Task that will encounter errors' }],
          },
        },
        // Successful tool
        {
          type: 'message',
          timestamp: '2026-03-19T10:30:02.000Z',
          id: `tc-success-${sessionId}`,
          message: {
            role: 'assistant',
            content: [
              {
                type: 'toolCall',
                id: `tool-success-${sessionId}`,
                name: 'successful_operation',
                arguments: {},
              },
            ],
          },
        },
        {
          type: 'message',
          timestamp: '2026-03-19T10:30:03.000Z',
          id: `tr-success-${sessionId}`,
          message: {
            role: 'toolResult',
            content: [
              {
                type: 'text',
                text: 'Operation completed successfully',
                toolCallId: `tool-success-${sessionId}`,
              },
            ],
          },
        },
        // Failed tool
        {
          type: 'message',
          timestamp: '2026-03-19T10:30:04.000Z',
          id: `tc-fail-${sessionId}`,
          message: {
            role: 'assistant',
            content: [
              {
                type: 'toolCall',
                id: `tool-fail-${sessionId}`,
                name: 'failing_operation',
                arguments: { risky: true },
              },
            ],
          },
        },
        {
          type: 'message',
          timestamp: '2026-03-19T10:30:06.000Z',
          id: `tr-fail-${sessionId}`,
          message: {
            role: 'toolResult',
            content: [
              {
                type: 'text',
                text: 'Error: Operation failed due to invalid parameters',
                isError: true,
                toolCallId: `tool-fail-${sessionId}`,
              },
            ],
          },
        },
      ];

      const sessionFile = path.join(openclawDir, `${sessionId}.jsonl`);
      fs.writeFileSync(sessionFile, sessionEvents.map((e) => JSON.stringify(e)).join('\n'));

      server = new DashboardServer({
        port,
        tracesDir,
        dataDirs: [openclawDir],
      });

      await server.start();
      await new Promise((resolve) => setTimeout(resolve, 300));

      const trace = server.getTrace(`${sessionId}.jsonl`);
      expect(trace).toBeDefined();

      const nodes = Array.from(trace?.nodes.values());
      const toolNodes = nodes.filter((n) => n.type === 'tool');

      expect(toolNodes.length).toBe(2);

      // Find successful and failed tools
      const successTool = toolNodes.find((n) => n.name === 'successful_operation');
      const failedTool = toolNodes.find((n) => n.name === 'failing_operation');

      expect(successTool?.status).toBe('completed');
      expect(failedTool?.status).toBe('failed');

      // Check error metadata
      expect(failedTool?.metadata?.error).toContain('Operation failed');

      // Verify overall trace status
      expect(trace?.status).toBe('failed');

      // Check stats processing
      const _stats = server.getStats();
      const agentStats = await fetch(`http://localhost:${port}/api/stats/${trace?.agentId}`);
      const agentData = await agentStats.json();

      expect(agentData.failedExecutions).toBeGreaterThan(0);
      expect(agentData.successRate).toBeLessThan(100);
    });
  });
});
