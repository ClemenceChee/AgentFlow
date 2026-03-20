## ADDED Requirements

### Requirement: Service row metrics
Each service row in the Process Health section SHALL display: service name, PID, CPU usage, memory usage, and uptime. These metrics SHALL be sourced from the matched OS process data.

#### Scenario: Active service with metrics
- **WHEN** a service has a running process with CPU 12.5%, memory 3.2%, uptime "2:31:05"
- **THEN** the service row SHALL show all five fields: name, PID, CPU, memory, uptime

#### Scenario: Service without running process
- **WHEN** a service has no matching OS process (inactive systemd unit)
- **THEN** the service row SHALL show the name and status with dashes for CPU/memory/uptime

### Requirement: Worker card metrics
Worker cards SHALL display the same health metrics (CPU, memory) as service rows. Metrics SHALL be sourced from the OS process matching the worker's PID.

#### Scenario: Active worker
- **WHEN** a worker has `pid: 12345` and the matching OS process shows CPU 5.1%, memory 1.8%
- **THEN** the worker card SHALL display CPU and memory alongside the existing name and status

### Requirement: Color thresholds with legend
Metric values SHALL be color-coded: green for healthy, amber for warning, red for critical. A visible legend SHALL explain the thresholds.

#### Scenario: CPU thresholds
- **WHEN** CPU is below 70%
- **THEN** it SHALL be displayed in green
- **WHEN** CPU is between 70% and 90%
- **THEN** it SHALL be displayed in amber
- **WHEN** CPU is above 90%
- **THEN** it SHALL be displayed in red

#### Scenario: Legend visibility
- **WHEN** the Process Health section is visible
- **THEN** a collapsible legend SHALL be available explaining green/amber/red thresholds

### Requirement: Accessibility for metrics
Every color-coded metric SHALL also include a text label or icon indicating status. Color SHALL NOT be the sole indicator.

#### Scenario: Color-blind safe
- **WHEN** a metric is displayed in red (critical)
- **THEN** it SHALL also show a warning icon or "critical" text label
