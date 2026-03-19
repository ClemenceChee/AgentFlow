## 1. Types

- [x] 1.1 Add `AnalysisFn`, `InsightEvent`, `InsightResult`, `InsightEngineConfig`, and `InsightEngine` interfaces to `packages/core/src/types.ts`
- [x] 1.2 Export new types from `packages/core/src/index.ts`

## 2. Knowledge Store — Insight Support

- [x] 2.1 Add `appendInsight(event: InsightEvent): void` method to `KnowledgeStore` interface in types.ts
- [x] 2.2 Add `getRecentInsights(agentId, options?)` method to `KnowledgeStore` interface in types.ts
- [x] 2.3 Implement `appendInsight` in `packages/core/src/knowledge-store.ts` — persist to `insights/{agentId}/{insightType}-{timestamp}-{seq}.json`
- [x] 2.4 Implement `getRecentInsights` in `packages/core/src/knowledge-store.ts` — query with type filter and limit
- [x] 2.5 Extend `compact()` to also remove insight files older than threshold
- [x] 2.6 Add tests for insight persistence, querying, and compaction in `tests/core/knowledge-store.test.ts`

## 3. Prompt Builders

- [x] 3.1 Create `packages/core/src/prompt-builder.ts` with `buildFailureAnalysisPrompt` function
- [x] 3.2 Add `buildAnomalyExplanationPrompt` function
- [x] 3.3 Add `buildAgentSummaryPrompt` function
- [x] 3.4 Add `buildFixSuggestionPrompt` function
- [x] 3.5 Export prompt builder functions from `packages/core/src/index.ts`
- [x] 3.6 Add tests for all prompt builders in `tests/core/prompt-builder.test.ts`

## 4. Insight Engine

- [x] 4.1 Create `packages/core/src/insight-engine.ts` with `createInsightEngine` factory
- [x] 4.2 Implement `explainFailures` — query failed events, build prompt, call AnalysisFn, cache result
- [x] 4.3 Implement `explainAnomaly` — build anomaly prompt, call AnalysisFn, cache result
- [x] 4.4 Implement `summarizeAgent` — query profile + events + patterns, build prompt, call AnalysisFn, cache result
- [x] 4.5 Implement `suggestFixes` — query failures + bottlenecks, build prompt, call AnalysisFn, cache result
- [x] 4.6 Implement data hash computation for cache identity
- [x] 4.7 Implement cache lookup (check existing insights, compare hash + TTL)
- [x] 4.8 Implement AnalysisFn error handling (catch, return error InsightResult, don't cache)
- [x] 4.9 Export `createInsightEngine` from `packages/core/src/index.ts`
- [x] 4.10 Add tests for insight engine in `tests/core/insight-engine.test.ts`
