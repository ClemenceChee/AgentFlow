## ADDED Requirements

### Requirement: Variant explorer
The dashboard SHALL display execution variants for the selected agent, ranked by frequency. Each variant is a distinct sequence of steps that traces actually took.

#### Scenario: Multiple variants
- **WHEN** an agent has 3 distinct execution paths
- **THEN** the variant explorer SHALL show all 3 ranked by frequency with percentage

#### Scenario: Happy path identification
- **WHEN** variants are displayed
- **THEN** the most common successful variant SHALL be labeled "Happy Path"

#### Scenario: Variant as step sequence
- **WHEN** a variant is rendered
- **THEN** it SHALL be displayed as a horizontal row of colored step boxes (one per activity in the path)

### Requirement: Bottleneck heatmap overlay
The dashboard SHALL provide a bottleneck view showing the same process map nodes/edges but colored by duration (thermal gradient: blue → yellow → red).

#### Scenario: Bottleneck visualization
- **WHEN** the bottleneck view is active
- **THEN** nodes with p95 duration above the median SHALL be highlighted in warm colors (orange/red)
- **AND** the slowest node SHALL have a visual emphasis (glow or larger size)

### Requirement: Dotted chart
The dashboard SHALL provide a dotted chart showing all executions for the selected agent plotted on a time axis.

#### Scenario: Temporal scatter
- **WHEN** an agent with 78 executions is selected
- **THEN** 78 rows SHALL be plotted with dots for each node event, colored by node type
- **AND** the X-axis SHALL show time (relative to first execution)

#### Scenario: Pattern visibility
- **WHEN** executions cluster at certain times
- **THEN** dense dot regions SHALL be visually apparent through proximity
