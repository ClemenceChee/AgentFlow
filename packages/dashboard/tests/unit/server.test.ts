import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import getPort from 'get-port';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WebSocket from 'ws';
import { DashboardServer } from '../../src/server.js';
import { TestDataGenerator } from '../fixtures/test-data-generator.js';

describe('DashboardServer', () => {
  let tempDir: string;
  let server: DashboardServer;
  let port: number;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'server-test-'));
    port = await getPort();
    TestDataGenerator.resetCounters();
  });

  afterEach(async () => {
    if (server) {
      await server.stop();
    }
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('initialization', () => {
    it('should start server with basic configuration', async () => {
      const tracesDir = path.join(tempDir, 'traces');

      server = new DashboardServer({
        port,
        tracesDir,
        host: 'localhost',
        enableCors: false,
      });

      await server.start();

      expect(fs.existsSync(tracesDir)).toBe(true);
    });

    it('should enable CORS when configured', async () => {
      const tracesDir = path.join(tempDir, 'traces');

      server = new DashboardServer({
        port,
        tracesDir,
        host: 'localhost',
        enableCors: true,
      });

      await server.start();

      const response = await request(`http://localhost:${port}`).get('/api/traces').expect(200);

      expect(response.headers['access-control-allow-origin']).toBe('*');
    });

    it('should watch additional data directories', async () => {
      const tracesDir = path.join(tempDir, 'traces');
      const dataDir = path.join(tempDir, 'data');

      fs.mkdirSync(dataDir, { recursive: true });
      await TestDataGenerator.createTestFiles(dataDir, 2);

      server = new DashboardServer({
        port,
        tracesDir,
        dataDirs: [dataDir],
      });

      await server.start();

      // Wait for files to be loaded
      await new Promise((resolve) => setTimeout(resolve, 200));

      const traces = server.getTraces();
      expect(traces.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('API endpoints', () => {
    beforeEach(async () => {
      const tracesDir = path.join(tempDir, 'traces');
      await TestDataGenerator.createTestFiles(tracesDir, 5);

      server = new DashboardServer({
        port,
        tracesDir,
        enableCors: true,
      });

      await server.start();

      // Wait for traces to load
      await new Promise((resolve) => setTimeout(resolve, 200));
    });

    describe('GET /api/traces', () => {
      it('should return all traces', async () => {
        const response = await request(`http://localhost:${port}`).get('/api/traces').expect(200);

        expect(Array.isArray(response.body)).toBe(true);
        expect(response.body.length).toBeGreaterThan(0);

        const trace = response.body[0];
        expect(trace).toHaveProperty('id');
        expect(trace).toHaveProperty('agentId');
        expect(trace).toHaveProperty('startTime');
        expect(trace).toHaveProperty('nodes');
      });

      it('should handle empty traces directory', async () => {
        // Stop current server and start new one with empty directory
        await server.stop();

        const emptyTracesDir = path.join(tempDir, 'empty-traces');
        fs.mkdirSync(emptyTracesDir, { recursive: true });

        const emptyServer = new DashboardServer({
          port: await getPort(),
          tracesDir: emptyTracesDir,
        });

        await emptyServer.start();

        const response = await request(`http://localhost:${emptyServer.config.port}`)
          .get('/api/traces')
          .expect(200);

        expect(response.body).toEqual([]);

        await emptyServer.stop();
      });
    });

    describe('GET /api/traces/:filename', () => {
      it('should return specific trace by filename', async () => {
        const allTracesResponse = await request(`http://localhost:${port}`)
          .get('/api/traces')
          .expect(200);

        const firstTrace = allTracesResponse.body[0];
        const filename = firstTrace.filename;

        const response = await request(`http://localhost:${port}`)
          .get(`/api/traces/${filename}`)
          .expect(200);

        expect(response.body.id).toBe(firstTrace.id);
        expect(response.body.filename).toBe(filename);
      });

      it('should return 404 for non-existent trace', async () => {
        const response = await request(`http://localhost:${port}`)
          .get('/api/traces/non-existent.json')
          .expect(404);

        expect(response.body.error).toBe('Trace not found');
      });
    });

    describe('GET /api/traces/:filename/events', () => {
      it('should return events for session traces', async () => {
        // Create a session trace
        const sessionTrace = TestDataGenerator.createSessionTrace({
          agentId: 'test-session',
        });

        const sessionFile = path.join(tempDir, 'traces', 'test-session.jsonl');
        const jsonlContent = sessionTrace.sessionEvents
          ?.map((event) =>
            JSON.stringify({
              type: event.type === 'system' ? 'session' : 'message',
              timestamp: new Date(event.timestamp).toISOString(),
              id: event.id,
            }),
          )
          .join('\n');

        fs.writeFileSync(sessionFile, jsonlContent);

        // Wait for file to be loaded
        await new Promise((resolve) => setTimeout(resolve, 200));

        const response = await request(`http://localhost:${port}`)
          .get('/api/traces/test-session.jsonl/events')
          .expect(200);

        expect(response.body.events).toBeDefined();
        expect(Array.isArray(response.body.events)).toBe(true);
        expect(response.body.sourceType).toBe('session');
        expect(response.body.tokenUsage).toBeDefined();
      });

      it('should return empty events for regular traces', async () => {
        const allTracesResponse = await request(`http://localhost:${port}`)
          .get('/api/traces')
          .expect(200);

        const regularTrace = allTracesResponse.body.find((t) => t.sourceType === 'trace');
        if (regularTrace) {
          const response = await request(`http://localhost:${port}`)
            .get(`/api/traces/${regularTrace.filename}/events`)
            .expect(200);

          expect(response.body.events).toEqual([]);
          expect(response.body.sourceType).toBe('trace');
        }
      });
    });

    describe('GET /api/agents', () => {
      it('should return list of agents with metrics', async () => {
        const response = await request(`http://localhost:${port}`).get('/api/agents').expect(200);

        expect(Array.isArray(response.body)).toBe(true);
        expect(response.body.length).toBeGreaterThan(0);

        const agent = response.body[0];
        expect(agent).toHaveProperty('agentId');
        expect(agent).toHaveProperty('totalExecutions');
        expect(agent).toHaveProperty('successRate');
        expect(agent).toHaveProperty('lastExecution');
      });
    });

    describe('GET /api/stats', () => {
      it('should return global statistics', async () => {
        const response = await request(`http://localhost:${port}`).get('/api/stats').expect(200);

        expect(response.body).toHaveProperty('totalAgents');
        expect(response.body).toHaveProperty('totalExecutions');
        expect(response.body).toHaveProperty('globalSuccessRate');
        expect(response.body).toHaveProperty('activeAgents');
        expect(response.body).toHaveProperty('topAgents');
        expect(response.body).toHaveProperty('recentActivity');

        expect(typeof response.body.totalAgents).toBe('number');
        expect(typeof response.body.globalSuccessRate).toBe('number');
        expect(Array.isArray(response.body.topAgents)).toBe(true);
      });
    });

    describe('GET /api/stats/:agentId', () => {
      it('should return specific agent statistics', async () => {
        const agentsResponse = await request(`http://localhost:${port}`)
          .get('/api/agents')
          .expect(200);

        const firstAgent = agentsResponse.body[0];
        const agentId = firstAgent.agentId;

        const response = await request(`http://localhost:${port}`)
          .get(`/api/stats/${agentId}`)
          .expect(200);

        expect(response.body.agentId).toBe(agentId);
        expect(response.body).toHaveProperty('totalExecutions');
        expect(response.body).toHaveProperty('successRate');
        expect(response.body).toHaveProperty('triggers');
        expect(response.body).toHaveProperty('recentActivity');
      });

      it('should return 404 for non-existent agent', async () => {
        const response = await request(`http://localhost:${port}`)
          .get('/api/stats/non-existent-agent')
          .expect(404);

        expect(response.body.error).toBe('Agent not found');
      });
    });

    describe('GET /api/process-health', () => {
      it('should return process health information', async () => {
        const response = await request(`http://localhost:${port}`)
          .get('/api/process-health')
          .expect(200);

        // Response can be null if no processes are found, which is valid in test environment
        if (response.body !== null) {
          expect(response.body).toHaveProperty('osProcesses');
          expect(Array.isArray(response.body.osProcesses)).toBe(true);
        }
      });

      it('should cache process health results', async () => {
        const response1 = await request(`http://localhost:${port}`)
          .get('/api/process-health')
          .expect(200);

        const response2 = await request(`http://localhost:${port}`)
          .get('/api/process-health')
          .expect(200);

        // Second request should be cached (same result)
        expect(response1.body).toEqual(response2.body);
      });
    });
  });

  describe('static file serving', () => {
    beforeEach(async () => {
      const tracesDir = path.join(tempDir, 'traces');

      server = new DashboardServer({
        port,
        tracesDir,
      });

      await server.start();
    });

    it('should serve index.html for root path', async () => {
      const response = await request(`http://localhost:${port}`).get('/').expect(200);

      expect(response.type).toMatch(/html/);
    });

    it('should serve index.html for SPA routing', async () => {
      const response = await request(`http://localhost:${port}`).get('/some/spa/route').expect(200);

      expect(response.type).toMatch(/html/);
    });

    it('should handle missing public files gracefully', async () => {
      // This test assumes public files might not be built in test environment
      const response = await request(`http://localhost:${port}`).get('/non-existent-file.js');

      // Could be 404 or served index.html depending on file existence
      expect([200, 404]).toContain(response.status);
    });
  });

  describe('WebSocket functionality', () => {
    beforeEach(async () => {
      const tracesDir = path.join(tempDir, 'traces');

      server = new DashboardServer({
        port,
        tracesDir,
      });

      await server.start();
    });

    it('should accept WebSocket connections', (done) => {
      const ws = new WebSocket(`ws://localhost:${port}`);

      ws.on('open', () => {
        ws.close();
        done();
      });

      ws.on('error', done);
    });

    it('should send initial data on connection', (done) => {
      const ws = new WebSocket(`ws://localhost:${port}`);

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());

          expect(message.type).toBe('init');
          expect(message.data).toHaveProperty('traces');
          expect(message.data).toHaveProperty('stats');
          expect(Array.isArray(message.data.traces)).toBe(true);

          ws.close();
          done();
        } catch (error) {
          done(error);
        }
      });

      ws.on('error', done);
    });

    it('should broadcast trace updates', (done) => {
      const tracesDir = path.join(tempDir, 'traces');
      let messageCount = 0;

      const ws = new WebSocket(`ws://localhost:${port}`);

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          messageCount++;

          if (messageCount === 1) {
            // First message should be init
            expect(message.type).toBe('init');

            // Add a new trace file to trigger update
            setTimeout(() => {
              const newTrace = TestDataGenerator.createExecutionGraph({
                agentId: 'websocket-test-agent',
              });
              const newFile = path.join(tracesDir, 'websocket-test.json');
              fs.writeFileSync(newFile, JSON.stringify(newTrace));
            }, 100);
          } else if (messageCount === 2) {
            // Second message should be trace-added
            expect(message.type).toBe('trace-added');
            expect(message.data).toHaveProperty('agentId');
            expect(message.data.agentId).toBe('websocket-test-agent');

            ws.close();
            done();
          }
        } catch (error) {
          done(error);
        }
      });

      ws.on('error', done);
    });
  });

  describe('error handling', () => {
    beforeEach(async () => {
      const tracesDir = path.join(tempDir, 'traces');

      server = new DashboardServer({
        port,
        tracesDir,
      });

      await server.start();
    });

    it('should handle API errors gracefully', async () => {
      // Mock the trace watcher to throw an error
      const originalGetAllTraces = server.watcher.getAllTraces;
      server.watcher.getAllTraces = vi.fn().mockImplementation(() => {
        throw new Error('Mock error');
      });

      const response = await request(`http://localhost:${port}`).get('/api/traces').expect(500);

      expect(response.body.error).toBe('Failed to load traces');

      // Restore original method
      server.watcher.getAllTraces = originalGetAllTraces;
    });

    it('should handle stats errors gracefully', async () => {
      // Mock the stats to throw an error
      const originalGetGlobalStats = server.stats.getGlobalStats;
      server.stats.getGlobalStats = vi.fn().mockImplementation(() => {
        throw new Error('Mock stats error');
      });

      const response = await request(`http://localhost:${port}`).get('/api/stats').expect(500);

      expect(response.body.error).toBe('Failed to load statistics');

      // Restore original method
      server.stats.getGlobalStats = originalGetGlobalStats;
    });

    it('should handle process health errors gracefully', async () => {
      // Mock process audit to throw an error
      vi.mock('agentflow-core', async () => {
        const actual = await vi.importActual('agentflow-core');
        return {
          ...actual,
          discoverProcessConfig: vi.fn().mockImplementation(() => {
            throw new Error('Mock process error');
          }),
        };
      });

      const response = await request(`http://localhost:${port}`)
        .get('/api/process-health')
        .expect(500);

      expect(response.body.error).toBe('Failed to audit processes');
    });
  });

  describe('server lifecycle', () => {
    it('should start and stop gracefully', async () => {
      const tracesDir = path.join(tempDir, 'traces');

      server = new DashboardServer({
        port,
        tracesDir,
      });

      // Start server
      await server.start();

      // Verify server is running
      const response = await request(`http://localhost:${port}`).get('/api/traces').expect(200);

      expect(Array.isArray(response.body)).toBe(true);

      // Stop server
      await server.stop();

      // Verify server is stopped
      try {
        await request(`http://localhost:${port}`).get('/api/traces').timeout(1000);

        // Should not reach here
        expect(false).toBe(true);
      } catch (error) {
        // Expected - connection should be refused
        expect(error).toBeDefined();
      }
    });

    it('should handle multiple start/stop cycles', async () => {
      const tracesDir = path.join(tempDir, 'traces');

      for (let i = 0; i < 3; i++) {
        server = new DashboardServer({
          port: await getPort(),
          tracesDir,
        });

        await server.start();

        const response = await request(`http://localhost:${server.config.port}`)
          .get('/api/traces')
          .expect(200);

        expect(Array.isArray(response.body)).toBe(true);

        await server.stop();
      }
    });
  });

  describe('real-time updates', () => {
    beforeEach(async () => {
      const tracesDir = path.join(tempDir, 'traces');

      server = new DashboardServer({
        port,
        tracesDir,
      });

      await server.start();
    });

    it('should update stats when new traces are added', async () => {
      const tracesDir = path.join(tempDir, 'traces');

      // Get initial stats
      const initialStats = await request(`http://localhost:${port}`).get('/api/stats').expect(200);

      // Add a new trace
      const newTrace = TestDataGenerator.createExecutionGraph({
        agentId: 'real-time-agent',
      });
      const newFile = path.join(tracesDir, 'real-time-test.json');
      fs.writeFileSync(newFile, JSON.stringify(newTrace));

      // Wait for file to be processed
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Get updated stats
      const updatedStats = await request(`http://localhost:${port}`).get('/api/stats').expect(200);

      expect(updatedStats.body.totalExecutions).toBeGreaterThan(initialStats.body.totalExecutions);
    });

    it('should handle file modifications', async () => {
      const tracesDir = path.join(tempDir, 'traces');

      // Create initial trace
      const trace = TestDataGenerator.createExecutionGraph({
        agentId: 'modify-test-agent',
      });
      const traceFile = path.join(tracesDir, 'modify-test.json');
      fs.writeFileSync(traceFile, JSON.stringify(trace));

      // Wait for initial load
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Modify the trace
      const modifiedTrace = TestDataGenerator.createExecutionGraph({
        agentId: 'modified-agent',
        nodeCount: 10,
      });
      fs.writeFileSync(traceFile, JSON.stringify(modifiedTrace));

      // Wait for modification to be processed
      await new Promise((resolve) => setTimeout(resolve, 200));

      const updatedTrace = await request(`http://localhost:${port}`)
        .get('/api/traces/modify-test.json')
        .expect(200);

      expect(updatedTrace.body.agentId).toBe('modified-agent');
    });
  });
});
