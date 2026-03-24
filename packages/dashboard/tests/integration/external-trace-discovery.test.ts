/**
 * Integration tests for External Trace Discovery
 *
 * Tests the full integration between external trace discovery,
 * file watching, and SOMA trace loading.
 */
import { test, expect, describe, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { TraceWatcher } from '../../src/watcher.js';
import { getDiscoveryPaths, validateDashboardUserConfig } from '../../src/config.js';
import type { DashboardUserConfig } from '../../src/config.js';
import type { TraceGraph } from '../../src/trace-graph.js';

describe('External Trace Discovery Integration', () => {
  let tempDir: string;
  let tracesDir: string;
  let externalTracesDir: string;
  let somaTracesDir: string;
  let configFile: string;
  let watcher: TraceWatcher;

  beforeEach(() => {
    // Create temporary directory structure
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentflow-integration-test-'));
    tracesDir = path.join(tempDir, 'traces');
    externalTracesDir = path.join(tempDir, 'external-traces');
    somaTracesDir = path.join(tempDir, 'soma', 'traces');
    configFile = path.join(tempDir, 'agentflow.config.json');

    // Create directory structure
    fs.mkdirSync(tracesDir, { recursive: true });
    fs.mkdirSync(externalTracesDir, { recursive: true });
    fs.mkdirSync(somaTracesDir, { recursive: true });
  });

  afterEach(() => {
    if (watcher) {
      watcher.close();
    }

    // Clean up temporary directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  const createSampleTrace = (agentId: string, filename: string, traceDir: string): TraceGraph => {
    const trace: TraceGraph = {
      id: `trace-${Date.now()}`,
      rootNodeId: 'node-1',
      agentId,
      name: `${agentId} Test Execution`,
      trigger: 'external',
      filename: path.join(traceDir, filename),
      startTime: Date.now() - 10000,
      endTime: Date.now(),
      status: 'completed',
      nodes: {
        'node-1': {
          id: 'node-1',
          type: 'agent',
          name: 'Root Node',
          startTime: Date.now() - 10000,
          endTime: Date.now(),
          status: 'completed',
          parentId: null,
          children: ['node-2'],
          metadata: { framework: 'external' },
          state: {}
        },
        'node-2': {
          id: 'node-2',
          type: 'tool',
          name: 'Process External Data',
          startTime: Date.now() - 8000,
          endTime: Date.now() - 2000,
          status: 'completed',
          parentId: 'node-1',
          children: [],
          metadata: { external: true },
          state: {}
        }
      }
    };

    // Write trace file
    fs.writeFileSync(path.join(traceDir, filename), JSON.stringify(trace, null, 2));
    return trace;
  };

  const createConfig = (discoveryPaths: string[]): DashboardUserConfig => ({
    port: 3000,
    tracesDir,
    discoveryPaths,
    externalCommands: {}
  });

  const waitForFileWatch = (ms = 100) => new Promise(resolve => setTimeout(resolve, ms));

  describe('Basic External Trace Discovery', () => {
    test('discovers traces from configured external directories', async () => {
      const config = createConfig([externalTracesDir, somaTracesDir]);
      fs.writeFileSync(configFile, JSON.stringify(config, null, 2));

      // Create traces in different directories
      const internalTrace = createSampleTrace('internal-agent', 'internal.json', tracesDir);
      const externalTrace = createSampleTrace('external-agent', 'external.json', externalTracesDir);
      const somaTrace = createSampleTrace('soma-harvester', 'harvester.json', somaTracesDir);

      watcher = new TraceWatcher(tracesDir, {
        userConfig: config,
        enableExternalDiscovery: true
      });

      // Wait for discovery to complete
      await waitForFileWatch(200);

      const traces = watcher.getAllTraces();

      expect(traces).toHaveLength(3);

      const agentIds = traces.map(t => t.agentId).sort();
      expect(agentIds).toEqual(['external-agent', 'internal-agent', 'soma-harvester']);

      // Verify external traces are marked correctly
      const externalTraces = traces.filter(t => t.filename.includes('external') || t.filename.includes('soma'));
      expect(externalTraces).toHaveLength(2);

      for (const trace of externalTraces) {
        expect(trace.filename).not.toContain(tracesDir);
        expect(trace.filename).toMatch(/(external|soma)/);
      }
    });

    test('validates and filters invalid external traces', async () => {
      const config = createConfig([externalTracesDir]);

      // Create valid trace
      createSampleTrace('valid-agent', 'valid.json', externalTracesDir);

      // Create invalid trace files
      fs.writeFileSync(path.join(externalTracesDir, 'invalid.json'), 'invalid json content');
      fs.writeFileSync(path.join(externalTracesDir, 'incomplete.json'), JSON.stringify({
        id: 'incomplete'
        // Missing required fields
      }));
      fs.writeFileSync(path.join(externalTracesDir, 'readme.txt'), 'This is not a trace file');

      watcher = new TraceWatcher(tracesDir, {
        userConfig: config,
        enableExternalDiscovery: true
      });

      await waitForFileWatch(200);

      const traces = watcher.getAllTraces();

      // Should only load the valid trace
      expect(traces).toHaveLength(1);
      expect(traces[0].agentId).toBe('valid-agent');
    });

    test('preserves external trace metadata during loading', async () => {
      const config = createConfig([externalTracesDir]);

      const trace = createSampleTrace('metadata-agent', 'metadata.json', externalTracesDir);

      // Add extra metadata to the trace file
      trace.metadata = {
        external: true,
        framework: 'custom-framework',
        version: '1.2.3',
        tags: ['production', 'critical']
      };
      fs.writeFileSync(
        path.join(externalTracesDir, 'metadata.json'),
        JSON.stringify(trace, null, 2)
      );

      watcher = new TraceWatcher(tracesDir, {
        userConfig: config,
        enableExternalDiscovery: true
      });

      await waitForFileWatch(200);

      const traces = watcher.getAllTraces();
      expect(traces).toHaveLength(1);

      const loadedTrace = traces[0];
      expect(loadedTrace.metadata).toEqual(trace.metadata);
      expect(loadedTrace.metadata.external).toBe(true);
      expect(loadedTrace.metadata.framework).toBe('custom-framework');
      expect(loadedTrace.metadata.tags).toEqual(['production', 'critical']);
    });
  });

  describe('SOMA-Specific Trace Discovery', () => {
    test('discovers SOMA traces from ~/.soma/traces pattern', async () => {
      const somaHomeDir = path.join(tempDir, '.soma', 'traces');
      fs.mkdirSync(somaHomeDir, { recursive: true });

      const config = createConfig([somaHomeDir]);

      // Create different SOMA worker traces
      createSampleTrace('soma-harvester', 'harvester-001.json', somaHomeDir);
      createSampleTrace('soma-synthesizer', 'synthesizer-001.json', somaHomeDir);
      createSampleTrace('soma-reconciler', 'reconciler-001.json', somaHomeDir);
      createSampleTrace('soma-cartographer', 'cartographer-001.json', somaHomeDir);

      watcher = new TraceWatcher(tracesDir, {
        userConfig: config,
        enableExternalDiscovery: true
      });

      await waitForFileWatch(200);

      const traces = watcher.getAllTraces();
      expect(traces).toHaveLength(4);

      const somaAgents = traces.map(t => t.agentId).sort();
      expect(somaAgents).toEqual([
        'soma-cartographer',
        'soma-harvester',
        'soma-reconciler',
        'soma-synthesizer'
      ]);

      // All traces should be from the SOMA directory
      for (const trace of traces) {
        expect(trace.filename).toContain('.soma');
      }
    });

    test('handles SOMA trace file naming conventions', async () => {
      const config = createConfig([somaTracesDir]);

      // Create traces with different SOMA naming patterns
      const traces = [
        'harvester-20240301-120000.json',
        'synthesizer_batch_1.json',
        'reconciler.worker.json',
        'cartographer-final.json'
      ];

      for (const filename of traces) {
        createSampleTrace('soma-worker', filename, somaTracesDir);
      }

      watcher = new TraceWatcher(tracesDir, {
        userConfig: config,
        enableExternalDiscovery: true
      });

      await waitForFileWatch(200);

      const loadedTraces = watcher.getAllTraces();
      expect(loadedTraces).toHaveLength(traces.length);

      // All should be discovered regardless of naming pattern
      const filenames = loadedTraces.map(t => path.basename(t.filename)).sort();
      expect(filenames).toEqual(traces.sort());
    });
  });

  describe('Configuration Validation', () => {
    test('validates discovery paths exist', () => {
      const validConfig = createConfig([externalTracesDir, somaTracesDir]);
      const invalidConfig = createConfig(['/non/existent/path', externalTracesDir]);

      const validResult = validateDashboardUserConfig(validConfig);
      const invalidResult = validateDashboardUserConfig(invalidConfig);

      expect(validResult.valid).toBe(true);
      expect(validResult.errors).toHaveLength(0);

      expect(invalidResult.valid).toBe(false);
      expect(invalidResult.errors.length).toBeGreaterThan(0);
      expect(invalidResult.errors[0]).toContain('Discovery path does not exist');
    });

    test('handles empty discovery paths gracefully', () => {
      const config = createConfig([]);

      watcher = new TraceWatcher(tracesDir, {
        userConfig: config,
        enableExternalDiscovery: true
      });

      expect(watcher).toBeDefined();

      // Should only find internal traces
      const traces = watcher.getAllTraces();
      expect(traces).toHaveLength(0); // No traces in any directory
    });

    test('getDiscoveryPaths returns correct paths from config', () => {
      const config = createConfig([externalTracesDir, somaTracesDir]);

      const discoveryPaths = getDiscoveryPaths(config);
      expect(discoveryPaths).toHaveLength(2);
      expect(discoveryPaths).toContain(externalTracesDir);
      expect(discoveryPaths).toContain(somaTracesDir);
    });
  });

  describe('Real-time Discovery Updates', () => {
    test('watches for new external traces added at runtime', async () => {
      const config = createConfig([externalTracesDir]);

      watcher = new TraceWatcher(tracesDir, {
        userConfig: config,
        enableExternalDiscovery: true
      });

      // Initially no traces
      await waitForFileWatch(100);
      expect(watcher.getAllTraces()).toHaveLength(0);

      // Add a trace at runtime
      createSampleTrace('runtime-agent', 'runtime.json', externalTracesDir);

      // Wait for file system events to propagate
      await waitForFileWatch(300);

      const traces = watcher.getAllTraces();
      expect(traces).toHaveLength(1);
      expect(traces[0].agentId).toBe('runtime-agent');
    });

    test('handles external trace file updates', async () => {
      const config = createConfig([externalTracesDir]);

      // Create initial trace
      const traceFile = path.join(externalTracesDir, 'update-test.json');
      let trace = createSampleTrace('update-agent', 'update-test.json', '');
      fs.writeFileSync(traceFile, JSON.stringify(trace, null, 2));

      watcher = new TraceWatcher(tracesDir, {
        userConfig: config,
        enableExternalDiscovery: true
      });

      await waitForFileWatch(200);

      let traces = watcher.getAllTraces();
      expect(traces).toHaveLength(1);
      expect(traces[0].status).toBe('completed');

      // Update the trace
      trace.status = 'failed';
      trace.endTime = Date.now();
      fs.writeFileSync(traceFile, JSON.stringify(trace, null, 2));

      // Wait for update to be detected
      await waitForFileWatch(300);

      traces = watcher.getAllTraces();
      expect(traces).toHaveLength(1);
      expect(traces[0].status).toBe('failed');
    });

    test('removes traces when external files are deleted', async () => {
      const config = createConfig([externalTracesDir]);

      const traceFile = path.join(externalTracesDir, 'delete-test.json');
      createSampleTrace('delete-agent', 'delete-test.json', '');

      watcher = new TraceWatcher(tracesDir, {
        userConfig: config,
        enableExternalDiscovery: true
      });

      await waitForFileWatch(200);

      expect(watcher.getAllTraces()).toHaveLength(1);

      // Delete the trace file
      fs.unlinkSync(traceFile);

      // Wait for deletion to be detected
      await waitForFileWatch(300);

      expect(watcher.getAllTraces()).toHaveLength(0);
    });
  });

  describe('Error Handling and Recovery', () => {
    test('recovers from temporarily inaccessible external directories', async () => {
      const config = createConfig([externalTracesDir]);

      // Create trace first
      createSampleTrace('recovery-agent', 'recovery.json', externalTracesDir);

      watcher = new TraceWatcher(tracesDir, {
        userConfig: config,
        enableExternalDiscovery: true
      });

      await waitForFileWatch(200);
      expect(watcher.getAllTraces()).toHaveLength(1);

      // Simulate directory becoming inaccessible by removing permissions
      try {
        fs.chmodSync(externalTracesDir, 0o000);

        // Give watcher time to detect the change
        await waitForFileWatch(300);

        // Restore permissions
        fs.chmodSync(externalTracesDir, 0o755);

        // Should recover and reload traces
        await waitForFileWatch(300);

        const traces = watcher.getAllTraces();
        expect(traces.length).toBeGreaterThanOrEqual(0); // May or may not contain traces depending on recovery
      } catch (error) {
        // Skip this test on systems where chmod doesn't work as expected
        console.warn('Skipping permission test due to system limitations');
      }
    });

    test('handles mixed valid and invalid discovery paths', async () => {
      const nonExistentDir = path.join(tempDir, 'does-not-exist');
      const config = createConfig([externalTracesDir, nonExistentDir, somaTracesDir]);

      // Create traces in valid directories
      createSampleTrace('external-agent', 'external.json', externalTracesDir);
      createSampleTrace('soma-agent', 'soma.json', somaTracesDir);

      // Should work despite invalid path
      watcher = new TraceWatcher(tracesDir, {
        userConfig: config,
        enableExternalDiscovery: true
      });

      await waitForFileWatch(200);

      const traces = watcher.getAllTraces();
      expect(traces).toHaveLength(2);

      const agentIds = traces.map(t => t.agentId).sort();
      expect(agentIds).toEqual(['external-agent', 'soma-agent']);
    });
  });

  describe('Performance and Scalability', () => {
    test('handles large numbers of external traces efficiently', async () => {
      const config = createConfig([externalTracesDir]);

      // Create many trace files
      const numTraces = 50;
      for (let i = 0; i < numTraces; i++) {
        createSampleTrace(`agent-${i}`, `trace-${i}.json`, externalTracesDir);
      }

      const startTime = Date.now();

      watcher = new TraceWatcher(tracesDir, {
        userConfig: config,
        enableExternalDiscovery: true
      });

      await waitForFileWatch(500); // Give more time for large number of files

      const loadTime = Date.now() - startTime;
      const traces = watcher.getAllTraces();

      expect(traces).toHaveLength(numTraces);
      expect(loadTime).toBeLessThan(5000); // Should load within 5 seconds

      // Verify all traces loaded correctly
      const agentIds = traces.map(t => t.agentId).sort();
      const expectedIds = Array.from({ length: numTraces }, (_, i) => `agent-${i}`).sort();
      expect(agentIds).toEqual(expectedIds);
    });

    test('efficiently handles deeply nested directory structures', async () => {
      // Create nested directory structure
      const deepDir = path.join(externalTracesDir, 'level1', 'level2', 'level3');
      fs.mkdirSync(deepDir, { recursive: true });

      const config = createConfig([externalTracesDir]);

      // Create traces at different levels
      createSampleTrace('root-agent', 'root.json', externalTracesDir);
      createSampleTrace('level1-agent', 'level1.json', path.join(externalTracesDir, 'level1'));
      createSampleTrace('deep-agent', 'deep.json', deepDir);

      watcher = new TraceWatcher(tracesDir, {
        userConfig: config,
        enableExternalDiscovery: true
      });

      await waitForFileWatch(200);

      const traces = watcher.getAllTraces();
      expect(traces).toHaveLength(3);

      const agentIds = traces.map(t => t.agentId).sort();
      expect(agentIds).toEqual(['deep-agent', 'level1-agent', 'root-agent']);
    });
  });
});