import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import getPort from 'get-port';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DashboardServer } from '../../src/server.js';
import { TestDataGenerator } from '../fixtures/test-data-generator.js';

describe('Performance and Scalability Tests', () => {
  let tempDir: string;
  let server: DashboardServer;
  let port: number;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'performance-test-'));
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

  describe('Large dataset handling', () => {
    it('should handle 1000+ traces efficiently', async () => {
      const tracesDir = path.join(tempDir, 'large-traces');
      fs.mkdirSync(tracesDir, { recursive: true });

      console.log('Generating 1000 test traces...');
      const startGeneration = Date.now();

      await TestDataGenerator.createLargeDataset(tracesDir, 1000);

      const generationTime = Date.now() - startGeneration;
      console.log(`Generation completed in ${generationTime}ms`);

      const startLoad = Date.now();

      server = new DashboardServer({
        port,
        tracesDir,
      });

      await server.start();

      // Wait for all traces to be loaded
      let loadedTraces = 0;
      const maxWaitTime = 30000; // 30 seconds max
      const startWait = Date.now();

      while (loadedTraces < 1000 && Date.now() - startWait < maxWaitTime) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        loadedTraces = server.getTraces().length;

        if (loadedTraces % 100 === 0) {
          console.log(`Loaded ${loadedTraces}/1000 traces...`);
        }
      }

      const loadTime = Date.now() - startLoad;
      const memoryUsage = process.memoryUsage();

      console.log(`Load completed in ${loadTime}ms`);
      console.log(`Memory usage: ${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB heap`);

      // Performance assertions
      expect(loadedTraces).toBeGreaterThanOrEqual(1000);
      expect(loadTime).toBeLessThan(30000); // Should load in under 30 seconds
      expect(memoryUsage.heapUsed).toBeLessThan(500 * 1024 * 1024); // Less than 500MB

      // API performance test
      const apiStartTime = Date.now();
      const response = await fetch(`http://localhost:${port}/api/traces`);
      const json = await response.json();
      const traces = json.traces ?? json;
      const apiTime = Date.now() - apiStartTime;

      expect(traces.length).toBe(loadedTraces);
      expect(apiTime).toBeLessThan(5000); // API response under 5 seconds

      // Stats calculation performance
      const statsStartTime = Date.now();
      const statsResponse = await fetch(`http://localhost:${port}/api/stats`);
      const stats = await statsResponse.json();
      const statsTime = Date.now() - statsStartTime;

      expect(stats.totalExecutions).toBe(1000);
      expect(stats.totalAgents).toBeGreaterThan(40); // Should have ~50 agents
      expect(statsTime).toBeLessThan(3000); // Stats calculation under 3 seconds
    }, 60000); // 60 second timeout for this test

    it('should maintain performance with 10+ concurrent agents', async () => {
      const tracesDir = path.join(tempDir, 'concurrent-agents');
      const agentDirs: string[] = [];

      // Create separate directories for 15 different agents
      for (let agentIndex = 0; agentIndex < 15; agentIndex++) {
        const agentDir = path.join(tempDir, `agent-${agentIndex}`);
        fs.mkdirSync(agentDir, { recursive: true });
        agentDirs.push(agentDir);

        // Create 20 traces per agent
        for (let traceIndex = 0; traceIndex < 20; traceIndex++) {
          const trace = TestDataGenerator.createExecutionGraph({
            agentId: `concurrent-agent-${agentIndex}`,
            nodeCount: Math.floor(Math.random() * 10) + 5,
            failureRate: Math.random() < 0.15 ? 0.3 : 0,
          });

          const traceFile = path.join(agentDir, `trace-${traceIndex}.json`);
          fs.writeFileSync(traceFile, JSON.stringify(trace));
        }
      }

      const startTime = Date.now();

      server = new DashboardServer({
        port,
        tracesDir,
        dataDirs: agentDirs,
      });

      await server.start();

      // Wait for all traces to be loaded
      const expectedTraces = 15 * 20; // 300 total
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const loadedTraces = server.getTraces().length;
      const loadTime = Date.now() - startTime;

      expect(loadedTraces).toBeGreaterThanOrEqual(expectedTraces);
      expect(loadTime).toBeLessThan(15000); // Should handle concurrent loading in under 15s

      // Test concurrent API requests
      const concurrentRequests = await Promise.all([
        fetch(`http://localhost:${port}/api/traces`),
        fetch(`http://localhost:${port}/api/stats`),
        fetch(`http://localhost:${port}/api/agents`),
        fetch(`http://localhost:${port}/api/stats/concurrent-agent-0`),
        fetch(`http://localhost:${port}/api/stats/concurrent-agent-5`),
        fetch(`http://localhost:${port}/api/stats/concurrent-agent-10`),
      ]);

      // All requests should succeed
      for (const response of concurrentRequests) {
        expect(response.status).toBe(200);
      }

      const stats = await concurrentRequests[1].json();
      expect(stats.totalAgents).toBe(15);
      expect(stats.totalExecutions).toBe(expectedTraces);

      // Memory should remain reasonable
      const memoryUsage = process.memoryUsage();
      expect(memoryUsage.heapUsed).toBeLessThan(200 * 1024 * 1024); // Less than 200MB
    });

    it('should handle frequent file updates without performance degradation', async () => {
      const tracesDir = path.join(tempDir, 'frequent-updates');
      fs.mkdirSync(tracesDir, { recursive: true });

      server = new DashboardServer({
        port,
        tracesDir,
      });

      await server.start();

      // Create initial traces
      for (let i = 0; i < 50; i++) {
        const trace = TestDataGenerator.createExecutionGraph({
          agentId: `update-agent-${i % 5}`,
        });

        fs.writeFileSync(path.join(tracesDir, `initial-${i}.json`), JSON.stringify(trace));
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));

      const initialCount = server.getTraces().length;
      expect(initialCount).toBeGreaterThanOrEqual(50);

      // Simulate frequent updates
      const updatePromises: Promise<void>[] = [];
      const updateCount = 100;

      for (let i = 0; i < updateCount; i++) {
        const updatePromise = new Promise<void>((resolve) => {
          setTimeout(() => {
            const trace = TestDataGenerator.createExecutionGraph({
              agentId: `frequent-agent-${i % 10}`,
              nodeCount: Math.floor(Math.random() * 8) + 2,
            });

            fs.writeFileSync(path.join(tracesDir, `frequent-${i}.json`), JSON.stringify(trace));

            resolve();
          }, i * 50); // Stagger updates every 50ms
        });

        updatePromises.push(updatePromise);
      }

      const startUpdate = Date.now();
      await Promise.all(updatePromises);

      // Wait for all updates to be processed
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const updateTime = Date.now() - startUpdate;
      const finalCount = server.getTraces().length;

      expect(finalCount).toBeGreaterThanOrEqual(initialCount + updateCount);
      expect(updateTime).toBeLessThan(10000); // Should handle updates in under 10s

      // API should still be responsive
      const apiStartTime = Date.now();
      const response = await fetch(`http://localhost:${port}/api/traces`);
      const json2 = await response.json();
      const traces = json2.traces ?? json2;
      const apiResponseTime = Date.now() - apiStartTime;

      expect(traces.length).toBeGreaterThanOrEqual(finalCount);
      expect(apiResponseTime).toBeLessThan(2000); // API response under 2 seconds

      // Memory usage should be stable
      const memoryUsage = process.memoryUsage();
      expect(memoryUsage.heapUsed).toBeLessThan(300 * 1024 * 1024); // Less than 300MB
    });
  });

  describe('Memory usage optimization', () => {
    it('should not leak memory with continuous trace processing', async () => {
      const tracesDir = path.join(tempDir, 'memory-test');
      fs.mkdirSync(tracesDir, { recursive: true });

      server = new DashboardServer({
        port,
        tracesDir,
      });

      await server.start();

      const initialMemory = process.memoryUsage().heapUsed;
      const traceCount = 200;
      const batchSize = 20;

      for (let batch = 0; batch < traceCount / batchSize; batch++) {
        // Create batch of traces
        for (let i = 0; i < batchSize; i++) {
          const traceIndex = batch * batchSize + i;
          const trace = TestDataGenerator.createExecutionGraph({
            agentId: `memory-agent-${traceIndex % 10}`,
            nodeCount: Math.floor(Math.random() * 15) + 5,
          });

          fs.writeFileSync(
            path.join(tracesDir, `memory-trace-${traceIndex}.json`),
            JSON.stringify(trace),
          );
        }

        // Wait for batch to be processed
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }

        const currentMemory = process.memoryUsage().heapUsed;
        const memoryGrowth = currentMemory - initialMemory;
        const memoryPerTrace = memoryGrowth / ((batch + 1) * batchSize);

        console.log(`Batch ${batch + 1}: ${memoryPerTrace / 1024}KB per trace`);

        // Memory per trace should be reasonable (less than 50KB per trace)
        expect(memoryPerTrace).toBeLessThan(50 * 1024);
      }

      // Final memory check
      const finalMemory = process.memoryUsage().heapUsed;
      const totalGrowth = finalMemory - initialMemory;

      expect(totalGrowth).toBeLessThan(100 * 1024 * 1024); // Less than 100MB total growth
    });

    it('should efficiently handle large individual trace files', async () => {
      const tracesDir = path.join(tempDir, 'large-traces');
      fs.mkdirSync(tracesDir, { recursive: true });

      // Create traces with many nodes (simulating complex executions)
      const largeTraces = [];
      for (let i = 0; i < 5; i++) {
        const trace = TestDataGenerator.createExecutionGraph({
          agentId: `large-trace-agent-${i}`,
          nodeCount: 100, // Very large trace
          includeTimings: true,
        });

        largeTraces.push(trace);
        fs.writeFileSync(
          path.join(tracesDir, `large-trace-${i}.json`),
          JSON.stringify(trace, null, 2), // Pretty printed for larger size
        );
      }

      const startMemory = process.memoryUsage().heapUsed;

      server = new DashboardServer({
        port,
        tracesDir,
      });

      await server.start();
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const loadedTraces = server.getTraces();
      expect(loadedTraces.length).toBe(5);

      // Verify large traces are properly loaded
      for (const trace of loadedTraces) {
        expect(trace.nodes.size).toBeGreaterThan(50);
      }

      const memoryAfterLoad = process.memoryUsage().heapUsed;
      const memoryIncrease = memoryAfterLoad - startMemory;

      // Should handle large traces without excessive memory usage
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024); // Less than 50MB

      // API performance should remain good
      const apiStart = Date.now();
      const response = await fetch(`http://localhost:${port}/api/traces`);
      const json3 = await response.json();
      const traces = json3.traces ?? json3;
      const apiTime = Date.now() - apiStart;

      expect(traces.length).toBe(5);
      expect(apiTime).toBeLessThan(3000); // Under 3 seconds
    });
  });

  describe('Real-time update latency', () => {
    it('should detect and process new files within acceptable time limits', async () => {
      const tracesDir = path.join(tempDir, 'latency-test');
      fs.mkdirSync(tracesDir, { recursive: true });

      server = new DashboardServer({
        port,
        tracesDir,
      });

      await server.start();

      const latencyMeasurements: number[] = [];

      // Test file detection latency multiple times
      for (let i = 0; i < 10; i++) {
        const trace = TestDataGenerator.createExecutionGraph({
          agentId: `latency-agent-${i}`,
        });

        const createTime = Date.now();
        fs.writeFileSync(path.join(tracesDir, `latency-${i}.json`), JSON.stringify(trace));

        // Poll for trace to appear
        let detectedTime = 0;
        const pollStart = Date.now();
        const maxPollTime = 5000; // 5 seconds max

        while (!detectedTime && Date.now() - pollStart < maxPollTime) {
          await new Promise((resolve) => setTimeout(resolve, 100));

          const traces = server.getTraces();
          const foundTrace = traces.find((t) => t.agentId === `latency-agent-${i}`);

          if (foundTrace) {
            detectedTime = Date.now();
          }
        }

        expect(detectedTime).toBeGreaterThan(0);

        const latency = detectedTime - createTime;
        latencyMeasurements.push(latency);

        console.log(`File ${i}: detected in ${latency}ms`);
      }

      // Calculate latency statistics
      const avgLatency =
        latencyMeasurements.reduce((sum, lat) => sum + lat, 0) / latencyMeasurements.length;
      const maxLatency = Math.max(...latencyMeasurements);

      console.log(`Average latency: ${avgLatency}ms, Max latency: ${maxLatency}ms`);

      // Performance expectations
      expect(avgLatency).toBeLessThan(1000); // Average under 1 second
      expect(maxLatency).toBeLessThan(3000); // Max under 3 seconds
    });

    it('should handle concurrent file operations efficiently', async () => {
      const tracesDir = path.join(tempDir, 'concurrent-files');
      fs.mkdirSync(tracesDir, { recursive: true });

      server = new DashboardServer({
        port,
        tracesDir,
      });

      await server.start();

      // Create many files concurrently
      const concurrentCount = 50;
      const createPromises: Promise<void>[] = [];

      const startTime = Date.now();

      for (let i = 0; i < concurrentCount; i++) {
        const promise = new Promise<void>((resolve) => {
          setTimeout(() => {
            const trace = TestDataGenerator.createExecutionGraph({
              agentId: `concurrent-${i}`,
            });

            fs.writeFileSync(path.join(tracesDir, `concurrent-${i}.json`), JSON.stringify(trace));

            resolve();
          }, Math.random() * 100); // Random timing up to 100ms
        });

        createPromises.push(promise);
      }

      await Promise.all(createPromises);

      // Wait for all files to be processed
      let processedCount = 0;
      const pollStart = Date.now();
      const maxPollTime = 10000; // 10 seconds max

      while (processedCount < concurrentCount && Date.now() - pollStart < maxPollTime) {
        await new Promise((resolve) => setTimeout(resolve, 200));

        const traces = server.getTraces();
        processedCount = traces.filter((t) => t.agentId.startsWith('concurrent-')).length;

        if (processedCount % 10 === 0) {
          console.log(`Processed ${processedCount}/${concurrentCount} concurrent files`);
        }
      }

      const totalTime = Date.now() - startTime;

      expect(processedCount).toBe(concurrentCount);
      expect(totalTime).toBeLessThan(15000); // Should handle concurrent files in under 15 seconds

      // System should remain responsive during concurrent processing
      const apiResponse = await fetch(`http://localhost:${port}/api/stats`);
      expect(apiResponse.status).toBe(200);

      const stats = await apiResponse.json();
      expect(stats.totalExecutions).toBeGreaterThanOrEqual(concurrentCount);
    });
  });

  describe('API performance under load', () => {
    it('should maintain API responsiveness under high request volume', async () => {
      const tracesDir = path.join(tempDir, 'api-load');
      fs.mkdirSync(tracesDir, { recursive: true });

      // Create base dataset
      for (let i = 0; i < 100; i++) {
        const trace = TestDataGenerator.createExecutionGraph({
          agentId: `api-load-agent-${i % 10}`,
          nodeCount: Math.floor(Math.random() * 10) + 3,
        });

        fs.writeFileSync(path.join(tracesDir, `api-load-${i}.json`), JSON.stringify(trace));
      }

      server = new DashboardServer({
        port,
        tracesDir,
      });

      await server.start();
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Simulate high API load
      const requestCount = 100;
      const concurrentRequests = 20;

      const responseTimeMeasurements: number[] = [];

      for (let batch = 0; batch < requestCount / concurrentRequests; batch++) {
        const batchPromises: Promise<number>[] = [];

        for (let i = 0; i < concurrentRequests; i++) {
          const requestPromise = (async () => {
            const endpoints = [
              '/api/traces',
              '/api/stats',
              '/api/agents',
              '/api/stats/api-load-agent-0',
              '/api/stats/api-load-agent-5',
            ];

            const endpoint = endpoints[Math.floor(Math.random() * endpoints.length)];
            const startTime = Date.now();

            const response = await fetch(`http://localhost:${port}${endpoint}`);
            expect(response.status).toBe(200);

            return Date.now() - startTime;
          })();

          batchPromises.push(requestPromise);
        }

        const batchResponseTimes = await Promise.all(batchPromises);
        responseTimeMeasurements.push(...batchResponseTimes);

        console.log(
          `Batch ${batch + 1}: avg ${Math.round(batchResponseTimes.reduce((sum, t) => sum + t, 0) / batchResponseTimes.length)}ms`,
        );
      }

      // Analyze response times
      const avgResponseTime =
        responseTimeMeasurements.reduce((sum, t) => sum + t, 0) / responseTimeMeasurements.length;
      const maxResponseTime = Math.max(...responseTimeMeasurements);
      const p95ResponseTime = responseTimeMeasurements.sort((a, b) => a - b)[
        Math.floor(responseTimeMeasurements.length * 0.95)
      ];

      console.log(
        `API Performance - Avg: ${avgResponseTime}ms, Max: ${maxResponseTime}ms, P95: ${p95ResponseTime}ms`,
      );

      // Performance expectations
      expect(avgResponseTime).toBeLessThan(1000); // Average under 1 second
      expect(p95ResponseTime).toBeLessThan(3000); // 95th percentile under 3 seconds
      expect(maxResponseTime).toBeLessThan(10000); // Max under 10 seconds
    });
  });
});
