## ADDED Requirements

### Requirement: Alert banner area
The dashboard SHALL render a persistent alert area above all tab content that displays critical operational issues. The area SHALL be visible on all tabs.

#### Scenario: Failed service alert
- **WHEN** a service in `services[]` has `systemd.activeState` of `failed` or `systemd.subState` of `dead` while expected running
- **THEN** an alert card SHALL be displayed with a red severity icon, the service name, and the failure state

#### Scenario: Orphan process alert
- **WHEN** the process health response contains orphan processes
- **THEN** a dismissable alert card SHALL be displayed showing the orphan count, PID list, and action hints ("kill", "adopt", "investigate") with copyable shell commands

#### Scenario: Stale PID file alert
- **WHEN** a service has `pidFile.stale === true`
- **THEN** an alert card SHALL be displayed warning about the stale PID with the file path

#### Scenario: No issues
- **WHEN** no FAIL states, orphans, or stale PIDs exist
- **THEN** the alert area SHALL be hidden (no empty space)

### Requirement: Dismissable alerts
Each alert card SHALL have a dismiss button. Dismissed alerts SHALL be tracked in `sessionStorage` by a key derived from the alert content. Dismissed alerts SHALL reappear on page reload.

#### Scenario: Dismiss an alert
- **WHEN** the user clicks the dismiss button on an orphan alert
- **THEN** the alert SHALL be hidden for the current session
- **AND** it SHALL reappear if the page is reloaded

### Requirement: Alert severity ordering
Alerts SHALL be ordered by severity: failed services first, then stale PIDs, then orphan processes, then warnings.

#### Scenario: Multiple alerts
- **WHEN** both a failed service and orphan processes exist
- **THEN** the failed service alert SHALL appear above the orphan alert
