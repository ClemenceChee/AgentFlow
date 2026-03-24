/**
 * SOMA Operational Data Reader Interface
 *
 * Reads SOMA worker state files and vault changes to provide detailed
 * operational data for trace enhancement.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface SOMAWorkerState {
  /** Worker type (harvester, reconciler, synthesizer, cartographer) */
  type: 'harvester' | 'reconciler' | 'synthesizer' | 'cartographer';
  /** Last run timestamp */
  lastRun?: number;
  /** Entity count metrics */
  entityCount?: number;
  /** Processing statistics */
  processedEventIds?: string[];
  /** Worker-specific state data */
  [key: string]: unknown;
}

export interface SOMAHarvesterState extends SOMAWorkerState {
  type: 'harvester';
  /** Number of files processed in last run */
  filesProcessed?: number;
  /** Number of events ingested */
  eventsIngested?: number;
  /** Inbox scan statistics */
  inboxStats?: {
    totalFiles: number;
    processedFiles: number;
    skippedFiles: number;
    errorFiles: number;
  };
  /** Last processed file paths */
  lastProcessedFiles?: string[];
  /** Processing duration in milliseconds */
  processingDuration?: number;
  /** Error count and details */
  errors?: {
    count: number;
    lastError?: string;
    timestamp?: number;
  };
}

export interface SOMASynthesizerState extends SOMAWorkerState {
  type: 'synthesizer';
  /** Number of candidates analyzed */
  candidatesAnalyzed?: number;
  /** Number of insights created */
  insightsCreated?: number;
  /** LLM analysis statistics */
  llmStats?: {
    totalCalls: number;
    successfulCalls: number;
    failedCalls: number;
    averageLatency?: number;
  };
  /** Candidate scoring metrics */
  scoringStats?: {
    averageScore: number;
    highScoreCount: number;
    lowScoreCount: number;
    scoringThreshold: number;
  };
  /** Deduplication statistics */
  deduplicationStats?: {
    duplicatesFound: number;
    duplicatesRemoved: number;
    uniqueInsights: number;
  };
  /** Last created insight IDs */
  lastCreatedInsights?: string[];
  /** Processing duration in milliseconds */
  processingDuration?: number;
  /** Error count and details */
  errors?: {
    count: number;
    lastError?: string;
    timestamp?: number;
  };
}

export interface SOMAReconcilerState extends SOMAWorkerState {
  type: 'reconciler';
  /** Number of issues detected */
  issuesDetected?: number;
  /** Number of entities merged */
  entitiesMerged?: number;
  /** Data consistency checks performed */
  consistencyChecks?: {
    totalChecks: number;
    passedChecks: number;
    failedChecks: number;
    checksPerformed: string[];
  };
  /** Entity merge statistics */
  mergeStats?: {
    duplicatesFound: number;
    successfulMerges: number;
    failedMerges: number;
    mergeConflicts: number;
  };
  /** Issue resolution statistics */
  resolutionStats?: {
    issuesResolved: number;
    issuesPending: number;
    criticalIssues: number;
    warningIssues: number;
  };
  /** Last merged entity IDs */
  lastMergedEntities?: Array<{ original: string; target: string; mergedId: string }>;
  /** Processing duration in milliseconds */
  processingDuration?: number;
  /** Error count and details */
  errors?: {
    count: number;
    lastError?: string;
    timestamp?: number;
  };
}

export interface SOMACartographerState extends SOMAWorkerState {
  type: 'cartographer';
  /** Number of entities embedded */
  entitiesEmbedded?: number;
  /** Number of archetypes discovered */
  archetypesDiscovered?: number;
  /** Number of relationships mapped */
  relationshipsMapped?: number;
  /** Embedding statistics */
  embeddingStats?: {
    vectorsGenerated: number;
    embeddingDimensions: number;
    averageSimilarity: number;
    totalClusters: number;
  };
  /** Archetype discovery metrics */
  archetypeStats?: {
    newArchetypes: number;
    updatedArchetypes: number;
    archetypeConfidence: number;
    patternStrength: number;
  };
  /** Relationship mapping statistics */
  relationshipStats?: {
    newRelationships: number;
    strengthenedRelationships: number;
    weakenedRelationships: number;
    averageRelationshipStrength: number;
  };
  /** Last discovered archetype IDs */
  lastDiscoveredArchetypes?: string[];
  /** Last mapped relationship IDs */
  lastMappedRelationships?: Array<{ from: string; to: string; type: string; strength: number }>;
  /** Processing duration in milliseconds */
  processingDuration?: number;
  /** Error count and details */
  errors?: {
    count: number;
    lastError?: string;
    timestamp?: number;
  };
}

export interface SOMAVaultChange {
  /** Entity ID that was changed */
  entityId: string;
  /** Entity type (agent, insight, decision, etc.) */
  entityType: string;
  /** Change type */
  changeType: 'created' | 'updated' | 'deleted';
  /** Timestamp of change */
  timestamp: number;
  /** File path where change occurred */
  filePath?: string;
  /** File size in bytes (for created/updated) */
  fileSize?: number;
  /** Content hash for change detection */
  contentHash?: string;
  /** Previous content hash (for updates) */
  previousHash?: string;
}

export interface SOMAOperationalData {
  /** Worker state files */
  workerStates: Record<string, SOMAWorkerState>;
  /** Recent vault changes */
  vaultChanges: SOMAVaultChange[];
  /** SOMA vault directory path */
  vaultPath?: string;
  /** Timestamp when data was collected */
  collectedAt: number;
  /** Errors encountered during data collection */
  errors: SOMADataReaderError[];
  /** Data collection success rate (0.0 - 1.0) */
  successRate: number;
}

export interface SOMADataReaderConfig {
  /** Path to SOMA vault directory */
  vaultPath?: string;
  /** Path to directory containing SOMA state files */
  statePath?: string;
  /** Maximum age of state files to consider (in ms) */
  maxStateAge?: number;
  /** Enable detailed error logging */
  enableErrorLogging?: boolean;
  /** Maximum retries for failed operations */
  maxRetries?: number;
}

export interface SOMADataReaderError {
  /** Error type */
  type:
    | 'file_not_found'
    | 'parse_error'
    | 'permission_error'
    | 'corruption_error'
    | 'timeout_error'
    | 'unknown_error';
  /** Error message */
  message: string;
  /** File path where error occurred */
  filePath?: string;
  /** Worker type related to error */
  workerType?: string;
  /** Timestamp when error occurred */
  timestamp: number;
  /** Original error object */
  originalError?: Error;
}

/**
 * Interface for reading SOMA operational data
 */
export interface SOMADataReader {
  /**
   * Read all available SOMA operational data
   */
  readOperationalData(): Promise<SOMAOperationalData>;

  /**
   * Read state for a specific worker
   */
  readWorkerState(workerType: string): Promise<SOMAWorkerState | null>;

  /**
   * Read harvester-specific state with enhanced parsing
   */
  readHarvesterState(): Promise<SOMAHarvesterState | null>;

  /**
   * Read synthesizer-specific state with enhanced parsing
   */
  readSynthesizerState(): Promise<SOMASynthesizerState | null>;

  /**
   * Read reconciler-specific state with enhanced parsing
   */
  readReconcilerState(): Promise<SOMAReconcilerState | null>;

  /**
   * Read cartographer-specific state with enhanced parsing
   */
  readCartographerState(): Promise<SOMACartographerState | null>;

  /**
   * Read recent vault changes since timestamp
   */
  readVaultChangesSince(timestamp: number): Promise<SOMAVaultChange[]>;

  /**
   * Read recent vault changes with enhanced detection including deletions
   */
  readVaultChangesDetailed(
    timestamp: number,
    options?: { includeDeletions?: boolean; includeHashes?: boolean },
  ): Promise<SOMAVaultChange[]>;

  /**
   * Check if SOMA data is available at configured paths
   */
  isSOMADataAvailable(): boolean;

  /**
   * Get recent errors from data reading operations
   */
  getRecentErrors(limit?: number): SOMADataReaderError[];

  /**
   * Validate state file structure and content
   */
  validateStateFile(
    workerType: string,
  ): Promise<{ isValid: boolean; errors: SOMADataReaderError[] }>;

  /**
   * Attempt to repair corrupted state files
   */
  repairStateFile(workerType: string): Promise<boolean>;
}

/**
 * Default implementation of SOMA data reader
 */
export class DefaultSOMADataReader implements SOMADataReader {
  private config: Required<SOMADataReaderConfig>;
  private errors: SOMADataReaderError[] = [];

  constructor(config: SOMADataReaderConfig = {}) {
    this.config = {
      vaultPath: config.vaultPath ?? path.join(process.env.HOME ?? '/tmp', '.soma/vault'),
      statePath: config.statePath ?? path.join(process.env.HOME ?? '/tmp', '.soma'),
      maxStateAge: config.maxStateAge ?? 24 * 60 * 60 * 1000, // 24 hours
      enableErrorLogging: config.enableErrorLogging ?? true,
      maxRetries: config.maxRetries ?? 3,
    };
  }

  async readOperationalData(): Promise<SOMAOperationalData> {
    const workerStates: Record<string, SOMAWorkerState> = {};
    const vaultChanges: SOMAVaultChange[] = [];
    const operationErrors: SOMADataReaderError[] = [];

    let successfulOperations = 0;
    let totalOperations = 0;

    // Read all worker state files
    const workerTypes = ['harvester', 'reconciler', 'synthesizer', 'cartographer'];
    for (const workerType of workerTypes) {
      totalOperations++;
      try {
        const state = await this.readWorkerState(workerType);
        if (state) {
          workerStates[workerType] = state;
          successfulOperations++;
        } else {
          // State file might not exist yet, which is not an error
          successfulOperations++;
        }
      } catch (error) {
        const errorType = this.classifyError(error as Error);
        const errorRecord: SOMADataReaderError = {
          type: errorType,
          message: `Failed to read ${workerType} state: ${(error as Error).message}`,
          workerType,
          originalError: error as Error,
          timestamp: Date.now(),
        };

        this.logError(errorRecord);
        operationErrors.push(errorRecord);
      }
    }

    // Read recent vault changes (last hour by default)
    totalOperations++;
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    try {
      vaultChanges.push(...(await this.readVaultChangesSince(oneHourAgo)));
      successfulOperations++;
    } catch (error) {
      const errorType = this.classifyError(error as Error);
      const errorRecord: SOMADataReaderError = {
        type: errorType,
        message: `Failed to read vault changes: ${(error as Error).message}`,
        originalError: error as Error,
        timestamp: Date.now(),
      };

      this.logError(errorRecord);
      operationErrors.push(errorRecord);
    }

    const successRate = totalOperations > 0 ? successfulOperations / totalOperations : 0;

    return {
      workerStates,
      vaultChanges,
      vaultPath: this.config.vaultPath,
      collectedAt: Date.now(),
      errors: operationErrors,
      successRate,
    };
  }

  async readWorkerState(workerType: string): Promise<SOMAWorkerState | null> {
    const stateFile = path.join(this.config.statePath, `${workerType}-state.json`);

    try {
      if (!fs.existsSync(stateFile)) {
        return null;
      }

      // Check if state file is too old
      const stats = await fs.promises.stat(stateFile);
      if (Date.now() - stats.mtime.getTime() > this.config.maxStateAge) {
        return null;
      }

      const content = await fs.promises.readFile(stateFile, 'utf-8');
      const stateData = JSON.parse(content);

      return {
        type: workerType as SOMAWorkerState['type'],
        lastRun: stats.mtime.getTime(),
        ...stateData,
      };
    } catch (error) {
      console.warn(`Failed to read ${workerType} state file:`, error);
      return null;
    }
  }

  async readHarvesterState(): Promise<SOMAHarvesterState | null> {
    const stateFile = path.join(this.config.statePath, 'harvester-state.json');

    try {
      if (!fs.existsSync(stateFile)) {
        return null;
      }

      // Check if state file is too old
      const stats = await fs.promises.stat(stateFile);
      if (Date.now() - stats.mtime.getTime() > this.config.maxStateAge) {
        return null;
      }

      const content = await fs.promises.readFile(stateFile, 'utf-8');
      const rawData = JSON.parse(content);

      // Parse harvester-specific state with proper type casting and validation
      const harvesterState: SOMAHarvesterState = {
        type: 'harvester',
        lastRun: stats.mtime.getTime(),
        entityCount: typeof rawData.entityCount === 'number' ? rawData.entityCount : undefined,
        processedEventIds: Array.isArray(rawData.processedEventIds)
          ? rawData.processedEventIds
          : [],
        filesProcessed:
          typeof rawData.filesProcessed === 'number' ? rawData.filesProcessed : undefined,
        eventsIngested:
          typeof rawData.eventsIngested === 'number' ? rawData.eventsIngested : undefined,
        lastProcessedFiles: Array.isArray(rawData.lastProcessedFiles)
          ? rawData.lastProcessedFiles
          : [],
        processingDuration:
          typeof rawData.processingDuration === 'number' ? rawData.processingDuration : undefined,
      };

      // Parse inbox statistics if available
      if (rawData.inboxStats && typeof rawData.inboxStats === 'object') {
        const stats = rawData.inboxStats;
        harvesterState.inboxStats = {
          totalFiles: typeof stats.totalFiles === 'number' ? stats.totalFiles : 0,
          processedFiles: typeof stats.processedFiles === 'number' ? stats.processedFiles : 0,
          skippedFiles: typeof stats.skippedFiles === 'number' ? stats.skippedFiles : 0,
          errorFiles: typeof stats.errorFiles === 'number' ? stats.errorFiles : 0,
        };
      }

      // Parse error information if available
      if (rawData.errors && typeof rawData.errors === 'object') {
        const errors = rawData.errors;
        harvesterState.errors = {
          count: typeof errors.count === 'number' ? errors.count : 0,
          lastError: typeof errors.lastError === 'string' ? errors.lastError : undefined,
          timestamp: typeof errors.timestamp === 'number' ? errors.timestamp : undefined,
        };
      }

      // Include any additional fields that might be worker-specific
      for (const [key, value] of Object.entries(rawData)) {
        if (!(key in harvesterState)) {
          (harvesterState as any)[key] = value;
        }
      }

      return harvesterState;
    } catch (error) {
      console.warn('Failed to read harvester state file:', error);
      return null;
    }
  }

  async readSynthesizerState(): Promise<SOMASynthesizerState | null> {
    const stateFile = path.join(this.config.statePath, 'synthesizer-state.json');

    try {
      if (!fs.existsSync(stateFile)) {
        return null;
      }

      // Check if state file is too old
      const stats = await fs.promises.stat(stateFile);
      if (Date.now() - stats.mtime.getTime() > this.config.maxStateAge) {
        return null;
      }

      const content = await fs.promises.readFile(stateFile, 'utf-8');
      const rawData = JSON.parse(content);

      // Parse synthesizer-specific state with proper type casting and validation
      const synthesizerState: SOMASynthesizerState = {
        type: 'synthesizer',
        lastRun: stats.mtime.getTime(),
        entityCount: typeof rawData.entityCount === 'number' ? rawData.entityCount : undefined,
        processedEventIds: Array.isArray(rawData.processedEventIds)
          ? rawData.processedEventIds
          : [],
        candidatesAnalyzed:
          typeof rawData.candidatesAnalyzed === 'number' ? rawData.candidatesAnalyzed : undefined,
        insightsCreated:
          typeof rawData.insightsCreated === 'number' ? rawData.insightsCreated : undefined,
        lastCreatedInsights: Array.isArray(rawData.lastCreatedInsights)
          ? rawData.lastCreatedInsights
          : [],
        processingDuration:
          typeof rawData.processingDuration === 'number' ? rawData.processingDuration : undefined,
      };

      // Parse LLM analysis statistics if available
      if (rawData.llmStats && typeof rawData.llmStats === 'object') {
        const stats = rawData.llmStats;
        synthesizerState.llmStats = {
          totalCalls: typeof stats.totalCalls === 'number' ? stats.totalCalls : 0,
          successfulCalls: typeof stats.successfulCalls === 'number' ? stats.successfulCalls : 0,
          failedCalls: typeof stats.failedCalls === 'number' ? stats.failedCalls : 0,
          averageLatency:
            typeof stats.averageLatency === 'number' ? stats.averageLatency : undefined,
        };
      }

      // Parse scoring statistics if available
      if (rawData.scoringStats && typeof rawData.scoringStats === 'object') {
        const stats = rawData.scoringStats;
        synthesizerState.scoringStats = {
          averageScore: typeof stats.averageScore === 'number' ? stats.averageScore : 0,
          highScoreCount: typeof stats.highScoreCount === 'number' ? stats.highScoreCount : 0,
          lowScoreCount: typeof stats.lowScoreCount === 'number' ? stats.lowScoreCount : 0,
          scoringThreshold: typeof stats.scoringThreshold === 'number' ? stats.scoringThreshold : 0,
        };
      }

      // Parse deduplication statistics if available
      if (rawData.deduplicationStats && typeof rawData.deduplicationStats === 'object') {
        const stats = rawData.deduplicationStats;
        synthesizerState.deduplicationStats = {
          duplicatesFound: typeof stats.duplicatesFound === 'number' ? stats.duplicatesFound : 0,
          duplicatesRemoved:
            typeof stats.duplicatesRemoved === 'number' ? stats.duplicatesRemoved : 0,
          uniqueInsights: typeof stats.uniqueInsights === 'number' ? stats.uniqueInsights : 0,
        };
      }

      // Parse error information if available
      if (rawData.errors && typeof rawData.errors === 'object') {
        const errors = rawData.errors;
        synthesizerState.errors = {
          count: typeof errors.count === 'number' ? errors.count : 0,
          lastError: typeof errors.lastError === 'string' ? errors.lastError : undefined,
          timestamp: typeof errors.timestamp === 'number' ? errors.timestamp : undefined,
        };
      }

      // Include any additional fields that might be worker-specific
      for (const [key, value] of Object.entries(rawData)) {
        if (!(key in synthesizerState)) {
          (synthesizerState as any)[key] = value;
        }
      }

      return synthesizerState;
    } catch (error) {
      console.warn('Failed to read synthesizer state file:', error);
      return null;
    }
  }

  async readReconcilerState(): Promise<SOMAReconcilerState | null> {
    const stateFile = path.join(this.config.statePath, 'reconciler-state.json');

    try {
      if (!fs.existsSync(stateFile)) {
        return null;
      }

      // Check if state file is too old
      const stats = await fs.promises.stat(stateFile);
      if (Date.now() - stats.mtime.getTime() > this.config.maxStateAge) {
        return null;
      }

      const content = await fs.promises.readFile(stateFile, 'utf-8');
      const rawData = JSON.parse(content);

      // Parse reconciler-specific state with proper type casting and validation
      const reconcilerState: SOMAReconcilerState = {
        type: 'reconciler',
        lastRun: stats.mtime.getTime(),
        entityCount: typeof rawData.entityCount === 'number' ? rawData.entityCount : undefined,
        processedEventIds: Array.isArray(rawData.processedEventIds)
          ? rawData.processedEventIds
          : [],
        issuesDetected:
          typeof rawData.issuesDetected === 'number' ? rawData.issuesDetected : undefined,
        entitiesMerged:
          typeof rawData.entitiesMerged === 'number' ? rawData.entitiesMerged : undefined,
        processingDuration:
          typeof rawData.processingDuration === 'number' ? rawData.processingDuration : undefined,
      };

      // Parse consistency check statistics if available
      if (rawData.consistencyChecks && typeof rawData.consistencyChecks === 'object') {
        const checks = rawData.consistencyChecks;
        reconcilerState.consistencyChecks = {
          totalChecks: typeof checks.totalChecks === 'number' ? checks.totalChecks : 0,
          passedChecks: typeof checks.passedChecks === 'number' ? checks.passedChecks : 0,
          failedChecks: typeof checks.failedChecks === 'number' ? checks.failedChecks : 0,
          checksPerformed: Array.isArray(checks.checksPerformed) ? checks.checksPerformed : [],
        };
      }

      // Parse merge statistics if available
      if (rawData.mergeStats && typeof rawData.mergeStats === 'object') {
        const stats = rawData.mergeStats;
        reconcilerState.mergeStats = {
          duplicatesFound: typeof stats.duplicatesFound === 'number' ? stats.duplicatesFound : 0,
          successfulMerges: typeof stats.successfulMerges === 'number' ? stats.successfulMerges : 0,
          failedMerges: typeof stats.failedMerges === 'number' ? stats.failedMerges : 0,
          mergeConflicts: typeof stats.mergeConflicts === 'number' ? stats.mergeConflicts : 0,
        };
      }

      // Parse resolution statistics if available
      if (rawData.resolutionStats && typeof rawData.resolutionStats === 'object') {
        const stats = rawData.resolutionStats;
        reconcilerState.resolutionStats = {
          issuesResolved: typeof stats.issuesResolved === 'number' ? stats.issuesResolved : 0,
          issuesPending: typeof stats.issuesPending === 'number' ? stats.issuesPending : 0,
          criticalIssues: typeof stats.criticalIssues === 'number' ? stats.criticalIssues : 0,
          warningIssues: typeof stats.warningIssues === 'number' ? stats.warningIssues : 0,
        };
      }

      // Parse last merged entities if available
      if (Array.isArray(rawData.lastMergedEntities)) {
        reconcilerState.lastMergedEntities = rawData.lastMergedEntities.filter(
          (merge: any) =>
            merge &&
            typeof merge.original === 'string' &&
            typeof merge.target === 'string' &&
            typeof merge.mergedId === 'string',
        );
      }

      // Parse error information if available
      if (rawData.errors && typeof rawData.errors === 'object') {
        const errors = rawData.errors;
        reconcilerState.errors = {
          count: typeof errors.count === 'number' ? errors.count : 0,
          lastError: typeof errors.lastError === 'string' ? errors.lastError : undefined,
          timestamp: typeof errors.timestamp === 'number' ? errors.timestamp : undefined,
        };
      }

      // Include any additional fields that might be worker-specific
      for (const [key, value] of Object.entries(rawData)) {
        if (!(key in reconcilerState)) {
          (reconcilerState as any)[key] = value;
        }
      }

      return reconcilerState;
    } catch (error) {
      console.warn('Failed to read reconciler state file:', error);
      return null;
    }
  }

  async readCartographerState(): Promise<SOMACartographerState | null> {
    const stateFile = path.join(this.config.statePath, 'cartographer-state.json');

    try {
      if (!fs.existsSync(stateFile)) {
        return null;
      }

      // Check if state file is too old
      const stats = await fs.promises.stat(stateFile);
      if (Date.now() - stats.mtime.getTime() > this.config.maxStateAge) {
        return null;
      }

      const content = await fs.promises.readFile(stateFile, 'utf-8');
      const rawData = JSON.parse(content);

      // Parse cartographer-specific state with proper type casting and validation
      const cartographerState: SOMACartographerState = {
        type: 'cartographer',
        lastRun: stats.mtime.getTime(),
        entityCount: typeof rawData.entityCount === 'number' ? rawData.entityCount : undefined,
        processedEventIds: Array.isArray(rawData.processedEventIds)
          ? rawData.processedEventIds
          : [],
        entitiesEmbedded:
          typeof rawData.entitiesEmbedded === 'number' ? rawData.entitiesEmbedded : undefined,
        archetypesDiscovered:
          typeof rawData.archetypesDiscovered === 'number'
            ? rawData.archetypesDiscovered
            : undefined,
        relationshipsMapped:
          typeof rawData.relationshipsMapped === 'number' ? rawData.relationshipsMapped : undefined,
        lastDiscoveredArchetypes: Array.isArray(rawData.lastDiscoveredArchetypes)
          ? rawData.lastDiscoveredArchetypes
          : [],
        processingDuration:
          typeof rawData.processingDuration === 'number' ? rawData.processingDuration : undefined,
      };

      // Parse embedding statistics if available
      if (rawData.embeddingStats && typeof rawData.embeddingStats === 'object') {
        const stats = rawData.embeddingStats;
        cartographerState.embeddingStats = {
          vectorsGenerated: typeof stats.vectorsGenerated === 'number' ? stats.vectorsGenerated : 0,
          embeddingDimensions:
            typeof stats.embeddingDimensions === 'number' ? stats.embeddingDimensions : 0,
          averageSimilarity:
            typeof stats.averageSimilarity === 'number' ? stats.averageSimilarity : 0,
          totalClusters: typeof stats.totalClusters === 'number' ? stats.totalClusters : 0,
        };
      }

      // Parse archetype statistics if available
      if (rawData.archetypeStats && typeof rawData.archetypeStats === 'object') {
        const stats = rawData.archetypeStats;
        cartographerState.archetypeStats = {
          newArchetypes: typeof stats.newArchetypes === 'number' ? stats.newArchetypes : 0,
          updatedArchetypes:
            typeof stats.updatedArchetypes === 'number' ? stats.updatedArchetypes : 0,
          archetypeConfidence:
            typeof stats.archetypeConfidence === 'number' ? stats.archetypeConfidence : 0,
          patternStrength: typeof stats.patternStrength === 'number' ? stats.patternStrength : 0,
        };
      }

      // Parse relationship statistics if available
      if (rawData.relationshipStats && typeof rawData.relationshipStats === 'object') {
        const stats = rawData.relationshipStats;
        cartographerState.relationshipStats = {
          newRelationships: typeof stats.newRelationships === 'number' ? stats.newRelationships : 0,
          strengthenedRelationships:
            typeof stats.strengthenedRelationships === 'number'
              ? stats.strengthenedRelationships
              : 0,
          weakenedRelationships:
            typeof stats.weakenedRelationships === 'number' ? stats.weakenedRelationships : 0,
          averageRelationshipStrength:
            typeof stats.averageRelationshipStrength === 'number'
              ? stats.averageRelationshipStrength
              : 0,
        };
      }

      // Parse last mapped relationships if available
      if (Array.isArray(rawData.lastMappedRelationships)) {
        cartographerState.lastMappedRelationships = rawData.lastMappedRelationships.filter(
          (rel: any) =>
            rel &&
            typeof rel.from === 'string' &&
            typeof rel.to === 'string' &&
            typeof rel.type === 'string' &&
            typeof rel.strength === 'number',
        );
      }

      // Parse error information if available
      if (rawData.errors && typeof rawData.errors === 'object') {
        const errors = rawData.errors;
        cartographerState.errors = {
          count: typeof errors.count === 'number' ? errors.count : 0,
          lastError: typeof errors.lastError === 'string' ? errors.lastError : undefined,
          timestamp: typeof errors.timestamp === 'number' ? errors.timestamp : undefined,
        };
      }

      // Include any additional fields that might be worker-specific
      for (const [key, value] of Object.entries(rawData)) {
        if (!(key in cartographerState)) {
          (cartographerState as any)[key] = value;
        }
      }

      return cartographerState;
    } catch (error) {
      console.warn('Failed to read cartographer state file:', error);
      return null;
    }
  }

  async readVaultChangesSince(timestamp: number): Promise<SOMAVaultChange[]> {
    const changes: SOMAVaultChange[] = [];

    if (!fs.existsSync(this.config.vaultPath)) {
      return changes;
    }

    try {
      // Scan vault directory for recently modified entity files
      const entityTypes = ['agent', 'insight', 'decision', 'constraint', 'archetype', 'synthesis'];

      for (const entityType of entityTypes) {
        const entityDir = path.join(this.config.vaultPath, entityType);
        if (!fs.existsSync(entityDir)) continue;

        const files = await fs.promises.readdir(entityDir);

        for (const file of files) {
          if (!file.endsWith('.md')) continue;

          const filePath = path.join(entityDir, file);
          const stats = await fs.promises.stat(filePath);

          if (stats.mtime.getTime() > timestamp) {
            const entityId = path.basename(file, '.md');
            changes.push({
              entityId,
              entityType,
              changeType: stats.birthtime.getTime() > timestamp ? 'created' : 'updated',
              timestamp: stats.mtime.getTime(),
              filePath,
            });
          }
        }
      }

      // Sort by timestamp (most recent first)
      changes.sort((a, b) => b.timestamp - a.timestamp);
    } catch (error) {
      console.warn('Failed to scan vault for changes:', error);
    }

    return changes;
  }

  async readVaultChangesDetailed(
    timestamp: number,
    options: { includeDeletions?: boolean; includeHashes?: boolean } = {},
  ): Promise<SOMAVaultChange[]> {
    const changes: SOMAVaultChange[] = [];
    const { includeDeletions = false, includeHashes = false } = options;

    if (!fs.existsSync(this.config.vaultPath)) {
      return changes;
    }

    try {
      const entityTypes = ['agent', 'insight', 'decision', 'constraint', 'archetype', 'synthesis'];
      const currentFiles = new Set<string>();

      // Scan for existing files and modifications
      for (const entityType of entityTypes) {
        const entityDir = path.join(this.config.vaultPath, entityType);
        if (!fs.existsSync(entityDir)) continue;

        try {
          const files = await fs.promises.readdir(entityDir);

          for (const file of files) {
            if (!file.endsWith('.md')) continue;

            const filePath = path.join(entityDir, file);
            const entityId = path.basename(file, '.md');
            const fullEntityPath = `${entityType}/${entityId}`;
            currentFiles.add(fullEntityPath);

            try {
              const stats = await fs.promises.stat(filePath);

              if (stats.mtime.getTime() > timestamp) {
                const change: SOMAVaultChange = {
                  entityId,
                  entityType,
                  changeType: stats.birthtime.getTime() > timestamp ? 'created' : 'updated',
                  timestamp: stats.mtime.getTime(),
                  filePath,
                  fileSize: stats.size,
                };

                // Add content hash if requested
                if (includeHashes) {
                  try {
                    const content = await fs.promises.readFile(filePath, 'utf-8');
                    const crypto = await import('node:crypto');
                    change.contentHash = crypto.createHash('sha256').update(content).digest('hex');
                  } catch (hashError) {
                    console.warn(`Failed to compute hash for ${filePath}:`, hashError);
                  }
                }

                changes.push(change);
              }
            } catch (statError) {
              console.warn(`Failed to stat file ${filePath}:`, statError);
            }
          }
        } catch (readdirError) {
          console.warn(`Failed to read directory ${entityDir}:`, readdirError);
        }
      }

      // Check for deletions if requested
      if (includeDeletions) {
        try {
          // This would typically require a previous snapshot of files
          // For now, we'll implement a basic approach using a state file
          const stateFile = path.join(this.config.statePath, 'vault-snapshot.json');
          let previousFiles: Set<string> = new Set();

          if (fs.existsSync(stateFile)) {
            try {
              const stateContent = await fs.promises.readFile(stateFile, 'utf-8');
              const stateData = JSON.parse(stateContent);
              if (stateData.files && Array.isArray(stateData.files)) {
                previousFiles = new Set(stateData.files);
              }
            } catch (stateError) {
              console.warn('Failed to read vault snapshot:', stateError);
            }
          }

          // Find deleted files
          for (const previousFile of previousFiles) {
            if (!currentFiles.has(previousFile)) {
              const [entityType, entityId] = previousFile.split('/');
              if (entityType && entityId) {
                changes.push({
                  entityId,
                  entityType,
                  changeType: 'deleted',
                  timestamp: Date.now(), // Best approximation
                });
              }
            }
          }

          // Update snapshot for next time
          try {
            await fs.promises.writeFile(
              stateFile,
              JSON.stringify(
                {
                  files: Array.from(currentFiles),
                  timestamp: Date.now(),
                },
                null,
                2,
              ),
            );
          } catch (writeError) {
            console.warn('Failed to update vault snapshot:', writeError);
          }
        } catch (deletionError) {
          console.warn('Failed to detect deletions:', deletionError);
        }
      }

      // Sort by timestamp (most recent first)
      changes.sort((a, b) => b.timestamp - a.timestamp);
    } catch (error) {
      console.warn('Failed to scan vault for detailed changes:', error);
    }

    return changes;
  }

  isSOMADataAvailable(): boolean {
    // Check if either state directory or vault directory exists
    return fs.existsSync(this.config.statePath) || fs.existsSync(this.config.vaultPath);
  }

  getRecentErrors(limit: number = 10): SOMADataReaderError[] {
    return this.errors.slice(-limit).reverse(); // Most recent first
  }

  private logError(error: Omit<SOMADataReaderError, 'timestamp'>): void {
    const errorRecord: SOMADataReaderError = {
      ...error,
      timestamp: Date.now(),
    };

    this.errors.push(errorRecord);

    // Keep only the last 100 errors to prevent memory growth
    if (this.errors.length > 100) {
      this.errors = this.errors.slice(-100);
    }

    if (this.config.enableErrorLogging) {
      const errorMsg = `SOMA Data Reader Error: ${error.type} - ${error.message}`;
      if (error.filePath) {
        console.warn(`${errorMsg} (File: ${error.filePath})`);
      } else {
        console.warn(errorMsg);
      }
    }
  }

  private classifyError(error: Error, filePath?: string): SOMADataReaderError['type'] {
    if (error.message.includes('ENOENT') || error.message.includes('no such file')) {
      return 'file_not_found';
    }
    if (error.message.includes('EACCES') || error.message.includes('permission denied')) {
      return 'permission_error';
    }
    if (error.message.includes('Unexpected token') || error.message.includes('JSON')) {
      return 'parse_error';
    }
    if (error.message.includes('timeout') || error.message.includes('TIMEOUT')) {
      return 'timeout_error';
    }
    if ((filePath && error.message.includes('invalid')) || error.message.includes('corrupt')) {
      return 'corruption_error';
    }
    return 'unknown_error';
  }

  async validateStateFile(
    workerType: string,
  ): Promise<{ isValid: boolean; errors: SOMADataReaderError[] }> {
    const stateFile = path.join(this.config.statePath, `${workerType}-state.json`);
    const validationErrors: SOMADataReaderError[] = [];

    try {
      if (!fs.existsSync(stateFile)) {
        validationErrors.push({
          type: 'file_not_found',
          message: `State file not found for ${workerType}`,
          filePath: stateFile,
          workerType,
          timestamp: Date.now(),
        });
        return { isValid: false, errors: validationErrors };
      }

      const stats = await fs.promises.stat(stateFile);

      // Check if file is too old
      if (Date.now() - stats.mtime.getTime() > this.config.maxStateAge) {
        validationErrors.push({
          type: 'corruption_error',
          message: `State file is too old (${Math.round((Date.now() - stats.mtime.getTime()) / 1000 / 60)} minutes)`,
          filePath: stateFile,
          workerType,
          timestamp: Date.now(),
        });
      }

      // Check if file is readable
      const content = await fs.promises.readFile(stateFile, 'utf-8');

      // Validate JSON structure
      const data = JSON.parse(content);

      // Basic structure validation
      if (typeof data !== 'object' || data === null) {
        validationErrors.push({
          type: 'corruption_error',
          message: 'State file does not contain a valid object',
          filePath: stateFile,
          workerType,
          timestamp: Date.now(),
        });
      }

      return { isValid: validationErrors.length === 0, errors: validationErrors };
    } catch (error) {
      const errorType = this.classifyError(error as Error, stateFile);
      validationErrors.push({
        type: errorType,
        message: `Validation failed: ${(error as Error).message}`,
        filePath: stateFile,
        workerType,
        originalError: error as Error,
        timestamp: Date.now(),
      });
      return { isValid: false, errors: validationErrors };
    }
  }

  async repairStateFile(workerType: string): Promise<boolean> {
    const stateFile = path.join(this.config.statePath, `${workerType}-state.json`);

    try {
      // Create backup of corrupted file
      const backupFile = `${stateFile}.backup.${Date.now()}`;
      if (fs.existsSync(stateFile)) {
        await fs.promises.copyFile(stateFile, backupFile);
      }

      // Create minimal valid state file
      const minimalState = {
        type: workerType,
        lastRun: Date.now(),
        entityCount: 0,
        processedEventIds: [],
        errors: {
          count: 1,
          lastError: 'State file was repaired due to corruption',
          timestamp: Date.now(),
        },
      };

      await fs.promises.writeFile(stateFile, JSON.stringify(minimalState, null, 2));

      this.logError({
        type: 'corruption_error',
        message: `Repaired corrupted state file for ${workerType}`,
        filePath: stateFile,
        workerType,
      });

      return true;
    } catch (error) {
      this.logError({
        type: this.classifyError(error as Error, stateFile),
        message: `Failed to repair state file for ${workerType}: ${(error as Error).message}`,
        filePath: stateFile,
        workerType,
        originalError: error as Error,
      });
      return false;
    }
  }

  /**
   * Get configuration for debugging
   */
  getConfig(): Required<SOMADataReaderConfig> {
    return { ...this.config };
  }
}

/**
 * Create a SOMA data reader with configuration
 */
export function createSOMADataReader(config?: SOMADataReaderConfig): SOMADataReader {
  return new DefaultSOMADataReader(config);
}
