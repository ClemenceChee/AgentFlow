## Why

AgentFlow's Tier 1 knowledge engine ships statistical intelligence — process mining, variant analysis, bottleneck detection, conformance checking, and adaptive guards — all with zero dependencies and no LLM cost. But statistical patterns alone can't explain *why* an agent failed, *what* a bottleneck means in context, or *how* to fix a recurring anomaly. Tier 2 adds an LLM-powered semantic analysis layer on top of the existing knowledge store, turning raw statistical signals into actionable natural language insights. The user provides the LLM function (`string → string`), AgentFlow provides the prompts and knowledge structure.

## What Changes

- **LLM function interface**: A simple `AnalysisFn` type (`string → Promise<string>`) that users provide. AgentFlow never calls an LLM directly — it constructs prompts from knowledge store data and delegates to the user's function.
- **Insight engine**: A `createInsightEngine(store, analysisFn)` factory that exposes semantic analysis operations:
  - `explainFailures(agentId)` — "Why did this agent fail 3x today?" from execution events + profile
  - `explainAnomaly(agentId, eventId)` — Natural language explanation of a flagged anomaly
  - `summarizeAgent(agentId)` — Agent health summary combining profile stats with semantic interpretation
  - `suggestFixes(agentId)` — Actionable recommendations based on failure patterns and bottlenecks
- **Prompt builders**: Pure functions that assemble structured prompts from knowledge store queries (events, profiles, patterns). These are the core intellectual property — deterministic, testable prompt construction.
- **Insight caching**: Insights are stored back into the knowledge store as a new event type (`InsightEvent`), avoiding redundant LLM calls for the same underlying data.

## Capabilities

### New Capabilities
- `insight-engine`: The `createInsightEngine()` factory, `AnalysisFn` type, semantic analysis operations, and insight caching
- `prompt-builder`: Pure prompt construction functions that transform knowledge store data into structured LLM prompts

### Modified Capabilities
- `knowledge-store`: Add `InsightEvent` type and insight storage/retrieval to the existing knowledge store

## Impact

- **New files**: `packages/core/src/insight-engine.ts`, `packages/core/src/prompt-builder.ts`
- **Modified files**: `packages/core/src/types.ts` (new types), `packages/core/src/knowledge-store.ts` (insight event support), `packages/core/src/index.ts` (new exports)
- **Dependencies**: Zero new runtime dependencies. The LLM call is externalized to the user.
- **Breaking changes**: None. All new capabilities are additive.
- **Test files**: `tests/core/insight-engine.test.ts`, `tests/core/prompt-builder.test.ts`
