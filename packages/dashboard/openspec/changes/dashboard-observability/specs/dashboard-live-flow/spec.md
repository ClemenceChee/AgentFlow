## ADDED Requirements

### Requirement: Live message flow visualization
The dashboard SHALL provide a Live Flow tab showing an animated directed graph where nodes represent agents, tools, and channels, and edges animate when events flow between them in real-time.

#### Scenario: Event arrives
- **WHEN** a WebSocket event indicates agent "alfred" called tool "fetch-data"
- **THEN** the edge from the "alfred" node to the "fetch-data" node SHALL briefly animate (pulse effect)

#### Scenario: Multiple concurrent flows
- **WHEN** events arrive for 3 different agents simultaneously
- **THEN** all 3 corresponding edge animations SHALL be visible concurrently

### Requirement: Flow graph derived from execution data
The flow graph topology SHALL be derived from execution graph parent-child relationships. New nodes SHALL appear automatically when previously unseen agents or tools are encountered.

#### Scenario: New tool appears
- **WHEN** an event references a tool name not yet in the graph
- **THEN** a new node SHALL be added and connected to its parent agent

### Requirement: Flow rate indicator
Each edge SHALL display a flow rate indicator (events/minute) when activity exceeds a threshold.

#### Scenario: High activity edge
- **WHEN** the alfred→fetch-data edge sees 30 events in the last minute
- **THEN** a "30/min" label SHALL appear on the edge
