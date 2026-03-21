import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import getPort from 'get-port';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DashboardServer } from '../../src/server.js';
import { TestDataGenerator, traceToJson } from '../fixtures/test-data-generator.js';

describe('Multi-Agent Integration Tests', () => {
  let tempDir: string;
  let server: DashboardServer;
  let port: number;

  let origHome: string | undefined;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'multi-agent-test-'));
    port = await getPort();
    TestDataGenerator.resetCounters();
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

  describe('Alfred + OpenClaw concurrent operation', () => {
    it('should handle concurrent Alfred and OpenClaw traces', async () => {
      const tracesDir = path.join(tempDir, 'traces');
      const alfredDir = path.join(tempDir, 'alfred');
      const openclawDir = path.join(tempDir, 'openclaw');

      fs.mkdirSync(tracesDir, { recursive: true });
      fs.mkdirSync(alfredDir, { recursive: true });
      fs.mkdirSync(openclawDir, { recursive: true });

      // Create Alfred traces (AgentFlow JSON format)
      for (let i = 0; i < 3; i++) {
        const alfredTrace = TestDataGenerator.createExecutionGraph({
          agentId: `alfred-${i}`,
          nodeCount: 5 + i,
          trigger: 'cron',
          includeTimings: true,
        });

        fs.writeFileSync(path.join(alfredDir, `alfred-${i}.json`), JSON.stringify(alfredTrace));
      }

      // Create OpenClaw session traces (JSONL format)
      for (let i = 0; i < 2; i++) {
        const sessionTrace = TestDataGenerator.createSessionTrace({
          agentId: `openclaw-${i}`,
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

      // Create OpenClaw log files
      TestDataGenerator.createOpenClawLogs(openclawDir);

      server = new DashboardServer({
        port,
        tracesDir,
        dataDirs: [alfredDir, openclawDir],
      });

      await server.start();

      // Wait for all files to be processed
      await new Promise((resolve) => setTimeout(resolve, 500));

      const traces = server.getTraces();
      expect(traces.length).toBeGreaterThanOrEqual(5);

      // Verify we have both Alfred and OpenClaw traces
      const alfredTraces = traces.filter((t) => t.agentId.startsWith('alfred'));
      const openclawTraces = traces.filter(
        (t) => t.agentId.startsWith('openclaw') || t.sourceType === 'session',
      );

      expect(alfredTraces.length).toBeGreaterThanOrEqual(3);
      expect(openclawTraces.length).toBeGreaterThanOrEqual(2);

      // Verify different source types
      const sourceTypes = new Set(traces.map((t) => t.sourceType));
      expect(sourceTypes.has('trace')).toBe(true);
      expect(sourceTypes.has('session')).toBe(true);

      // Check global stats include both systems
      const stats = server.getStats();
      expect(stats.totalAgents).toBeGreaterThanOrEqual(5);
      expect(stats.totalExecutions).toBeGreaterThanOrEqual(5);
    });

    it('should prevent cross-contamination between agent systems', async () => {
      const tracesDir = path.join(tempDir, 'traces');
      const alfredDir = path.join(tempDir, 'alfred-isolated');
      const openclawDir = path.join(tempDir, 'openclaw-isolated');

      fs.mkdirSync(alfredDir, { recursive: true });
      fs.mkdirSync(openclawDir, { recursive: true });

      // Create Alfred trace with specific metadata
      const alfredTrace = TestDataGenerator.createExecutionGraph({
        agentId: 'alfred-isolated',
        trigger: 'cron',
        nodeCount: 3,
      });
      alfredTrace.metadata = {
        ...alfredTrace.metadata,
        system: 'alfred',
        framework: 'agentflow',
        sweepId: 'sweep-123',
      };

      fs.writeFileSync(path.join(alfredDir, 'alfred-isolated.json'), JSON.stringify(alfredTrace));

      // Create OpenClaw session with different metadata
      const openclawTrace = TestDataGenerator.createSessionTrace({
        agentId: 'openclaw-isolated',
        provider: 'anthropic',
        model: 'claude-3-sonnet',
      });

      const jsonlContent = openclawTrace.sessionEvents
        ?.map((event) =>
          JSON.stringify({
            type: event.type === 'system' ? 'session' : 'message',
            timestamp: new Date(event.timestamp).toISOString(),
            id: event.id,
            ...(event.type === 'system' && {
              version: '1.0.0',
              cwd: '/app/openclaw',
            }),
          }),
        )
        .join('\n');

      fs.writeFileSync(path.join(openclawDir, 'openclaw-isolated.jsonl'), jsonlContent);

      server = new DashboardServer({
        port,
        tracesDir,
        dataDirs: [alfredDir, openclawDir],
      });

      await server.start();
      await new Promise((resolve) => setTimeout(resolve, 300));

      const traces = server.getTraces();

      // Find our specific traces
      const alfredFound = traces.find((t) => t.agentId === 'alfred-isolated');
      const openclawFound = traces.find((t) => t.agentId === 'openclaw-isolated');

      expect(alfredFound).toBeDefined();
      expect(openclawFound).toBeDefined();

      // Verify metadata integrity
      expect(alfredFound?.metadata?.system).toBe('alfred');
      expect(alfredFound?.sourceType).toBe('trace');

      expect(openclawFound?.sourceType).toBe('session');
      expect(openclawFound?.sessionEvents).toBeDefined();

      // Verify agents are treated as separate entities in stats
      const stats = server.getStats();
      const alfredAgent = stats.topAgents.find((a) => a.agentId === 'alfred-isolated');
      const openclawAgent = stats.topAgents.find((a) => a.agentId === 'openclaw-isolated');

      expect(alfredAgent).toBeDefined();
      expect(openclawAgent).toBeDefined();
    });

    it('should handle resource competition gracefully', async () => {
      const tracesDir = path.join(tempDir, 'traces');
      const heavyDir = path.join(tempDir, 'heavy-load');

      fs.mkdirSync(heavyDir, { recursive: true });

      // Create many traces to test resource handling
      const tracePromises = [];
      for (let i = 0; i < 50; i++) {
        const promise = new Promise<void>((resolve) => {
          setImmediate(() => {
            const trace = TestDataGenerator.createExecutionGraph({
              agentId: `heavy-agent-${i % 5}`, // 5 different agents
              nodeCount: Math.floor(Math.random() * 15) + 5,
              failureRate: Math.random() < 0.1 ? 0.3 : 0,
            });

            fs.writeFileSync(path.join(heavyDir, `heavy-${i}.json`), traceToJson(trace as unknown as Record<string, unknown>));
            resolve();
          });
        });
        tracePromises.push(promise);
      }

      await Promise.all(tracePromises);

      const startTime = Date.now();

      server = new DashboardServer({
        port,
        tracesDir,
        dataDirs: [heavyDir],
      });

      await server.start();

      // Wait for all files to be processed
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const loadTime = Date.now() - startTime;
      const traces = server.getTraces();

      // Should load all traces in reasonable time (less than 3 seconds)
      expect(loadTime).toBeLessThan(3000);
      expect(traces.length).toBeGreaterThanOrEqual(50);

      // Memory usage should be reasonable
      const memUsage = process.memoryUsage();
      expect(memUsage.heapUsed).toBeLessThan(100 * 1024 * 1024); // Less than 100MB

      const stats = server.getStats();
      expect(stats.totalExecutions).toBe(50);
      expect(stats.totalAgents).toBe(5);
    });
  });

  describe('Process health monitoring accuracy', () => {
    it('should accurately monitor multi-framework processes', async () => {
      const tracesDir = path.join(tempDir, 'traces');
      const dataDir = path.join(tempDir, 'process-data');

      fs.mkdirSync(dataDir, { recursive: true });

      // Create mock Alfred process files
      const alfredPidFile = path.join(dataDir, 'alfred-daemon.pid');
      const alfredWorkersFile = path.join(dataDir, 'workers.json');

      fs.writeFileSync(alfredPidFile, process.pid.toString());
      fs.writeFileSync(
        alfredWorkersFile,
        JSON.stringify({
          orchestratorPid: process.pid,
          workers: [
            { id: 'worker-1', pid: process.pid + 1000, status: 'running' },
            { id: 'worker-2', pid: process.pid + 2000, status: 'running' },
          ],
        }),
      );

      // Create OpenClaw log files
      TestDataGenerator.createOpenClawLogs(dataDir);

      server = new DashboardServer({
        port,
        tracesDir,
        dataDirs: [dataDir],
      });

      await server.start();

      // Test process health endpoint
      const response = await fetch(`http://localhost:${port}/api/process-health`);
      const healthData = await response.json();

      if (healthData) {
        expect(healthData.osProcesses).toBeDefined();
        expect(Array.isArray(healthData.osProcesses)).toBe(true);

        // Should detect current process (test runner)
        const currentProcess = healthData.osProcesses.find((p: any) => p.pid === process.pid);
        expect(currentProcess).toBeDefined();

        // Should have proper categorization
        expect(healthData.orphans).toBeDefined();
        expect(Array.isArray(healthData.orphans)).toBe(true);
      }
    });

    it('should distinguish between different process types', async () => {
      const tracesDir = path.join(tempDir, 'traces');
      const dataDir = path.join(tempDir, 'process-types');

      fs.mkdirSync(dataDir, { recursive: true });

      // Create mock process scenarios
      const _mockProcesses = [
        { name: 'alfred-daemon', cmdline: 'node alfred-daemon.js' },
        { name: 'openclaw-gateway', cmdline: 'openclaw --port 8080' },
        { name: 'clawmetry-collector', cmdline: 'clawmetry collect' },
        { name: 'unrelated-process', cmdline: 'some-other-service' },
      ];

      server = new DashboardServer({
        port,
        tracesDir,
        dataDirs: [dataDir],
      });

      await server.start();

      const response = await fetch(`http://localhost:${port}/api/process-health`);
      const healthData = await response.json();

      // Verify process categorization logic works
      if (healthData?.osProcesses) {
        // Check that problems array is properly populated
        expect(healthData.problems).toBeDefined();
        expect(Array.isArray(healthData.problems)).toBe(true);

        // In test environment, we expect certain warnings
        const hasOpenClawWarning = healthData.problems.some(
          (p: string) => p.includes('OpenClaw') || p.includes('clawmetry'),
        );
        expect(hasOpenClawWarning).toBe(true);
      }
    });
  });

  describe('Real-time collaboration scenarios', () => {
    it('should handle simultaneous updates from multiple agents', async () => {
      const tracesDir = path.join(tempDir, 'traces');
      const alfredDir = path.join(tempDir, 'alfred-collab');
      const openclawDir = path.join(tempDir, 'openclaw-collab');

      fs.mkdirSync(alfredDir, { recursive: true });
      fs.mkdirSync(openclawDir, { recursive: true });

      server = new DashboardServer({
        port,
        tracesDir,
        dataDirs: [alfredDir, openclawDir],
      });

      await server.start();

      // Simulate concurrent file writes
      const concurrentWrites = [];

      // Alfred writing traces
      for (let i = 0; i < 5; i++) {
        const writePromise = new Promise<void>((resolve) => {
          setTimeout(() => {
            const trace = TestDataGenerator.createExecutionGraph({
              agentId: `alfred-concurrent-${i}`,
              trigger: 'api-call',
            });

            fs.writeFileSync(
              path.join(alfredDir, `concurrent-alfred-${i}.json`),
              JSON.stringify(trace),
            );
            resolve();
          }, i * 100);
        });

        concurrentWrites.push(writePromise);
      }

      // OpenClaw writing sessions
      for (let i = 0; i < 3; i++) {
        const writePromise = new Promise<void>((resolve) => {
          setTimeout(() => {
            const sessionTrace = TestDataGenerator.createSessionTrace({
              agentId: `openclaw-concurrent-${i}`,
            });

            const jsonlContent = sessionTrace.sessionEvents
              ?.map((event) =>
                JSON.stringify({
                  type: event.type === 'system' ? 'session' : 'message',
                  timestamp: new Date(event.timestamp).toISOString(),
                  id: event.id,
                }),
              )
              .join('\n');

            fs.writeFileSync(path.join(openclawDir, `concurrent-session-${i}.jsonl`), jsonlContent);
            resolve();
          }, i * 150);
        });

        concurrentWrites.push(writePromise);
      }

      await Promise.all(concurrentWrites);

      // Wait for all files to be processed
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const traces = server.getTraces();
      expect(traces.length).toBeGreaterThanOrEqual(8);

      // Verify all agent types are present
      const alfredTraces = traces.filter((t) => t.agentId.includes('alfred-concurrent'));
      const openclawTraces = traces.filter((t) => t.agentId.includes('openclaw-concurrent'));

      expect(alfredTraces.length).toBe(5);
      expect(openclawTraces.length).toBe(3);

      // Check stats integrity
      const stats = server.getStats();
      expect(stats.totalExecutions).toBeGreaterThanOrEqual(8);
      expect(stats.totalAgents).toBeGreaterThanOrEqual(8);
    });

    it('should maintain correct agent isolation during updates', async () => {
      const tracesDir = path.join(tempDir, 'traces');

      server = new DashboardServer({
        port,
        tracesDir,
      });

      await server.start();

      // Create initial traces for different agents
      const agents = ['agent-A', 'agent-B', 'agent-C'];

      for (const agentId of agents) {
        for (let i = 0; i < 3; i++) {
          const trace = TestDataGenerator.createExecutionGraph({
            agentId,
            nodeCount: 3 + i,
            trigger: `trigger-${i}`,
          });

          fs.writeFileSync(path.join(tracesDir, `${agentId}-${i}.json`), traceToJson(trace as unknown as Record<string, unknown>));
        }
      }

      // Wait for initial load
      await new Promise((resolve) => setTimeout(resolve, 300));

      const initialStats = server.getStats();
      expect(initialStats.totalAgents).toBe(3);
      expect(initialStats.totalExecutions).toBe(9);

      // Update one agent's traces
      const updatedTrace = TestDataGenerator.createExecutionGraph({
        agentId: 'agent-A',
        nodeCount: 10,
        failureRate: 0.2,
      });

      fs.writeFileSync(path.join(tracesDir, 'agent-A-updated.json'), JSON.stringify(updatedTrace));

      // Wait for update
      await new Promise((resolve) => setTimeout(resolve, 200));

      const updatedStats = server.getStats();

      // Agent count should remain the same, but executions should increase
      expect(updatedStats.totalAgents).toBe(3);
      expect(updatedStats.totalExecutions).toBe(10);

      // Verify agent-specific stats
      const agentAStats = await fetch(`http://localhost:${port}/api/stats/agent-A`);
      const agentAData = await agentAStats.json();

      expect(agentAData.totalExecutions).toBe(4); // 3 original + 1 updated
      expect(agentAData.triggers).toHaveProperty('trigger-0');
      expect(agentAData.triggers).toHaveProperty('trigger-1');
      expect(agentAData.triggers).toHaveProperty('trigger-2');
      expect(agentAData.triggers).toHaveProperty('test'); // Default from updated trace
    });
  });

  describe('Data consistency across formats', () => {
    it('should maintain consistent agent metrics across JSON and JSONL formats', async () => {
      const tracesDir = path.join(tempDir, 'traces');
      const sessionDir = path.join(tempDir, 'sessions');

      fs.mkdirSync(tracesDir, { recursive: true });
      fs.mkdirSync(sessionDir, { recursive: true });

      const agentId = 'hybrid-agent';

      // Create AgentFlow JSON trace
      const jsonTrace = TestDataGenerator.createExecutionGraph({
        agentId,
        nodeCount: 5,
        trigger: 'cron',
        includeTimings: true,
      });

      fs.writeFileSync(path.join(tracesDir, 'hybrid-json.json'), traceToJson(jsonTrace as unknown as Record<string, unknown>));

      // Create JSONL session trace for same agent
      const sessionTrace = TestDataGenerator.createSessionTrace({
        agentId,
        provider: 'anthropic',
        model: 'claude-3-sonnet',
      });

      const jsonlContent = sessionTrace.sessionEvents
        ?.map((event) =>
          JSON.stringify({
            type: event.type === 'system' ? 'session' : 'message',
            timestamp: new Date(event.timestamp).toISOString(),
            id: event.id,
          }),
        )
        .join('\n');

      fs.writeFileSync(path.join(sessionDir, 'hybrid-session.jsonl'), jsonlContent);

      server = new DashboardServer({
        port,
        tracesDir,
        dataDirs: [sessionDir],
      });

      await server.start();
      await new Promise((resolve) => setTimeout(resolve, 300));

      const traces = server.getTraces();
      const hybridTraces = traces.filter((t) => t.agentId === agentId);

      expect(hybridTraces.length).toBe(2);

      // Verify both formats are present
      const jsonTraceLoaded = hybridTraces.find((t) => t.sourceType === 'trace');
      const sessionTraceLoaded = hybridTraces.find((t) => t.sourceType === 'session');

      expect(jsonTraceLoaded).toBeDefined();
      expect(sessionTraceLoaded).toBeDefined();

      // Check agent stats consolidation
      const agentStatsResponse = await fetch(`http://localhost:${port}/api/stats/${agentId}`);
      const agentStats = await agentStatsResponse.json();

      expect(agentStats.totalExecutions).toBe(2);
      expect(agentStats.agentId).toBe(agentId);

      // Verify trigger tracking
      expect(agentStats.triggers).toHaveProperty('cron');
      expect(agentStats.triggers).toHaveProperty('session');
    });

    it('should handle mixed success/failure rates consistently', async () => {
      const tracesDir = path.join(tempDir, 'traces');

      server = new DashboardServer({
        port,
        tracesDir,
      });

      await server.start();

      const agentId = 'mixed-results-agent';

      // Create successful JSON trace
      const successTrace = TestDataGenerator.createExecutionGraph({
        agentId,
        nodeCount: 4,
        failureRate: 0,
      });

      fs.writeFileSync(path.join(tracesDir, 'success.json'), JSON.stringify(successTrace));

      // Create failed JSON trace
      const failTrace = TestDataGenerator.createExecutionGraph({
        agentId,
        nodeCount: 3,
        failureRate: 1,
      });

      fs.writeFileSync(path.join(tracesDir, 'failure.json'), JSON.stringify(failTrace));

      // Create session with tool error
      const sessionTrace = TestDataGenerator.createSessionTrace({
        agentId,
      });

      // Modify session events to include an error
      sessionTrace.sessionEvents?.push({
        type: 'tool_result',
        timestamp: Date.now(),
        name: 'Tool Result',
        toolError: 'Mock tool error',
        id: 'error-result',
        parentId: 'tool-call-1',
      });

      const jsonlContent = sessionTrace.sessionEvents
        ?.map((event) =>
          JSON.stringify({
            type: 'message',
            timestamp: new Date(event.timestamp).toISOString(),
            id: event.id,
            parentId: event.parentId,
            ...(event.type === 'tool_result' &&
              event.toolError && {
                message: {
                  role: 'toolResult',
                  content: [
                    {
                      type: 'text',
                      text: event.toolError,
                      isError: true,
                      toolCallId: event.parentId,
                    },
                  ],
                },
              }),
          }),
        )
        .join('\n');

      fs.writeFileSync(path.join(tracesDir, 'session-error.jsonl'), jsonlContent);

      await new Promise((resolve) => setTimeout(resolve, 400));

      // Check stats
      const agentStatsResponse = await fetch(`http://localhost:${port}/api/stats/${agentId}`);
      const agentStats = await agentStatsResponse.json();

      expect(agentStats.totalExecutions).toBe(3);
      expect(agentStats.successfulExecutions).toBe(1);
      expect(agentStats.failedExecutions).toBe(2);
      expect(agentStats.successRate).toBeCloseTo(33.33, 1);

      // Verify global stats reflect the mixed results
      const globalStats = server.getStats();
      expect(globalStats.globalSuccessRate).toBeLessThan(100);
      expect(globalStats.globalSuccessRate).toBeGreaterThan(0);
    });
  });
});
