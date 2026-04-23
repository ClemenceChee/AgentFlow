/**
 * Universal trace adapter types.
 *
 * Every adapter translates an external format into NormalizedTrace objects
 * that the dashboard can display uniformly.
 *
 * @module
 */

import type {
  OperatorContext,
  PolicyStatus,
  SessionCorrelation,
  SessionHookData,
} from '../client/types/organizational.js';

/** A single node within an execution trace. */
export interface NormalizedNode {
  id: string;
  type: string;
  name: string;
  status: 'completed' | 'failed' | 'running' | 'pending' | 'unknown' | string;
  startTime: number;
  endTime: number | null;
  parentId: string | null;
  children: string[];
  metadata: Record<string, unknown>;
}

/** A normalized execution trace — the universal shape all adapters produce. */
export interface NormalizedTrace {
  /** Unique trace ID (filename, spanId, sessionId, etc.) */
  id: string;
  /** Agent or service that produced this trace */
  agentId: string;
  /** Human-readable trace name */
  name: string;
  /** Execution status */
  status: 'completed' | 'failed' | 'running' | 'unknown';
  /** Epoch ms */
  startTime: number;
  /** Epoch ms */
  endTime: number;
  /** What triggered this execution */
  trigger: string;
  /** Adapter that produced this trace */
  source: string;
  /** Execution nodes keyed by node ID */
  nodes: Record<string, NormalizedNode>;
  /** Arbitrary metadata (model, tokens, cost, etc.) */
  metadata: Record<string, unknown>;
  /** Optional session events (chat messages, tool calls) */
  sessionEvents?: unknown[];
  /** Original file path (for file-based adapters) */
  filePath?: string;

  // Organizational context extensions
  /** Operator context for organizational tracking */
  operatorContext?: OperatorContext;
  /** Session correlation data */
  sessionCorrelation?: SessionCorrelation;
  /** Policy compliance status */
  policyStatus?: PolicyStatus;
  /** Session hook execution data */
  sessionHooks?: SessionHookData;
}

/**
 * A pluggable trace adapter that translates an external format into
 * NormalizedTrace objects.
 *
 * Adapters are registered in priority order — more specific adapters
 * (OpenClaw, OTel) are checked before the fallback AgentFlow adapter.
 */
export interface TraceAdapter {
  /** Unique adapter name (e.g. "agentflow", "openclaw", "otel") */
  readonly name: string;

  /**
   * Can this adapter handle traces from the given directory?
   * Called during directory scanning to determine which adapters apply.
   */
  detect(dirPath: string): boolean;

  /**
   * Can this adapter handle a specific file?
   * Called when a new/changed file is discovered.
   */
  canHandle(filePath: string): boolean;

  /**
   * Parse a file into normalized traces.
   * Returns an empty array if the file can't be parsed.
   */
  parse(filePath: string): NormalizedTrace[];

  /**
   * Extract agent decisions from a normalized trace.
   * Optional — not all formats capture decision-level data.
   * Returns tool calls, reasoning, and outcomes as NormalizedDecision[].
   */
  extractDecisions?(trace: NormalizedTrace): NormalizedDecision[];
}

/** A single decision made by an agent during execution — agent-agnostic. */
export interface NormalizedDecision {
  action: string;
  reasoning?: string;
  tool?: string;
  args?: Record<string, unknown>;
  outcome: 'ok' | 'failed' | 'timeout' | 'skipped';
  output?: string;
  error?: string;
  durationMs?: number;
  index: number;
}
