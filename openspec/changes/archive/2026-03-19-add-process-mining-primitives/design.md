## Context

AgentFlow's `graph-query.ts` provides 11 pure functions that operate on a single `ExecutionGraph`. These are well-tested and follow a clean pattern: take a frozen graph, return derived data, no mutation. The process mining module extends this pattern to operate across multiple graphs — `ExecutionGraph[]` — enabling cross-run analysis.

The existing type system (`types.ts`) defines `ExecutionGraph`, `ExecutionNode`, `ExecutionEdge`, and query result types like `GraphStats`. Process mining adds new result types that follow the same readonly convention.

The codebase already has `graph-stitch.ts` for distributed tracing (grouping graphs by traceId, stitching spans). Process mining is complementary — where graph-stitch links graphs within a single distributed execution, process mining compares independent executions of the same agent.

## Goals / Non-Goals

**Goals:**
- Provide pure-function primitives for cross-run analysis of execution graphs
- Enable discovery of the "typical" execution flow from N traces (process model)
- Enable grouping runs by their structural path (variant analysis)
- Enable identification of performance bottlenecks across runs (bottleneck detection)
- Enable comparison of a single run against the discovered norm (conformance checking)
- Maintain zero-dependency constraint of `packages/core`
- Follow existing code patterns: pure functions, JSDoc, readonly return types, closure-free

**Non-Goals:**
- Persistence of process models (that's trace-store or knowledge engine territory)
- Visualization of process mining results (that's dashboard territory)
- LLM-powered semantic analysis (that's Soma/knowledge engine territory)
- Real-time streaming analysis (these are batch functions over completed graphs)
- Time-series trending (the storage package with SQLite handles that)

## Decisions

### 1. Path signature as the grouping key

**Decision:** Use a canonical string representation of the execution path (node types + names in DFS order) as the primary grouping key for variant analysis.

**Rationale:** Process mining needs to compare "what happened" across runs. The path signature captures the structural shape — `"agent:main→tool:fetch-data→tool:analyze"` — which is stable across runs that follow the same flow. Using node IDs would be useless (counter-based, unique per run). Using only node types loses too much information (all tools look identical). Type + name strikes the right balance.

**Alternative considered:** Hash-based signatures. Rejected because human-readable signatures are more useful for debugging, logging, and display in the dashboard. Hashing can be layered on top if needed for storage keys.

### 2. Process model as a transition frequency graph

**Decision:** The `ProcessModel` is a directed graph of transitions where each edge carries a frequency count and probability. Nodes are identified by `type:name` pairs.

**Rationale:** This follows the directly-follows graph (DFG) approach from classical process mining (van der Aalst). It's the simplest useful model: "after node A, node B happens 80% of the time and node C happens 20% of the time." More complex models (Petri nets, BPMN) can be derived later but the DFG is the right starting point.

**Alternative considered:** Tree-based models (preserving the full parent-child hierarchy). Rejected for the initial implementation because trees don't naturally represent convergence (two different paths leading to the same step). The DFG handles both divergence and convergence.

### 3. Duration statistics using sorted-array percentiles

**Decision:** Bottleneck detection computes median, p95, and p99 using sorted-array index calculation rather than a streaming algorithm.

**Rationale:** Process mining functions operate on completed graph arrays that fit in memory (Phase 1 targets hundreds to low thousands of runs). Sorting is O(n log n) which is fine at this scale. A streaming/approximate algorithm (t-digest, HDR histogram) would add complexity without benefit.

**Alternative considered:** Streaming percentile algorithms. Deferred to when scale requires it (SQLite-based aggregation in the storage package is the scaling path).

### 4. Conformance checking via path alignment

**Decision:** Conformance checking compares a single run's path signature against the process model's transitions, reporting deviations as a list of specific differences (missing transitions, unexpected transitions, frequency anomalies).

**Rationale:** Full token-based alignment (like sequence alignment in bioinformatics) is overkill for tree-structured traces. Since execution graphs have a root and follow parent-child relationships, we can walk the graph and compare each transition against the model. The conformance score is the ratio of conforming transitions to total transitions.

**Alternative considered:** Edit-distance based conformance (Levenshtein over path signatures). Simpler but loses information about where specifically the deviation occurred. The transition-by-transition approach gives actionable deviation reports.

### 5. Module structure: single file, follows graph-query.ts pattern

**Decision:** All five functions live in a single `process-mining.ts` file, exported through `index.ts`. Types are added to `types.ts`.

**Rationale:** This matches the existing pattern (`graph-query.ts` has 11 functions in one file at 269 lines). The process mining functions are cohesive and interdependent (`findVariants` uses `getPathSignature`, `checkConformance` uses the `ProcessModel` from `discoverProcess`). Splitting into multiple files would add import complexity without improving readability. Expected size: ~300-400 lines.

## Risks / Trade-offs

**[Performance at scale]** → Pure-function-over-arrays works for hundreds of graphs. For thousands+, the storage package should provide pre-aggregated data. Process mining functions should document their expected input size range.

**[Path signature stability]** → If agents use dynamic/generated node names (e.g., timestamps in names), path signatures will be unique per run, making variant analysis useless. → Mitigation: Document that node names should be stable identifiers. Consider adding a `nameNormalizer` option in a future iteration.

**[Empty/degenerate inputs]** → Functions must handle: empty arrays, single-element arrays, graphs with no root node, graphs with only a root node. → Mitigation: Each function specifies return values for edge cases in its JSDoc and test coverage.

**[Process model doesn't capture concurrency]** → The DFG model treats concurrent branches as sequential transitions. Two tools running in parallel will appear as two separate transitions from the parent. → This is acceptable for the initial implementation. Concurrency-aware models (partial orders) are a future enhancement.
