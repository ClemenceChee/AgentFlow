/**
 * SOMA Data Adapter — Bridge between SOMA enriched traces and AgentFlow organizational types.
 *
 * Converts SOMA's organizational intelligence data into AgentFlow dashboard
 * compatible types for organizational context, team filtering, and intelligence metrics.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  OrganizationalTrace,
  TeamFilterState,
  OrganizationalIntelligence,
  OperatorContext,
  EnhancedSessionCorrelation,
  EnhancedPolicyStatus,
  TeamPerformanceMetrics,
} from './client/types/organizational.js';

export interface SomaExecutionEntity {
  id: string;
  type: 'execution';
  name: string;
  agentId: string;
  agent_id: string;
  trace_id?: string;
  duration?: number;
  created_at: string;
  operator_id?: string;
  operator_name?: string;
  team_id?: string;
  org?: {
    owners: Array<{ ref: string; source: string; confidence: number }>;
    projects: Array<{ ref: string; source: string; confidence: number }>;
    canonRefs: Array<{ ref: string; source: string; confidence: number }>;
    decisionRefs: Array<{ ref: string; source: string; confidence: number }>;
    teamRefs: Array<{ ref: string; source: string; confidence: number }>;
    enrichedAt: string;
    enricherVersion: string;
  };
  decisions?: Array<{
    action: string;
    reasoning?: string;
    tool?: string;
    args?: Record<string, unknown>;
    outcome: 'ok' | 'failed' | 'timeout' | 'skipped';
    index: number;
  }>;
  operator_context?: {
    sessionId: string;
    instanceId?: string;
    timestamp: number;
    userAgent?: string;
  };
}

export interface SomaTeamEntity {
  id: string;
  type: 'team';
  name: string;
  members?: string[];
  lead?: string;
}

export interface SomaAgentEntity {
  id: string;
  type: 'agent';
  name: string;
  operator_id?: string;
  operator_name?: string;
}

/**
 * SOMA Data Adapter for organizational dashboard integration
 */
export class SomaDataAdapter {
  constructor(private somaVaultPath: string) {}

  /**
   * Get all enriched execution entities from SOMA vault
   */
  async getEnrichedExecutions(): Promise<SomaExecutionEntity[]> {
    const executionDir = path.join(this.somaVaultPath, 'execution');
    if (!fs.existsSync(executionDir)) {
      return [];
    }

    const files = fs.readdirSync(executionDir).filter(f => f.endsWith('.md'));
    const executions: SomaExecutionEntity[] = [];

    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(executionDir, file), 'utf-8');
        const entity = this.parseEntity(content);
        if (entity && entity.type === 'execution') {
          executions.push(entity as SomaExecutionEntity);
        }
      } catch (error) {
        console.warn(`Failed to parse SOMA execution entity ${file}:`, error);
      }
    }

    return executions;
  }

  /**
   * Get team entities from SOMA vault
   */
  async getTeamEntities(): Promise<SomaTeamEntity[]> {
    const teamDir = path.join(this.somaVaultPath, 'team');
    if (!fs.existsSync(teamDir)) {
      return [];
    }

    const files = fs.readdirSync(teamDir).filter(f => f.endsWith('.md'));
    const teams: SomaTeamEntity[] = [];

    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(teamDir, file), 'utf-8');
        const entity = this.parseEntity(content);
        if (entity && entity.type === 'team') {
          teams.push(entity as SomaTeamEntity);
        }
      } catch (error) {
        console.warn(`Failed to parse SOMA team entity ${file}:`, error);
      }
    }

    return teams;
  }

  /**
   * Get agent entities from SOMA vault
   */
  async getAgentEntities(): Promise<SomaAgentEntity[]> {
    const agentDir = path.join(this.somaVaultPath, 'agent');
    if (!fs.existsSync(agentDir)) {
      return [];
    }

    const files = fs.readdirSync(agentDir).filter(f => f.endsWith('.md'));
    const agents: SomaAgentEntity[] = [];

    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(agentDir, file), 'utf-8');
        const entity = this.parseEntity(content);
        if (entity && entity.type === 'agent') {
          agents.push(entity as SomaAgentEntity);
        }
      } catch (error) {
        console.warn(`Failed to parse SOMA agent entity ${file}:`, error);
      }
    }

    return agents;
  }

  /**
   * Convert SOMA execution entities to AgentFlow organizational traces
   */
  async getOrganizationalTraces(): Promise<OrganizationalTrace[]> {
    const executions = await this.getEnrichedExecutions();
    const teams = await this.getTeamEntities();
    const agents = await this.getAgentEntities();

    return executions.map(execution => this.convertToOrganizationalTrace(execution, teams, agents));
  }

  /**
   * Build team filter state from SOMA data
   */
  async buildTeamFilterState(): Promise<TeamFilterState> {
    const executions = await this.getEnrichedExecutions();
    const teams = await this.getTeamEntities();

    // Extract unique teams from enriched traces
    const teamMap = new Map<string, { teamId: string; teamName: string; memberCount: number }>();

    // Add explicit team entities
    for (const team of teams) {
      teamMap.set(team.id, {
        teamId: team.id,
        teamName: team.name,
        memberCount: team.members?.length || 0
      });
    }

    // Add teams from trace enrichment
    for (const execution of executions) {
      if (execution.org?.teamRefs) {
        for (const teamRef of execution.org.teamRefs) {
          if (!teamMap.has(teamRef.ref)) {
            // Find team entity or create placeholder
            const teamEntity = teams.find(t => t.id === teamRef.ref);
            teamMap.set(teamRef.ref, {
              teamId: teamRef.ref,
              teamName: teamEntity?.name || teamRef.ref,
              memberCount: teamEntity?.members?.length || 0
            });
          }
        }
      }

      // Also check team_id field
      if (execution.team_id) {
        if (!teamMap.has(execution.team_id)) {
          const teamEntity = teams.find(t => t.id === execution.team_id);
          teamMap.set(execution.team_id, {
            teamId: execution.team_id,
            teamName: teamEntity?.name || execution.team_id,
            memberCount: teamEntity?.members?.length || 0
          });
        }
      }
    }

    const availableTeams = Array.from(teamMap.values()).map(team => ({
      ...team,
      isAccessible: true // TODO: Add actual team access logic
    }));

    return {
      selectedTeamId: undefined,
      availableTeams,
      filterActive: false
    };
  }

  /**
   * Build organizational intelligence summary from SOMA data
   */
  async buildOrganizationalIntelligence(): Promise<OrganizationalIntelligence> {
    const executions = await this.getEnrichedExecutions();
    const teams = await this.getTeamEntities();
    const agents = await this.getAgentEntities();

    // Extract unique operators from executions
    const operators = new Set<string>();
    const activeOperators = new Set<string>(); // Active in last 24h
    const now = Date.now();
    const dayAgo = now - 24 * 60 * 60 * 1000;

    let collaborationEvents = 0;
    let knowledgeSharing = 0;
    let totalQueryLatency = 0;
    let queryCount = 0;
    let complianceRate = 0;
    let complianceCount = 0;

    for (const execution of executions) {
      // Track operators
      if (execution.operator_id) {
        operators.add(execution.operator_id);

        const createdTime = new Date(execution.created_at).getTime();
        if (createdTime > dayAgo) {
          activeOperators.add(execution.operator_id);
        }
      }

      // Track collaboration events (multiple operators in related executions)
      if (execution.org?.teamRefs && execution.org.teamRefs.length > 0) {
        collaborationEvents++;
      }

      // Track knowledge sharing (decisions with reasoning)
      if (execution.decisions?.some(d => d.reasoning)) {
        knowledgeSharing++;
      }

      // Track performance metrics
      if (execution.duration) {
        totalQueryLatency += execution.duration;
        queryCount++;
      }

      // Track compliance (simplified - check if org enrichment exists)
      if (execution.org) {
        complianceRate += 1;
      }
      complianceCount++;
    }

    // Calculate team metrics
    const activeTeams = new Set<string>();
    let crossTeamCollaboration = 0;

    for (const execution of executions) {
      if (execution.team_id) {
        activeTeams.add(execution.team_id);
      }
      if (execution.org?.teamRefs && execution.org.teamRefs.length > 1) {
        crossTeamCollaboration++;
      }
    }

    const averageTeamSize = teams.length > 0
      ? teams.reduce((sum, team) => sum + (team.members?.length || 0), 0) / teams.length
      : 0;

    return {
      operatorInsights: {
        totalOperators: operators.size,
        activeOperators: activeOperators.size,
        collaborationEvents,
        knowledgeSharing
      },
      teamInsights: {
        totalTeams: teams.length,
        activeTeams: activeTeams.size,
        crossTeamCollaboration,
        averageTeamSize: Math.round(averageTeamSize)
      },
      performanceInsights: {
        organizationalQueryLatency: queryCount > 0 ? totalQueryLatency / queryCount : 0,
        teamScopedCacheHitRate: 0.85, // TODO: Calculate from actual cache metrics
        sessionCorrelationAccuracy: 0.92, // TODO: Calculate from correlation data
        policyComplianceRate: complianceCount > 0 ? complianceRate / complianceCount : 0
      }
    };
  }

  /**
   * Convert SOMA execution entity to AgentFlow organizational trace
   */
  private convertToOrganizationalTrace(
    execution: SomaExecutionEntity,
    teams: SomaTeamEntity[],
    agents: SomaAgentEntity[]
  ): OrganizationalTrace {
    // Build operator context
    const operatorContext: OperatorContext | undefined = execution.operator_context ? {
      operatorId: execution.operator_id || 'unknown',
      sessionId: execution.operator_context.sessionId,
      teamId: execution.team_id,
      instanceId: execution.operator_context.instanceId,
      timestamp: execution.operator_context.timestamp,
      userAgent: execution.operator_context.userAgent
    } : undefined;

    // Build session correlation (simplified for now)
    const sessionCorrelation: EnhancedSessionCorrelation | undefined = execution.org ? {
      correlationId: `${execution.id}-correlation`,
      relatedSessions: [],
      confidenceScore: 0.8,
      similarityMetrics: {
        workflowSimilarity: 0.7,
        contextOverlap: 0.6,
        problemDomainMatch: 0.8,
        solutionPatternMatch: 0.5
      },
      crossInstanceTracking: {
        instanceTransitions: [],
        handoffQuality: 0.8,
        continuityScore: 0.9
      }
    } : undefined;

    // Build policy status (simplified for now)
    const policyStatus: EnhancedPolicyStatus | undefined = execution.org ? {
      evaluationId: `${execution.id}-policy`,
      complianceStatus: 'compliant',
      policiesEvaluated: [],
      governanceRecommendations: [],
      approvalWorkflow: null,
      exemptionStatus: null
    } : undefined;

    return {
      filename: `${execution.id}.json`,
      agentId: execution.agentId,
      name: execution.name,
      status: 'completed', // TODO: Derive from execution data
      startTime: new Date(execution.created_at).getTime(),
      endTime: new Date(execution.created_at).getTime() + (execution.duration || 0),
      trigger: execution.decisions?.[0]?.action || 'unknown',
      nodes: {}, // TODO: Convert decisions to nodes structure
      operatorContext,
      sessionCorrelation,
      policyStatus,
      metadata: {
        organizationalFeatures: {
          hasOperatorContext: !!operatorContext,
          hasTeamContext: !!execution.team_id,
          hasPolicyStatus: !!policyStatus,
          hasSessionCorrelation: !!sessionCorrelation
        }
      }
    };
  }

  /**
   * Parse SOMA entity from markdown content
   */
  private parseEntity(content: string): any {
    try {
      // Extract YAML frontmatter
      const match = content.match(/^---\n([\s\S]*?)\n---/);
      if (!match) return null;

      const yaml = match[1];
      // Simple YAML parsing for basic key-value pairs
      const entity: any = {};

      const lines = yaml.split('\n');
      for (const line of lines) {
        const colonIndex = line.indexOf(':');
        if (colonIndex > 0) {
          const key = line.substring(0, colonIndex).trim();
          const value = line.substring(colonIndex + 1).trim();

          // Handle different value types
          if (value === 'true' || value === 'false') {
            entity[key] = value === 'true';
          } else if (value.startsWith('"') && value.endsWith('"')) {
            entity[key] = value.slice(1, -1);
          } else if (value.startsWith('[') && value.endsWith(']')) {
            // Simple array parsing
            entity[key] = value.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean);
          } else if (!isNaN(Number(value))) {
            entity[key] = Number(value);
          } else {
            entity[key] = value;
          }
        }
      }

      return entity;
    } catch (error) {
      console.warn('Failed to parse SOMA entity:', error);
      return null;
    }
  }
}