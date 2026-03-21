/**
 * Agent clustering — deduplication and grouping.
 *
 * Framework-agnostic: no hardcoded agent names. All logic
 * derived from data patterns (prefixes, suffixes, keywords).
 *
 * @module
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
  recentActivity: { timestamp: number; success: boolean; executionTime: number; trigger: string }[];
  /** Original agentIds before dedup merge */
  sources?: string[];
  /** Adapter source (agentflow, openclaw, otel) */
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

export interface GroupedAgentsResponse {
  groups: AgentGroup[];
}

// ---------------------------------------------------------------------------
// Purpose keywords (configurable, not hardcoded to any framework)
// ---------------------------------------------------------------------------

const PURPOSE_KEYWORDS: { keywords: string[]; group: string }[] = [
  { keywords: ['email', 'mail', 'inbox', 'smtp'], group: 'Email Processors' },
  { keywords: ['monitor', 'watch', 'alert', 'surveillance'], group: 'Monitors' },
  { keywords: ['digest', 'newsletter', 'summary', 'report', 'briefing'], group: 'Digests & Reports' },
  { keywords: ['curator', 'janitor', 'distiller', 'surveyor', 'worker', 'indexer'], group: 'Workers' },
  { keywords: ['cron', 'schedule', 'timer', 'periodic'], group: 'Scheduled Jobs' },
  { keywords: ['search', 'scrape', 'crawl', 'fetch'], group: 'Data Collection' },
  { keywords: ['embed', 'vector', 'index'], group: 'Embeddings' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract adapter source from agentId prefix (prefix:localId → { source: prefix, localId }) */
function extractSource(agentId: string): { source: string; localId: string } {
  const colonIdx = agentId.indexOf(':');
  if (colonIdx > 0 && colonIdx < 20) {
    const prefix = agentId.slice(0, colonIdx);
    return { source: prefix, localId: agentId.slice(colonIdx + 1) };
  }
  return { source: 'agentflow', localId: agentId };
}

/** Extract the role suffix from an agentId (e.g., "myapp-worker" → "worker") */
function extractSuffix(localId: string): string | null {
  // Try dash-separated: "system-role" → "role"
  const dashIdx = localId.indexOf('-');
  if (dashIdx > 0 && dashIdx < localId.length - 1) {
    const suffix = localId.slice(dashIdx + 1);
    if (suffix.length >= 4) return suffix;
  }
  return null;
}

/** Find purpose sub-group for an agent name */
function findPurpose(name: string): string {
  const lower = name.toLowerCase();
  for (const { keywords, group } of PURPOSE_KEYWORDS) {
    if (keywords.some((kw) => lower.includes(kw))) return group;
  }
  return 'General';
}

/** Capitalize first letter */
function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
// Deduplication
// ---------------------------------------------------------------------------

/**
 * Find agents from different sources that represent the same worker
 * (share a common suffix after stripping prefix).
 */
export function deduplicateAgents(agents: AgentStats[]): AgentStats[] {
  // Tag each with source
  const tagged = agents.map((a) => ({
    ...a,
    ...extractSource(a.agentId),
  }));

  // Group by suffix across different sources
  const suffixGroups = new Map<string, typeof tagged>();
  for (const a of tagged) {
    const suffix = extractSuffix(a.localId);
    if (!suffix) continue;
    const group = suffixGroups.get(suffix) ?? [];
    group.push(a);
    suffixGroups.set(suffix, group);
  }

  // Merge groups that share the same role suffix within "agentflow" (e.g., "app-worker" + "worker")
  const mergedIds = new Set<string>();
  const mergedAgents: AgentStats[] = [];

  for (const [suffix, group] of suffixGroups) {
    // Only merge if there are 2+ agents AND they come from different prefixes
    if (group.length < 2) continue;
    const prefixes = new Set(group.map((a) => a.localId.split('-')[0]));
    if (prefixes.size < 2) continue;

    // Merge stats
    const merged: AgentStats = {
      agentId: group[0]!.source === 'agentflow' ? suffix : `${group[0]!.source}:${suffix}`,
      displayName: suffix,
      totalExecutions: group.reduce((s, a) => s + a.totalExecutions, 0),
      successfulExecutions: group.reduce((s, a) => s + a.successfulExecutions, 0),
      failedExecutions: group.reduce((s, a) => s + a.failedExecutions, 0),
      successRate: 0,
      avgExecutionTime: 0,
      lastExecution: Math.max(...group.map((a) => a.lastExecution)),
      triggers: {},
      recentActivity: group
        .flatMap((a) => a.recentActivity)
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 50),
      sources: group.map((a) => a.agentId),
      adapterSource: group[0]!.source,
    };
    merged.successRate = merged.totalExecutions > 0
      ? (merged.successfulExecutions / merged.totalExecutions) * 100
      : 0;
    const totalExecTime = group.reduce((s, a) => s + a.avgExecutionTime * a.totalExecutions, 0);
    merged.avgExecutionTime = merged.totalExecutions > 0 ? totalExecTime / merged.totalExecutions : 0;

    // Merge triggers
    for (const a of group) {
      for (const [k, v] of Object.entries(a.triggers)) {
        merged.triggers[k] = (merged.triggers[k] ?? 0) + v;
      }
    }

    mergedAgents.push(merged);
    for (const a of group) mergedIds.add(a.agentId);
  }

  // Keep un-merged agents, tag them with source
  const result: AgentStats[] = [];
  for (const a of agents) {
    if (mergedIds.has(a.agentId)) continue;
    const { source, localId } = extractSource(a.agentId);
    result.push({
      ...a,
      displayName: a.displayName ?? localId,
      adapterSource: source,
    });
  }

  return [...result, ...mergedAgents];
}

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

/**
 * Group agents by adapter source and purpose sub-groups.
 */
export function groupAgents(agents: AgentStats[]): GroupedAgentsResponse {
  // Group by source
  const sourceMap = new Map<string, AgentStats[]>();
  for (const a of agents) {
    const source = a.adapterSource ?? extractSource(a.agentId).source;
    const list = sourceMap.get(source) ?? [];
    list.push(a);
    sourceMap.set(source, list);
  }

  // Well-known display names; unknown sources get title-cased automatically
  const SOURCE_DISPLAY: Record<string, string> = {
    agentflow: 'AgentFlow',
    otel: 'OpenTelemetry',
  };

  const groups: AgentGroup[] = [];
  for (const [source, sourceAgents] of sourceMap) {
    // Purpose sub-groups
    const subMap = new Map<string, string[]>();
    for (const a of sourceAgents) {
      const purpose = findPurpose(a.displayName ?? a.agentId);
      const list = subMap.get(purpose) ?? [];
      list.push(a.agentId);
      subMap.set(purpose, list);
    }

    const subGroups = [...subMap.entries()]
      .map(([name, agentIds]) => ({ name, agentIds }))
      .sort((a, b) => b.agentIds.length - a.agentIds.length);

    groups.push({
      name: source,
      displayName: SOURCE_DISPLAY[source] ?? capitalize(source),
      totalExecutions: sourceAgents.reduce((s, a) => s + a.totalExecutions, 0),
      failedExecutions: sourceAgents.reduce((s, a) => s + a.failedExecutions, 0),
      agents: sourceAgents.sort((a, b) => b.totalExecutions - a.totalExecutions),
      subGroups,
    });
  }

  // Sort groups: most executions first
  groups.sort((a, b) => b.totalExecutions - a.totalExecutions);

  return { groups };
}
