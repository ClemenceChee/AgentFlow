## ADDED Requirements

### Requirement: Two-selection state model
The dashboard SHALL maintain exactly two selection states: `selectedAgent` (string or null) and `selectedExecution` (filename string or null). All component behavior SHALL be derived from these two values.

#### Scenario: Agent selection clears execution
- **WHEN** the user selects a different agent
- **THEN** `selectedExecution` SHALL be set to null
- **AND** the workspace SHALL show the AgentProfile view (process mining)
- **AND** the ExecSidebar SHALL auto-select the first failed execution (or most recent if none failed)

#### Scenario: Execution selection shows detail
- **WHEN** the user selects an execution from the sidebar
- **THEN** the workspace SHALL show the ExecutionDetail view with all tabs

#### Scenario: Auto-select on load
- **WHEN** the dashboard loads and agents are available
- **THEN** the first agent with failures SHALL be auto-selected (or first by execution count if all healthy)
- **AND** for that agent, the first failed execution SHALL be auto-selected

### Requirement: No blank workspace
The workspace area SHALL never be blank. It SHALL always show either the AgentProfile (when no execution selected) or the ExecutionDetail (when execution selected).

#### Scenario: No agent selected
- **WHEN** no agent is selected and agents exist
- **THEN** the workspace SHALL show a prompt "Select an agent" with a summary of available agents

### Requirement: Dead component cleanup
The `src/client/components/` directory SHALL contain only actively-used components. All orphaned files from previous iterations SHALL be deleted.

#### Scenario: No dead files
- **WHEN** the component directory is listed
- **THEN** every `.tsx` file SHALL be imported (directly or transitively) from `App.tsx`
