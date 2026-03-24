/**
 * Test suite for SOMA external trace discovery functionality
 */
import { test, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { TraceWatcher } from '../src/watcher.js';
import { getDiscoveryPaths } from '../src/config.js';
import type { DashboardUserConfig } from '../src/config.js';

test('External trace discovery loads SOMA traces from configured directory', async () => {
  // Create a temporary directory structure
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentflow-test-'));
  const tracesDir = path.join(tempDir, 'traces');
  const somaTracesDir = path.join(tempDir, 'soma', 'traces');

  // Ensure directories exist
  fs.mkdirSync(tracesDir, { recursive: true });
  fs.mkdirSync(somaTracesDir, { recursive: true });

  try {
    // Create a sample SOMA trace file
    const somaTrace = {
      id: 'node_001',
      rootNodeId: 'node_001',
      agentId: 'soma-harvester',
      name: 'SOMA Harvester Test',
      trigger: 'worker',
      startTime: Date.now() - 1000,
      endTime: Date.now(),
      status: 'success',
      nodes: {
        node_001: {
          id: 'node_001',
          type: 'agent',
          name: 'soma-harvester',
          startTime: Date.now() - 1000,
          endTime: Date.now(),
          status: 'success',
          parentId: null,
          children: [],
          metadata: {},
          state: { worker: 'harvester' }
        }
      },
      edges: [],
      events: []
    };

    fs.writeFileSync(
      path.join(somaTracesDir, 'soma-harvester-test.json'),
      JSON.stringify(somaTrace, null, 2)
    );

    // Configure user config with discovery paths
    const userConfig: DashboardUserConfig = {
      discoveryPaths: [somaTracesDir]
    };

    // Extract discovery paths and pass as dataDirs (simulating server behavior)
    const discoveryPaths = getDiscoveryPaths(userConfig);

    // Create trace watcher with external directory as dataDirs
    const watcher = new TraceWatcher({
      tracesDir,
      dataDirs: discoveryPaths,
      userConfig,
      maxAgeMs: 24 * 60 * 60 * 1000 // 24 hours
    });

    // Wait a moment for file watching to initialize
    await new Promise(resolve => setTimeout(resolve, 100));

    // Verify the SOMA trace was loaded
    const allTraces = watcher.getAllTraces();
    const somaTraces = allTraces.filter(trace => trace.agentId === 'soma-harvester');

    expect(somaTraces).toHaveLength(1);

    const trace = somaTraces[0];
    expect(trace.agentId).toBe('soma-harvester');
    expect(trace.filename).toBe('soma-harvester-test.json');
    expect(trace.sourceDir).toBe(somaTracesDir);
    expect(trace.sourceType).toBe('trace');

    watcher.stop();
  } finally {
    // Cleanup
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('External trace discovery handles missing directories gracefully', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentflow-test-'));
  const tracesDir = path.join(tempDir, 'traces');
  const nonExistentDir = path.join(tempDir, 'nonexistent');

  fs.mkdirSync(tracesDir, { recursive: true });

  try {
    const userConfig: DashboardUserConfig = {
      discoveryPaths: [nonExistentDir]
    };

    const discoveryPaths = getDiscoveryPaths(userConfig);

    // Should not throw error when directory doesn't exist
    const watcher = new TraceWatcher({
      tracesDir,
      dataDirs: discoveryPaths,
      userConfig
    });

    // Verify watcher still works
    expect(watcher.getAllTraces()).toHaveLength(0);

    watcher.stop();
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('External trace metadata is preserved correctly', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentflow-test-'));
  const tracesDir = path.join(tempDir, 'traces');
  const externalDir = path.join(tempDir, 'external');

  fs.mkdirSync(tracesDir, { recursive: true });
  fs.mkdirSync(externalDir, { recursive: true });

  try {
    const externalTrace = {
      id: 'external_001',
      rootNodeId: 'external_001',
      agentId: 'external-agent',
      name: 'External Test Trace',
      trigger: 'manual',
      startTime: Date.now() - 2000,
      endTime: Date.now() - 1000,
      status: 'success',
      nodes: {
        external_001: {
          id: 'external_001',
          type: 'agent',
          name: 'external-agent',
          startTime: Date.now() - 2000,
          endTime: Date.now() - 1000,
          status: 'success',
          parentId: null,
          children: [],
          metadata: {},
          state: {}
        }
      },
      edges: [],
      events: []
    };

    const traceFilePath = path.join(externalDir, 'external-trace.json');
    fs.writeFileSync(traceFilePath, JSON.stringify(externalTrace, null, 2));

    const userConfig: DashboardUserConfig = {
      discoveryPaths: [externalDir]
    };

    const discoveryPaths = getDiscoveryPaths(userConfig);

    const watcher = new TraceWatcher({
      tracesDir,
      dataDirs: discoveryPaths,
      userConfig
    });

    await new Promise(resolve => setTimeout(resolve, 100));

    const traces = watcher.getAllTraces();
    const externalTraces = traces.filter(trace => trace.agentId === 'external-agent');

    expect(externalTraces).toHaveLength(1);

    const trace = externalTraces[0];
    expect(trace.filename).toBe('external-trace.json');
    expect(trace.sourceDir).toBe(externalDir);
    expect(trace.sourceType).toBe('trace');
    expect(trace.lastModified).toBeDefined();

    watcher.stop();
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});