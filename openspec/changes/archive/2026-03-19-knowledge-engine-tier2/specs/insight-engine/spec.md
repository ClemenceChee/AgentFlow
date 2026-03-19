## ADDED Requirements

### Requirement: AnalysisFn type
The system SHALL export an `AnalysisFn` type defined as `(prompt: string) => Promise<string>` that represents a user-provided LLM function. The type SHALL be the sole contract between AgentFlow and any LLM provider.

#### Scenario: Type compatibility
- **WHEN** a user wraps any LLM client as `async (prompt: string) => llm.complete(prompt)`
- **THEN** it SHALL satisfy the `AnalysisFn` type

### Requirement: InsightEngine creation
The system SHALL provide a `createInsightEngine(store: KnowledgeStore, analysisFn: AnalysisFn, options?: InsightEngineConfig): InsightEngine` factory that creates an engine for LLM-powered semantic analysis. The optional config SHALL accept `cacheTtlMs` (default: 3600000 / 1 hour) controlling how long cached insights remain valid.

#### Scenario: Create engine with defaults
- **WHEN** `createInsightEngine(store, analysisFn)` is called
- **THEN** an InsightEngine SHALL be returned with default cache TTL of 1 hour

#### Scenario: Create engine with custom TTL
- **WHEN** `createInsightEngine(store, analysisFn, { cacheTtlMs: 600000 })` is called
- **THEN** an InsightEngine SHALL be returned with 10-minute cache TTL

### Requirement: InsightResult type
All InsightEngine methods SHALL return `Promise<InsightResult>` where InsightResult contains: `agentId` (string), `insightType` (string), `content` (string — the LLM response), `cached` (boolean — whether this was a cache hit), and `timestamp` (number — when the insight was generated).

#### Scenario: Fresh insight result
- **WHEN** an insight is generated for the first time
- **THEN** the result SHALL have `cached: false` and `timestamp` set to the current time

#### Scenario: Cached insight result
- **WHEN** an insight is retrieved from cache
- **THEN** the result SHALL have `cached: true` and `timestamp` set to when the insight was originally generated

### Requirement: Explain failures
The InsightEngine SHALL provide `explainFailures(agentId: string): Promise<InsightResult>` that queries recent failed execution events and the agent profile, constructs a failure analysis prompt, sends it to the AnalysisFn, and returns the natural language explanation.

#### Scenario: Agent with failures
- **WHEN** `engine.explainFailures('alfred')` is called and alfred has 3 recent failed events
- **THEN** the engine SHALL query recent events, build a failure analysis prompt including the failure details and profile context, call the AnalysisFn, and return the response as an InsightResult with insightType `failure-analysis`

#### Scenario: Agent with no failures
- **WHEN** `engine.explainFailures('alfred')` is called and alfred has no failed events
- **THEN** the engine SHALL return an InsightResult with content indicating no failures found, without calling the AnalysisFn

#### Scenario: Agent with no history
- **WHEN** `engine.explainFailures('unknown-agent')` is called
- **THEN** the engine SHALL return an InsightResult with content indicating no data available, without calling the AnalysisFn

### Requirement: Explain anomaly
The InsightEngine SHALL provide `explainAnomaly(agentId: string, event: ExecutionEvent): Promise<InsightResult>` that takes a specific execution event flagged as anomalous, queries the agent profile for context, constructs an anomaly explanation prompt, and returns the LLM's interpretation.

#### Scenario: Anomalous event
- **WHEN** `engine.explainAnomaly('alfred', event)` is called with an event where `processContext.isAnomaly` is true
- **THEN** the engine SHALL build a prompt including the event details, conformance score, variant info, and profile context, call the AnalysisFn, and return the response with insightType `anomaly-explanation`

#### Scenario: Non-anomalous event
- **WHEN** `engine.explainAnomaly('alfred', event)` is called with an event where `processContext.isAnomaly` is false or undefined
- **THEN** the engine SHALL still generate an explanation (the user explicitly requested analysis), returning an InsightResult with insightType `anomaly-explanation`

### Requirement: Summarize agent
The InsightEngine SHALL provide `summarizeAgent(agentId: string): Promise<InsightResult>` that queries the agent profile, recent events, and pattern history, constructs a summary prompt, and returns a natural language health summary.

#### Scenario: Agent with rich history
- **WHEN** `engine.summarizeAgent('alfred')` is called and alfred has profile, events, and patterns
- **THEN** the engine SHALL build a prompt including profile stats (failure rate, durations, bottlenecks), recent event outcomes, and pattern trends, call the AnalysisFn, and return the response with insightType `agent-summary`

#### Scenario: Agent with minimal history
- **WHEN** `engine.summarizeAgent('alfred')` is called and alfred has only 2 events and no patterns
- **THEN** the engine SHALL build a prompt noting limited data, call the AnalysisFn, and return the response

### Requirement: Suggest fixes
The InsightEngine SHALL provide `suggestFixes(agentId: string): Promise<InsightResult>` that queries failure events, bottlenecks, and conformance issues, constructs a fix suggestion prompt, and returns actionable recommendations.

#### Scenario: Agent with failures and bottlenecks
- **WHEN** `engine.suggestFixes('alfred')` is called and alfred has failures and known bottlenecks
- **THEN** the engine SHALL build a prompt including failure patterns, bottleneck details, and conformance deviations, call the AnalysisFn, and return recommendations with insightType `fix-suggestion`

#### Scenario: Healthy agent
- **WHEN** `engine.suggestFixes('alfred')` is called and alfred has 0% failure rate and no bottlenecks
- **THEN** the engine SHALL return an InsightResult with content indicating the agent is healthy, without calling the AnalysisFn

### Requirement: Insight caching
The InsightEngine SHALL cache generated insights in the knowledge store as InsightEvents. Before calling the AnalysisFn, the engine SHALL check for a cached insight matching the same agentId, insightType, and dataHash. A cache hit occurs when a matching insight exists with age less than `cacheTtlMs`.

#### Scenario: Cache miss
- **WHEN** `engine.explainFailures('alfred')` is called and no matching cached insight exists
- **THEN** the engine SHALL call the AnalysisFn and store the result as an InsightEvent

#### Scenario: Cache hit
- **WHEN** `engine.explainFailures('alfred')` is called and a matching InsightEvent exists with the same dataHash and age less than cacheTtlMs
- **THEN** the engine SHALL return the cached response without calling the AnalysisFn

#### Scenario: Cache expired
- **WHEN** `engine.explainFailures('alfred')` is called and a matching InsightEvent exists but its age exceeds cacheTtlMs
- **THEN** the engine SHALL call the AnalysisFn and store a new InsightEvent

### Requirement: Data hash for cache identity
The InsightEngine SHALL compute a deterministic hash of the input data (serialized events + profile) to use as the cache key. The hash SHALL be computed using a simple string hash function (no crypto dependency required).

#### Scenario: Same data produces same hash
- **WHEN** the same events and profile are serialized twice
- **THEN** the resulting dataHash SHALL be identical

#### Scenario: Different data produces different hash
- **WHEN** a new event is appended between two insight requests
- **THEN** the resulting dataHash SHALL differ, causing a cache miss

### Requirement: AnalysisFn error handling
The InsightEngine SHALL catch errors thrown by the AnalysisFn and return an InsightResult with content describing the error. Failed insights SHALL NOT be cached.

#### Scenario: AnalysisFn throws
- **WHEN** the AnalysisFn throws an error during `explainFailures`
- **THEN** the engine SHALL return an InsightResult with content `"Analysis failed: <error message>"` and `cached: false`
- **AND** no InsightEvent SHALL be stored in the knowledge store
