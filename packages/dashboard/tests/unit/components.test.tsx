/**
 * @vitest-environment jsdom
 */

import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { GuardExplanationCard } from '../../src/client/components/GuardExplanationCard';
import { RunReceiptView } from '../../src/client/components/RunReceiptView';
import { VariantExplorer } from '../../src/client/components/VariantExplorer';
import type { ProcessVariant } from '../../src/client/hooks/useProcessModel';
import type { FullTrace } from '../../src/client/hooks/useSelectedTrace';

afterEach(() => cleanup());

// ---------------------------------------------------------------------------
// GuardExplanationCard
// ---------------------------------------------------------------------------

describe('GuardExplanationCard', () => {
  it('renders all explanation fields', () => {
    const violation = {
      type: 'policy',
      nodeId: 'n1',
      message: 'Failure rate too high',
      timestamp: Date.now(),
      explanation: {
        rule: 'max-failure-rate',
        threshold: 0.3,
        actual: 0.75,
        source: 'soma-policy' as const,
        evidence: 'Based on last 50 executions',
      },
    };

    const { container } = render(<GuardExplanationCard violation={violation} />);

    expect(screen.getByText('max-failure-rate')).toBeTruthy();
    expect(screen.getByText('SOMA Policy')).toBeTruthy();
    expect(screen.getByText('0.75')).toBeTruthy();
    expect(screen.getByText('Based on last 50 executions')).toBeTruthy();

    // Verify source badge class
    const badge = container.querySelector('.guard-card__source');
    expect(badge?.className).toContain('guard-source--soma');

    // Verify threshold display
    const threshold = container.querySelector('.guard-card__threshold');
    expect(threshold?.textContent).toContain('0.3');
  });

  it('degrades gracefully without explanation', () => {
    const violation = {
      type: 'timeout',
      nodeId: 'n2',
      message: 'Node exceeded 30s timeout',
      timestamp: Date.now(),
    };

    const { container } = render(<GuardExplanationCard violation={violation} />);

    expect(screen.getByText('timeout')).toBeTruthy();
    expect(screen.getByText('Node exceeded 30s timeout')).toBeTruthy();
    // No explanation-specific elements
    expect(container.querySelector('.guard-card__comparison')).toBeNull();
    expect(container.querySelector('.guard-card__evidence')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// RunReceiptView
// ---------------------------------------------------------------------------

describe('RunReceiptView', () => {
  it('renders step table with correct rows', () => {
    const trace: FullTrace = {
      id: 'run-123',
      agentId: 'test-agent',
      name: 'Test Run',
      trigger: 'manual',
      status: 'completed',
      startTime: 1000,
      endTime: 4500,
      filename: 'trace.json',
      nodes: {
        a: {
          id: 'a',
          type: 'startNode',
          name: 'Start',
          startTime: 1000,
          endTime: 1500,
          status: 'completed',
          parentId: null,
          children: [],
          metadata: {},
          state: {},
        },
        b: {
          id: 'b',
          type: 'llmNode',
          name: 'Analyze',
          startTime: 1500,
          endTime: 3500,
          status: 'completed',
          parentId: null,
          children: [],
          metadata: { semantic: { tokenCost: 1200 } },
          state: {},
        },
        c: {
          id: 'c',
          type: 'endNode',
          name: 'End',
          startTime: 3500,
          endTime: 4500,
          status: 'failed',
          parentId: null,
          children: [],
          metadata: {},
          state: { error: 'timeout' },
        },
      },
      edges: [],
      metadata: {},
      sessionEvents: [],
    };

    const { container } = render(<RunReceiptView trace={trace} />);

    // Header info
    expect(screen.getByText('run-123')).toBeTruthy();
    expect(screen.getByText('test-agent')).toBeTruthy();

    // Step names in table
    expect(screen.getByText('Start')).toBeTruthy();
    expect(screen.getByText('Analyze')).toBeTruthy();
    expect(screen.getByText('End')).toBeTruthy();

    // 3 rows in tbody
    const rows = container.querySelectorAll('tbody tr');
    expect(rows.length).toBe(3);

    // Summary counts via container queries
    const summaryItems = container.querySelectorAll('.receipt__summary-item');
    expect(summaryItems[0]?.textContent).toContain('3');
    expect(summaryItems[1]?.textContent).toContain('2');
    expect(summaryItems[2]?.textContent).toContain('1');

    // Token cost column header and value
    expect(screen.getByText('Tokens')).toBeTruthy();
    expect(screen.getByText('1,200')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// VariantExplorer
// ---------------------------------------------------------------------------

describe('VariantExplorer', () => {
  const pathVariants: ProcessVariant[] = [
    { pathSignature: 'Start → Analyze → End', count: 8, percentage: 80 },
    { pathSignature: 'Start → Retry → End', count: 2, percentage: 20 },
  ];

  const modelVars: ProcessVariant[] = [
    {
      pathSignature: 'Start → Analyze → End|model:gpt-4',
      count: 5,
      percentage: 50,
    },
    {
      pathSignature: 'Start → Analyze → End|model:claude-3',
      count: 5,
      percentage: 50,
    },
  ];

  it('shows path variants by default', () => {
    render(<VariantExplorer variants={pathVariants} modelVariants={modelVars} isPro />);

    expect(screen.getByText('Happy Path')).toBeTruthy();
    expect(screen.getByText(/80\.0%/)).toBeTruthy();
  });

  it('toggles to model-aware variants when checkbox clicked', async () => {
    render(<VariantExplorer variants={pathVariants} modelVariants={modelVars} isPro />);

    // Initially shows path variants
    expect(screen.getByText(/80\.0%/)).toBeTruthy();

    // Click the "By Model" toggle
    const checkbox = screen.getByRole('checkbox');
    await userEvent.click(checkbox);

    // Now shows model variants with model badges
    expect(screen.getByText('gpt-4')).toBeTruthy();
    expect(screen.getByText('claude-3')).toBeTruthy();
    expect(screen.getAllByText(/50\.0%/)).toHaveLength(2);
  });

  it('hides toggle when not pro', () => {
    render(<VariantExplorer variants={pathVariants} />);

    expect(screen.queryByRole('checkbox')).toBeNull();
  });
});
