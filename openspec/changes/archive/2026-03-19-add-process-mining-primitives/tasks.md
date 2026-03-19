## 1. Types

- [x] 1.1 Add `ProcessTransition` interface to `types.ts` (from, to, count, probability)
- [x] 1.2 Add `ProcessModel` interface to `types.ts` (steps, transitions, totalGraphs, agentId)
- [x] 1.3 Add `Variant` interface to `types.ts` (pathSignature, count, percentage, graphIds, exampleGraph)
- [x] 1.4 Add `Bottleneck` interface to `types.ts` (nodeName, nodeType, occurrences, durations with median/p95/p99/min/max, percentOfGraphs)
- [x] 1.5 Add `Deviation` interface to `types.ts` (type: unexpected-transition | missing-transition | low-frequency-path, from, to, message, modelProbability?)
- [x] 1.6 Add `ConformanceReport` interface to `types.ts` (conformanceScore, isConforming, deviations)

## 2. Core Implementation

- [x] 2.1 Create `packages/core/src/process-mining.ts` with module JSDoc header
- [x] 2.2 Implement `getPathSignature(graph)` — DFS traversal, type:name pairs, alphabetical child sort, → separator
- [x] 2.3 Implement `discoverProcess(graphs)` — walk all graphs, count transitions between type:name steps, compute probabilities
- [x] 2.4 Implement `findVariants(graphs)` — group by path signature, sort by frequency descending, compute percentages
- [x] 2.5 Implement `getBottlenecks(graphs)` — collect durations per node name, compute percentile stats via sorted arrays, sort by p95 descending
- [x] 2.6 Implement `checkConformance(graph, model)` — extract graph transitions, compare against model, classify deviations, compute score

## 3. Exports

- [x] 3.1 Add all process mining functions to `packages/core/src/index.ts` barrel export
- [x] 3.2 Add all new types to the type exports in `index.ts`

## 4. Tests

- [x] 4.1 Create `tests/core/process-mining.test.ts` with test scaffolding and helper to build test graphs
- [x] 4.2 Test `getPathSignature` — linear path, branching path, empty/invalid graph, single-node graph
- [x] 4.3 Test `discoverProcess` — identical runs, divergent runs, single graph, empty array (throws)
- [x] 4.4 Test `findVariants` — single variant, multiple variants, empty input, all-unique runs
- [x] 4.5 Test `getBottlenecks` — slowest node ordering, partial presence, empty input, running nodes
- [x] 4.6 Test `checkConformance` — perfect conformance, unexpected transitions, missing transitions, low-frequency paths, score calculation
- [x] 4.7 Integration test: build graphs → discover model → find variants → check conformance of a new graph against the model
