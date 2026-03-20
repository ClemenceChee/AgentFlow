## ADDED Requirements

### Requirement: Categorized step sequence
The Agent Flow view SHALL display each execution node as a categorized step in a vertical sequence, showing what the agent did in order. Each step SHALL be categorized as: Tool Call, LLM Call, Web/Search, Embedding, Write, Read/Scan, Agent, or Other — based on node type and name patterns.

#### Scenario: Mixed execution
- **WHEN** an execution has nodes: daemon:processing, pipeline:llm_call, embedder:diff, writer:tags, watcher:scan
- **THEN** the Agent Flow SHALL show them categorized as: Agent, LLM Call, Embedding, Write, Read/Scan — each with a distinct icon and color

#### Scenario: Step details
- **WHEN** a step is rendered
- **THEN** it SHALL show: category icon, category label, node name, duration, and timestamp

#### Scenario: Failed steps
- **WHEN** a step has status "failed"
- **THEN** it SHALL be highlighted with red styling and show the error message below

### Requirement: Depth indentation
Steps SHALL be indented based on their parent-child depth in the execution tree, visually showing which calls are nested inside others.

#### Scenario: Nested tool call
- **WHEN** a tool call node is a child of an agent node
- **THEN** the tool call step SHALL be indented one level from the agent step

### Requirement: Connecting lines
Adjacent steps SHALL be connected by vertical connector lines, showing the flow from one step to the next.

#### Scenario: Sequential steps
- **WHEN** two steps are rendered in sequence
- **THEN** a thin vertical line SHALL connect them
