## ADDED Requirements

### Requirement: PID values MUST be validated as integers before use
The system SHALL validate that any `pid` value extracted from agent-produced JSON is a finite integer before using it for process liveness checks. The system MUST NOT pass PID values to shell commands. Process existence checks SHALL use Node.js `process.kill(pid, 0)`.

#### Scenario: Valid numeric PID
- **WHEN** a JSON file contains a worker with `"pid": 1234` and `"status": "running"`
- **THEN** the system checks process existence using `process.kill(1234, 0)` without spawning a shell

#### Scenario: String PID with injection payload
- **WHEN** a JSON file contains a worker with `"pid": "1; rm -rf /"` and `"status": "running"`
- **THEN** the system converts the value via `Number()`, gets `NaN`, and treats the worker as having no valid PID

#### Scenario: Non-numeric PID types
- **WHEN** a JSON file contains a worker with `"pid": null`, `"pid": {}`, or `"pid": []`
- **THEN** the system skips the PID liveness check without error

### Requirement: HTML output MUST escape agent-controlled fields
The dashboard SHALL HTML-escape all values from trace JSON before inserting them into the DOM. At minimum, the characters `&`, `<`, `>`, `"`, and `'` MUST be replaced with their HTML entity equivalents.

#### Scenario: Agent ID containing HTML tags
- **WHEN** a trace has `agentId` set to `<script>alert(1)</script>`
- **THEN** the dashboard renders the literal text `<script>alert(1)</script>` without executing it

#### Scenario: Trigger containing event handler injection
- **WHEN** a trace has `trigger` set to `<img src=x onerror=alert(1)>`
- **THEN** the dashboard renders the literal text without creating an img element

#### Scenario: Normal agent ID with special characters
- **WHEN** a trace has `agentId` set to `my-agent & friends`
- **THEN** the dashboard renders `my-agent & friends` correctly with the ampersand visible

### Requirement: Recursive span traversal MUST detect cycles
The `getDistDepth` function SHALL track visited span IDs during recursion. If a span ID is encountered that has already been visited in the current traversal, the function MUST stop recursing and return the current depth.

#### Scenario: Linear span chain
- **WHEN** spans form a chain A → B → C with no cycles
- **THEN** `getDistDepth` returns the correct depth of 3

#### Scenario: Circular span references
- **WHEN** spans form a cycle A → B → C → A
- **THEN** `getDistDepth` returns a finite depth without throwing `RangeError`

### Requirement: SQL ORDER BY clauses MUST use allowlisted values
The query builder SHALL validate `orderBy` values against the allowlist `['timestamp', 'executionTime', 'agentId']` and `orderDirection` against `['ASC', 'DESC']`. Invalid values MUST be replaced with defaults (`timestamp` and `DESC`).

#### Scenario: Valid order parameters
- **WHEN** a query specifies `orderBy: 'executionTime'` and `orderDirection: 'ASC'`
- **THEN** the generated SQL contains `ORDER BY executionTime ASC`

#### Scenario: Injection attempt in orderBy
- **WHEN** a query specifies `orderBy: 'timestamp; DROP TABLE executions; --'`
- **THEN** the system falls back to `ORDER BY timestamp DESC`

#### Scenario: Invalid orderDirection
- **WHEN** a query specifies `orderDirection: 'DESC; --'`
- **THEN** the system falls back to `ORDER BY timestamp DESC`

### Requirement: File paths MUST remain within the base directory
When constructing file paths for trace output, the system SHALL resolve the final path to an absolute path and verify it starts with the resolved base directory. If the path escapes the base directory, the system MUST throw an error.

#### Scenario: Normal agent ID
- **WHEN** `agentId` is `my-agent` and base dir is `/data/traces`
- **THEN** the trace file is written to `/data/traces/my-agent-<timestamp>.json`

#### Scenario: Path traversal in agent ID
- **WHEN** `agentId` is `../../../etc/cron.d/evil` and base dir is `/data/traces`
- **THEN** the system throws an error and does not write the file

#### Scenario: Path traversal in graph ID
- **WHEN** `graph.id` contains `../` sequences
- **THEN** the system throws an error and does not write the file
