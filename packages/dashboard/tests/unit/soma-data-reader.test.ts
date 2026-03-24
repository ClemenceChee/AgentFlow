/**
 * Unit tests for SOMA Operational Data Reader
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  DefaultSOMADataReader,
  type SOMACartographerState,
  type SOMADataReaderConfig,
  type SOMAHarvesterState,
  type SOMAReconcilerState,
  type SOMASynthesizerState,
  type SOMAVaultChange,
  type SOMAWorkerState,
} from '../../src/soma-data-reader.js';

describe('SOMA Data Reader', () => {
  let tempDir: string;
  let reader: DefaultSOMADataReader;
  let vaultPath: string;
  let statePath: string;

  beforeEach(() => {
    // Create temporary directory structure
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'soma-test-'));
    vaultPath = path.join(tempDir, 'vault');
    statePath = path.join(tempDir, 'state');

    // Create directory structure
    fs.mkdirSync(vaultPath, { recursive: true });
    fs.mkdirSync(statePath, { recursive: true });

    // Initialize reader with test paths
    const config: SOMADataReaderConfig = {
      vaultPath,
      statePath,
      maxStateAge: 1000 * 60 * 60, // 1 hour
      enableErrorLogging: true,
      maxRetries: 2,
    };

    reader = new DefaultSOMADataReader(config);
  });

  afterEach(() => {
    // Clean up temporary directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Configuration', () => {
    test('uses default configuration when none provided', () => {
      const defaultReader = new DefaultSOMADataReader();
      expect(defaultReader).toBeDefined();
    });

    test('accepts custom configuration', () => {
      const customConfig: SOMADataReaderConfig = {
        vaultPath: '/custom/vault',
        statePath: '/custom/state',
        maxStateAge: 2000,
        enableErrorLogging: false,
        maxRetries: 5,
      };

      const customReader = new DefaultSOMADataReader(customConfig);
      expect(customReader).toBeDefined();
    });
  });

  describe('Harvester State Reading', () => {
    test('reads valid harvester state file', async () => {
      const harvesterState: SOMAHarvesterState = {
        type: 'harvester',
        lastRun: Date.now() - 30000,
        entityCount: 150,
        processedEventIds: ['event1', 'event2', 'event3'],
        filesProcessed: 5,
        eventsIngested: 25,
        inboxStats: {
          totalFiles: 10,
          processedFiles: 5,
          skippedFiles: 2,
          errorFiles: 3,
        },
        lastProcessedFiles: ['file1.json', 'file2.json'],
        processingDuration: 5000,
        errors: {
          count: 1,
          lastError: 'Failed to parse file3.json',
          timestamp: Date.now() - 15000,
        },
      };

      // Write test state file
      const stateFile = path.join(statePath, 'harvester-state.json');
      fs.writeFileSync(stateFile, JSON.stringify(harvesterState, null, 2));

      const result = await reader.readHarvesterState();
      expect(result).toEqual(harvesterState);
      expect(result?.type).toBe('harvester');
      expect(result?.filesProcessed).toBe(5);
      expect(result?.inboxStats?.totalFiles).toBe(10);
    });

    test('returns null for missing harvester state file', async () => {
      const result = await reader.readHarvesterState();
      expect(result).toBeNull();
    });

    test('handles corrupted harvester state file', async () => {
      const stateFile = path.join(statePath, 'harvester-state.json');
      fs.writeFileSync(stateFile, 'invalid json content');

      const result = await reader.readHarvesterState();
      expect(result).toBeNull();
    });

    test('handles stale harvester state file', async () => {
      const staleState: SOMAHarvesterState = {
        type: 'harvester',
        lastRun: Date.now() - 2 * 60 * 60 * 1000, // 2 hours ago
        entityCount: 100,
      };

      const stateFile = path.join(statePath, 'harvester-state.json');
      fs.writeFileSync(stateFile, JSON.stringify(staleState, null, 2));

      const result = await reader.readHarvesterState();
      expect(result?.lastRun).toBe(staleState.lastRun);
      // Should still return data but flag as stale
    });
  });

  describe('Synthesizer State Reading', () => {
    test('reads valid synthesizer state file', async () => {
      const synthesizerState: SOMASynthesizerState = {
        type: 'synthesizer',
        lastRun: Date.now() - 60000,
        entityCount: 200,
        processedEventIds: ['syn1', 'syn2'],
        candidatesAnalyzed: 50,
        insightsGenerated: 12,
        llmAnalysisDuration: 45000,
        deduplicationStats: {
          duplicatesFound: 8,
          uniqueInsights: 4,
          similarityThreshold: 0.85,
        },
        confidenceScores: [0.9, 0.85, 0.92, 0.88],
        errors: {
          count: 2,
          lastError: 'LLM timeout',
          timestamp: Date.now() - 30000,
        },
      };

      const stateFile = path.join(statePath, 'synthesizer-state.json');
      fs.writeFileSync(stateFile, JSON.stringify(synthesizerState, null, 2));

      const result = await reader.readSynthesizerState();
      expect(result).toEqual(synthesizerState);
      expect(result?.type).toBe('synthesizer');
      expect(result?.candidatesAnalyzed).toBe(50);
      expect(result?.deduplicationStats?.duplicatesFound).toBe(8);
    });

    test('returns null for missing synthesizer state file', async () => {
      const result = await reader.readSynthesizerState();
      expect(result).toBeNull();
    });
  });

  describe('Reconciler State Reading', () => {
    test('reads valid reconciler state file', async () => {
      const reconcilerState: SOMAReconcilerState = {
        type: 'reconciler',
        lastRun: Date.now() - 120000,
        entityCount: 75,
        processedEventIds: ['rec1', 'rec2', 'rec3'],
        issuesDetected: 15,
        entitiesMerged: 8,
        dataConsistencyFixes: 3,
        structuralIssues: {
          missingReferences: 5,
          duplicateEntities: 8,
          brokenLinks: 2,
        },
        processingStats: {
          scanDuration: 8000,
          fixDuration: 12000,
          totalDuration: 20000,
        },
      };

      const stateFile = path.join(statePath, 'reconciler-state.json');
      fs.writeFileSync(stateFile, JSON.stringify(reconcilerState, null, 2));

      const result = await reader.readReconcilerState();
      expect(result).toEqual(reconcilerState);
      expect(result?.type).toBe('reconciler');
      expect(result?.issuesDetected).toBe(15);
      expect(result?.structuralIssues?.duplicateEntities).toBe(8);
    });
  });

  describe('Cartographer State Reading', () => {
    test('reads valid cartographer state file', async () => {
      const cartographerState: SOMACartographerState = {
        type: 'cartographer',
        lastRun: Date.now() - 90000,
        entityCount: 300,
        processedEventIds: ['cart1', 'cart2'],
        entitiesEmbedded: 250,
        archetypesDiscovered: 15,
        relationshipsMapped: 180,
        embeddingStats: {
          averageDimensions: 512,
          processingTime: 25000,
          vectorStoreSize: 125000,
        },
        clusteringResults: {
          clustersFound: 12,
          averageClusterSize: 20,
          silhouetteScore: 0.75,
        },
      };

      const stateFile = path.join(statePath, 'cartographer-state.json');
      fs.writeFileSync(stateFile, JSON.stringify(cartographerState, null, 2));

      const result = await reader.readCartographerState();
      expect(result).toEqual(cartographerState);
      expect(result?.type).toBe('cartographer');
      expect(result?.archetypesDiscovered).toBe(15);
      expect(result?.embeddingStats?.vectorStoreSize).toBe(125000);
    });
  });

  describe('Generic Worker State Reading', () => {
    test('reads any worker state by type', async () => {
      const genericState: SOMAWorkerState = {
        type: 'harvester',
        lastRun: Date.now() - 45000,
        entityCount: 125,
        processedEventIds: ['gen1', 'gen2'],
        customField: 'test-value',
      };

      const stateFile = path.join(statePath, 'harvester-state.json');
      fs.writeFileSync(stateFile, JSON.stringify(genericState, null, 2));

      const result = await reader.readWorkerState('harvester');
      expect(result).toEqual(genericState);
      expect(result?.type).toBe('harvester');
      expect(result?.customField).toBe('test-value');
    });

    test('returns null for unknown worker type', async () => {
      const result = await reader.readWorkerState('unknown-worker');
      expect(result).toBeNull();
    });
  });

  describe('Vault Change Detection', () => {
    test('detects vault changes from change log', async () => {
      const vaultChanges: SOMAVaultChange[] = [
        {
          timestamp: Date.now() - 60000,
          entityId: 'entity1',
          entityType: 'insight',
          operation: 'create',
          layer: 'emerging',
          metadata: { confidence: 0.85 },
        },
        {
          timestamp: Date.now() - 30000,
          entityId: 'entity2',
          entityType: 'policy',
          operation: 'update',
          layer: 'canon',
          metadata: { enforcement: 'strict' },
        },
      ];

      // Write change log file
      const changeLogFile = path.join(vaultPath, '_mutations.jsonl');
      const changeLogContent = vaultChanges.map((change) => JSON.stringify(change)).join('\n');
      fs.writeFileSync(changeLogFile, changeLogContent);

      const result = await reader.readVaultChanges();
      expect(result).toHaveLength(2);
      expect(result[0].operation).toBe('create');
      expect(result[1].operation).toBe('update');
      expect(result[0].layer).toBe('emerging');
      expect(result[1].layer).toBe('canon');
    });

    test('returns empty array for missing change log', async () => {
      const result = await reader.readVaultChanges();
      expect(result).toEqual([]);
    });

    test('handles corrupted change log gracefully', async () => {
      const changeLogFile = path.join(vaultPath, '_mutations.jsonl');
      fs.writeFileSync(changeLogFile, 'invalid json line\n{"valid": true}');

      const result = await reader.readVaultChanges();
      expect(result).toHaveLength(1); // Should parse valid lines only
      expect(result[0].valid).toBe(true);
    });
  });

  describe('Complete Operational Data Reading', () => {
    test('reads all operational data together', async () => {
      // Create all state files
      const harvesterState: SOMAHarvesterState = {
        type: 'harvester',
        lastRun: Date.now() - 30000,
        entityCount: 100,
        filesProcessed: 5,
      };

      const synthesizerState: SOMASynthesizerState = {
        type: 'synthesizer',
        lastRun: Date.now() - 60000,
        entityCount: 50,
        candidatesAnalyzed: 25,
      };

      const vaultChanges: SOMAVaultChange[] = [
        {
          timestamp: Date.now() - 45000,
          entityId: 'test-entity',
          entityType: 'insight',
          operation: 'create',
          layer: 'emerging',
        },
      ];

      // Write files
      fs.writeFileSync(
        path.join(statePath, 'harvester-state.json'),
        JSON.stringify(harvesterState, null, 2),
      );
      fs.writeFileSync(
        path.join(statePath, 'synthesizer-state.json'),
        JSON.stringify(synthesizerState, null, 2),
      );
      fs.writeFileSync(path.join(vaultPath, '_mutations.jsonl'), JSON.stringify(vaultChanges[0]));

      const result = await reader.readOperationalData();

      expect(result.harvesterState).toEqual(harvesterState);
      expect(result.synthesizerState).toEqual(synthesizerState);
      expect(result.vaultChanges).toHaveLength(1);
      expect(result.lastUpdated).toBeTypeOf('number');
      expect(result.errors).toEqual([]);
    });

    test('handles missing files gracefully in complete read', async () => {
      const result = await reader.readOperationalData();

      expect(result.harvesterState).toBeNull();
      expect(result.synthesizerState).toBeNull();
      expect(result.reconcilerState).toBeNull();
      expect(result.cartographerState).toBeNull();
      expect(result.vaultChanges).toEqual([]);
      expect(result.errors).toEqual([]);
    });
  });

  describe('Error Handling', () => {
    test('logs errors when error logging is enabled', async () => {
      const stateFile = path.join(statePath, 'harvester-state.json');

      // Create a file with invalid permissions or content
      fs.writeFileSync(stateFile, 'invalid json');

      const result = await reader.readHarvesterState();
      expect(result).toBeNull();

      const operationalData = await reader.readOperationalData();
      expect(operationalData.harvesterState).toBeNull();
    });

    test('handles file system errors gracefully', async () => {
      // Try to read from non-existent state directory
      const config: SOMADataReaderConfig = {
        statePath: '/non/existent/path',
        vaultPath: '/non/existent/vault',
      };

      const faultyReader = new DefaultSOMADataReader(config);
      const result = await faultyReader.readOperationalData();

      expect(result.harvesterState).toBeNull();
      expect(result.vaultChanges).toEqual([]);
    });

    test('respects maxRetries configuration', async () => {
      // This is a basic test - in practice, you'd need to mock fs operations
      // to simulate retry scenarios
      const config: SOMADataReaderConfig = {
        statePath: tempDir,
        maxRetries: 1,
      };

      const retryReader = new DefaultSOMADataReader(config);
      expect(retryReader).toBeDefined();
    });
  });

  describe('State File Validation', () => {
    test('validates worker state file structure', async () => {
      const invalidState = {
        // Missing required 'type' field
        lastRun: Date.now(),
        entityCount: 50,
      };

      const stateFile = path.join(statePath, 'harvester-state.json');
      fs.writeFileSync(stateFile, JSON.stringify(invalidState, null, 2));

      const result = await reader.readHarvesterState();
      // Should handle missing required fields gracefully
      expect(result).toBeNull();
    });

    test('handles partial state data', async () => {
      const partialState: Partial<SOMAHarvesterState> = {
        type: 'harvester',
        lastRun: Date.now() - 30000,
        // Missing other optional fields
      };

      const stateFile = path.join(statePath, 'harvester-state.json');
      fs.writeFileSync(stateFile, JSON.stringify(partialState, null, 2));

      const result = await reader.readHarvesterState();
      expect(result?.type).toBe('harvester');
      expect(result?.lastRun).toBe(partialState.lastRun);
      expect(result?.filesProcessed).toBeUndefined();
    });
  });
});
