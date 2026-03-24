/**
 * End-to-End tests for SOMA Trace Visibility Workflow
 *
 * Tests the complete workflow from SOMA trace discovery through enhancement
 * to UI display, including all the integrated components working together.
 */
import { test, expect, describe, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { DashboardServer } from '../../src/server.js';
import { TraceEnhancementService } from '../../src/trace-enhancer.js';
import { DefaultSOMADataReader } from '../../src/soma-data-reader.js';
import type { DashboardUserConfig } from '../../src/config.js';
import type { TraceGraph } from '../../src/trace-graph.js';
import type { SOMAHarvesterState, SOMASynthesizerState, SOMAVaultChange } from '../../src/soma-data-reader.js';

describe('SOMA Trace Visibility End-to-End Workflow', () => {
  let server: DashboardServer;
  let tempDir: string;
  let tracesDir: string;
  let somaTracesDir: string;
  let somaStateDir: string;
  let somaVaultDir: string;
  let baseUrl: string;

  beforeEach(async () => {
    // Create comprehensive test directory structure
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'soma-e2e-test-'));
    tracesDir = path.join(tempDir, 'traces');
    somaTracesDir = path.join(tempDir, 'soma', 'traces');
    somaStateDir = path.join(tempDir, 'soma', 'state');
    somaVaultDir = path.join(tempDir, 'soma', 'vault');

    // Create all directories
    fs.mkdirSync(tracesDir, { recursive: true });
    fs.mkdirSync(somaTracesDir, { recursive: true });
    fs.mkdirSync(somaStateDir, { recursive: true });
    fs.mkdirSync(somaVaultDir, { recursive: true });

    // Create test configuration with SOMA integration
    const config: DashboardUserConfig = {
      port: 0,
      tracesDir,
      discoveryPaths: [somaTracesDir],
      externalCommands: {
        'soma-harvest': {
          name: 'SOMA Harvester',
          command: 'echo',
          args: ['Harvester executed'],
          description: 'Test SOMA harvester command',
          category: 'SOMA Workers',
          timeout: 10000,
          allowConcurrent: false
        },
        'soma-synthesize': {
          name: 'SOMA Synthesizer',
          command: 'echo',
          args: ['Synthesizer executed'],
          description: 'Test SOMA synthesizer command',
          category: 'SOMA Workers',
          timeout: 15000,
          allowConcurrent: false
        }
      }
    };

    // Start server
    server = new DashboardServer(config);
    await server.start();
    baseUrl = `http://localhost:${server.getPort()}`;
  });

  afterEach(async () => {
    if (server) {
      await server.stop();
    }

    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  const createSOMATrace = (
    agentId: string,
    filename: string,
    traceDir: string,
    workerType: 'harvester' | 'synthesizer' | 'reconciler' | 'cartographer'
  ): TraceGraph => {
    const trace: TraceGraph = {
      id: `soma-trace-${Date.now()}`,
      rootNodeId: 'node-1',
      agentId,
      name: `SOMA ${workerType} Execution`,
      trigger: 'worker',
      filename: path.join(traceDir, filename),
      startTime: Date.now() - 15000,
      endTime: Date.now() - 1000,
      status: 'completed',
      nodes: {
        'node-1': {
          id: 'node-1',
          type: 'agent',
          name: `SOMA ${workerType} Agent`,
          startTime: Date.now() - 15000,
          endTime: Date.now() - 1000,
          status: 'completed',
          parentId: null,
          children: ['node-2', 'node-3'],
          metadata: {
            workerType,
            framework: 'soma',
            component: workerType
          },
          state: {}
        },
        'node-2': {
          id: 'node-2',
          type: 'operation',
          name: `${workerType} Processing`,
          startTime: Date.now() - 12000,
          endTime: Date.now() - 5000,
          status: 'completed',
          parentId: 'node-1',
          children: [],
          metadata: {
            operation: `${workerType}_process`,
            duration: 7000
          },
          state: {}
        },
        'node-3': {
          id: 'node-3',
          type: 'operation',
          name: `${workerType} Finalization`,
          startTime: Date.now() - 4000,
          endTime: Date.now() - 1000,
          status: 'completed',
          parentId: 'node-1',
          children: [],
          metadata: {
            operation: `${workerType}_finalize`,
            duration: 3000
          },
          state: {}
        }
      }
    };

    fs.writeFileSync(path.join(traceDir, filename), JSON.stringify(trace, null, 2));
    return trace;
  };

  const createSOMAOperationalData = () => {
    // Create SOMA state files
    const harvesterState: SOMAHarvesterState = {
      type: 'harvester',
      lastRun: Date.now() - 5000,
      entityCount: 125,
      processedEventIds: ['event1', 'event2', 'event3'],
      filesProcessed: 8,
      eventsIngested: 35,
      inboxStats: {
        totalFiles: 12,
        processedFiles: 8,
        skippedFiles: 2,
        errorFiles: 2
      },
      lastProcessedFiles: ['file1.json', 'file2.json', 'file3.json'],
      processingDuration: 7500,
      errors: {
        count: 1,
        lastError: 'Timeout on file4.json',
        timestamp: Date.now() - 3000
      }
    };

    const synthesizerState: SOMASynthesizerState = {
      type: 'synthesizer',
      lastRun: Date.now() - 3600000, // 1 hour ago
      entityCount: 250,
      processedEventIds: ['syn1', 'syn2', 'syn3'],
      candidatesAnalyzed: 75,
      insightsGenerated: 18,
      llmAnalysisDuration: 45000,
      deduplicationStats: {
        duplicatesFound: 12,
        uniqueInsights: 6,
        similarityThreshold: 0.88
      },
      confidenceScores: [0.92, 0.87, 0.91, 0.85, 0.89],
      errors: {
        count: 0,
        lastError: null,
        timestamp: null
      }
    };

    // Write state files
    fs.writeFileSync(
      path.join(somaStateDir, 'harvester-state.json'),
      JSON.stringify(harvesterState, null, 2)
    );

    fs.writeFileSync(
      path.join(somaStateDir, 'synthesizer-state.json'),
      JSON.stringify(synthesizerState, null, 2)
    );

    // Create vault change log
    const vaultChanges: SOMAVaultChange[] = [
      {
        timestamp: Date.now() - 7200000, // 2 hours ago
        entityId: 'insight-001',
        entityType: 'insight',
        operation: 'create',
        layer: 'emerging',
        metadata: { confidence: 0.89, source: 'harvester' }
      },
      {
        timestamp: Date.now() - 3600000, // 1 hour ago
        entityId: 'policy-001',
        entityType: 'policy',
        operation: 'update',
        layer: 'canon',
        metadata: { enforcement: 'strict', ratified: true }
      },
      {
        timestamp: Date.now() - 1800000, // 30 min ago
        entityId: 'insight-002',
        entityType: 'insight',
        operation: 'promote',
        layer: 'emerging',
        metadata: { promotedFrom: 'working', confidence: 0.94 }
      }
    ];

    const changeLogContent = vaultChanges
      .map(change => JSON.stringify(change))
      .join('\n');
    fs.writeFileSync(path.join(somaVaultDir, '_mutations.jsonl'), changeLogContent);

    return { harvesterState, synthesizerState, vaultChanges };
  };

  const waitForAsync = (ms = 200) => new Promise(resolve => setTimeout(resolve, ms));

  describe('Complete SOMA Trace Workflow', () => {
    test('end-to-end workflow: discovery → enhancement → API access', async () => {
      // Step 1: Create SOMA operational data
      const operationalData = createSOMAOperationalData();

      // Step 2: Create SOMA traces
      const harvesterTrace = createSOMATrace(
        'soma-harvester',
        'harvester-001.json',
        somaTracesDir,
        'harvester'
      );

      const synthesizerTrace = createSOMATrace(
        'soma-synthesizer',
        'synthesizer-001.json',
        somaTracesDir,
        'synthesizer'
      );

      // Wait for trace discovery
      await waitForAsync(300);

      // Step 3: Verify traces are discovered via API
      const tracesResponse = await fetch(`${baseUrl}/api/traces`);
      expect(tracesResponse.status).toBe(200);

      const tracesData = await tracesResponse.json();
      expect(tracesData.traces).toHaveLength(2);

      const traceIds = tracesData.traces.map((t: any) => t.agentId);
      expect(traceIds).toContain('soma-harvester');
      expect(traceIds).toContain('soma-synthesizer');

      // Step 4: Get specific trace details
      const harvesterTraceData = tracesData.traces.find((t: any) => t.agentId === 'soma-harvester');
      const traceDetailResponse = await fetch(`${baseUrl}/api/traces/${harvesterTraceData.id}`);
      expect(traceDetailResponse.status).toBe(200);

      const traceDetail = await traceDetailResponse.json();
      expect(traceDetail.agentId).toBe('soma-harvester');
      expect(traceDetail.nodes).toBeDefined();
      expect(Object.keys(traceDetail.nodes)).toHaveLength(3);

      // Step 5: Test trace enhancement
      const dataReader = new DefaultSOMADataReader({
        statePath: somaStateDir,
        vaultPath: somaVaultDir
      });

      const enhancer = new TraceEnhancementService({
        somaDataReader: dataReader
      });

      const enhancementResult = await enhancer.enhanceTrace(harvesterTrace);
      expect(enhancementResult.enhanced).toBe(true);
      expect(enhancementResult.errors).toHaveLength(0);

      const enhancedTrace = enhancementResult.trace as any;
      expect(enhancedTrace.enhancementInfo).toBeDefined();
      expect(enhancedTrace.enhancementInfo.enhancementLevel).toBeDefined();
      expect(enhancedTrace.enhancementInfo.dataSourcesUsed).toContain('harvester');
    });

    test('SOMA operational data integration workflow', async () => {
      // Create operational data
      createSOMAOperationalData();

      // Test SOMA data reader directly
      const dataReader = new DefaultSOMADataReader({
        statePath: somaStateDir,
        vaultPath: somaVaultDir
      });

      const operationalData = await dataReader.readOperationalData();

      // Verify harvester state
      expect(operationalData.harvesterState).not.toBeNull();
      expect(operationalData.harvesterState?.type).toBe('harvester');
      expect(operationalData.harvesterState?.filesProcessed).toBe(8);
      expect(operationalData.harvesterState?.eventsIngested).toBe(35);

      // Verify synthesizer state
      expect(operationalData.synthesizerState).not.toBeNull();
      expect(operationalData.synthesizerState?.type).toBe('synthesizer');
      expect(operationalData.synthesizerState?.candidatesAnalyzed).toBe(75);
      expect(operationalData.synthesizerState?.insightsGenerated).toBe(18);

      // Verify vault changes
      expect(operationalData.vaultChanges).toHaveLength(3);
      expect(operationalData.vaultChanges[0].operation).toBe('create');
      expect(operationalData.vaultChanges[1].operation).toBe('update');
      expect(operationalData.vaultChanges[2].operation).toBe('promote');

      // Verify error tracking
      expect(operationalData.errors).toHaveLength(0);
      expect(operationalData.lastUpdated).toBeTypeOf('number');
    });

    test('external command integration with SOMA workers', async () => {
      // Test SOMA harvester command
      const harvesterResponse = await fetch(`${baseUrl}/api/external/commands/soma-harvest/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      expect(harvesterResponse.status).toBe(200);

      const harvesterData = await harvesterResponse.json();
      expect(harvesterData.status).toBe('completed');
      expect(harvesterData.output).toContain('Harvester executed');
      expect(harvesterData.exitCode).toBe(0);

      // Test SOMA synthesizer command
      const synthesizerResponse = await fetch(`${baseUrl}/api/external/commands/soma-synthesize/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      expect(synthesizerResponse.status).toBe(200);

      const synthesizerData = await synthesizerResponse.json();
      expect(synthesizerData.status).toBe('completed');
      expect(synthesizerData.output).toContain('Synthesizer executed');
      expect(synthesizerData.exitCode).toBe(0);

      // Verify audit log captures both executions
      const auditResponse = await fetch(`${baseUrl}/api/external/commands/audit`);
      expect(auditResponse.status).toBe(200);

      const auditData = await auditResponse.json();
      expect(auditData.entries.length).toBeGreaterThanOrEqual(2);

      const commandIds = auditData.entries.map((entry: any) => entry.commandId);
      expect(commandIds).toContain('soma-harvest');
      expect(commandIds).toContain('soma-synthesize');
    });
  });

  describe('Multi-Worker SOMA Scenarios', () => {
    test('handles multiple SOMA worker traces simultaneously', async () => {
      // Create operational data
      createSOMAOperationalData();

      // Create traces for all SOMA workers
      const workers = ['harvester', 'synthesizer', 'reconciler', 'cartographer'] as const;
      const createdTraces = [];

      for (const worker of workers) {
        const trace = createSOMATrace(
          `soma-${worker}`,
          `${worker}-001.json`,
          somaTracesDir,
          worker
        );
        createdTraces.push(trace);
      }

      await waitForAsync(400);

      // Verify all traces are discovered
      const tracesResponse = await fetch(`${baseUrl}/api/traces`);
      const tracesData = await tracesResponse.json();

      expect(tracesData.traces).toHaveLength(4);

      const agentIds = tracesData.traces.map((t: any) => t.agentId).sort();
      expect(agentIds).toEqual([
        'soma-cartographer',
        'soma-harvester',
        'soma-reconciler',
        'soma-synthesizer'
      ]);

      // Test enhancement for each worker type
      const dataReader = new DefaultSOMADataReader({
        statePath: somaStateDir,
        vaultPath: somaVaultDir
      });

      const enhancer = new TraceEnhancementService({
        somaDataReader: dataReader
      });

      for (const trace of createdTraces) {
        const result = await enhancer.enhanceTrace(trace);

        if (trace.agentId === 'soma-harvester' || trace.agentId === 'soma-synthesizer') {
          // These have operational data
          expect(result.enhanced).toBe(true);
        } else {
          // These don't have operational data in our test setup
          expect(result.enhanced).toBe(false);
        }

        expect(result.errors).toHaveLength(0);
      }
    });

    test('handles SOMA trace updates and real-time enhancement', async () => {
      // Create initial operational data
      createSOMAOperationalData();

      // Create initial trace
      let harvesterTrace = createSOMATrace(
        'soma-harvester',
        'dynamic-harvester.json',
        somaTracesDir,
        'harvester'
      );

      await waitForAsync(200);

      // Verify initial trace
      const initialResponse = await fetch(`${baseUrl}/api/traces`);
      const initialData = await initialResponse.json();
      expect(initialData.traces).toHaveLength(1);

      // Update the trace (simulate completion with different status)
      harvesterTrace.status = 'failed';
      harvesterTrace.endTime = Date.now();
      harvesterTrace.nodes['node-2'].status = 'failed';
      harvesterTrace.nodes['node-2'].metadata = {
        ...harvesterTrace.nodes['node-2'].metadata,
        error: 'Processing timeout'
      };

      fs.writeFileSync(
        path.join(somaTracesDir, 'dynamic-harvester.json'),
        JSON.stringify(harvesterTrace, null, 2)
      );

      await waitForAsync(300);

      // Verify updated trace
      const updatedResponse = await fetch(`${baseUrl}/api/traces`);
      const updatedData = await updatedResponse.json();
      expect(updatedData.traces).toHaveLength(1);
      expect(updatedData.traces[0].status).toBe('failed');

      // Test enhancement on failed trace
      const dataReader = new DefaultSOMADataReader({
        statePath: somaStateDir,
        vaultPath: somaVaultDir
      });

      const enhancer = new TraceEnhancementService({
        somaDataReader: dataReader
      });

      const enhancementResult = await enhancer.enhanceTrace(harvesterTrace);
      expect(enhancementResult.enhanced).toBe(true);

      const enhancedTrace = enhancementResult.trace as any;
      expect(enhancedTrace.status).toBe('failed');
      expect(enhancedTrace.enhancementInfo).toBeDefined();
    });
  });

  describe('Error Scenarios and Recovery', () => {
    test('handles missing SOMA operational data gracefully', async () => {
      // Create SOMA traces without operational data
      createSOMATrace('soma-harvester', 'no-data.json', somaTracesDir, 'harvester');

      await waitForAsync(200);

      // Traces should still be discovered
      const tracesResponse = await fetch(`${baseUrl}/api/traces`);
      const tracesData = await tracesResponse.json();
      expect(tracesData.traces).toHaveLength(1);

      // Enhancement should fall back gracefully
      const dataReader = new DefaultSOMADataReader({
        statePath: somaStateDir,
        vaultPath: somaVaultDir
      });

      const enhancer = new TraceEnhancementService({
        somaDataReader: dataReader
      });

      const trace = tracesData.traces[0];
      const result = await enhancer.enhanceTrace(trace);

      expect(result.enhanced).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.trace).toEqual(trace); // Falls back to original
    });

    test('handles corrupted SOMA state files', async () => {
      // Create corrupted state files
      fs.writeFileSync(path.join(somaStateDir, 'harvester-state.json'), 'invalid json');
      fs.writeFileSync(path.join(somaStateDir, 'synthesizer-state.json'), '{"incomplete": true}');

      createSOMATrace('soma-harvester', 'corrupted-data.json', somaTracesDir, 'harvester');

      await waitForAsync(200);

      const dataReader = new DefaultSOMADataReader({
        statePath: somaStateDir,
        vaultPath: somaVaultDir
      });

      const operationalData = await dataReader.readOperationalData();

      // Should handle corrupted files gracefully
      expect(operationalData.harvesterState).toBeNull();
      expect(operationalData.synthesizerState).toBeNull();
      expect(operationalData.errors).toHaveLength(0); // Errors are handled internally
    });

    test('recovers from temporary file system issues', async () => {
      // Create initial setup
      createSOMAOperationalData();
      createSOMATrace('soma-harvester', 'recovery-test.json', somaTracesDir, 'harvester');

      await waitForAsync(200);

      // Verify initial state works
      const dataReader = new DefaultSOMADataReader({
        statePath: somaStateDir,
        vaultPath: somaVaultDir
      });

      const initialData = await dataReader.readOperationalData();
      expect(initialData.harvesterState).not.toBeNull();

      // Simulate temporary file system issue by removing state directory
      fs.rmSync(somaStateDir, { recursive: true });

      const dataAfterIssue = await dataReader.readOperationalData();
      expect(dataAfterIssue.harvesterState).toBeNull();

      // Restore state directory
      fs.mkdirSync(somaStateDir, { recursive: true });
      createSOMAOperationalData();

      const recoveredData = await dataReader.readOperationalData();
      expect(recoveredData.harvesterState).not.toBeNull();
      expect(recoveredData.harvesterState?.type).toBe('harvester');
    });
  });

  describe('Performance and Scalability', () => {
    test('handles large-scale SOMA trace processing', async () => {
      // Create operational data
      createSOMAOperationalData();

      // Create many SOMA traces
      const numTraces = 20;
      const tracePromises = [];

      for (let i = 0; i < numTraces; i++) {
        const workerType = ['harvester', 'synthesizer', 'reconciler', 'cartographer'][i % 4] as any;
        const trace = createSOMATrace(
          `soma-${workerType}-${i}`,
          `${workerType}-${i}.json`,
          somaTracesDir,
          workerType
        );
        tracePromises.push(trace);
      }

      await waitForAsync(600); // More time for many traces

      // Verify all traces are discovered
      const tracesResponse = await fetch(`${baseUrl}/api/traces`);
      const tracesData = await tracesResponse.json();
      expect(tracesData.traces).toHaveLength(numTraces);

      // Test concurrent enhancement
      const dataReader = new DefaultSOMADataReader({
        statePath: somaStateDir,
        vaultPath: somaVaultDir
      });

      const enhancer = new TraceEnhancementService({
        somaDataReader: dataReader
      });

      const startTime = Date.now();
      const enhancementPromises = tracePromises.slice(0, 5).map(trace =>
        enhancer.enhanceTrace(trace)
      );

      const results = await Promise.all(enhancementPromises);
      const processingTime = Date.now() - startTime;

      expect(processingTime).toBeLessThan(10000); // Should complete within 10 seconds

      // Verify enhancement results
      for (const result of results) {
        expect(result).toBeDefined();
        expect(result.errors).toBeDefined();
      }
    });
  });
});