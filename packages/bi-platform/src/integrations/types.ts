/**
 * Integration adapter types — shared interface for all source system connectors.
 */

export interface SystemHealth {
  system: string;
  status: 'healthy' | 'degraded' | 'failing' | 'unknown';
  lastSyncAt: string | null;
  recordCount: number;
  errorMessage?: string;
}

export interface AgentPerformance {
  agentId: string;
  agentName: string;
  status: 'healthy' | 'warning' | 'critical';
  totalExecutions: number;
  successCount: number;
  failureCount: number;
  failureRate: number;
  avgDurationMs?: number;
}

export interface KnowledgeInsight {
  type: string;
  title: string;
  claim: string;
  confidence: string;
  confidenceScore?: number;
  layer?: string;
  status?: string;
  businessImpact?: {
    severity: string;
    affectedAreas: string[];
    estimatedValue?: number;
  };
}

export interface PolicyInfo {
  name: string;
  enforcement: string;
  scope: string;
  conditions: string;
}

export interface DecisionInfo {
  id: string;
  type: string;
  outcome: string;
  tool?: string;
  reasoning?: string;
  timestamp?: number;
}

export interface EfficiencyMetrics {
  agentId: string;
  costPerExecution?: number;
  tokenUsage?: number;
  latencyMs?: number;
  throughput?: number;
}

/**
 * Read-only integration adapter interface.
 * All source system connectors implement this.
 */
export interface SourceAdapter {
  readonly name: string;
  health(): Promise<SystemHealth>;
}
