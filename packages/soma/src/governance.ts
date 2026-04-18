/**
 * Governance API — L3→L4 promotion pipeline.
 *
 * Provides operations for human reviewers to inspect, promote, or reject
 * L3 (Emerging Knowledge) proposals into L4 (Institutional Canon).
 *
 * L2 entries cannot be promoted. Only L3 entries with status 'pending'
 * are eligible for promotion.
 *
 * @module
 */

import { queryByLayer, writeToLayer } from './layers.js';
import type { AutoPromoteConfig, Entity, Vault } from './types.js';
import { getGlobalAuditLogger } from './security-audit-logger.js';

export class GovernanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GovernanceError';
  }
}

export interface TeamGovernanceConfig {
  teamId: string;
  customValidators?: string[]; // List of operator IDs with validation privileges
  validationThresholds?: {
    minConfidence?: number;
    minValidatorCount?: number;
    timeoutMinutes?: number;
  };
  customWorkflows?: {
    [patternType: string]: TeamValidationWorkflow;
  };
  organizationPolicies: OrganizationGovernancePolicies;
}

export interface TeamValidationWorkflow {
  requiredValidators: number;
  validatorRoles?: ('admin' | 'maintainer' | 'member')[];
  escalationPath?: string[]; // Operator IDs for escalation
  timeoutMinutes: number;
  requireSecurityReview?: boolean;
  customNotifications?: boolean;
}

export interface OrganizationGovernancePolicies {
  mandatorySecurityReview: string[]; // Pattern types requiring security review
  prohibitedOperations: string[]; // Pattern types that are not allowed
  maxConfidenceThreshold: number; // Cannot exceed this confidence threshold
  auditRetentionDays: number;
  complianceRequirements: string[];
}

export interface ValidationRequest {
  entryId: string;
  teamId?: string;
  patternType: string;
  requestedBy: string;
  assignedValidators: string[];
  createdAt: string;
  timeoutAt: string;
  status: 'pending' | 'validating' | 'approved' | 'rejected' | 'timed_out';
  validations: ValidationResponse[];
}

export interface ValidationResponse {
  validatorId: string;
  decision: 'approve' | 'reject';
  reasoning: string;
  timestamp: string;
  confidence: number;
}

export interface AutoPromoteResult {
  promoted: string[];
  skipped: number;
}

export interface GovernanceAPI {
  /** List L3 entries with status 'pending', ordered by confidence_score descending. */
  list_pending(): Entity[];
  /** Promote an L3 entry to L4. Creates a new L4 entry and marks L3 as 'promoted'. */
  promote(entryId: string, reviewerId: string): string;
  /** Reject an L3 entry. Marks it as 'rejected' with reason recorded. */
  reject(entryId: string, reviewerId: string, reason: string): void;
  /** Get an L3 entry with its full evidence chain (linked L1 traces). */
  get_evidence(entryId: string): { entry: Entity; evidence: Entity[] };
  /** Auto-promote L3 proposals meeting confidence and agent count thresholds. */
  autoPromote(config?: AutoPromoteConfig): AutoPromoteResult;

  // Team governance methods
  /** Configure governance settings for a specific team. */
  configureTeamGovernance(config: TeamGovernanceConfig): void;
  /** Get governance configuration for a team. */
  getTeamGovernanceConfig(teamId: string): TeamGovernanceConfig | null;
  /** Submit a pattern for team-specific validation workflow. */
  submitForTeamValidation(entryId: string, teamId: string, operatorId: string): string;
  /** List pending validation requests for a team or operator. */
  listValidationRequests(teamId?: string, operatorId?: string): ValidationRequest[];
  /** Submit a validation response from a validator. */
  submitValidation(requestId: string, validatorId: string, response: Omit<ValidationResponse, 'validatorId' | 'timestamp'>): void;
  /** Process team validation workflow and determine outcome. */
  processTeamValidation(requestId: string): 'approved' | 'rejected' | 'pending' | 'timed_out';
}

/**
 * Create a Governance API instance.
 */
export function createGovernanceAPI(vault: Vault): GovernanceAPI {
  // Internal storage for team configurations and validation requests
  const teamConfigs = new Map<string, TeamGovernanceConfig>();
  const validationRequests = new Map<string, ValidationRequest>();
  return {
    list_pending(): Entity[] {
      const l3Entries = queryByLayer(vault, 'emerging');
      return l3Entries
        .filter((e) => e.status === 'pending')
        .sort((a, b) => (b.confidence_score ?? 0) - (a.confidence_score ?? 0));
    },

    promote(entryId: string, reviewerId: string): string {
      const auditLogger = getGlobalAuditLogger();
      // Find the entry
      const l3Entries = queryByLayer(vault, 'emerging');
      const entry = l3Entries.find((e) => e.id === entryId);

      if (!entry) {
        // Check if it's an L2 entry
        const l2Entries = queryByLayer(vault, 'working');
        const l2Entry = l2Entries.find((e) => e.id === entryId);
        if (l2Entry) {
          auditLogger.logSecurityEvent({
            eventType: 'governance_decision',
            severity: 'warning',
            operatorId: reviewerId,
            action: 'promotion_rejected',
            resource: `entry:${entryId}`,
            result: 'blocked',
            details: {
              reason: 'L2_entries_cannot_be_promoted',
              entryLayer: 'working',
              requestedAction: 'promote_to_l4'
            }
          });
          throw new GovernanceError(
            `L2 entries cannot be promoted. Entry '${entryId}' is in Working Memory (L2).`,
          );
        }

        auditLogger.logSecurityEvent({
          eventType: 'governance_decision',
          severity: 'error',
          operatorId: reviewerId,
          action: 'promotion_rejected',
          resource: `entry:${entryId}`,
          result: 'failure',
          details: {
            reason: 'entry_not_found',
            searchedLayer: 'emerging_knowledge',
            requestedAction: 'promote_to_l4'
          }
        });
        throw new GovernanceError(`Entry '${entryId}' not found in L3 (Emerging Knowledge).`);
      }

      if (entry.layer === 'working') {
        auditLogger.logSecurityEvent({
          eventType: 'governance_decision',
          severity: 'warning',
          operatorId: reviewerId,
          action: 'promotion_rejected',
          resource: `entry:${entryId}`,
          result: 'blocked',
          details: {
            reason: 'L2_entries_cannot_be_promoted',
            entryLayer: entry.layer,
            requestedAction: 'promote_to_l4'
          }
        });
        throw new GovernanceError(
          `L2 entries cannot be promoted. Entry '${entryId}' is in Working Memory (L2).`,
        );
      }

      if (entry.status === 'promoted') {
        auditLogger.logSecurityEvent({
          eventType: 'governance_decision',
          severity: 'warning',
          operatorId: reviewerId,
          action: 'promotion_rejected',
          resource: `entry:${entryId}`,
          result: 'blocked',
          details: {
            reason: 'already_promoted',
            currentStatus: entry.status,
            requestedAction: 'promote_to_l4'
          }
        });
        throw new GovernanceError(`Entry '${entryId}' has already been promoted.`);
      }

      if (entry.status === 'rejected') {
        auditLogger.logSecurityEvent({
          eventType: 'governance_decision',
          severity: 'warning',
          operatorId: reviewerId,
          action: 'promotion_rejected',
          resource: `entry:${entryId}`,
          result: 'blocked',
          details: {
            reason: 'previously_rejected',
            currentStatus: entry.status,
            requestedAction: 'promote_to_l4'
          }
        });
        throw new GovernanceError(`Entry '${entryId}' has been rejected. Resubmit to promote.`);
      }

      // Create L4 entry via governance-authorized write
      // Use distinct ID to avoid colliding with the L3 entry in the same type directory
      const now = new Date().toISOString();
      const entryData = entry as Record<string, unknown>;
      const l4Id = writeToLayer(vault, 'governance', 'canon', {
        type: entry.type,
        id: `canon-${entryId}`,
        name: entry.name,
        status: 'active',
        ratified_by: reviewerId,
        ratified_at: now,
        origin_l3_id: entryId,
        // Preserve evidence chain from L3
        evidence_links: entry.evidence_links ?? [],
        confidence_score: entry.confidence_score,
        claim: entryData.claim,
        source_agents: entryData.source_agents,
        tags: [...entry.tags.filter((t) => t !== 'l3-proposal'), 'ratified', 'canon'],
        related: entry.related,
        body: entry.body,
      } as Partial<Entity> & { type: string; name: string });

      // Mark L3 entry as promoted
      vault.update(entryId, { status: 'promoted' } as Partial<Entity>);

      // Log successful promotion
      auditLogger.logSecurityEvent({
        eventType: 'governance_decision',
        severity: 'info',
        operatorId: reviewerId,
        action: 'promotion_approved',
        resource: `entry:${entryId}`,
        result: 'success',
        details: {
          l3EntryId: entryId,
          l4EntryId: l4Id,
          entryName: entry.name,
          entryType: entry.type,
          confidenceScore: entry.confidence_score,
          evidenceLinks: (entry.evidence_links ?? []).length,
          promotionTimestamp: now
        }
      });

      return l4Id;
    },

    reject(entryId: string, reviewerId: string, reason: string): void {
      const auditLogger = getGlobalAuditLogger();
      const l3Entries = queryByLayer(vault, 'emerging');
      const entry = l3Entries.find((e) => e.id === entryId);

      if (!entry) {
        // Check if it's an L2 entry
        const l2Entries = queryByLayer(vault, 'working');
        const l2Entry = l2Entries.find((e) => e.id === entryId);
        if (l2Entry) {
          throw new GovernanceError(
            `L2 entries cannot be rejected via governance. Entry '${entryId}' is in Working Memory (L2).`,
          );
        }
        throw new GovernanceError(`Entry '${entryId}' not found in L3 (Emerging Knowledge).`);
      }

      if (entry.status === 'promoted') {
        throw new GovernanceError(`Entry '${entryId}' has already been promoted.`);
      }

      if (entry.status === 'rejected') {
        throw new GovernanceError(`Entry '${entryId}' has already been rejected.`);
      }

      const rejectionTimestamp = new Date().toISOString();

      vault.update(entryId, {
        status: 'rejected',
        rejected_by: reviewerId,
        rejected_at: rejectionTimestamp,
        rejection_reason: reason,
      } as Partial<Entity>);

      // Log the rejection
      auditLogger.logSecurityEvent({
        eventType: 'governance_decision',
        severity: 'info',
        operatorId: reviewerId,
        action: 'promotion_rejected',
        resource: `entry:${entryId}`,
        result: 'success',
        details: {
          entryName: entry.name,
          entryType: entry.type,
          confidenceScore: entry.confidence_score,
          rejectionReason: reason,
          rejectionTimestamp
        }
      });
    },

    autoPromote(config?: AutoPromoteConfig): AutoPromoteResult {
      const enabled = config?.enabled ?? false;
      if (!enabled) return { promoted: [], skipped: 0 };

      const minConfidence = config?.minConfidence ?? 0.9;
      const minAgentCount = config?.minAgentCount ?? 5;

      const pending = this.list_pending();
      const promoted: string[] = [];
      let skipped = 0;

      for (const entry of pending) {
        const confidence = entry.confidence_score ?? 0;
        if (confidence < minConfidence) {
          skipped++;
          continue;
        }

        // Count distinct agent_ids from evidence links
        const evidenceLinks = entry.evidence_links ?? [];
        const l1Entries = queryByLayer(vault, 'archive');
        const agentIds = new Set<string>();
        for (const linkId of evidenceLinks) {
          const linked = l1Entries.find((e) => e.id === linkId);
          if (linked) {
            const agentId =
              ((linked as Record<string, unknown>).agent_id as string) ??
              ((linked as Record<string, unknown>).agentId as string);
            if (agentId) agentIds.add(agentId);
          }
        }

        if (agentIds.size < minAgentCount) {
          skipped++;
          continue;
        }

        // Auto-promote with ratified_by='auto-promote'
        try {
          const l4Id = this.promote(entry.id, 'auto-promote');
          promoted.push(l4Id);
          console.log(
            `[Governance] Auto-promoted '${entry.name}' (confidence: ${confidence}, agents: ${agentIds.size})`,
          );
        } catch {
          skipped++;
        }
      }

      return { promoted, skipped };
    },

    get_evidence(entryId: string): { entry: Entity; evidence: Entity[] } {
      const l3Entries = queryByLayer(vault, 'emerging');
      const entry = l3Entries.find((e) => e.id === entryId);

      if (!entry) {
        throw new GovernanceError(`Entry '${entryId}' not found in L3 (Emerging Knowledge).`);
      }

      // Resolve evidence links to L1 entries
      const evidence: Entity[] = [];
      const evidenceLinks = entry.evidence_links ?? [];

      for (const linkId of evidenceLinks) {
        // Search L1 for the linked entry
        const l1Entries = queryByLayer(vault, 'archive');
        const linked = l1Entries.find((e) => e.id === linkId);
        if (linked) evidence.push(linked);
      }

      return { entry, evidence };
    },

    // Team governance methods
    configureTeamGovernance(config: TeamGovernanceConfig): void {
      const auditLogger = getGlobalAuditLogger();
      // Validate against organization policies
      if (config.validationThresholds?.minConfidence &&
          config.validationThresholds.minConfidence > config.organizationPolicies.maxConfidenceThreshold) {
        throw new GovernanceError(
          `Team confidence threshold (${config.validationThresholds.minConfidence}) exceeds organization maximum (${config.organizationPolicies.maxConfidenceThreshold})`
        );
      }

      teamConfigs.set(config.teamId, config);

      // Store configuration in vault for persistence
      writeToLayer(vault, 'governance', 'canon', {
        type: 'team_governance_config',
        id: `team-governance-${config.teamId}`,
        name: `Team Governance Config: ${config.teamId}`,
        team_id: config.teamId,
        config: JSON.stringify(config),
        tags: ['governance', 'team-config'],
        status: 'active',
        // Required fields for canon layer
        ratified_by: 'system',
        ratified_at: new Date().toISOString(),
        origin_l3_id: `team-governance-proposal-${config.teamId}`,
      } as Partial<Entity> & { type: string; name: string });

      // Log team governance configuration
      auditLogger.logSecurityEvent({
        eventType: 'system_configuration',
        severity: 'info',
        teamId: config.teamId,
        action: 'team_governance_configured',
        resource: `team_governance:${config.teamId}`,
        result: 'success',
        details: {
          customValidators: config.customValidators?.length || 0,
          customWorkflows: Object.keys(config.customWorkflows || {}).length,
          confidenceThreshold: config.validationThresholds?.minConfidence,
          minValidatorCount: config.validationThresholds?.minValidatorCount,
          organizationPolicies: {
            mandatorySecurityReview: config.organizationPolicies.mandatorySecurityReview.length,
            prohibitedOperations: config.organizationPolicies.prohibitedOperations.length,
            maxConfidenceThreshold: config.organizationPolicies.maxConfidenceThreshold
          }
        }
      });
    },

    getTeamGovernanceConfig(teamId: string): TeamGovernanceConfig | null {
      const cached = teamConfigs.get(teamId);
      if (cached) return cached;

      // Load from vault
      const canonEntries = queryByLayer(vault, 'canon');
      const configEntry = canonEntries.find(
        (e) => e.type === 'team_governance_config' && (e as any).team_id === teamId
      );

      if (configEntry) {
        const config = JSON.parse((configEntry as any).config) as TeamGovernanceConfig;
        teamConfigs.set(teamId, config);
        return config;
      }

      return null;
    },

    submitForTeamValidation(entryId: string, teamId: string, operatorId: string): string {
      const auditLogger = getGlobalAuditLogger();
      const l3Entries = queryByLayer(vault, 'emerging');
      const entry = l3Entries.find((e) => e.id === entryId);

      if (!entry) {
        throw new GovernanceError(`Entry '${entryId}' not found in L3 (Emerging Knowledge).`);
      }

      const teamConfig = this.getTeamGovernanceConfig(teamId);
      if (!teamConfig) {
        throw new GovernanceError(`No governance configuration found for team '${teamId}'.`);
      }

      const patternType = entry.type;
      const workflow = teamConfig.customWorkflows?.[patternType] || {
        requiredValidators: 2,
        timeoutMinutes: 1440, // 24 hours default
      };

      // Check if pattern type is prohibited by organization policy
      if (teamConfig.organizationPolicies.prohibitedOperations.includes(patternType)) {
        throw new GovernanceError(`Pattern type '${patternType}' is prohibited by organization policy.`);
      }

      // Assign validators
      const availableValidators = teamConfig.customValidators || [];
      const assignedValidators = availableValidators.slice(0, workflow.requiredValidators);

      if (assignedValidators.length < workflow.requiredValidators) {
        throw new GovernanceError(
          `Insufficient validators available. Required: ${workflow.requiredValidators}, Available: ${assignedValidators.length}`
        );
      }

      const requestId = `val-req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const now = new Date().toISOString();
      const timeoutAt = new Date(Date.now() + workflow.timeoutMinutes * 60 * 1000).toISOString();

      const validationRequest: ValidationRequest = {
        entryId,
        teamId,
        patternType,
        requestedBy: operatorId,
        assignedValidators,
        createdAt: now,
        timeoutAt,
        status: 'pending',
        validations: [],
      };

      validationRequests.set(requestId, validationRequest);

      // Store in vault for persistence
      writeToLayer(vault, 'governance', 'working', {
        type: 'validation_request',
        id: requestId,
        name: `Validation Request: ${entry.name}`,
        validation_request: JSON.stringify(validationRequest),
        tags: ['governance', 'validation', `team:${teamId}`],
        status: 'active',
      } as Partial<Entity> & { type: string; name: string });

      // Log validation request submission
      auditLogger.logSecurityEvent({
        eventType: 'governance_decision',
        severity: 'info',
        operatorId,
        teamId,
        action: 'validation_requested',
        resource: `entry:${entryId}`,
        result: 'success',
        details: {
          validationRequestId: requestId,
          entryName: entry.name,
          entryType: entry.type,
          patternType,
          assignedValidators,
          requiredValidators: workflow.requiredValidators,
          timeoutMinutes: workflow.timeoutMinutes,
          timeoutAt
        }
      });

      return requestId;
    },

    listValidationRequests(teamId?: string, operatorId?: string): ValidationRequest[] {
      const requests = Array.from(validationRequests.values());

      return requests.filter((req) => {
        if (teamId && req.teamId !== teamId) return false;
        if (operatorId && !req.assignedValidators.includes(operatorId)) return false;
        return req.status === 'pending' || req.status === 'validating';
      });
    },

    submitValidation(
      requestId: string,
      validatorId: string,
      response: Omit<ValidationResponse, 'validatorId' | 'timestamp'>
    ): void {
      const auditLogger = getGlobalAuditLogger();
      const request = validationRequests.get(requestId);
      if (!request) {
        throw new GovernanceError(`Validation request '${requestId}' not found.`);
      }

      if (!request.assignedValidators.includes(validatorId)) {
        throw new GovernanceError(
          `Operator '${validatorId}' is not assigned to validate request '${requestId}'.`
        );
      }

      // Check if validator already submitted
      if (request.validations.some((v) => v.validatorId === validatorId)) {
        throw new GovernanceError(
          `Validator '${validatorId}' has already submitted validation for request '${requestId}'.`
        );
      }

      const validationResponse: ValidationResponse = {
        ...response,
        validatorId,
        timestamp: new Date().toISOString(),
      };

      request.validations.push(validationResponse);
      request.status = 'validating';

      // Update in vault
      const workingEntries = queryByLayer(vault, 'working');
      const requestEntry = workingEntries.find((e) => e.id === requestId);
      if (requestEntry) {
        vault.update(requestId, {
          validation_request: JSON.stringify(request),
        } as Partial<Entity>);
      }

      // Log validation submission
      auditLogger.logSecurityEvent({
        eventType: 'governance_decision',
        severity: 'info',
        operatorId: validatorId,
        teamId: request.teamId,
        action: 'validation_submitted',
        resource: `validation_request:${requestId}`,
        result: 'success',
        details: {
          validationRequestId: requestId,
          entryId: request.entryId,
          decision: response.decision,
          confidence: response.confidence,
          reasoning: response.reasoning,
          validationsReceived: request.validations.length,
          totalValidationsNeeded: request.assignedValidators.length
        }
      });
    },

    processTeamValidation(requestId: string): 'approved' | 'rejected' | 'pending' | 'timed_out' {
      const auditLogger = getGlobalAuditLogger();
      const request = validationRequests.get(requestId);
      if (!request) {
        throw new GovernanceError(`Validation request '${requestId}' not found.`);
      }

      const now = new Date();
      const timeoutDate = new Date(request.timeoutAt);

      // Check for timeout
      if (now > timeoutDate) {
        request.status = 'timed_out';

        auditLogger.logSecurityEvent({
          eventType: 'governance_decision',
          severity: 'warning',
          teamId: request.teamId,
          action: 'validation_timed_out',
          resource: `validation_request:${requestId}`,
          result: 'failure',
          details: {
            entryId: request.entryId,
            validationsReceived: request.validations.length,
            requiredValidations: workflow.requiredValidators,
            timeoutAt: request.timeoutAt,
            actualTimeout: now.toISOString()
          }
        });

        return 'timed_out';
      }

      const teamConfig = this.getTeamGovernanceConfig(request.teamId!);
      if (!teamConfig) {
        throw new GovernanceError(`Team configuration not found for team '${request.teamId}'.`);
      }

      const workflow = teamConfig.customWorkflows?.[request.patternType] || {
        requiredValidators: 2,
        timeoutMinutes: 1440,
      };

      // Check if we have enough validations
      if (request.validations.length < workflow.requiredValidators) {
        return 'pending';
      }

      // Determine consensus
      const approvals = request.validations.filter((v) => v.decision === 'approve').length;
      const rejections = request.validations.filter((v) => v.decision === 'reject').length;

      if (approvals >= Math.ceil(workflow.requiredValidators / 2)) {
        request.status = 'approved';

        auditLogger.logSecurityEvent({
          eventType: 'governance_decision',
          severity: 'info',
          teamId: request.teamId,
          action: 'validation_approved',
          resource: `validation_request:${requestId}`,
          result: 'success',
          details: {
            entryId: request.entryId,
            approvals,
            rejections,
            requiredValidators: workflow.requiredValidators,
            consensusThreshold: Math.ceil(workflow.requiredValidators / 2),
            validationDetails: request.validations.map(v => ({
              validatorId: v.validatorId,
              decision: v.decision,
              confidence: v.confidence
            }))
          }
        });

        return 'approved';
      } else if (rejections >= Math.ceil(workflow.requiredValidators / 2)) {
        request.status = 'rejected';

        auditLogger.logSecurityEvent({
          eventType: 'governance_decision',
          severity: 'info',
          teamId: request.teamId,
          action: 'validation_rejected',
          resource: `validation_request:${requestId}`,
          result: 'success',
          details: {
            entryId: request.entryId,
            approvals,
            rejections,
            requiredValidators: workflow.requiredValidators,
            consensusThreshold: Math.ceil(workflow.requiredValidators / 2),
            validationDetails: request.validations.map(v => ({
              validatorId: v.validatorId,
              decision: v.decision,
              confidence: v.confidence,
              reasoning: v.reasoning
            }))
          }
        });

        return 'rejected';
      }

      return 'pending';
    },
  };
}
