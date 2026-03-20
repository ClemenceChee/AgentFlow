## ADDED Requirements

### Requirement: Dynamic service names
All service labels in the Process Health section SHALL be derived from the `services[].name` field returned by `/api/process-health`. No service name SHALL be hardcoded in the frontend.

#### Scenario: Named service
- **WHEN** a service has `name: "alfred"`
- **THEN** the service card SHALL display "alfred" as the label

#### Scenario: Unnamed service fallback
- **WHEN** a service has an empty or missing name but has a PID
- **THEN** the label SHALL display `unnamed (PID: <pid>)`

### Requirement: Dynamic worker names
Worker cards SHALL display the worker name from the `workers.workers[].name` field. No worker name SHALL be hardcoded.

#### Scenario: Named worker
- **WHEN** a worker entry has `name: "curator"`
- **THEN** the worker card SHALL display "curator"

### Requirement: No hardcoded agent labels
The dashboard JavaScript SHALL contain zero hardcoded agent or service name strings used for display. A code search for hardcoded names like "alfred", "openclaw", "clawmetry" in display logic SHALL return no results.

#### Scenario: Code audit
- **WHEN** the dashboard.js is searched for hardcoded service names in rendering functions
- **THEN** no matches SHALL be found — all display names come from API data
