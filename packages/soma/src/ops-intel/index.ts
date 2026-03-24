/**
 * SOMA Operational Intelligence — premium features.
 *
 * Efficiency scoring, drift detection, outcome assertions, and model-aware variant analysis.
 * Types are imported from agentflow-core; implementations live here.
 *
 * @module
 */

export type { SomaGuardedBuilder } from './assertions.js';
export { createGuardedBuilder, evaluateAssertions } from './assertions.js';
export { getAgentBriefingData, getDecisionReplayData } from './dashboard-api.js';
export {
  computePatternSignature,
  computeToolPatternSignature,
  extractDecisionsFromLangChain,
  extractDecisionsFromNodes,
  extractDecisionsFromSession,
} from './decision-extraction.js';
export { detectDrift, trackConformanceTrend } from './drift.js';
export { getEfficiency } from './efficiency.js';
// Types — re-exported so consumers of soma/ops-intel get full type coverage
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
} from './types.js';
export { findVariantsWithModel } from './variants.js';
