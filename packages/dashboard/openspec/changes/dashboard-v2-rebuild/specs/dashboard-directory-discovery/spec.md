## ADDED Requirements

### Requirement: Auto-discover agent directories
The server SHALL auto-discover agent data directories by scanning: (1) systemd user service ExecStart paths to derive working directories, (2) common locations (`~/.alfred/`, `~/.openclaw/`, `~/.agentflow/`), and (3) any path containing `traces/` or session JSON/JSONL files.

#### Scenario: Discover from systemd
- **WHEN** `alfred.service` has ExecStart `/home/trader/alfred-env/bin/alfred --config /home/trader/.alfred/config.yaml`
- **THEN** `/home/trader/.alfred/` SHALL be discovered as a data directory

#### Scenario: Discover OpenClaw
- **WHEN** `~/.openclaw/workspace/traces/` exists and contains JSON files
- **THEN** it SHALL be discovered and suggested for watching

### Requirement: Directory discovery API
The server SHALL provide `GET /api/directories` returning `{ watched: string[], discovered: string[], suggested: string[] }` where watched = currently monitored, discovered = found via auto-discovery, suggested = discovered but not yet watched.

#### Scenario: API response
- **WHEN** the dashboard watches `~/.alfred/traces` and discovers `~/.openclaw/workspace/traces`
- **THEN** the response SHALL include `~/.alfred/traces` in watched and `~/.openclaw/workspace/traces` in suggested

### Requirement: Add/remove watched directories
The server SHALL provide `POST /api/directories` to add or remove watched directories. Changes SHALL be persisted to `~/.agentflow/dashboard-config.json` and SHALL take effect immediately (watcher restarts).

#### Scenario: Add directory
- **WHEN** the user adds `~/.openclaw/workspace/traces` via the API
- **THEN** the watcher SHALL start monitoring that directory
- **AND** traces from OpenClaw agents SHALL appear in the dashboard

### Requirement: Settings UI
The dashboard SHALL include a settings panel (accessible via a gear icon in the health banner) showing all discovered, watched, and suggested directories with toggle switches to enable/disable watching.

#### Scenario: Settings panel
- **WHEN** the user clicks the gear icon
- **THEN** a panel SHALL appear showing directories grouped as "Watching", "Suggested", with toggle switches

#### Scenario: Suggested directory
- **WHEN** a directory is discovered but not watched
- **THEN** it SHALL appear in the "Suggested" section with an "Add" button
