## Context

AgentFlow's Tier 1 knowledge engine provides statistical intelligence: process mining, variant analysis, bottleneck detection, conformance checking, and adaptive guards. All Tier 1 capabilities operate without an LLM — they use deterministic algorithms over accumulated execution events and derive agent profiles.

Tier 2 adds a semantic analysis layer that uses an LLM to interpret the statistical data and produce natural language insights. The key constraint: AgentFlow never calls an LLM directly. The user provides a function (`string → Promise<string>`), and AgentFlow constructs the prompts from knowledge store data.

Current knowledge store: append-only filesystem storage with execution events, pattern events, and derived agent profiles. See `packages/core/src/knowledge-store.ts`.

## Goals / Non-Goals

**Goals:**
- Let users get natural language explanations of agent failures, anomalies, and patterns
- Keep prompt construction deterministic and testable (pure functions)
- Cache insights to avoid redundant LLM calls
- Maintain zero runtime dependencies — the LLM is user-provided
- Follow existing patterns: closure-based factories, interfaces in types.ts, pure functions

**Non-Goals:**
- Choosing or recommending a specific LLM provider
- Streaming responses (simple request-response for now)
- Cross-agent analysis (Tier 3 scope — requires Soma)
- Embedding or vector search (future concern)
- Dashboard UI for insights (separate change)

## Decisions

### 1. AnalysisFn as a simple function type

```typescript
type AnalysisFn = (prompt: string) => Promise<string>;
```

**Why this over an LLM client interface**: The simplest possible contract. Any LLM provider (OpenAI, Anthropic, local models) can be wrapped in one line. No need for model selection, temperature, or token limits in the core interface — those are the user's concern. If structured output is needed later, we add a second function type rather than complicating this one.

**Alternative considered**: `{ complete(prompt: string, options?: { maxTokens?: number }): Promise<string> }` — rejected because options leak provider concerns into the core.

### 2. Prompt builders as pure functions

Prompt construction lives in `prompt-builder.ts` as pure functions that take knowledge store data (events, profiles, patterns) and return prompt strings. These are independently testable without mocking an LLM.

```typescript
function buildFailureAnalysisPrompt(events: ExecutionEvent[], profile: AgentProfile): string
function buildAnomalyExplanationPrompt(event: ExecutionEvent, profile: AgentProfile): string
function buildAgentSummaryPrompt(profile: AgentProfile, recentEvents: ExecutionEvent[], patterns: PatternEvent[]): string
function buildFixSuggestionPrompt(events: ExecutionEvent[], profile: AgentProfile, patterns: PatternEvent[]): string
```

**Why separate from the engine**: Testability. Prompts can be snapshot-tested. The engine orchestrates data fetching + LLM calls; the builders just format data into prompts.

### 3. InsightEngine as a closure-based factory

```typescript
function createInsightEngine(store: KnowledgeStore, analysisFn: AnalysisFn): InsightEngine
```

The engine reads from the store, calls prompt builders, invokes the analysis function, and caches results. Same factory pattern as `createGraphBuilder`, `createKnowledgeStore`, etc.

**Methods:**
- `explainFailures(agentId)` → `InsightResult`
- `explainAnomaly(agentId, event)` → `InsightResult`
- `summarizeAgent(agentId)` → `InsightResult`
- `suggestFixes(agentId)` → `InsightResult`

### 4. InsightEvent for caching in the knowledge store

Insights are persisted as a new event type in the knowledge store:

```typescript
interface InsightEvent {
  eventType: 'insight.generated';
  agentId: string;
  timestamp: number;
  schemaVersion: number;
  insightType: 'failure-analysis' | 'anomaly-explanation' | 'agent-summary' | 'fix-suggestion';
  prompt: string;      // The prompt that was sent (for debugging/auditing)
  response: string;    // The LLM response
  dataHash: string;    // Hash of input data — if data hasn't changed, cache hit
}
```

Stored at `insights/{agentId}/{insightType}-{timestamp}-{seq}.json`.

**Why a hash-based cache**: Avoids rerunning the LLM when the underlying data hasn't changed. The hash covers the serialized input data (events + profile). Simple and deterministic.

**Why store the prompt**: Auditability. Users can inspect what was sent to their LLM. Also enables prompt iteration — compare old vs new prompts for the same data.

### 5. Minimal knowledge store modifications

The existing `KnowledgeStore` interface gets two additions:
- `appendInsight(event: InsightEvent): void` — persist an insight event
- `getRecentInsights(agentId: string, options?: { type?: string; limit?: number }): InsightEvent[]` — query cached insights

The `append()` method continues to handle only ExecutionEvent and PatternEvent. InsightEvents use a separate method to keep the type signatures clean and avoid breaking existing EventWriter consumers.

## Risks / Trade-offs

**[Prompt quality depends on data richness]** → Early-stage agents with few events will get shallow insights. Mitigation: prompt builders include "insufficient data" guards that return helpful messages instead of sending sparse prompts to the LLM.

**[LLM latency in the critical path]** → Insight generation is inherently slower than statistical queries. Mitigation: all insight methods are async, caching avoids redundant calls, and the engine is opt-in (not part of the default execution pipeline).

**[Hash-based cache staleness]** → Cache hits when data hash matches, but the LLM itself may have improved. Mitigation: accept this trade-off for now. Users can clear insights via compaction. A future `force: true` option can bypass the cache.

**[Prompt size limits]** → Large event histories could exceed LLM context windows. Mitigation: prompt builders take bounded inputs (recent events with limit, single profile). The user's `AnalysisFn` can handle truncation if needed.
