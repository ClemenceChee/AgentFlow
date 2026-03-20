## ADDED Requirements

### Requirement: Process map visualization
The dashboard SHALL display a directly-follows graph for the selected agent, computed from all that agent's execution traces using `discoverProcess()` from agentflow-core. Nodes represent execution steps, edges represent transitions.

#### Scenario: Agent with executions
- **WHEN** an agent with 78 executions is selected
- **THEN** a directed graph SHALL be rendered showing the discovered process model with nodes as rounded rectangles and edges as arrows

#### Scenario: Edge thickness encodes frequency
- **WHEN** the process map is rendered
- **THEN** edge thickness SHALL be proportional to transition frequency (more cases = thicker arrow)

#### Scenario: Node color encodes duration
- **WHEN** the process map is rendered
- **THEN** node color SHALL follow a gradient from blue (fast) to red (slow) based on average duration at that step

### Requirement: Frequency filter slider
The process map SHALL include a slider that filters edges below a frequency threshold (Disco-style simplification). Moving the slider left shows more edges (complex view), right shows fewer (simplified view).

#### Scenario: Filter low-frequency paths
- **WHEN** the slider is set to 20%
- **THEN** only edges representing at least 20% of total transitions SHALL be visible

### Requirement: Process mining API endpoint
The server SHALL provide `GET /api/process-model/:agentId` that returns the discovered process model, variants, and bottlenecks computed from that agent's traces.

#### Scenario: API response
- **WHEN** `/api/process-model/alfred` is called
- **THEN** the response SHALL contain `{ model, variants, bottlenecks }` computed by agentflow-core functions

#### Scenario: Cached results
- **WHEN** the same endpoint is called within 60 seconds
- **THEN** cached results SHALL be returned without recomputation
