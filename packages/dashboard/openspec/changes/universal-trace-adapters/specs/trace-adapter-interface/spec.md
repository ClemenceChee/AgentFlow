## ADDED Requirements

### Requirement: TraceAdapter interface
The system SHALL define a `TraceAdapter` interface with methods: `name` (string), `detect(dirPath: string): boolean`, `canHandle(filePath: string): boolean`, and `parse(filePath: string): NormalizedTrace[]`.

#### Scenario: Adapter detection
- **WHEN** the watcher discovers a directory
- **THEN** it SHALL call `detect()` on each registered adapter to determine which adapters apply to that directory

#### Scenario: File routing
- **WHEN** the watcher encounters a new file
- **THEN** it SHALL call `canHandle()` on adapters in priority order and use the first match

### Requirement: NormalizedTrace type
All adapters SHALL produce `NormalizedTrace` objects with fields: `id`, `agentId`, `name`, `status`, `startTime`, `endTime`, `trigger`, `source` (adapter name), `nodes` (Record of NormalizedNode), `metadata`, and optional `sessionEvents`.

#### Scenario: Consistent output
- **WHEN** any adapter parses a file
- **THEN** the output SHALL conform to NormalizedTrace regardless of the input format

### Requirement: Adapter registry with priority order
The system SHALL maintain an ordered adapter registry. More specific adapters (OpenClaw, OTel) SHALL be checked before the fallback AgentFlow adapter.

#### Scenario: OpenClaw JSONL file
- **WHEN** a `.jsonl` file in a directory containing `cron/jobs.json` is encountered
- **THEN** the OpenClaw adapter SHALL handle it, not the AgentFlow adapter

### Requirement: AgentFlow adapter wraps existing logic
The existing parsing logic (JSON traces, JSONL sessions, log files) SHALL be wrapped in an AgentFlow adapter implementing `TraceAdapter`. No behavior change for existing traces.

#### Scenario: Existing traces unchanged
- **WHEN** the watcher loads traces from `~/.alfred/traces/`
- **THEN** the same traces SHALL appear with identical data as before the refactor
