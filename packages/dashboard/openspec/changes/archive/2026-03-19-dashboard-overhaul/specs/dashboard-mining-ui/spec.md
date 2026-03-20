## MODIFIED Requirements

### Requirement: Summary bar metrics
The bottom summary bar SHALL display: total agents, total executions, success rate, active count, current failure count, orphan process count, and average agent uptime.

#### Scenario: Full summary
- **WHEN** the dashboard has 5 agents, 120 executions, 95% success rate, 3 active, 2 failures, 1 orphan, and average uptime of "4h 12m"
- **THEN** the summary bar SHALL display all 7 metrics

#### Scenario: No failures or orphans
- **WHEN** there are no failures and no orphans
- **THEN** the failure count SHALL show "0" in green and orphan count SHALL show "0" in green
