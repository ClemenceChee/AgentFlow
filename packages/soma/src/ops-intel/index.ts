/**
 * SOMA Operational Intelligence — premium features.
 *
 * Efficiency scoring, drift detection, outcome assertions, and model-aware variant analysis.
 * Types are imported from agentflow-core; implementations live here.
 *
 * @module
 */

export { getEfficiency } from './efficiency.js';
export { detectDrift, trackConformanceTrend } from './drift.js';
export { evaluateAssertions, createGuardedBuilder } from './assertions.js';
export type { SomaGuardedBuilder } from './assertions.js';
export { findVariantsWithModel } from './variants.js';
export {
  extractDecisionsFromSession,
  extractDecisionsFromNodes,
  extractDecisionsFromLangChain,
  computePatternSignature,
  computeToolPatternSignature,
} from './decision-extraction.js';

export { getDecisionReplayData, getAgentBriefingData } from './dashboard-api.js';

// Types — re-exported so consumers of soma/ops-intel get full type coverage
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
} from './types.js';
