/**
 * Trace Enhancement Service
 *
 * Enhances basic SOMA traces with detailed execution steps by reading
 * operational data from state files and vault changes.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { TraceGraph } from './trace-graph.js';
import { createSOMADataReader, type SOMADataReader, type SOMAOperationalData } from './soma-data-reader.js';

export interface TraceEnhancementOptions {
  /** Include detailed step breakdown */
  includeDetailedSteps?: boolean;
  /** Include operational metrics */
  includeMetrics?: boolean;
  /** Maximum age of operational data to use (in ms) */
  maxDataAge?: number;
  /** Enable caching of enhanced results */
  enableCaching?: boolean;
}

export interface EnhancedTraceNode {
  id: string;
  type: 'agent' | 'step' | 'operation';
  name: string;
  startTime: number;
  endTime: number;
  status: 'success' | 'error' | 'running' | 'pending';
  parentId: string | null;
  children: string[];
  metadata: Record<string, unknown>;
  state: Record<string, unknown>;
  /** Enhanced operational details */
  operationalData?: {
    workerType?: string;
    filesProcessed?: number;
    entitiesProcessed?: number;
    duration?: number;
    errors?: Array<{ message: string; timestamp: number }>;
  };
}

export interface EnhancedTraceGraph extends Omit<TraceGraph, 'nodes'> {
  nodes: Record<string, EnhancedTraceNode>;
  /** Enhancement metadata */
  enhancementInfo: {
    enhancedAt: number;
    dataSourcesUsed: string[];
    enhancementLevel: 'basic' | 'detailed' | 'full';
    operationalDataAge?: number;
  };
}

export interface TraceEnhancementResult {
  enhanced: boolean;
  trace: EnhancedTraceGraph | TraceGraph;
  errors: string[];
  cacheHit: boolean;
}

export class TraceEnhancementService {
  private somaDataReader: SOMADataReader;
  private cache = new Map<string, { result: EnhancedTraceGraph; timestamp: number; dataHash: string }>();
  private cacheTimeout: number;
  private lastDataSnapshot?: SOMAOperationalData;

  constructor(options: {
    somaDataReader?: SOMADataReader;
    cacheTimeoutMs?: number;
  } = {}) {
    this.somaDataReader = options.somaDataReader ?? createSOMADataReader();
    this.cacheTimeout = options.cacheTimeoutMs ?? 5 * 60 * 1000; // 5 minutes default
  }

  /**
   * Enhance a trace with operational data
   */
  async enhanceTrace(
    trace: TraceGraph,
    options: TraceEnhancementOptions = {}
  ): Promise<TraceEnhancementResult> {
    const {
      includeDetailedSteps = true,
      includeMetrics = true,
      maxDataAge = 24 * 60 * 60 * 1000, // 24 hours
      enableCaching = true,
    } = options;

    const cacheKey = this.generateCacheKey(trace, options);

    // Check cache first
    if (enableCaching) {
      const cached = this.getCachedResult(cacheKey);
      if (cached) {
        return {
          enhanced: true,
          trace: cached,
          errors: [],
          cacheHit: true,
        };
      }
    }

    const errors: string[] = [];

    try {
      // Check if this is a SOMA trace
      if (!this.isSOMATrace(trace)) {
        return {
          enhanced: false,
          trace,
          errors: ['Not a SOMA trace - no enhancement available'],
          cacheHit: false,
        };
      }

      // Read operational data with fallback
      let operationalData: SOMAOperationalData;
      try {
        operationalData = await this.somaDataReader.readOperationalData();
      } catch (dataError) {
        errors.push(`Failed to read operational data: ${(dataError as Error).message}`);
        return this.createFallbackTrace(trace, errors, 'operational_data_unavailable');
      }

      // Check operational data quality
      if (operationalData.successRate < 0.5) {
        errors.push(`Operational data quality low (${Math.round(operationalData.successRate * 100)}% success rate)`);

        if (!includeMetrics && !includeDetailedSteps) {
          // If enhancement requirements are minimal, proceed with partial data
          // Otherwise fall back to basic trace
          return this.createFallbackTrace(trace, errors, 'low_data_quality');
        }
      }

      // Check if operational data is too old
      if (Date.now() - operationalData.collectedAt > maxDataAge) {
        const ageMinutes = Math.round((Date.now() - operationalData.collectedAt) / 1000 / 60);
        errors.push(`Operational data is ${ageMinutes} minutes old`);

        if (ageMinutes > (maxDataAge / 1000 / 60) * 2) {
          // Data is very stale, fall back to basic trace
          return this.createFallbackTrace(trace, errors, 'stale_operational_data');
        }
      }

      // Attempt enhancement with error handling
      let enhancedTrace: EnhancedTraceGraph;
      try {
        enhancedTrace = await this.performEnhancement(
          trace,
          operationalData,
          { includeDetailedSteps, includeMetrics }
        );
      } catch (enhancementError) {
        errors.push(`Enhancement processing failed: ${(enhancementError as Error).message}`);

        // Try with simplified options as fallback
        if (includeDetailedSteps || includeMetrics) {
          try {
            errors.push('Retrying with basic enhancement...');
            enhancedTrace = await this.performEnhancement(
              trace,
              operationalData,
              { includeDetailedSteps: false, includeMetrics: false }
            );
          } catch (basicEnhancementError) {
            errors.push(`Basic enhancement also failed: ${(basicEnhancementError as Error).message}`);
            return this.createFallbackTrace(trace, errors, 'enhancement_processing_failed');
          }
        } else {
          return this.createFallbackTrace(trace, errors, 'enhancement_processing_failed');
        }
      }

      // Validate enhanced trace
      if (!this.isValidEnhancedTrace(enhancedTrace)) {
        errors.push('Enhanced trace validation failed - structure is invalid');
        return this.createFallbackTrace(trace, errors, 'invalid_enhanced_result');
      }

      // Cache the result with operational data hash
      if (enableCaching) {
        try {
          const dataHash = await this.computeOperationalDataHash(operationalData);
          this.setCachedResult(cacheKey, enhancedTrace, dataHash);
        } catch (cacheError) {
          errors.push(`Caching failed: ${(cacheError as Error).message}`);
          // Continue without caching - not a critical failure
        }
      }

      return {
        enhanced: true,
        trace: enhancedTrace,
        errors,
        cacheHit: false,
      };
    } catch (error) {
      errors.push(`Critical enhancement error: ${(error as Error).message}`);
      return this.createFallbackTrace(trace, errors, 'critical_error');
    }
  }

  /**
   * Check if operational data has changed to invalidate cache
   */
  async invalidateCacheIfStale(): Promise<{ invalidatedEntries: number; reason: string }> {
    if (!this.somaDataReader.isSOMADataAvailable()) {
      return { invalidatedEntries: 0, reason: 'SOMA data not available' };
    }

    try {
      const operationalData = await this.somaDataReader.readOperationalData();
      const currentTime = Date.now();
      let invalidatedEntries = 0;

      // Clear cache entries older than cache timeout
      for (const [key, cached] of this.cache.entries()) {
        if (currentTime - cached.timestamp > this.cacheTimeout) {
          this.cache.delete(key);
          invalidatedEntries++;
        }
      }

      // Check if operational data has changed significantly
      const currentDataHash = await this.computeOperationalDataHash(operationalData);
      const hasSignificantChanges = await this.hasSignificantDataChanges(operationalData);

      if (hasSignificantChanges) {
        // Selective cache invalidation based on affected workers
        const affectedWorkers = this.getAffectedWorkers(operationalData);
        const entriesToInvalidate = [];

        for (const [key, cached] of this.cache.entries()) {
          // Check if cached result's data hash is different
          if (cached.dataHash !== currentDataHash) {
            entriesToInvalidate.push(key);
          }
        }

        // Remove invalidated entries
        for (const key of entriesToInvalidate) {
          this.cache.delete(key);
          invalidatedEntries++;
        }

        this.lastDataSnapshot = operationalData;

        return {
          invalidatedEntries,
          reason: `Operational data changes detected for workers: ${affectedWorkers.join(', ')}`
        };
      }

      // Check for recent vault changes that might affect traces
      const recentChanges = operationalData.vaultChanges.filter(
        change => currentTime - change.timestamp < this.cacheTimeout
      );

      if (recentChanges.length > 0) {
        // Selective invalidation based on entity types that changed
        const changedEntityTypes = new Set(recentChanges.map(c => c.entityType));
        let selectiveInvalidations = 0;

        for (const [key, cached] of this.cache.entries()) {
          // If trace might be affected by these entity changes, invalidate it
          if (this.traceAffectedByEntityChanges(key, changedEntityTypes)) {
            this.cache.delete(key);
            selectiveInvalidations++;
          }
        }

        invalidatedEntries += selectiveInvalidations;

        return {
          invalidatedEntries,
          reason: `Recent vault changes in entity types: ${Array.from(changedEntityTypes).join(', ')}`
        };
      }

      this.lastDataSnapshot = operationalData;

      return { invalidatedEntries, reason: invalidatedEntries > 0 ? 'Timeout-based cleanup' : 'No invalidation needed' };
    } catch (error) {
      // If we can't check for changes, clear the cache to be safe
      const cacheSize = this.cache.size;
      this.cache.clear();
      return { invalidatedEntries: cacheSize, reason: `Error checking data changes: ${(error as Error).message}` };
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; hitRate: number; oldestEntry: number } {
    const now = Date.now();
    let oldestEntry = now;

    for (const cached of this.cache.values()) {
      if (cached.timestamp < oldestEntry) {
        oldestEntry = cached.timestamp;
      }
    }

    return {
      size: this.cache.size,
      hitRate: 0, // Would need to track hits/misses to implement this
      oldestEntry: now - oldestEntry,
    };
  }

  /**
   * Clear the enhancement cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  private isSOMATrace(trace: TraceGraph): boolean {
    // Check if this trace is from SOMA by looking at agent ID or metadata
    const rootNode = trace.nodes[trace.rootNodeId];
    if (!rootNode) return false;

    const agentId = trace.agentId || rootNode.name;
    return agentId.includes('soma-') || agentId.includes('harvester') ||
           agentId.includes('synthesizer') || agentId.includes('reconciler') ||
           agentId.includes('cartographer');
  }

  private async performEnhancement(
    trace: TraceGraph,
    operationalData: SOMAOperationalData,
    options: { includeDetailedSteps: boolean; includeMetrics: boolean }
  ): Promise<EnhancedTraceGraph> {
    const enhanced: EnhancedTraceGraph = {
      ...trace,
      nodes: {},
      enhancementInfo: {
        enhancedAt: Date.now(),
        dataSourcesUsed: Object.keys(operationalData.workerStates),
        enhancementLevel: options.includeDetailedSteps ? 'detailed' : 'basic',
        operationalDataAge: Date.now() - operationalData.collectedAt,
      },
    };

    // Convert and enhance nodes
    for (const [nodeId, node] of Object.entries(trace.nodes)) {
      const enhancedNode: EnhancedTraceNode = {
        ...node,
        operationalData: undefined,
      };

      // Add operational data if available
      const workerType = this.detectWorkerType(node.name);
      if (workerType && operationalData.workerStates[workerType]) {
        const workerState = operationalData.workerStates[workerType];

        enhancedNode.operationalData = {
          workerType,
          entitiesProcessed: workerState.entityCount,
          duration: workerState.processingDuration,
        };

        if (workerState.errors) {
          enhancedNode.operationalData.errors = [{
            message: workerState.errors.lastError || 'Unknown error',
            timestamp: workerState.errors.timestamp || Date.now(),
          }];
        }
      }

      enhanced.nodes[nodeId] = enhancedNode;
    }

    // Add worker-specific detailed steps if requested
    if (options.includeDetailedSteps) {
      for (const [nodeId, node] of Object.entries(enhanced.nodes)) {
        const workerType = this.detectWorkerType(node.name);
        if (workerType && operationalData.workerStates[workerType]) {
          const detailedSteps = await this.createDetailedSteps(
            nodeId,
            workerType,
            operationalData.workerStates[workerType],
            operationalData.vaultChanges
          );

          // Add detailed steps as child nodes
          for (const step of detailedSteps) {
            enhanced.nodes[step.id] = step;
            enhanced.nodes[nodeId].children.push(step.id);
          }
        }
      }
    }

    return enhanced;
  }

  /**
   * Create detailed execution steps for a worker based on operational data
   */
  private async createDetailedSteps(
    parentNodeId: string,
    workerType: string,
    workerState: any,
    vaultChanges: any[]
  ): Promise<EnhancedTraceNode[]> {
    const steps: EnhancedTraceNode[] = [];

    switch (workerType) {
      case 'harvester':
        return this.createHarvesterSteps(parentNodeId, workerState, vaultChanges);
      case 'synthesizer':
        return this.createSynthesizerSteps(parentNodeId, workerState, vaultChanges);
      case 'reconciler':
        return this.createReconcilerSteps(parentNodeId, workerState, vaultChanges);
      case 'cartographer':
        return this.createCartographerSteps(parentNodeId, workerState, vaultChanges);
      default:
        return steps;
    }
  }

  /**
   * Create detailed steps for harvester traces
   */
  private createHarvesterSteps(
    parentNodeId: string,
    harvesterState: any,
    vaultChanges: any[]
  ): EnhancedTraceNode[] {
    const steps: EnhancedTraceNode[] = [];
    const baseTime = harvesterState.lastRun || Date.now();

    // Step 1: Inbox Scanning
    steps.push({
      id: `${parentNodeId}_inbox_scan`,
      type: 'step',
      name: 'Inbox Scanning',
      startTime: baseTime,
      endTime: baseTime + (harvesterState.processingDuration ? harvesterState.processingDuration * 0.1 : 1000),
      status: harvesterState.inboxStats?.errorFiles > 0 ? 'error' : 'success',
      parentId: parentNodeId,
      children: [],
      metadata: {
        description: 'Scanning inbox directory for new files to process',
        totalFiles: harvesterState.inboxStats?.totalFiles || 0,
        processedFiles: harvesterState.inboxStats?.processedFiles || 0,
        skippedFiles: harvesterState.inboxStats?.skippedFiles || 0,
        errorFiles: harvesterState.inboxStats?.errorFiles || 0,
      },
      state: {
        phase: 'scanning',
        directory: 'inbox',
        filters: ['*.txt', '*.md', '*.json'],
      },
      operationalData: {
        workerType: 'harvester',
        filesProcessed: harvesterState.inboxStats?.totalFiles || 0,
        duration: harvesterState.processingDuration ? harvesterState.processingDuration * 0.1 : 1000,
      },
    });

    // Step 2: File Parsing
    if (harvesterState.filesProcessed > 0) {
      steps.push({
        id: `${parentNodeId}_file_parsing`,
        type: 'step',
        name: 'File Parsing',
        startTime: baseTime + (harvesterState.processingDuration ? harvesterState.processingDuration * 0.1 : 1000),
        endTime: baseTime + (harvesterState.processingDuration ? harvesterState.processingDuration * 0.6 : 6000),
        status: harvesterState.errors?.count > 0 ? 'error' : 'success',
        parentId: parentNodeId,
        children: [],
        metadata: {
          description: 'Parsing file contents and extracting structured data',
          filesProcessed: harvesterState.filesProcessed,
          lastProcessedFiles: harvesterState.lastProcessedFiles || [],
          parsingFormats: ['text', 'markdown', 'json'],
        },
        state: {
          phase: 'parsing',
          currentFile: harvesterState.lastProcessedFiles?.[0] || 'unknown',
          extractedEvents: harvesterState.eventsIngested || 0,
        },
        operationalData: {
          workerType: 'harvester',
          filesProcessed: harvesterState.filesProcessed,
          duration: harvesterState.processingDuration ? harvesterState.processingDuration * 0.5 : 5000,
          errors: harvesterState.errors?.count > 0 ? [
            { message: harvesterState.errors.lastError || 'Parsing error', timestamp: harvesterState.errors.timestamp || Date.now() }
          ] : undefined,
        },
      });
    }

    // Step 3: Event Ingestion
    if (harvesterState.eventsIngested > 0) {
      steps.push({
        id: `${parentNodeId}_event_ingestion`,
        type: 'step',
        name: 'Event Ingestion',
        startTime: baseTime + (harvesterState.processingDuration ? harvesterState.processingDuration * 0.6 : 6000),
        endTime: baseTime + (harvesterState.processingDuration ? harvesterState.processingDuration * 0.9 : 9000),
        status: 'success',
        parentId: parentNodeId,
        children: [],
        metadata: {
          description: 'Converting parsed data into structured events and storing them',
          eventsIngested: harvesterState.eventsIngested,
          processedEventIds: harvesterState.processedEventIds || [],
          eventTypes: ['document_creation', 'content_update', 'metadata_extraction'],
        },
        state: {
          phase: 'ingestion',
          queueSize: harvesterState.eventsIngested,
          batchSize: 10,
        },
        operationalData: {
          workerType: 'harvester',
          entitiesProcessed: harvesterState.eventsIngested,
          duration: harvesterState.processingDuration ? harvesterState.processingDuration * 0.3 : 3000,
        },
      });
    }

    // Step 4: Entity Updates
    const relevantVaultChanges = vaultChanges.filter(change =>
      change.timestamp >= (baseTime - 60000) && // Within 1 minute of harvester run
      change.timestamp <= (baseTime + (harvesterState.processingDuration || 10000))
    );

    if (relevantVaultChanges.length > 0 || harvesterState.entityCount > 0) {
      steps.push({
        id: `${parentNodeId}_entity_updates`,
        type: 'step',
        name: 'Entity Updates',
        startTime: baseTime + (harvesterState.processingDuration ? harvesterState.processingDuration * 0.9 : 9000),
        endTime: baseTime + (harvesterState.processingDuration || 10000),
        status: 'success',
        parentId: parentNodeId,
        children: [],
        metadata: {
          description: 'Updating entity vault with new and modified entities',
          entitiesCreated: relevantVaultChanges.filter(c => c.changeType === 'created').length,
          entitiesUpdated: relevantVaultChanges.filter(c => c.changeType === 'updated').length,
          totalEntityCount: harvesterState.entityCount || 0,
          vaultChanges: relevantVaultChanges.map(c => ({
            entityId: c.entityId,
            entityType: c.entityType,
            changeType: c.changeType,
          })),
        },
        state: {
          phase: 'persistence',
          vaultPath: 'vault',
          writeOperations: relevantVaultChanges.length,
        },
        operationalData: {
          workerType: 'harvester',
          entitiesProcessed: relevantVaultChanges.length || harvesterState.entityCount || 0,
          duration: harvesterState.processingDuration ? harvesterState.processingDuration * 0.1 : 1000,
        },
      });
    }

    return steps;
  }

  /**
   * Create detailed steps for synthesizer traces
   */
  private createSynthesizerSteps(
    parentNodeId: string,
    synthesizerState: any,
    vaultChanges: any[]
  ): EnhancedTraceNode[] {
    const steps: EnhancedTraceNode[] = [];
    const baseTime = synthesizerState.lastRun || Date.now();

    // Step 1: Candidate Scoring
    if (synthesizerState.candidatesAnalyzed > 0) {
      steps.push({
        id: `${parentNodeId}_candidate_scoring`,
        type: 'step',
        name: 'Candidate Scoring',
        startTime: baseTime,
        endTime: baseTime + (synthesizerState.processingDuration ? synthesizerState.processingDuration * 0.2 : 2000),
        status: synthesizerState.scoringStats?.averageScore > 0 ? 'success' : 'error',
        parentId: parentNodeId,
        children: [],
        metadata: {
          description: 'Analyzing and scoring insight candidates for synthesis potential',
          candidatesAnalyzed: synthesizerState.candidatesAnalyzed,
          averageScore: synthesizerState.scoringStats?.averageScore || 0,
          highScoreCount: synthesizerState.scoringStats?.highScoreCount || 0,
          lowScoreCount: synthesizerState.scoringStats?.lowScoreCount || 0,
          scoringThreshold: synthesizerState.scoringStats?.scoringThreshold || 0.7,
        },
        state: {
          phase: 'scoring',
          algorithm: 'relevance_weighted',
          currentCandidate: 0,
          totalCandidates: synthesizerState.candidatesAnalyzed,
        },
        operationalData: {
          workerType: 'synthesizer',
          entitiesProcessed: synthesizerState.candidatesAnalyzed,
          duration: synthesizerState.processingDuration ? synthesizerState.processingDuration * 0.2 : 2000,
        },
      });
    }

    // Step 2: LLM Analysis
    if (synthesizerState.llmStats?.totalCalls > 0) {
      steps.push({
        id: `${parentNodeId}_llm_analysis`,
        type: 'step',
        name: 'LLM Analysis',
        startTime: baseTime + (synthesizerState.processingDuration ? synthesizerState.processingDuration * 0.2 : 2000),
        endTime: baseTime + (synthesizerState.processingDuration ? synthesizerState.processingDuration * 0.7 : 7000),
        status: synthesizerState.llmStats.failedCalls > 0 ? 'error' : 'success',
        parentId: parentNodeId,
        children: [],
        metadata: {
          description: 'Using LLM to analyze candidates and generate synthesis insights',
          totalCalls: synthesizerState.llmStats.totalCalls,
          successfulCalls: synthesizerState.llmStats.successfulCalls,
          failedCalls: synthesizerState.llmStats.failedCalls,
          averageLatency: synthesizerState.llmStats.averageLatency,
          successRate: synthesizerState.llmStats.totalCalls > 0
            ? (synthesizerState.llmStats.successfulCalls / synthesizerState.llmStats.totalCalls) * 100
            : 0,
        },
        state: {
          phase: 'llm_processing',
          model: 'gpt-4',
          temperature: 0.7,
          maxTokens: 2000,
          currentCall: synthesizerState.llmStats.successfulCalls,
        },
        operationalData: {
          workerType: 'synthesizer',
          entitiesProcessed: synthesizerState.llmStats.successfulCalls,
          duration: synthesizerState.processingDuration ? synthesizerState.processingDuration * 0.5 : 5000,
          errors: synthesizerState.llmStats.failedCalls > 0 ? [
            { message: `${synthesizerState.llmStats.failedCalls} LLM calls failed`, timestamp: Date.now() }
          ] : undefined,
        },
      });
    }

    // Step 3: Deduplication
    if (synthesizerState.deduplicationStats && synthesizerState.deduplicationStats.duplicatesFound > 0) {
      steps.push({
        id: `${parentNodeId}_deduplication`,
        type: 'step',
        name: 'Deduplication',
        startTime: baseTime + (synthesizerState.processingDuration ? synthesizerState.processingDuration * 0.7 : 7000),
        endTime: baseTime + (synthesizerState.processingDuration ? synthesizerState.processingDuration * 0.85 : 8500),
        status: synthesizerState.deduplicationStats.duplicatesRemoved > 0 ? 'success' : 'error',
        parentId: parentNodeId,
        children: [],
        metadata: {
          description: 'Identifying and removing duplicate insights to ensure uniqueness',
          duplicatesFound: synthesizerState.deduplicationStats.duplicatesFound,
          duplicatesRemoved: synthesizerState.deduplicationStats.duplicatesRemoved,
          uniqueInsights: synthesizerState.deduplicationStats.uniqueInsights,
          deduplicationRate: synthesizerState.deduplicationStats.duplicatesFound > 0
            ? (synthesizerState.deduplicationStats.duplicatesRemoved / synthesizerState.deduplicationStats.duplicatesFound) * 100
            : 0,
        },
        state: {
          phase: 'deduplication',
          algorithm: 'semantic_similarity',
          similarityThreshold: 0.85,
          vectorComparison: true,
        },
        operationalData: {
          workerType: 'synthesizer',
          entitiesProcessed: synthesizerState.deduplicationStats.duplicatesFound,
          duration: synthesizerState.processingDuration ? synthesizerState.processingDuration * 0.15 : 1500,
        },
      });
    }

    // Step 4: Insight Creation
    const relevantVaultChanges = vaultChanges.filter(change =>
      change.entityType === 'insight' &&
      change.changeType === 'created' &&
      change.timestamp >= (baseTime - 60000) &&
      change.timestamp <= (baseTime + (synthesizerState.processingDuration || 10000))
    );

    if (synthesizerState.insightsCreated > 0 || relevantVaultChanges.length > 0) {
      steps.push({
        id: `${parentNodeId}_insight_creation`,
        type: 'step',
        name: 'Insight Creation',
        startTime: baseTime + (synthesizerState.processingDuration ? synthesizerState.processingDuration * 0.85 : 8500),
        endTime: baseTime + (synthesizerState.processingDuration || 10000),
        status: synthesizerState.insightsCreated > 0 ? 'success' : 'error',
        parentId: parentNodeId,
        children: [],
        metadata: {
          description: 'Creating and persisting new insights from synthesized analysis',
          insightsCreated: synthesizerState.insightsCreated || relevantVaultChanges.length,
          lastCreatedInsights: synthesizerState.lastCreatedInsights || relevantVaultChanges.map(c => c.entityId),
          vaultChanges: relevantVaultChanges.map(c => ({
            entityId: c.entityId,
            changeType: c.changeType,
            timestamp: c.timestamp,
          })),
          qualityScore: synthesizerState.scoringStats?.averageScore || 0,
        },
        state: {
          phase: 'persistence',
          vaultPath: 'vault/insight',
          writeOperations: synthesizerState.insightsCreated || relevantVaultChanges.length,
          indexUpdate: true,
        },
        operationalData: {
          workerType: 'synthesizer',
          entitiesProcessed: synthesizerState.insightsCreated || relevantVaultChanges.length,
          duration: synthesizerState.processingDuration ? synthesizerState.processingDuration * 0.15 : 1500,
          errors: synthesizerState.errors?.count > 0 ? [
            { message: synthesizerState.errors.lastError || 'Insight creation error', timestamp: synthesizerState.errors.timestamp || Date.now() }
          ] : undefined,
        },
      });
    }

    return steps;
  }

  /**
   * Create detailed steps for reconciler traces
   */
  private createReconcilerSteps(
    parentNodeId: string,
    reconcilerState: any,
    vaultChanges: any[]
  ): EnhancedTraceNode[] {
    const steps: EnhancedTraceNode[] = [];
    const baseTime = reconcilerState.lastRun || Date.now();

    // Step 1: Issue Detection
    if (reconcilerState.issuesDetected > 0 || reconcilerState.consistencyChecks) {
      steps.push({
        id: `${parentNodeId}_issue_detection`,
        type: 'step',
        name: 'Issue Detection',
        startTime: baseTime,
        endTime: baseTime + (reconcilerState.processingDuration ? reconcilerState.processingDuration * 0.3 : 3000),
        status: reconcilerState.consistencyChecks?.failedChecks > 0 ? 'error' : 'success',
        parentId: parentNodeId,
        children: [],
        metadata: {
          description: 'Scanning vault for data inconsistencies and integrity issues',
          issuesDetected: reconcilerState.issuesDetected || 0,
          totalChecks: reconcilerState.consistencyChecks?.totalChecks || 0,
          passedChecks: reconcilerState.consistencyChecks?.passedChecks || 0,
          failedChecks: reconcilerState.consistencyChecks?.failedChecks || 0,
          checksPerformed: reconcilerState.consistencyChecks?.checksPerformed || [],
          checkTypes: [
            'entity_references',
            'schema_validation',
            'duplicate_detection',
            'orphaned_relationships'
          ],
        },
        state: {
          phase: 'detection',
          scanProgress: 100,
          currentCheck: 'integrity_validation',
          entitiesScanned: reconcilerState.entityCount || 0,
        },
        operationalData: {
          workerType: 'reconciler',
          entitiesProcessed: reconcilerState.entityCount || 0,
          duration: reconcilerState.processingDuration ? reconcilerState.processingDuration * 0.3 : 3000,
          errors: reconcilerState.consistencyChecks?.failedChecks > 0 ? [
            { message: `${reconcilerState.consistencyChecks.failedChecks} consistency checks failed`, timestamp: Date.now() }
          ] : undefined,
        },
      });
    }

    // Step 2: Entity Merging
    if (reconcilerState.mergeStats && reconcilerState.mergeStats.duplicatesFound > 0) {
      steps.push({
        id: `${parentNodeId}_entity_merging`,
        type: 'step',
        name: 'Entity Merging',
        startTime: baseTime + (reconcilerState.processingDuration ? reconcilerState.processingDuration * 0.3 : 3000),
        endTime: baseTime + (reconcilerState.processingDuration ? reconcilerState.processingDuration * 0.7 : 7000),
        status: reconcilerState.mergeStats.mergeConflicts > 0 ? 'error' : 'success',
        parentId: parentNodeId,
        children: [],
        metadata: {
          description: 'Merging duplicate entities and resolving conflicts',
          duplicatesFound: reconcilerState.mergeStats.duplicatesFound,
          successfulMerges: reconcilerState.mergeStats.successfulMerges,
          failedMerges: reconcilerState.mergeStats.failedMerges,
          mergeConflicts: reconcilerState.mergeStats.mergeConflicts,
          mergeSuccessRate: reconcilerState.mergeStats.duplicatesFound > 0
            ? (reconcilerState.mergeStats.successfulMerges / reconcilerState.mergeStats.duplicatesFound) * 100
            : 0,
          lastMergedEntities: reconcilerState.lastMergedEntities || [],
        },
        state: {
          phase: 'merging',
          conflictResolution: 'automatic',
          currentMerge: {
            original: reconcilerState.lastMergedEntities?.[0]?.original || '',
            target: reconcilerState.lastMergedEntities?.[0]?.target || '',
          },
          mergeStrategy: 'preserve_newest',
        },
        operationalData: {
          workerType: 'reconciler',
          entitiesProcessed: reconcilerState.mergeStats.duplicatesFound,
          duration: reconcilerState.processingDuration ? reconcilerState.processingDuration * 0.4 : 4000,
          errors: reconcilerState.mergeStats.mergeConflicts > 0 ? [
            { message: `${reconcilerState.mergeStats.mergeConflicts} merge conflicts encountered`, timestamp: Date.now() }
          ] : undefined,
        },
      });
    }

    // Step 3: Data Consistency Fixes
    if (reconcilerState.resolutionStats) {
      steps.push({
        id: `${parentNodeId}_consistency_fixes`,
        type: 'step',
        name: 'Data Consistency Fixes',
        startTime: baseTime + (reconcilerState.processingDuration ? reconcilerState.processingDuration * 0.7 : 7000),
        endTime: baseTime + (reconcilerState.processingDuration || 10000),
        status: reconcilerState.resolutionStats.criticalIssues > 0 ? 'error' : 'success',
        parentId: parentNodeId,
        children: [],
        metadata: {
          description: 'Applying fixes for detected inconsistencies and integrity issues',
          issuesResolved: reconcilerState.resolutionStats.issuesResolved || 0,
          issuesPending: reconcilerState.resolutionStats.issuesPending || 0,
          criticalIssues: reconcilerState.resolutionStats.criticalIssues || 0,
          warningIssues: reconcilerState.resolutionStats.warningIssues || 0,
          resolutionRate: (reconcilerState.resolutionStats.issuesResolved + reconcilerState.resolutionStats.issuesPending) > 0
            ? (reconcilerState.resolutionStats.issuesResolved / (reconcilerState.resolutionStats.issuesResolved + reconcilerState.resolutionStats.issuesPending)) * 100
            : 0,
          fixTypes: [
            'reference_repair',
            'schema_normalization',
            'orphan_cleanup',
            'duplicate_removal'
          ],
        },
        state: {
          phase: 'resolution',
          autoFixEnabled: true,
          manualReviewRequired: reconcilerState.resolutionStats.criticalIssues > 0,
          backupCreated: true,
        },
        operationalData: {
          workerType: 'reconciler',
          entitiesProcessed: reconcilerState.resolutionStats.issuesResolved || 0,
          duration: reconcilerState.processingDuration ? reconcilerState.processingDuration * 0.3 : 3000,
          errors: reconcilerState.errors?.count > 0 ? [
            { message: reconcilerState.errors.lastError || 'Consistency fix error', timestamp: reconcilerState.errors.timestamp || Date.now() }
          ] : undefined,
        },
      });
    }

    // Step 4: Vault Update
    const relevantVaultChanges = vaultChanges.filter(change =>
      (change.changeType === 'updated' || change.changeType === 'deleted') &&
      change.timestamp >= (baseTime - 60000) &&
      change.timestamp <= (baseTime + (reconcilerState.processingDuration || 10000))
    );

    if (relevantVaultChanges.length > 0 || reconcilerState.entitiesMerged > 0) {
      steps.push({
        id: `${parentNodeId}_vault_update`,
        type: 'step',
        name: 'Vault Update',
        startTime: baseTime + (reconcilerState.processingDuration ? reconcilerState.processingDuration * 0.9 : 9000),
        endTime: baseTime + (reconcilerState.processingDuration || 10000),
        status: 'success',
        parentId: parentNodeId,
        children: [],
        metadata: {
          description: 'Persisting reconciliation changes to the vault',
          entitiesMerged: reconcilerState.entitiesMerged || 0,
          vaultChanges: relevantVaultChanges.map(c => ({
            entityId: c.entityId,
            entityType: c.entityType,
            changeType: c.changeType,
            timestamp: c.timestamp,
          })),
          totalUpdates: relevantVaultChanges.filter(c => c.changeType === 'updated').length,
          totalDeletions: relevantVaultChanges.filter(c => c.changeType === 'deleted').length,
          indexRebuild: relevantVaultChanges.length > 10,
        },
        state: {
          phase: 'persistence',
          vaultPath: 'vault',
          writeOperations: relevantVaultChanges.length,
          transactionMode: true,
        },
        operationalData: {
          workerType: 'reconciler',
          entitiesProcessed: relevantVaultChanges.length || reconcilerState.entitiesMerged || 0,
          duration: reconcilerState.processingDuration ? reconcilerState.processingDuration * 0.1 : 1000,
        },
      });
    }

    return steps;
  }

  /**
   * Create detailed steps for cartographer traces
   */
  private createCartographerSteps(
    parentNodeId: string,
    cartographerState: any,
    vaultChanges: any[]
  ): EnhancedTraceNode[] {
    const steps: EnhancedTraceNode[] = [];
    const baseTime = cartographerState.lastRun || Date.now();

    // Step 1: Entity Embedding
    if (cartographerState.entitiesEmbedded > 0 || cartographerState.embeddingStats) {
      steps.push({
        id: `${parentNodeId}_entity_embedding`,
        type: 'step',
        name: 'Entity Embedding',
        startTime: baseTime,
        endTime: baseTime + (cartographerState.processingDuration ? cartographerState.processingDuration * 0.4 : 4000),
        status: cartographerState.embeddingStats?.vectorsGenerated > 0 ? 'success' : 'error',
        parentId: parentNodeId,
        children: [],
        metadata: {
          description: 'Generating vector embeddings for entities to enable semantic analysis',
          entitiesEmbedded: cartographerState.entitiesEmbedded || 0,
          vectorsGenerated: cartographerState.embeddingStats?.vectorsGenerated || 0,
          embeddingDimensions: cartographerState.embeddingStats?.embeddingDimensions || 1536,
          averageSimilarity: cartographerState.embeddingStats?.averageSimilarity || 0,
          totalClusters: cartographerState.embeddingStats?.totalClusters || 0,
          embeddingModel: 'text-embedding-3-large',
        },
        state: {
          phase: 'embedding',
          currentEntity: cartographerState.entitiesEmbedded || 0,
          batchSize: 100,
          vectorDatabase: 'in_memory',
          normalizeVectors: true,
        },
        operationalData: {
          workerType: 'cartographer',
          entitiesProcessed: cartographerState.entitiesEmbedded || 0,
          duration: cartographerState.processingDuration ? cartographerState.processingDuration * 0.4 : 4000,
        },
      });
    }

    // Step 2: Archetype Discovery
    if (cartographerState.archetypesDiscovered > 0 || cartographerState.archetypeStats) {
      steps.push({
        id: `${parentNodeId}_archetype_discovery`,
        type: 'step',
        name: 'Archetype Discovery',
        startTime: baseTime + (cartographerState.processingDuration ? cartographerState.processingDuration * 0.4 : 4000),
        endTime: baseTime + (cartographerState.processingDuration ? cartographerState.processingDuration * 0.7 : 7000),
        status: cartographerState.archetypesDiscovered > 0 ? 'success' : 'error',
        parentId: parentNodeId,
        children: [],
        metadata: {
          description: 'Discovering entity archetypes through clustering and pattern analysis',
          archetypesDiscovered: cartographerState.archetypesDiscovered || 0,
          newArchetypes: cartographerState.archetypeStats?.newArchetypes || 0,
          updatedArchetypes: cartographerState.archetypeStats?.updatedArchetypes || 0,
          archetypeConfidence: cartographerState.archetypeStats?.archetypeConfidence || 0,
          patternStrength: cartographerState.archetypeStats?.patternStrength || 0,
          lastDiscoveredArchetypes: cartographerState.lastDiscoveredArchetypes || [],
          clusteringMethod: 'hierarchical',
        },
        state: {
          phase: 'discovery',
          clusteringAlgorithm: 'agglomerative',
          minClusterSize: 3,
          similarityThreshold: 0.75,
          currentArchetype: cartographerState.archetypesDiscovered || 0,
        },
        operationalData: {
          workerType: 'cartographer',
          entitiesProcessed: cartographerState.archetypesDiscovered || 0,
          duration: cartographerState.processingDuration ? cartographerState.processingDuration * 0.3 : 3000,
        },
      });
    }

    // Step 3: Relationship Mapping
    if (cartographerState.relationshipsMapped > 0 || cartographerState.relationshipStats) {
      steps.push({
        id: `${parentNodeId}_relationship_mapping`,
        type: 'step',
        name: 'Relationship Mapping',
        startTime: baseTime + (cartographerState.processingDuration ? cartographerState.processingDuration * 0.7 : 7000),
        endTime: baseTime + (cartographerState.processingDuration ? cartographerState.processingDuration * 0.9 : 9000),
        status: cartographerState.relationshipsMapped > 0 ? 'success' : 'error',
        parentId: parentNodeId,
        children: [],
        metadata: {
          description: 'Mapping relationships between entities based on semantic similarity and references',
          relationshipsMapped: cartographerState.relationshipsMapped || 0,
          newRelationships: cartographerState.relationshipStats?.newRelationships || 0,
          strengthenedRelationships: cartographerState.relationshipStats?.strengthenedRelationships || 0,
          weakenedRelationships: cartographerState.relationshipStats?.weakenedRelationships || 0,
          averageRelationshipStrength: cartographerState.relationshipStats?.averageRelationshipStrength || 0,
          lastMappedRelationships: cartographerState.lastMappedRelationships || [],
          relationshipTypes: ['semantic', 'reference', 'temporal', 'causal'],
        },
        state: {
          phase: 'mapping',
          mappingStrategy: 'semantic_similarity',
          strengthThreshold: 0.6,
          maxRelationshipsPerEntity: 10,
          graphUpdate: true,
        },
        operationalData: {
          workerType: 'cartographer',
          entitiesProcessed: cartographerState.relationshipsMapped || 0,
          duration: cartographerState.processingDuration ? cartographerState.processingDuration * 0.2 : 2000,
        },
      });
    }

    // Step 4: Knowledge Graph Update
    const relevantVaultChanges = vaultChanges.filter(change =>
      (change.entityType === 'archetype' || change.changeType === 'updated') &&
      change.timestamp >= (baseTime - 60000) &&
      change.timestamp <= (baseTime + (cartographerState.processingDuration || 10000))
    );

    if (relevantVaultChanges.length > 0 || cartographerState.archetypesDiscovered > 0) {
      steps.push({
        id: `${parentNodeId}_knowledge_graph_update`,
        type: 'step',
        name: 'Knowledge Graph Update',
        startTime: baseTime + (cartographerState.processingDuration ? cartographerState.processingDuration * 0.9 : 9000),
        endTime: baseTime + (cartographerState.processingDuration || 10000),
        status: 'success',
        parentId: parentNodeId,
        children: [],
        metadata: {
          description: 'Updating the knowledge graph with new archetypes and relationships',
          archetypesCreated: relevantVaultChanges.filter(c => c.entityType === 'archetype' && c.changeType === 'created').length,
          archetypesUpdated: relevantVaultChanges.filter(c => c.entityType === 'archetype' && c.changeType === 'updated').length,
          vaultChanges: relevantVaultChanges.map(c => ({
            entityId: c.entityId,
            entityType: c.entityType,
            changeType: c.changeType,
            timestamp: c.timestamp,
          })),
          graphMetrics: {
            totalNodes: cartographerState.entityCount || 0,
            totalEdges: cartographerState.relationshipsMapped || 0,
            archetypeCount: cartographerState.archetypesDiscovered || 0,
          },
          indexRebuild: true,
        },
        state: {
          phase: 'persistence',
          vaultPath: 'vault/archetype',
          graphDatabase: 'neo4j',
          writeOperations: relevantVaultChanges.length + (cartographerState.relationshipsMapped || 0),
          transactionMode: true,
        },
        operationalData: {
          workerType: 'cartographer',
          entitiesProcessed: relevantVaultChanges.length || cartographerState.archetypesDiscovered || 0,
          duration: cartographerState.processingDuration ? cartographerState.processingDuration * 0.1 : 1000,
          errors: cartographerState.errors?.count > 0 ? [
            { message: cartographerState.errors.lastError || 'Graph update error', timestamp: cartographerState.errors.timestamp || Date.now() }
          ] : undefined,
        },
      });
    }

    return steps;
  }

  private detectWorkerType(nodeName: string): string | null {
    const name = nodeName.toLowerCase();
    if (name.includes('harvester')) return 'harvester';
    if (name.includes('synthesizer')) return 'synthesizer';
    if (name.includes('reconciler')) return 'reconciler';
    if (name.includes('cartographer')) return 'cartographer';
    return null;
  }

  private generateCacheKey(trace: TraceGraph, options: TraceEnhancementOptions): string {
    const optionsKey = JSON.stringify(options);
    return `${trace.id}_${trace.startTime}_${optionsKey}`;
  }

  private getCachedResult(key: string): EnhancedTraceGraph | null {
    const cached = this.cache.get(key);
    if (!cached) return null;

    // Check if cache entry is still valid
    if (Date.now() - cached.timestamp > this.cacheTimeout) {
      this.cache.delete(key);
      return null;
    }

    return cached.result;
  }

  private setCachedResult(key: string, result: EnhancedTraceGraph, dataHash?: string): void {
    this.cache.set(key, {
      result,
      timestamp: Date.now(),
      dataHash: dataHash || '',
    });
  }

  /**
   * Compute a hash of operational data to detect changes
   */
  private async computeOperationalDataHash(operationalData: SOMAOperationalData): Promise<string> {
    try {
      const crypto = await import('node:crypto');

      // Create a simplified representation for hashing
      const dataForHashing = {
        workerStates: Object.entries(operationalData.workerStates).map(([type, state]) => ({
          type,
          lastRun: state.lastRun,
          entityCount: state.entityCount,
          processingDuration: (state as any).processingDuration,
          errors: (state as any).errors?.count || 0,
        })),
        vaultChangesCount: operationalData.vaultChanges.length,
        recentVaultChanges: operationalData.vaultChanges.slice(0, 10).map(change => ({
          entityType: change.entityType,
          changeType: change.changeType,
          timestamp: Math.floor(change.timestamp / 1000), // Round to seconds
        })),
      };

      return crypto.createHash('sha256').update(JSON.stringify(dataForHashing)).digest('hex');
    } catch (error) {
      // Fallback to timestamp-based hash if crypto fails
      return `timestamp_${operationalData.collectedAt}`;
    }
  }

  /**
   * Check if there are significant changes in operational data
   */
  private async hasSignificantDataChanges(operationalData: SOMAOperationalData): Promise<boolean> {
    if (!this.lastDataSnapshot) {
      return true; // First run, consider it significant
    }

    // Check if any worker has significantly different state
    for (const [workerType, currentState] of Object.entries(operationalData.workerStates)) {
      const previousState = this.lastDataSnapshot.workerStates[workerType];

      if (!previousState) {
        return true; // New worker appeared
      }

      // Check for significant changes in key metrics
      const currentDuration = (currentState as any).processingDuration || 0;
      const previousDuration = (previousState as any).processingDuration || 0;
      const durationChange = Math.abs(currentDuration - previousDuration);

      const currentErrors = (currentState as any).errors?.count || 0;
      const previousErrors = (previousState as any).errors?.count || 0;

      if (
        Math.abs((currentState.lastRun || 0) - (previousState.lastRun || 0)) > 60000 || // 1 minute
        Math.abs((currentState.entityCount || 0) - (previousState.entityCount || 0)) > 0 ||
        durationChange > 5000 || // 5 second change in processing time
        currentErrors !== previousErrors
      ) {
        return true;
      }
    }

    // Check for new vault changes
    const newChanges = operationalData.vaultChanges.filter(
      change => !this.lastDataSnapshot!.vaultChanges.some(
        prevChange => prevChange.entityId === change.entityId &&
                      prevChange.timestamp === change.timestamp
      )
    );

    return newChanges.length > 0;
  }

  /**
   * Get list of workers that have been affected by data changes
   */
  private getAffectedWorkers(operationalData: SOMAOperationalData): string[] {
    if (!this.lastDataSnapshot) {
      return Object.keys(operationalData.workerStates);
    }

    const affectedWorkers: string[] = [];

    for (const [workerType, currentState] of Object.entries(operationalData.workerStates)) {
      const previousState = this.lastDataSnapshot.workerStates[workerType];

      if (!previousState ||
          (currentState.lastRun || 0) !== (previousState.lastRun || 0) ||
          (currentState.entityCount || 0) !== (previousState.entityCount || 0)) {
        affectedWorkers.push(workerType);
      }
    }

    return affectedWorkers;
  }

  /**
   * Check if a cached trace might be affected by entity changes
   */
  private traceAffectedByEntityChanges(cacheKey: string, changedEntityTypes: Set<string>): boolean {
    // Extract worker type from cache key if possible
    const workerTypes = ['harvester', 'synthesizer', 'reconciler', 'cartographer'];
    const traceWorkerType = workerTypes.find(type => cacheKey.includes(type));

    if (!traceWorkerType) {
      // If we can't determine the worker type, assume it might be affected
      return true;
    }

    // Define which entity types affect which workers
    const workerEntityDependencies: Record<string, string[]> = {
      harvester: ['agent', 'insight', 'decision'],
      synthesizer: ['insight', 'constraint'],
      reconciler: ['*'], // Reconciler can be affected by changes to any entity type
      cartographer: ['archetype', 'agent', 'insight', 'decision'],
    };

    const dependencies = workerEntityDependencies[traceWorkerType] || [];

    // Check if any changed entity type affects this worker
    return dependencies.includes('*') ||
           dependencies.some(dep => changedEntityTypes.has(dep));
  }

  /**
   * Create a fallback trace when enhancement fails
   */
  private createFallbackTrace(
    originalTrace: TraceGraph,
    errors: string[],
    fallbackReason: string
  ): TraceEnhancementResult {
    // Create a minimally enhanced trace that maintains the original structure
    // but adds some metadata about why enhancement failed
    const fallbackTrace: EnhancedTraceGraph = {
      ...originalTrace,
      nodes: {},
      enhancementInfo: {
        enhancedAt: Date.now(),
        dataSourcesUsed: [],
        enhancementLevel: 'basic',
        operationalDataAge: undefined,
      },
    };

    // Convert original nodes to enhanced nodes with minimal enhancement
    for (const [nodeId, node] of Object.entries(originalTrace.nodes)) {
      const enhancedNode: EnhancedTraceNode = {
        ...node,
        operationalData: {
          workerType: this.detectWorkerType(node.name) || undefined,
          // Add fallback reason in metadata
          errors: [{ message: `Enhancement fallback: ${fallbackReason}`, timestamp: Date.now() }],
        },
      };

      // Add fallback indicator to metadata
      enhancedNode.metadata = {
        ...enhancedNode.metadata,
        enhancementFallback: true,
        fallbackReason,
        enhancementAttempted: true,
      };

      fallbackTrace.nodes[nodeId] = enhancedNode;
    }

    return {
      enhanced: false,
      trace: fallbackTrace,
      errors,
      cacheHit: false,
    };
  }

  /**
   * Validate that an enhanced trace has the expected structure
   */
  private isValidEnhancedTrace(trace: EnhancedTraceGraph): boolean {
    try {
      // Basic structure validation
      if (!trace || typeof trace !== 'object') return false;
      if (!trace.id || !trace.rootNodeId) return false;
      if (!trace.nodes || typeof trace.nodes !== 'object') return false;
      if (!trace.enhancementInfo) return false;

      // Check if root node exists
      if (!trace.nodes[trace.rootNodeId]) return false;

      // Validate all nodes have required enhanced fields
      for (const [nodeId, node] of Object.entries(trace.nodes)) {
        if (!node.id || node.id !== nodeId) return false;
        if (!node.type || !node.name) return false;
        if (typeof node.startTime !== 'number') return false;
        if (typeof node.endTime !== 'number') return false;
        if (!node.status) return false;
        if (!Array.isArray(node.children)) return false;
        if (!node.metadata || typeof node.metadata !== 'object') return false;
        if (!node.state || typeof node.state !== 'object') return false;

        // operationalData is optional but if present should be valid
        if (node.operationalData !== undefined && typeof node.operationalData !== 'object') {
          return false;
        }
      }

      // Validate enhancement info
      const info = trace.enhancementInfo;
      if (typeof info.enhancedAt !== 'number') return false;
      if (!Array.isArray(info.dataSourcesUsed)) return false;
      if (!['basic', 'detailed', 'full'].includes(info.enhancementLevel)) return false;

      return true;
    } catch (error) {
      return false;
    }
  }
}

/**
 * Create a trace enhancement service
 */
export function createTraceEnhancer(options?: {
  somaDataReader?: SOMADataReader;
  cacheTimeoutMs?: number;
}): TraceEnhancementService {
  return new TraceEnhancementService(options);
}