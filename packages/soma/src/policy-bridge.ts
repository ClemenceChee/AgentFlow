/**
 * Policy Bridge — layer-aware query interface.
 *
 * Bidirectional interface between knowledge layers and agents:
 * - L4 (canon) → hard enforcement (MUST follow)
 * - L3 (emerging) → soft advisory (SHOULD consider)
 * - L2 (working) → context briefing (FYI)
 * - L1 (archive) → historical routing (reference)
 *
 * The Policy Bridge is read-only — it never writes to any layer.
 * Also implements AgentFlow's PolicySource interface for backward compatibility.
 *
 * @module
 */

import type { AgentProfile, PolicySource } from 'agentflow-core';
import { queryByLayer } from './layers.js';
import type { AgentEntity, Entity, KnowledgeLayer, Vault } from './types.js';
import { LAYER_SEMANTIC_WEIGHTS } from './types.js';
import { getGlobalAuditLogger } from './security-audit-logger.js';

// ---------------------------------------------------------------------------
// Layer-aware query types
// ---------------------------------------------------------------------------

/** Organizational context for policy queries. */
export interface OrganizationalContext {
  readonly operatorId?: string;
  readonly sessionId?: string;
  readonly teamId?: string;
  readonly instanceId?: string;
  readonly timestamp?: number;
  readonly userAgent?: string;
}

/** Enhanced policy bridge result with organizational metadata. */
export interface OrganizationalPolicyResult extends PolicyBridgeResult {
  /** Organizational relevance score (0-1) */
  orgRelevanceScore: number;
  /** Team-specific applicability */
  teamApplicability?: 'team_specific' | 'cross_team' | 'organization_wide';
  /** Operator context validation status */
  operatorValidated: boolean;
  /** Session correlation confidence */
  sessionCorrelation?: {
    relatedSessions: string[];
    confidenceScore: number;
  };
  /** Governance workflow status */
  governanceStatus?: 'pending' | 'approved' | 'rejected' | 'escalated';
}

/** Query intents supported by the Policy Bridge. */
export type PolicyBridgeIntent = 'enforce' | 'advise' | 'brief' | 'route' | 'all' | 'organizational';

/** Intent to layer mapping. */
const INTENT_TO_LAYER: Record<string, KnowledgeLayer> = {
  enforce: 'canon',
  advise: 'emerging',
  brief: 'working',
  route: 'archive',
};

/** A query result from the Policy Bridge with layer metadata. */
export interface PolicyBridgeResult {
  /** The matched entity */
  entry: Entity;
  /** Source knowledge layer */
  source_layer: KnowledgeLayer;
  /** Semantic weight: mandatory, advisory, contextual, historical */
  semantic_weight: string;
}

/** Stratified results from an 'all' query, grouped by layer. */
export interface StratifiedResults {
  canon: PolicyBridgeResult[];
  emerging: PolicyBridgeResult[];
  working: PolicyBridgeResult[];
  archive: PolicyBridgeResult[];
}

export class PolicyBridgeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PolicyBridgeError';
  }
}

// ---------------------------------------------------------------------------
// Layer-aware Policy Bridge
// ---------------------------------------------------------------------------

export interface LayerPolicyBridge {
  /** Query by intent (enforce, advise, brief, route, all, organizational). */
  query(
    intent: PolicyBridgeIntent,
    options?: {
      topic?: string;
      team_id?: string;
      limit?: number;
    },
  ): PolicyBridgeResult[] | StratifiedResults;

  /** Organizational intelligence-aware policy query. */
  queryWithOrganizationalContext(
    intent: PolicyBridgeIntent,
    context: OrganizationalContext,
    options?: {
      topic?: string;
      limit?: number;
      includeSessionCorrelation?: boolean;
      includeGovernanceStatus?: boolean;
    }
  ): OrganizationalPolicyResult[];

  /** Get team-specific policies with inheritance from organization-wide policies. */
  getTeamPolicies(teamId: string, operatorId?: string): OrganizationalPolicyResult[];

  /** Get operator-specific policy briefing based on session context. */
  getOperatorBriefing(
    operatorId: string,
    sessionId?: string,
    options?: {
      includeRecentPatterns?: boolean;
      includeCrossTeamInsights?: boolean;
      maxAge?: number; // milliseconds
    }
  ): OrganizationalPolicyResult[];

  /** Get session correlation-based policy recommendations. */
  getCorrelatedPolicyRecommendations(
    sessionId: string,
    options?: {
      correlationThreshold?: number;
      maxRecommendations?: number;
      includeHistoricalPatterns?: boolean;
    }
  ): OrganizationalPolicyResult[];

  /** Legacy PolicySource interface for AgentFlow guards. */
  policySource: PolicySource;
}

/**
 * Create a layer-aware Policy Bridge.
 * Read-only: rejects any write attempts.
 */
export function createPolicyBridge(vault: Vault): LayerPolicyBridge {
  const auditLogger = getGlobalAuditLogger();

  function tagResults(entries: Entity[], layer: KnowledgeLayer): PolicyBridgeResult[] {
    return entries.map((entry) => ({
      entry,
      source_layer: layer,
      semantic_weight: LAYER_SEMANTIC_WEIGHTS[layer],
    }));
  }

  function tagOrganizationalResults(
    entries: Entity[],
    layer: KnowledgeLayer,
    context: OrganizationalContext,
    options?: any
  ): OrganizationalPolicyResult[] {
    return entries.map((entry) => {
      const orgRelevanceScore = calculateOrganizationalRelevance(entry, context);
      const teamApplicability = determineTeamApplicability(entry, context.teamId);
      const operatorValidated = checkOperatorValidation(entry, context.operatorId);
      const sessionCorrelation = options?.includeSessionCorrelation
        ? getSessionCorrelation(entry, context.sessionId)
        : undefined;
      const governanceStatus = options?.includeGovernanceStatus
        ? getGovernanceStatus(entry)
        : undefined;

      return {
        entry,
        source_layer: layer,
        semantic_weight: LAYER_SEMANTIC_WEIGHTS[layer],
        orgRelevanceScore,
        teamApplicability,
        operatorValidated,
        sessionCorrelation,
        governanceStatus,
      };
    });
  }

  function calculateOrganizationalRelevance(entry: Entity, context: OrganizationalContext): number {
    let score = 0.5; // Base relevance

    // Team relevance
    if (context.teamId) {
      const entryTeamId = (entry as any).team_id;
      if (entryTeamId === context.teamId) {
        score += 0.3;
      } else if (entry.tags.includes('cross-team')) {
        score += 0.2;
      }
    }

    // Operator relevance
    if (context.operatorId) {
      const entryOperatorId = (entry as any).operator_id;
      if (entryOperatorId === context.operatorId) {
        score += 0.2;
      }
    }

    // Recency relevance
    if (context.timestamp && entry.updated_at) {
      const ageMs = context.timestamp - new Date(entry.updated_at).getTime();
      const ageDays = ageMs / (1000 * 60 * 60 * 24);
      if (ageDays < 1) score += 0.1;
      else if (ageDays < 7) score += 0.05;
    }

    return Math.min(score, 1.0);
  }

  function determineTeamApplicability(entry: Entity, teamId?: string): 'team_specific' | 'cross_team' | 'organization_wide' {
    if ((entry as any).team_id === teamId) {
      return 'team_specific';
    } else if (entry.tags.includes('cross-team')) {
      return 'cross_team';
    } else {
      return 'organization_wide';
    }
  }

  function checkOperatorValidation(entry: Entity, operatorId?: string): boolean {
    if (!operatorId) return false;

    const validatedBy = (entry as any).validated_by;
    if (Array.isArray(validatedBy)) {
      return validatedBy.includes(operatorId);
    }
    return validatedBy === operatorId;
  }

  function getSessionCorrelation(entry: Entity, sessionId?: string): { relatedSessions: string[]; confidenceScore: number } | undefined {
    if (!sessionId) return undefined;

    // Look for session correlation data in entry
    const correlationData = (entry as any).session_correlation;
    if (correlationData && correlationData[sessionId]) {
      return {
        relatedSessions: correlationData[sessionId].relatedSessions || [],
        confidenceScore: correlationData[sessionId].confidenceScore || 0
      };
    }

    return { relatedSessions: [], confidenceScore: 0 };
  }

  function getGovernanceStatus(entry: Entity): 'pending' | 'approved' | 'rejected' | 'escalated' | undefined {
    return (entry as any).governance_status;
  }

  function filterByTopic(entries: Entity[], topic?: string): Entity[] {
    if (!topic) return entries;
    const lower = topic.toLowerCase();
    return entries.filter(
      (e) =>
        e.name.toLowerCase().includes(lower) ||
        e.body.toLowerCase().includes(lower) ||
        e.tags.some((t) => t.toLowerCase().includes(lower)),
    );
  }

  return {
    query(intent, options?) {
      const topic = options?.topic;
      const teamId = options?.team_id;
      const limit = options?.limit ?? 100;

      // Audit policy queries
      auditLogger.logSecurityEvent({
        eventType: 'data_access',
        severity: 'info',
        teamId,
        action: 'policy_query',
        resource: 'policy_bridge',
        result: 'success',
        details: {
          intent,
          topic,
          limit,
          queryType: 'standard'
        }
      });

      // Read-only enforcement: there's no write path here by design.
      // This is a query-only interface.

      if (intent === 'organizational') {
        // Organizational-specific query: combine patterns from all layers with organizational metadata
        const allLayers: KnowledgeLayer[] = ['canon', 'emerging', 'working', 'archive'];
        const results: PolicyBridgeResult[] = [];

        for (const layer of allLayers) {
          const entries = queryByLayer(vault, layer, { limit, team_id: teamId });
          const filtered = filterByTopic(entries, topic);
          results.push(...tagResults(filtered, layer));
        }

        // Sort by semantic weight (canon first, then emerging, etc.)
        return results.sort((a, b) => {
          const weights = { mandatory: 4, advisory: 3, contextual: 2, historical: 1 };
          const aWeight = (weights as any)[a.semantic_weight] || 0;
          const bWeight = (weights as any)[b.semantic_weight] || 0;
          return bWeight - aWeight;
        });
      }

      if (intent === 'all') {
        // Combined query: return stratified results from all four layers
        const result: StratifiedResults = {
          canon: tagResults(filterByTopic(queryByLayer(vault, 'canon', { limit }), topic), 'canon'),
          emerging: tagResults(
            filterByTopic(queryByLayer(vault, 'emerging', { limit }), topic),
            'emerging',
          ),
          working: tagResults(
            filterByTopic(queryByLayer(vault, 'working', { limit, team_id: teamId }), topic),
            'working',
          ),
          archive: tagResults(
            filterByTopic(queryByLayer(vault, 'archive', { limit }), topic),
            'archive',
          ),
        };
        return result;
      }

      // Single-layer query
      const layer = INTENT_TO_LAYER[intent];
      if (!layer) {
        throw new PolicyBridgeError(
          `Unknown intent: '${intent}'. Use: enforce, advise, brief, route, or all.`,
        );
      }

      // Enforce team_id requirement for brief (L2) queries
      if (intent === 'brief' && !teamId) {
        throw new PolicyBridgeError('team_id is required for brief (L2) queries.');
      }

      const entries = queryByLayer(vault, layer, { limit, team_id: teamId });
      return tagResults(filterByTopic(entries, topic), layer);
    },

    queryWithOrganizationalContext(intent, context, options?) {
      const topic = options?.topic;
      const limit = options?.limit ?? 50;

      // Audit organizational context queries
      auditLogger.logSecurityEvent({
        eventType: 'data_access',
        severity: 'info',
        operatorId: context.operatorId,
        teamId: context.teamId,
        sessionId: context.sessionId,
        action: 'organizational_policy_query',
        resource: 'policy_bridge',
        result: 'success',
        details: {
          intent,
          topic,
          limit,
          queryType: 'organizational_context',
          includeSessionCorrelation: options?.includeSessionCorrelation,
          includeGovernanceStatus: options?.includeGovernanceStatus
        }
      });

      if (intent === 'all') {
        const allLayers: KnowledgeLayer[] = ['canon', 'emerging', 'working', 'archive'];
        const results: OrganizationalPolicyResult[] = [];

        for (const layer of allLayers) {
          const entries = queryByLayer(vault, layer, { limit, team_id: context.teamId });
          const filtered = filterByTopic(entries, topic);
          results.push(...tagOrganizationalResults(filtered, layer, context, options));
        }

        return results.sort((a, b) => b.orgRelevanceScore - a.orgRelevanceScore);
      }

      const layer = INTENT_TO_LAYER[intent];
      if (!layer && intent !== 'organizational') {
        throw new PolicyBridgeError(
          `Unknown intent: '${intent}'. Use: enforce, advise, brief, route, organizational, or all.`,
        );
      }

      if (intent === 'organizational') {
        // Cross-layer organizational query
        const allLayers: KnowledgeLayer[] = ['canon', 'emerging', 'working', 'archive'];
        const results: OrganizationalPolicyResult[] = [];

        for (const layer of allLayers) {
          const entries = queryByLayer(vault, layer, { limit, team_id: context.teamId });
          const filtered = filterByTopic(entries, topic);
          results.push(...tagOrganizationalResults(filtered, layer, context, options));
        }

        return results
          .filter(r => r.orgRelevanceScore > 0.3) // Filter for relevant results
          .sort((a, b) => b.orgRelevanceScore - a.orgRelevanceScore);
      }

      const entries = queryByLayer(vault, layer!, { limit, team_id: context.teamId });
      const filtered = filterByTopic(entries, topic);
      return tagOrganizationalResults(filtered, layer!, context, options);
    },

    getTeamPolicies(teamId, operatorId?) {
      auditLogger.logSecurityEvent({
        eventType: 'data_access',
        severity: 'info',
        operatorId,
        teamId,
        action: 'team_policies_query',
        resource: 'policy_bridge',
        result: 'success',
        details: { teamId, operatorId, queryType: 'team_policies' }
      });

      const context: OrganizationalContext = { teamId, operatorId };

      // Get team-specific policies from working memory
      const teamEntries = queryByLayer(vault, 'working', { team_id: teamId, limit: 50 });

      // Get organization-wide policies from canon and emerging
      const canonEntries = queryByLayer(vault, 'canon', { limit: 20 });
      const emergingEntries = queryByLayer(vault, 'emerging', { limit: 20 });

      const results: OrganizationalPolicyResult[] = [
        ...tagOrganizationalResults(teamEntries, 'working', context),
        ...tagOrganizationalResults(canonEntries, 'canon', context),
        ...tagOrganizationalResults(emergingEntries, 'emerging', context),
      ];

      return results.sort((a, b) => {
        // Prioritize team-specific, then by relevance score
        if (a.teamApplicability !== b.teamApplicability) {
          const order = { team_specific: 3, cross_team: 2, organization_wide: 1 };
          return (order[a.teamApplicability!] || 0) - (order[b.teamApplicability!] || 0);
        }
        return b.orgRelevanceScore - a.orgRelevanceScore;
      });
    },

    getOperatorBriefing(operatorId, sessionId?, options?) {
      const maxAge = options?.maxAge ?? (24 * 60 * 60 * 1000); // 24 hours default
      const includeRecentPatterns = options?.includeRecentPatterns ?? true;
      const includeCrossTeamInsights = options?.includeCrossTeamInsights ?? false;

      auditLogger.logSecurityEvent({
        eventType: 'data_access',
        severity: 'info',
        operatorId,
        sessionId,
        action: 'operator_briefing_query',
        resource: 'policy_bridge',
        result: 'success',
        details: {
          operatorId,
          sessionId,
          includeRecentPatterns,
          includeCrossTeamInsights,
          maxAge,
          queryType: 'operator_briefing'
        }
      });

      const context: OrganizationalContext = { operatorId, sessionId, timestamp: Date.now() };
      const cutoffTime = Date.now() - maxAge;

      // Get recent patterns for this operator
      const recentEntries = vault.list('pattern').filter(entry => {
        const entryTime = entry.updated_at ? new Date(entry.updated_at).getTime() : 0;
        const isRecent = entryTime > cutoffTime;
        const isOperatorRelated = (entry as any).operator_id === operatorId;
        return isRecent && (isOperatorRelated || includeRecentPatterns);
      });

      // Get cross-team insights if requested
      const crossTeamEntries = includeCrossTeamInsights
        ? vault.list('insight').filter(entry => entry.tags.includes('cross-team'))
        : [];

      const allEntries = [...recentEntries, ...crossTeamEntries];

      return tagOrganizationalResults(allEntries, 'emerging', context, {
        includeSessionCorrelation: true,
        includeGovernanceStatus: true
      }).sort((a, b) => b.orgRelevanceScore - a.orgRelevanceScore);
    },

    getCorrelatedPolicyRecommendations(sessionId, options?) {
      const correlationThreshold = options?.correlationThreshold ?? 0.7;
      const maxRecommendations = options?.maxRecommendations ?? 10;
      const includeHistoricalPatterns = options?.includeHistoricalPatterns ?? true;

      auditLogger.logSecurityEvent({
        eventType: 'data_access',
        severity: 'info',
        sessionId,
        action: 'correlated_policy_recommendations_query',
        resource: 'policy_bridge',
        result: 'success',
        details: {
          sessionId,
          correlationThreshold,
          maxRecommendations,
          includeHistoricalPatterns,
          queryType: 'session_correlation'
        }
      });

      // Find correlated sessions
      const correlatedSessions = vault.list('session_correlation')
        .filter(corr => {
          const corrData = corr as any;
          return corrData.session_id === sessionId && corrData.confidence_score >= correlationThreshold;
        });

      if (correlatedSessions.length === 0) {
        return [];
      }

      const context: OrganizationalContext = { sessionId };
      const recommendationEntries: Entity[] = [];

      // Get policies from correlated sessions
      for (const correlation of correlatedSessions.slice(0, maxRecommendations)) {
        const relatedSessionId = (correlation as any).related_session_id;
        const sessionPolicies = vault.list('policy')
          .filter(policy => (policy as any).session_id === relatedSessionId);
        recommendationEntries.push(...sessionPolicies);
      }

      // Add historical patterns if requested
      if (includeHistoricalPatterns) {
        const historicalPatterns = queryByLayer(vault, 'archive', { limit: 5 })
          .filter(entry => entry.tags.includes('pattern'));
        recommendationEntries.push(...historicalPatterns);
      }

      return tagOrganizationalResults(recommendationEntries, 'emerging', context, {
        includeSessionCorrelation: true
      })
        .sort((a, b) => (b.sessionCorrelation?.confidenceScore || 0) - (a.sessionCorrelation?.confidenceScore || 0))
        .slice(0, maxRecommendations);
    },

    // Legacy PolicySource for backward compatibility with AgentFlow guards
    policySource: createSomaPolicySource(vault),
  };
}

// ---------------------------------------------------------------------------
// Legacy PolicySource (backward compatible)
// ---------------------------------------------------------------------------

/**
 * Create a PolicySource that reads from Soma's vault.
 *
 * AgentFlow guards can use this to make adaptive decisions
 * based on accumulated organizational knowledge.
 */
export function createSomaPolicySource(vault: Vault): PolicySource {
  return {
    recentFailureRate(agentId: string): number {
      const normalized = agentId.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const agent = vault.read('agent', normalized) as AgentEntity | null;
      return agent?.failureRate ?? 0;
    },

    isKnownBottleneck(nodeName: string): boolean {
      const archetypes = vault.list('archetype');
      return archetypes.some((a) => {
        const bottlenecks = (a as Record<string, unknown>).bottlenecks;
        return Array.isArray(bottlenecks) && bottlenecks.includes(nodeName);
      });
    },

    lastConformanceScore(agentId: string): number | null {
      const normalized = agentId.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const executions = vault.list('execution', { agentId: normalized, limit: 1 });
      if (executions.length === 0) return null;
      return ((executions[0] as Record<string, unknown>).conformanceScore as number) ?? null;
    },

    getAgentProfile(agentId: string): AgentProfile | null {
      const normalized = agentId.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const agent = vault.read('agent', normalized) as AgentEntity | null;
      return agent?.profile ?? null;
    },
  };
}
