/**
 * Soma — Organizational intelligence layer for AI agent systems.
 *
 * Ingests execution events from AgentFlow, external signals, and structured data.
 * Builds a knowledge vault with semantic search. Synthesizes patterns into insights
 * and policies. Feeds learned policies back to AgentFlow guards via PolicySource.
 *
 * Four workers: Harvester (ingest), Reconciler (maintain), Synthesizer (learn), Cartographer (map).
 *
 * @module
 */

// Types
export type {
  Entity,
  EntityType,
  KnowledgeLayer,
  SomaWorker,
  AgentEntity,
  ExecutionEntity,
  ArchetypeEntity,
  InsightEntity,
  PolicyEntity,
  DecisionEntity,
  AssumptionEntity,
  ConstraintEntity,
  ContradictionEntity,
  SynthesisEntity,
  VaultConfig,
  Vault,
  VectorStore,
  VectorSearchResult,
  HarvesterConfig,
  SynthesizerConfig,
  CartographerConfig,
  ReconcilerConfig,
  DecayConfig,
  SomaConfig,
  ScanIssue,
  EmbedFn,
  QueryFilter,
} from './types.js';
export { KNOWLEDGE_LAYERS, LAYER_SEMANTIC_WEIGHTS, WORKER_WRITE_PERMISSIONS, LAYER_REQUIRED_FIELDS } from './types.js';

// Factories
export { createVault, vaultFingerprint, vaultEntityCount } from './vault.js';
export { cosineSimilarity, createJsonVectorStore, createLanceVectorStore, createMilvusVectorStore } from './vector-store.js';
export { createHarvester } from './harvester.js';
export type { InboxParser, InboxParseResult } from './harvester.js';
export { createSynthesizer } from './synthesizer.js';
export { createCartographer } from './cartographer.js';
export { createReconciler } from './reconciler.js';
export { createSomaPolicySource, createPolicyBridge } from './policy-bridge.js';
export type { PolicyBridgeIntent, PolicyBridgeResult, StratifiedResults, LayerPolicyBridge } from './policy-bridge.js';
export { createSoma } from './soma.js';

// Four-layer architecture
export { validateLayerFields, enforceWritePermission, canWrite, queryByLayer, writeToLayer, LayerPermissionError, setLayersConfig, isLayerEnabled } from './layers.js';
export type { LayerValidationError } from './layers.js';
export { createDecayProcessor, checkDanglingReferences } from './decay.js';
export type { DecayResult } from './decay.js';
export { createGovernanceAPI, GovernanceError } from './governance.js';
export type { GovernanceAPI, AutoPromoteResult } from './governance.js';

// Migration
export { migrateToLayers } from './migration.js';
export type { MigrationResult } from './migration.js';

// Operational Intelligence (premium)
export { getEfficiency } from './ops-intel/efficiency.js';
export { detectDrift, trackConformanceTrend } from './ops-intel/drift.js';
export { evaluateAssertions, createGuardedBuilder } from './ops-intel/assertions.js';
export type { SomaGuardedBuilder } from './ops-intel/assertions.js';
export { findVariantsWithModel } from './ops-intel/variants.js';
export {
  extractDecisionsFromSession,
  extractDecisionsFromNodes,
  extractDecisionsFromLangChain,
  computePatternSignature,
  computeToolPatternSignature,
} from './ops-intel/decision-extraction.js';
export { getDecisionReplayData, getAgentBriefingData } from './ops-intel/dashboard-api.js';
export type {
  GuardViolation,
  GuardExplanation,
  OutcomeAssertion,
  NodeCost,
  EfficiencyFlag,
  RunEfficiency,
  EfficiencyReport,
  ConformanceHistoryEntry,
  ConformanceHistory,
  DriftOptions,
  DriftReport,
  NormalizedDecision,
  VariantOptions,
  DecisionReplayData,
  AgentBriefingData,
  DecisionReplayResult,
  AgentBriefingResult,
} from './ops-intel/types.js';

// Adapters
export { langchainRunToGraphLike, isLangChainRun, langchainAdapter } from './adapters/langchain.js';
export type { LangChainRun } from './adapters/langchain.js';
export type { TraceAdapter } from './adapters/types.js';

// AICP (AI Control Plane)
export { evaluatePreflight } from './aicp.js';
export type { PreflightWarning, PreflightRecommendation, PreflightResponse } from './types.js';

// Decision extraction
export { isExecutionGraph, extractDecisionsFromGraph, decisionsToEntities } from './decision-extractor.js';
export type { GraphLike, ExtractedDecision } from './decision-extractor.js';

// Entity utilities
export { parseEntity, serializeEntity, extractWikilinks } from './entity.js';

// Trace scanner
export { scanTraces } from './trace-scanner.js';
export type { ScanResult } from './trace-scanner.js';

// LLM providers
export { createProvider } from './providers.js';
export type { ProviderConfig, ProviderResult } from './providers.js';
