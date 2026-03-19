import type { AgentProfile, ExecutionEvent, PatternEvent } from 'agentflow-core';
import {
  buildFailureAnalysisPrompt,
  buildAnomalyExplanationPrompt,
  buildAgentSummaryPrompt,
  buildFixSuggestionPrompt,
} from 'agentflow-core';
import { describe, expect, it } from 'vitest';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeProfile(overrides: Partial<AgentProfile> = {}): AgentProfile {
  return {
    agentId: 'test-agent',
    totalRuns: 100,
    successCount: 90,
    failureCount: 10,
    failureRate: 0.1,
    recentDurations: [500, 600, 700, 800, 900, 1000, 1100, 1200, 1500, 2000],
    lastConformanceScore: 0.95,
    knownBottlenecks: ['fetch-data', 'parse-response'],
    lastPatternTimestamp: 1773671702828,
    updatedAt: '2026-03-14T10:00:00.000Z',
    ...overrides,
  };
}

function makeFailedEvent(overrides: Partial<ExecutionEvent> = {}): ExecutionEvent {
  return {
    eventType: 'execution.failed',
    graphId: 'g1',
    agentId: 'test-agent',
    timestamp: 1773671702828,
    schemaVersion: 1,
    status: 'failed',
    duration: 5000,
    nodeCount: 3,
    pathSignature: 'agent:main→tool:fetch→tool:parse',
    failurePoint: {
      nodeId: 'n2',
      nodeName: 'fetch',
      nodeType: 'tool',
      error: 'Connection timeout',
    },
    violations: [],
    ...overrides,
  };
}

function makeCompletedEvent(overrides: Partial<ExecutionEvent> = {}): ExecutionEvent {
  return {
    eventType: 'execution.completed',
    graphId: 'g2',
    agentId: 'test-agent',
    timestamp: 1773671802828,
    schemaVersion: 1,
    status: 'completed',
    duration: 1200,
    nodeCount: 3,
    pathSignature: 'agent:main→tool:fetch→tool:parse',
    violations: [],
    ...overrides,
  };
}

function makePatternEvent(overrides: Partial<PatternEvent> = {}): PatternEvent {
  return {
    eventType: 'pattern.discovered',
    agentId: 'test-agent',
    timestamp: 1773671702828,
    schemaVersion: 1,
    pattern: {
      totalGraphs: 50,
      variantCount: 3,
      topVariants: [
        { pathSignature: 'agent:main→tool:fetch→tool:parse', count: 40, percentage: 80 },
        { pathSignature: 'agent:main→tool:fetch', count: 8, percentage: 16 },
      ],
      topBottlenecks: [
        { nodeName: 'fetch-data', nodeType: 'tool', p95: 3000 },
        { nodeName: 'parse-response', nodeType: 'tool', p95: 1500 },
      ],
      processModel: { transitions: [], nodeTypes: new Map() },
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Prompt Builders', () => {
  describe('buildFailureAnalysisPrompt', () => {
    it('includes role instruction', () => {
      const prompt = buildFailureAnalysisPrompt([makeFailedEvent()], makeProfile());
      expect(prompt).toContain('You are analyzing execution data');
    });

    it('includes agent profile data', () => {
      const prompt = buildFailureAnalysisPrompt([makeFailedEvent()], makeProfile());
      expect(prompt).toContain('test-agent');
      expect(prompt).toContain('10.0%');
      expect(prompt).toContain('fetch-data');
    });

    it('includes failure details', () => {
      const prompt = buildFailureAnalysisPrompt([makeFailedEvent()], makeProfile());
      expect(prompt).toContain('Connection timeout');
      expect(prompt).toContain('fetch');
      expect(prompt).toContain('tool');
    });

    it('includes multiple failures', () => {
      const events = [
        makeFailedEvent({ timestamp: 1000 }),
        makeFailedEvent({ timestamp: 2000, failurePoint: { nodeId: 'n3', nodeName: 'parse', nodeType: 'tool', error: 'Invalid JSON' } }),
      ];
      const prompt = buildFailureAnalysisPrompt(events, makeProfile());
      expect(prompt).toContain('Failure 1');
      expect(prompt).toContain('Failure 2');
      expect(prompt).toContain('Connection timeout');
      expect(prompt).toContain('Invalid JSON');
    });

    it('includes analysis question', () => {
      const prompt = buildFailureAnalysisPrompt([makeFailedEvent()], makeProfile());
      expect(prompt).toContain('root cause');
    });

    it('is a pure function (same inputs, same output)', () => {
      const events = [makeFailedEvent()];
      const profile = makeProfile();
      const prompt1 = buildFailureAnalysisPrompt(events, profile);
      const prompt2 = buildFailureAnalysisPrompt(events, profile);
      expect(prompt1).toBe(prompt2);
    });
  });

  describe('buildAnomalyExplanationPrompt', () => {
    it('includes baseline and anomalous event data', () => {
      const event = makeFailedEvent({
        processContext: { conformanceScore: 0.4, isAnomaly: true, variant: 'rare-path' },
      });
      const prompt = buildAnomalyExplanationPrompt(event, makeProfile());
      expect(prompt).toContain('Anomalous Execution');
      expect(prompt).toContain('0.4');
      expect(prompt).toContain('rare-path');
      expect(prompt).toContain('Agent Baseline');
    });

    it('includes duration context from profile', () => {
      const event = makeCompletedEvent({ duration: 30000 });
      const prompt = buildAnomalyExplanationPrompt(event, makeProfile());
      expect(prompt).toContain('30.0s');
      expect(prompt).toContain('Typical duration');
    });

    it('asks about deviation', () => {
      const prompt = buildAnomalyExplanationPrompt(makeCompletedEvent(), makeProfile());
      expect(prompt).toContain('unusual');
    });
  });

  describe('buildAgentSummaryPrompt', () => {
    it('includes profile, events, and patterns', () => {
      const prompt = buildAgentSummaryPrompt(
        makeProfile(),
        [makeCompletedEvent(), makeFailedEvent()],
        [makePatternEvent()],
      );
      expect(prompt).toContain('Agent Profile');
      expect(prompt).toContain('Recent Executions');
      expect(prompt).toContain('Pattern Analysis');
      expect(prompt).toContain('health summary');
    });

    it('notes limited data when no events or patterns', () => {
      const prompt = buildAgentSummaryPrompt(makeProfile(), [], []);
      expect(prompt).toContain('Limited data');
    });

    it('includes pattern details when available', () => {
      const prompt = buildAgentSummaryPrompt(makeProfile(), [], [makePatternEvent()]);
      expect(prompt).toContain('Variants: 3');
      expect(prompt).toContain('fetch-data');
    });
  });

  describe('buildFixSuggestionPrompt', () => {
    it('groups failures by error type', () => {
      const events = [
        makeFailedEvent({ failurePoint: { nodeId: 'n1', nodeName: 'fetch', nodeType: 'tool', error: 'timeout' } }),
        makeFailedEvent({ failurePoint: { nodeId: 'n1', nodeName: 'fetch', nodeType: 'tool', error: 'timeout' }, timestamp: 2000 }),
        makeFailedEvent({ failurePoint: { nodeId: 'n2', nodeName: 'parse', nodeType: 'tool', error: 'invalid json' } }),
      ];
      const prompt = buildFixSuggestionPrompt(events, makeProfile(), []);
      expect(prompt).toContain('"timeout" — 2 occurrence');
      expect(prompt).toContain('"invalid json" — 1 occurrence');
    });

    it('includes bottleneck details from patterns', () => {
      const prompt = buildFixSuggestionPrompt([], makeProfile(), [makePatternEvent()]);
      expect(prompt).toContain('fetch-data');
      expect(prompt).toContain('p95');
    });

    it('includes conformance issues', () => {
      const events = [
        makeFailedEvent({
          processContext: { conformanceScore: 0.5, isAnomaly: true, variant: 'bad-path' },
        }),
      ];
      const prompt = buildFixSuggestionPrompt(events, makeProfile(), []);
      expect(prompt).toContain('conformance 0.5');
    });

    it('asks for prioritized recommendations', () => {
      const prompt = buildFixSuggestionPrompt([makeFailedEvent()], makeProfile(), []);
      expect(prompt).toContain('Prioritize by impact');
    });
  });

  describe('prompt structure consistency', () => {
    it('all prompts contain role instruction', () => {
      const role = 'You are analyzing execution data';
      expect(buildFailureAnalysisPrompt([makeFailedEvent()], makeProfile())).toContain(role);
      expect(buildAnomalyExplanationPrompt(makeCompletedEvent(), makeProfile())).toContain(role);
      expect(buildAgentSummaryPrompt(makeProfile(), [], [])).toContain(role);
      expect(buildFixSuggestionPrompt([], makeProfile(), [])).toContain(role);
    });

    it('all prompts contain a Question section', () => {
      expect(buildFailureAnalysisPrompt([makeFailedEvent()], makeProfile())).toContain('## Question');
      expect(buildAnomalyExplanationPrompt(makeCompletedEvent(), makeProfile())).toContain('## Question');
      expect(buildAgentSummaryPrompt(makeProfile(), [], [])).toContain('## Question');
      expect(buildFixSuggestionPrompt([], makeProfile(), [])).toContain('## Question');
    });
  });
});
