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

export type { LangChainRun } from './adapters/langchain.js';
// Adapters
export { isLangChainRun, langchainAdapter, langchainRunToGraphLike } from './adapters/langchain.js';
export type { TraceAdapter } from './adapters/types.js';
// AICP (AI Control Plane)
export { evaluatePreflight } from './aicp.js';
export { createCartographer } from './cartographer.js';
export type { DecayResult } from './decay.js';
export { checkDanglingReferences, createDecayProcessor } from './decay.js';
export type { ExtractedDecision, GraphLike } from './decision-extractor.js';
// Decision extraction
export {
  decisionsToEntities,
  extractDecisionsFromGraph,
  isExecutionGraph,
} from './decision-extractor.js';
// Entity utilities
export { extractWikilinks, parseEntity, serializeEntity } from './entity.js';
export type {
  AutoPromoteResult,
  GovernanceAPI,
  TeamGovernanceConfig,
  TeamValidationWorkflow,
  OrganizationGovernancePolicies,
  ValidationRequest,
  ValidationResponse,
} from './governance.js';
export { createGovernanceAPI, GovernanceError } from './governance.js';
export type { InboxParseResult, InboxParser } from './harvester.js';
export { createHarvester } from './harvester.js';
export type { LayerValidationError } from './layers.js';
// Four-layer architecture
export {
  canWrite,
  enforceWritePermission,
  isLayerEnabled,
  LayerPermissionError,
  queryByLayer,
  setLayersConfig,
  validateLayerFields,
  writeToLayer,
} from './layers.js';
export type { MigrationResult } from './migration.js';
// Migration
export { migrateToLayers } from './migration.js';
export type { SomaGuardedBuilder } from './ops-intel/assertions.js';
export { createGuardedBuilder, evaluateAssertions } from './ops-intel/assertions.js';
export { getAgentBriefingData, getDecisionReplayData } from './ops-intel/dashboard-api.js';
export {
  computePatternSignature,
  computeToolPatternSignature,
  extractDecisionsFromLangChain,
  extractDecisionsFromNodes,
  extractDecisionsFromSession,
} from './ops-intel/decision-extraction.js';
export { detectDrift, trackConformanceTrend } from './ops-intel/drift.js';
// Operational Intelligence (premium)
export { getEfficiency } from './ops-intel/efficiency.js';
export type {
  AgentBriefingData,
  AgentBriefingResult,
  ConformanceHistory,
  ConformanceHistoryEntry,
  DecisionReplayData,
  DecisionReplayResult,
  DriftOptions,
  DriftReport,
  EfficiencyFlag,
  EfficiencyReport,
  GuardExplanation,
  GuardViolation,
  NodeCost,
  NormalizedDecision,
  OutcomeAssertion,
  RunEfficiency,
  VariantOptions,
} from './ops-intel/types.js';
export { findVariantsWithModel } from './ops-intel/variants.js';
export type {
  LayerPolicyBridge,
  PolicyBridgeIntent,
  PolicyBridgeResult,
  StratifiedResults,
  OrganizationalContext,
  OrganizationalPolicyResult,
} from './policy-bridge.js';
export { createPolicyBridge, createSomaPolicySource } from './policy-bridge.js';
export type {
  SecurityAuditEvent,
  SecurityEventType,
  SecurityEventSeverity,
  SecurityAuditConfig,
  SecurityAlert,
} from './security-audit-logger.js';
export {
  SecurityAuditLogger,
  createSecurityAuditLogger,
  getGlobalAuditLogger,
  initializeGlobalAuditLogger
} from './security-audit-logger.js';
export type { ProviderConfig, ProviderResult } from './providers.js';
// LLM providers
export { createProvider } from './providers.js';
export { createReconciler } from './reconciler.js';
export { createSoma } from './soma.js';
export { createSynthesizer } from './synthesizer.js';
export type { ScanResult } from './trace-scanner.js';
// Trace scanner
export { scanTraces } from './trace-scanner.js';
// Types
export type {
  AgentEntity,
  ArchetypeEntity,
  AssumptionEntity,
  CartographerConfig,
  ConstraintEntity,
  ContradictionEntity,
  DecayConfig,
  DecisionEntity,
  EmbedFn,
  Entity,
  EntityType,
  ExecutionEntity,
  HarvesterConfig,
  InsightEntity,
  KnowledgeLayer,
  PolicyEntity,
  PreflightRecommendation,
  PreflightResponse,
  PreflightWarning,
  QueryFilter,
  ReconcilerConfig,
  ScanIssue,
  SomaConfig,
  SomaWorker,
  SynthesisEntity,
  SynthesizerConfig,
  Vault,
  VaultConfig,
  VectorSearchResult,
  VectorStore,
} from './types.js';
export {
  KNOWLEDGE_LAYERS,
  LAYER_REQUIRED_FIELDS,
  LAYER_SEMANTIC_WEIGHTS,
  WORKER_WRITE_PERMISSIONS,
} from './types.js';
// Factories
export { createVault, vaultEntityCount, vaultFingerprint } from './vault.js';
export {
  cosineSimilarity,
  createJsonVectorStore,
  createLanceVectorStore,
  createMilvusVectorStore,
} from './vector-store.js';
