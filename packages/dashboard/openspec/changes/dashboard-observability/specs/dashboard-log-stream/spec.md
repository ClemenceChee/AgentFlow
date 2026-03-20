## ADDED Requirements

### Requirement: Real-time log viewer
The dashboard SHALL provide a Logs tab with a real-time streaming log viewer that displays log lines from agent services as they arrive via WebSocket.

#### Scenario: Log line arrives
- **WHEN** a new log line is emitted by the alfred service
- **THEN** it SHALL appear at the bottom of the log viewer with timestamp, source, severity, and message

### Requirement: Color-coded severity
Log lines SHALL be color-coded by severity: grey for debug, white for info, amber for warning, red for error. Each line SHALL also display a severity text label.

#### Scenario: Error log
- **WHEN** a log line has severity "error"
- **THEN** it SHALL be displayed with red text and an "ERROR" label prefix

### Requirement: Agent and severity filtering
The log viewer SHALL provide filter controls to filter by agent name (multi-select) and minimum severity level.

#### Scenario: Filter by agent
- **WHEN** the user selects "alfred" and "curator" in the agent filter
- **THEN** only log lines from those two agents SHALL be displayed

#### Scenario: Filter by severity
- **WHEN** the user sets minimum severity to "warning"
- **THEN** only warning and error log lines SHALL be displayed

### Requirement: Auto-scroll with pause
The log viewer SHALL auto-scroll to show new log lines. Hovering the log area SHALL pause auto-scroll. Clicking a "resume" button or scrolling to bottom SHALL re-enable auto-scroll.

#### Scenario: Pause on hover
- **WHEN** the user hovers over the log viewer while logs are streaming
- **THEN** auto-scroll SHALL pause and a "paused" indicator SHALL appear

#### Scenario: Resume scrolling
- **WHEN** the user clicks "Resume" or scrolls to the bottom
- **THEN** auto-scroll SHALL resume

### Requirement: Log discovery
The server SHALL discover log file paths from systemd unit configuration (`LogPath`, `StandardOutput`) or standard locations, and stream new lines via WebSocket.

#### Scenario: Log streaming
- **WHEN** the server discovers `/home/trader/.alfred/logs/alfred.log`
- **THEN** new lines written to that file SHALL be sent via the WebSocket `logs` channel with source, severity, and timestamp
