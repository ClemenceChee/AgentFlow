## ADDED Requirements

### Requirement: Active sessions panel
The dashboard SHALL display an active sessions panel showing recent agent sessions with: agent name, LLM model, token count, estimated cost (USD), last activity timestamp, and execution status.

#### Scenario: Session with model data
- **WHEN** a session for "alfred-curator" used "claude-sonnet-4-20250514" with 15,000 tokens at $0.12
- **THEN** the session row SHALL display all fields: agent name, model, 15K tokens, $0.12, last activity time, status

#### Scenario: Session without model data
- **WHEN** a session has no SemanticContext (no model/token info)
- **THEN** the session row SHALL show agent name, status, and "N/A" for model, tokens, and cost

### Requirement: Session drill-down
Clicking a session SHALL expand to show the execution graph tree with subagent hierarchy — each subagent/tool as an indented row with its own status, duration, and token count.

#### Scenario: Session with subagents
- **WHEN** the user clicks a session for "alfred" which spawned subagents "curator" and "distiller"
- **THEN** an expanded view SHALL show the tree: alfred → curator, alfred → distiller, with individual metrics

### Requirement: Aggregate cost tracking
The sessions panel header SHALL display aggregate totals: total sessions, total tokens, total estimated cost across all visible sessions.

#### Scenario: Multiple sessions
- **WHEN** 5 sessions are visible with total 80,000 tokens and $2.40 cost
- **THEN** the header SHALL show "5 sessions | 80K tokens | $2.40"

### Requirement: Sessions API
The server SHALL provide `/api/sessions` returning recent sessions aggregated from execution events with semantic context.

#### Scenario: API response
- **WHEN** `/api/sessions` is called
- **THEN** the response SHALL contain an array of sessions, each with `agentId`, `graphId`, `model`, `totalTokens`, `estimatedCost`, `lastActivity`, `status`, and `children` (subagent list)
