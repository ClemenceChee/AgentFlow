/** Dashboard state — two selections, everything else derived. */

import type { AgentStats } from './hooks/useAgents';
import type { TraceEntry } from './hooks/useTraces';

export interface DashboardState {
  selectedAgent: string | null;
  selectedExecution: string | null; // filename
}

export const INITIAL_STATE: DashboardState = {
  selectedAgent: null,
  selectedExecution: null,
};

/** Pick the best initial agent: first with failures, or first by exec count. */
export function pickInitialAgent(agents: AgentStats[]): string | null {
  if (agents.length === 0) return null;
  const withFails = agents.filter((a) => a.failedExecutions > 0);
  if (withFails.length > 0) return withFails.sort((a, b) => b.failedExecutions - a.failedExecutions)[0]!.agentId;
  return agents.sort((a, b) => b.totalExecutions - a.totalExecutions)[0]!.agentId;
}

/** Pick the best initial execution for an agent: first failed, or most recent. */
export function pickInitialExecution(traces: TraceEntry[], agentId: string): string | null {
  const agentTraces = traces.filter((t) => t.agentId === agentId);
  if (agentTraces.length === 0) return null;
  const failed = agentTraces.filter((t) => t.status === 'failed').sort((a, b) => b.timestamp - a.timestamp);
  if (failed.length > 0) return failed[0]!.filename;
  const recent = agentTraces.sort((a, b) => b.timestamp - a.timestamp);
  return recent[0]!.filename;
}
