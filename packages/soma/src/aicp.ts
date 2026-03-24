/**
 * AICP (AI Control Plane) — Preflight evaluation.
 *
 * Evaluates an agent's execution context against the SOMA vault,
 * returning authorization decisions with warnings and recommendations.
 * Read-only against the vault — never creates entities.
 *
 * @module
 */

import type { PreflightResponse, PreflightWarning, PreflightRecommendation, Vault } from './types.js';
import { queryByLayer } from './layers.js';

const DEFAULT_FAILURE_RATE_THRESHOLD = 0.20;

/**
 * Evaluate preflight authorization for an agent.
 *
 * Reads the SOMA vault to check policies, constraints, and cross-agent
 * intelligence. Returns a decision with warnings and recommendations.
 * Non-blocking by default — only L4 canon with `enforcement: 'error'` blocks.
 */
export function evaluatePreflight(vault: Vault, agentId: string): PreflightResponse {
  const start = Date.now();

  // Look up agent entity
  const agents = vault.list('agent');
  const agent = agents.find(
    (a) => a.name === agentId || (a as Record<string, unknown>).agentId === agentId,
  );

  if (!agent) {
    return {
      proceed: true,
      warnings: [],
      recommendations: [{
        insight: `Agent '${agentId}' is not registered in the vault. Run the pipeline to create an agent profile.`,
        sourceAgents: [],
        confidence: 0,
      }],
      available: true,
      _meta: { durationMs: Date.now() - start },
    };
  }

  const data = agent as Record<string, unknown>;
  const failureRate = (data.failureRate as number) ?? 0;
  const totalExecutions = (data.totalExecutions as number) ?? 0;

  const warnings: PreflightWarning[] = [];
  const recommendations: PreflightRecommendation[] = [];
  let proceed = true;

  // Check failure rate threshold
  if (failureRate > DEFAULT_FAILURE_RATE_THRESHOLD && totalExecutions >= 5) {
    warnings.push({
      rule: 'max-failure-rate',
      threshold: DEFAULT_FAILURE_RATE_THRESHOLD,
      actual: failureRate,
      message: `Failure rate ${(failureRate * 100).toFixed(1)}% exceeds threshold ${(DEFAULT_FAILURE_RATE_THRESHOLD * 100).toFixed(0)}%`,
      source: 'agent-profile',
    });
  }

  // Check L4 canon enforcement policies
  const l4Entries = queryByLayer(vault, 'canon');
  for (const entry of l4Entries) {
    const eData = entry as Record<string, unknown>;
    if (eData.enforcement !== 'error') continue;

    // Check if this policy applies to the agent
    const scope = (eData.scope as string) ?? '';
    const body = entry.body + ' ' + entry.related.join(' ') + ' ' + scope;
    if (body.includes(agentId) || body.includes(agent.name) || scope === '*') {
      warnings.push({
        rule: entry.name,
        message: `L4 enforcement policy: ${entry.name}`,
        source: 'L4 canon',
      });
      proceed = false;
    }
  }

  // Check active constraints referencing the agent
  const constraints = vault.list('constraint');
  for (const c of constraints) {
    if (c.status !== 'active') continue;
    const body = c.body + ' ' + c.related.join(' ');
    if (body.includes(agentId) || body.includes(agent.name)) {
      warnings.push({
        rule: c.name,
        message: `Active constraint: ${c.name}`,
        source: c.layer ? `L${c.layer === 'emerging' ? '3' : c.layer === 'canon' ? '4' : '?'} ${c.layer}` : 'vault',
      });
    }
  }

  // Check L3 proposals referencing the agent (advisory only)
  const l3Entries = queryByLayer(vault, 'emerging');
  for (const entry of l3Entries) {
    if (entry.status !== 'pending') continue;
    const body = entry.body + ' ' + entry.related.join(' ');
    if (body.includes(agentId) || body.includes(agent.name)) {
      warnings.push({
        rule: entry.name,
        message: `Pending L3 proposal: ${entry.name}`,
        source: 'L3 emerging',
      });
      // L3 proposals never block — proceed stays true
    }
  }

  // Cross-agent recommendations — find divergent peers with better success rates
  for (const peer of agents) {
    if (peer.name === agent.name) continue;
    const peerData = peer as Record<string, unknown>;
    const peerRate = (peerData.failureRate as number) ?? 0;
    const peerExec = (peerData.totalExecutions as number) ?? 0;
    if (peerExec < 5) continue;

    const gap = failureRate - peerRate;
    if (gap >= 0.20) {
      // Find insights that reference both agents
      const insights = vault.list('insight');
      for (const insight of insights) {
        const sa = (insight as Record<string, unknown>).source_agents as string[] | undefined;
        if (sa && sa.includes(agentId) && sa.includes(peer.name)) {
          recommendations.push({
            insight: `${peer.name} has ${((1 - peerRate) * 100).toFixed(0)}% success rate. ${(insight as Record<string, unknown>).claim ?? insight.name}`,
            sourceAgents: sa,
            confidence: ((insight as Record<string, unknown>).confidence_score as number) ?? 0.5,
          });
        }
      }

      // If no specific insight, still recommend the peer
      if (recommendations.length === 0) {
        recommendations.push({
          insight: `Consider approach from ${peer.name} (${((1 - peerRate) * 100).toFixed(0)}% success vs your ${((1 - failureRate) * 100).toFixed(0)}%)`,
          sourceAgents: [peer.name],
          confidence: 0.5,
        });
      }
    }
  }

  return {
    proceed,
    warnings,
    recommendations,
    available: true,
    _meta: { durationMs: Date.now() - start },
  };
}
