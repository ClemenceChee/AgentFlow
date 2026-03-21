import { useCallback, useEffect, useState } from 'react';

export interface AgentStats {
  agentId: string;
  displayName: string;
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  successRate: number;
  avgExecutionTime: number;
  lastExecution: number;
  triggers: Record<string, number>;
  recentActivity: {
    timestamp: number;
    success: boolean;
    executionTime: number;
    trigger: string;
  }[];
  sources?: string[];
  adapterSource?: string;
}

export interface AgentSubGroup {
  name: string;
  agentIds: string[];
}

export interface AgentGroup {
  name: string;
  displayName: string;
  totalExecutions: number;
  failedExecutions: number;
  agents: AgentStats[];
  subGroups: AgentSubGroup[];
}

export interface GroupedAgents {
  groups: AgentGroup[];
}

/** Flatten groups into a simple agent list (for backward compat) */
export function flattenGroups(data: GroupedAgents): AgentStats[] {
  return data.groups.flatMap((g) => g.agents);
}

export function useAgents(): { grouped: GroupedAgents | null; flat: AgentStats[] } {
  const [grouped, setGrouped] = useState<GroupedAgents | null>(null);

  const fetchAgents = useCallback(async () => {
    try {
      const res = await fetch('/api/agents');
      if (res.ok) {
        const json = await res.json();
        // Handle both grouped and flat responses
        if (json.groups) {
          setGrouped(json);
        } else if (Array.isArray(json)) {
          // Legacy flat response — wrap in single group
          setGrouped({
            groups: [
              {
                name: 'agents',
                displayName: 'Agents',
                totalExecutions: 0,
                failedExecutions: 0,
                agents: json,
                subGroups: [],
              },
            ],
          });
        }
      }
    } catch {
      /* retry */
    }
  }, []);

  useEffect(() => {
    fetchAgents();
    const id = setInterval(fetchAgents, 15_000);
    return () => clearInterval(id);
  }, [fetchAgents]);

  const flat = grouped ? flattenGroups(grouped) : [];

  return { grouped, flat };
}
