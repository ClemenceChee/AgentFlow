/**
 * Tests for outcome assertions via withGuards.
 */

import { describe, expect, it, vi } from 'vitest';
import { createGraphBuilder } from '../../packages/core/src/graph-builder.js';
import { withGuards } from '../../packages/core/src/guards.js';
import type { OutcomeAssertion } from '../../packages/core/src/types.js';

function testIdGenerator(): () => string {
  let counter = 0;
  return () => `test_${String(++counter).padStart(3, '0')}`;
}

describe('Outcome Assertions', () => {
  it('successful assertion — no violation', async () => {
    const logger = vi.fn();
    const builder = createGraphBuilder({ agentId: 'test', idGenerator: testIdGenerator() });
    const guarded = withGuards(builder, { onViolation: 'warn', logger });

    const root = guarded.startNode({ type: 'agent', name: 'main' });
    const tool = guarded.startNode({ type: 'tool', name: 'write-file', parentId: root });

    const assertions: OutcomeAssertion[] = [{ name: 'file-exists', verify: () => true }];

    await guarded.endNodeWithAssertions(tool, 'completed', assertions);
    guarded.endNode(root);

    // No outcome_mismatch logged
    const assertionCalls = logger.mock.calls.filter(
      (c: string[]) => c[0]?.includes('outcome_mismatch') || c[0]?.includes('file-exists'),
    );
    expect(assertionCalls).toHaveLength(0);
  });

  it('failed assertion — outcome_mismatch violation', async () => {
    const logger = vi.fn();
    const builder = createGraphBuilder({ agentId: 'test', idGenerator: testIdGenerator() });
    const guarded = withGuards(builder, { onViolation: 'warn', logger });

    const root = guarded.startNode({ type: 'agent', name: 'main' });
    const tool = guarded.startNode({ type: 'tool', name: 'write-file', parentId: root });

    const assertions: OutcomeAssertion[] = [{ name: 'file-exists', verify: () => false }];

    await guarded.endNodeWithAssertions(tool, 'completed', assertions);

    const assertionCalls = logger.mock.calls.filter((c: string[]) => c[0]?.includes('file-exists'));
    expect(assertionCalls.length).toBeGreaterThan(0);
  });

  it('assertion timeout — treated as failure', async () => {
    const logger = vi.fn();
    const builder = createGraphBuilder({ agentId: 'test', idGenerator: testIdGenerator() });
    const guarded = withGuards(builder, { onViolation: 'warn', logger });

    const root = guarded.startNode({ type: 'agent', name: 'main' });
    const tool = guarded.startNode({ type: 'tool', name: 'slow-check', parentId: root });

    const assertions: OutcomeAssertion[] = [
      {
        name: 'slow-verify',
        verify: () => new Promise((resolve) => setTimeout(() => resolve(true), 10000)),
        timeout: 50, // 50ms timeout
      },
    ];

    await guarded.endNodeWithAssertions(tool, 'completed', assertions);

    const timeoutCalls = logger.mock.calls.filter((c: string[]) => c[0]?.includes('slow-verify'));
    expect(timeoutCalls.length).toBeGreaterThan(0);
  });

  it('multiple assertions — only failed ones produce violations', async () => {
    const logger = vi.fn();
    const builder = createGraphBuilder({ agentId: 'test', idGenerator: testIdGenerator() });
    const guarded = withGuards(builder, { onViolation: 'warn', logger });

    const root = guarded.startNode({ type: 'agent', name: 'main' });
    const tool = guarded.startNode({ type: 'tool', name: 'multi-check', parentId: root });

    const assertions: OutcomeAssertion[] = [
      { name: 'check-a', verify: () => true },
      { name: 'check-b', verify: () => false },
      { name: 'check-c', verify: () => true },
    ];

    await guarded.endNodeWithAssertions(tool, 'completed', assertions);

    // Only check-b should produce a violation
    const failCalls = logger.mock.calls.filter((c: string[]) => c[0]?.includes('check-b'));
    expect(failCalls.length).toBeGreaterThan(0);

    const passCalls = logger.mock.calls.filter(
      (c: string[]) => c[0]?.includes('check-a') || c[0]?.includes('check-c'),
    );
    expect(passCalls).toHaveLength(0);
  });

  it('abort mode — assertion failure throws', async () => {
    const builder = createGraphBuilder({ agentId: 'test', idGenerator: testIdGenerator() });
    const guarded = withGuards(builder, { onViolation: 'abort' });

    const root = guarded.startNode({ type: 'agent', name: 'main' });
    const tool = guarded.startNode({ type: 'tool', name: 'critical-op', parentId: root });

    const assertions: OutcomeAssertion[] = [{ name: 'must-succeed', verify: () => false }];

    await expect(guarded.endNodeWithAssertions(tool, 'completed', assertions)).rejects.toThrow(
      /AgentFlow guard violation/,
    );
  });
});
