## MODIFIED Requirements

### Requirement: Process map font contrast
All SVG `<text>` elements in ProcessMapView and BottleneckView SHALL use a light color (`#e6edf3`) that is readable against the dark node backgrounds.

#### Scenario: Node text visibility
- **WHEN** the process map renders nodes
- **THEN** node name text SHALL be clearly readable against the node background (minimum WCAG AA contrast ratio)

### Requirement: Watcher reads saved config on startup
The server SHALL read `~/.agentflow/dashboard-config.json` on startup and merge `extraDirs` into the watcher's directory list before scanning begins.

#### Scenario: Restart after adding directory
- **WHEN** the user adds a directory via settings, then restarts the server
- **THEN** the added directory SHALL be watched immediately on startup

### Requirement: Process map zoom and pan
The process map SVG SHALL support zoom (scroll wheel or +/- buttons) and pan (click and drag). A reset button SHALL restore the default view.

#### Scenario: Zoom in
- **WHEN** the user scrolls up on the process map
- **THEN** the view SHALL zoom in centered on the cursor position

#### Scenario: Pan
- **WHEN** the user clicks and drags on the process map
- **THEN** the view SHALL pan in the drag direction

### Requirement: Sidebar updates on agent switch
The ExecSidebar SHALL display executions for the currently selected agent. When the selected agent changes, the sidebar SHALL immediately show the new agent's executions.

#### Scenario: Switch agent
- **WHEN** the user clicks a different agent card
- **THEN** the sidebar SHALL show that agent's executions, not the previous agent's
