/**
 * Outcome assertions — post-action verification for agent write operations.
 *
 * @module
 */

import type { GuardViolation, GraphBuilder } from './types.js';
import type { GuardExplanation, OutcomeAssertion } from './types.js';
import type { NodeStatus } from 'agentflow-core';
import { withGuards } from 'agentflow-core';
import type { GuardConfig } from 'agentflow-core';

/**
 * Evaluate outcome assertions and return violations for failures.
 * Each assertion's verify() function is called with a configurable timeout.
 */
export async function evaluateAssertions(
  assertions: OutcomeAssertion[],
  nodeId: string,
  timestamp?: number,
): Promise<GuardViolation[]> {
  const now = timestamp ?? Date.now();
  const violations: GuardViolation[] = [];

  for (const assertion of assertions) {
    const timeoutMs = assertion.timeout ?? 5000;
    try {
      const result = await Promise.race([
        Promise.resolve(assertion.verify()),
        new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), timeoutMs)),
      ]);

      if (result === 'timeout' || result === false) {
        const explanation: GuardExplanation = {
          rule: assertion.name,
          threshold: 'pass',
          actual: result === 'timeout' ? 'timeout' : 'fail',
          source: 'assertion',
        };
        violations.push({
          type: 'outcome_mismatch',
          nodeId,
          message: `Assertion '${assertion.name}' ${result === 'timeout' ? 'timed out' : 'failed'}. Source: assertion.`,
          timestamp: now,
          explanation,
        });
      }
    } catch {
      const explanation: GuardExplanation = {
        rule: assertion.name,
        threshold: 'pass',
        actual: 'error',
        source: 'assertion',
      };
      violations.push({
        type: 'outcome_mismatch',
        nodeId,
        message: `Assertion '${assertion.name}' threw an error. Source: assertion.`,
        timestamp: now,
        explanation,
      });
    }
  }

  return violations;
}

/** Extended builder with assertion support (SOMA premium). */
export interface SomaGuardedBuilder extends GraphBuilder {
  endNodeWithAssertions(nodeId: string, status: NodeStatus | undefined, assertions: OutcomeAssertion[]): Promise<void>;
}

/**
 * Create a guarded graph builder with outcome assertion support.
 * Wraps AgentFlow's withGuards and adds endNodeWithAssertions.
 */
export function createGuardedBuilder(
  builder: GraphBuilder,
  config?: GuardConfig,
): SomaGuardedBuilder {
  const guarded = withGuards(builder, config);
  const logger = config?.logger ?? ((msg: string) => console.warn(`[SOMA Guard] ${msg}`));
  const onViolation = config?.onViolation ?? 'warn';

  function handleViolations(violations: readonly GuardViolation[]): void {
    for (const violation of violations) {
      const message = `Guard violation: ${violation.message}`;
      switch (onViolation) {
        case 'warn':
          logger(message);
          break;
        case 'error':
          logger(message);
          break;
        case 'abort':
          throw new Error(`AgentFlow guard violation: ${violation.message}`);
      }
    }
  }

  return {
    ...guarded,

    async endNodeWithAssertions(
      nodeId: string,
      status: NodeStatus | undefined,
      assertions: OutcomeAssertion[],
    ): Promise<void> {
      guarded.endNode(nodeId, status);

      // Evaluate assertions after status is set
      const assertionViolations = await evaluateAssertions(assertions, nodeId);
      handleViolations(assertionViolations);
    },
  };
}
