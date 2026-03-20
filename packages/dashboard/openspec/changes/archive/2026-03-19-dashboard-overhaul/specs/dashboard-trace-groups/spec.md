## ADDED Requirements

### Requirement: Traces grouped by agent
The trace sidebar SHALL group traces by `agentId`. Each group SHALL display the agent name, total trace count, and failure count as a collapsible header.

#### Scenario: Multiple agents with traces
- **WHEN** traces exist for agents "alfred", "alfred-curator", and "openclaw"
- **THEN** 3 collapsible groups SHALL be displayed, each with the agent name and counts

#### Scenario: Expand a group
- **WHEN** the user clicks on the "alfred" group header
- **THEN** the individual traces for alfred SHALL be shown, sorted by timestamp descending

### Requirement: Agent name in trace entries
Each trace entry SHALL display the agent name from the trace data, not just the graph ID hash.

#### Scenario: Trace with agent name
- **WHEN** a trace has `agentId: "alfred-curator"` and `graphId: "abc123"`
- **THEN** the trace entry SHALL display "alfred-curator" prominently and the graph ID as secondary text

### Requirement: FAIL trace visual differentiation
Traces with `status: "failed"` SHALL be visually differentiated with a bold red left border, larger font weight, and a prominent failure icon. They SHALL NOT use only a small badge.

#### Scenario: Failed trace
- **WHEN** a trace has status "failed" with 73 nodes
- **THEN** the trace entry SHALL have a bold red left border (4px), bold text, and a visible failure icon (X or exclamation)

#### Scenario: Successful trace
- **WHEN** a trace has status "completed"
- **THEN** the trace entry SHALL have normal styling with a subtle green left border or checkmark

### Requirement: Failure traces at top within group
Within each agent group, failed traces SHALL appear before successful traces, regardless of timestamp.

#### Scenario: Mixed traces
- **WHEN** an agent has 3 completed traces and 1 failed trace (oldest)
- **THEN** the failed trace SHALL appear first in the group
