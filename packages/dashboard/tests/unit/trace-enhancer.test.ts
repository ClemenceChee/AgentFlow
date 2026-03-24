/**
 * Unit tests for Trace Enhancement Service
 */
import { test, expect, describe, beforeEach, afterEach, vi } from 'vitest';
import {
  TraceEnhancementService,
  type TraceEnhancementOptions,
  type EnhancedTraceGraph,
  type EnhancedTraceNode,
  type TraceEnhancementResult
} from '../../src/trace-enhancer.js';
import type { TraceGraph, TraceNode } from '../../src/trace-graph.js';
import type { SOMADataReader, SOMAOperationalData, SOMAHarvesterState, SOMASynthesizerState } from '../../src/soma-data-reader.js';

// Mock SOMA data reader
class MockSOMADataReader implements Partial<SOMADataReader> {
  private mockOperationalData: SOMAOperationalData | null = null;
  private available = true;

  setMockOperationalData(data: SOMAOperationalData | null) {
    this.mockOperationalData = data;
  }

  setAvailable(available: boolean) {
    this.available = available;
  }

  async readOperationalData(): Promise<SOMAOperationalData> {
    return this.mockOperationalData ?? {
      harvesterState: null,
      synthesizerState: null,
      reconcilerState: null,
      cartographerState: null,
      vaultChanges: [],
      lastUpdated: Date.now(),
      errors: []
    };
  }

  isSOMADataAvailable(): boolean {
    return this.available;
  }

  async readHarvesterState() {
    return this.mockOperationalData?.harvesterState ?? null;
  }

  async readSynthesizerState() {
    return this.mockOperationalData?.synthesizerState ?? null;
  }

  async readReconcilerState() {
    return this.mockOperationalData?.reconcilerState ?? null;
  }

  async readCartographerState() {
    return this.mockOperationalData?.cartographerState ?? null;
  }

  async readVaultChanges() {
    return this.mockOperationalData?.vaultChanges ?? [];
  }

  async readWorkerState() {
    return null;
  }

  async repairStateFile() {
    return true;
  }
}

describe('Trace Enhancement Service', () => {
  let mockDataReader: MockSOMADataReader;
  let service: TraceEnhancementService;

  // Sample trace for testing
  const createSampleTrace = (agentId = 'test-agent'): TraceGraph => ({
    id: 'trace-123',
    rootNodeId: 'node-1',
    agentId,
    name: 'Test Execution',
    trigger: 'user',
    filename: 'test-trace.json',
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
        metadata: {},
        state: {}
      },
      'node-2': {
        id: 'node-2',
        type: 'tool',
        name: 'Process Data',
        startTime: Date.now() - 8000,
        endTime: Date.now() - 2000,
        status: 'completed',
        parentId: 'node-1',
        children: [],
        metadata: { tool: 'data-processor' },
        state: {}
      }
    }
  });

  beforeEach(() => {
    mockDataReader = new MockSOMADataReader();
    service = new TraceEnhancementService({
      somaDataReader: mockDataReader as any,
      cacheTimeoutMs: 1000 // Short timeout for testing
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Constructor and Configuration', () => {
    test('creates service with default configuration', () => {
      const defaultService = new TraceEnhancementService();
      expect(defaultService).toBeDefined();
    });

    test('creates service with custom configuration', () => {
      const customService = new TraceEnhancementService({
        somaDataReader: mockDataReader as any,
        cacheTimeoutMs: 30000
      });
      expect(customService).toBeDefined();
    });
  });

  describe('Basic Trace Enhancement', () => {
    test('enhances trace when SOMA data is available', async () => {
      const harvesterState: SOMAHarvesterState = {
        type: 'harvester',
        lastRun: Date.now() - 5000,
        entityCount: 100,
        filesProcessed: 5,
        eventsIngested: 25
      };

      mockDataReader.setMockOperationalData({
        harvesterState,
        synthesizerState: null,
        reconcilerState: null,
        cartographerState: null,
        vaultChanges: [],
        lastUpdated: Date.now(),
        errors: []
      });

      const trace = createSampleTrace('soma-harvester');
      const result = await service.enhanceTrace(trace);

      expect(result.enhanced).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.cacheHit).toBe(false);

      const enhancedTrace = result.trace as EnhancedTraceGraph;
      expect(enhancedTrace.enhancementInfo).toBeDefined();
      expect(enhancedTrace.enhancementInfo.enhancedAt).toBeTypeOf('number');
      expect(enhancedTrace.enhancementInfo.enhancementLevel).toBeDefined();
    });

    test('falls back to basic trace when SOMA data is unavailable', async () => {
      mockDataReader.setAvailable(false);

      const trace = createSampleTrace();
      const result = await service.enhanceTrace(trace);

      expect(result.enhanced).toBe(false);
      expect(result.trace).toEqual(trace);
      expect(result.errors).toContain('SOMA data not available - returning basic trace');
    });

    test('handles SOMA trace detection correctly', async () => {
      const somaTrace = createSampleTrace('soma-harvester');
      const regularTrace = createSampleTrace('regular-agent');

      mockDataReader.setMockOperationalData({
        harvesterState: { type: 'harvester', lastRun: Date.now() } as SOMAHarvesterState,
        synthesizerState: null,
        reconcilerState: null,
        cartographerState: null,
        vaultChanges: [],
        lastUpdated: Date.now(),
        errors: []
      });

      const somaResult = await service.enhanceTrace(somaTrace);
      const regularResult = await service.enhanceTrace(regularTrace);

      expect(somaResult.enhanced).toBe(true);
      expect(regularResult.enhanced).toBe(false); // Not a SOMA trace
    });
  });

  describe('Enhancement Options', () => {
    test('respects includeDetailedSteps option', async () => {
      mockDataReader.setMockOperationalData({
        harvesterState: { type: 'harvester', lastRun: Date.now() } as SOMAHarvesterState,
        synthesizerState: null,
        reconcilerState: null,
        cartographerState: null,
        vaultChanges: [],
        lastUpdated: Date.now(),
        errors: []
      });

      const trace = createSampleTrace('soma-harvester');

      const detailedResult = await service.enhanceTrace(trace, {
        includeDetailedSteps: true
      });

      const basicResult = await service.enhanceTrace(trace, {
        includeDetailedSteps: false
      });

      expect(detailedResult.enhanced).toBe(true);
      expect(basicResult.enhanced).toBe(true);

      const detailedTrace = detailedResult.trace as EnhancedTraceGraph;
      const basicTrace = basicResult.trace as EnhancedTraceGraph;

      expect(detailedTrace.enhancementInfo.enhancementLevel).toBe('detailed');
      expect(basicTrace.enhancementInfo.enhancementLevel).toBe('basic');
    });

    test('respects includeMetrics option', async () => {
      mockDataReader.setMockOperationalData({
        harvesterState: {
          type: 'harvester',
          lastRun: Date.now(),
          entityCount: 150,
          filesProcessed: 8
        } as SOMAHarvesterState,
        synthesizerState: null,
        reconcilerState: null,
        cartographerState: null,
        vaultChanges: [],
        lastUpdated: Date.now(),
        errors: []
      });

      const trace = createSampleTrace('soma-harvester');

      const withMetrics = await service.enhanceTrace(trace, {
        includeMetrics: true
      });

      const withoutMetrics = await service.enhanceTrace(trace, {
        includeMetrics: false
      });

      expect(withMetrics.enhanced).toBe(true);
      expect(withoutMetrics.enhanced).toBe(true);

      // Both should be enhanced but with different levels of detail
      const metricsTrace = withMetrics.trace as EnhancedTraceGraph;
      const noMetricsTrace = withoutMetrics.trace as EnhancedTraceGraph;

      expect(metricsTrace.enhancementInfo).toBeDefined();
      expect(noMetricsTrace.enhancementInfo).toBeDefined();
    });

    test('respects maxDataAge option', async () => {
      // Create old operational data
      const oldTimestamp = Date.now() - (2 * 24 * 60 * 60 * 1000); // 2 days old

      mockDataReader.setMockOperationalData({
        harvesterState: {
          type: 'harvester',
          lastRun: oldTimestamp
        } as SOMAHarvesterState,
        synthesizerState: null,
        reconcilerState: null,
        cartographerState: null,
        vaultChanges: [],
        lastUpdated: oldTimestamp,
        errors: []
      });

      const trace = createSampleTrace('soma-harvester');

      const recentResult = await service.enhanceTrace(trace, {
        maxDataAge: 24 * 60 * 60 * 1000 // 1 day
      });

      const oldResult = await service.enhanceTrace(trace, {
        maxDataAge: 3 * 24 * 60 * 60 * 1000 // 3 days
      });

      // Data too old for first case, acceptable for second
      expect(recentResult.enhanced).toBe(false);
      expect(oldResult.enhanced).toBe(true);
    });
  });

  describe('Caching Functionality', () => {
    test('caches enhancement results', async () => {
      mockDataReader.setMockOperationalData({
        harvesterState: { type: 'harvester', lastRun: Date.now() } as SOMAHarvesterState,
        synthesizerState: null,
        reconcilerState: null,
        cartographerState: null,
        vaultChanges: [],
        lastUpdated: Date.now(),
        errors: []
      });

      const trace = createSampleTrace('soma-harvester');

      // First call - should not be cached
      const firstResult = await service.enhanceTrace(trace, { enableCaching: true });
      expect(firstResult.cacheHit).toBe(false);

      // Second call - should be cached
      const secondResult = await service.enhanceTrace(trace, { enableCaching: true });
      expect(secondResult.cacheHit).toBe(true);
      expect(secondResult.trace).toEqual(firstResult.trace);
    });

    test('respects enableCaching option', async () => {
      mockDataReader.setMockOperationalData({
        harvesterState: { type: 'harvester', lastRun: Date.now() } as SOMAHarvesterState,
        synthesizerState: null,
        reconcilerState: null,
        cartographerState: null,
        vaultChanges: [],
        lastUpdated: Date.now(),
        errors: []
      });

      const trace = createSampleTrace('soma-harvester');

      // First call with caching disabled
      const firstResult = await service.enhanceTrace(trace, { enableCaching: false });
      expect(firstResult.cacheHit).toBe(false);

      // Second call with caching disabled - should not be cached
      const secondResult = await service.enhanceTrace(trace, { enableCaching: false });
      expect(secondResult.cacheHit).toBe(false);
    });

    test('invalidates cache when operational data changes', async () => {
      const initialData = {
        harvesterState: { type: 'harvester', lastRun: Date.now(), entityCount: 100 } as SOMAHarvesterState,
        synthesizerState: null,
        reconcilerState: null,
        cartographerState: null,
        vaultChanges: [],
        lastUpdated: Date.now(),
        errors: []
      };

      mockDataReader.setMockOperationalData(initialData);

      const trace = createSampleTrace('soma-harvester');

      // First enhancement
      const firstResult = await service.enhanceTrace(trace, { enableCaching: true });
      expect(firstResult.cacheHit).toBe(false);

      // Verify cached
      const cachedResult = await service.enhanceTrace(trace, { enableCaching: true });
      expect(cachedResult.cacheHit).toBe(true);

      // Change operational data
      mockDataReader.setMockOperationalData({
        ...initialData,
        harvesterState: { type: 'harvester', lastRun: Date.now(), entityCount: 200 } as SOMAHarvesterState
      });

      // Invalidate cache
      const invalidationResult = await service.invalidateCacheIfStale();
      expect(invalidationResult.invalidatedEntries).toBeGreaterThan(0);

      // Next enhancement should not be cached
      const afterInvalidationResult = await service.enhanceTrace(trace, { enableCaching: true });
      expect(afterInvalidationResult.cacheHit).toBe(false);
    });
  });

  describe('SOMA Worker-Specific Enhancement', () => {
    test('enhances harvester traces with specific steps', async () => {
      mockDataReader.setMockOperationalData({
        harvesterState: {
          type: 'harvester',
          lastRun: Date.now() - 5000,
          entityCount: 50,
          filesProcessed: 3,
          eventsIngested: 15,
          inboxStats: {
            totalFiles: 5,
            processedFiles: 3,
            skippedFiles: 1,
            errorFiles: 1
          }
        } as SOMAHarvesterState,
        synthesizerState: null,
        reconcilerState: null,
        cartographerState: null,
        vaultChanges: [],
        lastUpdated: Date.now(),
        errors: []
      });

      const trace = createSampleTrace('soma-harvester');
      const result = await service.enhanceTrace(trace);

      expect(result.enhanced).toBe(true);
      const enhancedTrace = result.trace as EnhancedTraceGraph;

      // Should have enhanced nodes with harvester-specific data
      const enhancedNodes = Object.values(enhancedTrace.nodes);
      expect(enhancedNodes.length).toBeGreaterThan(Object.keys(trace.nodes).length);

      // Check for operational data in enhanced nodes
      const nodesWithOpData = enhancedNodes.filter(node => node.operationalData);
      expect(nodesWithOpData.length).toBeGreaterThan(0);
    });

    test('enhances synthesizer traces with analysis steps', async () => {
      mockDataReader.setMockOperationalData({
        harvesterState: null,
        synthesizerState: {
          type: 'synthesizer',
          lastRun: Date.now() - 3600000, // 1 hour ago
          entityCount: 200,
          candidatesAnalyzed: 40,
          insightsGenerated: 8,
          llmAnalysisDuration: 25000,
          confidenceScores: [0.9, 0.85, 0.92, 0.78]
        } as SOMASynthesizerState,
        reconcilerState: null,
        cartographerState: null,
        vaultChanges: [],
        lastUpdated: Date.now(),
        errors: []
      });

      const trace = createSampleTrace('soma-synthesizer');
      const result = await service.enhanceTrace(trace);

      expect(result.enhanced).toBe(true);
      const enhancedTrace = result.trace as EnhancedTraceGraph;

      expect(enhancedTrace.enhancementInfo.enhancementLevel).toBeDefined();
      expect(enhancedTrace.enhancementInfo.dataSourcesUsed).toContain('synthesizer');
    });
  });

  describe('Error Handling', () => {
    test('handles corrupted operational data gracefully', async () => {
      mockDataReader.setMockOperationalData({
        harvesterState: null,
        synthesizerState: null,
        reconcilerState: null,
        cartographerState: null,
        vaultChanges: [],
        lastUpdated: Date.now(),
        errors: ['Failed to parse harvester state', 'Vault access denied']
      });

      const trace = createSampleTrace('soma-harvester');
      const result = await service.enhanceTrace(trace);

      expect(result.enhanced).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.trace).toEqual(trace); // Fallback to original
    });

    test('handles enhancement processing errors', async () => {
      // Simulate a critical error by providing malformed data
      const brokenDataReader = {
        async readOperationalData() {
          throw new Error('Critical system failure');
        },
        isSOMADataAvailable() {
          return true;
        }
      } as any;

      const brokenService = new TraceEnhancementService({
        somaDataReader: brokenDataReader
      });

      const trace = createSampleTrace('soma-harvester');
      const result = await brokenService.enhanceTrace(trace);

      expect(result.enhanced).toBe(false);
      expect(result.errors).toContain('Critical enhancement error: Critical system failure');
      expect(result.trace).toEqual(trace);
    });

    test('falls back gracefully when trace format is invalid', async () => {
      mockDataReader.setMockOperationalData({
        harvesterState: { type: 'harvester', lastRun: Date.now() } as SOMAHarvesterState,
        synthesizerState: null,
        reconcilerState: null,
        cartographerState: null,
        vaultChanges: [],
        lastUpdated: Date.now(),
        errors: []
      });

      // Create invalid trace structure
      const invalidTrace = {
        ...createSampleTrace('soma-harvester'),
        nodes: undefined // Invalid nodes structure
      } as any;

      const result = await service.enhanceTrace(invalidTrace);
      expect(result.enhanced).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Cache Management', () => {
    test('cache timeout works correctly', async () => {
      mockDataReader.setMockOperationalData({
        harvesterState: { type: 'harvester', lastRun: Date.now() } as SOMAHarvesterState,
        synthesizerState: null,
        reconcilerState: null,
        cartographerState: null,
        vaultChanges: [],
        lastUpdated: Date.now(),
        errors: []
      });

      const trace = createSampleTrace('soma-harvester');

      // First enhancement
      const firstResult = await service.enhanceTrace(trace, { enableCaching: true });
      expect(firstResult.cacheHit).toBe(false);

      // Wait for cache timeout
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Invalidate stale cache entries
      const invalidationResult = await service.invalidateCacheIfStale();
      expect(invalidationResult.invalidatedEntries).toBeGreaterThanOrEqual(0);

      // Next call should not be cached due to timeout
      const afterTimeoutResult = await service.enhanceTrace(trace, { enableCaching: true });
      expect(afterTimeoutResult.cacheHit).toBe(false);
    });

    test('cache key generation works correctly', async () => {
      mockDataReader.setMockOperationalData({
        harvesterState: { type: 'harvester', lastRun: Date.now() } as SOMAHarvesterState,
        synthesizerState: null,
        reconcilerState: null,
        cartographerState: null,
        vaultChanges: [],
        lastUpdated: Date.now(),
        errors: []
      });

      const trace = createSampleTrace('soma-harvester');

      // Same trace with different options should have different cache keys
      await service.enhanceTrace(trace, { includeDetailedSteps: true, enableCaching: true });
      await service.enhanceTrace(trace, { includeDetailedSteps: false, enableCaching: true });

      // Both should be cached separately
      const result1 = await service.enhanceTrace(trace, { includeDetailedSteps: true, enableCaching: true });
      const result2 = await service.enhanceTrace(trace, { includeDetailedSteps: false, enableCaching: true });

      expect(result1.cacheHit).toBe(true);
      expect(result2.cacheHit).toBe(true);
    });
  });
});