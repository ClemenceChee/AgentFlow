## ADDED Requirements

### Requirement: OpenClaw directory detection
The OpenClaw adapter SHALL detect directories containing `cron/jobs.json` or whose path includes `.openclaw`.

#### Scenario: Detect OpenClaw workspace
- **WHEN** `detect('/home/trader/.openclaw')` is called
- **THEN** it SHALL return true

### Requirement: OpenClaw cron run parsing
The adapter SHALL parse JSONL files in `cron/runs/` where each line has `{ts, jobId, action, status, model, usage, durationMs, sessionId}`. Each "finished" entry SHALL produce one NormalizedTrace.

#### Scenario: Successful cron run
- **WHEN** a JSONL entry has `action: "finished"`, `status: "ok"`, `jobId: "personal-email-processor"`, `model: "kimi-k2.5"`, `durationMs: 121090`
- **THEN** a NormalizedTrace SHALL be produced with `agentId: "openclaw:personal-email-processor"`, `status: "completed"`, duration 121090ms, and metadata including model and token usage

#### Scenario: Failed cron run
- **WHEN** a JSONL entry has `status: "error"`
- **THEN** a NormalizedTrace SHALL be produced with `status: "failed"` and the error in metadata

### Requirement: Job name enrichment
The adapter SHALL read `cron/jobs.json` to enrich traces with human-readable job names (e.g., "Personal Email Processor" instead of "personal-email-processor").

#### Scenario: Job name lookup
- **WHEN** a cron run for `jobId: "personal-email-processor"` is parsed and `jobs.json` contains `name: "Personal Email Processor"`
- **THEN** the NormalizedTrace name SHALL be "Personal Email Processor"

### Requirement: Token and cost metadata
The adapter SHALL extract `model`, `provider`, and `usage` (input_tokens, output_tokens, total_tokens) from cron run entries and include them in trace metadata.

#### Scenario: LLM usage data
- **WHEN** a cron run has `model: "kimi-k2.5"`, `usage: {input_tokens: 44472, output_tokens: 1930}`
- **THEN** the trace metadata SHALL include model, provider, and token counts
