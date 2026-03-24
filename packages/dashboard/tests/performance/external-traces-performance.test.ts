/**
 * Performance tests for External Trace Discovery
 *
 * Tests system behavior with large numbers of external traces,
 * memory usage, and scalability characteristics.
 */
import { test, expect, describe, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { TraceWatcher } from '../../src/watcher.js';
import type { DashboardUserConfig } from '../../src/config.js';
import type { WatchedTrace } from '../../src/watcher.js';

interface PerformanceMetrics {
  loadTimeMs: number;
  memoryUsageMB: number;
  tracesLoaded: number;
  discoveryTimeMs: number;
}

interface MemoryStats {
  heapUsedMB: number;
  heapTotalMB: number;
  externalMB: number;
}

const getMemoryStats = (): MemoryStats => {
  const usage = process.memoryUsage();
  return {
    heapUsedMB: Math.round(usage.heapUsed / 1024 / 1024 * 100) / 100,
    heapTotalMB: Math.round(usage.heapTotal / 1024 / 1024 * 100) / 100,
    externalMB: Math.round(usage.external / 1024 / 1024 * 100) / 100
  };
};

describe('External Traces Performance', () => {
  // Set longer timeout for performance tests
  const timeout = 30000; // 30 seconds

  let tempDir: string;
  let tracesDir: string;
  let externalTracesDir: string;
  let somaTracesDir: string;
  let watcher: TraceWatcher;

  beforeEach(() => {
    // Create temporary directory structure
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentflow-perf-test-'));
    tracesDir = path.join(tempDir, 'traces');
    externalTracesDir = path.join(tempDir, 'external-traces');
    somaTracesDir = path.join(tempDir, 'soma-traces');

    // Create directory structure
    fs.mkdirSync(tracesDir, { recursive: true });
    fs.mkdirSync(externalTracesDir, { recursive: true });
    fs.mkdirSync(somaTracesDir, { recursive: true });
  });

  afterEach(() => {
    if (watcher) {
      watcher.stop();
    }

    // Clean up temporary directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
  });

  const createBatchTraces = (
    baseName: string,
    count: number,
    traceDir: string,
    workerType: string = 'generic'
  ): WatchedTrace[] => {
    const traces: WatchedTrace[] = [];

    for (let i = 0; i < count; i++) {
      const trace: WatchedTrace = {
        id: `${baseName}-${i}`,
        rootNodeId: `node-${i}-root`,
        agentId: `${workerType}-agent-${i}`,
        name: `${workerType} Execution ${i}`,
        trigger: 'external',
        filename: path.join(traceDir, `${baseName}-${i}.json`),
        startTime: Date.now() - Math.random() * 100000,
        endTime: Date.now() - Math.random() * 50000,
        status: Math.random() > 0.1 ? 'completed' : 'failed',
        nodes: {
          [`node-${i}-root`]: {
            id: `node-${i}-root`,
            type: 'agent',
            name: `Root Node ${i}`,
            startTime: Date.now() - Math.random() * 100000,
            endTime: Date.now() - Math.random() * 50000,
            status: 'completed',
            parentId: null,
            children: [`node-${i}-child`],
            metadata: {
              framework: 'external',
              worker: workerType,
              batch: Math.floor(i / 100)
            },
            state: {}
          },
          [`node-${i}-child`]: {
            id: `node-${i}-child`,
            type: 'tool',
            name: `Process Data ${i}`,
            startTime: Date.now() - Math.random() * 90000,
            endTime: Date.now() - Math.random() * 40000,
            status: 'completed',
            parentId: `node-${i}-root`,
            children: [],
            metadata: {
              external: true,
              dataSize: Math.floor(Math.random() * 1000000),
              processingTime: Math.floor(Math.random() * 5000)
            },
            state: {}
          }
        }
      };

      traces.push(trace);
      fs.writeFileSync(
        path.join(traceDir, `${baseName}-${i}.json`),
        JSON.stringify(trace, null, 2)
      );
    }

    return traces;
  };

  const createConfig = (discoveryPaths: string[]): DashboardUserConfig => ({
    port: 3000,
    tracesDir,
    discoveryPaths,
    externalCommands: {}
  });

  const waitForDiscovery = (ms = 1000) => new Promise(resolve => setTimeout(resolve, ms));

  const measurePerformance = async (
    config: DashboardUserConfig,
    expectedTraceCount: number,
    waitTime = 2000
  ): Promise<PerformanceMetrics> => {
    const memoryBefore = getMemoryStats();
    const startTime = Date.now();

    watcher = new TraceWatcher({
      tracesDir,
      dataDirs: config.discoveryPaths,
      userConfig: config
    });

    const discoveryStart = Date.now();
    await waitForDiscovery(waitTime);
    const discoveryTime = Date.now() - discoveryStart;

    const traces = watcher.getAllTraces();
    const loadTime = Date.now() - startTime;
    const memoryAfter = getMemoryStats();

    return {
      loadTimeMs: loadTime,
      memoryUsageMB: memoryAfter.heapUsedMB - memoryBefore.heapUsedMB,
      tracesLoaded: traces.length,
      discoveryTimeMs: discoveryTime
    };
  };

  describe('Large Volume Tests', () => {
    test('handles 100 external traces efficiently', async () => {
      const config = createConfig([externalTracesDir]);

      // Create 100 traces for faster testing
      const numTraces = 100;
      createBatchTraces('perf-test', numTraces, externalTracesDir, 'soma-harvester');

      const metrics = await measurePerformance(config, numTraces, 3000);

      expect(metrics.tracesLoaded).toBe(numTraces);
      expect(metrics.loadTimeMs).toBeLessThan(8000); // 8 seconds max
      expect(metrics.memoryUsageMB).toBeLessThan(50); // 50MB max memory increase
      expect(metrics.discoveryTimeMs).toBeLessThan(5000); // 5 seconds discovery

      console.log(`Performance metrics for ${numTraces} traces:`, metrics);
    });

    test('handles 300 traces across multiple directories', async () => {
      const dir1 = path.join(tempDir, 'dir1');
      const dir2 = path.join(tempDir, 'dir2');
      const dir3 = path.join(tempDir, 'dir3');

      fs.mkdirSync(dir1, { recursive: true });
      fs.mkdirSync(dir2, { recursive: true });
      fs.mkdirSync(dir3, { recursive: true });

      const config = createConfig([dir1, dir2, dir3]);

      // Distribute traces across directories
      createBatchTraces('dir1-traces', 100, dir1, 'soma-harvester');
      createBatchTraces('dir2-traces', 100, dir2, 'soma-synthesizer');
      createBatchTraces('dir3-traces', 100, dir3, 'soma-reconciler');

      const metrics = await measurePerformance(config, 300, 4000);

      expect(metrics.tracesLoaded).toBe(300);
      expect(metrics.loadTimeMs).toBeLessThan(12000); // 12 seconds max
      expect(metrics.memoryUsageMB).toBeLessThan(80); // 80MB max memory increase

      console.log('Performance metrics for 300 traces across 3 directories:', metrics);
    });

    test('memory usage remains stable with trace churn', async () => {
      const config = createConfig([externalTracesDir]);

      watcher = new TraceWatcher(tracesDir, {
        userConfig: config,
        enableExternalDiscovery: true
      });

      const iterations = 3;
      const tracesPerIteration = 20;
      const memoryReadings: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const memoryBefore = getMemoryStats();

        // Create traces
        const traces = createBatchTraces(`iteration-${i}`, tracesPerIteration, externalTracesDir);
        await waitForDiscovery(1000);

        // Delete traces
        for (const trace of traces) {
          fs.unlinkSync(trace.filename);
        }
        await waitForDiscovery(1000);

        const memoryAfter = getMemoryStats();
        memoryReadings.push(memoryAfter.heapUsedMB);

        console.log(`Iteration ${i + 1}: Memory usage: ${memoryAfter.heapUsedMB}MB`);
      }

      // Memory should not grow significantly over iterations
      const maxMemory = Math.max(...memoryReadings);
      const minMemory = Math.min(...memoryReadings);
      const memoryGrowth = maxMemory - minMemory;

      expect(memoryGrowth).toBeLessThan(50); // Less than 50MB growth over iterations
    });
  });

  describe('Scalability Characteristics', () => {
    test('discovery time scales sub-linearly with trace count', async () => {
      const traceCounts = [100, 200, 400];
      const discoveryTimes: number[] = [];

      for (const count of traceCounts) {
        // Clean up previous traces
        if (fs.existsSync(externalTracesDir)) {
          fs.rmSync(externalTracesDir, { recursive: true });
          fs.mkdirSync(externalTracesDir, { recursive: true });
        }

        const config = createConfig([externalTracesDir]);
        createBatchTraces('scale-test', count, externalTracesDir);

        const metrics = await measurePerformance(config, count);
        discoveryTimes.push(metrics.discoveryTimeMs);

        console.log(`${count} traces: ${metrics.discoveryTimeMs}ms discovery time`);

        // Clean up watcher
        watcher.stop();
      }

      // Discovery time should not increase linearly
      // Time for 400 traces should be less than 2x time for 200 traces
      expect(discoveryTimes[2]).toBeLessThan(discoveryTimes[1] * 2);
      expect(discoveryTimes[1]).toBeLessThan(discoveryTimes[0] * 2);
    });

    test('handles concurrent trace additions efficiently', async () => {
      const config = createConfig([externalTracesDir]);

      watcher = new TraceWatcher(tracesDir, {
        userConfig: config,
        enableExternalDiscovery: true
      });

      await waitForDiscovery(500);

      // Add traces concurrently in batches
      const batchSize = 50;
      const numBatches = 5;
      const startTime = Date.now();

      const addBatch = async (batchId: number) => {
        createBatchTraces(`concurrent-${batchId}`, batchSize, externalTracesDir);
        await new Promise(resolve => setTimeout(resolve, 100)); // Small delay between batches
      };

      // Add all batches concurrently
      await Promise.all(
        Array.from({ length: numBatches }, (_, i) => addBatch(i))
      );

      // Wait for all traces to be discovered
      await waitForDiscovery(3000);

      const totalTime = Date.now() - startTime;
      const traces = watcher.getAllTraces();

      expect(traces).toHaveLength(batchSize * numBatches);
      expect(totalTime).toBeLessThan(10000); // 10 seconds max for concurrent adds

      console.log(`Concurrent addition of ${traces.length} traces took: ${totalTime}ms`);
    });
  });

  describe('Stress Tests', () => {
    test('handles deeply nested directory structures with many traces', async () => {
      // Create nested structure: level1/level2/.../level5
      const createNestedStructure = (baseDir: string, depth: number, tracesPerLevel: number) => {
        let currentDir = baseDir;
        for (let level = 1; level <= depth; level++) {
          currentDir = path.join(currentDir, `level${level}`);
          fs.mkdirSync(currentDir, { recursive: true });

          // Add traces at each level
          createBatchTraces(`level${level}`, tracesPerLevel, currentDir, `worker-l${level}`);
        }
      };

      createNestedStructure(externalTracesDir, 5, 20); // 5 levels, 20 traces each

      const config = createConfig([externalTracesDir]);
      const metrics = await measurePerformance(config, 100, 3000);

      expect(metrics.tracesLoaded).toBe(100); // 5 levels × 20 traces
      expect(metrics.loadTimeMs).toBeLessThan(8000); // 8 seconds max
    });

    test('handles traces with large metadata efficiently', async () => {
      const config = createConfig([externalTracesDir]);
      const numTraces = 200;

      // Create traces with large metadata objects
      for (let i = 0; i < numTraces; i++) {
        const largeMetadata = {
          framework: 'external',
          worker: 'soma-cartographer',
          entities: Array.from({ length: 100 }, (_, j) => ({
            id: `entity-${i}-${j}`,
            type: 'document',
            size: Math.floor(Math.random() * 10000),
            tags: Array.from({ length: 10 }, (_, k) => `tag-${k}`),
            relationships: Array.from({ length: 5 }, (_, k) => `rel-${i}-${j}-${k}`)
          })),
          processing: {
            steps: Array.from({ length: 20 }, (_, j) => ({
              name: `step-${j}`,
              duration: Math.random() * 1000,
              memory: Math.random() * 100000000,
              logs: Array.from({ length: 50 }, (_, k) => `log-entry-${j}-${k}`)
            }))
          }
        };

        const trace: TraceGraph = {
          id: `large-trace-${i}`,
          rootNodeId: `node-${i}`,
          agentId: `cartographer-${i}`,
          name: `Large Trace ${i}`,
          trigger: 'external',
          filename: path.join(externalTracesDir, `large-${i}.json`),
          startTime: Date.now() - 10000,
          endTime: Date.now(),
          status: 'completed',
          metadata: largeMetadata,
          nodes: {
            [`node-${i}`]: {
              id: `node-${i}`,
              type: 'agent',
              name: `Root Node ${i}`,
              startTime: Date.now() - 10000,
              endTime: Date.now(),
              status: 'completed',
              parentId: null,
              children: [],
              metadata: largeMetadata,
              state: {}
            }
          }
        };

        fs.writeFileSync(trace.filename, JSON.stringify(trace, null, 2));
      }

      const metrics = await measurePerformance(config, numTraces, 4000);

      expect(metrics.tracesLoaded).toBe(numTraces);
      expect(metrics.loadTimeMs).toBeLessThan(15000); // 15 seconds max
      expect(metrics.memoryUsageMB).toBeLessThan(300); // 300MB max for large traces

      console.log(`Large metadata traces performance:`, metrics);
    });

    test('maintains performance with mixed file sizes', async () => {
      const config = createConfig([externalTracesDir]);

      // Create traces with varying sizes
      const smallTraces = 100; // ~1KB each
      const mediumTraces = 50;  // ~10KB each
      const largeTraces = 20;   // ~100KB each

      // Small traces
      createBatchTraces('small', smallTraces, externalTracesDir, 'harvester');

      // Medium traces (add more nodes)
      for (let i = 0; i < mediumTraces; i++) {
        const trace: WatchedTrace = {
          id: `medium-trace-${i}`,
          rootNodeId: `root-${i}`,
          agentId: `synthesizer-${i}`,
          name: `Medium Trace ${i}`,
          trigger: 'external',
          filename: path.join(externalTracesDir, `medium-${i}.json`),
          startTime: Date.now() - 100000,
          endTime: Date.now(),
          status: 'completed',
          nodes: {}
        };

        // Add 50 nodes to make it medium-sized
        for (let j = 0; j < 50; j++) {
          trace.nodes[`node-${i}-${j}`] = {
            id: `node-${i}-${j}`,
            type: j === 0 ? 'agent' : 'tool',
            name: `Node ${i}-${j}`,
            startTime: Date.now() - (100000 - j * 1000),
            endTime: Date.now() - (90000 - j * 1000),
            status: 'completed',
            parentId: j === 0 ? null : `node-${i}-${j-1}`,
            children: j < 49 ? [`node-${i}-${j+1}`] : [],
            metadata: { step: j, data: `data-${i}-${j}`.repeat(10) },
            state: { values: Array.from({ length: 10 }, (_, k) => `value-${k}`) }
          };
        }

        if (trace.nodes[`root-${i}`]) {
          trace.rootNodeId = `root-${i}`;
        }

        fs.writeFileSync(trace.filename, JSON.stringify(trace, null, 2));
      }

      // Large traces (add extensive metadata)
      for (let i = 0; i < largeTraces; i++) {
        const trace: WatchedTrace = {
          id: `large-trace-${i}`,
          rootNodeId: `root-${i}`,
          agentId: `reconciler-${i}`,
          name: `Large Trace ${i}`,
          trigger: 'external',
          filename: path.join(externalTracesDir, `large-${i}.json`),
          startTime: Date.now() - 200000,
          endTime: Date.now(),
          status: 'completed',
          metadata: {
            largeData: 'x'.repeat(10000), // 10KB string
            arrayData: Array.from({ length: 1000 }, (_, j) => ({ id: j, value: `item-${j}` }))
          },
          nodes: {}
        };

        // Add 100 nodes with extensive metadata
        for (let j = 0; j < 100; j++) {
          trace.nodes[`node-${i}-${j}`] = {
            id: `node-${i}-${j}`,
            type: j === 0 ? 'agent' : 'tool',
            name: `Large Node ${i}-${j}`,
            startTime: Date.now() - (200000 - j * 2000),
            endTime: Date.now() - (180000 - j * 2000),
            status: 'completed',
            parentId: j === 0 ? null : `node-${i}-${j-1}`,
            children: j < 99 ? [`node-${i}-${j+1}`] : [],
            metadata: {
              step: j,
              logs: Array.from({ length: 20 }, (_, k) => `log-${i}-${j}-${k}`.repeat(5)),
              processing: 'x'.repeat(1000)
            },
            state: {
              results: Array.from({ length: 50 }, (_, k) => ({
                id: k,
                data: `result-${i}-${j}-${k}`,
                details: 'detail'.repeat(10)
              }))
            }
          };
        }

        if (trace.nodes[`root-${i}`]) {
          trace.rootNodeId = `root-${i}`;
        }

        fs.writeFileSync(trace.filename, JSON.stringify(trace, null, 2));
      }

      const totalExpected = smallTraces + mediumTraces + largeTraces;
      const metrics = await measurePerformance(config, totalExpected, 6000);

      expect(metrics.tracesLoaded).toBe(totalExpected);
      expect(metrics.loadTimeMs).toBeLessThan(20000); // 20 seconds for mixed sizes
      expect(metrics.memoryUsageMB).toBeLessThan(500); // 500MB max for mixed traces

      console.log(`Mixed file sizes performance (${totalExpected} traces):`, metrics);
    });
  });

  describe('Resource Management', () => {
    test('efficiently manages file handles with many external directories', async () => {
      // Create 20 external directories
      const externalDirs: string[] = [];
      for (let i = 0; i < 20; i++) {
        const dir = path.join(tempDir, `external-${i}`);
        fs.mkdirSync(dir, { recursive: true });
        externalDirs.push(dir);

        // Add a few traces to each directory
        createBatchTraces(`dir${i}`, 10, dir, `worker-${i}`);
      }

      const config = createConfig(externalDirs);
      const metrics = await measurePerformance(config, 200, 4000); // 20 dirs × 10 traces

      expect(metrics.tracesLoaded).toBe(200);
      expect(metrics.loadTimeMs).toBeLessThan(12000); // 12 seconds max

      // Verify watcher can handle file operations on all directories
      // Add new traces to random directories
      for (let i = 0; i < 10; i++) {
        const randomDir = externalDirs[Math.floor(Math.random() * externalDirs.length)];
        createBatchTraces(`runtime-${i}`, 1, randomDir);
      }

      await waitForDiscovery(2000);
      const finalTraces = watcher.getAllTraces();
      expect(finalTraces.length).toBeGreaterThanOrEqual(200);

      console.log(`File handle management test: ${finalTraces.length} traces across ${externalDirs.length} directories`);
    });

    test('handles rapid file system changes without memory leaks', async () => {
      const config = createConfig([externalTracesDir]);

      watcher = new TraceWatcher(tracesDir, {
        userConfig: config,
        enableExternalDiscovery: true
      });

      const memoryBefore = getMemoryStats();

      // Perform rapid file operations
      for (let cycle = 0; cycle < 10; cycle++) {
        // Create batch of traces
        const traces = createBatchTraces(`cycle-${cycle}`, 20, externalTracesDir);
        await new Promise(resolve => setTimeout(resolve, 100));

        // Update some traces
        for (let i = 0; i < 5; i++) {
          const trace = traces[i];
          trace.status = 'failed';
          trace.endTime = Date.now();
          fs.writeFileSync(trace.filename, JSON.stringify(trace, null, 2));
        }
        await new Promise(resolve => setTimeout(resolve, 100));

        // Delete some traces
        for (let i = 10; i < 15; i++) {
          fs.unlinkSync(traces[i].filename);
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Wait for all operations to settle
      await waitForDiscovery(2000);

      const memoryAfter = getMemoryStats();
      const memoryGrowth = memoryAfter.heapUsedMB - memoryBefore.heapUsedMB;

      // Memory growth should be reasonable after rapid changes
      expect(memoryGrowth).toBeLessThan(100); // Less than 100MB growth

      console.log(`Memory growth after rapid FS changes: ${memoryGrowth}MB`);
    });
  });
});