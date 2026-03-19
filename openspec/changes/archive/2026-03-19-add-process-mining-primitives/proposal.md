## Why

AgentFlow today analyzes one execution graph at a time — single-run stats, single-run failures, single-run critical paths. But the core thesis of AgentFlow is **process mining for AI agents**: discovering patterns across many runs, detecting variants, finding bottlenecks, and checking conformance. Without cross-run analysis, AgentFlow is a tracer, not a process mining tool. This is the foundational layer that everything else builds on — the event emission interface, the knowledge engine, adaptive guards, and the Soma integration all depend on process mining output.

## What Changes

- **New module `process-mining.ts`** in `packages/core/src/` with five pure functions that operate on `ExecutionGraph[]`:
  - `getPathSignature(graph)` — canonical string representation of an execution path for grouping
  - `discoverProcess(graphs)` — extracts a process model (directed graph of transitions with frequencies) from N traces
  - `findVariants(graphs)` — groups runs by path signature, returns variant clusters with frequencies
  - `getBottlenecks(graphs)` — aggregates duration statistics (median, p95, p99) per node name/type across runs
  - `checkConformance(graph, model)` — compares a single run against a discovered process model, reports deviations
- **New types** in `packages/core/src/types.ts`: `ProcessModel`, `ProcessTransition`, `Variant`, `Bottleneck`, `ConformanceReport`, `Deviation`
- **New export** from `packages/core/src/index.ts` for all process mining functions
- **New test file** `tests/core/process-mining.test.ts` with comprehensive coverage

## Capabilities

### New Capabilities
- `process-mining`: Cross-run analysis primitives — process model discovery, variant analysis, bottleneck detection, and conformance checking over `ExecutionGraph[]` collections

### Modified Capabilities
_(none — this is purely additive, no existing behavior changes)_

## Impact

- **Code**: New module in `packages/core/src/`, new types in `types.ts`, new barrel export in `index.ts`
- **APIs**: New public functions exported from `agentflow-core`. No changes to existing APIs.
- **Dependencies**: Zero — all pure functions, stays within the zero-dependency constraint of `packages/core`
- **Breaking changes**: None. Purely additive.
