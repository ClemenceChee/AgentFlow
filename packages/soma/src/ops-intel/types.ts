/**
 * Local type definitions for ops-intel features.
 *
 * These mirror the types defined in agentflow-core's types.ts.
 * Once agentflow-core is published with these types, this file
 * can be replaced with re-exports from agentflow-core.
 *
 * @module
 */

// Re-export what already exists in agentflow-core
export type {
  ExecutionGraph,
  ExecutionNode,
  GraphBuilder,
  GraphStatus,
  NodeStatus,
  NodeType,
  SemanticContext,
  Variant,
} from 'agentflow-core';

/**
 * Extended guard violation that includes outcome_mismatch (SOMA premium).
 * Once agentflow-core publishes the updated type, this can be replaced with a re-export.
 */
export interface GuardViolation {
  readonly type:
    | 'timeout'
    | 'reasoning-loop'
    | 'spawn-explosion'
    | 'high-failure-rate'
    | 'conformance-drift'
    | 'known-bottleneck'
    | 'outcome_mismatch';
  readonly nodeId: string;
  readonly message: string;
  readonly timestamp: number;
  readonly explanation?: GuardExplanation;
}

// Types that are new in agentflow-core but not yet published to npm:

export interface GuardExplanation {
  readonly rule: string;
  readonly threshold: number | string;
  readonly actual: number | string;
  readonly source: 'static' | 'soma-policy' | 'adaptive' | 'assertion';
  readonly evidence?: string;
}

export interface OutcomeAssertion {
  readonly name: string;
  readonly verify: () => Promise<boolean> | boolean;
  readonly timeout?: number;
}

export interface NodeCost {
  readonly nodeId: string;
  readonly name: string;
  readonly type: import('agentflow-core').NodeType;
  readonly tokenCost: number | null;
  readonly durationMs: number | null;
}

export interface EfficiencyFlag {
  readonly pattern: 'wasteful_retry' | 'context_bloat';
  readonly nodeName: string;
  readonly retryCount?: number;
  readonly tokenCost: number;
  readonly message: string;
}

export interface RunEfficiency {
  readonly graphId: string;
  readonly agentId: string;
  readonly totalTokenCost: number;
  readonly completedNodes: number;
  readonly costPerNode: number;
}

export interface EfficiencyReport {
  readonly runs: readonly RunEfficiency[];
  readonly aggregate: { mean: number; median: number; p95: number };
  readonly flags: readonly EfficiencyFlag[];
  readonly nodeCosts: readonly NodeCost[];
  readonly dataCoverage: number;
}

export interface ConformanceHistoryEntry {
  readonly agentId: string;
  readonly timestamp: number;
  readonly score: number;
  readonly runId: string;
}

export type ConformanceHistory = ConformanceHistoryEntry[];

export interface DriftOptions {
  readonly windowSize?: number;
}

export interface DriftReport {
  readonly status: 'stable' | 'degrading' | 'improving' | 'insufficient_data';
  readonly slope: number;
  readonly r2: number;
  readonly windowSize: number;
  readonly dataPoints: number;
  readonly alert?: {
    readonly type: 'conformance_trend_degradation';
    readonly agentId: string;
    readonly currentScore: number;
    readonly trendSlope: number;
    readonly windowSize: number;
    readonly message: string;
  };
}

/** A single decision made by an agent during execution — agent-agnostic. */
export interface NormalizedDecision {
  readonly action: string;
  readonly reasoning?: string;
  readonly tool?: string;
  readonly args?: Record<string, unknown>;
  readonly outcome: 'ok' | 'failed' | 'timeout' | 'skipped';
  readonly output?: string;
  readonly error?: string;
  readonly durationMs?: number;
  readonly index: number;
}

export interface VariantOptions {
  readonly dimensions?: readonly ('path' | 'modelId' | 'status')[];
}

// ---------------------------------------------------------------------------
// Dashboard API types
// ---------------------------------------------------------------------------

export interface DecisionReplayData {
  readonly decisions: NormalizedDecision[];
  readonly total: number;
  readonly pattern: string;
  readonly okCount: number;
  readonly failedCount: number;
  readonly skippedCount: number;
}

export interface AgentBriefingData {
  readonly agentId: string;
  readonly status: 'HEALTHY' | 'DEGRADED' | 'CRITICAL';
  readonly failureRate: number;
  readonly failureCount: number;
  readonly totalExecutions: number;
  readonly intelligence: { type: string; name: string; claim: string }[];
  readonly peers: { name: string; failureRate: number; totalExecutions: number }[];
}

export type DecisionReplayResult = DecisionReplayData | { error: string };
export type AgentBriefingResult = AgentBriefingData | { error: string; available?: string[] };
