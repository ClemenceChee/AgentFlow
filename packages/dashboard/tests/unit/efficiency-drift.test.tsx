/**
 * @vitest-environment jsdom
 */

import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DriftChart } from '../../src/client/components/DriftChart';
import { EfficiencyPanel } from '../../src/client/components/EfficiencyPanel';

// ---------------------------------------------------------------------------
// EfficiencyPanel
// ---------------------------------------------------------------------------

describe('EfficiencyPanel', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders aggregate stats', async () => {
    const mockReport = {
      runs: [
        {
          graphId: 'g1',
          agentId: 'a1',
          totalTokenCost: 1000,
          completedNodes: 10,
          costPerNode: 100,
        },
      ],
      aggregate: { mean: 120, median: 95, p95: 340 },
      flags: [],
      dataCoverage: 0.85,
    };

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockReport),
      }),
    );

    render(<EfficiencyPanel apiBase="http://localhost:3000" />);

    await waitFor(() => {
      expect(screen.getByText('120')).toBeTruthy();
    });

    expect(screen.getByText('95')).toBeTruthy();
    expect(screen.getByText('340')).toBeTruthy();
    expect(screen.getByText('85%')).toBeTruthy();
    expect(screen.getByText('Cost Efficiency')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// DriftChart
// ---------------------------------------------------------------------------

describe('DriftChart', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders SVG with correct number of data points', async () => {
    const points = [
      { timestamp: 1000, score: 0.9 },
      { timestamp: 2000, score: 0.85 },
      { timestamp: 3000, score: 0.8 },
      { timestamp: 4000, score: 0.75 },
    ];

    const driftData = {
      drift: {
        status: 'degrading',
        slope: -0.05,
        r2: 0.95,
        windowSize: 4,
        dataPoints: 4,
      },
      points,
    };

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(driftData),
      }),
    );

    const { container } = render(
      <DriftChart apiBase="http://localhost:3000" agentId="test-agent" />,
    );

    await waitFor(() => {
      expect(screen.getByText('Degrading')).toBeTruthy();
    });

    // Verify SVG circles = number of data points
    const circles = container.querySelectorAll('circle');
    expect(circles.length).toBe(4);

    // Verify slope/R2 stats displayed
    expect(screen.getByText(/Slope:/)).toBeTruthy();
    expect(screen.getByText(/4 points/)).toBeTruthy();
  });

  it('shows needs-more-data label when insufficient', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            drift: { status: 'insufficient_data', slope: 0, r2: 0, windowSize: 0, dataPoints: 3 },
            points: [],
          }),
      }),
    );

    render(<DriftChart apiBase="http://localhost:3000" agentId="test-agent" />);

    await waitFor(() => {
      expect(screen.getByText(/Needs more data/)).toBeTruthy();
    });
  });
});
