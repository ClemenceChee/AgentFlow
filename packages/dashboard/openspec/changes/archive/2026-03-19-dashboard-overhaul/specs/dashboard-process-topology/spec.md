## ADDED Requirements

### Requirement: Process Map visualization
The Process Map tab SHALL render an interactive topology visualization using React Flow (`@xyflow/react`) showing discovered services as nodes and their relationships as edges.

#### Scenario: Multiple services
- **WHEN** 5 services are discovered (alfred, openclaw-gateway, clawmetry-dashboard, vault-sync, brain-sync)
- **THEN** the Process Map SHALL render 5 nodes with service names, colored by status (green=active, grey=inactive, red=failed)

#### Scenario: Empty state
- **WHEN** no services are discovered
- **THEN** the Process Map SHALL display a message "No services discovered"

### Requirement: Node status coloring
Each service node SHALL be colored based on its current state: green fill for active/running, grey fill for inactive/dead, red fill for failed, amber fill for crash-looping. Each node SHALL also display a status icon alongside the color.

#### Scenario: Mixed statuses
- **WHEN** services have different states (active, inactive, failed)
- **THEN** each node SHALL reflect its individual state color and icon

### Requirement: Node detail on interaction
Clicking a service node SHALL display a detail panel showing: service name, systemd state, PID, CPU, memory, uptime, and any problems.

#### Scenario: Click active service node
- **WHEN** the user clicks the "alfred" node which is active
- **THEN** a detail panel SHALL show alfred.service — active (running), PID, CPU, memory, uptime

### Requirement: Worker sub-nodes
If a service has workers, worker nodes SHALL be displayed as smaller connected sub-nodes beneath the parent service node.

#### Scenario: Service with workers
- **WHEN** alfred has 4 workers (curator, janitor, distiller, surveyor)
- **THEN** 4 smaller nodes SHALL be connected to the alfred node, each labeled with the worker name and colored by alive/stale status

### Requirement: Interactive controls
The Process Map SHALL support panning, zooming, and a minimap for orientation.

#### Scenario: Zoom and pan
- **WHEN** the user scrolls or drags on the Process Map
- **THEN** the view SHALL zoom and pan accordingly
