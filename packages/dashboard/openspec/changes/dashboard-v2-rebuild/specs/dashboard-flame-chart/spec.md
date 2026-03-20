## ADDED Requirements

### Requirement: Flame chart timeline
The dashboard SHALL display a flame chart for the selected execution where each row represents a nesting level (depth), bars are positioned by actual start/end time relative to the execution start, and bar width represents duration.

#### Scenario: Nested execution
- **WHEN** an execution has a root agent node containing 3 child tool calls
- **THEN** the root agent SHALL appear at level 0 spanning the full width
- **AND** the 3 tool calls SHALL appear at level 1, positioned at their actual start times with widths proportional to their durations

#### Scenario: Time axis alignment
- **WHEN** a node started at 25% of the total execution time and lasted 10% of total time
- **THEN** its bar SHALL be positioned at 25% from the left with width 10%

#### Scenario: Failed node highlighting
- **WHEN** a node has status "failed"
- **THEN** its bar SHALL be colored red and have a failure callout above the chart showing: node name, type, timestamp, and error message

### Requirement: Flame chart interaction
Hovering a bar SHALL show a tooltip with: node name, type, duration, start time, status, and error (if any). Clicking a bar SHALL select it and show its details below the chart.

#### Scenario: Hover tooltip
- **WHEN** the user hovers over a bar
- **THEN** a tooltip SHALL appear with the node's full details

### Requirement: Failure callout
When the execution contains failed nodes, a failure callout box SHALL appear above the flame chart listing each failed node with: type, name, timestamp, and error message.

#### Scenario: Failed execution
- **WHEN** the selected execution has 2 failed nodes
- **THEN** the callout SHALL list both with their details, styled with red border
