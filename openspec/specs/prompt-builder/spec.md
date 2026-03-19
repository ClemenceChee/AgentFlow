### Requirement: Failure analysis prompt builder
The system SHALL export a pure function `buildFailureAnalysisPrompt(events: ExecutionEvent[], profile: AgentProfile): string` that constructs a structured prompt for LLM analysis of agent failures. The prompt SHALL include: the agent ID, failure count and rate from the profile, details of each failed event (timestamp, error message, path signature, duration), and recent duration statistics for context.

#### Scenario: Multiple failures
- **WHEN** `buildFailureAnalysisPrompt(events, profile)` is called with 3 failed events
- **THEN** the returned string SHALL contain all 3 failure details, the agent's failure rate, and a clear instruction asking the LLM to explain patterns and root causes

#### Scenario: Single failure
- **WHEN** `buildFailureAnalysisPrompt([event], profile)` is called with 1 failed event
- **THEN** the returned string SHALL contain the failure details and ask for a focused root cause analysis

### Requirement: Anomaly explanation prompt builder
The system SHALL export a pure function `buildAnomalyExplanationPrompt(event: ExecutionEvent, profile: AgentProfile): string` that constructs a prompt for explaining why an execution was flagged as anomalous. The prompt SHALL include: the event details (path signature, duration, conformance score, violation list), the agent's typical behavior from the profile (average duration, known bottlenecks, usual conformance score), and a clear instruction to explain the deviation.

#### Scenario: Conformance anomaly
- **WHEN** `buildAnomalyExplanationPrompt(event, profile)` is called with an event having conformanceScore 0.4 and profile showing lastConformanceScore 0.95
- **THEN** the prompt SHALL highlight the conformance deviation and ask for explanation

#### Scenario: Duration anomaly
- **WHEN** `buildAnomalyExplanationPrompt(event, profile)` is called with an event having duration 30000ms and profile showing average duration around 5000ms
- **THEN** the prompt SHALL highlight the duration spike and ask for possible causes

### Requirement: Agent summary prompt builder
The system SHALL export a pure function `buildAgentSummaryPrompt(profile: AgentProfile, recentEvents: ExecutionEvent[], patterns: PatternEvent[]): string` that constructs a prompt for generating an overall agent health summary. The prompt SHALL include: profile statistics (total runs, failure rate, known bottlenecks, conformance score), recent execution outcomes, and pattern discovery results.

#### Scenario: Comprehensive data
- **WHEN** `buildAgentSummaryPrompt(profile, events, patterns)` is called with rich data
- **THEN** the prompt SHALL present a structured overview and ask for a health assessment with key observations

#### Scenario: Sparse data
- **WHEN** `buildAgentSummaryPrompt(profile, [], [])` is called with only a profile and no recent events/patterns
- **THEN** the prompt SHALL note the limited data and ask for a summary based on available profile statistics

### Requirement: Fix suggestion prompt builder
The system SHALL export a pure function `buildFixSuggestionPrompt(events: ExecutionEvent[], profile: AgentProfile, patterns: PatternEvent[]): string` that constructs a prompt for generating actionable fix recommendations. The prompt SHALL include: failure patterns (grouped by error type or path signature), bottleneck details from patterns, conformance issues, and a clear instruction to provide specific, actionable recommendations.

#### Scenario: Failures with bottlenecks
- **WHEN** `buildFixSuggestionPrompt(events, profile, patterns)` is called with failures and bottleneck data
- **THEN** the prompt SHALL correlate failures with bottlenecks and ask for prioritized fix recommendations

#### Scenario: Only bottlenecks, no failures
- **WHEN** `buildFixSuggestionPrompt([], profile, patterns)` is called with no failure events but bottleneck data
- **THEN** the prompt SHALL focus on performance optimization recommendations based on bottleneck data

### Requirement: Prompt structure consistency
All prompt builder functions SHALL follow a consistent structure: (1) a system-level instruction defining the role ("You are analyzing execution data for an AI agent system"), (2) a data section with structured facts, and (3) a question section with the specific analysis request. Prompts SHALL use plain text (no special tokens or provider-specific formatting).

#### Scenario: Prompt format
- **WHEN** any prompt builder function is called
- **THEN** the returned string SHALL contain a role instruction, labeled data sections, and a clear analysis question

### Requirement: Prompt builders are pure
All prompt builder functions SHALL be pure functions with no side effects. They SHALL not read from the filesystem, call external services, or modify any state. All data SHALL be passed as arguments.

#### Scenario: No side effects
- **WHEN** `buildFailureAnalysisPrompt(events, profile)` is called
- **THEN** it SHALL return a string computed solely from its arguments with no observable side effects
