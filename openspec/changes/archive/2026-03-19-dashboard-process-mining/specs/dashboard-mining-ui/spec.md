## ADDED Requirements

### Requirement: Bottleneck highlighting on process map
The Cytoscape process map SHALL color nodes by p95 duration when bottleneck data is available. Nodes with higher p95 values SHALL appear in warmer colors (yellow → orange → red).

#### Scenario: Nodes colored by p95 duration
- **WHEN** the process-graph response includes `p95Duration` fields on nodes
- **THEN** the Cytoscape renderer SHALL apply a gradient color from green (low p95) to red (high p95), using the `maxP95` value for normalization

#### Scenario: Tooltip includes bottleneck stats
- **WHEN** a user hovers over or clicks a node on the process map
- **THEN** the detail panel SHALL show `p95 Duration` alongside the existing `Avg Duration` and `Fail Rate`

### Requirement: Variant list panel
The process map view SHALL include a collapsible variant list panel below the Cytoscape graph, showing the top execution path variants for the selected agent.

#### Scenario: Variant panel loaded
- **WHEN** the process map tab is active and an agent is selected
- **THEN** the frontend SHALL fetch `/api/agents/:agentId/variants` and display up to 5 variants with path signature (truncated), count, and percentage

#### Scenario: No variants available
- **WHEN** the variants endpoint returns an empty array
- **THEN** the variant panel SHALL display "No variant data available" message

### Requirement: Agent profile summary card
The agent detail view SHALL display a profile summary card showing accumulated statistics from the knowledge store.

#### Scenario: Profile card shown
- **WHEN** an agent is selected and a profile exists
- **THEN** a summary card SHALL display: total runs, success/failure counts, failure rate (as percentage), and known bottlenecks (as a list)

#### Scenario: No profile available
- **WHEN** the profile endpoint returns 404
- **THEN** the profile card SHALL be hidden or show "Profile building..." placeholder
