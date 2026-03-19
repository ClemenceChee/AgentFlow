/**
 * Pure prompt construction functions for LLM-powered semantic analysis.
 *
 * Each function takes knowledge store data and returns a structured prompt string.
 * No side effects, no filesystem access, no external calls.
 *
 * @module
 */

import type { AgentProfile, ExecutionEvent, PatternEvent } from './types.js';

const ROLE =
  'You are analyzing execution data for an AI agent system. Provide clear, actionable analysis based on the data below.';

/**
 * Format a duration in ms to a human-readable string.
 */
function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Format an epoch timestamp to an ISO string.
 */
function fmtTime(ts: number): string {
  return new Date(ts).toISOString();
}

/**
 * Compute basic stats from an array of numbers.
 */
function durationStats(durations: readonly number[]): {
  avg: number;
  p50: number;
  p95: number;
  min: number;
  max: number;
} {
  if (durations.length === 0) return { avg: 0, p50: 0, p95: 0, min: 0, max: 0 };
  const sorted = [...durations].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    avg: Math.round(sum / sorted.length),
    p50: sorted[Math.floor(sorted.length * 0.5)] ?? 0,
    p95: sorted[Math.floor(sorted.length * 0.95)] ?? 0,
    min: sorted[0] ?? 0,
    max: sorted[sorted.length - 1] ?? 0,
  };
}

/**
 * Build a structured prompt for LLM analysis of agent failures.
 *
 * @param events - Recent failed execution events for the agent.
 * @param profile - The agent's derived profile.
 * @returns A structured prompt string.
 */
export function buildFailureAnalysisPrompt(
  events: ExecutionEvent[],
  profile: AgentProfile,
): string {
  const stats = durationStats(profile.recentDurations);

  const failureDetails = events
    .map((e, i) => {
      const lines = [
        `Failure ${i + 1}:`,
        `  Time: ${fmtTime(e.timestamp)}`,
        `  Duration: ${fmtDuration(e.duration)}`,
        `  Path: ${e.pathSignature}`,
      ];
      if (e.failurePoint) {
        lines.push(`  Failed at: ${e.failurePoint.nodeName} (${e.failurePoint.nodeType})`);
        if (e.failurePoint.error) lines.push(`  Error: ${e.failurePoint.error}`);
      }
      if (e.violations.length > 0) {
        lines.push(`  Violations: ${e.violations.map((v) => v.message).join('; ')}`);
      }
      return lines.join('\n');
    })
    .join('\n\n');

  return `${ROLE}

## Agent Profile
- Agent: ${profile.agentId}
- Total runs: ${profile.totalRuns}
- Failure rate: ${(profile.failureRate * 100).toFixed(1)}% (${profile.failureCount} failures / ${profile.totalRuns} total)
- Avg duration: ${fmtDuration(stats.avg)} (p50: ${fmtDuration(stats.p50)}, p95: ${fmtDuration(stats.p95)})
- Known bottlenecks: ${profile.knownBottlenecks.length > 0 ? profile.knownBottlenecks.join(', ') : 'none'}
- Last conformance score: ${profile.lastConformanceScore ?? 'N/A'}

## Recent Failures (${events.length})

${failureDetails}

## Question
Analyze these failures. What patterns do you see? What is the most likely root cause? Are these related or independent failures?`;
}

/**
 * Build a structured prompt for explaining why an execution was anomalous.
 *
 * @param event - The specific execution event flagged as anomalous.
 * @param profile - The agent's derived profile for baseline context.
 * @returns A structured prompt string.
 */
export function buildAnomalyExplanationPrompt(
  event: ExecutionEvent,
  profile: AgentProfile,
): string {
  const stats = durationStats(profile.recentDurations);

  const eventDetails = [
    `Time: ${fmtTime(event.timestamp)}`,
    `Status: ${event.status}`,
    `Duration: ${fmtDuration(event.duration)}`,
    `Path: ${event.pathSignature}`,
    `Node count: ${event.nodeCount}`,
  ];

  if (event.processContext) {
    eventDetails.push(`Conformance score: ${event.processContext.conformanceScore}`);
    eventDetails.push(`Is anomaly: ${event.processContext.isAnomaly}`);
    eventDetails.push(`Variant: ${event.processContext.variant}`);
  }
  if (event.failurePoint) {
    eventDetails.push(`Failed at: ${event.failurePoint.nodeName} (${event.failurePoint.nodeType})`);
    if (event.failurePoint.error) eventDetails.push(`Error: ${event.failurePoint.error}`);
  }
  if (event.violations.length > 0) {
    eventDetails.push(`Violations: ${event.violations.map((v) => v.message).join('; ')}`);
  }

  return `${ROLE}

## Agent Baseline (from profile)
- Agent: ${profile.agentId}
- Total runs: ${profile.totalRuns}
- Typical failure rate: ${(profile.failureRate * 100).toFixed(1)}%
- Typical duration: avg ${fmtDuration(stats.avg)}, p50 ${fmtDuration(stats.p50)}, p95 ${fmtDuration(stats.p95)}
- Last conformance score: ${profile.lastConformanceScore ?? 'N/A'}
- Known bottlenecks: ${profile.knownBottlenecks.length > 0 ? profile.knownBottlenecks.join(', ') : 'none'}

## Anomalous Execution
${eventDetails.join('\n')}

## Question
This execution has been flagged as anomalous. Explain what is unusual about it compared to the agent's typical behavior. What might have caused this deviation?`;
}

/**
 * Build a structured prompt for generating an agent health summary.
 *
 * @param profile - The agent's derived profile.
 * @param recentEvents - Recent execution events.
 * @param patterns - Recent pattern discovery events.
 * @returns A structured prompt string.
 */
export function buildAgentSummaryPrompt(
  profile: AgentProfile,
  recentEvents: ExecutionEvent[],
  patterns: PatternEvent[],
): string {
  const stats = durationStats(profile.recentDurations);

  const recentOutcomes = recentEvents
    .slice(0, 10)
    .map((e) => `  ${fmtTime(e.timestamp)} — ${e.eventType} (${fmtDuration(e.duration)})`)
    .join('\n');

  const patternSummary =
    patterns.length > 0
      ? patterns
          .slice(0, 3)
          .map((p) => {
            const lines = [
              `  Variants: ${p.pattern.variantCount} across ${p.pattern.totalGraphs} executions`,
              `  Top variant: ${p.pattern.topVariants[0]?.pathSignature ?? 'N/A'} (${p.pattern.topVariants[0]?.percentage.toFixed(0) ?? 0}%)`,
            ];
            if (p.pattern.topBottlenecks.length > 0) {
              const topB = p.pattern.topBottlenecks[0];
              if (topB)
                lines.push(`  Top bottleneck: ${topB.nodeName} (p95: ${fmtDuration(topB.p95)})`);
            }
            return lines.join('\n');
          })
          .join('\n\n')
      : '  No patterns discovered yet.';

  const dataNote =
    recentEvents.length === 0 && patterns.length === 0
      ? '\nNote: Limited data available. Summary is based only on the profile statistics.\n'
      : '';

  return `${ROLE}

## Agent Profile
- Agent: ${profile.agentId}
- Total runs: ${profile.totalRuns}
- Success rate: ${((1 - profile.failureRate) * 100).toFixed(1)}% (${profile.successCount} successes, ${profile.failureCount} failures)
- Duration: avg ${fmtDuration(stats.avg)}, p50 ${fmtDuration(stats.p50)}, p95 ${fmtDuration(stats.p95)}, range ${fmtDuration(stats.min)}–${fmtDuration(stats.max)}
- Known bottlenecks: ${profile.knownBottlenecks.length > 0 ? profile.knownBottlenecks.join(', ') : 'none'}
- Last conformance score: ${profile.lastConformanceScore ?? 'N/A'}
- Last pattern analysis: ${profile.lastPatternTimestamp ? fmtTime(profile.lastPatternTimestamp) : 'never'}
${dataNote}
## Recent Executions (last ${recentEvents.slice(0, 10).length})
${recentOutcomes || '  No recent events.'}

## Pattern Analysis
${patternSummary}

## Question
Provide a health summary for this agent. What are the key observations? Is the agent healthy, degrading, or in trouble? What should the operator pay attention to?`;
}

/**
 * Build a structured prompt for generating actionable fix recommendations.
 *
 * @param events - Recent failed execution events.
 * @param profile - The agent's derived profile.
 * @param patterns - Recent pattern discovery events.
 * @returns A structured prompt string.
 */
export function buildFixSuggestionPrompt(
  events: ExecutionEvent[],
  profile: AgentProfile,
  patterns: PatternEvent[],
): string {
  // Group failures by error message or path signature
  const failureGroups = new Map<string, ExecutionEvent[]>();
  for (const e of events) {
    const key = e.failurePoint?.error ?? e.pathSignature;
    const group = failureGroups.get(key) ?? [];
    group.push(e);
    failureGroups.set(key, group);
  }

  const failureGroupSummary = [...failureGroups.entries()]
    .map(([key, group]) => {
      const latest = group[0];
      return `  "${key}" — ${group.length} occurrence(s), latest at ${latest ? fmtTime(latest.timestamp) : 'unknown'}`;
    })
    .join('\n');

  const bottleneckDetails = patterns
    .flatMap((p) => p.pattern.topBottlenecks)
    .map((b) => `  ${b.nodeName} (${b.nodeType}) — p95: ${fmtDuration(b.p95)}`);
  const uniqueBottlenecks = [...new Set(bottleneckDetails)].join('\n');

  const conformanceIssues = events
    .filter((e) => e.processContext && e.processContext.conformanceScore < 0.8)
    .map(
      (e) =>
        `  ${fmtTime(e.timestamp)}: conformance ${e.processContext?.conformanceScore}, variant "${e.processContext?.variant}"`,
    )
    .join('\n');

  return `${ROLE}

## Agent Profile
- Agent: ${profile.agentId}
- Failure rate: ${(profile.failureRate * 100).toFixed(1)}%
- Known bottlenecks: ${profile.knownBottlenecks.length > 0 ? profile.knownBottlenecks.join(', ') : 'none'}

## Failure Patterns (${events.length} failures)
${failureGroupSummary || '  No failures recorded.'}

## Bottlenecks
${uniqueBottlenecks || '  No bottlenecks detected.'}

## Conformance Issues
${conformanceIssues || '  No conformance issues.'}

## Question
Based on the failure patterns, bottlenecks, and conformance issues above, provide specific, actionable recommendations to improve this agent's reliability and performance. Prioritize by impact.`;
}
