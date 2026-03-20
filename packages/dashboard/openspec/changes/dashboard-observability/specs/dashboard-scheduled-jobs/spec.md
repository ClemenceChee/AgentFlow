## ADDED Requirements

### Requirement: Scheduled jobs panel
The dashboard SHALL display a scheduled jobs panel showing recurring cron/timer jobs with: job name, schedule expression, last run status, next scheduled run, and last duration.

#### Scenario: Healthy timer
- **WHEN** `alfred-scheduled.timer` runs every 30m, last succeeded at 14:00, next at 14:30, took 12s
- **THEN** the job row SHALL show: "alfred-scheduled", "every 30m", green "success", "14:30", "12s"

#### Scenario: Failed timer
- **WHEN** `vault-sync.timer` last failed
- **THEN** the job row SHALL show a red "failed" status with the failure reason

### Requirement: Job color coding
Job rows SHALL be color-coded: green for last-success, red for last-failed, amber for overdue (next run is in the past), grey for disabled.

#### Scenario: Overdue job
- **WHEN** a timer's next run timestamp is in the past
- **THEN** the row SHALL be amber with an "overdue" label

### Requirement: Duration history sparkline
Each job SHALL display a small sparkline showing the last 10 run durations to reveal trends (getting slower, erratic, stable).

#### Scenario: Stable durations
- **WHEN** the last 10 runs of a job took between 10-12 seconds
- **THEN** the sparkline SHALL show a flat line

### Requirement: Timer discovery
The server SHALL extend `discoverAllProcessConfigs` or provide a separate `/api/jobs` endpoint that discovers systemd timer units and returns their state.

#### Scenario: Timer API
- **WHEN** `/api/jobs` is called and 3 systemd timers exist
- **THEN** the response SHALL contain 3 entries with `name`, `schedule`, `lastRun`, `lastResult`, `nextRun`, `lastDuration`, `recentDurations[]`
