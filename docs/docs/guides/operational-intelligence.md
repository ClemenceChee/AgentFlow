---
sidebar_position: 7
title: Operational Intelligence
---

# Operational Intelligence

Operational Intelligence is the per-run enforcement and visibility layer for AgentFlow. It turns every agent execution into an auditable, scored, explainable event.

SOMA discovers thresholds from execution history. Operational Intelligence enforces them per-run and explains why.

:::caution Not Yet Implemented
The features described here are specified (68 tasks) but not yet implemented. The API examples show the planned interface. Pin to a specific version once these ship.
:::

## The Six Features

### 1. Outcome Assertions

Declare what success looks like before a run starts. Verify after.

```typescript
import { assertOutcome } from '@agentflow/ops-intel';

const run = await agentflow.execute(graph, {
  assertions: [
    assertOutcome('response.status', 'equals', 200),
    assertOutcome('result.confidence', 'greaterThan', 0.85),
    assertOutcome('duration', 'lessThan', 30_000),
  ],
});

// run.assertions => [
//   { field: 'response.status', expected: 200, actual: 200, passed: true },
//   { field: 'result.confidence', expected: '>0.85', actual: 0.92, passed: true },
//   { field: 'duration', expected: '<30000', actual: 12400, passed: true },
// ]
```

### 2. Efficiency Scoring

Compare actual resource usage against SOMA-derived baselines. Score each run on a 0-100 scale across multiple dimensions.

```typescript
import { computeEfficiency } from '@agentflow/ops-intel';

const score = await computeEfficiency(graph, {
  baselines: 'soma',  // pull baselines from SOMA vault
});

// score => {
//   overall: 78,
//   dimensions: {
//     tokens: { score: 85, actual: 3200, baseline: 2800 },
//     latency: { score: 92, actual: 1200, baseline: 1500 },
//     toolCalls: { score: 58, actual: 14, baseline: 8 },
//   },
//   flags: ['toolCalls: 75% above baseline'],
// }
```

### 3. Run Receipts

Immutable per-run records. What happened, what it cost, whether it passed. Suitable for compliance logging and cost attribution.

```typescript
import { generateReceipt } from '@agentflow/ops-intel';

const receipt = await generateReceipt(graph);

// receipt => {
//   id: 'receipt-2026-03-21-a8f3c',
//   graphId: 'graph-1234',
//   startedAt: '2026-03-21T14:30:00Z',
//   completedAt: '2026-03-21T14:30:12Z',
//   status: 'success',
//   cost: { tokens: 3200, estimatedUSD: 0.0048 },
//   assertions: { passed: 3, failed: 0 },
//   efficiency: { overall: 78 },
//   guards: { triggered: 1, blocked: 0 },
//   modelUsage: [{ model: 'claude-sonnet-4-20250514', tokens: 3200 }],
// }
```

### 4. Drift Detection

Compare current execution patterns against historical baselines from SOMA. Flag when behavior diverges beyond configured thresholds.

```typescript
import { detectDrift } from '@agentflow/ops-intel';

const drift = await detectDrift(graph, {
  window: '7d',           // compare against last 7 days
  threshold: 0.15,        // flag if >15% deviation
  dimensions: ['tokens', 'latency', 'errorRate', 'toolCallPattern'],
});

// drift => {
//   hasDrift: true,
//   details: [
//     {
//       dimension: 'toolCallPattern',
//       deviation: 0.32,
//       description: 'Tool call sequence diverged 32% from 7-day baseline',
//       baselineVariant: 'variant-A (fetch->parse->store)',
//       actualVariant: 'variant-C (fetch->retry->fetch->parse->store)',
//     },
//   ],
// }
```

### 5. Guard Explainability

When a guard blocks or modifies a run, explain why in human-readable terms. Trace the explanation back to the SOMA knowledge that informed the guard's policy.

```typescript
import { explainGuard } from '@agentflow/ops-intel';

const explanation = await explainGuard(guardResult);

// explanation => {
//   guard: 'failureRateGuard',
//   action: 'blocked',
//   reason: 'Recent failure rate for agent "data-sync" is 0.45, above threshold 0.30',
//   source: {
//     type: 'soma-policy',
//     entity: 'vault://policies/data-sync-failure-threshold.md',
//     promotedAt: '2026-03-18T09:00:00Z',
//     evidence: [
//       'vault://executions/data-sync-2026-03-15.md',
//       'vault://executions/data-sync-2026-03-16.md',
//     ],
//   },
//   suggestion: 'Investigate weekend API latency pattern identified in vault://insights/weekend-api-slowdown.md',
// }
```

### 6. Model Fallback Tracking

Record when and why a model fallback occurred, and whether the fallback degraded output quality.

```typescript
import { trackFallbacks } from '@agentflow/ops-intel';

const fallbacks = await trackFallbacks(graph);

// fallbacks => {
//   occurred: true,
//   events: [
//     {
//       step: 'analyze',
//       requestedModel: 'claude-opus-4-20250514',
//       actualModel: 'claude-sonnet-4-20250514',
//       reason: 'rate_limit',
//       qualityImpact: 'unknown',  // or 'degraded' | 'equivalent' if assertion data exists
//       timestamp: '2026-03-21T14:30:02Z',
//     },
//   ],
//   summary: '1 fallback across 8 steps. No quality assertions available to measure impact.',
// }
```

## Relationship to SOMA

Operational Intelligence and SOMA are complementary layers in the [full stack architecture](../experimental/soma/overview.md):

- **SOMA** operates across runs (hours to days). It ingests execution data, synthesizes patterns, and promotes policies. It answers: "What have we learned?"
- **Ops Intel** operates within a single run (milliseconds to seconds). It enforces thresholds, scores efficiency, and explains decisions. It answers: "How did this run perform, and why?"

SOMA discovers that a particular agent's token usage baseline is 2,800 tokens per run. Ops Intel uses that baseline to score the next run's efficiency at 85/100. SOMA discovers that weekend API latency causes failures. Ops Intel detects drift when the next Monday run shows the same pattern emerging on a Wednesday.

The feedback loop: SOMA learns from many runs, Ops Intel acts on each run, and each run's receipt feeds back into SOMA for the next learning cycle.
