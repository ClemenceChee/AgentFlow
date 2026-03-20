## ADDED Requirements

### Requirement: Activity heatmap display
The dashboard SHALL display a time-bucketed heatmap showing execution volume over the last N hours. Each cell represents a time bucket. Cell color intensity SHALL map to execution count relative to the maximum.

#### Scenario: 24-hour heatmap
- **WHEN** the heatmap is rendered with 24 hours of data in 15-minute buckets
- **THEN** 96 cells SHALL be displayed with intensity proportional to execution count

### Requirement: Failure overlay
Cells with failed executions SHALL display a red overlay. The overlay intensity SHALL map to the ratio of failures to total executions in that bucket.

#### Scenario: Bucket with failures
- **WHEN** a 15-minute bucket has 20 executions and 5 failures
- **THEN** the cell SHALL show the volume intensity plus a red overlay at 25% opacity

### Requirement: Heatmap interaction
Hovering a cell SHALL display a tooltip showing: time range, execution count, failure count, and top agents active in that bucket.

#### Scenario: Hover cell
- **WHEN** the user hovers over the 14:00-14:15 cell
- **THEN** a tooltip SHALL show "14:00–14:15 | 20 executions | 5 failures | alfred (12), curator (8)"

### Requirement: Heatmap API
The server SHALL provide `/api/activity?hours=24&bucket=15m` returning time-bucketed execution counts with failure breakdowns.

#### Scenario: API response
- **WHEN** `/api/activity?hours=24&bucket=15m` is called
- **THEN** the response SHALL contain an array of buckets, each with `start`, `end`, `total`, `failures`, and `topAgents`
