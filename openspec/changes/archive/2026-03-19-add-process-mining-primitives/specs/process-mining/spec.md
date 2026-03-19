## ADDED Requirements

### Requirement: Path signature extraction
The system SHALL provide a `getPathSignature(graph: ExecutionGraph): string` function that produces a canonical string representation of the execution path by performing a depth-first traversal of the graph's nodes and concatenating `type:name` pairs with `→` separators. Child nodes SHALL be sorted alphabetically by their `type:name` to ensure deterministic output. The function SHALL return an empty string for graphs with no resolvable root node.

#### Scenario: Simple linear execution
- **WHEN** `getPathSignature` is called with a graph containing root `agent:main` → child `tool:fetch` → child `tool:analyze`
- **THEN** it returns `"agent:main→tool:fetch→tool:analyze"`

#### Scenario: Branching execution
- **WHEN** `getPathSignature` is called with a graph where `agent:main` has two children: `tool:fetch` and `tool:validate`
- **THEN** it returns a deterministic signature with children sorted alphabetically: `"agent:main→tool:fetch→tool:validate"`

#### Scenario: Empty or invalid graph
- **WHEN** `getPathSignature` is called with a graph whose `rootNodeId` does not resolve to a node in the nodes map
- **THEN** it returns `""`

#### Scenario: Single-node graph
- **WHEN** `getPathSignature` is called with a graph containing only a root node `agent:main` with no children
- **THEN** it returns `"agent:main"`

---

### Requirement: Process model discovery
The system SHALL provide a `discoverProcess(graphs: ExecutionGraph[]): ProcessModel` function that analyzes multiple execution graphs and produces a process model representing the typical execution flow. The model SHALL contain a set of observed steps (identified by `type:name`) and transitions between them, where each transition carries a `count` (absolute frequency) and `probability` (relative frequency from the source step). The model SHALL also include `totalGraphs` (number of input graphs) and `agentId` (from the first graph). The function SHALL throw an error when called with an empty array.

#### Scenario: Discover model from identical runs
- **WHEN** `discoverProcess` is called with 10 graphs that all follow the path `agent:main→tool:fetch→tool:analyze`
- **THEN** the returned `ProcessModel` contains transitions `agent:main→tool:fetch` (count: 10, probability: 1.0) and `tool:fetch→tool:analyze` (count: 10, probability: 1.0)

#### Scenario: Discover model from divergent runs
- **WHEN** `discoverProcess` is called with 10 graphs where 8 follow `agent:main→tool:fetch→tool:analyze` and 2 follow `agent:main→tool:fetch→tool:retry→tool:analyze`
- **THEN** the returned `ProcessModel` contains transition `tool:fetch→tool:analyze` (count: 8, probability: 0.8) and `tool:fetch→tool:retry` (count: 2, probability: 0.2)

#### Scenario: Single graph input
- **WHEN** `discoverProcess` is called with a single graph
- **THEN** it returns a valid `ProcessModel` with all transitions having count 1 and probability 1.0

#### Scenario: Empty input
- **WHEN** `discoverProcess` is called with an empty array
- **THEN** it throws an error

---

### Requirement: Variant analysis
The system SHALL provide a `findVariants(graphs: ExecutionGraph[]): Variant[]` function that groups execution graphs by their path signature and returns an array of variant objects sorted by frequency (most common first). Each variant SHALL include: the `pathSignature`, `count`, `percentage` (relative to total graphs), an array of `graphIds` belonging to that variant, and an `exampleGraph` (the first graph in the group). The function SHALL return an empty array when called with an empty array.

#### Scenario: All runs follow the same path
- **WHEN** `findVariants` is called with 10 graphs that all have the same path signature
- **THEN** it returns a single variant with count 10 and percentage 100

#### Scenario: Multiple variants
- **WHEN** `findVariants` is called with 10 graphs where 8 share path signature A and 2 share path signature B
- **THEN** it returns two variants: first with count 8, percentage 80; second with count 2, percentage 20

#### Scenario: Empty input
- **WHEN** `findVariants` is called with an empty array
- **THEN** it returns an empty array

#### Scenario: Each run is unique
- **WHEN** `findVariants` is called with 5 graphs that all have different path signatures
- **THEN** it returns 5 variants, each with count 1, percentage 20, sorted alphabetically by path signature as tiebreaker

---

### Requirement: Bottleneck detection
The system SHALL provide a `getBottlenecks(graphs: ExecutionGraph[]): Bottleneck[]` function that aggregates duration statistics per node name across all input graphs. Each bottleneck SHALL include: `nodeName`, `nodeType`, `occurrences` (how many graphs contain this node), `durations` object with `median`, `p95`, `p99`, `min`, and `max` in milliseconds, and `percentOfGraphs` (what fraction of input graphs include this node). Results SHALL be sorted by `p95` duration descending (slowest first). Nodes that are still running (endTime is null) SHALL use the current time as a provisional end. The function SHALL return an empty array when called with an empty array.

#### Scenario: Identify slowest node across runs
- **WHEN** `getBottlenecks` is called with 100 graphs where node `tool:fetch-data` has a median duration of 5s and p95 of 12s, while node `tool:analyze` has a median of 1s and p95 of 2s
- **THEN** the first element in the returned array is the bottleneck for `tool:fetch-data`

#### Scenario: Node present in subset of runs
- **WHEN** `getBottlenecks` is called with 10 graphs where only 3 contain node `tool:retry`
- **THEN** the bottleneck for `tool:retry` has occurrences 3 and percentOfGraphs 30

#### Scenario: Empty input
- **WHEN** `getBottlenecks` is called with an empty array
- **THEN** it returns an empty array

#### Scenario: Running nodes use provisional end time
- **WHEN** `getBottlenecks` is called with graphs containing nodes where `endTime` is null
- **THEN** those nodes' durations are calculated using the current time as the end

---

### Requirement: Conformance checking
The system SHALL provide a `checkConformance(graph: ExecutionGraph, model: ProcessModel): ConformanceReport` function that compares a single execution graph against a discovered process model. The report SHALL include: a `conformanceScore` between 0.0 and 1.0 (ratio of conforming transitions to total transitions), an array of `deviations` describing each difference, and a `isConforming` boolean (true when score equals 1.0). Deviations SHALL be categorized as `unexpected-transition` (transition exists in the graph but not in the model), `missing-transition` (transition exists in the model with probability > 0.5 but not in the graph), or `low-frequency-path` (transition exists in both but model probability < 0.1). The function SHALL return a score of 1.0 with no deviations for a graph that perfectly matches the model.

#### Scenario: Perfectly conforming run
- **WHEN** `checkConformance` is called with a graph whose transitions all exist in the model with probability > 0.1
- **THEN** it returns conformanceScore 1.0, isConforming true, and empty deviations array

#### Scenario: Run with unexpected transition
- **WHEN** `checkConformance` is called with a graph containing transition `tool:fetch→tool:emergency-fallback` that does not exist in the model
- **THEN** the deviations array includes an entry with type `unexpected-transition` and the specific from/to step identifiers

#### Scenario: Run missing a common transition
- **WHEN** `checkConformance` is called with a graph that is missing transition `tool:fetch→tool:analyze` which has probability 0.9 in the model
- **THEN** the deviations array includes an entry with type `missing-transition`

#### Scenario: Run following a rare path
- **WHEN** `checkConformance` is called with a graph containing transition `tool:fetch→tool:retry` which has probability 0.05 in the model
- **THEN** the deviations array includes an entry with type `low-frequency-path`

#### Scenario: Conformance score calculation
- **WHEN** a graph has 10 transitions, 8 of which conform to the model and 2 are deviations
- **THEN** the conformanceScore is 0.8
