## ADDED Requirements

### Requirement: Agent deduplication
The server SHALL merge agents that represent the same worker from different adapter sources. Two agents SHALL be candidates for merging when they are from different adapter sources AND share a common suffix (after stripping the first prefix segment before `-` or `:`). The suffix MUST be at least 4 characters to avoid false matches.

#### Scenario: Same worker from two sources
- **WHEN** agents `alfred-curator` (source: agentflow) and `vault-curator` (source: agentflow) exist from different data directories
- **THEN** they SHALL be merged into one agent with `agentId: "curator"` combining execution counts from both

#### Scenario: No false merge
- **WHEN** agents `alfred` and `alfred-main` exist
- **THEN** they SHALL NOT be merged (different suffixes)

#### Scenario: Different source merge only
- **WHEN** two agents from the same adapter source share a suffix
- **THEN** they SHALL NOT be merged (duplicates within one source may be intentional)

### Requirement: Agent grouping by source
The `/api/agents` endpoint SHALL return agents organized into groups by adapter source. Each group SHALL have: `name` (adapter name), `displayName`, aggregate stats (`totalExecutions`, `failedExecutions`), and an `agents` array.

#### Scenario: Multiple sources
- **WHEN** agents from agentflow and openclaw adapters exist
- **THEN** two groups SHALL be returned, one per source

### Requirement: Sub-groups by purpose keywords
Within each source group, agents SHALL be categorized into sub-groups based on keyword matching against agent names. The keyword list SHALL be configurable and NOT hardcoded to any specific framework.

#### Scenario: Email processor agents
- **WHEN** an agent name contains "email" or "mail"
- **THEN** it SHALL be placed in the "Email Processors" sub-group

#### Scenario: No keyword match
- **WHEN** an agent name matches no purpose keywords
- **THEN** it SHALL be placed in the "General" sub-group

### Requirement: Backward-compatible flat API
The `/api/agents?flat=true` query parameter SHALL return the original flat array format for backward compatibility.

#### Scenario: Flat mode
- **WHEN** `/api/agents?flat=true` is called
- **THEN** the original flat array of agent stats SHALL be returned

### Requirement: Frontend group rendering
The dashboard agent cards SHALL render inside collapsible group headers showing: group name, total executions, failure count. Sub-groups SHALL be visually distinguished within each group.

#### Scenario: Collapsed group
- **WHEN** a source group has 12 agents
- **THEN** the group header SHALL show the count and stats, with agents visible below

### Requirement: Merged agent display name
Merged agents SHALL display the deduplicated name (suffix) as primary, with original source IDs shown as secondary detail.

#### Scenario: Merged curator
- **WHEN** `alfred-curator` and `vault-curator` are merged
- **THEN** the card SHALL show "curator" as the name with "2 sources" indicator
