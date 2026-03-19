/**
 * LLM-powered semantic analysis engine for agent execution data.
 *
 * The insight engine reads from the knowledge store, constructs prompts via
 * pure prompt builder functions, delegates to a user-provided AnalysisFn,
 * and caches results as InsightEvents in the store.
 *
 * @module
 */

import {
  buildAgentSummaryPrompt,
  buildAnomalyExplanationPrompt,
  buildFailureAnalysisPrompt,
  buildFixSuggestionPrompt,
} from './prompt-builder.js';
import type {
  AnalysisFn,
  ExecutionEvent,
  InsightEngine,
  InsightEngineConfig,
  InsightEvent,
  InsightResult,
  KnowledgeStore,
} from './types.js';

const DEFAULT_CACHE_TTL_MS = 3_600_000; // 1 hour
const SCHEMA_VERSION = 1;

/**
 * Simple string hash for cache identity. Not cryptographic — just deterministic.
 */
function simpleHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return (hash >>> 0).toString(36);
}

/**
 * Create an LLM-powered semantic analysis engine.
 *
 * @param store - The knowledge store to read data from and cache insights to.
 * @param analysisFn - User-provided LLM function (prompt → response).
 * @param config - Optional configuration (cache TTL).
 * @returns An InsightEngine for semantic analysis of agent execution data.
 *
 * @example
 * ```ts
 * const engine = createInsightEngine(store, async (prompt) => {
 *   return await myLlm.complete(prompt);
 * });
 * const result = await engine.explainFailures('my-agent');
 * console.log(result.content);
 * ```
 */
export function createInsightEngine(
  store: KnowledgeStore,
  analysisFn: AnalysisFn,
  config?: InsightEngineConfig,
): InsightEngine {
  const cacheTtlMs = config?.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;

  /**
   * Check the cache for a matching insight. Returns the cached response or null.
   */
  function checkCache(
    agentId: string,
    insightType: InsightEvent['insightType'],
    dataHash: string,
  ): InsightEvent | null {
    const recent = store.getRecentInsights(agentId, { type: insightType, limit: 1 });
    if (recent.length === 0) return null;

    const cached = recent[0];
    if (!cached || cached.dataHash !== dataHash) return null;

    const age = Date.now() - cached.timestamp;
    if (age >= cacheTtlMs) return null;

    return cached;
  }

  /**
   * Store an insight event and return the InsightResult.
   */
  function storeAndReturn(
    agentId: string,
    insightType: InsightEvent['insightType'],
    prompt: string,
    response: string,
    dataHash: string,
  ): InsightResult {
    const event: InsightEvent = {
      eventType: 'insight.generated',
      agentId,
      timestamp: Date.now(),
      schemaVersion: SCHEMA_VERSION,
      insightType,
      prompt,
      response,
      dataHash,
    };
    store.appendInsight(event);

    return {
      agentId,
      insightType,
      content: response,
      cached: false,
      timestamp: event.timestamp,
    };
  }

  /**
   * Return a result without calling the LLM (for insufficient data or cache hits).
   */
  function shortCircuit(
    agentId: string,
    insightType: InsightEvent['insightType'],
    content: string,
    cached: boolean,
    timestamp?: number,
  ): InsightResult {
    return { agentId, insightType, content, cached, timestamp: timestamp ?? Date.now() };
  }

  return {
    async explainFailures(agentId: string): Promise<InsightResult> {
      const profile = store.getAgentProfile(agentId);
      if (!profile) {
        return shortCircuit(
          agentId,
          'failure-analysis',
          'No data available for this agent.',
          false,
        );
      }

      const events = store.getRecentEvents(agentId, { limit: 50 });
      const failures = events.filter((e) => e.eventType === 'execution.failed');
      if (failures.length === 0) {
        return shortCircuit(
          agentId,
          'failure-analysis',
          'No recent failures found for this agent.',
          false,
        );
      }

      const dataHash = simpleHash(JSON.stringify({ failures, profile }));

      const cached = checkCache(agentId, 'failure-analysis', dataHash);
      if (cached) {
        return shortCircuit(agentId, 'failure-analysis', cached.response, true, cached.timestamp);
      }

      const prompt = buildFailureAnalysisPrompt(failures, profile);

      try {
        const response = await analysisFn(prompt);
        return storeAndReturn(agentId, 'failure-analysis', prompt, response, dataHash);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return shortCircuit(agentId, 'failure-analysis', `Analysis failed: ${message}`, false);
      }
    },

    async explainAnomaly(agentId: string, event: ExecutionEvent): Promise<InsightResult> {
      const profile = store.getAgentProfile(agentId);
      if (!profile) {
        return shortCircuit(
          agentId,
          'anomaly-explanation',
          'No data available for this agent.',
          false,
        );
      }

      const dataHash = simpleHash(JSON.stringify({ event, profile }));

      const cached = checkCache(agentId, 'anomaly-explanation', dataHash);
      if (cached) {
        return shortCircuit(
          agentId,
          'anomaly-explanation',
          cached.response,
          true,
          cached.timestamp,
        );
      }

      const prompt = buildAnomalyExplanationPrompt(event, profile);

      try {
        const response = await analysisFn(prompt);
        return storeAndReturn(agentId, 'anomaly-explanation', prompt, response, dataHash);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return shortCircuit(agentId, 'anomaly-explanation', `Analysis failed: ${message}`, false);
      }
    },

    async summarizeAgent(agentId: string): Promise<InsightResult> {
      const profile = store.getAgentProfile(agentId);
      if (!profile) {
        return shortCircuit(agentId, 'agent-summary', 'No data available for this agent.', false);
      }

      const recentEvents = store.getRecentEvents(agentId, { limit: 20 });
      const patterns = store.getPatternHistory(agentId, { limit: 5 });

      const dataHash = simpleHash(JSON.stringify({ profile, recentEvents, patterns }));

      const cached = checkCache(agentId, 'agent-summary', dataHash);
      if (cached) {
        return shortCircuit(agentId, 'agent-summary', cached.response, true, cached.timestamp);
      }

      const prompt = buildAgentSummaryPrompt(profile, recentEvents, patterns);

      try {
        const response = await analysisFn(prompt);
        return storeAndReturn(agentId, 'agent-summary', prompt, response, dataHash);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return shortCircuit(agentId, 'agent-summary', `Analysis failed: ${message}`, false);
      }
    },

    async suggestFixes(agentId: string): Promise<InsightResult> {
      const profile = store.getAgentProfile(agentId);
      if (!profile) {
        return shortCircuit(agentId, 'fix-suggestion', 'No data available for this agent.', false);
      }

      const events = store.getRecentEvents(agentId, { limit: 50 });
      const failures = events.filter((e) => e.eventType === 'execution.failed');
      const patterns = store.getPatternHistory(agentId, { limit: 5 });

      if (failures.length === 0 && profile.knownBottlenecks.length === 0) {
        return shortCircuit(
          agentId,
          'fix-suggestion',
          'Agent is healthy — no failures or bottlenecks detected.',
          false,
        );
      }

      const dataHash = simpleHash(JSON.stringify({ failures, profile, patterns }));

      const cached = checkCache(agentId, 'fix-suggestion', dataHash);
      if (cached) {
        return shortCircuit(agentId, 'fix-suggestion', cached.response, true, cached.timestamp);
      }

      const prompt = buildFixSuggestionPrompt(failures, profile, patterns);

      try {
        const response = await analysisFn(prompt);
        return storeAndReturn(agentId, 'fix-suggestion', prompt, response, dataHash);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return shortCircuit(agentId, 'fix-suggestion', `Analysis failed: ${message}`, false);
      }
    },
  };
}
