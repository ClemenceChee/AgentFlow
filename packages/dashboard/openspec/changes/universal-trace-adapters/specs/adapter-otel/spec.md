## ADDED Requirements

### Requirement: OTel file detection
The OTel adapter SHALL detect directories containing `*.otlp.json` files or an `otel-traces/` subdirectory.

#### Scenario: OTLP export directory
- **WHEN** `detect('/traces/otel-export/')` is called and the directory contains `.otlp.json` files
- **THEN** it SHALL return true

### Requirement: OTLP JSON parsing
The adapter SHALL parse OTLP JSON export files with the standard `{ resourceSpans: [{ scopeSpans: [{ spans: [...] }] }] }` structure. Spans SHALL be grouped by traceId into NormalizedTraces with parent-child relationships from parentSpanId.

#### Scenario: Multi-span trace
- **WHEN** an OTLP file contains 5 spans with the same traceId, where span B has parentSpanId = span A
- **THEN** one NormalizedTrace SHALL be produced with 5 nodes and B as a child of A

### Requirement: GenAI semantic convention mapping
The adapter SHALL map OTel GenAI semantic convention attributes to AgentFlow types:
- `gen_ai.chat` / `gen_ai.completion` spans → node type `llm`
- `gen_ai.embeddings` spans → node type `embedding`
- Spans with `tool.*` attributes → node type `tool`
- `gen_ai.request.model` → metadata.model
- `gen_ai.usage.input_tokens` / `output_tokens` → metadata.usage

#### Scenario: LLM span
- **WHEN** a span has name `gen_ai.chat` and attribute `gen_ai.request.model: "claude-sonnet-4-20250514"`
- **THEN** the node SHALL have type `llm` and metadata.model `claude-sonnet-4-20250514`

### Requirement: HTTP collector endpoint
The server SHALL provide `POST /v1/traces` accepting OTLP JSON payloads. Received spans SHALL be parsed by the OTel adapter and stored in the trace store. A WebSocket notification SHALL be emitted for real-time updates.

#### Scenario: Push trace via HTTP
- **WHEN** an OTel SDK sends `POST /v1/traces` with an OTLP JSON body
- **THEN** the traces SHALL appear in the dashboard within the next poll cycle

#### Scenario: Localhost binding
- **WHEN** the server starts without `--collector-host` flag
- **THEN** the `/v1/traces` endpoint SHALL only accept connections from localhost

### Requirement: Agent ID derivation from OTel
The adapter SHALL derive `agentId` from OTel resource attributes: `service.name` if present, otherwise the root span name. The source SHALL be `"otel"`.

#### Scenario: Service name present
- **WHEN** an OTLP resource has attribute `service.name: "my-langchain-agent"`
- **THEN** the NormalizedTrace agentId SHALL be `"otel:my-langchain-agent"`
